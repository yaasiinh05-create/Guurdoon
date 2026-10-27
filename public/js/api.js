/** Small fetch wrapper: JSON in/out, CSRF header, Somali error messages. */

export function csrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)gd_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload || {};
    this.errors = this.payload.errors || {};
  }
}

async function request(method, url, body, options = {}) {
  const headers = { Accept: 'application/json' };
  const init = { method, headers, credentials: 'same-origin' };

  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers['X-CSRF-Token'] = csrfToken();
  }

  let response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError('Xiriirku wuu guuldareystay. Fadlan hubi internet-ka.', 0, {});
  }

  let payload = {};
  const text = await response.text();
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = { error: text }; }
  }

  if (!response.ok) {
    throw new ApiError(payload.error || 'Wax qalab ah ayaa jaba.', response.status, payload);
  }
  return options.raw ? response : payload;
}

export const api = {
  get: (url, options) => request('GET', url, undefined, options),
  post: (url, body, options) => request('POST', url, body ?? {}, options),
  put: (url, body, options) => request('PUT', url, body ?? {}, options),
  patch: (url, body, options) => request('PATCH', url, body ?? {}, options),
  del: (url, options) => request('DELETE', url, undefined, options),
};
