// Design layer for the visual editor: per-element style overrides, backgrounds, free positioning,
// visibility per breakpoint and animations, stored in design.json next to site.config.json.
// Pure module (no Node APIs): imported by build.mjs and by the editor in the browser.
//
// design.json
// {
//   "version": 1,
//   "site": { "smoothScroll": false, "customCss": "" },
//   "elements": {
//     "<data-sb id>": {
//       "style":  { "base": { "color": "#fff" }, "tablet": {}, "mobile": {} },
//       "hover":  { "color": "#f00" },
//       "bg":     { "type": "image", "image": "/assets/uploads/a.jpg", "overlay": "rgba(0,0,0,.4)", ... },
//       "free":   { "x": 10, "y": 20, "w": 30 },            // % of the offset parent
//       "hide":   { "desktop": false, "tablet": false, "mobile": true },
//       "animation": { "entrance": {...}, "text": {...}, "loop": {...}, "hover": "lift", "parallax": {...} },
//       "css":    "raw declarations appended to the element rule"
//     }
//   }
// }

export const BREAKPOINTS = {
  base: null,
  tablet: '(max-width: 1024px)',
  mobile: '(max-width: 640px)',
};
const HIDE_MEDIA = { desktop: '(min-width: 1025px)', tablet: '(min-width: 641px) and (max-width: 1024px)', mobile: '(max-width: 640px)' };

export const ENTRANCE_PRESETS = {
  fade: { label: 'Fade in', from: { opacity: 0 } },
  'fade-up': { label: 'Fade up', from: { opacity: 0, y: 'D' } },
  'fade-down': { label: 'Fade down', from: { opacity: 0, y: '-D' } },
  'fade-left': { label: 'Slide in from right', from: { opacity: 0, x: 'D' } },
  'fade-right': { label: 'Slide in from left', from: { opacity: 0, x: '-D' } },
  'zoom-in': { label: 'Zoom in', from: { opacity: 0, scale: 0.85 } },
  'zoom-out': { label: 'Zoom out', from: { opacity: 0, scale: 1.15 } },
  'blur-in': { label: 'Blur in', from: { opacity: 0, filter: 'blur(14px)' } },
  'flip-up': { label: 'Flip up', from: { opacity: 0, rotationX: -75, transformPerspective: 900, transformOrigin: '50% 100%' } },
  'rotate-in': { label: 'Rotate in', from: { opacity: 0, rotation: -8, y: 'D' } },
  'reveal-up': { label: 'Mask reveal (up)', from: { clipPath: 'inset(100% 0% 0% 0%)' }, to: { clipPath: 'inset(0% 0% 0% 0%)' } },
  'reveal-left': { label: 'Mask reveal (side)', from: { clipPath: 'inset(0% 100% 0% 0%)' }, to: { clipPath: 'inset(0% 0% 0% 0%)' } },
  'pop': { label: 'Pop', from: { opacity: 0, scale: 0.6 }, ease: 'back.out(1.8)' },
};

export const TEXT_PRESETS = {
  'words-up': { label: 'Words rise', split: 'words', from: { opacity: 0, y: '0.6em' } },
  'words-fade': { label: 'Words fade', split: 'words', from: { opacity: 0 } },
  'chars-up': { label: 'Letters rise', split: 'chars', from: { opacity: 0, y: '0.5em' } },
  'chars-blur': { label: 'Letters blur', split: 'chars', from: { opacity: 0, filter: 'blur(8px)' } },
  typewriter: { label: 'Typewriter', split: 'chars', from: { opacity: 0 }, ease: 'none' },
};

export const LOOP_PRESETS = {
  float: { label: 'Float', to: { y: -12 }, yoyo: true, ease: 'sine.inOut' },
  pulse: { label: 'Pulse', to: { scale: 1.06 }, yoyo: true, ease: 'sine.inOut' },
  spin: { label: 'Spin', to: { rotation: 360 }, yoyo: false, ease: 'none' },
  swing: { label: 'Swing', from: { rotation: -4 }, to: { rotation: 4 }, yoyo: true, ease: 'sine.inOut' },
  bounce: { label: 'Bounce', to: { y: -18 }, yoyo: true, ease: 'power1.out' },
  wobble: { label: 'Wobble', from: { skewX: -3 }, to: { skewX: 3 }, yoyo: true, ease: 'sine.inOut' },
};

// Hover effects use the individual transform properties (translate/scale/rotate) so they compose
// with GSAP, which animates `transform`.
export const HOVER_PRESETS = {
  lift: { label: 'Lift', css: 'translate: 0 -6px; box-shadow: 0 18px 40px -18px rgba(0,0,0,.45);' },
  grow: { label: 'Grow', css: 'scale: 1.05;' },
  shrink: { label: 'Shrink', css: 'scale: 0.96;' },
  tilt: { label: 'Tilt', css: 'rotate: -2deg; scale: 1.02;' },
  glow: { label: 'Glow', css: 'box-shadow: 0 0 0 3px var(--sar-color-accent, #f2a541), 0 12px 40px -10px var(--sar-color-accent, #f2a541);' },
  dim: { label: 'Dim', css: 'opacity: .75;' },
  brighten: { label: 'Brighten', css: 'filter: brightness(1.12) saturate(1.1);' },
};

export const EASES = ['power1.out', 'power2.out', 'power3.out', 'power4.out', 'expo.out', 'back.out(1.6)', 'elastic.out(1, 0.5)', 'sine.inOut', 'none'];

export const sel = (id) => `[data-sb="${String(id).replace(/["\\]/g, '')}"]`;

const kebab = (p) => (p.startsWith('--') ? p : p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
const clean = (v) => String(v).replace(/[{}<>;]/g, '').trim();

function decls(style, important = true) {
  const out = [];
  for (const [prop, value] of Object.entries(style || {})) {
    if (value === null || value === undefined || value === '') continue;
    out.push(`${kebab(prop)}: ${clean(value)}${important ? ' !important' : ''};`);
  }
  return out.join(' ');
}

/** Background object -> CSS declarations. */
export function bgStyle(bg) {
  if (!bg || !bg.type || bg.type === 'none') return {};
  const layers = [];
  const overlay = bg.overlay && bg.overlay !== 'transparent' ? `linear-gradient(${bg.overlay}, ${bg.overlay})` : null;
  if (bg.type === 'color') return { backgroundColor: bg.color || 'transparent', backgroundImage: 'none' };
  if (overlay) layers.push(overlay);
  if (bg.type === 'gradient') layers.push(bg.gradient || 'linear-gradient(135deg, #0b3d5c, #f2a541)');
  if (bg.type === 'image' && bg.image) layers.push(`url("${String(bg.image).replace(/"/g, '%22')}")`);
  const s = { backgroundImage: layers.join(', ') || 'none' };
  if (bg.color) s.backgroundColor = bg.color;
  if (bg.type === 'image') {
    s.backgroundSize = bg.size || 'cover';
    s.backgroundPosition = bg.position || 'center';
    s.backgroundRepeat = bg.repeat || 'no-repeat';
    if (bg.fixed) s.backgroundAttachment = 'fixed';
  }
  return s;
}

/** URLs in design values are site-root paths ("/assets/..."); make them relative to the page. */
function relativize(css, root) {
  if (!root) return css;
  return css.replace(/url\("\/(?!\/)/g, `url("${root}`);
}

/**
 * @param {object} design design.json
 * @param {object} [opts] { root: './' page-relative prefix for /assets URLs, editor: bool }
 */
export function designCss(design, { root = '', editor = false } = {}) {
  const rules = [];
  const media = { tablet: [], mobile: [] };
  const hideRules = { desktop: [], tablet: [], mobile: [] };
  const entranceIds = [];
  for (const [id, el] of Object.entries(design?.elements || {})) {
    if (!el) continue;
    const s = sel(id);
    const base = { ...bgStyle(el.bg), ...(el.style?.base || {}) };
    if (el.free) {
      Object.assign(base, { position: 'absolute', left: `${num(el.free.x)}%`, top: `${num(el.free.y)}%` });
      if (el.free.w) base.width = `${num(el.free.w)}%`;
      if (el.free.z != null) base.zIndex = String(Math.round(el.free.z));
      else if (!base.zIndex) base.zIndex = '2';
      base.margin = '0';
    }
    let d = decls(base);
    if (el.css) {
      const raw = String(el.css).replace(/[{}<>]/g, '').trim();
      if (raw) d += ` ${raw}${raw.endsWith(';') ? '' : ';'}`;
    }
    if (el.animation?.hover && HOVER_PRESETS[el.animation.hover]) d += ' transition: translate .35s cubic-bezier(.2,.7,.2,1), scale .35s cubic-bezier(.2,.7,.2,1), rotate .35s, box-shadow .35s, opacity .35s, filter .35s;';
    else if (el.hover && Object.keys(el.hover).length) d += ' transition: all .3s ease;';
    if (d.trim()) rules.push(`${s} { ${d} }`);
    if (el.free) rules.push(`[data-sar-section]:has(${s}) { position: relative; }`);
    for (const bp of ['tablet', 'mobile']) {
      const bd = decls(el.style?.[bp]);
      if (bd) media[bp].push(`${s} { ${bd} }`);
    }
    if (el.free && el.free.mobileFlow !== false) media.mobile.push(`${s} { position: relative !important; left: auto !important; top: auto !important; width: auto !important; max-width: 100% !important; }`);
    const hover = decls(el.hover);
    const hp = el.animation?.hover && HOVER_PRESETS[el.animation.hover];
    if (hover || hp) rules.push(`${s}:hover { ${hover} ${hp ? hp.css : ''} }`);
    for (const k of Object.keys(hideRules)) if (el.hide?.[k]) hideRules[k].push(s);
    if (el.animation?.entrance?.preset || el.animation?.text?.preset) entranceIds.push(id);
  }
  let css = rules.join('\n');
  for (const bp of ['tablet', 'mobile']) if (media[bp].length) css += `\n@media ${BREAKPOINTS[bp]} {\n${media[bp].join('\n')}\n}`;
  for (const [k, sels] of Object.entries(hideRules)) {
    if (!sels.length) continue;
    // In the editor hidden elements stay selectable (dimmed) so they can be un-hidden.
    css += editor
      ? `\n@media ${HIDE_MEDIA[k]} { ${sels.join(', ')} { opacity: .25 !important; outline: 1px dashed #999 !important; } }`
      : `\n@media ${HIDE_MEDIA[k]} { ${sels.join(', ')} { display: none !important; } }`;
  }
  if (!editor && entranceIds.length) css += `\nhtml.sb-anim-init ${entranceIds.map(sel).join(', html.sb-anim-init ')} { visibility: hidden; }`;
  if (design?.site?.customCss) css += `\n/* custom CSS */\n${String(design.site.customCss).replace(/<\/style/gi, '')}`;
  return relativize(css, root);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Animation config passed to runtime/sb-animate.js. */
export function animationConfig(design) {
  const elements = {};
  for (const [id, el] of Object.entries(design?.elements || {})) {
    const a = el?.animation;
    if (!a) continue;
    const out = {};
    if (a.entrance?.preset && ENTRANCE_PRESETS[a.entrance.preset]) out.entrance = a.entrance;
    if (a.text?.preset && TEXT_PRESETS[a.text.preset]) out.text = a.text;
    if (a.loop?.preset && LOOP_PRESETS[a.loop.preset]) out.loop = a.loop;
    if (a.parallax?.speed) out.parallax = a.parallax;
    if (Object.keys(out).length) elements[id] = out;
  }
  return {
    smoothScroll: !!design?.site?.smoothScroll,
    elements,
    presets: { entrance: ENTRANCE_PRESETS, text: TEXT_PRESETS, loop: LOOP_PRESETS },
  };
}

export function needsAnimationRuntime(design) {
  const cfg = animationConfig(design);
  return cfg.smoothScroll || Object.keys(cfg.elements).length > 0;
}

export function emptyDesign() {
  return { version: 1, site: { smoothScroll: false, customCss: '' }, elements: {} };
}
