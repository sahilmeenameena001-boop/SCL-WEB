// Pure logic of the editor UI (app/editor/client/lib): patches, style values, drop decisions, labels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDesignPatch, combinePatches, mergePatch, nest } from '../../app/editor/client/lib/patch.js';
import { breakpointFor, gradientString, inheritedStyle, normalizeValue, parseGradient, shadowPreset, SHADOWS, stylePatch, toHex } from '../../app/editor/client/lib/style.js';
import { assetDropAction, canFreeDrag, freePosition, literalUrl, placement, sectionInsertAfter, sectionMoveIndex } from '../../app/editor/client/lib/drop.js';
import { elementLabel, fieldLabel, sectionLabel } from '../../app/editor/client/lib/labels.js';
import { mergePatch as serverMergePatch } from '../../app/editor/server/site-model.mjs';

test('mergePatch deletes nulls and empty objects, matching the server', () => {
  const base = { style: { base: { color: 'red', fontSize: '12px' } }, free: { x: 1, y: 2 } };
  const patch = { style: { base: { color: null } }, free: null, hide: { mobile: true } };
  const expected = { style: { base: { fontSize: '12px' } }, hide: { mobile: true } };
  assert.deepEqual(mergePatch(base, patch), expected);
  assert.deepEqual(serverMergePatch(base, patch), expected);
  assert.deepEqual(mergePatch({ a: { b: 1 } }, { a: { b: null } }), {});
});

test('combinePatches keeps deletions so a debounced commit still removes values', () => {
  const a = { style: { base: { color: 'red' } } };
  const b = { style: { base: { color: null, fontSize: '20px' } } };
  assert.deepEqual(combinePatches(a, b), { style: { base: { color: null, fontSize: '20px' } } });
  assert.deepEqual(combinePatches({ free: { x: 1 } }, { free: { y: 2 } }), { free: { x: 1, y: 2 } });
  assert.deepEqual(combinePatches({ bg: { type: 'image' } }, { bg: null }), { bg: null });
});

test('applyDesignPatch mirrors the setDesign operation', () => {
  let d = applyDesignPatch({}, { id: 'abc', patch: { style: { base: { color: 'red' } } } });
  assert.deepEqual(d, { version: 1, elements: { abc: { style: { base: { color: 'red' } } } } });
  d = applyDesignPatch(d, { site: { smoothScroll: true } });
  assert.equal(d.site.smoothScroll, true);
  d = applyDesignPatch(d, { id: 'abc', patch: { style: { base: { color: null } } } });
  assert.equal(d.elements.abc, undefined, 'elements without settings are dropped');
  assert.deepEqual(nest('a.b', 1), { a: { b: 1 } });
});

test('style values: units, breakpoints, inheritance, colours and gradients', () => {
  assert.equal(normalizeValue('fontSize', '18'), '18px');
  assert.equal(normalizeValue('fontSize', '1.5rem'), '1.5rem');
  assert.equal(normalizeValue('marginTop', '0'), '0');
  assert.equal(normalizeValue('lineHeight', '1.4'), '1.4');
  assert.equal(normalizeValue('fontWeight', '700'), '700');
  assert.equal(normalizeValue('color', '  '), null);
  assert.deepEqual(stylePatch('mobile', 'paddingTop', '24'), { style: { mobile: { paddingTop: '24px' } } });
  assert.deepEqual(stylePatch('base', 'color', ''), { style: { base: { color: null } } });
  assert.equal(breakpointFor('desktop'), 'base');
  assert.equal(breakpointFor('tablet'), 'tablet');
  assert.equal(breakpointFor('mobile'), 'mobile');
  const design = { elements: { x: { style: { base: { fontSize: '40px' }, tablet: { fontSize: '32px' } } } } };
  assert.equal(inheritedStyle(design, 'x', 'mobile', 'fontSize'), '32px');
  assert.equal(inheritedStyle(design, 'x', 'tablet', 'fontSize'), '40px');
  assert.equal(inheritedStyle(design, 'x', 'base', 'fontSize'), '');
  assert.equal(toHex('#abc'), '#aabbcc');
  assert.equal(toHex('rgb(255, 0, 16)'), '#ff0010');
  assert.equal(toHex('var(--x)'), '#000000');
  const g = gradientString({ angle: 90, from: '#111111', to: 'rgba(0,0,0,.5)' });
  assert.equal(g, 'linear-gradient(90deg, #111111, rgba(0,0,0,.5))');
  assert.deepEqual(parseGradient(g), { angle: 90, from: '#111111', to: 'rgba(0,0,0,.5)' });
  assert.equal(parseGradient('radial-gradient(red, blue)'), null);
  assert.equal(shadowPreset(SHADOWS.lg), 'lg');
  assert.equal(shadowPreset('0 0 1px red'), 'custom');
  assert.equal(shadowPreset(''), '');
});

const field = (kind, path, sectionId = 'home/hero') => ({ kind, path, sectionId, raw: '' });
const info = (over = {}) => ({ id: 'el1', tag: 'div', attrs: {}, literalAttrs: {}, sectionId: 'home/hero', sectionRootId: 'sec1', isSection: false, repeated: false, ...over });

test('dropping an image on an image replaces it (field, srcset and literal attributes)', () => {
  const img = { kind: 'image', path: '/assets/uploads/new.jpg' };
  const fieldImg = info({ tag: 'img', attrs: { src: { n: 1, field: field('url', 'image.src') }, srcset: { n: 2, field: field('srcset', 'image.srcset') } } });
  const a = assetDropAction('home', img, fieldImg);
  assert.equal(a.kind, 'replace');
  assert.deepEqual(a.ops, [
    { op: 'setField', page: 'home', field: { kind: 'url', path: 'image.src', sectionId: 'home/hero' }, value: '/assets/uploads/new.jpg' },
    { op: 'setField', page: 'home', field: { kind: 'srcset', path: 'image.srcset', sectionId: 'home/hero' }, value: '' },
  ]);
  const literal = assetDropAction('home', img, info({ tag: 'img', literalAttrs: { src: 'a.png', srcset: 'a.png 1x' } }));
  assert.deepEqual(literal.ops, [
    { op: 'setAttr', page: 'home', id: 'el1', name: 'src', value: '{{@root}}assets/uploads/new.jpg' },
    { op: 'setAttr', page: 'home', id: 'el1', name: 'srcset', value: null },
  ]);
  assert.equal(literalUrl('https://cdn.example/x.png'), 'https://cdn.example/x.png');
});

test('dropping an image elsewhere in a section sets the section background', () => {
  const a = assetDropAction('home', { kind: 'image', path: '/assets/a.png' }, info({ tag: 'h2' }));
  assert.equal(a.kind, 'background');
  assert.deepEqual(a.ops, [{ op: 'setDesign', id: 'sec1', patch: { bg: { type: 'image', image: '/assets/a.png', size: 'cover', position: 'center' } } }]);
  assert.equal(assetDropAction('home', { kind: 'image', path: '/a.png' }, info({ sectionRootId: null })), null);
  assert.equal(assetDropAction('home', { kind: 'font', path: '/a.woff2' }, info()), null);
  const video = assetDropAction('home', { kind: 'video', path: '/assets/v.mp4' }, info({ tag: 'p' }));
  assert.equal(video.kind, 'insert');
  assert.equal(video.ops[0].op, 'insertElement');
  assert.deepEqual(video.ops[0].props, { src: '/assets/v.mp4' });
});

test('drop placement and section insertion order', () => {
  const r = { top: 100, height: 100 };
  assert.equal(placement(r, 120), 'before');
  assert.equal(placement(r, 180), 'after');
  assert.equal(placement(r, 120, { container: true }), 'prepend');
  assert.equal(placement(r, 180, { container: true }), 'append');
  const order = ['nav', 'hero', 'cards', 'footer'];
  assert.equal(sectionInsertAfter(order, 'cards', true), 'hero');
  assert.equal(sectionInsertAfter(order, 'cards', false), 'cards');
  assert.equal(sectionInsertAfter(order, 'nav', true), null);
  assert.equal(sectionInsertAfter(order, 'missing', true), 'footer');
  assert.equal(sectionInsertAfter([], 'x', true), null);
  assert.equal(sectionMoveIndex(order, 'footer', 'hero', true), 1);
  assert.equal(sectionMoveIndex(order, 'nav', 'cards', false), 2); // index in the order without the moved section
  assert.equal(sectionMoveIndex(order, 'hero', 'hero', true), 1);
});

test('free position is stored as rounded, clamped percentages of the containing block', () => {
  assert.deepEqual(freePosition({ left: 100, top: 50, width: 200 }, { width: 800, height: 400 }), { x: 12.5, y: 12.5, w: 25 });
  assert.deepEqual(freePosition({ left: 1 / 3, top: 0, width: 800 }, { width: 3, height: 0 }), { x: 11.11, y: 0, w: 100 });
  assert.deepEqual(freePosition({ left: -5000, top: 99999, width: 0 }, { width: 100, height: 100 }), { x: -50, y: 300, w: 1 });
  assert.equal(canFreeDrag(info()), true);
  assert.equal(canFreeDrag(info({ isSection: true })), false);
  assert.equal(canFreeDrag(info({ repeated: true })), false);
  assert.equal(canFreeDrag(info({ tag: 'main', sectionId: null })), false);
  assert.equal(canFreeDrag(null), false);
});

test('labels for layers and fields', () => {
  assert.equal(elementLabel({ tag: 'h1', text: 'Hello world' }), 'Heading 1 · Hello world');
  assert.equal(elementLabel({ tag: 'a', classes: ['sb-btn'] }), 'Button');
  assert.equal(elementLabel({ tag: 'a' }), 'Link');
  assert.equal(elementLabel({ tag: 'div', classes: ['sb-card'] }), 'Card');
  assert.equal(elementLabel({ tag: 'p', text: 'x'.repeat(60) }).length, 'Paragraph · '.length + 28);
  assert.equal(elementLabel({ isSection: true, sectionType: 'cta' }), 'Call to action');
  assert.equal(elementLabel({ tag: 'custom-el' }), '<custom-el>');
  assert.equal(sectionLabel('unknownthing'), 'Unknownthing');
  assert.equal(fieldLabel('primary.label'), 'Primary label');
  assert.equal(fieldLabel('items.2.title'), 'Items title');
  assert.equal(fieldLabel('heading_k3x9a'), 'Heading');
  assert.equal(fieldLabel('button_k3x9a_ab12.href'), 'Button href');
  assert.equal(fieldLabel('heroImage'), 'Hero image');
});
