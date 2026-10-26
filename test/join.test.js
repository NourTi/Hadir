import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from '../server/app.js';

let srv, base, T, G, token;
const call = async (method, path, body, tok) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const device = async () => { const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']); const p = await crypto.subtle.exportKey('jwk', kp.publicKey); return { public_jwk: { kty: p.kty, crv: p.crv, x: p.x, y: p.y }, label: 'Test phone' }; };

before(async () => {
  srv = await createServer({ dbFile: ':memory:', demo: false, noScheduler: true, secret: 'test-secret' });
  await srv.app.listen(0, '127.0.0.1'); base = `http://127.0.0.1:${srv.app.server.address().port}`;
  T = (await call('POST', '/api/auth/setup', { full_name: 'Dr T', email: 't@t.dz', password: 'password123' })).data.token;
  G = (await call('POST', '/api/groups', { name: 'G1', course_name: 'Phonetics', schedule: [] }, T)).data.group.id;
  token = (await call('POST', `/api/groups/${G}/join`, {}, T)).data.token;
});
after(async () => { await srv.stop(); });

test('a student joins from the class link without being on any list', async () => {
  const r = await call('POST', `/api/join/${token}`, { full_name: 'Amina Benali', university_id: '202431000001', password: 'secret123', device: await device() });
  assert.equal(r.status, 200); assert.equal(r.data.user.role, 'student');
  const roster = await call('GET', `/api/groups/${G}/roster`, null, T);
  assert.ok(JSON.stringify(roster.data).includes('Amina Benali'));
});
test('the same ID cannot be taken over with another password', async () => {
  const r = await call('POST', `/api/join/${token}`, { full_name: 'Someone', university_id: '202431000001', password: 'otherpass1', device: await device() });
  assert.equal(r.status, 400); assert.match(JSON.stringify(r.data), /already_registered/);
});
test('a closed class refuses new students, and a new code replaces the old link', async () => {
  await call('POST', `/api/groups/${G}/join`, { open: false }, T);
  const closed = await call('POST', `/api/join/${token}`, { full_name: 'New Student', university_id: '202431000002', password: 'secret123', device: await device() });
  assert.equal(closed.status, 400);
  const fresh = await call('POST', `/api/groups/${G}/join`, { open: true, regenerate: true }, T);
  assert.notEqual(fresh.data.token, token);
  assert.equal((await call('GET', `/api/join/${token}`)).status, 404);
});
