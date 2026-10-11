// Hackathon-only choreography. The homepage keeps its existing motion engine.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const saver = navigator.connection?.saveData === true;
const hero = document.querySelector('.hero');
const machine = document.querySelector('.machine');
const root = document.documentElement;
let generation = 0;
let disposeMotion = () => {};
let disposeScene = () => {};
let sceneObserver;

// Split text nodes without replacing copy, links, emphasis, or line breaks.
document.querySelectorAll('main h1, main h2').forEach(heading => {
  const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    const fragment = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach(token => {
      if (!token) return;
      if (/^\s+$/.test(token)) fragment.append(document.createTextNode(token));
      else {
        const word = document.createElement('span');
        word.className = 'motion-word';
        word.textContent = token;
        fragment.append(word);
      }
    });
    node.replaceWith(fragment);
  });
  heading.querySelectorAll('em .motion-word, h2 > span:not(.motion-word) .motion-word')
    .forEach(word => word.classList.add('ink-gradient'));
});

const motifs = [
    '<path d="M43 70V39M43 39L18 20M43 39L67 20M43 54L18 46M43 54L67 46"/><circle cx="18" cy="20" r="5"/><circle cx="67" cy="20" r="5"/><circle cx="18" cy="46" r="5"/><circle cx="67" cy="46" r="5"/>',
    '<path d="M4 43H21L29 27L38 63L49 14L57 43H82"/><circle cx="43" cy="43" r="36"/>',
    '<path d="M15 69C12 18 40 11 72 14C76 50 59 73 15 69ZM15 69L60 26M32 51V30M45 40H63"/>',
    '<ellipse cx="43" cy="43" rx="37" ry="14"/><ellipse cx="43" cy="43" rx="37" ry="14" transform="rotate(60 43 43)"/><ellipse cx="43" cy="43" rx="37" ry="14" transform="rotate(120 43 43)"/><circle cx="43" cy="43" r="4"/>',
    '<circle cx="43" cy="43" r="9"/><circle cx="43" cy="12" r="5"/><circle cx="15" cy="62" r="5"/><circle cx="71" cy="62" r="5"/><path d="M43 17V34M22 59L36 48M50 48L65 59M39 14L18 56M48 14L69 56M22 65H64"/>'
];
document.querySelectorAll(".track-grid article").forEach((card, index) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 86 86");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "track-motif");
  svg.innerHTML = motifs[index % motifs.length];
  card.append(svg);
});

// Native navigation feedback remains available even if GSAP cannot download.
const links = [...document.querySelectorAll('header nav a[href^="#"]')];
const navObserver = new IntersectionObserver(entries => {
  const entered = entries.filter(entry => entry.isIntersecting).at(-1);
  if (!entered) return;
  links.forEach(link => {
    if (link.hash === `#${entered.target.id}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}, { rootMargin: '-15% 0px -55% 0px' });
document.querySelectorAll('main > section').forEach(section => navObserver.observe(section));

function mountMotion({ gsap, ScrollTrigger }) {
  gsap.registerPlugin(ScrollTrigger);
  const media = gsap.matchMedia();
  media.add({ desktop: '(min-width: 901px) and (hover: hover) and (pointer: fine)',
    mobile: '(max-width: 900px), (hover: none), (pointer: coarse)', reduce: '(prefers-reduced-motion: reduce)' }, context => {
    if (context.conditions.reduce) return;
    const desktop = context.conditions.desktop;
    const abort = new AbortController();
    const eventOptions = { passive: true, signal: abort.signal };
    const entrances = new Map();
    const orbital = { x: 0, y: 0, scroll: 0 };
    // Send only numbers: GSAP adds internal metadata that workers cannot clone.
    const sendOrbit = () => machine.dispatchEvent(new CustomEvent('orbital-input', {
      detail: { x: orbital.x, y: orbital.y, scroll: orbital.scroll },
    }));
    document.body.classList.add('gsap-motion');
    document.body.dataset.motionMode = desktop ? 'desktop' : 'mobile';

    // Nothing is hidden while assets load. Hero movement begins from readable text.
    if (hero.getBoundingClientRect().bottom > 0 && hero.getBoundingClientRect().top < innerHeight) {
      const intro = gsap.timeline({ defaults: { ease: 'power3.out', duration: desktop ? .9 : .5 } });
      intro.from('.hero .signal', { x: -14 }, 0)
        .from('.hero h1 .motion-word', { yPercent: desktop ? 42 : 18, rotation: desktop ? 2 : 0, stagger: .075 }, .06)
        .from('.hero-lede, .welcome, .hero-actions', { y: desktop ? 18 : 8, stagger: .08 }, .2)
        .from('.machine .node', { scale: .8, stagger: .12 }, .18);
      entrances.set(hero, intro);
    }

    // Animate each group on entry, without making offscreen content inaccessible.
    const targets = [...document.querySelectorAll('main > section:not(.hero) :is(.section-kicker, h2, .intro-grid > div, .tracks-heading > p, .mentor-copy > p, .principles article, .track-grid article, .mentor-panel, .deliverable-grid article, .after > p, .ai-line, .apply > p, .apply > .button)')];
    context.add('reveal', elements => {
      elements.forEach((element, index) => {
        const words = element.matches('h2') ? element.querySelectorAll('.motion-word') : null;
        const target = words?.length ? words : element;
        const animation = gsap.from(target, {
          y: desktop ? (words?.length ? 28 : 22) : 10,
          duration: desktop ? .8 : .45, ease: 'power3.out',
          stagger: words?.length ? .035 : 0, delay: Math.min(index * .06, .18),
          clearProps: 'transform',
        });
        entrances.set(element, animation);
      });
    });
    const revealObserver = new IntersectionObserver(entries => {
      const shown = entries.filter(entry => entry.isIntersecting).map(entry => entry.target);
      shown.forEach(element => revealObserver.unobserve(element));
      context.reveal(shown);
    }, { threshold: .06, rootMargin: '0px 0px -24px 0px' });
    targets.forEach(element => revealObserver.observe(element));

    const timeline = document.querySelector('.timeline');
    const rows = [...timeline.children];
    // Phones keep their natural scroll with short entry animations only.
    if (desktop) {
      const heroScroll = gsap.timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: .65 }, defaults: { ease: 'none' } });
      heroScroll.to('.machine', { y: 40, rotation: 0, scale: .97 }, 0)
        .to('.grid-field', { y: 115 }, 0)
        .to('.hero-copy', { y: -22 }, 0)
        .to(orbital, { scroll: 1150, onUpdate: sendOrbit }, 0);
      if (!machine.classList.contains('neural-machine')) {
        const xTo = gsap.quickTo(orbital, 'x', { duration: .7, ease: 'power2.out', onUpdate: sendOrbit });
        const yTo = gsap.quickTo(orbital, 'y', { duration: .7, ease: 'power2.out', onUpdate: sendOrbit });
        hero.addEventListener('pointermove', event => {
          const rect = hero.getBoundingClientRect();
          xTo((event.clientX - rect.left) / rect.width * 2 - 1);
          yTo((event.clientY - rect.top) / rect.height * 2 - 1);
        }, eventOptions);
        hero.addEventListener('pointerleave', () => { xTo(0); yTo(0); }, eventOptions);
      }
      ScrollTrigger.create({ start: 0, end: 'max', onUpdate: self => root.style.setProperty('--scroll-progress', self.progress.toFixed(4)) });
      gsap.fromTo(timeline, { '--sequence-progress': 0 }, { '--sequence-progress': 1, ease: 'none',
        scrollTrigger: { trigger: timeline, start: 'top 65%', end: 'bottom 55%', scrub: .35 } });
      rows.forEach(row => {
        if (!document.querySelector('.project-assembly')) ScrollTrigger.create({ trigger: row, start: 'top 65%', end: 'bottom 55%', toggleClass: 'is-current' });
        gsap.from(row.querySelector('div'), { x: 22, duration: .65, ease: 'power3.out', clearProps: 'transform',
          scrollTrigger: { trigger: row, start: 'top 85%', once: true } });
      });
      gsap.to('.apply-grid', { y: -60, ease: 'none', scrollTrigger: { trigger: '.apply', start: 'top bottom', end: 'bottom top', scrub: .7 } });
    }

    // Tab navigation and same-page links finish any relevant entrance immediately.
    document.addEventListener('focusin', event => {
      const section = event.target.closest('section');
      for (const [element, animation] of entrances) {
        if (element === section || section?.contains(element)) animation.progress(1);
      }
    }, { signal: abort.signal });
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(() => { if (!abort.signal.aborted) refresh(); });
    addEventListener('pageshow', refresh, eventOptions);
    return () => {
      abort.abort(); revealObserver.disconnect();
      rows.forEach(row => row.classList.remove('is-current'));
      root.style.removeProperty('--scroll-progress');
      timeline.style.removeProperty('--sequence-progress');
      document.body.classList.remove('gsap-motion');
      delete document.body.dataset.motionMode;
      orbital.x = orbital.y = orbital.scroll = 0;
      sendOrbit();
    };
  });
  return () => media.revert();
}

async function start() {
  const current = ++generation;
  if (reduced.matches || saver) return;
  // Older pages retain their scene; the cinematic page owns its lightweight engine.
  if (!machine.classList.contains('neural-machine')) {
    sceneObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      sceneObserver.disconnect();
      import('./scene-client.js?v=6').then(module => {
        if (current !== generation || reduced.matches) return;
        disposeScene = module.mountScene(machine, hero, 'orbital', reduced);
      }).catch(() => {});
    });
    sceneObserver.observe(machine);
  }
  try {
    const library = await import('./assets/vendor/gsap/gsap-scrolltrigger-3.15.0.min.mjs');
    if (current !== generation || reduced.matches) return;
    disposeMotion = mountMotion(library);
  } catch {
    // HTML, navigation, the CSS orbital graphic, and application links still work.
    disposeMotion();
  }
}
function stop() {
  generation++; sceneObserver?.disconnect(); disposeMotion(); disposeScene();
  disposeMotion = disposeScene = () => {};
}
reduced.addEventListener('change', () => { stop(); if (!reduced.matches) start(); });
addEventListener('pagehide', event => { if (!event.persisted) { stop(); navObserver.disconnect(); } });
start();

// The project preview is independent of GSAP and the 3D scene download.
(() => {
  const panel = document.querySelector('.project-assembly');
  if (!panel) return;
  const section = panel.closest('.sequence');
  const rows = [...section.querySelectorAll('.timeline > li')];
  const buttons = [...panel.querySelectorAll('[data-assembly-stage]')];
  const phases = ['Sketch your idea', 'Connect what you learn', 'Build a working project', 'Ready for Demo Day'];
  let visible = false, frame = 0, current = -1;
  function show(index) {
    if (current === index) return;
    current = index;
    panel.dataset.stage = String(index);
    panel.querySelector('.assembly-phase').textContent = phases[index];
    panel.querySelector('.assembly-step').textContent = `0${index + 1} / 04`;
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    rows.forEach((row, i) => row.classList.toggle('assembly-current', i === index));
  }
  function update() {
    frame = 0;
    // Keep a deliberate keyboard selection stable while its control has focus.
    if (reduced.matches || (panel.contains(document.activeElement) && document.activeElement.matches(':focus-visible'))) return;
    let index = 0;
    rows.forEach((row, i) => { if (row.getBoundingClientRect().top < innerHeight * .6) index = i; });
    show(index);
  }
  function schedule() { if (visible && !frame && !reduced.matches) frame = requestAnimationFrame(update); }
  buttons.forEach((button, index) => button.addEventListener('click', () => show(index)));
  panel.addEventListener('focusout', schedule);
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) schedule();
  });
  observer.observe(section);
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  reduced.addEventListener('change', () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (reduced.matches) show(3); else schedule();
  });
  show(reduced.matches ? 3 : 0);
  panel.classList.add('assembly-ready');
})();
