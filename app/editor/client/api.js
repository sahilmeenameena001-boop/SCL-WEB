// JSON API of app/editor/server/routes.mjs. Writes carry the X-SB-Editor header (CSRF guard).

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, { json, body, query, keepalive = false } = {}) {
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const headers = { 'X-SB-Editor': '1' };
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api/editor/${path}${qs}`, {
    method,
    credentials: 'same-origin',
    headers,
    keepalive,
    body: json !== undefined ? JSON.stringify(json) : body,
  });
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok) throw new ApiError(data?.error || `${res.status} ${res.statusText}`, res.status);
  return data;
}

const P = (id, sub = '') => `projects/${encodeURIComponent(id)}${sub ? `/${sub}` : ''}`;

export const api = {
  sources: () => request('GET', 'sources'),
  projects: () => request('GET', 'projects'),
  createProject: (body) => request('POST', 'projects', { json: body }),
  importZip: (file, name) => request('POST', 'projects/import', { body: file, query: { name } }),
  project: (id) => request('GET', P(id)),
  renameProject: (id, name) => request('PATCH', P(id), { json: { name } }),
  deleteProject: (id) => request('DELETE', P(id)),
  ops: (id, ops, label, opts = {}) => request('POST', P(id, 'ops'), { json: { ops, label }, keepalive: !!opts.keepalive }),
  undo: (id) => request('POST', P(id, 'undo')),
  redo: (id) => request('POST', P(id, 'redo')),
  sectionSource: (id, page, section) => request('GET', P(id, 'section-source'), { query: { page, section } }),
  assets: (id) => request('GET', P(id, 'assets')),
  upload: (id, file) => request('POST', P(id, 'assets'), { body: file, query: { name: file.name } }),
  build: (id) => request('POST', P(id, 'build')),
  exportUrl: (id, kind) => `/api/editor/${P(id, 'export')}?kind=${kind}`,
  previewUrl: (id, route = '') => `/editor-preview/${encodeURIComponent(id)}/${route}`,
  assetUrl: (id, path) => `/editor-preview/${encodeURIComponent(id)}${path}`,
};
