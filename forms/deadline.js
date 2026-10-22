/** A fixed UTC deadline: page reloads never restart the countdown. */
export function registrationDeadline(form = {}, event = {}) {
  return Date.parse(form.closesAtUtc || event.startUtc || '');
}

export function registrationClosed(form = {}, event = {}, now = Date.now()) {
  const deadline = registrationDeadline(form, event);
  return form.registrationOpen === false || Boolean(form.closesAtUtc && !Number.isFinite(deadline))
    || Number.isFinite(deadline) && now >= deadline;
}

export function countdownParts(deadline, now = Date.now()) {
  const total = Math.max(0, Math.ceil((deadline - now) / 1000));
  return { hours: Math.floor(total / 3600), minutes: Math.floor(total / 60) % 60, seconds: total % 60 };
}

export function countdownMarkup(closesAtUtc) {
  if (!Number.isFinite(Date.parse(closesAtUtc || ''))) return '';
  return '<div class="registration-countdown" role="timer" aria-live="off" aria-label="Registration closing time">'
    + '<svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><circle cx="14" cy="14" r="11"/><path d="M14 7v7l4 3"/><path class="countdown-second" d="M14 14V5"/></svg>'
    + '<span><span class="countdown-label">Registration closes in</span><span class="countdown-digits"><b data-hours>--</b><span> hours </span><b data-minutes>--</b><span> min </span><b data-seconds>--</b><span> sec</span></span></span></div>';
}

export function mountCountdown(element, deadline, onClose = () => {}) {
  if (!element || !Number.isFinite(deadline)) return () => {};
  let interval, closed = false;
  element.title = `Registration closes ${new Date(deadline).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'long' })}`;
  const tick = () => {
    const now = Date.now(), parts = countdownParts(deadline, now);
    if (now >= deadline) {
      element.classList.add('is-closed');
      element.querySelector('.countdown-label').textContent = 'Registration closed';
      element.querySelector('.countdown-digits').hidden = true;
      element.setAttribute('aria-label', 'Registration is closed');
      if (!closed) { closed = true; onClose(); }
      clearInterval(interval);
      return;
    }
    for (const [key, value] of Object.entries(parts)) element.querySelector(`[data-${key}]`).textContent = String(value).padStart(2, '0');
    element.setAttribute('aria-label', `Registration closes in ${parts.hours} hours, ${parts.minutes} minutes, ${parts.seconds} seconds`);
  };
  tick();
  if (!closed) interval = setInterval(tick, 1000);
  return () => clearInterval(interval);
}
