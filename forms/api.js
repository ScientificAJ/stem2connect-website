/** Same transport as the verified registration receiver: a POST and a nonce-bound acknowledgment. */
const APP = 'stem2connect-form-studio';
const ENDPOINT = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
let configuration;

export function requestId() {
  if (!globalThis.crypto?.getRandomValues) throw apiError('unsupported', 'This browser cannot establish a secure request.');
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const s = Array.from(b, n => n.toString(16).padStart(2, '0')).join('');
  return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}

export function apiError(code, message) {
  return Object.assign(new Error(message || 'The request could not be completed.'), { code });
}

export function isGoogleScriptOrigin(origin) {
  return /^https:\/\/(?:script\.google\.com|script\.googleusercontent\.com|[a-z0-9-]+-script\.googleusercontent\.com)$/.test(origin);
}

export function sourceBelongsToFrame(source, frameWindow) {
  if (!source || !frameWindow) return false;
  try {
    for (let depth = 0; depth < 8; depth++) {
      if (source === frameWindow) return true;
      const parent = source.parent;
      if (!parent || parent === source) return false;
      source = parent;
    }
  } catch (_) { return false; }
  return false;
}

export function acceptsResponse(event, frameWindow, id, nonce) {
  const d = event.data;
  return isGoogleScriptOrigin(event.origin) && sourceBelongsToFrame(event.source, frameWindow)
    && d && typeof d === 'object' && d.app === APP && d.requestId === id && d.nonce === nonce
    && d.result && typeof d.result === 'object' && typeof d.result.ok === 'boolean';
}

async function config() {
  if (!configuration) configuration = fetch(new URL('./config.json', import.meta.url), { cache: 'no-store', credentials: 'omit' })
    .then(async response => {
      if (!response.ok) throw apiError('not_configured', 'Form Studio is not connected yet.');
      return response.json();
    }).catch(error => { configuration = null; throw error; });
  return configuration;
}

export async function api(action, args = {}) {
  const settings = await config();
  // The test server supplies this only on localhost. Production never trusts a query-string API override.
  if (settings.localApi && ['localhost', '127.0.0.1'].includes(location.hostname)) {
    const target = new URL(settings.localApi, location.href);
    if (target.origin !== location.origin) throw apiError('not_configured', 'The local test connection is invalid.');
    const response = await fetch(target, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...args, action }) });
    const result = await response.json();
    if (!result.ok) throw apiError(result.error?.code, result.error?.message);
    return result.data;
  }
  if (!ENDPOINT.test(settings.endpoint || '')) throw apiError('not_configured', 'Form Studio is not connected yet. Please contact the STEM2Connect team.');
  const id = requestId(), nonce = requestId();
  const payload = JSON.stringify({ ...args, action });
  if (new TextEncoder().encode(payload).length > 500000) throw apiError('invalid', 'This form is too large. Use smaller images or shorter text.');
  const fields = { app: APP, requestId: id, nonce, origin: location.origin, payload };
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.name = `studio-${nonce}`; frame.title = 'Secure form service response';
    frame.hidden = true; frame.tabIndex = -1; frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('aria-hidden', 'true');
    const form = document.createElement('form');
    form.hidden = true; form.method = 'POST'; form.action = settings.endpoint; form.target = frame.name;
    form.enctype = 'application/x-www-form-urlencoded'; form.acceptCharset = 'UTF-8';
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.append(input);
    }
    let finished = false, timer;
    function finish(error, data) {
      if (finished) return;
      finished = true; clearTimeout(timer); window.removeEventListener('message', receive);
      form.remove(); frame.remove();
      error ? reject(error) : resolve(data);
    }
    function receive(event) {
      if (!acceptsResponse(event, frame.contentWindow, id, nonce)) return;
      const result = event.data.result;
      result.ok ? finish(null, result.data) : finish(apiError(result.error?.code || 'unavailable', result.error?.message));
    }
    window.addEventListener('message', receive);
    document.body.append(frame, form);
    timer = setTimeout(() => finish(apiError('timeout', 'The service has not confirmed this request. Your changes may have saved. Reload before repeating an edit; registrations can safely be retried.')), 90000);
    try { HTMLFormElement.prototype.submit.call(form); }
    catch (_) { finish(apiError('unavailable', 'The form service could not be reached.')); }
  });
}
