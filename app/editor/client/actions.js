// Editor actions: every change goes through the server's operations API (one undo step per call),
// serialised in one queue. Style and animation changes are applied to the preview at once and
// committed shortly after (debounced), so dragging a slider does not create hundreds of undo steps.
import { api } from './api.js';
import { getState, setState, toast, currentPage } from './store.js';
import { preview } from './lib/bridge.js';
import { applyDesignPatch, combinePatches } from './lib/patch.js';
import { assetDropAction } from './lib/drop.js';

let queue = Promise.resolve();
const enqueue = (fn) => {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
};

async function busy(fn) {
  setState((s) => ({ busy: s.busy + 1 }));
  try {
    return await fn();
  } finally {
    setState((s) => ({ busy: s.busy - 1 }));
  }
}

// ---------------------------------------------------------------------------------------------
// session and projects

export async function boot() {
  const project = new URLSearchParams(location.hash.slice(1)).get('project');
  if (project) await openProject(project).catch(() => loadProjects());
  else await loadProjects();
  setState({ ready: true });
}

export async function loadProjects() {
  const [{ projects }, sources] = await Promise.all([api.projects(), api.sources().catch(() => ({ jobs: [], demo: false }))]);
  setState({ projects, sources });
}

export async function createProject(body) {
  return busy(async () => {
    try {
      const { id } = await api.createProject(body);
      await openProject(id);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  });
}

export async function importProject(file) {
  return busy(async () => {
    try {
      const { id } = await api.importZip(file, file.name.replace(/\.zip$/i, ''));
      await openProject(id);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  });
}

export async function deleteProject(id) {
  await api.deleteProject(id);
  await loadProjects();
}

export async function openProject(id) {
  const data = await api.project(id);
  const home = data.pages.find((p) => p.route === 'index.html') || data.pages[0];
  setState({ projectId: id, data, pageId: home?.id || null, selectedId: null, selectedIndex: 0, hoverId: null, modal: null });
  history.replaceState(null, '', `${location.pathname}#project=${encodeURIComponent(id)}`);
}

export async function closeProject() {
  await flushDesign();
  setState({ projectId: null, data: null, pageId: null, selectedId: null });
  history.replaceState(null, '', location.pathname);
  await loadProjects();
}

export async function renameProject(name) {
  const { projectId, data } = getState();
  const { project } = await api.renameProject(projectId, name);
  setState({ data: { ...data, project } });
}

// ---------------------------------------------------------------------------------------------
// operations

/** Server state with local (not yet committed) design changes re-applied on top. */
function applyServerState(data) {
  let design = data.design;
  for (const p of pendingDesign.values()) design = applyDesignPatch(design, p);
  const next = { ...data, design };
  const s = getState();
  const pageId = next.pages.some((p) => p.id === s.pageId) ? s.pageId : next.pages[0]?.id || null;
  setState({ data: next, pageId });
  return next;
}

/**
 * Apply operations as one undo step.
 * @param {object} opts reload: re-render the preview (default true); select: select the element id
 *   returned by the operation; reveal: scroll it into view.
 */
export async function runOps(ops, label, { reload = true, select = false } = {}) {
  await flushDesign();
  return enqueue(() =>
    busy(async () => {
      const { projectId } = getState();
      try {
        const r = await api.ops(projectId, ops, label);
        const data = applyServerState(r.state);
        const newId = select ? r.results.find((x) => x?.id)?.id : null;
        if (newId) {
          setState({ selectedId: newId, selectedIndex: 0 });
          preview.pendingReveal = newId;
        }
        if (reload) preview.reload();
        else {
          preview.applyDesign(data.design);
          setState((s) => ({ previewVersion: s.previewVersion + 1 })); // refresh Layers/inspector from the live DOM
        }
        return r;
      } catch (e) {
        toast(e.message, { kind: 'error' });
        if (reload) preview.reload();
        return null;
      }
    }),
  );
}

const pendingDesign = new Map(); // element id | '$site' -> { id, patch } | { site }
let designTimer = null;
let designLabel = 'Style';

/** Change design.json: instant in the preview, committed after a short pause. */
export function updateDesign({ id, patch, site }, label = 'Style', { delay = 450 } = {}) {
  const s = getState();
  const design = applyDesignPatch(s.data.design, { id, patch, site });
  setState({ data: { ...s.data, design } });
  preview.applyDesign(design);
  const key = id || '$site';
  const prev = pendingDesign.get(key);
  pendingDesign.set(key, id ? { id, patch: prev ? combinePatches(prev.patch, patch) : patch } : { site: prev ? combinePatches(prev.site, site) : site });
  designLabel = label;
  clearTimeout(designTimer);
  designTimer = setTimeout(flushDesign, delay);
}

export async function flushDesign({ keepalive = false } = {}) {
  clearTimeout(designTimer);
  if (!pendingDesign.size) return;
  const ops = [...pendingDesign.values()].map((p) => ({ op: 'setDesign', ...p }));
  pendingDesign.clear();
  const label = designLabel;
  const { projectId } = getState();
  if (keepalive) return api.ops(projectId, ops, label, { keepalive: true }).catch(() => {});
  return enqueue(async () => {
    try {
      const r = await api.ops(projectId, ops, label);
      applyServerState(r.state);
    } catch (e) {
      toast(`Could not save: ${e.message}`, { kind: 'error' });
      const data = applyServerState(await api.project(projectId));
      preview.applyDesign(data.design);
    }
  });
}

export async function undo() {
  return step('undo');
}

export async function redo() {
  return step('redo');
}

async function step(dir) {
  if (preview.editing) preview.commitEdit();
  await flushDesign();
  return enqueue(() =>
    busy(async () => {
      try {
        const r = await api[dir](getState().projectId);
        applyServerState(r.state);
        if (!r.label) return toast(dir === 'undo' ? 'Nothing to undo' : 'Nothing to redo', { ms: 1500 });
        preview.reload();
        toast(`${dir === 'undo' ? 'Undone' : 'Redone'}: ${r.label}`, { ms: 1800 });
      } catch (e) {
        toast(e.message, { kind: 'error' });
      }
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// selection and editing

export function selectNode(node) {
  if (preview.editing && !preview.editing.el.contains(node)) preview.commitEdit();
  preview.selectedNode = node || null;
  const id = node?.getAttribute('data-sb') || null;
  setState({ selectedId: id, selectedIndex: id ? Math.max(0, preview.nodes(id).indexOf(node)) : 0 });
}

export function selectById(id, index = 0, { reveal = true } = {}) {
  const node = preview.node(id, index);
  selectNode(node);
  if (node && reveal) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export function selectParent() {
  const n = preview.selectedNode?.parentElement?.closest('[data-sb]');
  if (n && n.tagName !== 'BODY') selectNode(n);
}

const fieldRef = (f) => ({ kind: f.kind, path: f.path, sectionId: f.sectionId });

export function setField(field, value, { reload = true, label = 'Edit content' } = {}) {
  return runOps([{ op: 'setField', page: getState().pageId, field: fieldRef(field), value }], label, { reload });
}

function commitText({ mode, field, id, value, reload }) {
  const page = getState().pageId;
  const op = mode === 'literal' ? { op: 'setText', page, id, text: value } : { op: 'setField', page, field: fieldRef(field), value };
  return runOps([op], 'Edit text', { reload });
}

function commitFree(id, pos) {
  updateDesign({ id, patch: { free: pos } }, 'Move element', { delay: 0 });
}

/** Delete the selection: a list item, a section or an element. */
export function deleteSelected() {
  const info = preview.describe(preview.selectedNode);
  if (!info) return;
  const page = getState().pageId;
  selectNode(null);
  if (info.item?.isRoot) return runOps([{ op: 'listItem', page, sectionId: info.item.sectionId, listPath: info.item.listPath, index: info.item.index, action: 'delete' }], 'Delete item');
  if (info.isSection) return runOps([{ op: 'deleteSection', page, sectionId: info.sectionId }], 'Delete section');
  if (['body', 'main', 'html'].includes(info.tag)) return toast('This element is part of the page layout');
  return runOps([{ op: 'deleteElement', page, id: info.id }], 'Delete element');
}

export function duplicateSelected() {
  const info = preview.describe(preview.selectedNode);
  if (!info) return;
  const page = getState().pageId;
  if (info.item?.isRoot) return runOps([{ op: 'listItem', page, sectionId: info.item.sectionId, listPath: info.item.listPath, index: info.item.index, action: 'duplicate' }], 'Duplicate item');
  if (info.isSection) return runOps([{ op: 'duplicateSection', page, sectionId: info.sectionId }], 'Duplicate section', { select: true });
  return runOps([{ op: 'duplicateElement', page, id: info.id }], 'Duplicate element', { select: true });
}

export function moveSection(sectionId, delta) {
  const page = currentPage();
  const order = page.sections.map((s) => s.id);
  const i = order.indexOf(sectionId);
  const to = i + delta;
  if (i < 0 || to < 0 || to >= order.length) return;
  return runOps([{ op: 'moveSection', page: page.id, sectionId, toIndex: to }], 'Move section');
}

export function moveListItem(item, delta) {
  return runOps([{ op: 'listItem', page: getState().pageId, sectionId: item.sectionId, listPath: item.listPath, index: item.index, action: 'move', to: item.index + delta }], 'Move item');
}

/** Click on an Add-panel entry: insert next to the selection (or at the end of the page). */
export function addBlock(block) {
  const page = currentPage();
  const info = preview.describe(preview.selectedNode);
  const main = page.sections.filter((s) => !['navigation', 'footer'].includes(s.type));
  const after = info?.sectionId || main.at(-1)?.id || page.sections.find((s) => s.type === 'navigation')?.id || null;
  return runOps([{ op: 'addSection', page: page.id, block, after }], 'Add section', { select: true });
}

export function addElement(kind) {
  const info = preview.describe(preview.selectedNode);
  if (!info?.sectionId) return toast('Select a section or an element first, or drag the element onto the page', { ms: 3000 });
  const position = info.isSection ? 'append' : 'after';
  return runOps([{ op: 'insertElement', page: getState().pageId, target: info.id, position, kind }], 'Add element', { select: true });
}

async function drop(payload, hint, files) {
  const page = getState().pageId;
  if (payload.type === 'block') return runOps([{ op: 'addSection', page, block: payload.id, after: hint.after }], 'Add section', { select: true });
  if (payload.type === 'element') return runOps([{ op: 'insertElement', page, target: hint.targetId, position: hint.position, kind: payload.kind }], 'Add element', { select: true });
  let asset = payload.asset;
  if (payload.type === 'files') {
    [asset] = await uploadFiles(files);
    if (!asset) return;
  }
  const action = assetDropAction(page, asset, hint.info);
  if (!action) return toast('Drop images on an image or a section', { ms: 2500 });
  if (action.kind === 'background') {
    const [{ id, patch }] = action.ops;
    return updateDesign({ id, patch }, action.label, { delay: 0 });
  }
  return runOps(action.ops, action.label, { select: action.kind === 'insert' });
}

export async function uploadFiles(files) {
  const { projectId } = getState();
  const out = [];
  await busy(async () => {
    for (const f of files) {
      try {
        out.push((await api.upload(projectId, f)).asset);
      } catch (e) {
        toast(`${f.name}: ${e.message}`, { kind: 'error' });
      }
    }
    if (out.length) {
      const { assets } = await api.assets(projectId);
      setState((s) => ({ data: { ...s.data, assets } }));
      toast(`Uploaded ${out.length} file${out.length > 1 ? 's' : ''}`, { ms: 1800 });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// pages, theme, publishing

export async function setPage(pageId) {
  if (preview.editing) preview.commitEdit();
  await flushDesign();
  setState({ pageId, selectedId: null, selectedIndex: 0 });
}

export async function setConfig(path, value, { reload = true, label = 'Theme' } = {}) {
  const r = await runOps([{ op: 'setConfig', path, value }], label, { reload });
  if (r && !reload) preview.refreshBrandCss();
  return r;
}

const configTimers = new Map();
/** Theme colours: CSS variable updated live, saved after a pause. */
export function setColorLive(key, value) {
  preview.setCssVar(`--sar-color-${key}`, value);
  clearTimeout(configTimers.get(key));
  configTimers.set(
    key,
    setTimeout(() => setConfig(`colors.${key}.value`, value, { reload: false, label: 'Theme colour' }), 500),
  );
}

export async function publish() {
  if (preview.editing) preview.commitEdit();
  await flushDesign();
  return busy(async () => {
    try {
      const { projectId } = getState();
      const r = await api.build(projectId);
      const data = await api.project(projectId);
      applyServerState(data);
      toast(`Published ${r.pages.length} page${r.pages.length > 1 ? 's' : ''}`, { kind: 'success', ms: 6000, action: { label: 'Open site', href: r.url } });
      return r;
    } catch (e) {
      toast(`Publish failed: ${e.message}`, { kind: 'error' });
    }
  });
}

export async function exportZip(kind) {
  await flushDesign();
  const a = document.createElement('a');
  a.href = api.exportUrl(getState().projectId, kind);
  a.download = '';
  document.body.append(a);
  a.click();
  a.remove();
}

// ---------------------------------------------------------------------------------------------
// keyboard (parent window and preview document)

export function handleKey(e) {
  const t = e.target;
  const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (!getState().projectId || getState().modal) return;
  if (mod && key === 'z' && !typing) {
    e.preventDefault();
    return e.shiftKey ? redo() : undo();
  }
  if (mod && key === 'y' && !typing) {
    e.preventDefault();
    return redo();
  }
  if (typing) return;
  if (mod && key === 'd' && preview.selectedNode) {
    e.preventDefault();
    return duplicateSelected();
  }
  if ((key === 'delete' || key === 'backspace') && preview.selectedNode) {
    e.preventDefault();
    return deleteSelected();
  }
  if (key === 'escape') {
    if (preview.selectedNode?.parentElement?.closest('[data-sb]') && !preview.selectedNode.hasAttribute('data-sar-section')) selectParent();
    else selectNode(null);
  }
  if (key === 'enter' && preview.selectedNode) {
    e.preventDefault();
    preview.startEdit(preview.selectedNode);
  }
}

preview.actions = { select: selectNode, commitText, drop, commitFree, handleKey };

addEventListener('pagehide', () => flushDesign({ keepalive: true }));
