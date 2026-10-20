// `npm run build:editor`: esbuild bundle + Tailwind CSS + index.html with cache-busting hashes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildEditor, editorBuildIsStale, CLIENT_DIR } from '../../app/editor/build.mjs';

test('the editor UI builds into a self-contained bundle', { timeout: 180_000 }, async () => {
  const out = mkdtempSync(join(tmpdir(), 'sb-editor-build-'));
  try {
    await buildEditor({ outDir: out });
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    assert.match(html, /<link rel="stylesheet" href="editor\.css\?v=[0-9a-f]{10}">/);
    assert.match(html, /<script type="module" src="editor\.js\?v=[0-9a-f]{10}"><\/script>/);
    const js = readFileSync(join(out, 'editor.js'), 'utf8');
    assert.ok(statSync(join(out, 'editor.js')).size > 100_000, 'React and the editor are bundled');
    assert.doesNotMatch(js, /^import\s|from\s*"react"/m, 'no bare imports left for the browser to resolve');
    assert.match(js, /editor-preview/);
    assert.match(js, /sb-anim-init|__sbAnimate/, 'design module (shared with the site build) is bundled');
    const css = readFileSync(join(out, 'editor.css'), 'utf8');
    for (const cls of ['.sb-input', '.sb-btn-primary', '.bg-accent-soft', '.w-\\[264px\\]']) assert.ok(css.includes(cls), `${cls} generated`);

    assert.equal(editorBuildIsStale(out), false);
    const src = join(CLIENT_DIR, 'main.jsx');
    const { atime, mtime } = statSync(src);
    utimesSync(src, atime, new Date(Date.now() + 60_000));
    try {
      assert.equal(editorBuildIsStale(out), true, 'a newer client source makes the build stale');
    } finally {
      utimesSync(src, atime, mtime);
    }
    assert.equal(editorBuildIsStale(join(out, 'missing')), true);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
