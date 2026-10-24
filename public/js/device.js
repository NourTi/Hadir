// The student's phone key. The private key is created non-extractable and stored in IndexedDB; only the public half is ever sent.
import { kv } from './store.js';
import { createDeviceKey } from './crypto.js';
import { api } from './api.js';
import { t } from './i18n.js';

export const getDevice = () => kv.get('device');
export const saveDevice = (d) => kv.set('device', d);
export const clearDevice = () => kv.del('device');

export function deviceLabel() {
  const ua = navigator.userAgent || '';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /(Chrome|CriOS)\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : t('device.label.phone');
  return os ? `${br} · ${os}` : br;
}

export async function makeKey() {
  try { return await createDeviceKey(); } catch { throw Object.assign(new Error(t('auth.phoneKey')), { code: 'no_crypto' }); }
}

// After a student signs in: make sure this phone has a key the server knows about.
export async function ensureStudentDevice(user) {
  const have = await getDevice();
  if (have && have.univ_id === user.university_id && have.device_id) return have;
  const key = await makeKey();
  const r = await api.post('/api/devices', { public_jwk: key.publicJwk, label: deviceLabel() });
  const dev = { privateKey: key.privateKey, device_id: r.device.id, univ_id: user.university_id, status: r.device.status };
  await saveDevice(dev);
  return dev;
}

// Ask the server whether the teacher has approved this phone yet. Offline, keep what we know.
export async function refreshDeviceStatus(dev) {
  try {
    const { devices } = await api.get('/api/devices');
    const mine = devices.find((d) => d.id === dev.device_id);
    const status = mine ? mine.status : 'revoked';
    if (status !== dev.status) { dev.status = status; await saveDevice(dev); }
  } catch { /* offline */ }
  return dev;
}
