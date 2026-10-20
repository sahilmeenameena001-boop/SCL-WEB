// Style values for the inspector: breakpoints, unit normalisation, background and shadow helpers.

export const DEVICES = {
  desktop: { label: 'Desktop', width: null, breakpoint: 'base' },
  tablet: { label: 'Tablet', width: 768, breakpoint: 'tablet' },
  mobile: { label: 'Mobile', width: 390, breakpoint: 'mobile' },
};

export const breakpointFor = (device) => DEVICES[device]?.breakpoint || 'base';

// Properties whose bare numbers mean pixels.
const LENGTH = new Set([
  'fontSize', 'letterSpacing', 'width', 'maxWidth', 'minWidth', 'height', 'minHeight', 'maxHeight', 'gap', 'rowGap', 'columnGap',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderWidth', 'borderRadius', 'top', 'left', 'right', 'bottom',
]);

/** Inspector input -> stored CSS value (null removes the override). */
export function normalizeValue(prop, value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (LENGTH.has(prop) && /^-?\d*\.?\d+$/.test(v)) return v === '0' ? '0' : `${v}px`;
  return v;
}

/** setDesign patch for one style property at a breakpoint. */
export function stylePatch(breakpoint, prop, value) {
  return { style: { [breakpoint]: { [prop]: normalizeValue(prop, value) } } };
}

export function readStyle(design, id, breakpoint, prop) {
  return design?.elements?.[id]?.style?.[breakpoint]?.[prop] ?? '';
}

/** Value inherited from a wider breakpoint (shown as placeholder on tablet/mobile). */
export function inheritedStyle(design, id, breakpoint, prop) {
  const order = ['base', 'tablet', 'mobile'];
  const style = design?.elements?.[id]?.style || {};
  for (let i = order.indexOf(breakpoint) - 1; i >= 0; i--) if (style[order[i]]?.[prop]) return style[order[i]][prop];
  return '';
}

export const SHADOWS = {
  none: 'none',
  sm: '0 1px 2px rgba(0,0,0,.08), 0 1px 3px rgba(0,0,0,.06)',
  md: '0 6px 16px -4px rgba(0,0,0,.14)',
  lg: '0 18px 40px -12px rgba(0,0,0,.25)',
  xl: '0 32px 70px -20px rgba(0,0,0,.35)',
  glow: '0 0 0 3px var(--sar-color-accent, #f2a541)',
};

export function shadowPreset(value) {
  if (!value) return '';
  return Object.entries(SHADOWS).find(([, v]) => v === value)?.[0] || 'custom';
}

/** linear-gradient(<angle>deg, <from>, <to>) <-> { angle, from, to } */
export function gradientString({ angle = 135, from = '#0b3d5c', to = '#f2a541' } = {}) {
  return `linear-gradient(${Number(angle) || 0}deg, ${from}, ${to})`;
}

export function parseGradient(str) {
  const m = /^linear-gradient\((.*)\)$/.exec(String(str || '').trim());
  if (!m) return null;
  // Split on top-level commas only: colours may be rgba(…, …).
  const parts = [''];
  let depth = 0;
  for (const ch of m[1]) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && !depth) parts.push('');
    else parts[parts.length - 1] += ch;
  }
  const [angle, from, to] = parts.map((p) => p.trim());
  const a = /^(-?\d+(?:\.\d+)?)deg$/.exec(angle || '');
  return parts.length === 3 && a ? { angle: Number(a[1]), from, to } : null;
}

/** Hex colour for <input type=color> from any CSS colour string (falls back to black). */
export function toHex(color) {
  const s = String(color || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join('')}`.toLowerCase();
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
  if (m) return `#${[m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')}`;
  return '#000000';
}

export const FONT_WEIGHTS = ['300', '400', '500', '600', '700', '800', '900'];

export const GOOGLE_FONTS = [
  { family: '"Inter", system-ui, sans-serif', google: 'Inter:wght@400;500;600;700' },
  { family: '"DM Sans", system-ui, sans-serif', google: 'DM Sans:wght@400;500;700' },
  { family: '"Poppins", system-ui, sans-serif', google: 'Poppins:wght@400;500;600;700' },
  { family: '"Montserrat", system-ui, sans-serif', google: 'Montserrat:wght@400;600;700;800' },
  { family: '"Space Grotesk", system-ui, sans-serif', google: 'Space Grotesk:wght@400;500;700' },
  { family: '"Outfit", system-ui, sans-serif', google: 'Outfit:wght@400;500;600;700' },
  { family: '"Manrope", system-ui, sans-serif', google: 'Manrope:wght@400;600;800' },
  { family: '"Fraunces", Georgia, serif', google: 'Fraunces:wght@600;700' },
  { family: '"Playfair Display", Georgia, serif', google: 'Playfair Display:wght@500;700' },
  { family: '"Lora", Georgia, serif', google: 'Lora:wght@400;600;700' },
  { family: '"DM Serif Display", Georgia, serif', google: 'DM Serif Display' },
  { family: '"JetBrains Mono", ui-monospace, monospace', google: 'JetBrains Mono:wght@400;700' },
];

export const fontName = (family) => /^\s*"?([^",]+)/.exec(String(family || ''))?.[1] || '';
