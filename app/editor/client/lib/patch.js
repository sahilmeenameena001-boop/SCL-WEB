// JSON helpers shared by the editor UI (mirrors the server's merge semantics in site-model.mjs).

export const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function getPath(obj, path) {
  if (!path) return obj;
  let cur = obj;
  for (const key of String(path).split('.')) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

/** Deep merge where `null` in the patch deletes the key and emptied objects are dropped. */
export function mergePatch(base, patch) {
  if (patch === null) return undefined;
  if (!isObj(patch) || !isObj(base)) return clone(patch);
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const merged = mergePatch(base[k], v);
    if (merged === undefined || (isObj(merged) && !Object.keys(merged).length)) delete out[k];
    else out[k] = merged;
  }
  return out;
}

/** Combine two pending patches into one (later wins, `null` deletions are kept). */
export function combinePatches(a, b) {
  if (!isObj(a) || !isObj(b)) return clone(b);
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in a ? combinePatches(a[k], v) : clone(v);
  return out;
}

/** The server's setDesign operation, applied locally for instant feedback. */
export function applyDesignPatch(design, { id, patch, site }) {
  const d = clone(design || {}) || {};
  d.version = d.version || 1;
  d.elements = d.elements || {};
  if (site) d.site = mergePatch(d.site || {}, site) || {};
  if (id) {
    const next = mergePatch(d.elements[id] || {}, patch ?? null);
    if (next && Object.keys(next).length) d.elements[id] = next;
    else delete d.elements[id];
  }
  return d;
}

/** Nested object for a dotted path: path("a.b", 1) -> { a: { b: 1 } }. */
export function nest(path, value) {
  return String(path)
    .split('.')
    .reduceRight((acc, k) => ({ [k]: acc }), value);
}
