// All sponsors remain visible and scrollable without JavaScript.
const band = document.querySelector('.sponsor-band');
if (band) {
  const rail = band.querySelector('.sponsor-rail');
  const cards = [...rail.querySelectorAll('.sponsor-feature')];
  const controls = band.querySelector('.sponsor-controls');
  const previous = controls.querySelector('.sponsor-previous');
  const next = controls.querySelector('.sponsor-next');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  controls.querySelector('.sponsor-count').textContent = `${cards.length} sponsors`;

  const updateControls = () => {
    const maxScroll = rail.scrollWidth - rail.clientWidth;
    controls.hidden = maxScroll < 3;
    previous.disabled = rail.scrollLeft <= 2;
    next.disabled = rail.scrollLeft >= maxScroll - 2;
  };
  const browse = direction => {
    const step = cards[0].getBoundingClientRect().width + parseFloat(getComputedStyle(rail).columnGap);
    rail.scrollBy({ left: direction * step, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  };
  previous.addEventListener('click', () => browse(-1));
  next.addEventListener('click', () => browse(1));
  rail.addEventListener('scroll', updateControls, { passive: true });
  updateControls();
  const sizeObserver = 'ResizeObserver' in window ? new ResizeObserver(updateControls) : null;
  if (sizeObserver) sizeObserver.observe(rail);
  else addEventListener('resize', updateControls, { passive: true });

  let entranceObserver;
  if (!reducedMotion.matches && 'IntersectionObserver' in window) {
    entranceObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in-view');
        entranceObserver.unobserve(entry.target);
      }
    }, { threshold: .15 });
    cards.forEach(card => entranceObserver.observe(card));
  }
  addEventListener('pagehide', () => {
    sizeObserver?.disconnect();
    entranceObserver?.disconnect();
  }, { once: true });
  addEventListener('pageshow', event => {
    if (event.persisted) {
      sizeObserver?.observe(rail);
      cards.filter(card => !card.classList.contains('is-in-view')).forEach(card => entranceObserver?.observe(card));
      updateControls();
    }
  });
}
