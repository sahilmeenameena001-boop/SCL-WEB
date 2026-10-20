// Editor preview: renders a page with every field value wrapped in invisible markers, then maps the
// markers onto the DOM as attributes and strips them:
//   data-sb-text="<n>"   element whose whole content is text field n (inline editable)
//   data-sb-html="<n>"   element whose whole content is rich-text field n (inline editable)
//   data-sb-part="<n> …" element containing field n mixed with other content (inspector only)
//   data-sb-attrs="src:<n> alt:<n>"  attributes filled from fields
//   data-sb-item="<n>"   root element of repeated list item n
// The field/item tables are embedded as JSON in #sb-editor-data.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as cheerio from 'cheerio';
import { renderPage, loadSite, listPages, rootPrefixFor, brandCss } from '../../processing/template-runtime/build.mjs';
import { fieldTarget, getPath } from './site-model.mjs';

const START = '\uE000';
const SEP = '\uE001';
const END = '\uE002';
const MARK_RE = /\uE000([0-9a-z]+)\uE001|\uE002/g;

export function findPage(siteDir, pathOrId) {
  const pages = listPages(siteDir);
  const p = String(pathOrId || '').replace(/^\/+/, '');
  return (
    pages.find((x) => x.id === p) ||
    pages.find((x) => x.route === p) ||
    pages.find((x) => x.route === `${p.replace(/\/$/, '')}/index.html`) ||
    pages.find((x) => x.route === `${p}.html`) ||
    (!p ? pages.find((x) => x.route === 'index.html') || pages[0] : null)
  );
}

export function renderEditorPage(siteDir, page) {
  const site = loadSite(siteDir);
  const content = existsSync(join(siteDir, 'content/pages', `${page.id}.json`)) ? JSON.parse(readFileSync(join(siteDir, 'content/pages', `${page.id}.json`), 'utf8')) : { page: {}, sections: {} };
  const fields = [];
  const items = [];
  const mark = (info, out) => {
    const n = fields.push(info) - 1;
    return `${START}${n.toString(36)}${SEP}${out}${END}`;
  };
  const markItem = (listPath, index, sectionId) => {
    const n = items.push({ listPath, index, sectionId }) - 1;
    return `<!--sbi:${n}-->`;
  };
  const rootPrefix = rootPrefixFor(page.route);
  const { html } = renderPage({
    root: siteDir,
    page,
    site,
    editor: {
      mark,
      markItem,
      headEnd: `\n<style id="sb-editor-style">[contenteditable]{outline:none;cursor:text}[data-sb-editing]{caret-color:auto}a{cursor:default}html{scroll-behavior:auto !important}</style>`,
      bodyEnd: '',
    },
  });

  const $ = cheerio.load(html, { xml: { xmlMode: false, decodeEntities: false } });
  annotate($, fields);

  // Raw (uninterpolated) values, so the inspector can show {{brand.name}} references.
  const pc = { page, content };
  const sharedRaw = site.shared;
  const rawOf = (f) => {
    try {
      const t = fieldTarget(pc, f);
      const src = t.file === 'site.config.json' ? site.config : t.file === 'content/shared.json' ? sharedRaw : content;
      const v = getPath(src, t.jsonPath);
      return typeof v === 'string' ? v : v == null ? '' : String(v);
    } catch {
      return '';
    }
  };
  const fieldTable = fields.map((f) => ({ ...f, raw: rawOf(f), shared: f.sectionId ? page.sections.find((s) => s.id === f.sectionId)?.content !== 'page' : false }));
  const data = { page: { id: page.id, route: page.route }, rootPrefix, fields: fieldTable, items };
  $('body').append(`<script type="application/json" id="sb-editor-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);
  return $.html();
}

/** Turn the inline markers into data attributes. */
function annotate($, fields) {
  const opens = new Map(); // field n -> { node, offset }
  const spans = []; // { n, start: {node, offset}, end: {node, offset} }
  const walk = (node) => {
    for (const child of [...(node.children || [])]) {
      if (child.type === 'tag' || child.type === 'script' || child.type === 'style') {
        const refs = [];
        for (const [name, value] of Object.entries(child.attribs || {})) {
          if (!value.includes(START) && !value.includes(END)) continue;
          for (const m of value.matchAll(MARK_RE)) if (m[1]) refs.push(`${name}:${parseInt(m[1], 36)}`);
          child.attribs[name] = value.replace(MARK_RE, '');
        }
        if (refs.length) child.attribs['data-sb-attrs'] = refs.join(' ');
        walk(child);
      } else if (child.type === 'text' && (child.data.includes(START) || child.data.includes(END))) {
        let out = '';
        let last = 0;
        for (const m of child.data.matchAll(MARK_RE)) {
          out += child.data.slice(last, m.index);
          last = m.index + m[0].length;
          if (m[1]) {
            const n = parseInt(m[1], 36);
            const pos = { node: child, offset: out.length };
            opens.set(n, pos);
          } else {
            // END closes the most recently opened field (fields never overlap).
            const n = [...opens.keys()].pop();
            if (n === undefined) continue;
            const start = opens.get(n);
            opens.delete(n);
            spans.push({ n, start, end: { node: child, offset: out.length } });
          }
        }
        out += child.data.slice(last);
        child.data = out;
      } else if (child.type === 'comment' && /^sbi:\d+$/.test(child.data)) {
        let next = child.next;
        while (next && next.type !== 'tag') next = next.next;
        if (next) next.attribs['data-sb-item'] = child.data.slice(4);
        $(child).remove();
      }
    }
  };
  walk($.root()[0]);

  for (const { n, start, end } of spans) {
    const parent = start.node.parent;
    if (!parent || parent.type === 'root' || parent.name === 'title' || parent.name === 'head') continue;
    let whole = end.node.parent === parent;
    if (whole) {
      if (start.node.data.slice(0, start.offset).trim() || end.node.data.slice(end.offset).trim()) whole = false;
      for (let s = start.node.prev; whole && s; s = s.prev) if (!isBlank(s)) whole = false;
      for (let s = end.node.next; whole && s; s = s.next) if (!isBlank(s)) whole = false;
    }
    const kind = fields[n]?.kind;
    const attr = !whole ? 'part' : kind === 'html' ? 'html' : (kind === 'text' || kind === 'brand') && start.node === end.node ? 'text' : 'part';
    if (attr === 'part' || parent.attribs[`data-sb-${attr}`]) parent.attribs['data-sb-part'] = `${parent.attribs['data-sb-part'] || ''} ${n}`.trim();
    else parent.attribs[`data-sb-${attr}`] = String(n);
  }
}

const isBlank = (node) => (node.type === 'text' && !node.data.trim()) || node.type === 'comment';

export const brandCssFor = (siteDir) => brandCss(loadSite(siteDir).config);
