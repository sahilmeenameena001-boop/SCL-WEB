// Builds the visual editor UI into app/editor/public (served at /editor/ by app/server.mjs):
//   client/main.jsx   -> editor.js   (React, bundled by esbuild)
//   client/styles.css -> editor.css  (Tailwind CSS v4 CLI)
//   client/index.html -> index.html
// Usage: node app/editor/build.mjs [--out <dir>] [--dev]   (--dev: no minification, inline source maps)
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
export const CLIENT_DIR = join(HERE, 'client');
export const PUBLIC_DIR = join(HERE, 'public');
const TAILWIND_CLI = join(ROOT, 'node_modules/@tailwindcss/cli/dist/index.mjs');

export async function buildEditor({ outDir = PUBLIC_DIR, dev = false, log = () => {} } = {}) {
  const t0 = Date.now();
  mkdirSync(outDir, { recursive: true });

  await build({
    entryPoints: [join(CLIENT_DIR, 'main.jsx')],
    outfile: join(outDir, 'editor.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome111', 'firefox115', 'safari16.4'],
    jsx: 'automatic',
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
    legalComments: 'none',
    logLevel: 'silent',
  });

  if (!existsSync(TAILWIND_CLI)) throw new Error('Tailwind CSS CLI not found: run `npm install`');
  const css = spawnSync(process.execPath, [TAILWIND_CLI, '-i', join(CLIENT_DIR, 'styles.css'), '-o', join(outDir, 'editor.css'), ...(dev ? [] : ['--minify'])], {
    cwd: CLIENT_DIR,
    encoding: 'utf8',
  });
  if (css.status !== 0) throw new Error(`Tailwind CSS failed:\n${css.stderr || css.stdout}`);

  const hash = (f) => createHash('sha256').update(readFileSync(join(outDir, f))).digest('hex').slice(0, 10);
  const html = readFileSync(join(CLIENT_DIR, 'index.html'), 'utf8').replace('editor.css', `editor.css?v=${hash('editor.css')}`).replace('editor.js', `editor.js?v=${hash('editor.js')}`);
  writeFileSync(join(outDir, 'index.html'), html);
  log(`Editor UI built into ${outDir} in ${Date.now() - t0} ms`);
  return { outDir };
}

/** True when the built UI is missing or older than any client source file. */
export function editorBuildIsStale(outDir = PUBLIC_DIR) {
  const out = ['index.html', 'editor.js', 'editor.css'].map((f) => join(outDir, f));
  if (!out.every(existsSync)) return true;
  const built = Math.min(...out.map((f) => statSync(f).mtimeMs));
  const newest = (dir) =>
    readdirSync(dir).reduce((m, f) => {
      const p = join(dir, f);
      const st = statSync(p);
      return Math.max(m, st.isDirectory() ? newest(p) : st.mtimeMs);
    }, 0);
  return Math.max(newest(CLIENT_DIR), statSync(join(ROOT, 'app/processing/template-runtime/lib/design.mjs')).mtimeMs) > built;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  await buildEditor({ outDir: i > 0 ? resolve(process.argv[i + 1]) : PUBLIC_DIR, dev: process.argv.includes('--dev'), log: console.log }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
