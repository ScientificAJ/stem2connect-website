import { api } from './api.js';
import { mountRaceGame } from './race-ten.js';

const root = document.querySelector('#form-root');
const parameters = new URLSearchParams(location.search);
const previewMode = parameters.get('preview') === '1';
let disposeGame = () => {};
let disposeRegistration = () => {};
let renderGeneration = 0;
let lastPreviewScreen = null;
const arrow = '<span aria-hidden="true">↗</span>';
const spark = '<svg viewBox="0 0 54 54" aria-hidden="true"><path d="m27 4 5 18 18 5-18 5-5 18-5-18-18-5 18-5Z"/></svg>';
const underline = '<svg aria-hidden="true" viewBox="0 0 480 27" preserveAspectRatio="none"><path d="M4 14C103 2 278 24 474 8M49 24C197 12 344 18 429 22"/></svg>';
const pencil = '<svg class="pencil" viewBox="0 0 74 74" fill="none" aria-hidden="true"><path d="m15 49 32-32 12 12-32 32-15 3 3-15Z"/><path d="m47 17 5-5a5 5 0 0 1 7 0l5 5a5 5 0 0 1 0 7l-5 5M15 49l12 12m-9-9 29-29m-34 37 5 3M4 70c19-4 38-6 63-2"/></svg>';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const lines = value => escape(value).replace(/\r?\n/g, '<br>');

const designDefaults = {
  fontFamily: 'general', headingFont: 'cabinet', handwrittenFont: 'caveat',
  typeScale: 1, spacing: 1, contentWidth: 1248, cardRadius: 5, buttonRadius: 4,
  backgroundColor: '#fffaf2', surfaceColor: '#fffdf7', textColor: '#261e1c', accentColor: '#a7211d', secondaryColor: '#28734f',
  heroLayout: 'split', formSide: 'right', invitationOrder: ['game', 'speaker'], sectionOrder: ['reading', 'extras', 'takeaways', 'closing'], hiddenSections: []
};
const designFonts = { general: 'General,system-ui,sans-serif', cabinet: 'Cabinet,system-ui,sans-serif', space: 'Plex,monospace' };
/** The editor uses bounded design tokens, never arbitrary CSS or executable markup. */
export function sanitizeDesign(input = {}) {
  const value = input && typeof input === 'object' ? input : {};
  const d = { ...designDefaults };
  const choice = (key, allowed) => { if (allowed.includes(value[key])) d[key] = value[key]; };
  choice('fontFamily', Object.keys(designFonts)); choice('headingFont', Object.keys(designFonts)); choice('handwrittenFont', ['caveat', 'inherit']);
  choice('heroLayout', ['split', 'stacked']); choice('formSide', ['right', 'left']);
  for (const [key, min, max] of [['typeScale', .85, 1.25], ['spacing', .75, 1.5], ['contentWidth', 960, 1600], ['cardRadius', 0, 32], ['buttonRadius', 0, 32]]) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key])) d[key] = Math.max(min, Math.min(max, value[key]));
  }
  for (const key of ['backgroundColor', 'surfaceColor', 'textColor', 'accentColor', 'secondaryColor']) if (/^#[0-9a-f]{6}$/i.test(value[key] || '')) d[key] = value[key].toLowerCase();
  for (const key of ['invitationOrder', 'sectionOrder']) {
    const allowed = designDefaults[key], provided = Array.isArray(value[key]) ? value[key] : [];
    d[key] = [...new Set(provided.filter(item => allowed.includes(item))), ...allowed.filter(item => !provided.includes(item))];
  }
  d.hiddenSections = [...new Set((Array.isArray(value.hiddenSections) ? value.hiddenSections : []).filter(item => [...d.invitationOrder, ...d.sectionOrder].includes(item)))];
  return d;
}
function designMarkup(d, preview) {
  const styles = {
    '--paper': d.backgroundColor, '--sheet': d.surfaceColor, '--ink': d.textColor, '--red': d.accentColor, '--green': d.secondaryColor,
    '--body-font': designFonts[d.fontFamily], '--heading-font': designFonts[d.headingFont], '--handwritten-font': d.handwrittenFont === 'caveat' ? 'Caveat,cursive' : designFonts[d.headingFont],
    '--type-scale': d.typeScale, '--space': d.spacing, '--content-width': `${d.contentWidth}px`, '--card-radius': `${d.cardRadius}px`, '--button-radius': `${d.buttonRadius}px`
  };
  const customColors = ['backgroundColor', 'surfaceColor', 'textColor', 'accentColor', 'secondaryColor'].some(key => d[key] !== designDefaults[key]);
  return `class="form-page${preview ? ' is-studio-preview' : ''}" data-layout="${d.heroLayout}" data-form-side="${d.formSide}" data-custom-colors="${customColors}" data-custom-card-radius="${d.cardRadius !== 5}" data-custom-button-radius="${d.buttonRadius !== 4}" style="${escape(Object.entries(styles).map(([key, value]) => `${key}:${value}`).join(';'))}"`;
}


/** Do not let published content introduce executable or cross-protocol links. */
export function safeUrl(value, image = false) {
  const url = String(value || '').trim();
  if (!url || /[\u0000-\u0020\\]/.test(url)) return '';
  if (image && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(url) && url.length <= 220000) return url;
  if (!image && /^#[A-Za-z][\w-]*$/.test(url)) return url;
  if (/^\/(?!\/)/.test(url)) return /\.svg(?:[?#]|$)/i.test(url) && image ? '' : url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !(image && /\.svg$/i.test(parsed.pathname)) ? parsed.href : '';
  } catch { return ''; }
}

function link(url, label, className = '', suffix = arrow) {
  const safe = safeUrl(url);
  if (!safe) return `<span class="${escape(className)}">${lines(label)}</span>`;
  const external = safe.startsWith('https:');
  return `<a class="${escape(className)}" href="${escape(safe)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${lines(label)} ${suffix}${external ? '<span class="sr-only"> (opens a new tab)</span>' : ''}</a>`;
}

function picture(url, alt, attrs = '') {
  const safe = safeUrl(url, true);
  return safe ? `<img src="${escape(safe)}" alt="${escape(alt)}" ${attrs}>` : '';
}

function contact(brand, label = brand.contactEmail) {
  const email = String(brand.contactEmail || '').trim();
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)
    ? `<a href="mailto:${escape(email)}">${escape(label || email)}</a>` : escape(label || '');
}

function emailDelivery(config) {
  if (config.delivery && typeof config.delivery === 'object') return config.delivery;
  if (!config.emails) return null;
  return { confirmation: Boolean(config.emails.enabled && config.emails.confirmation?.enabled), dayBefore: Boolean(config.emails.enabled && config.emails.day_before?.enabled), tenMinutes: Boolean(config.emails.enabled && config.emails.ten_minutes?.enabled) };
}

function deliveryHelp(delivery) {
  if (!delivery) return '';
  const reminders = delivery.dayBefore || delivery.tenMinutes;
  if (delivery.confirmation && reminders) return 'For your confirmation, meeting link, and scheduled webinar reminders.';
  if (delivery.confirmation) return 'For your registration confirmation and meeting link.';
  if (reminders) return 'For the scheduled webinar reminders. Save the meeting link after registering.';
  return 'For the organizers to manage your registration and contact you about this session. Save the meeting link after registering; automatic emails are not enabled for this form.';
}

function fieldMarkup(field, index) {
  const id = `answer-${index}`;
  const type = ['text', 'email', 'textarea', 'select', 'checkbox', 'number', 'date', 'url', 'tel'].includes(field.type) ? field.type : 'text';
  const maxLength = Math.max(1, Math.min(10000, Number(field.maxLength) || 1000));
  const attributes = `id="${id}" name="${escape(field.id)}" data-field-index="${index}" aria-describedby="${id}-hint ${id}-error"${field.required ? ' required' : ''}`;
  const placeholder = `placeholder="${escape(field.placeholder)}"`;
  const label = `${lines(field.label)}${field.required ? ' <span class="required">*</span>' : ''}`;
  let control;
  if (type === 'textarea') control = `<textarea ${attributes} rows="${Math.min(15, Math.max(2, Number(field.rows) || 3))}" maxlength="${maxLength}" ${placeholder}></textarea>`;
  else if (type === 'select') control = `<select ${attributes}><option value="">${escape(field.placeholder || 'Select one')}</option>${(field.options || []).map(option => { const value = typeof option === 'object' ? option.value : option; const label = typeof option === 'object' ? option.label : option; return `<option value="${escape(value)}">${escape(label)}</option>`; }).join('')}</select>`;
  else if (type === 'checkbox') control = `<div class="custom-check"><input ${attributes} type="checkbox" value="yes"><label for="${id}">${label}</label></div>`;
  else control = `<input ${attributes} type="${type}" maxlength="${maxLength}" ${placeholder} ${type === 'email' ? 'inputmode="email"' : ''} autocomplete="${escape(field.autocomplete || (field.semantic === 'name' ? 'name' : field.semantic === 'email' ? 'email' : 'off'))}"${type === 'number' ? ' step="any"' : ''}>`;
  return `<div class="field ${field.width === 'half' ? 'half-field' : 'full-field'}">${type !== 'checkbox' ? `<label for="${id}">${label}</label>` : ''}${control}<span class="field-hint" id="${id}-hint">${lines(field.help)}</span>${type === 'textarea' ? `<span class="field-hint question-count" data-count-for="${id}">0 / ${maxLength.toLocaleString()}</span>` : ''}<span class="field-error" id="${id}-error"></span></div>`;
}

function gameMarkup(game) {
  if (!game?.enabled || game.type !== 'race-ten') return '';
  return `<section class="strategy-game" id="strategy-game" aria-labelledby="game-title">
    <div class="race-eyebrow"><span>${escape(game.eyebrow)}</span><span class="race-handwritten">${escape(game.annotation)}</span></div>
    <h2 id="game-title">${escape(game.title || 'Race to 10.').replace(/10\.$/, '<em>10.</em>')}</h2>
    <p class="race-rules" id="race-rules">${lines(game.rules || 'Start at 0. You and the computer take turns adding 1 or 2. Reach 10 on your turn to win. You go first.')}</p>
    <div class="race-playfield" id="race-playfield" data-turn="you"><div class="race-scoreboard"><div><span class="race-label">${escape(game.scoreLabel || 'THE RUNNING TOTAL')}</span><p class="race-total"><strong id="race-total">0</strong><span>/ 10</span></p></div><span class="race-turn" id="race-turn">Your turn</span></div>
    <ol class="race-track" aria-label="Progress from 0 to 10" id="race-track">${Array.from({ length: 11 }, (_, i) => `<li data-position="${i}"${!i ? ' aria-current="step"' : ''}>${i}</li>`).join('')}</ol>
    <div class="race-choices" role="group" aria-label="Choose how much to add" aria-describedby="race-rules"><button type="button" data-add="1" disabled><strong>Add 1</strong><span>0 → 1</span></button><button type="button" data-add="2" disabled><strong>Add 2</strong><span>0 → 2</span></button></div>
    <p class="race-feedback" id="race-feedback" role="status" aria-live="polite" aria-atomic="true">Choose your first move. Can you find a winning pattern?</p><div class="race-controls"><span class="race-key"><span>You</span><span>Computer</span></span><button type="button" id="race-reset" disabled>${escape(game.resetLabel || 'Start over')} <span aria-hidden="true">↺</span></button></div><p class="race-history" id="race-history" aria-label="Moves played">Your moves will appear here.</p></div>
    <details class="race-explanation"><summary>${escape(game.strategyLabel || 'Reveal the strategy')} <span aria-hidden="true">✧</span></summary><div><p class="race-handwritten">${lines(game.strategyHeading || 'Start at the end. Work backwards.')}</p><p>${lines(game.strategyBody || 'Finish your turns at 1 → 4 → 7 → 10. After the computer adds 1, add 2; after it adds 2, add 1. Together, the two moves always add 3.')}</p><p>${lines(game.strategyFootnote || 'The computer checks the possible continuations and chooses a winning move whenever one exists. Finding the outcome of every position is what it means to solve a game.')}</p></div></details>
    <p class="race-source">${escape(game.sourceIntro || 'Adapted from')} ${link(game.sourceUrl, game.sourceLabel, '', '<span aria-hidden="true">↓</span>')}.</p></section>`;
}

function readingMarkup(reading) {
  if (!reading?.enabled) return '';
  return `<section class="research-reading" id="recommended-reading" aria-labelledby="reading-title"><div class="reading-intro"><span class="reading-kicker">${escape(reading.kicker)}</span><h2 id="reading-title">${lines(reading.title)}<br><em>${lines(reading.titleAccent)}</em></h2><p>${lines(reading.introduction)}</p><svg class="reading-spark" viewBox="0 0 140 85" fill="none" aria-hidden="true"><path d="M10 58c27-34 58-38 105-25m-15-16 20 17-23 7M37 12l3 10 11 3-11 3-3 11-3-11-11-3 11-3 3-10Z"/><path d="m113 56 2 7 8 2-8 2-2 8-2-8-8-2 8-2Z"/></svg></div>
    <article class="research-paper"><div class="paper-meta"><span>${escape(reading.paperLabel)}</span><span>${escape(reading.meta)}</span></div><h3>${lines(reading.titlePaper)}</h3><p class="paper-subtitle">${lines(reading.subtitle)}</p><p class="paper-authors">${lines(reading.authors)}</p><p class="paper-context">${lines(reading.context)}</p>${reading.guideTitle || reading.guideText ? `<div class="reading-guide"><strong>${escape(reading.guideTitle)}</strong><p>${lines(reading.guideText)}</p></div>` : ''}${link(reading.url, reading.linkLabel, 'paper-read')}</article></section>`;
}

export function renderForm(config, { preview = false, slug = parameters.get('form') || '', screen = 'page' } = {}) {
  const previewPosition = { left: window.scrollX || 0, top: window.scrollY || 0 };
  disposeGame(); disposeRegistration(); renderGeneration++;
  const generation = renderGeneration;
  const original = config || {};
  const design = sanitizeDesign(original.design);
  const hidden = new Set(design.hiddenSections);
  const c = { ...original, game: { ...original.game, enabled: Boolean(original.game?.enabled) && !hidden.has('game') }, speaker: { ...original.speaker, enabled: Boolean(original.speaker?.enabled) && !hidden.has('speaker') }, reading: { ...original.reading, enabled: Boolean(original.reading?.enabled) && !hidden.has('reading') } };
  if (!c.reading.enabled && c.game.sourceUrl === '#recommended-reading') c.game.sourceUrl = c.reading.url || '';

  const brand = c.brand || {}, hero = c.hero || {}, event = c.event || {}, speaker = c.speaker || {}, form = c.form || {}, reading = c.reading || {};
  const delivery = emailDelivery(c);
  const fields = Array.isArray(c.fields) ? c.fields.slice(0, 30).map(field => field.semantic === 'email' && delivery && /^For your confirmation, Zoom link, and reminders/.test(field.help || '') ? { ...field, help: deliveryHelp(delivery) } : field) : [];
  let optionalDivider = false;
  const fieldHtml = fields.map((field, i) => {
    const divider = !optionalDivider && !field.required && form.optionalHeading;
    if (divider) optionalDivider = true;
    return `${divider ? `<div class="optional-divider"><span>${escape(form.optionalHeading)}</span><span>${escape(form.optionalLabel)}</span></div>` : ''}${fieldMarkup(field, i)}`;
  }).join('');
  const invitationParts = { game: gameMarkup(c.game), speaker: speaker.enabled ? `<section class="speaker" aria-labelledby="speaker-name">${safeUrl(speaker.imageUrl, true) ? `<div class="portrait-frame">${picture(speaker.imageUrl, speaker.imageAlt, 'width="360" height="540" loading="lazy"')}<span class="portrait-caption">${escape(speaker.caption)}</span></div>` : ''}<div class="speaker-copy"><p class="tiny-label">${escape(speaker.eyebrow)}</p><h2 id="speaker-name">${lines(speaker.name)}</h2><p>${lines(speaker.role)}<br>${lines(speaker.organization)}</p>${speaker.bio ? `<p>${lines(speaker.bio)}</p>` : ''}${link(speaker.profileUrl, speaker.linkLabel)}</div></section>` : '' };
  const invitationModules = design.invitationOrder.map(key => invitationParts[key]).join('');
  const lowerParts = { reading: readingMarkup(reading), extras: (c.extras || []).filter(item => item.enabled !== false).map(item => `<section data-extra-index="${c.extras.indexOf(item)}" class="extra-block${safeUrl(item.imageUrl, true) ? ' has-image' : ''}">${safeUrl(item.imageUrl, true) ? `<div class="extra-image">${picture(item.imageUrl, item.imageAlt, 'loading="lazy"')}</div>` : ''}<div><h2>${lines(item.title)}</h2><p>${lines(item.text)}</p>${item.linkUrl ? link(item.linkUrl, item.linkLabel || 'Learn more', 'extra-link') : ''}</div></section>`).join(''), takeaways: c.takeaways?.length ? `<section class="takeaway-strip" aria-label="What to expect">${c.takeaways.map((item, i) => `<div><span class="takeaway-number">${String(i + 1).padStart(2, '0')}</span><h2>${lines(item.title)}</h2><p>${lines(item.text)}</p></div>`).join('')}</section>` : '', closing: `<div class="closing-note">${spark}<p>${escape(c.closing?.text)} <span>${escape(c.closing?.accent)}</span></p>${spark}</div>` };
  const lowerModules = design.sectionOrder.filter(key => !hidden.has(key)).map(key => lowerParts[key]).join('');
  document.title = c.meta?.title || 'Registration · STEM2Connect';
  document.querySelector('meta[name="description"]')?.setAttribute('content', c.meta?.description || '');
  document.querySelector('meta[name="robots"]')?.setAttribute('content', preview || c.meta?.noindex !== false ? 'noindex, nofollow' : 'index, follow');
  root.innerHTML = `<div ${designMarkup(design, preview)}>${preview ? '<div class="preview-notice" role="status">STUDIO PREVIEW · Registration is disabled · Draft changes are not live · Click a section to edit it</div>' : ''}<a class="skip-link" href="#registration">Skip to registration</a>
    <header class="masthead"><a class="brand" href="${escape(safeUrl(brand.homeUrl) || '/')}">${picture(brand.logoUrl, '', 'width="42" height="42"')}<span>${escape(brand.name)}</span></a><span class="masthead-note">${escape(brand.tagline)} <em>${escape(brand.taglineAccent)}</em></span><a class="header-register" href="#registration">${escape(brand.headerCta)} ${arrow}</a></header>
    <main id="main"><div class="page-heading"><span><i aria-hidden="true"></i> ${escape(hero.series)}</span><span>${escape(hero.eventLabel)}</span></div><div class="invitation-layout"><section class="invitation" aria-labelledby="event-heading"><div class="hero-copy"><div class="chapter-label"><span>${escape(hero.chapter)}</span><svg aria-hidden="true" viewBox="0 0 91 28"><path d="M2 17C21 3 43 5 76 17M66 3l13 14-20 6"/></svg></div>
    <h1 id="event-heading">${lines(hero.title)} ${hero.titleAccent ? `<span class="written-title">${lines(hero.titleAccent)}${underline}</span>` : ''}</h1><p class="subject">${lines(hero.subject)}<br><span>${lines(hero.byline)}</span></p><p class="introduction">${lines(hero.introduction)}</p>
    </div><div class="event-details"><div class="date-stamp" aria-hidden="true"><span>${escape(event.month)}</span><strong>${escape(event.day)}</strong><span>${escape(event.weekday)}</span></div><div class="event-time"><p><time datetime="${escape(event.startUtc)}">${escape(event.displayDate)} · ${escape(event.displayTime)}</time></p><p class="local-time" id="local-time">${escape(event.timeZone)}</p><div class="event-format"><span><svg aria-hidden="true" viewBox="0 0 20 20"><rect x="2" y="4" width="11" height="12" rx="2"/><path d="m13 8 5-3v10l-5-3"/></svg>${escape(hero.format || event.location)}</span><span>${escape(hero.sessionFormat)}</span></div></div></div>
    ${reading.enabled ? `<a class="reading-jump" href="#recommended-reading"><span>${escape(reading.jumpLabel)}</span><span>${escape(reading.jumpHint)} <b aria-hidden="true">↓</b></span></a>` : ''}
    ${invitationModules}</section>
    <section class="registration-panel" id="registration" aria-labelledby="registration-heading"><div class="paper-tab" aria-hidden="true">${escape(form.tab)}</div><div class="form-heading"><span class="tiny-label">${escape(form.chapter)}</span>${pencil}<h2 id="registration-heading">${lines(form.title)}<br><em>${lines(form.titleAccent)}</em></h2><p>${lines(form.description)}</p></div>
    ${form.registrationOpen === false ? `<p class="registration-closed" role="status">${lines(form.closedMessage || 'Registration is closed.')}</p><p class="privacy-note">${contact(brand)}</p>` : `<form id="registration-form" novalidate><div class="dynamic-fields">${fieldHtml}</div><div class="contact-trap" aria-hidden="true"><label for="contact-website">Website</label><input id="contact-website" name="website" type="text" tabindex="-1" autocomplete="off"></div><div class="consent-field"><input id="privacy-consent" type="checkbox" required value="yes" aria-describedby="consent-error"><label for="privacy-consent">${lines(form.consentText)} <span class="required">*</span></label></div><span class="field-error" id="consent-error"></span><button class="submit-button" type="submit"${preview ? ' disabled' : ''}><span>${escape(form.submitLabel)}</span><svg viewBox="0 0 26 20" fill="none" aria-hidden="true"><path d="M2 10h21M16 3l7 7-7 7"/></svg><svg class="drawn-outline" viewBox="0 0 440 60" preserveAspectRatio="none" aria-hidden="true"><path d="M3 5 435 3 437 55 4 57Z"/></svg></button><p class="form-status" id="form-status" role="status" aria-live="polite">${preview ? 'Preview only. No responses or emails will be created.' : ''}</p><p class="privacy-note">${lines(form.privacyText)} ${contact(brand)}.</p><p class="required-note">${escape(form.requiredNote)}</p></form>`}
    <div class="registration-success" id="registration-success" tabindex="-1" hidden></div><div class="paper-bottom"><span>${escape(form.bottomBrand)}</span><span>${escape(form.bottomTagline)}</span></div></section></div>
    ${lowerModules}</main><footer>${link(brand.homeUrl, brand.name, '', '')}<span>${escape(brand.footerTagline)}</span>${contact(brand, brand.contactLabel)}</footer></div>`;
  try { const start = new Date(event.startUtc); if (Number.isFinite(start.valueOf())) { const local = root.querySelector('#local-time'); local.textContent = `Your time: ${new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(start)}`; local.title = Intl.DateTimeFormat().resolvedOptions().timeZone; } } catch { /* Printed event time remains available. */ }
  for (const image of root.querySelectorAll('img')) image.addEventListener('error', () => { image.classList.add('image-unavailable'); image.setAttribute('title', image.alt || 'Image unavailable'); });
  disposeGame = mountRaceGame(root.querySelector('#strategy-game'));
  disposeRegistration = wireRegistration(c, { preview, slug, generation: renderGeneration });
  if (preview && screen === 'confirmation') {
    const formElement = root.querySelector('#registration-form');
    if (formElement) formElement.hidden = true;
    root.querySelector('.form-heading')?.setAttribute('hidden', '');
    root.querySelector('.registration-closed')?.setAttribute('hidden', '');
    showSuccess({ event: c.event, form: c.form, speakerName: c.speaker?.name, delivery: emailDelivery(c) }, c, slug, { preview: true });
  }
  if (preview) {
    wirePreviewEditing();
    const nextScreen = screen === 'confirmation' ? 'confirmation' : 'page';
    requestAnimationFrame(() => {
      // A newer edit supersedes this render, including its scroll instruction.
      if (generation !== renderGeneration) return;
      if (nextScreen !== lastPreviewScreen) {
        if (nextScreen === 'confirmation') root.querySelector('#registration-success')?.scrollIntoView({ behavior: 'instant', block: 'start' });
        else window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
      } else window.scrollTo({ ...previewPosition, behavior: 'instant' });
      lastPreviewScreen = nextScreen;
    });
  }
}


/** Preview selection is available only inside the authenticated same-origin editor. */
function wirePreviewEditing() {
  const page = root.querySelector('.is-studio-preview');
  if (!page) return;
  const sectionMap = { '.masthead':'brand', '.page-heading':'hero', '.hero-copy':'hero', '.event-details':'event', '.reading-jump':'reading', '.strategy-game':'game', '.speaker':'speaker', '.registration-panel':'form', '.dynamic-fields':'fields', '.registration-success':'confirmation', '.zoom-access':'event', '.research-reading':'reading', '.takeaway-strip':'takeaways', '.extra-block':'extras', '.closing-note':'closing', 'footer':'brand' };
  const mark = (element, section, field = '') => {
    if (!element) return;
    element.dataset.studioSection = section;
    if (field) element.dataset.studioField = field;
    element.dataset.studioLabel = `Edit ${field ? field.split('.').slice(-1)[0].replace(/([A-Z])/g, ' $1').toLowerCase() : section}`;
  };
  for (const [selector, section] of Object.entries(sectionMap)) for (const element of page.querySelectorAll(selector)) {
    mark(element, section); element.setAttribute('tabindex', '0');
  }
  const fields = {
    '.brand img':'brand.logoUrl', '.brand>span':'brand.name', '.masthead-note':'brand.tagline', '.masthead-note em':'brand.taglineAccent', '.header-register':'brand.headerCta',
    '.page-heading>span:first-child':'hero.series', '.page-heading>span:last-child':'hero.eventLabel', '.chapter-label>span':'hero.chapter', '#event-heading':'hero.title', '.written-title':'hero.titleAccent', '.subject':'hero.subject', '.subject>span':'hero.byline', '.introduction':'hero.introduction',
    '.date-stamp>span:first-child':'event.month', '.date-stamp>strong':'event.day', '.date-stamp>span:last-child':'event.weekday', '.event-time time':'event.displayTime', '.local-time':'event.startUtc', '.event-format>span:first-child':'hero.format', '.event-format>span:last-child':'hero.sessionFormat',
    '.reading-jump>span:first-child':'reading.jumpLabel', '.reading-jump>span:last-child':'reading.jumpHint', '.portrait-frame img':'speaker.imageUrl', '.portrait-caption':'speaker.caption', '.speaker-copy>.tiny-label':'speaker.eyebrow', '#speaker-name':'speaker.name', '.speaker-copy>p:not(.tiny-label)':'speaker.role', '.speaker-copy>a':'speaker.linkLabel',
    '.paper-tab':'form.tab', '.form-heading>.tiny-label':'form.chapter', '#registration-heading':'form.title', '#registration-heading>em':'form.titleAccent', '.form-heading>p':'form.description', '.optional-divider>span:first-child':'form.optionalHeading', '.optional-divider>span:last-child':'form.optionalLabel', '.consent-field>label':'form.consentText', '.submit-button>span':'form.submitLabel', '.privacy-note':'form.privacyText', '.required-note':'form.requiredNote', '.paper-bottom>span:first-child':'form.bottomBrand', '.paper-bottom>span:last-child':'form.bottomTagline',
    '.reading-kicker':'reading.kicker', '#reading-title':'reading.title', '#reading-title>em':'reading.titleAccent', '.reading-intro>p':'reading.introduction', '.paper-meta>span:first-child':'reading.paperLabel', '.paper-meta>span:last-child':'reading.meta', '.research-paper h3':'reading.titlePaper', '.paper-subtitle':'reading.subtitle', '.paper-authors':'reading.authors', '.paper-context':'reading.context', '.reading-guide>strong':'reading.guideTitle', '.reading-guide>p':'reading.guideText', '.paper-read':'reading.linkLabel',
    '.race-eyebrow>span:first-child':'game.eyebrow', '.race-eyebrow>.race-handwritten':'game.annotation', '#game-title':'game.title', '#race-rules':'game.rules', '.race-label':'game.scoreLabel', '#race-reset':'game.resetLabel', '.race-explanation>summary':'game.strategyLabel', '.race-explanation .race-handwritten':'game.strategyHeading', '.race-source':'game.sourceIntro',
    '.closing-note>p':'closing.text', '.closing-note>p>span':'closing.accent', 'footer>span':'brand.footerTagline', 'footer>a:last-child':'brand.contactLabel',
    '.registration-success>.tiny-label':'form.successKicker', '.registration-success>h3':'form.successTitle', '.registration-success>h3>em':'form.successAccent', '.registration-success>p:first-of-type':'form.successDescription', '.zoom-access>.tiny-label':'form.meetingKicker', '.zoom-button':'event.meetingUrl', '.zoom-access>label':'form.meetingCopyLabel', '#zoom-meeting-link':'event.meetingUrl', '#copy-zoom-link':'form.meetingCopyButton', '.meeting-id':'event.meetingId', '#calendar-download':'form.calendarLabel'
  };
  for (const [selector, path] of Object.entries(fields)) for (const element of page.querySelectorAll(selector)) mark(element, path.startsWith('form.success') ? 'confirmation' : path.split('.')[0], path);
  for (const control of page.querySelectorAll('[data-field-index]')) {
    const index = control.dataset.fieldIndex, field = control.closest('.field');
    mark(field, 'fields', `fields.${index}.label`);
    mark(control, 'fields', `fields.${index}.placeholder`);
    mark(field?.querySelector('.field-hint'), 'fields', `fields.${index}.help`);
  }
  for (const [index, card] of [...page.querySelectorAll('.takeaway-strip>div')].entries()) {
    mark(card.querySelector('h2'), 'takeaways', `takeaways.${index}.title`); mark(card.querySelector('p'), 'takeaways', `takeaways.${index}.text`);
  }
  for (const card of page.querySelectorAll('.extra-block')) {
    const index = card.dataset.extraIndex;
    for (const [selector, key] of [['h2','title'],['p','text'],['img','imageUrl'],['a','linkLabel']]) mark(card.querySelector(selector), 'extras', `extras.${index}.${key}`);
  }
  const select = event => {
    const target = event.target.closest('[data-studio-section]');
    if (!target || !page.contains(target)) return;
    if (event.type === 'keydown' && (!(event.key === 'Enter' || event.key === ' ') || !event.target.matches('[data-studio-section][tabindex="0"]'))) return;
    try {
      const host = window.parent !== window ? window.parent : window.opener;
      if (!host || host.location.origin !== location.origin || !/^\/forms\/studio(?:\/|$)/.test(host.location.pathname)) return;
      if (event.type === 'keydown' || event.target.closest('a')) event.preventDefault();
      for (const old of page.querySelectorAll('.studio-selected')) old.classList.remove('studio-selected');
      target.classList.add('studio-selected');
      host.postMessage({ type: 'stem2connect-studio-select', section: target.dataset.studioSection, ...(target.dataset.studioField ? { field: target.dataset.studioField } : {}) }, location.origin);
    } catch { /* An embedded preview never communicates with an unrelated origin. */ }
  };
  page.addEventListener('click', select, true);
  page.addEventListener('keydown', select, true);
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const data = crypto.getRandomValues(new Uint8Array(16)); data[6] = data[6] & 15 | 64; data[8] = data[8] & 63 | 128;
  const hex = [...data].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function wireRegistration(config, { preview, slug, generation }) {
  const form = root.querySelector('#registration-form');
  if (!form) return () => {};
  const fields = (config.fields || []).slice(0, 30);
  const copy = config.form || {}, messages = copy.messages || {};
  const status = form.querySelector('#form-status');
  const submit = form.querySelector('[type="submit"]');
  const consent = form.querySelector('#privacy-consent');
  const controls = [...form.querySelectorAll('input,select,textarea,button')];
  let sending = false, submissionId = '', fingerprint = '', slowTimer;
  const error = (input, message) => { const target = root.querySelector(`#${input.id === 'privacy-consent' ? 'consent' : input.id}-error`); if (target) target.textContent = message; if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); };
  form.addEventListener('input', e => {
    error(e.target, '');
    if (e.target.tagName === 'TEXTAREA') { const count = form.querySelector(`[data-count-for="${e.target.id}"]`); if (count) count.textContent = `${e.target.value.length.toLocaleString()} / ${e.target.maxLength.toLocaleString()}`; }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (preview || sending) return;
    let firstInvalid;
    const values = Object.create(null);
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i], input = form.querySelector(`#answer-${i}`);
      const value = input.type === 'checkbox' ? (input.checked ? 'yes' : '') : input.value.trim();
      let message = '';
      if (field.required && !value) message = field.type === 'checkbox' ? 'Please check this box.' : 'Please complete this field.';
      else if (value && (!input.checkValidity() || (field.type === 'email' && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value)))) message = field.type === 'email' ? 'Please enter a valid email address.' : 'Please enter a valid value.';
      else if (value && field.type === 'url' && !safeUrl(value)) message = 'Please enter a valid HTTPS link.';
      error(input, message); if (message && !firstInvalid) firstInvalid = input;
      values[field.id] = value;
    }
    error(consent, consent.checked ? '' : 'Please agree to how your registration details will be used.');
    if (!consent.checked && !firstInvalid) firstInvalid = consent;
    if (firstInvalid) { status.textContent = messages.invalid || 'Please check the highlighted fields.'; firstInvalid.focus(); return; }
    const nextFingerprint = JSON.stringify(values);
    if (!submissionId || fingerprint !== nextFingerprint) { submissionId = uuid(); fingerprint = nextFingerprint; }
    const website = form.querySelector('#contact-website').value;
    sending = true; form.setAttribute('aria-busy', 'true'); controls.forEach(input => { input.disabled = true; });
    submit.querySelector('span').textContent = 'Saving your registration…'; status.textContent = messages.saving || 'Saving your registration…'; status.classList.add('is-pending');
    slowTimer = setTimeout(() => { if (sending) status.textContent = messages.slow || 'Still waiting for confirmation. Please keep this page open.'; }, 10000);
    try {
      const result = await api('register', { slug, submissionId, values, consent: 'yes', website });
      if (generation !== renderGeneration) return;
      if (!result?.registered || !result.confirmation) throw new Error('unconfirmed');
      showSuccess(result.confirmation, config, slug);
      form.hidden = true; root.querySelector('.form-heading').hidden = true;
    } catch (failure) {
      if (generation !== renderGeneration) return;
      const code = failure.code || failure.error?.code;
      status.textContent = code === 'closed' ? copy.closedMessage || 'Registration is now closed.' : code === 'invalid' ? messages.invalid || 'Please check your details and try again.' : code === 'rate_limited' || code === 'busy' ? messages.busy || 'Please wait a moment and try again.' : code === 'timeout' ? messages.timeout || 'We could not confirm your registration. Retry safely with the same details.' : messages.unavailable || 'Registration could not be confirmed. Please try again.';
    } finally {
      clearTimeout(slowTimer); sending = false; form.removeAttribute('aria-busy'); controls.forEach(input => { input.disabled = false; }); submit.querySelector('span').textContent = copy.submitLabel; status.classList.remove('is-pending');
    }
  });
  return () => clearTimeout(slowTimer);
}

function showSuccess(confirmation, config, slug, { preview = false } = {}) {
  const event = confirmation.event || {}, copy = confirmation.form || {}, name = confirmation.speakerName || '';
  const delivery = confirmation.delivery || emailDelivery(config);
  let description = copy.successDescription || 'Your registration has been saved.';
  if (delivery && description.startsWith('Your registration has been saved. We’ll email your confirmation and upcoming webinar reminders.')) {
    const reminders = delivery.dayBefore || delivery.tenMinutes;
    const mail = delivery.confirmation ? `We’ll email your confirmation${reminders ? ' and upcoming webinar reminders' : ''}. Check your spam folder, too. ` : reminders ? 'We’ll email your upcoming webinar reminders. Check your spam folder, too. ' : '';
    description = `Your registration has been saved. ${mail}Save the meeting link below or add it to your calendar so you have it on the day.`;
  }
  const container = root.querySelector('#registration-success');
  if (!container) return;
  const meetingUrl = safeUrl(event.meetingUrl);
  container.innerHTML = `<div class="success-stamp" aria-hidden="true"><svg viewBox="0 0 90 90"><circle cx="45" cy="45" r="37"/><path d="m25 44 14 15 28-30"/></svg></div><span class="tiny-label">${escape(copy.successKicker)}</span><h3>${lines(copy.successTitle || 'You’re registered.')}<br><em>${lines(copy.successAccent)}</em></h3><p>${lines(description)}</p>${delivery && !delivery.confirmation && !delivery.dayBefore && !delivery.tenMinutes ? '<p class="delivery-note">Automatic emails are not enabled for this form. Keep your meeting details below.</p>' : ''}<div class="success-event"><strong>${lines(name)}</strong><span>${escape(event.displayDate)} · ${escape(event.displayTime)}</span><span>${escape(event.location)}</span></div>
    ${meetingUrl ? `<div class="zoom-access"><span class="tiny-label">${escape(copy.meetingKicker)}</span>${link(meetingUrl, copy.meetingLinkLabel || 'Open meeting', 'zoom-button')}<label for="zoom-meeting-link">${escape(copy.meetingCopyLabel || 'Keep this meeting link')}</label><div class="zoom-copy-row"><input id="zoom-meeting-link" type="url" value="${escape(meetingUrl)}" readonly aria-describedby="zoom-copy-status"><button type="button" id="copy-zoom-link">${escape(copy.meetingCopyButton || 'Copy link')}</button></div>${event.meetingId ? `<p class="meeting-id">${escape(copy.meetingIdLabel || 'Meeting ID')}: <span>${escape(event.meetingId)}</span></p>` : ''}<p id="zoom-copy-status" class="zoom-copy-status" role="status" aria-live="polite"></p></div>` : ''}
    ${Number.isFinite(Date.parse(event.startUtc)) ? `<button type="button" class="calendar-button" id="calendar-download">${escape(copy.calendarLabel || 'Add to my calendar')} ${arrow}</button>` : ''}<p class="privacy-note">Questions? ${contact(config.brand || {})}</p>`;
  container.hidden = false;
  if (!preview) { container.focus({ preventScroll: true }); container.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' }); }
  if (preview) return;
  container.querySelector('#copy-zoom-link')?.addEventListener('click', async () => {
    let copied = false;
    try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(meetingUrl); copied = true; } } catch { /* Selected text fallback follows. */ }
    if (!copied) { const input = container.querySelector('#zoom-meeting-link'); input.focus(); input.select(); input.setSelectionRange(0, input.value.length); try { copied = document.execCommand('copy'); } catch { /* Browser copy command remains available. */ } }
    container.querySelector('#zoom-copy-status').textContent = copied ? copy.messages?.copySuccess || 'Meeting link copied.' : copy.messages?.copyFallback || 'The link is selected. Copy it with your device’s copy command.';
  });
  container.querySelector('#calendar-download')?.addEventListener('click', () => {
    const content = createCalendar(event, slug, config.brand?.contactEmail || '');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = /^[A-Za-z0-9._-]+\.ics$/.test(event.calendarFileName || '') ? event.calendarFileName : `STEM2Connect-${slug || 'event'}.ics`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

/** Fold by UTF-8 octets, not UTF-16 characters; preserve international event titles. */
export function createCalendar(event, slug, email = '', now = new Date()) {
  const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const text = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const url = safeUrl(event.meetingUrl);
  const rows = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//STEM2Connect//Form Studio//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:${String(slug).replace(/[^a-z0-9-]/gi, '') || 'event'}-${Date.parse(event.startUtc)}@stem2connect.org`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(new Date(event.startUtc))}`, `SUMMARY:${text(event.calendarTitle || 'STEM2Connect event')}`, `LOCATION:${text(event.location || url)}`, ...(url ? [`URL:${url}`] : []), `DESCRIPTION:${text([event.calendarDescription, url ? `Join: ${url}` : '', event.meetingId ? `Meeting ID: ${event.meetingId}` : '', email ? `Questions: ${email}` : ''].filter(Boolean).join('\n'))}`, 'END:VEVENT', 'END:VCALENDAR', ''];
  const encoder = new TextEncoder();
  return rows.map(row => { let length = 0, folded = ''; for (const char of row) { const size = encoder.encode(char).length; if (length + size > 73) { folded += '\r\n '; length = 1; } folded += char; length += size; } return folded; }).join('\r\n');
}

function showUnavailable(message = 'This invitation is not available right now.') {
  disposeGame(); disposeRegistration();
  root.innerHTML = `<main class="form-loading form-error"><span class="tiny-label">STEM2CONNECT · FORM STUDIO</span><h1>A little<br><em>pause.</em></h1><p>${escape(message)}</p><a href="/">Visit STEM2Connect ${arrow}</a></main>`;
}

function trustedPreviewSource(event) {
  if (event.origin !== location.origin) return false;
  try {
    const source = window.parent !== window ? window.parent : window.opener;
    return source && event.source === source && source.location.origin === location.origin && /^\/forms\/studio(?:\/|$)/.test(source.location.pathname);
  } catch { return false; }
}

if (previewMode) {
  root.innerHTML = '<main class="form-loading" role="status"><span class="tiny-label">STEM2CONNECT · STUDIO PREVIEW</span><h1>Your next<br><em>discovery.</em></h1><p>Waiting for the private editor preview…</p></main>';
  window.addEventListener('message', event => {
    if (!trustedPreviewSource(event) || event.data?.type !== 'stem2connect-studio-preview' || !event.data.config || typeof event.data.config !== 'object') return;
    try { renderForm(event.data.config, { preview: true, screen: event.data.screen === 'confirmation' ? 'confirmation' : 'page' }); } catch { showUnavailable('The draft could not be displayed. Check the fields in the editor.'); }
  });
  const source = window.parent !== window ? window.parent : window.opener;
  if (source) source.postMessage({ type: 'stem2connect-studio-preview-ready' }, location.origin);
} else {
  const slug = parameters.get('form') || '';
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)) showUnavailable('This invitation link is incomplete. Please use the full link shared by the organizer.');
  else api('publicGet', { slug }).then(result => {
    if (!result?.config || result.slug !== slug) throw new Error('unavailable');
    renderForm(result.config, { slug });
  }).catch(error => showUnavailable(error.code === 'not_found' || error.code === 'closed' ? 'This invitation is not published, or registration has been closed by the organizer.' : 'We could not open this invitation. Please refresh in a moment or contact the organizer.'));
}
