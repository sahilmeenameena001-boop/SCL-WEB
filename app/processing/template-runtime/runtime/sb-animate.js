/* Animation runtime for templates edited with the visual editor.
 * Reads window.__SB_ANIM__ (generated from design.json by build.mjs) and drives GSAP + ScrollTrigger
 * (and Lenis smooth scrolling when enabled). Respects prefers-reduced-motion.
 * In the editor preview (window.__SB_EDITOR__) nothing runs automatically; the editor calls
 * window.__sbAnimate.play(id) / playAll() / reset(). */
(function () {
  'use strict';
  var cfg = window.__SB_ANIM__ || { elements: {}, presets: {} };
  var root = document.documentElement;
  var editor = !!window.__SB_EDITOR__;
  var reduced = !editor && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var gsap = window.gsap;
  var ST = window.ScrollTrigger;
  var live = [];
  var splitCache = new WeakMap();

  function done() { root.classList.remove('sb-anim-init'); }
  if (!gsap || reduced) { done(); return; }
  if (ST) gsap.registerPlugin(ST);

  function nodes(id) { return Array.prototype.slice.call(document.querySelectorAll('[data-sb="' + id + '"]')); }

  function resolveVars(vars, distance) {
    var out = {};
    for (var k in vars) {
      var v = vars[k];
      if (v === 'D') v = distance;
      else if (v === '-D') v = -distance;
      out[k] = v;
    }
    return out;
  }

  // Split an element's text into word/char spans (only for elements whose content is plain text
  // or simple inline markup). The original markup is restored by reset().
  function split(el, mode) {
    if (!splitCache.has(el)) splitCache.set(el, el.innerHTML);
    else el.innerHTML = splitCache.get(el);
    var parts = [];
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach(function (t) {
      var frag = document.createDocumentFragment();
      t.nodeValue.split(/(\s+)/).forEach(function (word) {
        if (!word) return;
        if (/^\s+$/.test(word)) { frag.appendChild(document.createTextNode(word)); return; }
        var w = document.createElement('span');
        w.style.display = 'inline-block';
        w.setAttribute('data-sb-split', 'word');
        if (mode === 'chars') {
          Array.prototype.forEach.call(word, function (ch) {
            var c = document.createElement('span');
            c.style.display = 'inline-block';
            c.setAttribute('data-sb-split', 'char');
            c.textContent = ch;
            w.appendChild(c);
            parts.push(c);
          });
        } else {
          w.textContent = word;
          parts.push(w);
        }
        frag.appendChild(w);
      });
      t.parentNode.replaceChild(frag, t);
    });
    return parts;
  }

  function trigger(el, a, extra) {
    if (!ST || a.trigger === 'load') return extra || {};
    var st = { trigger: el, start: a.start || 'top 85%' };
    if (a.trigger === 'scrub') { st.end = a.end || 'top 35%'; st.scrub = 0.6; }
    else st.toggleActions = a.replay ? 'play none none reverse' : 'play none none none';
    var o = extra || {};
    o.scrollTrigger = st;
    return o;
  }

  function entrance(el, a) {
    var p = (cfg.presets.entrance || {})[a.preset];
    if (!p) return;
    var dist = Number(a.distance) || 40;
    var targets = a.stagger ? Array.prototype.slice.call(el.children) : el;
    if (a.stagger && !targets.length) targets = el;
    var to = Object.assign({ opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, rotationX: 0, filter: 'blur(0px)' }, p.to ? p.to : {});
    var from = resolveVars(p.from, dist);
    for (var k in to) if (!(k in from) && !(p.to && k in p.to)) delete to[k];
    Object.assign(to, {
      duration: Number(a.duration) || 0.9,
      delay: Number(a.delay) || 0,
      ease: a.ease || p.ease || 'power3.out',
      stagger: a.stagger ? Number(a.staggerAmount) || 0.12 : 0,
      immediateRender: true,
    });
    live.push(gsap.fromTo(targets, from, trigger(el, a, to)));
  }

  function text(el, a) {
    var p = (cfg.presets.text || {})[a.preset];
    if (!p) return;
    var parts = split(el, p.split);
    if (!parts.length) return;
    var to = { opacity: 1, y: 0, filter: 'blur(0px)' };
    for (var k in to) if (!(k in p.from)) delete to[k];
    Object.assign(to, {
      duration: Number(a.duration) || (p.split === 'chars' ? 0.5 : 0.8),
      delay: Number(a.delay) || 0,
      ease: a.ease || p.ease || 'power3.out',
      stagger: Number(a.staggerAmount) || (p.split === 'chars' ? 0.025 : 0.06),
      immediateRender: true,
    });
    live.push(gsap.fromTo(parts, resolveVars(p.from, 0), trigger(el, a, to)));
  }

  function loop(el, a) {
    var p = (cfg.presets.loop || {})[a.preset];
    if (!p) return;
    var vars = Object.assign({}, p.to, { duration: Number(a.duration) || 2.4, ease: p.ease, repeat: -1, yoyo: !!p.yoyo, delay: Number(a.delay) || 0 });
    live.push(p.from ? gsap.fromTo(el, p.from, vars) : gsap.to(el, vars));
  }

  function parallax(el, a) {
    if (!ST) return;
    var speed = Number(a.speed) || 0.3;
    var st = { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true };
    if (a.mode === 'background') {
      live.push(gsap.fromTo(el, { backgroundPosition: '50% ' + (50 - speed * 60) + '%' }, { backgroundPosition: '50% ' + (50 + speed * 60) + '%', ease: 'none', scrollTrigger: st }));
    } else {
      live.push(gsap.fromTo(el, { yPercent: speed * 25 }, { yPercent: -speed * 25, ease: 'none', scrollTrigger: st }));
    }
  }

  function apply(id, only) {
    var a = cfg.elements[id];
    if (!a) return;
    nodes(id).forEach(function (el) {
      if (a.text && (!only || only === 'text')) text(el, a.text);
      else if (a.entrance && (!only || only === 'entrance')) entrance(el, a.entrance);
      if (a.loop && (!only || only === 'loop')) loop(el, a.loop);
      if (a.parallax && (!only || only === 'parallax')) parallax(el, a.parallax);
    });
  }

  function reset() {
    live.forEach(function (t) { if (t.scrollTrigger) t.scrollTrigger.kill(); t.kill(); });
    live = [];
    Object.keys(cfg.elements).forEach(function (id) {
      nodes(id).forEach(function (el) {
        if (splitCache.has(el)) el.innerHTML = splitCache.get(el);
        gsap.set(el, { clearProps: 'opacity,transform,filter,clipPath,backgroundPosition,visibility' });
        Array.prototype.forEach.call(el.children, function (c) { gsap.set(c, { clearProps: 'opacity,transform,filter,clipPath' }); });
      });
    });
  }

  function playAll() {
    reset();
    Object.keys(cfg.elements).forEach(function (id) { apply(id); });
    if (ST) ST.refresh();
  }

  window.__sbAnimate = {
    setConfig: function (c) { reset(); cfg = c; },
    play: function (id, only) {
      reset();
      var a = cfg.elements[id];
      if (!a) return;
      // Preview: force "load" trigger so the effect plays immediately where the element is.
      var copy = {};
      for (var k in a) copy[k] = a[k] && typeof a[k] === 'object' ? Object.assign({}, a[k], { trigger: 'load' }) : a[k];
      var saved = cfg.elements[id];
      cfg.elements[id] = copy;
      apply(id, only);
      cfg.elements[id] = saved;
    },
    playAll: playAll,
    reset: reset,
  };

  if (cfg.smoothScroll && window.Lenis && !editor) {
    var lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
    window.__sbLenis = lenis;
    if (ST) lenis.on('scroll', ST.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  if (editor) { done(); return; }
  try { playAll(); } finally { done(); }
  window.addEventListener('load', function () { if (ST) ST.refresh(); });
})();
