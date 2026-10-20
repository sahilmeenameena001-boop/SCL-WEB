// Helpers shared by the editor's preview renderer and edit operations: JSON paths, where a field's
// value lives on disk, markup parsing with stable element ids (data-sb) and template-token scopes.
import * as cheerio from 'cheerio';
import { randomBytes } from 'node:crypto';
import { getPath, parse as parseTemplate } from '../../processing/template-runtime/lib/engine.mjs';

export { getPath };

const PARSE_OPTS = { xml: { xmlMode: false, decodeEntities: false } };
const SKIP_IDS = new Set(['script', 'style', 'noscript', 'template', 'meta', 'link', 'title', 'head', 'html', 'base']);
export const TOKEN = /\{\{@([a-z-]*)(?:\s+([^}]*?))?\s*\}\}/g;

export class EditError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------------------------
// JSON paths

export function setPath(obj, path, value) {
  const keys = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    cur = cur[k];
  }
  const last = keys[keys.length - 1];
  if (value === undefined) {
    if (Array.isArray(cur) && /^\d+$/.test(last)) cur.splice(Number(last), 1);
    else delete cur[last];
  } else cur[last] = value;
  return obj;
}

export const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** Deep merge where `null` in the patch deletes the key. */
export function mergePatch(base, patch) {
  if (patch === null) return undefined;
  if (typeof patch !== 'object' || Array.isArray(patch) || typeof base !== 'object' || base === null || Array.isArray(base)) return clone(patch);
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const merged = mergePatch(base[k], v);
    if (merged === undefined || (typeof merged === 'object' && !Array.isArray(merged) && merged && !Object.keys(merged).length)) delete out[k];
    else out[k] = merged;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Where content lives

/**
 * Locate the stored value behind a rendered field.
 * @returns {{ file: string, jsonPath: string }}
 */
export function fieldTarget({ page, content }, { kind, path, sectionId }) {
  if (kind === 'brand') return { file: 'site.config.json', jsonPath: path };
  if (!sectionId) return { file: `content/pages/${page.id}.json`, jsonPath: path }; // layout scope: { page: {...} }
  const s = page.sections.find((x) => x.id === sectionId);
  if (!s) throw new EditError(`unknown section ${sectionId}`);
  const localPath = path ? `sections.${s.localId}.${path}` : `sections.${s.localId}`;
  if (s.content === 'page') return { file: `content/pages/${page.id}.json`, jsonPath: localPath };
  const sharedPath = s.content.replace(/^shared:/, '');
  if (path && getPath(content, localPath) !== undefined) return { file: `content/pages/${page.id}.json`, jsonPath: localPath };
  return { file: 'content/shared.json', jsonPath: path ? `${sharedPath}.${path}` : sharedPath };
}

// ---------------------------------------------------------------------------------------------
// Markup

export const loadHtml = (html) => cheerio.load(html, PARSE_OPTS, false);

export const newId = () => randomBytes(5).toString('base64url').replace(/[-_]/g, 'x').slice(0, 7).toLowerCase();

function inSvg(el) {
  for (let p = el.parent; p; p = p.parent) if (p.name === 'svg') return true;
  return false;
}

/**
 * Give every element a data-sb id (stable handle for styles, animations and edits).
 * For full documents (layouts) only <body> and its descendants get ids.
 */
export function assignIds(html, used = new Set(), { onlyBody = false, fresh = false } = {}) {
  const $ = loadHtml(html);
  let changed = false;
  const scope = onlyBody ? $('body').find('*').add($('body')) : $('*');
  scope.each((_, el) => {
    if (SKIP_IDS.has(el.name) || inSvg(el)) return;
    let id = el.attribs['data-sb'];
    if (!id || fresh || used.has(id)) {
      do id = newId();
      while (used.has(id));
      el.attribs['data-sb'] = id;
      changed = true;
    }
    used.add(id);
  });
  return { html: changed ? $.html() : html, changed, $ };
}

export function collectIds(html) {
  const ids = [];
  for (const m of html.matchAll(/data-sb="([^"]+)"/g)) ids.push(m[1]);
  return ids;
}

/** Iterate nodes in document order. */
function* walk(node) {
  for (const c of node.children || []) {
    yield c;
    yield* walk(c);
  }
}

/** {{@each}} paths open at the position of `target` (outermost first). */
export function eachContext($, target) {
  const stack = [];
  const roots = $.root()[0];
  for (const n of walk(roots)) {
    if (n === target) return stack.slice();
    if (n.type === 'text') {
      for (const m of n.data.matchAll(TOKEN)) {
        if (m[1] === 'each') stack.push((m[2] || '').trim());
        else if (m[1] === 'end') stack.pop();
      }
    }
  }
  return stack.slice();
}

/** The list context inside an element (for inserting as its first/last child). */
export function innerContext($, el, position) {
  const ctx = eachContext($, el);
  if (position === 'prepend') return ctx;
  const inner = [...ctx];
  for (const n of walk(el)) {
    if (n.type === 'text')
      for (const m of n.data.matchAll(TOKEN)) {
        if (m[1] === 'each') inner.push((m[2] || '').trim());
        else if (m[1] === 'end') inner.pop();
      }
  }
  return inner;
}

/** Top-level field keys used by markup outside any {{@each}} block, and the each-list paths. */
export function topLevelKeys(html) {
  const keys = new Set();
  let depth = 0;
  for (const m of html.matchAll(TOKEN)) {
    const [, name, arg = ''] = m;
    if (name === 'end') depth--;
    else if (depth === 0 && ['', 'html', 'url', 'srcset', 'each'].includes(name) && arg.trim()) keys.add(arg.trim().split('.')[0]);
    if (name === 'each') depth++;
  }
  return keys;
}

/** Rename top-level field keys (outside each blocks) in a markup fragment. */
export function renameKeys(html, map) {
  let depth = 0;
  return html.replace(TOKEN, (m, name, arg = '') => {
    let out = m;
    if (depth === 0 && ['', 'html', 'url', 'srcset', 'each'].includes(name)) {
      const a = arg.trim();
      const [first, ...rest] = a.split('.');
      if (map[first]) out = `{{@${name} ${[map[first], ...rest].join('.')}}}`;
    }
    if (name === 'each') depth++;
    else if (name === 'end') depth--;
    return out;
  });
}

export function validateTemplate(html) {
  try {
    parseTemplate(html);
  } catch (e) {
    throw new EditError(`template markup: ${e.message}`);
  }
}

export const escapeText = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Rich HTML saved from the preview: undo page-relative URLs and drop executable markup. */
export function cleanRichHtml(html, rootPrefix) {
  let out = String(html ?? '')
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '')
    .replace(/\sdata-sb(-[a-z]+)?="[^"]*"/g, '')
    .replace(/\scontenteditable="[^"]*"/g, '');
  if (rootPrefix) {
    const esc = rootPrefix.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    out = out.replace(new RegExp(`\\s(href|src|poster|action)="${esc}(?!\\/)`, 'g'), ' $1="/');
  }
  return out;
}
