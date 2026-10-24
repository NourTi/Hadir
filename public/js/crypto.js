// Signed attendance codes. Used by the student's phone (to sign) and the teacher's phone (to check offline).
// Format:  HD1.<university id>.<device id>.<unix seconds>.<signature>
// The signature is ECDSA P-256 / SHA-256 over  "HD1|<university id>|<device id>|<unix seconds>"  (raw r||s, base64url),
// which is exactly what server/util.js verifies, so a scan checked on the phone is checked the same way on the server.

export const CODE_LIFETIME_S = 30;       // a new code every 30 seconds
export const CODE_TOLERANCE_MS = 45e3;   // the teacher's phone accepts a code up to 45 s old (30 s + clock drift)

const subtle = () => globalThis.crypto.subtle;
const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };

export const b64u = {
  enc(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    const s = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
    const bin = atob(s);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

export const scanMessage = (univId, deviceId, t) => new TextEncoder().encode(`HD1|${univId}|${deviceId}|${t}`);

// The private key is created non-extractable: the browser will sign with it but never reveal it.
export async function createDeviceKey() {
  const pair = await subtle().generateKey(ALG, false, ['sign', 'verify']);
  const jwk = await subtle().exportKey('jwk', pair.publicKey);
  return { privateKey: pair.privateKey, publicJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } };
}

export async function signCode(privateKey, univId, deviceId, t) {
  const sig = await subtle().sign(SIGN, privateKey, scanMessage(univId, deviceId, t));
  return `HD1.${univId}.${deviceId}.${t}.${b64u.enc(sig)}`;
}

export function parseCode(text) {
  const parts = String(text || '').trim().split('.');
  if (parts.length !== 5 || parts[0] !== 'HD1') return null;
  const [, univ_id, device_id, ts, sig] = parts;
  const t = Number(ts);
  if (!/^[0-9A-Za-z][0-9A-Za-z\-_/]{3,39}$/.test(univ_id) || !/^[a-z0-9]{6,20}$/i.test(device_id) || !Number.isInteger(t) || !/^[A-Za-z0-9_-]{80,100}$/.test(sig)) return null;
  return { univ_id, device_id, t, sig };
}

export async function verifyCode(publicJwk, parsed) {
  try {
    const key = await subtle().importKey('jwk', publicJwk, ALG, false, ['verify']);
    return await subtle().verify(SIGN, key, b64u.dec(parsed.sig), scanMessage(parsed.univ_id, parsed.device_id, parsed.t));
  } catch { return false; }
}

export const randomId = () => (globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (globalThis.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
