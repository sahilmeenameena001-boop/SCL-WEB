// Controller for the live preview iframe (same origin: /editor-preview/<project>/<route>).
// The server marks editable content (see app/editor/server/preview.mjs):
//   data-sb            stable element id        data-sb-text / data-sb-html  inline-editable field
//   data-sb-part       fields mixed with markup data-sb-attrs "src:3 alt:4"  attributes filled from fields
//   data-sb-item       root of repeated list item n; #sb-editor-data holds the field and item tables.
// This module installs the editing behaviour in the iframe document: hover/select, double-click
// text editing, drops from the panels and free dragging. Outlines are drawn by Overlay.jsx.
import { designCss, animationConfig } from '../../../processing/template-runtime/lib/design.mjs';
import { getState, setState, toast } from '../store.js';
import { assetDropHint, canFreeDrag, freePosition, placement, sectionInsertAfter } from './drop.js';

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META']);
const fieldKey = (f) => `${f.kind}|${f.path}|${f.sectionId || ''}`;
const rectOf = (node) => {
  if (!node?.isConnected) return null;
  const r = node.getBoundingClientRect();
  return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
};

class Preview {
  iframe = null;
  doc = null;
  win = null;
  data = null;
  hoverNode = null;
  selectedNode = null;
  hint = null; // drop indicator { rect, mode: 'line'|'box', label, ... }
  editing = null;
  drag = null;
  pendingScroll = null;
  pendingReveal = null;
  suppressClick = false;
  actions = null; // set by actions.js: { select, commitText, drop, commitFree, handleKey }

  attach(iframe) {
    this.iframe = iframe;
  }

  // ------------------------------------------------------------------ lifecycle

  handleLoad() {
    const doc = this.iframe?.contentDocument;
    if (!doc?.body) return;
    this.doc = doc;
    this.win = this.iframe.contentWindow;
    this.editing = null;
    this.drag = null;
    this.hint = null;
    this.hoverNode = null;
    const dataEl = doc.getElementById('sb-editor-data');
    try {
      this.data = dataEl ? JSON.parse(dataEl.textContent) : null;
    } catch {
      this.data = null;
    }
    if (!this.data) this.data = { page: {}, rootPrefix: './', fields: [], items: [] };
    this.install(doc);
    if (this.pendingScroll != null) this.win.scrollTo(0, this.pendingScroll);
    this.pendingScroll = null;
    const { selectedId, selectedIndex, previewVersion } = getState();
    this.selectedNode = selectedId ? this.node(selectedId, selectedIndex) : null;
    if (this.pendingReveal && this.selectedNode) this.selectedNode.scrollIntoView({ block: 'center' });
    this.pendingReveal = null;
    setState({ previewVersion: previewVersion + 1, hoverId: null, editingId: null, ...(selectedId && !this.selectedNode ? { selectedId: null, selectedIndex: 0 } : {}) });
  }

  reload({ keepScroll = true } = {}) {
    if (!this.win) return;
    if (this.editing) this.cancelEdit();
    this.pendingScroll = keepScroll ? this.win.scrollY : null;
    this.win.location.reload();
  }

  install(doc) {
    const on = (type, fn) => doc.addEventListener(type, fn, true);
    on('mousemove', (e) => this.onMove(e));
    on('mouseleave', () => this.setHover(null));
    on('mousedown', (e) => this.onDown(e));
    on('mouseup', (e) => this.onUp(e));
    on('click', (e) => this.onClick(e));
    on('dblclick', (e) => this.onDblClick(e));
    on('submit', (e) => e.preventDefault());
    on('keydown', (e) => this.actions?.handleKey(e));
    on('dragover', (e) => this.onDragOver(e));
    on('dragleave', (e) => {
      if (!e.relatedTarget) this.hint = null;
    });
    on('drop', (e) => this.onDrop(e));
    doc.addEventListener('dragstart', (e) => {
      // Native dragging of links/images inside the page would fight with selection and free dragging.
      if (!this.editing) e.preventDefault();
    });
  }

  // ------------------------------------------------------------------ lookups

  nodes(id) {
    if (!this.doc || !id) return [];
    return [...this.doc.querySelectorAll(`[data-sb="${CSS.escape(id)}"]`)];
  }

  node(id, index = 0) {
    const all = this.nodes(id);
    return all[index] || all[0] || null;
  }

  target(e) {
    const t = e.target?.nodeType === 1 ? e.target : e.target?.parentElement;
    const n = t?.closest?.('[data-sb]');
    return n && n !== this.doc.documentElement ? n : null;
  }

  field(n) {
    const i = Number(n);
    return { n: i, field: this.data?.fields[i] };
  }

  /** Everything the inspector and the drop logic need to know about an element. */
  describe(node) {
    if (!node?.isConnected || !this.data) return null;
    const id = node.getAttribute('data-sb');
    const sec = node.closest('[data-sar-section]');
    const attrs = {};
    for (const pair of (node.getAttribute('data-sb-attrs') || '').split(/\s+/).filter(Boolean)) {
      const at = pair.lastIndexOf(':');
      attrs[pair.slice(0, at)] = this.field(pair.slice(at + 1));
    }
    const literalAttrs = {};
    for (const a of node.attributes) if (!a.name.startsWith('data-sb') && !(a.name in attrs)) literalAttrs[a.name] = a.value;
    const itemEl = node.closest('[data-sb-item]');
    const item = itemEl && sec?.contains(itemEl) ? { n: Number(itemEl.getAttribute('data-sb-item')), ...this.data.items[Number(itemEl.getAttribute('data-sb-item'))], isRoot: itemEl === node } : null;
    const text = node.hasAttribute('data-sb-text') ? this.field(node.getAttribute('data-sb-text')) : null;
    const html = node.hasAttribute('data-sb-html') ? this.field(node.getAttribute('data-sb-html')) : null;
    const parts = (node.getAttribute('data-sb-part') || '').split(/\s+/).filter(Boolean).map((n) => this.field(n));
    const all = this.nodes(id);
    const tag = node.tagName.toLowerCase();
    return {
      id,
      index: Math.max(0, all.indexOf(node)),
      repeated: all.length > 1,
      tag,
      classes: [...node.classList],
      isSection: node === sec,
      sectionId: sec?.getAttribute('data-sar-section') || null,
      sectionRootId: sec?.getAttribute('data-sb') || null,
      sectionType: sec?.getAttribute('data-sar-type') || null,
      text,
      html,
      parts,
      attrs,
      literalAttrs,
      item,
      plainText: !node.children.length && !text && !html && !parts.length && !['img', 'video', 'iframe', 'hr', 'br', 'input'].includes(tag) ? node.textContent : null,
      snippet: (node.innerText || node.getAttribute('alt') || '').trim().slice(0, 80),
    };
  }

  /** Fields rendered in an element and its descendants, de-duplicated (own fields first). */
  fieldsWithin(node, limit = 40) {
    if (!node?.isConnected || !this.data) return [];
    const out = [];
    const seen = new Set();
    const add = (el, role, n, attr) => {
      const f = this.field(n);
      if (!f.field) return;
      const key = fieldKey(f.field) + (attr ? `|${attr}` : '');
      if (seen.has(key) || out.length >= limit) return;
      seen.add(key);
      out.push({ ...f, role, attr, own: el === node, el });
    };
    const els = [node, ...node.querySelectorAll('[data-sb-text],[data-sb-html],[data-sb-part],[data-sb-attrs]')];
    for (const el of els) {
      if (el.hasAttribute('data-sb-text')) add(el, 'text', el.getAttribute('data-sb-text'));
      if (el.hasAttribute('data-sb-html')) add(el, 'html', el.getAttribute('data-sb-html'));
      for (const n of (el.getAttribute('data-sb-part') || '').split(/\s+/).filter(Boolean)) add(el, 'part', n);
      for (const pair of (el.getAttribute('data-sb-attrs') || '').split(/\s+/).filter(Boolean)) {
        const at = pair.lastIndexOf(':');
        add(el, 'attr', pair.slice(at + 1), pair.slice(0, at));
      }
    }
    return out;
  }

  /** True when a field is rendered more than once on this page (edits must re-render). */
  fieldIsRepeated(field) {
    const key = fieldKey(field);
    return (this.data?.fields || []).filter((f) => fieldKey(f) === key).length > 1;
  }

  /** Layers: the page's sections and their elements. */
  tree() {
    if (!this.doc) return [];
    const index = new Map();
    for (const el of this.doc.querySelectorAll('[data-sb]')) {
      const id = el.getAttribute('data-sb');
      if (!index.has(id)) index.set(id, []);
      index.get(id).push(el);
    }
    let budget = 4000;
    const make = (el, depth) => {
      budget--;
      const id = el.getAttribute('data-sb');
      return {
        id,
        index: index.get(id).indexOf(el),
        el,
        tag: el.tagName.toLowerCase(),
        classes: [...el.classList],
        text: el.children.length ? '' : el.textContent || el.getAttribute('alt') || '',
        isSection: el.hasAttribute('data-sar-section'),
        sectionId: el.getAttribute('data-sar-section'),
        sectionType: el.getAttribute('data-sar-type'),
        children: depth > 14 ? [] : kids(el, depth + 1),
      };
    };
    const kids = (el, depth) => {
      const out = [];
      for (const c of el.children) {
        if (budget <= 0 || SKIP.has(c.tagName)) continue;
        if (c.hasAttribute('data-sb')) out.push(make(c, depth));
        else out.push(...kids(c, depth));
      }
      return out;
    };
    return [...this.doc.querySelectorAll('[data-sar-section]')].filter((s) => !s.parentElement?.closest('[data-sar-section]')).map((s) => make(s, 0));
  }

  // ------------------------------------------------------------------ live updates

  applyDesign(design) {
    const style = this.doc?.getElementById('sb-design');
    if (style) style.textContent = designCss(design, { root: this.data?.rootPrefix || './', editor: true });
    try {
      this.win?.__sbAnimate?.setConfig(animationConfig(design));
    } catch {}
  }

  setCssVar(name, value) {
    this.doc?.documentElement.style.setProperty(name, value);
  }

  refreshBrandCss() {
    const link = this.doc?.querySelector('link[href*="brand/brand.css"]');
    if (!link) return;
    const fresh = link.cloneNode();
    fresh.href = `${link.getAttribute('href').split('?')[0]}?v=${Date.now()}`;
    fresh.onload = () => {
      link.remove();
      this.doc.documentElement.removeAttribute('style');
    };
    link.after(fresh);
  }

  play(id) {
    try {
      if (id) this.win?.__sbAnimate?.play(id);
      else this.win?.__sbAnimate?.playAll();
    } catch (e) {
      toast(`Animation preview failed: ${e.message}`, { kind: 'error' });
    }
  }

  /** Free position matching where an element is now (its containing block once it is absolute). */
  freeFromCurrent(node) {
    let cb = node.parentElement;
    while (cb && !cb.hasAttribute('data-sar-section') && this.win.getComputedStyle(cb).position === 'static') cb = cb.parentElement;
    if (!cb) return { x: 0, y: 0 };
    const r = node.getBoundingClientRect();
    const c = cb.getBoundingClientRect();
    return freePosition({ left: r.left - c.left - cb.clientLeft, top: r.top - c.top - cb.clientTop, width: r.width }, { width: cb.clientWidth, height: cb.clientHeight });
  }

  computedStyle(node) {
    return node?.isConnected ? this.win.getComputedStyle(node) : null;
  }

  overlayState() {
    const sel = this.selectedNode;
    return {
      hover: this.hoverNode && this.hoverNode !== sel && !this.drag?.started ? rectOf(this.hoverNode) : null,
      selected: rectOf(sel),
      editing: !!this.editing,
      hint: this.hint ? { ...this.hint, rect: this.hint.node ? rectOf(this.hint.node) : this.hint.rect } : null,
      dragging: !!this.drag?.started,
    };
  }

  // ------------------------------------------------------------------ pointer

  setHover(node) {
    if (node === this.hoverNode) return;
    this.hoverNode = node;
    setState({ hoverId: node?.getAttribute('data-sb') || null });
  }

  onMove(e) {
    if (this.drag) return this.dragMove(e);
    if (!this.editing) this.setHover(this.target(e));
  }

  onClick(e) {
    if (this.editing?.el.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    this.actions?.select(this.target(e));
  }

  onDblClick(e) {
    if (this.editing?.el.contains(e.target)) return;
    e.preventDefault();
    const node = this.target(e);
    if (node) this.startEdit(node);
  }

  // ------------------------------------------------------------------ free dragging

  onDown(e) {
    if (e.button !== 0 || this.editing) return;
    const node = this.target(e);
    if (!node || node !== this.selectedNode) return;
    const info = this.describe(node);
    if (!canFreeDrag(info)) return;
    e.preventDefault();
    this.drag = { node, info, x0: e.clientX, y0: e.clientY, started: false };
  }

  dragMove(e) {
    const d = this.drag;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
      this.dragBegin();
    }
    const cr = d.cb.getBoundingClientRect();
    const left = e.clientX - d.grabX - cr.left - d.cb.clientLeft;
    const top = e.clientY - d.grabY - cr.top - d.cb.clientTop;
    d.node.style.setProperty('left', `${left}px`, 'important');
    d.node.style.setProperty('top', `${top}px`, 'important');
    d.box = { left, top, width: d.width };
  }

  dragBegin() {
    const d = this.drag;
    const { node } = d;
    const sec = node.closest('[data-sar-section]');
    if (this.win.getComputedStyle(sec).position === 'static') {
      d.restoreSection = sec.getAttribute('style');
      sec.style.position = 'relative';
      d.section = sec;
    }
    const r = node.getBoundingClientRect();
    // Grab offset from the mousedown point: the pointer may already be far away on the first move.
    d.grabX = d.x0 - r.left;
    d.grabY = d.y0 - r.top;
    d.width = r.width;
    d.prevStyle = node.getAttribute('style');
    for (const [p, v] of [['position', 'absolute'], ['margin', '0'], ['width', `${r.width}px`], ['z-index', '50'], ['transition', 'none']]) node.style.setProperty(p, v, 'important');
    d.cb = node.offsetParent || sec;
    d.started = true;
    this.setHover(null);
  }

  onUp(e) {
    const d = this.drag;
    if (!d) return;
    if (d.started) this.dragMove(e); // the release point is the final position
    this.drag = null;
    if (!d.started) return;
    this.suppressClick = true;
    setTimeout(() => (this.suppressClick = false), 0);
    const pos = freePosition(d.box || { left: 0, top: 0, width: d.width }, { width: d.cb.clientWidth, height: d.cb.clientHeight });
    this.actions?.commitFree(d.info.id, pos);
    if (d.prevStyle == null) d.node.removeAttribute('style');
    else d.node.setAttribute('style', d.prevStyle);
    if (d.section) {
      if (d.restoreSection == null) d.section.removeAttribute('style');
      else d.section.setAttribute('style', d.restoreSection);
    }
  }

  // ------------------------------------------------------------------ drag and drop from the panels

  dropPayload(e) {
    const payload = getState().dragging;
    if (payload) return payload;
    return e.dataTransfer?.types?.includes('Files') ? { type: 'files' } : null;
  }

  onDragOver(e) {
    const payload = this.dropPayload(e);
    if (!payload) return;
    e.preventDefault();
    const hint = this.computeHint(payload, e);
    e.dataTransfer.dropEffect = hint ? (payload.type === 'files' || payload.type === 'asset' ? 'copy' : 'move') : 'none';
    this.hint = hint;
  }

  computeHint(payload, e) {
    const y = e.clientY;
    if (payload.type === 'block') {
      const sections = [...this.doc.querySelectorAll('[data-sar-section]')].filter((s) => !s.parentElement?.closest('[data-sar-section]'));
      if (!sections.length) return { mode: 'line', rect: { top: 8, left: 0, width: this.doc.documentElement.clientWidth, height: 0 }, label: 'Add section', after: null };
      let sec = e.target?.closest?.('[data-sar-section]');
      while (sec?.parentElement?.closest('[data-sar-section]')) sec = sec.parentElement.closest('[data-sar-section]');
      if (!sec) sec = sections.reduce((best, s) => (Math.abs(rectOf(s).top - y) < Math.abs(rectOf(best).top - y) ? s : best));
      const r = rectOf(sec);
      const before = placement(r, y) === 'before';
      const order = getState().data.pages.find((p) => p.id === getState().pageId)?.sections.map((s) => s.id) || [];
      return { mode: 'line', rect: { top: before ? r.top : r.top + r.height, left: r.left, width: r.width, height: 0 }, label: 'Add section here', after: sectionInsertAfter(order, sec.getAttribute('data-sar-section'), before) };
    }
    let node = this.target(e);
    if (payload.type === 'element') {
      if (!node?.closest('[data-sar-section]')) return null;
      // Insert next to block-level elements, not inside inline text.
      while (node && !node.hasAttribute('data-sar-section') && this.win.getComputedStyle(node).display.startsWith('inline') && node.parentElement?.closest('[data-sb]')) node = node.parentElement.closest('[data-sb]');
      const r = rectOf(node);
      const isSection = node.hasAttribute('data-sar-section');
      const position = placement(r, y, { container: isSection });
      const atTop = position === 'before' || position === 'prepend';
      const inset = isSection ? 12 : 0;
      return {
        mode: 'line',
        rect: { top: atTop ? r.top + inset : r.top + r.height - inset, left: r.left + inset, width: r.width - inset * 2, height: 0 },
        label: `Insert ${atTop ? 'before' : 'after'}`,
        targetId: node.getAttribute('data-sb'),
        position,
      };
    }
    // Assets (from the panel or dropped files)
    if (!node) return null;
    const asset = payload.type === 'asset' ? payload.asset : { kind: /^video\//.test(e.dataTransfer?.items?.[0]?.type || '') ? 'video' : 'image', path: '' };
    const info = this.describe(node);
    const label = assetDropHint(asset, info);
    if (!label) return null;
    const box = label === 'Set section background' ? node.closest('[data-sar-section]') : node;
    return { mode: label.startsWith('Insert') ? 'line' : 'box', node: box, label, info };
  }

  onDrop(e) {
    const payload = this.dropPayload(e);
    if (!payload) return;
    e.preventDefault();
    const hint = this.computeHint(payload, e);
    this.hint = null;
    if (hint) this.actions?.drop(payload, hint, [...(e.dataTransfer?.files || [])]);
    setState({ dragging: null });
  }

  clearHint() {
    this.hint = null;
  }

  // ------------------------------------------------------------------ inline text editing

  startEdit(node) {
    if (this.editing) this.commitEdit();
    let el = node.closest('[data-sb-text],[data-sb-html]');
    let mode;
    let field = null;
    if (el) {
      mode = el.hasAttribute('data-sb-html') ? 'html' : 'text';
      field = this.field(el.getAttribute(mode === 'html' ? 'data-sb-html' : 'data-sb-text'));
    } else if (node.closest('[data-sar-section]') && !node.children.length && node.textContent.trim() && !node.hasAttribute('data-sb-part')) {
      el = node;
      mode = 'literal';
    } else {
      toast(node.hasAttribute('data-sb-part') || node.querySelector('[data-sb-text],[data-sb-html]') ? 'Double-click the text itself, or edit this element in the Content tab' : 'This element has no editable text', { ms: 2500 });
      return;
    }
    const original = el.innerHTML;
    if (mode === 'text' && /\{\{/.test(field.field?.raw || '')) el.textContent = field.field.raw; // edit {{brand.name}} references, not their output
    const start = mode === 'html' ? el.innerHTML : mode === 'text' ? field.field?.raw ?? el.innerText : el.textContent;
    el.setAttribute('contenteditable', mode === 'html' ? 'true' : 'plaintext-only');
    if (el.contentEditable !== 'plaintext-only' && mode !== 'html') el.setAttribute('contenteditable', 'true');
    el.setAttribute('data-sb-editing', '');
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.cancelEdit();
      } else if (e.key === 'Enter' && !e.shiftKey && mode !== 'html') {
        e.preventDefault();
        this.commitEdit();
      }
    };
    const onBlur = () => this.commitEdit();
    el.addEventListener('keydown', onKey);
    el.addEventListener('blur', onBlur);
    this.editing = { el, mode, field, original, start, cleanup: () => (el.removeEventListener('keydown', onKey), el.removeEventListener('blur', onBlur)) };
    this.setHover(null);
    el.focus();
    setState({ editingId: el.getAttribute('data-sb') || node.getAttribute('data-sb') });
  }

  endEdit() {
    const ed = this.editing;
    this.editing = null;
    ed.cleanup();
    ed.el.removeAttribute('contenteditable');
    ed.el.removeAttribute('data-sb-editing');
    setState({ editingId: null });
    return ed;
  }

  cancelEdit() {
    if (!this.editing) return;
    const ed = this.endEdit();
    ed.el.innerHTML = ed.original;
  }

  commitEdit() {
    if (!this.editing) return;
    const ed = this.endEdit();
    const value = ed.mode === 'html' ? ed.el.innerHTML : ed.el.innerText.replace(/\n$/, '');
    if (value === ed.start) {
      ed.el.innerHTML = ed.original;
      return;
    }
    const f = ed.field?.field;
    const reload = ed.mode !== 'literal' && (f.kind === 'brand' || /\{\{/.test(value) || /\{\{/.test(ed.start) || this.fieldIsRepeated(f));
    if (f && !reload) f.raw = value;
    this.actions?.commitText({ mode: ed.mode, field: f, id: ed.el.getAttribute('data-sb'), value, reload });
  }
}

export const preview = new Preview();
// Handle for tests and debugging in the browser console.
if (typeof window !== 'undefined') window.__sbEditor = preview;
