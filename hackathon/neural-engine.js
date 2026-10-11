import { buildInstrument, projectInstrument } from './neural-geometry.mjs?v=2';

const host = document.querySelector('.neural-machine');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');
const saver = navigator.connection?.saveData === true;
const canvas = host?.querySelector('.neural-canvas');
const pause = host?.querySelector('.engine-pause');
const modes = [...(host?.querySelectorAll('[data-engine-mode]') || [])];
let ctx = null;
try { ctx = canvas?.getContext('2d', { alpha: true }); } catch { /* Static SVG stays visible. */ }

if (ctx) {
  const field = buildInstrument(coarse.matches || saver);
  const views = [[.92, -.16, -.37, 0], [1.04, .015, -.27, .19], [.82, -.29, -.46, -.14]];
  const view = [...views[0]];
  const shadeSteps = 16;
  const shellColors = Array.from({ length: shadeSteps }, (_, i) => {
    const t = i / (shadeSteps - 1);
    return `rgb(${Math.round(14 + t * 54)} ${Math.round(30 + t * 66)} ${Math.round(25 + t * 45)})`;
  });
  const wireColors = ['#337168', '#438b79', '#6aaa89', '#a5d6a1', '#d5edb8', '#efffcf'];
  let visible = false, raf = 0, last = 0, elapsed = 0, paused = false, disposed = false;
  let px = 0, py = 0, targetX = 0, targetY = 0, selected = 0, pulse = 0, pulseAge = 0;
  let tiltX = '', tiltY = '';
  const set = (name, value) => host.style.setProperty(name, value);
  const point = (path, p, index, move = false) => {
    const offset = index * 5;
    if (move) path.moveTo(p[offset], p[offset + 1]);
    else path.lineTo(p[offset], p[offset + 1]);
  };
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, coarse.matches ? 1.25 : 1.6);
    const width = Math.min(host.clientWidth, 800);
    canvas.width = Math.round(width * dpr);
    canvas.height = canvas.width;
    ctx.setTransform(canvas.width / 600, 0, 0, canvas.height / 600, 0, 0);
    draw();
  }
  function draw() {
    const p = projectInstrument(field,
      view[0] + py * .11 + Math.sin(elapsed * .11) * .035,
      view[1] + px * .16, view[2] + Math.sin(elapsed * .08) * .025, view[3]);
    const back = new Path2D(), rim = new Path2D();
    const wire = Array.from({ length: 12 }, () => new Path2D());
    const shell = Array.from({ length: 4 * shadeSteps }, () => new Path2D());
    // One projection pass supplies the satin body, precise strands and signals.
    for (let i = 0; i < field.strands; i++) {
      const start = i * field.stride;
      for (let j = 0; j < field.segments; j++) {
        const a = start + j, b = a + 1, o = b * 5;
        const facing = p[o + 3];
        if (facing < -.08) { point(back, p, a, true); point(back, p, b); continue; }
        const depth = p[o + 2] > 0 ? 1 : 0;
        const light = Math.min(5, Math.floor(p[o + 4] * 6));
        const path = wire[depth * 6 + light];
        point(path, p, a, true); point(path, p, b);
        if (Math.abs(facing) < .14 && p[o + 4] > .35) {
          point(rim, p, a, true); point(rim, p, b);
        }
      }
    }
    for (let f = 0; f < field.faces.length; f += 4) {
      const a = field.faces[f], b = field.faces[f + 1], c = field.faces[f + 2], d = field.faces[f + 3];
      const facing = (p[a * 5 + 3] + p[b * 5 + 3] + p[c * 5 + 3] + p[d * 5 + 3]) * .25;
      if (facing < .025) continue;
      const z = (p[a * 5 + 2] + p[b * 5 + 2] + p[c * 5 + 2] + p[d * 5 + 2]) * .25;
      const light = (p[a * 5 + 4] + p[b * 5 + 4] + p[c * 5 + 4] + p[d * 5 + 4]) * .25;
      const depth = Math.max(0, Math.min(3, Math.floor((z + 185) / 93)));
      const path = shell[depth * shadeSteps + Math.min(shadeSteps - 1, Math.floor(light * shadeSteps))];
      point(path, p, a, true); point(path, p, b); point(path, p, c); point(path, p, d); path.closePath();
    }
    ctx.clearRect(0, 0, 600, 600);
    ctx.strokeStyle = '#367c71'; ctx.globalAlpha = .18; ctx.lineWidth = .65; ctx.stroke(back);
    // Painter order retains near/far depth without an expensive 3D renderer.
    for (let depth = 0; depth < 4; depth++) {
      ctx.globalAlpha = .34 + depth * .055;
      for (let light = 0; light < shadeSteps; light++) {
        ctx.fillStyle = shellColors[light]; ctx.fill(shell[depth * shadeSteps + light]);
      }
    }
    ctx.strokeStyle = '#8ff1b8'; ctx.globalAlpha = .07; ctx.lineWidth = 5; ctx.stroke(rim);
    ctx.globalAlpha = .25; ctx.lineWidth = 1.6; ctx.stroke(rim);
    for (let depth = 0; depth < 2; depth++) {
      for (let light = 0; light < 6; light++) {
        ctx.strokeStyle = wireColors[light];
        ctx.globalAlpha = .22 + light * .085 + depth * .15;
        ctx.lineWidth = .45 + light * .055;
        ctx.stroke(wire[depth * 6 + light]);
      }
    }
    // Five quiet signals and a user-triggered sweep stay on actual field paths.
    const trail = pulse > 0 ? 22 : 12;
    for (let i = 0; i < 5; i++) {
      const strand = (i * 7 + selected * 5) % field.strands;
      const phase = elapsed * .026 + i * .195 + (pulse > 0 ? pulseAge * .23 : 0);
      const head = Math.floor((phase % 1) * field.segments);
      for (let j = 0; j < trail; j++) {
        const index = (head - j + field.segments) % field.segments;
        const a = (strand * field.stride + index) * 5, b = a + 5;
        if (p[a + 3] < -.1) continue;
        ctx.beginPath(); ctx.moveTo(p[a], p[a + 1]); ctx.lineTo(p[b], p[b + 1]);
        ctx.strokeStyle = (i + selected) % 2 ? '#ddff87' : '#96ffdf';
        ctx.globalAlpha = (1 - j / trail) * (.48 + pulse * .45);
        ctx.lineWidth = 1.15 + pulse * .65; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  function mayRun() { return !disposed && visible && !document.hidden && !paused && !reduced.matches && !saver; }
  function updateTilt() {
    const x = `${(px * 4).toFixed(2)}deg`, y = `${(py * -4).toFixed(2)}deg`;
    if (x !== tiltX) { set('--engine-x', x); tiltX = x; }
    if (y !== tiltY) { set('--engine-y', y); tiltY = y; }
  }
  function frame(now) {
    raf = 0;
    if (!mayRun()) return;
    if (last && now - last < (coarse.matches ? 1000 / 24 : 1000 / 30)) { raf = requestAnimationFrame(frame); return; }
    const dt = last ? Math.min((now - last) / 1000, .07) : 0;
    last = now; elapsed += dt;
    const ease = 1 - Math.exp(-dt * 5);
    px += (targetX - px) * ease; py += (targetY - py) * ease;
    for (let i = 0; i < view.length; i++) view[i] += (views[selected][i] - view[i]) * ease;
    if (pulse > 0) { pulseAge += dt; pulse = Math.max(0, 1 - pulseAge / 1.65); }
    draw(); updateTilt();
    raf = requestAnimationFrame(frame);
  }
  function sync() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; last = 0;
    host.classList.toggle('engine-still', !mayRun());
    if (pause) {
      pause.hidden = reduced.matches || saver;
      pause.setAttribute('aria-label', 'Pause AI visual animation');
      pause.setAttribute('aria-pressed', String(paused));
    }
    if (mayRun()) raf = requestAnimationFrame(frame);
    else draw();
  }
  function selectMode(index) {
    selected = index;
    host.dataset.engineMode = String(index);
    modes.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.engineMode) === index)));
    pulse = 1; pulseAge = 0;
    if (!mayRun()) {
      // An intentional mode selection is still available without ongoing motion.
      view.splice(0, view.length, ...views[selected]);
      draw();
    }
  }
  const abort = new AbortController();
  const on = (target, name, fn, options = {}) => target?.addEventListener(name, fn, { ...options, signal: abort.signal });
  on(host, 'pointermove', event => {
    if (coarse.matches || reduced.matches || paused || saver) return;
    const rect = host.getBoundingClientRect();
    targetX = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
    targetY = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
  }, { passive: true });
  on(host, 'pointerleave', () => { targetX = targetY = 0; });
  on(host, 'click', event => {
    if (event.target.closest('button') || !mayRun()) return;
    pulse = 1; pulseAge = 0;
  });
  modes.forEach(button => on(button, 'click', () => {
    const index = Number(button.dataset.engineMode);
    if (Number.isInteger(index) && index >= 0 && index < views.length) selectMode(index);
  }));
  on(pause, 'click', () => { paused = !paused; sync(); });
  on(document, 'visibilitychange', sync);
  on(reduced, 'change', sync);
  on(coarse, 'change', resize);
  const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); });
  const size = new ResizeObserver(resize);
  intersection.observe(host); size.observe(host);
  modes.forEach(button => { button.disabled = false; button.setAttribute('aria-pressed', String(Number(button.dataset.engineMode) === 0)); });
  host.dataset.engineMode = '0';
  resize(); host.classList.add('engine-ready'); sync();
  on(window, 'pagehide', event => {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    if (!event.persisted) { disposed = true; abort.abort(); intersection.disconnect(); size.disconnect(); }
  });
  on(window, 'pageshow', sync);
} else {
  if (pause) pause.hidden = true;
  modes.forEach(button => { button.disabled = true; });
}

// Section details play once; no scroll locks or hidden content while loading.
const sections = document.querySelectorAll('main > .section, main > .apply');
const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
  if (!entry.isIntersecting) return;
  entry.target.classList.add('cinema-entered'); reveal.unobserve(entry.target);
}), { threshold: .08 });
sections.forEach(section => reveal.observe(section));
