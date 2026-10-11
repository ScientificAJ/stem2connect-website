import { submitRegistration, createSubmissionId } from './registration-transport.js';

const EVENT_START = new Date('2026-10-23T00:00:00Z');
const CONTACT = 'stem2connect@gmail.com';
const ZOOM_URL = 'https://ethz.zoom.us/j/68701406358?from=addon';
const ZOOM_MEETING_ID = '687 0140 6358';
const form = document.querySelector('#registration-form');
const submitButton = form.querySelector('[type="submit"]');
const submitLabel = submitButton.querySelector('span');
const status = document.querySelector('#form-status');
const success = document.querySelector('#registration-success');
const nameInput = form.elements.namedItem('name');
const emailInput = form.elements.namedItem('email');
const consentInput = form.elements.namedItem('privacyConsent');
const question = form.elements.namedItem('question');
let endpoint = '';
let sending = false;
let submissionId = '';
let lastPayload = '';

// The event is fixed in UTC so visitor timezones and DST are handled by Intl.
try {
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localTime = new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  }).format(EVENT_START);
  const local = document.querySelector('#local-time');
  local.textContent = `Your time: ${localTime}`;
  local.title = localZone || '';
} catch (_) { /* Keep the correct printed Pacific time if Intl is unavailable. */ }

function showStatus(message, pending = false) {
  status.classList.toggle('is-pending', pending);
  status.replaceChildren(document.createTextNode(message));
}

function showUnavailable(message) {
  showStatus(`${message} `);
  const contact = document.createElement('a');
  contact.href = `mailto:${CONTACT}`;
  contact.textContent = `Contact ${CONTACT}`;
  status.append(contact, document.createTextNode('.'));
}

function setError(input, message) {
  const errorId = input === nameInput ? 'name-error' : input === emailInput ? 'email-error' : 'consent-error';
  document.getElementById(errorId).textContent = message;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function validate() {
  let firstInvalid;
  const checks = [
    [nameInput, nameInput.value.trim() ? '' : 'Please enter your name.'],
    [emailInput, /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(emailInput.value.trim()) && emailInput.validity.valid ? '' : 'Please enter a valid email address.'],
    [consentInput, consentInput.checked ? '' : 'Please agree to how your registration details will be used.']
  ];
  for (const [input, error] of checks) {
    setError(input, error);
    if (error && !firstInvalid) firstInvalid = input;
  }
  if (firstInvalid) {
    showStatus('Please check the highlighted fields.');
    firstInvalid.focus();
    return false;
  }
  return true;
}

function readFields() {
  return {
    name: nameInput.value.trim(), email: emailInput.value.trim(),
    educationLevel: form.elements.namedItem('educationLevel').value,
    school: form.elements.namedItem('school').value.trim(),
    country: form.elements.namedItem('country').value.trim(),
    question: question.value.trim(), privacyConsent: consentInput.checked ? 'yes' : '',
    website: form.elements.namedItem('website').value
  };
}

form.addEventListener('input', event => {
  if ([nameInput, emailInput, consentInput].includes(event.target)) setError(event.target, '');
  if (event.target === question) document.querySelector('#question-count').textContent = `${question.value.length.toLocaleString()} / 1,000`;
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (sending) return;
  if (!endpoint) {
    showUnavailable('Registration is not available just yet.');
    return;
  }
  if (!validate()) return;
  const fields = readFields();
  const fingerprint = JSON.stringify(fields);
  try {
    // Reusing the ID on a retry lets the receiver safely confirm an earlier save.
    if (!submissionId || fingerprint !== lastPayload) {
      submissionId = createSubmissionId();
      lastPayload = fingerprint;
    }
  } catch (_) {
    showUnavailable('This browser could not securely send your registration.');
    return;
  }
  sending = true;
  form.setAttribute('aria-busy', 'true');
  const controls = [...form.querySelectorAll('input,select,textarea,button')];
  controls.forEach(control => { control.disabled = true; });
  submitLabel.textContent = 'Saving your registration…';
  showStatus('One moment while we save your registration.', true);
  const slowNotice = window.setTimeout(() => {
    if (sending) showStatus('Still waiting for confirmation. Please keep this page open.', true);
  }, 10000);
  try {
    const acknowledgment = await submitRegistration({ endpoint, fields, submissionId });
    if (!acknowledgment?.ok || acknowledgment.code !== 'registered') throw new Error('unconfirmed');
    document.querySelector('#open-zoom').href = ZOOM_URL;
    document.querySelector('#zoom-meeting-link').value = ZOOM_URL;
    document.querySelector('#zoom-meeting-id').textContent = ZOOM_MEETING_ID;
    form.hidden = true;
    document.querySelector('.form-heading').hidden = true;
    success.hidden = false;
    success.focus({ preventScroll: true });
    success.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
  } catch (error) {
    if (error.code === 'timeout') {
      showStatus('We could not confirm your registration yet. Please try again; the same registration will not be counted twice.');
    } else if (error.code === 'invalid') {
      showStatus('Your registration could not be accepted. Please check your details and try again.');
    } else if (error.code === 'busy') {
      showStatus('Registration is busy for a moment. Please try again shortly.');
    } else {
      showUnavailable('We could not confirm your registration. Please try again, or');
    }
  } finally {
    window.clearTimeout(slowNotice);
    sending = false;
    form.removeAttribute('aria-busy');
    controls.forEach(control => { control.disabled = false; });
    submitLabel.textContent = 'Register for the webinar';
  }
});

async function connectRegistration() {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(new URL('./config.json', import.meta.url), { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
    if (!response.ok) throw new Error('unavailable');
    const config = await response.json();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.endpoint || '')) throw new Error('unavailable');
    endpoint = config.endpoint;
    submitButton.disabled = false;
    showStatus('');
  } catch (_) {
    showUnavailable('Registration is not available just yet.');
  } finally { window.clearTimeout(timer); }
}

document.querySelector('#copy-zoom-link').addEventListener('click', async () => {
  if (success.hidden) return;
  const input = document.querySelector('#zoom-meeting-link');
  const copyStatus = document.querySelector('#zoom-copy-status');
  const copyButton = document.querySelector('#copy-zoom-link');
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(ZOOM_URL);
      copied = true;
    }
  } catch (_) { /* A denied clipboard permission falls through to selection. */ }
  if (!copied) {
    input.focus({ preventScroll: true });
    input.select();
    input.setSelectionRange(0, input.value.length);
    try { copied = document.execCommand('copy'); } catch (_) { /* Keep the link selected. */ }
  }
  copyStatus.textContent = copied ? 'Zoom link copied. Save it for the webinar.' : 'The link is selected. Copy it with your device’s copy command, or press Ctrl+C / ⌘C.';
  if (copied) copyButton.focus({ preventScroll: true });
});

function createCalendar(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const escapeText = text => text.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const description = `STEM2Connect webinar with Professor Dan Garcia of UC Berkeley EECS. Presentation and Q&A.\nJoin on Zoom: ${ZOOM_URL}\nMeeting ID: ${ZOOM_MEETING_ID}\nStarts October 22, 2026 at 5:00 PM Pacific (PDT).\nQuestions: ${CONTACT}`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//STEM2Connect//Webinar Registration//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', 'UID:dan-garcia-20261022@stem2connect.org', `DTSTAMP:${stamp}`, 'DTSTART:20261023T000000Z',
    'SUMMARY:Computational game theory with Professor Dan Garcia', `URL:${ZOOM_URL}`, `LOCATION:${escapeText(ZOOM_URL)}`,
    `DESCRIPTION:${escapeText(description)}`,
    'END:VEVENT', 'END:VCALENDAR', ''
  ];
  // The fixed calendar fields are ASCII; fold below the 75-octet iCalendar limit.
  return lines.map(line => line.match(/.{1,70}/g)?.join('\r\n ') || '').join('\r\n');
}

document.querySelector('#calendar-download').addEventListener('click', () => {
  if (success.hidden) return;
  const calendar = createCalendar();
  const url = URL.createObjectURL(new Blob([calendar], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'STEM2Connect-Dan-Garcia.ics';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});

connectRegistration();
