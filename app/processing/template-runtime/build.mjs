// Builds dist/ from site.config.json + design.json + content/ + components/ + layouts/ + assets/.
// Usage: node build.mjs [--out dist]
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, parse, deepMerge, escapeHtml, interpolate, getPath } from './lib/engine.mjs';
import { designCss, animationConfig, needsAnimationRuntime, emptyDesign } from './lib/design.mjs';

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com';
const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com';

export function brandCss(config) {
  const lines = [];
  for (const [key, c] of Object.entries(config.colors || {})) lines.push(`  --sar-color-${key}: ${c.value};`);
  for (const [key, f] of Object.entries(config.fonts || {})) lines.push(`  --sar-font-${key}: ${f.family};`);
  for (const [key, t] of Object.entries(config.typography || {})) lines.push(`  --sar-${key}: ${t.value};`);
  return `/* Generated from site.config.json by build.mjs — edit the config, not this file. */\n:root {\n${lines.join('\n')}\n}\n`;
}

// Google Fonts spec, e.g. "Inter:wght@400;600;700" (validated: it is placed in a URL).
const googleFonts = (config) => Object.values(config.fonts || {}).map((f) => f.google).filter((g) => typeof g === 'string' && /^[A-Za-z0-9 :@;,.]+$/.test(g));

function csp(config) {
  const integ = config.integrations || {};
  const allowed = (integ.allowedOrigins || []).join(' ');
  const gf = googleFonts(config).length;
  const formOrigins = Object.values(integ.forms || {})
    .map((f) => {
      try {
        return f.action ? new URL(f.action).origin : '';
      } catch {
        return '';
      }
    })
    .filter(Boolean)
    .join(' ');
  return [
    `default-src 'self' data: blob:`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${allowed}`,
    `style-src 'self' 'unsafe-inline' ${allowed} ${gf ? GOOGLE_FONTS_CSS : ''}`,
    `img-src 'self' data: blob: ${allowed}`,
    `font-src 'self' data: ${allowed} ${gf ? GOOGLE_FONTS_FILES : ''}`,
    `media-src 'self' data: blob: ${allowed}`,
    `connect-src 'self' ${allowed}`,
    `frame-src 'self' ${allowed}`,
    `worker-src 'self' blob:`,
    `form-action 'self' ${formOrigins}`,
  ]
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .join('; ');
}

export function loadSite(root) {
  return {
    config: readJson(join(root, 'site.config.json')),
    shared: existsSync(join(root, 'content/shared.json')) ? readJson(join(root, 'content/shared.json')) : {},
    design: existsSync(join(root, 'design.json')) ? readJson(join(root, 'design.json')) : emptyDesign(),
  };
}

export function listPages(root) {
  return readdirSync(join(root, 'pages'))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => readJson(join(root, 'pages', f)));
}

export const rootPrefixFor = (route) => {
  const depth = route.split('/').length - 1;
  return depth ? '../'.repeat(depth) : './';
};

/**
 * Render one page to HTML.
 * @param {object} opts { root, page, site: {config, shared, design}, editor?: { mark, markItem, headEnd, bodyEnd } }
 */
export function renderPage({ root, page, site, editor = null, componentCache = new Map() }) {
  const { config, shared, design } = site;
  const component = (id) => {
    if (!componentCache.has(id)) componentCache.set(id, parse(readFileSync(join(root, 'components', `${id}.html`), 'utf8')));
    return componentCache.get(id);
  };
  const content = existsSync(join(root, 'content/pages', `${page.id}.json`)) ? readJson(join(root, 'content/pages', `${page.id}.json`)) : { page: {}, sections: {} };
  const rootPrefix = rootPrefixFor(page.route);
  const sectionsById = new Map(page.sections.map((s) => [s.id, s]));
  const integ = config.integrations || {};
  const runtimeConfig = { allowedOrigins: integ.allowedOrigins || [], blockedEndpoints: integ.blockedEndpoints || [] };
  const marks = editor ? { mark: editor.mark, markItem: editor.markItem } : {};

  const renderSection = (id) => {
    const s = sectionsById.get(id);
    if (!s) throw new Error(`page ${page.id}: unknown section ${id}`);
    const local = content.sections?.[s.localId];
    const scope = s.content === 'page' ? local || {} : deepMerge(getPath(shared, s.content.replace(/^shared:/, '')) || {}, local);
    return render(component(s.component), { scope, config, root: rootPrefix, sectionId: s.id, ...marks });
  };
  const animate = editor || needsAnimationRuntime(design);
  const fonts = googleFonts(config);
  const head = {
    start:
      `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp(config))}">\n` +
      `<script>window.__SAR_RUNTIME__=${JSON.stringify(runtimeConfig).replace(/</g, '\\u003c')};</script>\n` +
      `<script src="${rootPrefix}runtime/sar-runtime.js"></script>` +
      (animate && !editor
        ? `\n<script>document.documentElement.classList.add('sb-anim-init');setTimeout(function(){document.documentElement.classList.remove('sb-anim-init')},2500);</script>`
        : ''),
    end:
      `<link rel="stylesheet" href="${rootPrefix}brand/brand.css">` +
      `\n<link rel="stylesheet" href="${rootPrefix}runtime/sb-blocks.css">` +
      (fonts.length
        ? `\n<link rel="preconnect" href="${GOOGLE_FONTS_FILES}" crossorigin>\n<link rel="stylesheet" href="${GOOGLE_FONTS_CSS}/css2?${fonts.map((f) => `family=${f.trim().replace(/ /g, '+')}`).join('&amp;')}&display=swap">`
        : '') +
      `\n<style id="sb-design">${designCss(design, { root: rootPrefix, editor: !!editor })}</style>` +
      (integ.analytics?.enabled && integ.analytics.headHtml && !editor ? `\n${integ.analytics.headHtml}` : '') +
      (editor?.headEnd || ''),
  };
  let html = render(readFileSync(join(root, page.layout), 'utf8'), {
    scope: { page: Object.fromEntries(Object.entries(content.page || {}).map(([k, v]) => [k, interpolate(v, config)])) },
    config,
    root: rootPrefix,
    renderSection,
    head,
    ...marks,
  });
  // Forms: connect configured endpoints; everything else stays disabled by the runtime guard.
  html = html.replace(/data-sar-form="([^"]+)"/g, (m, id) => {
    const f = integ.forms?.[id];
    if (f?.action) return `${m} action="${escapeHtml(f.action)}" method="${escapeHtml(f.method || 'post')}"`;
    return `${m} data-sar-form-disabled`;
  });
  if (animate) {
    const cfg = animationConfig(design);
    const scripts =
      (editor ? '<script>window.__SB_EDITOR__=true;</script>\n' : '') +
      `<script>window.__SB_ANIM__=${JSON.stringify(cfg).replace(/</g, '\\u003c')};</script>\n` +
      `<script src="${rootPrefix}runtime/vendor/gsap.min.js"></script>\n` +
      `<script src="${rootPrefix}runtime/vendor/ScrollTrigger.min.js"></script>\n` +
      (cfg.smoothScroll || editor ? `<script src="${rootPrefix}runtime/vendor/lenis.min.js"></script>\n` : '') +
      `<script src="${rootPrefix}runtime/sb-animate.js"></script>\n`;
    html = insertBeforeBodyEnd(html, scripts);
  }
  if (editor?.bodyEnd) html = insertBeforeBodyEnd(html, editor.bodyEnd);
  return { html, rootPrefix };
}

function insertBeforeBodyEnd(html, snippet) {
  const i = html.toLowerCase().lastIndexOf('</body>');
  return i < 0 ? html + snippet : html.slice(0, i) + snippet + html.slice(i);
}

export function buildSite({ root = dirname(fileURLToPath(import.meta.url)), outDir } = {}) {
  outDir = resolve(root, outDir || 'dist');
  const site = loadSite(root);
  const componentCache = new Map();

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const built = [];

  for (const page of listPages(root)) {
    const { html } = renderPage({ root, page, site, componentCache });
    const out = join(outDir, page.route);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html);
    built.push(page.route);
  }

  if (existsSync(join(root, 'assets'))) cpSync(join(root, 'assets'), join(outDir, 'assets'), { recursive: true });
  cpSync(join(root, 'runtime'), join(outDir, 'runtime'), { recursive: true });
  mkdirSync(join(outDir, 'brand'), { recursive: true });
  writeFileSync(join(outDir, 'brand/brand.css'), brandCss(site.config));
  // Browsers request /favicon.ico for pages without an icon link: serve the configured favicon.
  const fav = site.config.brand?.favicon;
  if (fav && fav.startsWith('/') && existsSync(join(root, fav.slice(1)))) cpSync(join(root, fav.slice(1)), join(outDir, 'favicon.ico'));
  return { outDir, pages: built };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const { outDir, pages } = buildSite({ outDir: i > 0 ? process.argv[i + 1] : undefined });
  console.log(`Built ${pages.length} page(s) into ${outDir}`);
}
