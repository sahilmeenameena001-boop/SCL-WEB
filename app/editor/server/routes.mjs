// HTTP routes for the visual editor, mounted by app/server.mjs.
//   /editor/                       editor UI (static, app/editor/public)
//   /editor-preview/<project>/...  instrumented live preview + site assets
//   /sites/<project>/...           last built site (dist/)
//   /api/editor/...                JSON API
// No login: writes from the editor UI carry X-SB-Editor; writes sent by another website (a
// cross-origin Origin header without that header) are refused; server-to-server calls are allowed.
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { ProjectStore } from './project-store.mjs';
import { applyOps, BLOCK_LIST, ELEMENT_LIST } from './ops.mjs';
import { renderEditorPage, findPage, brandCssFor } from './preview.mjs';
import { createBlankSite, seedBlankSite } from './starter.mjs';
import { buildSite, listPages, loadSite } from '../../processing/template-runtime/build.mjs';
import { interpolate } from '../../processing/template-runtime/lib/engine.mjs';
import { EditError } from './site-model.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, '../public');
const ROOT = resolve(HERE, '../../..');

export const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};
const UPLOAD_TYPES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico', '.mp4', '.webm', '.woff', '.woff2', '.ttf', '.otf']);
const ASSET_KINDS = { image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico'], video: ['.mp4', '.webm'], font: ['.woff', '.woff2', '.ttf', '.otf'] };
const kindOf = (ext) => Object.entries(ASSET_KINDS).find(([, l]) => l.includes(ext))?.[0];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(data));
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'body too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function readJson(req, limit = 5_000_000) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid JSON');
  }
}

function serveFile(res, file, extra = {}) {
  const ext = extname(file).toLowerCase();
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra };
  // Uploaded SVGs may contain script: never let them run when opened directly.
  if (ext === '.svg') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  headers['Content-Length'] = statSync(file).size;
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}

function safeJoin(base, rel) {
  const file = normalize(join(base, rel));
  if (file !== base && !file.startsWith(base + sep)) throw new HttpError(403, 'forbidden');
  return file;
}

function listAssets(site) {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else {
        const kind = kindOf(extname(f).toLowerCase());
        if (!kind) continue;
        const rel = relative(site, p).split(sep).join('/');
        out.push({ path: `/${rel}`, name: f, kind, size: st.size, uploaded: rel.startsWith('assets/uploads/'), library: rel.startsWith('assets/sb/'), mtime: st.mtimeMs });
      }
    }
  };
  walk(join(site, 'assets'));
  return out.sort((a, b) => Number(b.uploaded) - Number(a.uploaded) || b.mtime - a.mtime || a.path.localeCompare(b.path));
}

export function projectState(store, id) {
  const site = store.siteDir(id);
  const { config, design, shared } = loadSite(site);
  const pages = listPages(site).map((p) => {
    let content = {};
    try {
      content = JSON.parse(readFileSync(join(site, 'content/pages', `${p.id}.json`), 'utf8'));
    } catch {}
    const layout = readFileSync(join(site, p.layout), 'utf8');
    const order = [...layout.matchAll(/\{\{@section\s+([^}\s]+)\s*\}\}/g)].map((m) => m[1]);
    const rank = new Map(order.map((s, i) => [s, i]));
    return {
      id: p.id,
      route: p.route,
      title: interpolate(content.page?.title || p.id, config),
      rawTitle: content.page?.title || '',
      description: content.page?.description || '',
      sections: p.sections
        .filter((s) => rank.has(s.id))
        .sort((a, b) => rank.get(a.id) - rank.get(b.id))
        .map((s) => ({ id: s.id, localId: s.localId, type: s.type, component: s.component, shared: s.content !== 'page' })),
    };
  });
  return {
    project: store.meta(id),
    pages,
    config,
    design,
    sharedKeys: Object.keys(shared || {}),
    assets: listAssets(site),
    history: store.historyState(id),
    blocks: BLOCK_LIST,
    elements: ELEMENT_LIST,
    built: existsSync(join(site, 'dist/index.html')) || existsSync(join(site, 'dist')),
  };
}

function zipDir(dir, filter = () => true) {
  const files = {};
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      const rel = relative(dir, p).split(sep).join('/');
      if (!filter(rel)) continue;
      if (statSync(p).isDirectory()) walk(p);
      else files[rel] = new Uint8Array(readFileSync(p));
    }
  };
  walk(dir);
  return Buffer.from(zipSync(files, { level: 6 }));
}

export function createEditorRoutes({ config, jobStore, log = console.log }) {
  const store = new ProjectStore(config.dataDir);

  const requireWrite = (req) => {
    if (req.headers['x-sb-editor'] === '1') return; // browsers cannot add this header cross-origin without a CORS preflight we never answer
    const origin = req.headers.origin;
    if (origin && origin !== config.publicOrigin) throw new HttpError(403, `requests from ${origin} are not allowed`);
  };

  const editorUrl = (projectId) => `${config.publicOrigin}/editor/${projectId ? `#project=${encodeURIComponent(projectId)}` : ''}`;

  async function api(req, res, parts) {
    const m = req.method;
    // POST /api/editor/launch { projectId? } -> editor URL for a dashboard link
    if (m === 'POST' && parts[0] === 'launch') {
      const body = await readJson(req);
      return sendJson(res, 200, { url: editorUrl(body.projectId) });
    }

    if (parts[0] === 'sources' && m === 'GET') {
      const jobs = (jobStore?.list() || [])
        .filter((j) => j.exportFile && existsSync(j.exportFile))
        .map((j) => ({ jobId: j.jobId, url: j.url, status: j.status, createdAt: j.createdAt }));
      const demo = existsSync(join(ROOT, 'exports/demo/website-template/template/site.config.json'));
      return sendJson(res, 200, { jobs, demo });
    }

    if (parts[0] !== 'projects') throw new HttpError(404, 'not found');

    if (parts.length === 1 && m === 'GET') return sendJson(res, 200, { projects: store.list() });
    if (parts.length === 1 && m === 'POST') {
      requireWrite(req);
      const body = await readJson(req);
      let id;
      if (body.from === 'blank') {
        id = createBlankSite(store, { name: body.name || 'New site' });
        await seedBlankSite(store, id);
      }
      else if (body.from === 'demo') id = store.createFromDir(join(ROOT, 'exports/demo/website-template/template'), { name: body.name || 'Demo template', source: 'demo' });
      else if (body.from === 'job') {
        const job = jobStore?.get(String(body.jobId || ''));
        if (!job?.exportFile || !existsSync(job.exportFile)) throw new HttpError(404, 'job export not found');
        id = store.createFromZip(readFileSync(job.exportFile), { name: body.name || new URL(job.url).hostname, source: { jobId: job.jobId, url: job.url } });
      } else throw new HttpError(400, 'from must be blank, demo or job');
      return sendJson(res, 201, { id, project: store.meta(id) });
    }
    if (parts[1] === 'import' && m === 'POST') {
      requireWrite(req);
      const buf = await readBody(req, 500_000_000);
      const name = new URL(req.url, 'http://x').searchParams.get('name') || 'Imported site';
      const id = store.createFromZip(buf, { name, source: 'zip' });
      return sendJson(res, 201, { id, project: store.meta(id) });
    }

    const id = parts[1];
    store.check(id);
    const sub = parts[2];

    if (!sub && m === 'GET') return sendJson(res, 200, projectState(store, id));
    if (!sub && m === 'DELETE') {
      requireWrite(req);
      store.remove(id);
      return sendJson(res, 200, { ok: true });
    }
    if (!sub && m === 'PATCH') {
      requireWrite(req);
      const body = await readJson(req);
      return sendJson(res, 200, { project: store.rename(id, body.name) });
    }
    if (sub === 'ops' && m === 'POST') {
      requireWrite(req);
      const body = await readJson(req);
      const { result, changed } = await applyOps(store, id, body.ops, String(body.label || 'Edit').slice(0, 80));
      return sendJson(res, 200, { results: result, changed, state: body.state === false ? undefined : projectState(store, id) });
    }
    if ((sub === 'undo' || sub === 'redo') && m === 'POST') {
      requireWrite(req);
      const r = await store[sub](id);
      return sendJson(res, 200, { ...r, state: projectState(store, id) });
    }
    if (sub === 'section-source' && m === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams;
      const site = store.siteDir(id);
      const page = findPage(site, q.get('page'));
      const s = page?.sections.find((x) => x.id === q.get('section'));
      if (!s) throw new HttpError(404, 'unknown section');
      return sendJson(res, 200, { html: readFileSync(safeJoin(site, `components/${s.component}.html`), 'utf8'), shared: s.content !== 'page', component: s.component });
    }
    if (sub === 'assets' && m === 'GET') return sendJson(res, 200, { assets: listAssets(store.siteDir(id)) });
    if (sub === 'assets' && m === 'POST') {
      requireWrite(req);
      const q = new URL(req.url, 'http://x').searchParams;
      const original = String(q.get('name') || 'upload').split(/[\\/]/).pop();
      const ext = extname(original).toLowerCase();
      if (!UPLOAD_TYPES.has(ext)) throw new HttpError(400, `file type ${ext || '(none)'} is not supported`);
      const buf = await readBody(req, 60_000_000);
      if (!buf.length) throw new HttpError(400, 'empty file');
      const base = original.slice(0, -ext.length).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'file';
      const dir = join(store.siteDir(id), 'assets/uploads');
      mkdirSync(dir, { recursive: true });
      let name = `${base}${ext}`;
      for (let i = 2; existsSync(join(dir, name)); i++) name = `${base}-${i}${ext}`;
      writeFileSync(join(dir, name), buf);
      store.touch(id);
      return sendJson(res, 201, { asset: { path: `/assets/uploads/${name}`, name, kind: kindOf(ext), size: buf.length, uploaded: true } });
    }
    if (sub === 'build' && m === 'POST') {
      requireWrite(req);
      const r = buildSite({ root: store.siteDir(id) });
      return sendJson(res, 200, { pages: r.pages, url: `/sites/${id}/` });
    }
    if (sub === 'export' && m === 'GET') {
      const kind = new URL(req.url, 'http://x').searchParams.get('kind') === 'site' ? 'site' : 'template';
      const site = store.siteDir(id);
      buildSite({ root: site });
      const buf = kind === 'site' ? zipDir(join(site, 'dist')) : zipDir(site, (rel) => !rel.startsWith('dist') && !rel.startsWith('node_modules'));
      const name = `${store.meta(id).name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site'}-${kind}.zip`;
      res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': buf.length, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
      return res.end(buf);
    }
    throw new HttpError(404, 'not found');
  }

  function preview(req, res, parts) {
    const id = parts[0];
    const site = store.siteDir(id);
    const rel = decodeURIComponent(parts.slice(1).join('/'));
    if (rel === 'brand/brand.css') {
      res.writeHead(200, { 'Content-Type': TYPES['.css'], 'Cache-Control': 'no-store' });
      return res.end(brandCssFor(site));
    }
    if (!rel || rel.endsWith('/') || rel.endsWith('.html') || !extname(rel)) {
      const page = findPage(site, rel);
      if (!page) throw new HttpError(404, 'page not found');
      const html = renderEditorPage(site, page);
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(html);
    }
    if (!/^(assets|runtime)\//.test(rel) && rel !== 'favicon.ico') throw new HttpError(404, 'not found');
    const file = rel === 'favicon.ico' ? null : safeJoin(site, rel);
    if (!file || !existsSync(file) || statSync(file).isDirectory()) throw new HttpError(404, 'not found');
    serveFile(res, file);
  }

  function built(req, res, parts) {
    const dist = join(store.siteDir(parts[0]), 'dist');
    let file = safeJoin(dist, decodeURIComponent(parts.slice(1).join('/')));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) throw new HttpError(404, 'not built yet (use Publish)');
    serveFile(res, file, { 'Referrer-Policy': 'no-referrer' });
  }

  function ui(req, res, rest) {
    const file = rest ? safeJoin(PUBLIC, rest) : join(PUBLIC, 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) {
      if (!existsSync(join(PUBLIC, 'index.html'))) throw new HttpError(500, 'editor UI not built: run `npm run build:editor`');
      return serveFile(res, join(PUBLIC, 'index.html'));
    }
    serveFile(res, file);
  }

  /** Returns true when the request was handled. */
  async function handle(req, res, url) {
    const p = url.pathname;
    try {
      if (p === '/editor') {
        res.writeHead(302, { Location: '/editor/' });
        res.end();
        return true;
      }
      if (p.startsWith('/editor/')) return ui(req, res, decodeURIComponent(p.slice('/editor/'.length))), true;
      if (p.startsWith('/editor-preview/')) return preview(req, res, p.slice('/editor-preview/'.length).split('/')), true;
      if (p.startsWith('/sites/')) return built(req, res, p.slice('/sites/'.length).split('/')), true;
      if (p.startsWith('/api/editor/')) return await api(req, res, p.slice('/api/editor/'.length).split('/').filter(Boolean)), true;
    } catch (e) {
      const status = e instanceof HttpError || e instanceof EditError ? e.status : 500;
      if (status === 500) log('[editor] error', e);
      if (!res.headersSent) sendJson(res, status, { error: e.message });
      else res.destroy();
      return true;
    }
    return false;
  }

  return { handle, store, editorUrl };
}
