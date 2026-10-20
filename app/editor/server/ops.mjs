// Edit operations applied by the visual editor. Every call to applyOps runs in one transaction
// (one undo step). Operations address elements by their data-sb id and fields by
// { kind, path, sectionId } as reported by the editor preview.
import { deepMerge } from '../../processing/template-runtime/lib/engine.mjs';
import { rootPrefixFor } from '../../processing/template-runtime/build.mjs';
import { BLOCKS, ELEMENTS, blockById } from '../library/blocks.mjs';
import {
  EditError,
  assignIds,
  cleanRichHtml,
  clone,
  collectIds,
  eachContext,
  escapeText,
  fieldTarget,
  getPath,
  innerContext,
  loadHtml,
  mergePatch,
  newId,
  renameKeys,
  setPath,
  topLevelKeys,
  validateTemplate,
  TOKEN,
} from './site-model.mjs';

const PAGE_ID = /^[a-z0-9][a-z0-9-]{0,60}$/;
const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'track', 'wbr', 'area', 'col', 'embed', 'iframe', 'video', 'audio', 'textarea', 'select']);
const CONFIG_ROOTS = new Set(['brand', 'colors', 'fonts', 'typography', 'images', 'integrations']);
const FIELD_KINDS = new Set(['text', 'html', 'url', 'srcset', 'brand']);

export async function applyOps(store, projectId, ops, label = 'Edit') {
  if (!Array.isArray(ops) || !ops.length) throw new EditError('ops must be a non-empty array');
  if (ops.length > 200) throw new EditError('too many operations');
  return store.transaction(projectId, label, (tx) => applyOpsInTx(tx, ops));
}

export function applyOpsInTx(tx, ops) {
  const results = [];
  for (const op of ops) {
    const fn = HANDLERS[op?.op];
    if (!fn) throw new EditError(`unknown operation ${op?.op}`);
    results.push(fn(tx, op) ?? null);
  }
  return results;
}

// ---------------------------------------------------------------------------------------------
// helpers

function updateJson(tx, file, fn, fallback = {}) {
  const obj = tx.readJson(file, fallback);
  const out = fn(obj) ?? obj;
  tx.writeJson(file, out);
  return out;
}

function pageFile(tx, pageId) {
  if (!PAGE_ID.test(String(pageId))) throw new EditError('invalid page id');
  const direct = `pages/${pageId}.json`;
  if (tx.exists(direct) && tx.readJson(direct).id === pageId) return direct;
  for (const f of tx.list('pages')) if (f.endsWith('.json') && tx.readJson(`pages/${f}`).id === pageId) return `pages/${f}`;
  throw new EditError(`unknown page ${pageId}`, 404);
}

function loadPage(tx, pageId) {
  const file = pageFile(tx, pageId);
  const page = tx.readJson(file);
  const content = tx.readJson(`content/pages/${page.id}.json`, { page: {}, sections: {} });
  return { file, page, content };
}

const componentFile = (s) => `components/${s.component}.html`;

/** Find the markup file (section component or page layout) that contains a data-sb id. */
function locate(tx, pc, id) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(id))) throw new EditError('invalid element id');
  const needle = `data-sb="${id}"`;
  for (const s of pc.page.sections) {
    const file = componentFile(s);
    if (!tx.exists(file)) continue;
    const html = tx.read(file);
    if (html.includes(needle)) return { file, html, section: s };
  }
  const html = tx.read(pc.page.layout);
  if (html.includes(needle)) return { file: pc.page.layout, html, section: null };
  throw new EditError('element not found on this page (reload the editor)', 404);
}

const byId = ($, id) => {
  const el = $(`[data-sb="${id}"]`).first();
  if (!el.length) throw new EditError('element not found', 404);
  return el;
};

function projectIds(tx) {
  const ids = new Set();
  const walk = (dir) => {
    for (const f of tx.list(dir)) {
      const rel = `${dir}/${f}`;
      if (f.endsWith('.html')) collectIds(tx.read(rel)).forEach((i) => ids.add(i));
      else if (!f.includes('.')) walk(rel);
    }
  };
  walk('components');
  walk('layouts');
  return ids;
}

/** New ids for every element of a fragment; returns the old -> new id map. */
function refreshIds(html, used) {
  const $ = loadHtml(html);
  const map = {};
  const existing = new Set(used); // ids outside this fragment
  $('[data-sb]').each((_, el) => {
    let id;
    do id = newId();
    while (used.has(id));
    used.add(id);
    map[el.attribs['data-sb']] = id;
    el.attribs['data-sb'] = id;
  });
  // Only elements still without an id get one: checking against `used` would replace the fresh ids again.
  const out = assignIds($.html(), existing);
  existing.forEach((id) => used.add(id));
  return { html: out.html, map };
}

function copyDesign(tx, map) {
  const ids = Object.keys(map);
  if (!ids.length) return;
  updateJson(tx, 'design.json', (d) => {
    d.elements = d.elements || {};
    for (const [from, to] of Object.entries(map)) if (d.elements[from]) d.elements[to] = clone(d.elements[from]);
  });
}

/** JSON objects (file + path) holding field values for markup at a given {{@each}} context. */
function scopeTargets(tx, pc, section, context) {
  if (context.length > 1) throw new EditError('nested repeated lists are not supported here; edit the section HTML instead');
  const base = fieldTarget(pc, { kind: 'text', path: '', sectionId: section.id });
  if (!context.length) return [base];
  const list = fieldTarget(pc, { kind: 'text', path: context[0], sectionId: section.id });
  const arr = getPath(tx.readJson(list.file, {}), list.jsonPath);
  if (!Array.isArray(arr)) return [];
  return arr.map((_, i) => ({ file: list.file, jsonPath: `${list.jsonPath}.${i}` }));
}

function writeScopes(tx, targets, fn) {
  const byFile = new Map();
  for (const t of targets) {
    if (!byFile.has(t.file)) byFile.set(t.file, []);
    byFile.get(t.file).push(t.jsonPath);
  }
  for (const [file, paths] of byFile)
    updateJson(tx, file, (obj) => {
      for (const p of paths) {
        let scope = getPath(obj, p);
        if (!scope || typeof scope !== 'object') {
          setPath(obj, p, {});
          scope = getPath(obj, p);
        }
        fn(scope);
      }
    });
}

const tokenFor = (id) => `{{@section ${id}}}`;

function insertSectionToken(layout, newId_, afterId, { navLike = false } = {}) {
  const token = tokenFor(newId_);
  const mainOpen = /<main\b[^>]*>/i.exec(layout);
  if (afterId) {
    const t = tokenFor(afterId);
    const idx = layout.indexOf(t);
    if (idx >= 0) {
      if (mainOpen && idx < mainOpen.index && !navLike) {
        const at = mainOpen.index + mainOpen[0].length;
        return `${layout.slice(0, at)}\n      ${token}\n${layout.slice(at)}`;
      }
      const at = idx + t.length;
      return `${layout.slice(0, at)}\n\n      ${token}${layout.slice(at)}`;
    }
  }
  if (mainOpen) {
    const at = mainOpen.index + mainOpen[0].length;
    return `${layout.slice(0, at)}\n      ${token}\n${layout.slice(at)}`;
  }
  const first = layout.search(/\{\{@section /);
  if (first >= 0) return `${layout.slice(0, first)}${token}\n    ${layout.slice(first)}`;
  const body = layout.toLowerCase().lastIndexOf('</body>');
  return `${layout.slice(0, body)}${token}\n${layout.slice(body)}`;
}

function removeSectionToken(layout, id) {
  const t = tokenFor(id).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return layout.replace(new RegExp(`[ \\t]*${t}[ \\t]*\\r?\\n?`), '');
}

function layoutOrder(layout) {
  return [...layout.matchAll(/\{\{@section\s+([^}\s]+)\s*\}\}/g)].map((m) => m[1]);
}

function addAllowedOrigins(tx, origins) {
  if (!origins?.length) return;
  updateJson(tx, 'site.config.json', (c) => {
    c.integrations = c.integrations || {};
    const list = new Set(c.integrations.allowedOrigins || []);
    origins.forEach((o) => list.add(o));
    c.integrations.allowedOrigins = [...list];
  });
}

const safeAttr = (v) => String(v).replace(/&(?![a-zA-Z#0-9]+;)/g, '&amp;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------------------------
// handlers

const HANDLERS = {
  setField(tx, { page, field, value }) {
    if (!field || !FIELD_KINDS.has(field.kind)) throw new EditError('invalid field');
    const pc = loadPage(tx, page);
    const target = fieldTarget(pc, field);
    let v = value == null ? '' : String(value);
    if (field.kind === 'html') v = cleanRichHtml(v, rootPrefixFor(pc.page.route));
    if ((field.kind === 'url' || field.kind === 'brand') && /^\s*javascript:/i.test(v)) throw new EditError('javascript: URLs are not allowed');
    if (v.length > 200_000) throw new EditError('value too long');
    updateJson(tx, target.file, (o) => void setPath(o, target.jsonPath, v));
  },

  setConfig(tx, { path, value }) {
    const root = String(path || '').split('.')[0];
    if (!CONFIG_ROOTS.has(root)) throw new EditError(`config path ${path} is not editable`);
    updateJson(tx, 'site.config.json', (c) => void setPath(c, path, value === null ? undefined : clone(value)));
  },

  setDesign(tx, { id, patch, site }) {
    updateJson(tx, 'design.json', (d) => {
      d.version = d.version || 1;
      d.elements = d.elements || {};
      if (site) d.site = mergePatch(d.site || {}, site) || {};
      if (id) {
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new EditError('invalid element id');
        const next = mergePatch(d.elements[id] || {}, patch ?? null);
        if (next && Object.keys(next).length) d.elements[id] = next;
        else delete d.elements[id];
      }
    });
  },

  updatePage(tx, { page, title, description }) {
    const pc = loadPage(tx, page);
    updateJson(tx, `content/pages/${pc.page.id}.json`, (c) => {
      c.page = c.page || {};
      if (title !== undefined) c.page.title = String(title);
      if (description !== undefined) c.page.description = String(description);
    });
  },

  setAttr(tx, { page, id, name, value }) {
    if (!/^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/.test(String(name)) || /^on/i.test(name) || /^data-(sb|sar-section)/.test(name)) throw new EditError(`attribute ${name} cannot be edited`);
    if (value != null && /^(href|src|action|formaction|poster)$/i.test(name) && /^\s*javascript:/i.test(value)) throw new EditError('javascript: URLs are not allowed');
    const pc = loadPage(tx, page);
    const loc = locate(tx, pc, id);
    const $ = loadHtml(loc.html);
    const el = byId($, id);
    if (value == null) el.removeAttr(name);
    else el.attr(name, safeAttr(value));
    tx.write(loc.file, $.html());
  },

  setText(tx, { page, id, text }) {
    const pc = loadPage(tx, page);
    const loc = locate(tx, pc, id);
    const $ = loadHtml(loc.html);
    const el = byId($, id);
    if (el.children().length || new RegExp(TOKEN.source).test(el.html() || '')) throw new EditError('this element has structured content; edit its fields instead');
    el.html(escapeText(text));
    tx.write(loc.file, $.html());
  },

  setClasses(tx, { page, id, add = [], remove = [] }) {
    const pc = loadPage(tx, page);
    const loc = locate(tx, pc, id);
    const $ = loadHtml(loc.html);
    const el = byId($, id);
    for (const c of remove) el.removeClass(String(c));
    for (const c of add) if (/^[A-Za-z_-][\w-]*$/.test(c)) el.addClass(c);
    tx.write(loc.file, $.html());
  },

  insertElement(tx, { page, target, position = 'after', kind, props = {}, design }) {
    const def = ELEMENTS[kind];
    if (!def) throw new EditError(`unknown element ${kind}`);
    if (!['before', 'after', 'prepend', 'append'].includes(position)) throw new EditError('invalid position');
    const pc = loadPage(tx, page);
    const loc = locate(tx, pc, target);
    if (!loc.section) throw new EditError('elements can only be added inside a section');
    const $ = loadHtml(loc.html);
    const t = byId($, target);
    if ((position === 'prepend' || position === 'append') && VOID.has(t[0].name)) position = 'after';
    if (t.is('[data-sar-section]') && (position === 'before' || position === 'after')) position = position === 'before' ? 'prepend' : 'append';
    const context = position === 'before' || position === 'after' ? eachContext($, t[0]) : innerContext($, t[0], position);
    const scopes = scopeTargets(tx, pc, loc.section, context);
    const key = `${kind}_${newId().slice(0, 5)}`;
    const made = def.make(key, props);
    if (made.value !== undefined) writeScopes(tx, scopes, (scope) => void (scope[key] = clone(made.value)));
    const { html, $: frag } = assignIds(made.html, projectIds(tx));
    const newElId = frag('[data-sb]').first().attr('data-sb');
    t[position](html);
    tx.write(loc.file, $.html());
    if (design && newElId) HANDLERS.setDesign(tx, { id: newElId, patch: design });
    return { id: newElId };
  },

  moveElement(tx, { page, id, target, position = 'after' }) {
    if (id === target) return { id };
    if (!['before', 'after', 'prepend', 'append'].includes(position)) throw new EditError('invalid position');
    const pc = loadPage(tx, page);
    const from = locate(tx, pc, id);
    const to = locate(tx, pc, target);
    if (from.file !== to.file) throw new EditError('elements can be moved within their own section; use free positioning or copy the content instead');
    const $ = loadHtml(from.html);
    const el = byId($, id);
    const t = byId($, target);
    if (el.is('[data-sar-section]')) throw new EditError('use the Layers panel to move sections');
    if (el.find(`[data-sb="${target}"]`).length) throw new EditError('cannot move an element into itself');
    if ((position === 'prepend' || position === 'append') && VOID.has(t[0].name)) position = 'after';
    if (t.is('[data-sar-section]') && (position === 'before' || position === 'after')) position = position === 'before' ? 'prepend' : 'append';
    const ctxFrom = eachContext($, el[0]);
    const ctxTo = position === 'before' || position === 'after' ? eachContext($, t[0]) : innerContext($, t[0], position);
    if (JSON.stringify(ctxFrom) !== JSON.stringify(ctxTo)) throw new EditError('cannot move content into or out of a repeated list');
    el.remove();
    t[position](el);
    tx.write(from.file, $.html());
    return { id };
  },

  duplicateElement(tx, { page, id }) {
    const pc = loadPage(tx, page);
    const loc = locate(tx, pc, id);
    const $ = loadHtml(loc.html);
    const el = byId($, id);
    if (el.is('[data-sar-section]') && loc.section) return HANDLERS.duplicateSection(tx, { page, sectionId: loc.section.id });
    if (!loc.section) throw new EditError('only elements inside sections can be duplicated');
    const context = eachContext($, el[0]);
    const outer = $.html(el);
    const keys = [...topLevelKeys(outer)];
    const map = Object.fromEntries(keys.map((k) => [k, `${k}_${newId().slice(0, 4)}`]));
    if (keys.length) {
      const scopes = scopeTargets(tx, pc, loc.section, context);
      writeScopes(tx, scopes, (scope) => {
        for (const k of keys) if (scope[k] !== undefined) scope[map[k]] = clone(scope[k]);
      });
    }
    const renamed = renameKeys(outer, map);
    const { html, map: idMap } = refreshIds(renamed, projectIds(tx));
    el.after(html);
    tx.write(loc.file, $.html());
    copyDesign(tx, idMap);
    return { id: idMap[id] };
  },

  deleteElement(tx, { page, id }) {
    const pc = loadPage(tx, page);
    const loc = locate(tx, pc, id);
    const $ = loadHtml(loc.html);
    const el = byId($, id);
    if (el.is('[data-sar-section]') && loc.section) return HANDLERS.deleteSection(tx, { page, sectionId: loc.section.id });
    if (el.is('body, main')) throw new EditError('this element is part of the page layout and cannot be deleted');
    el.remove();
    tx.write(loc.file, $.html());
  },

  listItem(tx, { page, sectionId, listPath, index, action, to }) {
    const pc = loadPage(tx, page);
    const target = fieldTarget(pc, { kind: 'text', path: listPath, sectionId });
    updateJson(tx, target.file, (obj) => {
      const arr = getPath(obj, target.jsonPath);
      if (!Array.isArray(arr)) throw new EditError('not a list');
      const i = Number(index);
      if (!(i >= 0 && i < arr.length)) throw new EditError('invalid item index');
      if (action === 'duplicate') arr.splice(i + 1, 0, clone(arr[i]));
      else if (action === 'delete') {
        if (arr.length <= 1) throw new EditError('a list needs at least one item; delete the whole element instead');
        arr.splice(i, 1);
      } else if (action === 'move') {
        const j = Math.max(0, Math.min(arr.length - 1, Number(to)));
        const [item] = arr.splice(i, 1);
        arr.splice(j, 0, item);
      } else throw new EditError('invalid list action');
    });
  },

  addSection(tx, { page, block, after = null, content: overrides }) {
    const def = blockById(block);
    if (!def) throw new EditError(`unknown block ${block}`);
    const pc = loadPage(tx, page);
    const localId = `sb-${newId()}`;
    const sectionId = `${pc.page.id}/${localId}`;
    const component = `pages/${pc.page.id}/${localId}`;
    const { html, $ } = assignIds(def.html, projectIds(tx));
    const anim = {};
    $('[data-sb-anim]').each((_, el) => void (anim[el.attribs['data-sb-anim']] = el.attribs['data-sb']));
    $('[data-sb-anim]').removeAttr('data-sb-anim');
    const rootId = $('[data-sar-section]').first().attr('data-sb');
    tx.write(`components/${component}.html`, $.html() || html);
    updateJson(
      tx,
      `content/pages/${pc.page.id}.json`,
      (c) => {
        c.sections = c.sections || {};
        c.sections[localId] = { ...clone(def.content), ...(overrides || {}) };
      },
      { page: {}, sections: {} },
    );
    const entry = { id: sectionId, localId, type: /data-sar-type="([^"]+)"/.exec(def.html)?.[1] || 'content', component, content: 'page' };
    updateJson(tx, pc.file, (p) => {
      const i = after ? p.sections.findIndex((s) => s.id === after) : -1;
      p.sections.splice(i >= 0 ? i + 1 : p.sections.length, 0, entry);
    });
    tx.write(pc.page.layout, insertSectionToken(tx.read(pc.page.layout), sectionId, after, { navLike: ['navigation', 'footer'].includes(entry.type) }));
    if (def.design && rootId) HANDLERS.setDesign(tx, { id: rootId, patch: def.design });
    for (const [name, animation] of Object.entries(def.animate || {})) {
      const elId = name === 'root' ? rootId : anim[name];
      if (elId) HANDLERS.setDesign(tx, { id: elId, patch: { animation } });
    }
    addAllowedOrigins(tx, def.origins);
    return { sectionId, id: rootId };
  },

  duplicateSection(tx, { page, sectionId }) {
    const pc = loadPage(tx, page);
    const s = pc.page.sections.find((x) => x.id === sectionId);
    if (!s) throw new EditError('unknown section');
    const localId = `sb-${newId()}`;
    const newSectionId = `${pc.page.id}/${localId}`;
    const component = `pages/${pc.page.id}/${localId}`;
    const { html, map } = refreshIds(tx.read(componentFile(s)), projectIds(tx));
    tx.write(`components/${component}.html`, html);
    const local = pc.content.sections?.[s.localId];
    const shared = s.content === 'page' ? {} : getPath(tx.readJson('content/shared.json', {}), s.content.replace(/^shared:/, '')) || {};
    const effective = s.content === 'page' ? clone(local || {}) : clone(deepMerge(shared, local));
    updateJson(tx, `content/pages/${pc.page.id}.json`, (c) => {
      c.sections = c.sections || {};
      c.sections[localId] = effective;
    });
    updateJson(tx, pc.file, (p) => {
      const i = p.sections.findIndex((x) => x.id === sectionId);
      p.sections.splice(i + 1, 0, { id: newSectionId, localId, type: s.type, component, content: 'page' });
    });
    tx.write(pc.page.layout, insertSectionToken(tx.read(pc.page.layout), newSectionId, sectionId, { navLike: true }));
    copyDesign(tx, map);
    const rootOld = /data-sar-section[^>]*data-sb="([^"]+)"|data-sb="([^"]+)"[^>]*data-sar-section/.exec(tx.read(componentFile(s)));
    return { sectionId: newSectionId, id: rootOld ? map[rootOld[1] || rootOld[2]] : null };
  },

  deleteSection(tx, { page, sectionId }) {
    const pc = loadPage(tx, page);
    const s = pc.page.sections.find((x) => x.id === sectionId);
    if (!s) throw new EditError('unknown section');
    updateJson(tx, pc.file, (p) => void (p.sections = p.sections.filter((x) => x.id !== sectionId)));
    tx.write(pc.page.layout, removeSectionToken(tx.read(pc.page.layout), sectionId));
    if (s.content === 'page')
      updateJson(tx, `content/pages/${pc.page.id}.json`, (c) => {
        if (c.sections) delete c.sections[s.localId];
      });
    if (s.component.startsWith(`pages/${pc.page.id}/`) && !otherUsers(tx, s.component, sectionId)) tx.remove(componentFile(s));
  },

  moveSection(tx, { page, sectionId, toIndex }) {
    const pc = loadPage(tx, page);
    const layout = tx.read(pc.page.layout);
    const order = layoutOrder(layout);
    const from = order.indexOf(sectionId);
    if (from < 0) throw new EditError('section is not in the layout');
    const next = order.slice();
    next.splice(from, 1);
    next.splice(Math.max(0, Math.min(next.length, Number(toIndex))), 0, sectionId);
    let k = 0;
    tx.write(pc.page.layout, layout.replace(/\{\{@section\s+([^}\s]+)\s*\}\}/g, () => tokenFor(next[k++])));
    updateJson(tx, pc.file, (p) => {
      const rank = new Map(next.map((id, i) => [id, i]));
      p.sections.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
    });
  },

  setSectionSource(tx, { page, sectionId, html }) {
    const pc = loadPage(tx, page);
    const s = pc.page.sections.find((x) => x.id === sectionId);
    if (!s) throw new EditError('unknown section');
    let src = String(html ?? '');
    if (src.length > 500_000) throw new EditError('section markup too large');
    validateTemplate(src);
    const $ = loadHtml(src);
    const first = $.root().children().first();
    if (!first.length) throw new EditError('section markup is empty');
    if (!$('[data-sar-section]').length) first.attr('data-sar-section', '{{@sectionid}}');
    const { html: out } = assignIds($.html(), projectIdsExcept(tx, componentFile(s)));
    tx.write(componentFile(s), out);
  },

  addPage(tx, { title, slug, basedOn, block = 'hero-center' }) {
    const id = String(slug || title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    if (!PAGE_ID.test(id) || id === 'index') throw new EditError('choose a page name with letters or numbers');
    if (tx.exists(`pages/${id}.json`) || tx.list('pages').some((f) => f.endsWith('.json') && tx.readJson(`pages/${f}`).id === id)) throw new EditError(`a page called "${id}" already exists`);
    const route = `${id}.html`;
    if (tx.list('pages').some((f) => f.endsWith('.json') && tx.readJson(`pages/${f}`).route === route)) throw new EditError(`route ${route} is already used`);
    const base = loadPage(tx, basedOn || tx.list('pages').find((f) => f.endsWith('.json'))?.replace(/\.json$/, ''));
    const sharedSections = base.page.sections.filter((s) => s.content !== 'page');
    const idMap = Object.fromEntries(sharedSections.map((s) => [s.id, `${id}/${s.localId}`]));
    let layout = tx.read(base.page.layout).replace(/[ \t]*\{\{@section\s+([^}\s]+)\s*\}\}[ \t]*\r?\n?/g, (m, sid) => (idMap[sid] ? m.replace(sid, idMap[sid]) : ''));
    layout = refreshIds(layout, projectIds(tx)).html.replace(/<body([^>]*)class="([^"]*)page-[a-z0-9-]+/i, `<body$1class="$2page-${id}`);
    // refreshIds parses as a fragment, which keeps the document structure intact.
    const layoutFile = `layouts/${id}.html`;
    tx.write(layoutFile, layout);
    tx.writeJson(`content/pages/${id}.json`, { page: { title: String(title || id), description: '' }, sections: {} });
    tx.writeJson(`pages/${id}.json`, {
      id,
      route,
      layout: layoutFile,
      sections: sharedSections.map((s) => ({ ...s, id: idMap[s.id] })),
    });
    const nav = sharedSections.find((s) => s.type === 'navigation');
    if (nav) {
      const navPath = nav.content.replace(/^shared:/, '');
      updateJson(tx, 'content/shared.json', (sh) => {
        const links = getPath(sh, `${navPath}.links`);
        if (Array.isArray(links)) links.push({ label: String(title || id), href: `/${route}` });
      });
    }
    const after = sharedSections.find((s) => s.type === 'navigation')?.id;
    if (block) HANDLERS.addSection(tx, { page: id, block, after: after ? idMap[after] : null, content: block === 'hero-center' ? { heading: String(title || id), badge: String(title || id) } : undefined });
    return { pageId: id };
  },

  deletePage(tx, { pageId }) {
    const pages = tx.list('pages').filter((f) => f.endsWith('.json'));
    if (pages.length <= 1) throw new EditError('a site needs at least one page');
    const pc = loadPage(tx, pageId);
    tx.remove(pc.file);
    tx.remove(`content/pages/${pc.page.id}.json`);
    const others = pages.map((f) => `pages/${f}`).filter((f) => f !== pc.file).map((f) => tx.readJson(f));
    if (!others.some((p) => p.layout === pc.page.layout)) tx.remove(pc.page.layout);
    for (const s of pc.page.sections) if (s.component.startsWith(`pages/${pc.page.id}/`) && !others.some((p) => p.sections.some((x) => x.component === s.component))) tx.remove(componentFile(s));
    updateJson(tx, 'content/shared.json', (sh) => {
      for (const v of Object.values(sh)) if (Array.isArray(v?.links)) v.links = v.links.filter((l) => l.href !== `/${pc.page.route}`);
    });
  },
};

function otherUsers(tx, component, exceptSectionId) {
  for (const f of tx.list('pages')) {
    if (!f.endsWith('.json')) continue;
    if (tx.readJson(`pages/${f}`).sections.some((s) => s.component === component && s.id !== exceptSectionId)) return true;
  }
  return false;
}

function projectIdsExcept(tx, file) {
  const ids = projectIds(tx);
  for (const id of collectIds(tx.read(file))) ids.delete(id);
  return ids;
}

export const BLOCK_LIST = BLOCKS.map(({ id, label, category }) => ({ id, label, category }));
export const ELEMENT_LIST = Object.entries(ELEMENTS).map(([id, e]) => ({ id, label: e.label }));
