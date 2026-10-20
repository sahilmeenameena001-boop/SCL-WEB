// Visual editor HTTP API (app/editor/server/routes.mjs) through the real app server: no login,
// cross-site write guard, projects, the instrumented preview, edit operations with undo/redo, assets,
// publishing and export.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as cheerio from 'cheerio';
import { unzipSync } from 'fflate';
import { createAppServer } from '../../app/server.mjs';
import { assetDropAction } from '../../app/editor/client/lib/drop.js';
import { PUBLIC_DIR } from '../../app/editor/build.mjs';

let app;
let base;
let dataDir;
let projectId;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sb-editor-api-'));
  app = createAppServer(
    { port: 0, host: '127.0.0.1', publicOrigin: 'http://127.0.0.1', dataDir, uploadTokenSecret: 'editor-secret-abcdefghijklmnop', extensionId: 'a'.repeat(32) },
    { faults: {}, log: () => {} },
  );
  const addr = await app.listen();
  base = `http://127.0.0.1:${addr.port}`;
  app.config.publicOrigin = base;
});
after(async () => {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

/** Request as the editor UI (which sends the X-SB-Editor header). */
const ui = (path, { method = 'GET', body, headers = {}, raw } = {}) =>
  fetch(base + path, {
    method,
    headers: { 'X-SB-Editor': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
const json = async (res, status = 200) => {
  const data = await res.json();
  assert.equal(res.status, status, JSON.stringify(data));
  return data;
};
const ops = async (list, label = 'Test') => json(await ui(`/api/editor/projects/${projectId}/ops`, { method: 'POST', body: { ops: list, label } }));
const preview = async (route = 'index.html') => {
  const res = await ui(`/editor-preview/${projectId}/${route}`);
  assert.equal(res.status, 200);
  const $ = cheerio.load(await res.text());
  return { $, data: JSON.parse($('#sb-editor-data').text()) };
};
const siteFile = (rel) => join(dataDir, 'sites', projectId, 'site', rel);
const readJson = (rel) => JSON.parse(readFileSync(siteFile(rel), 'utf8'));

test('no login: the editor and its API are open; the launch endpoint returns the editor URL', async () => {
  assert.equal((await fetch(`${base}/api/editor/projects`)).status, 200);
  const { url } = await json(await fetch(`${base}/api/editor/launch`, { method: 'POST' }));
  assert.equal(url, `${base}/editor/`);
  const withProject = await json(await fetch(`${base}/api/editor/launch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: 'p_abcdefgh' }) }));
  assert.equal(withProject.url, `${base}/editor/#project=p_abcdefgh`);
  assert.equal(app.editor.editorUrl('p_abcdefgh'), `${base}/editor/#project=p_abcdefgh`);
  assert.equal((await fetch(`${base}/api/editor/session`)).status, 404, 'session endpoints are gone');
});

test('writes from other websites are refused; the editor UI and server-to-server calls are allowed', async () => {
  const post = (headers) => fetch(`${base}/api/editor/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ from: 'nope' }) });
  assert.equal((await post({ Origin: 'https://evil.example' })).status, 403, 'cross-site form/fetch');
  assert.equal((await post({})).status, 400, 'no Origin (server-to-server) passes the guard');
  assert.equal((await post({ Origin: base })).status, 400, 'same origin passes the guard');
  assert.equal((await post({ Origin: 'https://evil.example', 'X-SB-Editor': '1' })).status, 400, 'the editor header (needs a CORS preflight cross-site) passes');
});

test('a blank project has pages, sections, blocks, assets and an empty history', async () => {
  const created = await json(await ui('/api/editor/projects', { method: 'POST', body: { from: 'blank', name: 'API Test' } }), 201);
  projectId = created.id;
  const state = await json(await ui(`/api/editor/projects/${projectId}`));
  assert.equal(state.project.name, 'API Test');
  assert.deepEqual(state.pages.map((p) => p.route), ['index.html']);
  assert.deepEqual(state.pages[0].sections.map((s) => s.type), ['navigation', 'hero', 'cards', 'content', 'testimonials', 'cta', 'footer']);
  assert.ok(state.pages[0].sections.find((s) => s.type === 'navigation').shared);
  assert.ok(state.blocks.length > 5 && state.elements.some((e) => e.id === 'image'));
  assert.ok(state.assets.some((a) => a.path === '/assets/sb/ph-wide-1.svg' && a.kind === 'image'));
  assert.deepEqual(state.history, { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null }, 'starter content is not an undo step');
  const { projects } = await json(await ui('/api/editor/projects'));
  assert.equal(projects.find((p) => p.id === projectId).pages, 1);
});

test('the preview marks inline-editable fields, attributes and list items', async () => {
  const { $, data } = await preview();
  const h1 = $('h1[data-sb-text]');
  assert.equal(h1.length, 1);
  const f = data.fields[Number(h1.attr('data-sb-text'))];
  assert.equal(f.kind, 'text');
  assert.equal(f.path, 'heading');
  assert.match(f.sectionId, /^home\/sb-/);
  assert.equal(f.raw, 'Build something people remember');
  assert.ok($('[data-sb]').length > 30, 'every element has a stable data-sb id');
  assert.ok($('img[data-sb-attrs*="src:"]').length > 0);
  assert.ok($('[data-sb-item]').length >= 3, 'repeated list items are marked');
  assert.equal(data.rootPrefix, './');
  assert.ok($('script[src$="runtime/sb-animate.js"]').length, 'animation runtime is loaded for previews');
});

test('editing text is one undo step and can be undone and redone', async () => {
  const { $, data } = await preview();
  const f = data.fields[Number($('h1[data-sb-text]').attr('data-sb-text'))];
  const r = await ops([{ op: 'setField', page: 'home', field: { kind: f.kind, path: f.path, sectionId: f.sectionId }, value: 'Edited headline' }], 'Edit text');
  assert.equal(r.state.history.undoLabel, 'Edit text');
  const localId = f.sectionId.split('/')[1];
  assert.equal(readJson('content/pages/home.json').sections[localId].heading, 'Edited headline');
  assert.equal((await preview()).$('h1').text(), 'Edited headline');

  const undone = await json(await ui(`/api/editor/projects/${projectId}/undo`, { method: 'POST' }));
  assert.equal(undone.label, 'Edit text');
  assert.equal(readJson('content/pages/home.json').sections[localId].heading, 'Build something people remember');
  assert.equal(undone.state.history.canRedo, true);
  await json(await ui(`/api/editor/projects/${projectId}/redo`, { method: 'POST' }));
  assert.equal(readJson('content/pages/home.json').sections[localId].heading, 'Edited headline');
});

test('a failing operation rolls back the whole batch', async () => {
  const before = readFileSync(siteFile('content/pages/home.json'), 'utf8');
  const { data } = await preview();
  const f = data.fields.find((x) => x.path === 'heading');
  const res = await ui(`/api/editor/projects/${projectId}/ops`, {
    method: 'POST',
    body: { ops: [{ op: 'setField', page: 'home', field: { kind: 'text', path: 'heading', sectionId: f.sectionId }, value: 'Should not stay' }, { op: 'noSuchOp' }] },
  });
  assert.equal(res.status, 400);
  assert.equal(readFileSync(siteFile('content/pages/home.json'), 'utf8'), before);
});

test('styles, free position and animations are stored in design.json and rendered as CSS', async () => {
  const { $ } = await preview();
  const id = $('h1').attr('data-sb');
  await ops([{ op: 'setDesign', id, patch: { style: { base: { color: '#ff0000' }, mobile: { fontSize: '28px' } }, free: { x: 10, y: 20, w: 30 }, animation: { entrance: { preset: 'fade-up' } } } }]);
  const design = readJson('design.json');
  assert.deepEqual(design.elements[id].free, { x: 10, y: 20, w: 30 });
  const css = (await preview()).$('#sb-design').text();
  assert.match(css, new RegExp(`\\[data-sb="${id}"\\] \\{[^}]*color: #ff0000 !important;[^}]*position: absolute !important; left: 10% !important; top: 20% !important; width: 30%`));
  assert.match(css, /@media \(max-width: 640px\) \{[^@]*font-size: 28px !important/);
  await ops([{ op: 'setDesign', id, patch: { free: null, style: { mobile: null } } }]);
  const after = readJson('design.json').elements[id];
  assert.equal(after.free, undefined);
  assert.equal(after.style.mobile, undefined);
  assert.equal(after.style.base.color, '#ff0000');
});

test('asset drops: replace an image through its field, set a section background', async () => {
  const { $, data } = await preview();
  const img = $('img[data-sb-attrs*="src:"]').first();
  const attrs = Object.fromEntries(img.attr('data-sb-attrs').split(' ').map((p) => p.split(':')).map(([k, n]) => [k, { n: Number(n), field: data.fields[Number(n)] }]));
  const sec = img.closest('[data-sar-section]');
  const info = { id: img.attr('data-sb'), tag: 'img', attrs, literalAttrs: {}, sectionId: sec.attr('data-sar-section'), sectionRootId: sec.attr('data-sb') };
  const asset = { kind: 'image', path: '/assets/sb/ph-wide-3.svg' };
  const replace = assetDropAction('home', asset, info);
  await ops(replace.ops, replace.label);
  assert.equal((await preview()).$(`img[data-sb="${info.id}"]`).first().attr('src'), './assets/sb/ph-wide-3.svg');

  const bg = assetDropAction('home', asset, { ...info, tag: 'h2', attrs: {} });
  await ops(bg.ops, bg.label);
  assert.equal(readJson('design.json').elements[info.sectionRootId].bg.image, '/assets/sb/ph-wide-3.svg');
  assert.match((await preview()).$('#sb-design').text(), /background-image: url\("\.\/assets\/sb\/ph-wide-3\.svg"\)/);
});

test('sections and elements: add, insert, move, duplicate, delete', async () => {
  let page = (await json(await ui(`/api/editor/projects/${projectId}`))).pages[0];
  const hero = page.sections.find((s) => s.type === 'hero');
  const r = await ops([{ op: 'addSection', page: 'home', block: 'gallery', after: hero.id }], 'Add section');
  const gallery = r.results[0].sectionId;
  page = r.state.pages[0];
  assert.equal(page.sections[page.sections.findIndex((s) => s.id === hero.id) + 1].id, gallery);

  const moved = await ops([{ op: 'moveSection', page: 'home', sectionId: gallery, toIndex: 1 }]);
  assert.equal(moved.state.pages[0].sections[1].id, gallery);

  const { $ } = await preview();
  const lead = $('.sb-hero .sb-lead').attr('data-sb');
  const ins = await ops([{ op: 'insertElement', page: 'home', target: lead, position: 'after', kind: 'button' }], 'Add element');
  const btn = ins.results[0].id;
  let p2 = await preview();
  assert.equal(p2.$(`[data-sb="${lead}"]`).next().attr('data-sb'), btn);
  assert.equal(p2.$(`[data-sb="${btn}"]`).text(), 'Click me');

  await ops([{ op: 'moveElement', page: 'home', id: btn, target: lead, position: 'before' }]);
  p2 = await preview();
  assert.equal(p2.$(`[data-sb="${lead}"]`).prev().attr('data-sb'), btn);

  await ops([{ op: 'setDesign', id: btn, patch: { style: { base: { color: '#123456' } } } }]);
  const dup = await ops([{ op: 'duplicateElement', page: 'home', id: btn }]);
  assert.notEqual(dup.results[0].id, btn);
  p2 = await preview();
  assert.equal(p2.$(`[data-sb="${dup.results[0].id}"]`).length, 1, 'the returned id is the copy');
  assert.equal(p2.$(`[data-sb="${btn}"]`).next().attr('data-sb'), dup.results[0].id);
  assert.equal(readJson('design.json').elements[dup.results[0].id]?.style.base.color, '#123456', 'styles are copied');
  const dupSec = await ops([{ op: 'duplicateSection', page: 'home', sectionId: gallery }]);
  assert.equal((await preview()).$(`[data-sb="${dupSec.results[0].id}"]`).attr('data-sar-section'), dupSec.results[0].sectionId);
  await ops([{ op: 'deleteSection', page: 'home', sectionId: dupSec.results[0].sectionId }]);
  await ops([{ op: 'deleteElement', page: 'home', id: dup.results[0].id }, { op: 'deleteSection', page: 'home', sectionId: gallery }]);
  p2 = await preview();
  assert.equal(p2.$(`[data-sb="${dup.results[0].id}"]`).length, 0);
  assert.equal(p2.$('[data-sar-type="gallery"]').length, 0);
});

test('pages: add (shares navigation), rename, delete', async () => {
  const r = await ops([{ op: 'addPage', title: 'About us', basedOn: 'home' }], 'Add page');
  assert.equal(r.results[0].pageId, 'about-us');
  const about = r.state.pages.find((p) => p.id === 'about-us');
  assert.equal(about.route, 'about-us.html');
  assert.ok(readJson('content/shared.json').navigation.links.some((l) => l.href === '/about-us.html'));
  const { $ } = await preview('about-us.html');
  assert.equal($('h1').text(), 'About us');
  await ops([{ op: 'updatePage', page: 'about-us', title: 'About', description: 'Who we are' }]);
  assert.deepEqual(readJson('content/pages/about-us.json').page, { title: 'About', description: 'Who we are' });
  await ops([{ op: 'deletePage', pageId: 'about-us' }]);
  assert.equal(existsSync(siteFile('pages/about-us.json')), false);
  assert.ok(!readJson('content/shared.json').navigation.links.some((l) => l.href === '/about-us.html'));
});

test('theme: config edits are limited to editable roots', async () => {
  await ops([{ op: 'setConfig', path: 'colors.accent.value', value: '#7c3aed' }]);
  assert.equal(readJson('site.config.json').colors.accent.value, '#7c3aed');
  const brand = await (await ui(`/editor-preview/${projectId}/brand/brand.css`)).text();
  assert.match(brand, /--sar-color-accent: #7c3aed;/);
  const res = await ui(`/api/editor/projects/${projectId}/ops`, { method: 'POST', body: { ops: [{ op: 'setConfig', path: 'integrations2.x', value: 1 }] } });
  assert.equal(res.status, 400);
});

test('assets: upload, list, unsupported types and served with safe headers', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const up = await json(await ui(`/api/editor/projects/${projectId}/assets?name=My Photo.PNG`, { method: 'POST', raw: png }), 201);
  assert.deepEqual(up.asset, { path: '/assets/uploads/my-photo.png', name: 'my-photo.png', kind: 'image', size: png.length, uploaded: true });
  const again = await json(await ui(`/api/editor/projects/${projectId}/assets?name=my-photo.png`, { method: 'POST', raw: png }), 201);
  assert.equal(again.asset.name, 'my-photo-2.png', 'names never collide');
  assert.equal((await ui(`/api/editor/projects/${projectId}/assets?name=evil.html`, { method: 'POST', raw: Buffer.from('<script>') })).status, 400);
  const { assets } = await json(await ui(`/api/editor/projects/${projectId}/assets`));
  assert.equal(assets[0].uploaded, true, 'uploads are listed first');
  const served = await ui(`/editor-preview/${projectId}/assets/uploads/my-photo.png`);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.compare(Buffer.from(await served.arrayBuffer()), png), 0);
  assert.equal((await ui(`/editor-preview/${projectId}/site.config.json`)).status, 404, 'only assets and runtime files are served');
  assert.equal((await ui(`/editor-preview/${projectId}/assets/..%2f..%2fproject.json`)).status, 403);
});

test('section HTML can be read and replaced (template tokens validated)', async () => {
  const page = (await json(await ui(`/api/editor/projects/${projectId}`))).pages[0];
  const cta = page.sections.find((s) => s.type === 'cta');
  const src = await json(await ui(`/api/editor/projects/${projectId}/section-source?page=home&section=${encodeURIComponent(cta.id)}`));
  assert.match(src.html, /\{\{@ heading\}\}/);
  const bad = await ui(`/api/editor/projects/${projectId}/ops`, { method: 'POST', body: { ops: [{ op: 'setSectionSource', page: 'home', sectionId: cta.id, html: '<div>{{@each x}}</div>' }] } });
  assert.equal(bad.status, 400);
  await ops([{ op: 'setSectionSource', page: 'home', sectionId: cta.id, html: src.html.replace('<h2 ', '<h2 class="custom" ') }]);
  assert.equal((await preview()).$('h2.custom').text(), 'Ready to begin?');
});

test('publish builds the static site; exports are template and site ZIPs', async () => {
  const pub = await json(await ui(`/api/editor/projects/${projectId}/build`, { method: 'POST' }));
  assert.deepEqual(pub.pages, ['index.html']);
  const site = await ui(pub.url);
  assert.equal(site.status, 200);
  const html = await site.text();
  assert.doesNotMatch(html, /data-sb-(text|html|attrs|item)=|sb-editor-data/, 'no editor markup in the published site');
  assert.match(html, /Edited headline/);

  const siteZip = await ui(`/api/editor/projects/${projectId}/export?kind=site`);
  assert.equal(siteZip.headers.get('content-type'), 'application/zip');
  assert.match(siteZip.headers.get('content-disposition'), /api-test-site\.zip/);
  const siteFiles = Object.keys(unzipSync(new Uint8Array(await siteZip.arrayBuffer())));
  assert.ok(siteFiles.includes('index.html') && siteFiles.includes('brand/brand.css') && siteFiles.includes('runtime/sb-animate.js'));

  const tpl = Object.keys(unzipSync(new Uint8Array(await (await ui(`/api/editor/projects/${projectId}/export?kind=template`)).arrayBuffer())));
  for (const f of ['site.config.json', 'design.json', 'build.mjs', 'pages/home.json', 'content/pages/home.json']) assert.ok(tpl.includes(f), f);
  assert.ok(!tpl.some((f) => f.startsWith('dist/')), 'template export excludes the build output');
});

test('projects: rename, import a template ZIP, delete', async () => {
  const renamed = await json(await ui(`/api/editor/projects/${projectId}`, { method: 'PATCH', body: { name: 'Renamed' } }));
  assert.equal(renamed.project.name, 'Renamed');
  const zip = Buffer.from(await (await ui(`/api/editor/projects/${projectId}/export?kind=template`)).arrayBuffer());
  const imported = await json(await ui('/api/editor/projects/import?name=Copy', { method: 'POST', raw: zip }), 201);
  const state = await json(await ui(`/api/editor/projects/${imported.id}`));
  assert.equal(state.project.name, 'Copy');
  assert.equal(state.pages[0].sections.length, 7);
  assert.equal((await ui('/api/editor/projects/import', { method: 'POST', raw: Buffer.from('not a zip') })).status, 400);
  await json(await ui(`/api/editor/projects/${imported.id}`, { method: 'DELETE' }));
  assert.equal((await ui(`/api/editor/projects/${imported.id}`)).status, 404);
});

test('the editor UI is served at /editor/ once built', async () => {
  const root = await fetch(`${base}/`, { redirect: 'manual' });
  assert.equal(root.status, 302, 'the site root opens the editor');
  assert.equal(root.headers.get('location'), '/editor/');
  assert.equal((await fetch(`${base}/capture.html`)).status, 200, 'capture launch page is still served');
  const res = await fetch(`${base}/editor`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/editor/');
  const page = await fetch(`${base}/editor/`);
  if (!existsSync(join(PUBLIC_DIR, 'index.html'))) {
    assert.equal(page.status, 500);
    assert.match((await page.json()).error, /npm run build:editor/);
    return;
  }
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<script type="module" src="editor\.js\?v=[0-9a-f]+"><\/script>/);
  assert.equal((await fetch(`${base}/editor/editor.js`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal((await fetch(`${base}/editor/..%2f..%2fserver.mjs`)).status, 403);
});
