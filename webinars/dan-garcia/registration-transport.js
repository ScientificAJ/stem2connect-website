/* Normal form POST with an authenticated-by-origin/frame/nonce acknowledgment.
 * No iframe load event or opaque fetch response is considered a successful save.
 */
const EVENT_ID = 'dan-garcia-webinar';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createSubmissionId() {
  if (!globalThis.crypto?.getRandomValues) throw registrationError('unsupported');
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function registrationError(code) {
  const error = new Error('Your registration has not been confirmed.');
  error.code = code;
  return error;
}

export function isGoogleScriptOrigin(origin) {
  return /^https:\/\/(?:script\.google\.com|script\.googleusercontent\.com|[a-z0-9-]+-script\.googleusercontent\.com)$/.test(origin);
}

export function sourceBelongsToFrame(source, frameWindow) {
  if (!source || !frameWindow) return false;
  try {
    for (let i = 0; i < 8; i++) {
      if (source === frameWindow) return true;
      const parent = source.parent;
      if (!parent || parent === source) return false;
      source = parent;
    }
  } catch (_) { return false; }
  return false;
}

export function acceptsAcknowledgment(event, frameWindow, submissionId, nonce) {
  const data = event.data;
  return isGoogleScriptOrigin(event.origin)
    && sourceBelongsToFrame(event.source, frameWindow)
    && data && typeof data === 'object'
    && data.type === 'stem2connect:registration-result' && data.version === 1
    && data.eventId === EVENT_ID && data.submissionId === submissionId && data.nonce === nonce
    && typeof data.ok === 'boolean'
    && ['registered', 'invalid', 'busy', 'unavailable'].includes(data.code)
    && data.ok === (data.code === 'registered');
}

/** Keep submissionId stable while retrying identical form values. */
export async function submitRegistration({ endpoint, fields, submissionId, timeoutMs = 45000 }) {
  if (!endpoint) throw registrationError('not_configured');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)) {
    throw registrationError('not_configured');
  }
  if (!UUID.test(submissionId || '')) throw registrationError('invalid');
  const nonce = createSubmissionId();
  const payload = {
    action: 'register', eventId: EVENT_ID,
    name: fields.name || '', email: fields.email || '', educationLevel: fields.educationLevel || '',
    school: fields.school || '', country: fields.country || '', question: fields.question || '',
    privacyConsent: fields.privacyConsent || '', website: fields.website || '',
    submissionId, nonce, parentOrigin: window.location.origin
  };
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.name = `registration-${nonce}`;
    iframe.title = 'Secure registration response';
    iframe.hidden = true;
    iframe.tabIndex = -1;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.referrerPolicy = 'no-referrer';
    const form = document.createElement('form');
    form.hidden = true;
    form.method = 'POST';
    form.action = endpoint;
    form.target = iframe.name;
    form.enctype = 'application/x-www-form-urlencoded';
    form.acceptCharset = 'UTF-8';
    Object.entries(payload).forEach(([name, value]) => {
      const field = document.createElement('input');
      field.type = 'hidden'; field.name = name; field.value = String(value);
      form.append(field);
    });
    let finished = false;
    let timer;
    function finish(error, message) {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      form.remove(); iframe.remove();
      if (error) reject(error); else resolve(message);
    }
    function onMessage(event) {
      if (!acceptsAcknowledgment(event, iframe.contentWindow, submissionId, nonce)) return;
      if (event.data.ok) finish(null, { ok: true, code: 'registered' });
      else finish(registrationError(event.data.code));
    }
    window.addEventListener('message', onMessage);
    document.body.append(iframe, form);
    timer = window.setTimeout(() => finish(registrationError('timeout')), Math.max(10000, Math.min(120000, timeoutMs)));
    try {
      // The receiver's acknowledgment proves persistence; onload is deliberately unused.
      HTMLFormElement.prototype.submit.call(form);
    } catch (_) { finish(registrationError('unavailable')); }
  });
}
