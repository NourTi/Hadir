import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/app.js';

let srv, base;
const call = async (method, path, body, tok, headers = {}) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const reg = (n, extra = {}) => call('POST', '/api/auth/register', { full_name: n[0], email: n[1], password: n[2] ?? 'Quiet-river-77', ...extra });
let A, B;

before(async () => {
  srv = await createServer({ dbFile: ':memory:', demo: false, noScheduler: true, secret: 'test-secret', strictHost: true });
  await srv.app.listen(0, '127.0.0.1'); base = `http://127.0.0.1:${srv.app.server.address().port}`;
});
after(async () => { await srv.stop(); });

test('the first educator is the owner; later ones are not; profile is stored', async () => {
  A = (await reg(['Dr. Abdelhak Gandouzi', 'abdelhak@uni.dz'], { title: 'Dr', institution: 'University of Tebessa', department: 'English', subjects: ['Linguistics', 'Phonetics'], accent: 'plum' })).data;
  assert.ok(A.token && /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(A.recovery_code));
  assert.equal(A.user.is_owner, true);
  assert.deepEqual(A.user.profile.subjects, ['Linguistics', 'Phonetics']);
  assert.equal(A.user.profile.accent, 'plum');
  B = (await reg(['Nour Mohammed Abdessamed', 'nour@uni.dz'], { title: 'Mr' })).data;
  assert.equal(B.user.is_owner, false);
  assert.equal((await reg(['Someone Else', 'NOUR@uni.dz'])).status, 409);
});

test('weak passwords are refused for educators', async () => {
  assert.equal((await reg(['Weak One', 'w1@uni.dz', 'short'])).status, 400);
  assert.equal((await reg(['Weak Two', 'w2@uni.dz', 'password1'])).status, 400);
  assert.equal((await reg(['Weak Three', 'w3@uni.dz', 'weakthree-123'])).status, 400, 'password that contains the name');
});

test('forgot password: the recovery code resets it once, signs out old tokens and issues a new code', async () => {
  const bad = await call('POST', '/api/auth/forgot', { email: 'nour@uni.dz', code: 'AAAA-BBBB-CCCC-DDDD', new_password: 'Another-pass-88' });
  assert.equal(bad.status, 400);
  assert.equal((await call('POST', '/api/auth/forgot', { email: 'nobody@uni.dz', code: B.recovery_code, new_password: 'Another-pass-88' })).data.error, 'bad_recovery', 'unknown email looks the same');
  const ok = await call('POST', '/api/auth/forgot', { email: 'nour@uni.dz', code: B.recovery_code.toLowerCase(), new_password: 'Another-pass-88' });
  assert.equal(ok.status, 200);
  assert.notEqual(ok.data.recovery_code, B.recovery_code);
  assert.equal((await call('GET', '/api/me', null, B.token)).status, 401, 'old session is gone');
  assert.equal((await call('POST', '/api/auth/login', { login: 'nour@uni.dz', password: 'Quiet-river-77' })).status, 401);
  const login = await call('POST', '/api/auth/login', { login: 'nour@uni.dz', password: 'Another-pass-88' });
  assert.equal(login.status, 200);
  B = { ...login.data, recovery_code: ok.data.recovery_code };
  assert.equal((await call('POST', '/api/auth/forgot', { email: 'nour@uni.dz', code: ok.data.recovery_code, new_password: 'Third-pass-99' })).status, 200);
  assert.equal((await call('POST', '/api/auth/forgot', { email: 'nour@uni.dz', code: ok.data.recovery_code, new_password: 'Third-pass-100' })).status, 400, 'a spent code is useless');
  B = (await call('POST', '/api/auth/login', { login: 'nour@uni.dz', password: 'Third-pass-99' })).data;
});

test('the owner can issue a one-time reset code; non-owners cannot', async () => {
  const list = await call('GET', '/api/educators', null, A.token);
  assert.equal(list.data.educators.length, 2);
  assert.equal((await call('GET', '/api/educators', null, B.token)).status, 403);
  const nour = list.data.educators.find((e) => e.login === 'nour@uni.dz');
  assert.equal((await call('POST', `/api/educators/${nour.id}/reset`, {}, B.token)).status, 403);
  const r = await call('POST', `/api/educators/${nour.id}/reset`, {}, A.token);
  assert.ok(r.data.code);
  const used = await call('POST', '/api/auth/forgot', { email: 'nour@uni.dz', code: r.data.code, new_password: 'Fourth-pass-11' });
  assert.equal(used.status, 200);
  assert.equal((await call('POST', '/api/auth/forgot', { email: 'nour@uni.dz', code: r.data.code, new_password: 'Fifth-pass-22' })).status, 400);
  const login = await call('POST', '/api/auth/login', { login: 'nour@uni.dz', password: 'Fourth-pass-11' });
  B = login.data;
});

test('eight wrong passwords lock the account for a while', async () => {
  await reg(['Lock Target', 'lock@uni.dz']);
  let last;
  for (let i = 0; i < 9; i++) last = await call('POST', '/api/auth/login', { login: 'lock@uni.dz', password: 'wrong-wrong-' + i });
  assert.equal(last.status, 429);
  assert.equal((await call('POST', '/api/auth/login', { login: 'lock@uni.dz', password: 'Quiet-river-77' })).status, 429, 'even the right one waits');
});

test('changing the password signs out other devices and returns a fresh session', async () => {
  const r = await call('PATCH', '/api/me', { current_password: 'Fourth-pass-11', new_password: 'Sixth-pass-33' }, B.token);
  assert.equal(r.status, 200);
  assert.ok(r.data.token);
  assert.equal((await call('GET', '/api/me', null, B.token)).status, 401);
  assert.equal((await call('GET', '/api/me', null, r.data.token)).status, 200);
  B = r.data;
});

test('profile defaults apply to new classes; each educator sees only their own data', async () => {
  await call('PUT', '/api/me/profile', { ...B.user.profile, defaults: { late_after_min: 10, absence_warn: 4, absence_notice: 6 }, subjects: 'Writing Production, Grammar' }, B.token);
  const g = await call('POST', '/api/groups', { name: 'W1', course_name: 'Writing Production' }, B.token);
  assert.equal(g.data.group.late_after_min, 10);
  assert.equal(g.data.group.absence_notice, 6);
  const mine = await call('GET', '/api/groups', null, A.token);
  assert.equal(mine.data.groups.length, 0);
  assert.equal((await call('GET', `/api/groups/${g.data.group.id}/roster`, null, A.token)).status, 404);
  assert.equal((await call('GET', '/api/audit', null, A.token)).data.entries.every((e) => e.actor === 'Dr. Abdelhak Gandouzi'), true);
  assert.equal((await call('GET', '/api/export/backup', null, B.token)).status, 403, 'a whole-database backup is for the owner only');
  const exp = await fetch(base + '/api/export/mine', { headers: { Authorization: 'Bearer ' + B.token } });
  const data = await exp.json();
  assert.equal(data.groups.length, 1);
  assert.equal(data.educator.email, 'nour@uni.dz');
});

test('another educator never gets a student\'s invite code', async () => {
  const gA = (await call('POST', '/api/groups', { name: 'LA' }, A.token)).data.group.id;
  const gB = (await call('GET', '/api/groups', null, B.token)).data.groups[0].id;
  const r1 = await call('POST', `/api/groups/${gA}/students`, { rows: [{ university_id: '777001', full_name: 'Shared Student' }] }, A.token);
  assert.equal(r1.data.invites.length, 1);
  const r2 = await call('POST', `/api/groups/${gB}/students`, { rows: [{ university_id: '777001', full_name: 'Shared Student' }] }, B.token);
  assert.equal(r2.data.existing, 1);
  assert.equal(r2.data.invites.length, 0);
});

test('requests with a foreign Host or Origin are refused', async () => {
  const host = await new Promise((res) => { import('node:http').then(({ default: http }) => { const rq = http.request({ host: '127.0.0.1', port: srv.app.server.address().port, path: '/api/config', headers: { Host: 'evil.example.com' } }, (r) => { r.resume(); res(r.statusCode); }); rq.end(); }); });
  assert.equal(host, 421);
  const origin = await call('POST', '/api/auth/login', { login: 'a@a.dz', password: 'x' }, null, { Origin: 'https://evil.example.com' });
  assert.equal(origin.status, 403);
  const big = await call('POST', '/api/auth/login', { login: 'x'.repeat(400 * 1024), password: 'x' });
  assert.equal(big.status, 413);
});

test('security headers are present', async () => {
  const r = await fetch(base + '/app/');
  assert.match(r.headers.get('content-security-policy'), /object-src 'none'/);
  assert.equal(r.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});

test('the owner sets the https address students use; others cannot', async () => {
  assert.equal((await call('POST', '/api/settings/public-url', { url: 'http://x.example.com' }, A.token)).status, 400);
  assert.equal((await call('POST', '/api/settings/public-url', { url: 'https://x.example.com/path' }, A.token)).status, 400);
  assert.equal((await call('POST', '/api/settings/public-url', { url: 'https://hadir-test.ngrok-free.app' }, B.token)).status, 403);
  const ok = await call('POST', '/api/settings/public-url', { url: 'https://hadir-test.ngrok-free.app/' }, A.token);
  assert.equal(ok.data.public_url, 'https://hadir-test.ngrok-free.app');
  assert.equal((await call('GET', '/api/config')).data.public_url, 'https://hadir-test.ngrok-free.app');
  const viaTunnel = await new Promise((res) => { import('node:http').then(({ default: http }) => { const rq = http.request({ host: '127.0.0.1', port: srv.app.server.address().port, path: '/api/config', headers: { Host: 'hadir-test.ngrok-free.app' } }, (r) => { r.resume(); res(r.statusCode); }); rq.end(); }); });
  assert.equal(viaTunnel, 200, 'the saved address is now an allowed host');
});
