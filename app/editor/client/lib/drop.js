// Pure decisions behind drag and drop in the preview: what an asset, section block or element does
// when dropped on a target, and free-position geometry. `info` is an element description produced
// by describeElement() in bridge.js.

const fieldRef = (f) => ({ kind: f.kind, path: f.path, sectionId: f.sectionId });

/** Site-root asset path as a literal attribute value (the template engine makes {{@root}} page-relative). */
export const literalUrl = (path) => (String(path).startsWith('/') ? `{{@root}}${String(path).slice(1)}` : String(path));

function replaceMedia(page, info, path) {
  const ops = [];
  if (info.attrs.src) ops.push({ op: 'setField', page, field: fieldRef(info.attrs.src.field), value: path });
  else ops.push({ op: 'setAttr', page, id: info.id, name: 'src', value: literalUrl(path) });
  // A srcset would keep showing the old image.
  if (info.attrs.srcset) ops.push({ op: 'setField', page, field: fieldRef(info.attrs.srcset.field), value: '' });
  else if (info.literalAttrs.srcset != null) ops.push({ op: 'setAttr', page, id: info.id, name: 'srcset', value: null });
  return ops;
}

/**
 * @returns {{ ops: object[], label: string, kind: 'replace'|'background'|'insert' } | null}
 */
export function assetDropAction(page, asset, info) {
  if (!asset || !info) return null;
  if (asset.kind === 'image') {
    if (info.tag === 'img') return { ops: replaceMedia(page, info, asset.path), label: 'Replace image', kind: 'replace' };
    if (info.sectionRootId) {
      return {
        ops: [{ op: 'setDesign', id: info.sectionRootId, patch: { bg: { type: 'image', image: asset.path, size: 'cover', position: 'center' } } }],
        label: 'Section background',
        kind: 'background',
      };
    }
    return null;
  }
  if (asset.kind === 'video') {
    if (info.tag === 'video') return { ops: replaceMedia(page, info, asset.path), label: 'Replace video', kind: 'replace' };
    if (info.sectionId) return { ops: [{ op: 'insertElement', page, target: info.id, position: 'after', kind: 'video', props: { src: asset.path } }], label: 'Add video', kind: 'insert' };
  }
  return null;
}

/** Short description shown on the drop indicator. */
export function assetDropHint(asset, info) {
  const a = assetDropAction('x', asset, info);
  if (!a) return null;
  return a.kind === 'replace' ? (asset.kind === 'video' ? 'Replace video' : 'Replace image') : a.kind === 'background' ? 'Set section background' : 'Insert video';
}

/** before/after (or prepend/append for containers) from the pointer position over a rect. */
export function placement(rect, y, { container = false } = {}) {
  const before = y < rect.top + rect.height / 2;
  if (container) return before ? 'prepend' : 'append';
  return before ? 'before' : 'after';
}

/** `after` argument of addSection for a drop before/after a section in the page's section order. */
export function sectionInsertAfter(order, sectionId, before) {
  const i = order.indexOf(sectionId);
  if (i < 0) return order.length ? order[order.length - 1] : null;
  if (!before) return sectionId;
  return i > 0 ? order[i - 1] : null;
}

/** Target index for moveSection when a section is dropped before/after another one. */
export function sectionMoveIndex(order, movingId, targetId, before) {
  const rest = order.filter((s) => s !== movingId);
  const i = rest.indexOf(targetId);
  if (i < 0) return order.indexOf(movingId);
  return before ? i : i + 1;
}

const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * Free position (percentages of the containing block, as stored in design.json `free`).
 * @param {{left:number, top:number, width:number}} box element box in px relative to the container's padding box
 * @param {{width:number, height:number}} container
 */
export function freePosition(box, container) {
  const pct = (v, d) => (d > 0 ? round2((v / d) * 100) : 0);
  return {
    x: clamp(pct(box.left, container.width), -50, 150),
    y: clamp(pct(box.top, container.height), -50, 300),
    w: clamp(pct(box.width, container.width), 1, 100),
  };
}

/** Moving an element of a repeated list or the page structure freely is not supported. */
export function canFreeDrag(info) {
  if (!info) return false;
  if (info.isSection || ['body', 'main', 'html'].includes(info.tag)) return false;
  if (!info.sectionId || info.repeated) return false;
  return true;
}
