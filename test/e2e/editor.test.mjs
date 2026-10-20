// Visual editor in a real browser: login link, project creation, selection, inline text editing,
// per-device styles, free dragging, drag and drop from the panels, undo, device preview, publish.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
import { createAppServer } from '../../app/server.mjs';
import { buildEditor, editorBuildIsStale } from '../../app/editor/build.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let app;
let browser;
let page;
let dataDir;
let projectId;

before(async () => {
  if (editorBuildIsStale()) await buildEditor();
  dataDir = mkdtempSync(join(tmpdir(), 'sb-editor-e2e-'));
  app = createAppServer({ port: 0, host: '127.0.0.1', dataDir, appApiToken: 'e2e-app-token-123456', uploadTokenSecret: 'e2e-secret-abcdefghijklmnop' }, { log: () => {} });
  const { port } = await app.listen();
  app.config.publicOrigin = `http://127.0.0.1:${port}`;
  browser = await puppeteer.launch({ headless: process.env.HEADFUL ? false : true, args: ['--no-first-run'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 }); // wide enough for an unscaled 1280px desktop preview
});

after(async () => {
  await browser?.close();
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const siteJson = (rel) => JSON.parse(readFileSync(join(dataDir, 'sites', projectId, 'site', rel), 'utf8'));

async function until(fn, what, timeout = 15_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what} (last: ${last})`);
}

/** The preview iframe's frame, once its current document is loaded and instrumented. */
async function previewFrame() {
  return until(async () => {
    const f = page.frames().find((x) => x.url().includes('/editor-preview/'));
    return f && (await f.evaluate(() => document.readyState === 'complete' && !!document.getElementById('sb-editor-data'))) && f;
  }, 'preview');
}

const clickText = async (selector, text) => {
  const handle = await until(async () => {
    for (const el of await page.$$(selector)) if ((await el.evaluate((n) => n.textContent.trim())).includes(text)) return el;
  }, `${selector} "${text}"`);
  await handle.click();
};

test('login link and project creation', { timeout: 60_000 }, async () => {
  await page.goto(app.editor.createLaunchUrl());
  await page.waitForSelector('input[aria-label="Site name"]');
  assert.equal(new URL(page.url()).hash, '', 'the login code is removed from the address bar');
  await page.type('input[aria-label="Site name"]', 'E2E Studio');
  await clickText('button', 'Create');
  await until(() => new URL(page.url()).hash.startsWith('#project='), 'project open');
  projectId = new URLSearchParams(new URL(page.url()).hash.slice(1)).get('project');
  const frame = await previewFrame();
  assert.equal(await frame.$eval('h1', (h) => h.textContent), 'Build something people remember');
  await until(() => page.$eval('[role=tree]', (t) => t.querySelectorAll(':scope > [role=treeitem]').length === 7), 'layers');
});

test('click selects, double-click edits text in place', { timeout: 60_000 }, async () => {
  const frame = await previewFrame();
  const h1 = await frame.$('h1');
  await h1.click();
  await until(() => page.$eval('aside[aria-label=Inspector] h2', (h) => h.textContent === 'Heading 1'), 'inspector');
  assert.ok(await page.$eval('[role=treeitem][aria-selected=true]', (r) => r.textContent.includes('Heading 1')), 'Layers follows the selection');

  await h1.click({ count: 2 });
  await until(() => frame.$eval('h1', (h) => h.isContentEditable), 'contenteditable');
  await page.keyboard.down('Control');
  await page.keyboard.press('a');
  await page.keyboard.up('Control');
  await page.keyboard.type('Typed in the preview');
  await page.keyboard.press('Enter');
  await until(() => Object.values(siteJson('content/pages/home.json').sections).some((s) => s.heading === 'Typed in the preview'), 'saved heading');
  assert.equal(await frame.$eval('h1', (h) => h.isContentEditable), false);
});

test('style changes apply to the current device only', { timeout: 60_000 }, async () => {
  await clickText('[role=tab]', 'Style');
  const id = await (await previewFrame()).$eval('h1', (h) => h.dataset.sb);
  await page.click('button[title^="Mobile"]');
  await until(async () => (await page.$eval('iframe', (f) => f.getBoundingClientRect().width)) < 400, 'mobile preview width');
  const input = await page.waitForSelector('[role=group][aria-label="Size"] input');
  await input.click({ count: 3 });
  await input.type('30');
  await input.press('Enter');
  await until(() => siteJson('design.json').elements[id]?.style?.mobile?.fontSize === '30px', 'mobile font size');
  assert.equal(await (await previewFrame()).$eval('h1', (h) => getComputedStyle(h).fontSize), '30px');
  assert.equal(siteJson('design.json').elements[id].style.base, undefined, 'desktop styles untouched');
  await page.click('button[title^="Desktop"]');
  await until(async () => (await page.$eval('iframe', (f) => f.getBoundingClientRect().width)) >= 1280, 'desktop preview width');
});

test('dragging the selected element positions it freely', { timeout: 60_000 }, async () => {
  const frame = await previewFrame();
  const lead = await frame.$('.sb-hero .sb-lead');
  await lead.click();
  const id = await lead.evaluate((n) => n.dataset.sb);
  const box = await lead.boundingBox();
  const x = box.x + 20;
  const y = box.y + 10;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x - i * 15, y + i * 8);
  await page.mouse.up();
  const free = await until(() => siteJson('design.json').elements[id]?.free, 'free position');
  assert.ok(Number.isFinite(free.x) && free.y > 0 && free.w > 10, JSON.stringify(free));
  const after = await lead.boundingBox();
  assert.ok(Math.abs(after.x - (box.x - 150)) < 3 && Math.abs(after.y - (box.y + 80)) < 3, `moved to the release point (${after.x},${after.y})`);
});

test('drag and drop: section from Add, image onto an image, image onto a section', { timeout: 90_000 }, async () => {
  /** Real DragEvents across the panel and the preview iframe (HTML5 drag and drop). */
  const dnd = (sourceText, targetSelector) =>
    page.evaluate(
      async (sourceText, targetSelector) => {
        const source = [...document.querySelectorAll('[draggable=true]')].find((b) => b.textContent.includes(sourceText) || b.title.includes(sourceText));
        const win = document.querySelector('iframe').contentWindow;
        const target = win.document.querySelector(targetSelector);
        const dt = new DataTransfer();
        source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        const r = target.getBoundingClientRect();
        const opts = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + 4 };
        target.dispatchEvent(new win.DragEvent('dragover', opts));
        await new Promise((res) => setTimeout(res, 50));
        target.dispatchEvent(new win.DragEvent('drop', opts));
        source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
      },
      sourceText,
      targetSelector,
    );

  await page.click('nav[aria-label=Panels] button:nth-child(2)'); // Add
  await dnd('Gallery grid', '[data-sar-type=cards]');
  await until(() => {
    const types = siteJson('pages/home.json').sections.map((s) => s.type);
    return types.indexOf('gallery') === types.indexOf('cards') - 1;
  }, 'gallery before cards');
  await previewFrame();
  await until(async () => (await previewFrame()).$('[data-sar-type=gallery]'), 'gallery rendered');

  await page.click('nav[aria-label=Panels] button:nth-child(3)'); // Assets
  await page.waitForSelector('aside button[draggable=true][title*="ph-wide-3.svg"]');
  await dnd('ph-wide-3.svg', '[data-sar-type=content] img');
  await until(async () => (await (await previewFrame()).$eval('[data-sar-type=content] img', (i) => i.getAttribute('src'))) === './assets/sb/ph-wide-3.svg', 'image replaced');

  await dnd('ph-wide-3.svg', '[data-sar-type=cta] h2');
  const ctaId = await (await previewFrame()).$eval('[data-sar-type=cta]', (s) => s.dataset.sb);
  await until(() => siteJson('design.json').elements[ctaId]?.bg?.image === '/assets/sb/ph-wide-3.svg', 'section background');
});

test('undo and redo from the keyboard', { timeout: 60_000 }, async () => {
  const ctaId = await (await previewFrame()).$eval('[data-sar-type=cta]', (s) => s.dataset.sb);
  await page.evaluate(() => document.activeElement?.blur()); // shortcuts are ignored while typing in a field
  await page.keyboard.down('Control');
  await page.keyboard.press('z');
  await page.keyboard.up('Control');
  await until(() => !siteJson('design.json').elements[ctaId]?.bg, 'background undone');
  await page.keyboard.down('Control');
  await page.keyboard.down('Shift');
  await page.keyboard.press('z');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  await until(() => siteJson('design.json').elements[ctaId]?.bg, 'background redone');
});

test('publish builds the site and offers a link', { timeout: 60_000 }, async () => {
  await clickText('button', 'Publish');
  await until(() => page.$$eval('[role=status]', (s) => s.some((t) => /Published 1 page/.test(t.textContent))), 'publish toast');
  const html = await (await page.evaluate((id) => fetch(`/sites/${id}/index.html`).then((r) => r.text()), projectId));
  assert.match(html, /Typed in the preview/);
  assert.match(html, /data-sar-type="gallery"/);
  assert.doesNotMatch(html, /data-sb-text=/);
});
