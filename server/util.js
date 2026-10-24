import crypto from 'node:crypto';

export const uid = () => crypto.randomUUID();
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
export function shortId(n = 10) {
  const bytes = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHA[bytes[i] % ALPHA.length];
  return s;
}
const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function inviteCode() {
  const bytes = crypto.randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHA[bytes[i] % CODE_ALPHA.length];
  return s.slice(0, 3) + '-' + s.slice(3);
}
export const normalizeCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{3})(.{3})$/, '$1-$2');

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pw), salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
export function verifyPassword(pw, stored) {
  try {
    const [scheme, s, k] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const key = crypto.scryptSync(String(pw), Buffer.from(s, 'base64'), 64);
    const expected = Buffer.from(k, 'base64');
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch { return false; }
}

const b64u = (x) => Buffer.from(x).toString('base64url');
export function signToken(payload, secret, ttlSec) {
  const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function verifyToken(token, secret) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() / 1000 ? p : null;
  } catch { return null; }
}

// A student's phone signs `HD1|<university id>|<device id>|<t>` with an ECDSA P-256 key.
export const scanMessage = (univId, deviceId, t) => Buffer.from(`HD1|${univId}|${deviceId}|${t}`);
export function sanitizeJwk(jwk) {
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') return null;
  if (jwk.x.length > 64 || jwk.y.length > 64) return null;
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
}
export function verifySignature(publicJwk, univId, deviceId, t, sigB64u) {
  try {
    const key = crypto.createPublicKey({ key: publicJwk, format: 'jwk' });
    return crypto.verify('sha256', scanMessage(univId, deviceId, t), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sigB64u, 'base64url'));
  } catch { return false; }
}
export async function signCode(privateJwk, univId, deviceId, t) {
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, scanMessage(univId, deviceId, t));
  return `HD1.${univId}.${deviceId}.${t}.${Buffer.from(sig).toString('base64url')}`;
}

export const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o && o[k] !== undefined).map((k) => [k, o[k]]));
export const jparse = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
export const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
