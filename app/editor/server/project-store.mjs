// Editor projects: each project is an editable copy of a website template in
// <dataDir>/sites/<projectId>/site, with metadata in project.json and an undo/redo history of
// file changes (in memory, per server process).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { assignIds, EditError } from './site-model.mjs';
import { emptyDesign } from '../../processing/template-runtime/lib/design.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const RUNTIME_DIR = resolve(HERE, '../../processing/template-runtime');
export const LIBRARY_DIR = resolve(HERE, '../library');
const PROJECT_ID = /^p_[a-z0-9]{8,24}$/;
const HISTORY_LIMIT = 200;

export class ProjectStore {
  constructor(dataDir) {
    this.root = join(dataDir, 'sites');
    mkdirSync(this.root, { recursive: true });
    this.history = new Map(); // id -> { undo: [], redo: [] }
    this.locks = new Map();
  }

  check(id) {
    if (!PROJECT_ID.test(String(id))) throw new EditError('invalid project id', 400);
    if (!existsSync(join(this.root, id, 'project.json'))) throw new EditError('unknown project', 404);
    return id;
  }

  siteDir(id) {
    return join(this.root, this.check(id), 'site');
  }

  meta(id) {
    return JSON.parse(readFileSync(join(this.root, this.check(id), 'project.json'), 'utf8'));
  }

  saveMeta(id, meta) {
    writeFileSync(join(this.root, id, 'project.json'), JSON.stringify(meta, null, 2));
  }

  touch(id) {
    const m = this.meta(id);
    m.updatedAt = Date.now();
    this.saveMeta(id, m);
  }

  list() {
    return readdirSync(this.root)
      .filter((d) => PROJECT_ID.test(d) && existsSync(join(this.root, d, 'project.json')))
      .map((d) => {
        const m = JSON.parse(readFileSync(join(this.root, d, 'project.json'), 'utf8'));
        let pages = 0;
        try {
          pages = readdirSync(join(this.root, d, 'site/pages')).filter((f) => f.endsWith('.json')).length;
        } catch {}
        return { ...m, pages };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Create a project by copying a template directory (one that contains site.config.json + pages/). */
  createFromDir(templateDir, { name, source }) {
    if (!existsSync(join(templateDir, 'site.config.json')) || !existsSync(join(templateDir, 'pages'))) throw new EditError('not a website template (site.config.json and pages/ missing)');
    const id = `p_${randomBytes(8).toString('hex')}`;
    const site = join(this.root, id, 'site');
    mkdirSync(site, { recursive: true });
    cpSync(templateDir, site, { recursive: true, filter: (src) => !relative(templateDir, src).split(sep).includes('node_modules') && !/^dist(\\|\/|$)/.test(relative(templateDir, src)) });
    const now = Date.now();
    this.saveMeta(id, { id, name: String(name || 'Untitled site').slice(0, 120), source: source || null, createdAt: now, updatedAt: now });
    prepareSite(site);
    return id;
  }

  /** Create a project from a ZIP (an exported website template, or a zipped template/ folder). */
  createFromZip(buf, opts) {
    let files;
    try {
      files = unzipSync(new Uint8Array(buf));
    } catch {
      throw new EditError('not a valid ZIP file');
    }
    const tmp = mkdtempSync(join(tmpdir(), 'sb-import-'));
    try {
      for (const [name, data] of Object.entries(files)) {
        if (name.endsWith('/')) continue;
        const target = normalize(join(tmp, name));
        if (!target.startsWith(tmp + sep)) throw new EditError(`unsafe path in ZIP: ${name}`);
        if (name.split('/').includes('raw-capture') || name.split('/').includes('verification')) continue;
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, data);
      }
      const configs = Object.keys(files).filter((n) => /(^|\/)site\.config\.json$/.test(n) && !n.includes('dist/'));
      configs.sort((a, b) => a.length - b.length);
      if (!configs.length) throw new EditError('the ZIP does not contain a website template (site.config.json not found)');
      const dir = join(tmp, dirname(configs[0]));
      return this.createFromDir(dir, opts);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  remove(id) {
    this.check(id);
    rmSync(join(this.root, id), { recursive: true, force: true });
    this.history.delete(id);
  }

  rename(id, name) {
    const m = this.meta(id);
    m.name = String(name || '').slice(0, 120) || m.name;
    m.updatedAt = Date.now();
    this.saveMeta(id, m);
    return m;
  }

  hist(id) {
    if (!this.history.has(id)) this.history.set(id, { undo: [], redo: [] });
    return this.history.get(id);
  }

  historyState(id) {
    const h = this.hist(id);
    return { canUndo: h.undo.length > 0, canRedo: h.redo.length > 0, undoLabel: h.undo.at(-1)?.label || null, redoLabel: h.redo.at(-1)?.label || null };
  }

  /**
   * Run fn(tx) with file access recorded for undo. Files are written immediately; if fn throws,
   * every change is rolled back. Operations on one project are serialised.
   */
  async transaction(id, label, fn, { record = true } = {}) {
    const site = this.siteDir(id);
    const prev = this.locks.get(id) || Promise.resolve();
    let release;
    const mine = new Promise((r) => (release = r));
    this.locks.set(id, prev.then(() => mine));
    await prev;
    const changes = new Map(); // rel -> { before, after }
    const tx = new Tx(site, changes);
    try {
      const result = await fn(tx);
      if (changes.size && record) {
        const h = this.hist(id);
        h.undo.push({ label, changes: [...changes.entries()].map(([path, c]) => ({ path, ...c })) });
        if (h.undo.length > HISTORY_LIMIT) h.undo.shift();
        h.redo = [];
      }
      if (changes.size) this.touch(id);
      return { result, changed: [...changes.keys()] };
    } catch (e) {
      for (const [path, c] of changes) writeOrRemove(join(site, path), c.before);
      throw e;
    } finally {
      release();
    }
  }

  async undo(id) {
    return this.step(id, 'undo');
  }

  async redo(id) {
    return this.step(id, 'redo');
  }

  async step(id, dir) {
    const h = this.hist(id);
    const from = dir === 'undo' ? h.undo : h.redo;
    const to = dir === 'undo' ? h.redo : h.undo;
    const entry = from.pop();
    if (!entry) return { changed: [], label: null };
    const site = this.siteDir(id);
    for (const c of entry.changes) writeOrRemove(join(site, c.path), dir === 'undo' ? c.before : c.after);
    to.push(entry);
    this.touch(id);
    return { changed: entry.changes.map((c) => c.path), label: entry.label };
  }
}

function writeOrRemove(file, content) {
  if (content === null) rmSync(file, { force: true });
  else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

class Tx {
  constructor(site, changes) {
    this.site = site;
    this.changes = changes;
    this.cache = new Map();
  }

  abs(rel) {
    const file = normalize(join(this.site, rel));
    if (!file.startsWith(this.site + sep)) throw new EditError(`path outside the site: ${rel}`);
    return file;
  }

  exists(rel) {
    if (this.changes.has(rel)) return this.changes.get(rel).after !== null;
    return existsSync(this.abs(rel));
  }

  read(rel) {
    const file = this.abs(rel);
    if (!existsSync(file)) throw new EditError(`missing file ${rel}`, 404);
    return readFileSync(file, 'utf8');
  }

  readJson(rel, fallback) {
    if (fallback !== undefined && !this.exists(rel)) return fallback;
    return JSON.parse(this.read(rel));
  }

  write(rel, content) {
    const file = this.abs(rel);
    const before = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (before === content) return;
    if (!this.changes.has(rel)) this.changes.set(rel, { before, after: content });
    else this.changes.get(rel).after = content;
    writeOrRemove(file, content);
  }

  writeJson(rel, obj) {
    this.write(rel, `${JSON.stringify(obj, null, 2)}\n`);
  }

  remove(rel) {
    const file = this.abs(rel);
    if (!existsSync(file)) return;
    const before = readFileSync(file, 'utf8');
    if (!this.changes.has(rel)) this.changes.set(rel, { before, after: null });
    else this.changes.get(rel).after = null;
    rmSync(file, { force: true });
  }

  list(relDir) {
    const dir = this.abs(relDir);
    return existsSync(dir) ? readdirSync(dir) : [];
  }
}

// ---------------------------------------------------------------------------------------------

/** Bring a site's build tooling up to date and give every editable element a data-sb id. */
export function prepareSite(site) {
  // Tooling: engine, build, preview server, runtime (guard, animations, vendor libraries, block CSS).
  for (const f of ['build.mjs', 'serve.mjs', 'package.json']) cpSync(join(RUNTIME_DIR, f), join(site, f));
  cpSync(join(RUNTIME_DIR, 'lib'), join(site, 'lib'), { recursive: true });
  cpSync(join(RUNTIME_DIR, 'runtime'), join(site, 'runtime'), { recursive: true });
  mkdirSync(join(site, 'assets/sb'), { recursive: true });
  mkdirSync(join(site, 'assets/uploads'), { recursive: true });
  for (const f of readdirSync(join(LIBRARY_DIR, 'placeholders'))) {
    if (!existsSync(join(site, 'assets/sb', f))) cpSync(join(LIBRARY_DIR, 'placeholders', f), join(site, 'assets/sb', f));
  }
  if (!existsSync(join(site, 'design.json'))) writeFileSync(join(site, 'design.json'), `${JSON.stringify(emptyDesign(), null, 2)}\n`);

  const used = new Set();
  const files = [];
  const walkDir = (dir) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walkDir(p);
      else if (f.endsWith('.html')) files.push(p);
    }
  };
  walkDir(join(site, 'components'));
  const layouts = [];
  walkDir(join(site, 'layouts'));
  for (const f of files) if (f.startsWith(join(site, 'layouts'))) layouts.push(f);
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    const { html: out, changed } = assignIds(html, used, { onlyBody: layouts.includes(file) });
    if (changed) writeFileSync(file, out);
  }
}
