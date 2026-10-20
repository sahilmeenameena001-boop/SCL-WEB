// Global editor state (a tiny external store read with useSyncExternalStore).
import { useSyncExternalStore } from 'react';

const listeners = new Set();

let state = {
  ready: false,
  projects: null,
  sources: null,
  projectId: null,
  data: null, // projectState() from the server
  pageId: null,
  device: 'desktop',
  leftTab: 'layers',
  rightTab: 'content',
  selectedId: null,
  selectedIndex: 0, // which node when a repeated list renders the same data-sb id several times
  hoverId: null,
  editingId: null,
  previewVersion: 0, // bumps on every preview (re)load
  busy: 0,
  toasts: [],
  modal: null,
  dragging: null, // payload of a drag started in a panel
};

export const getState = () => state;

export function setState(patch) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  if (!next) return;
  let changed = false;
  for (const k in next) if (state[k] !== next[k]) changed = true;
  if (!changed) return;
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));

/** Selectors must return stable values (state fields or primitives). */
export const useStore = (selector) => useSyncExternalStore(subscribe, () => selector(state));

let toastSeq = 0;
export function toast(message, { kind = 'info', ms = 3500, action } = {}) {
  const id = ++toastSeq;
  setState((s) => ({ toasts: [...s.toasts, { id, message: String(message), kind, action }] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

export const currentPage = (s = state) => s.data?.pages.find((p) => p.id === s.pageId) || null;
