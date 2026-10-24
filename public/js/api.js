// Talks to the Hadir server. Every request carries the sign-in token; a network failure becomes an ApiError with code "offline".
import { t } from './i18n.js';

const KEY = 'hadir.auth';
export const auth = { token: null, user: null };
try { Object.assign(auth, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* start signed out */ }

export function saveAuth(token, user) {
  auth.token = token; auth.user = user;
  try { localStorage.setItem(KEY, JSON.stringify({ token, user })); } catch { /* ignore */ }
}
export function clearAuth() {
  auth.token = null; auth.user = null;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
  get offline() { return this.code === 'offline'; }
}

const listeners = new Set();
export const onAuthExpired = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

async function request(method, path, body, { blob = false } = {}) {
  const headers = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  let payload;
  if (body !== undefined && method !== 'GET' && method !== 'DELETE') { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try { res = await fetch(path, { method, headers, body: payload }); } catch { throw new ApiError(0, 'offline', t('err.offline')); }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && auth.token && data.error !== 'bad_credentials') { clearAuth(); listeners.forEach((fn) => fn()); }
    throw new ApiError(res.status, data.error || 'error', data.message || t('err.server'));
  }
  return blob ? res.blob() : res.json().catch(() => ({}));
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b = {}) => request('PUT', p, b),
  patch: (p, b = {}) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
  blob: (p) => request('GET', p, undefined, { blob: true }),
};
