import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from '../server/app.js';
import { signCode, hashPassword, uid } from '../server/util.js';

let srv, base;
const fetchCalls = [];
let failWebhook = 0;
const mockFetch = async (url, opts) => {
  fetchCalls.push({ url, body: JSON.parse(opts.body) });
  if (failWebhook > 0) { failWebhook--; return { ok: false, status: 503 }; }
  return { ok: true, status: 200 };
};

async function api(method, path, body, token) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  return { status: res.status, data };
}
async function newDevice() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { public_jwk: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }, priv };
}
const tNow = () => Math.floor(Date.now() / 30000) * 30;

let T, G, S = {}; // teacher token, group id, students by university id

before(async () => {
  srv = await createServer({ dbFile: ':memory:', demo: false, noScheduler: true, secret: 'test-secret', fetch: mockFetch, webhookUrl: 'http://hook.test/x' });
  await srv.app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${srv.app.server.address().port}`;
});
after(async () => { await srv.stop(); });

test('first sign-up creates the owner with default rules; sign-up can be closed', async () => {
  assert.equal((await api('GET', '/api/config')).data.setup_needed, true);
  const bad = await api('POST', '/api/auth/setup', { email: 'x', password: 'short', full_name: 'A' });
  assert.equal(bad.status, 400);
  const r = await api('POST', '/api/auth/setup', { email: 'Teach@Uni.dz', password: 'correct horse', full_name: 'Dr. Test' });
  assert.equal(r.status, 200);
  T = r.data.token;
  assert.equal((await api('GET', '/api/rules', null, T)).data.rules.length, 5);
  assert.equal((await api('POST', '/api/settings/registration', { open: false }, T)).status, 200);
  assert.equal((await api('POST', '/api/auth/register', { email: 'b@b.dz', password: 'correct horse', full_name: 'Bob B' })).status, 403);
  await api('POST', '/api/settings/registration', { open: true }, T);
  const login = await api('POST', '/api/auth/login', { login: 'teach@uni.dz', password: 'correct horse' });
  assert.equal(login.status, 200);
  assert.equal((await api('POST', '/api/auth/login', { login: 'teach@uni.dz', password: 'nope' })).status, 401);
});

test('create group, import roster (bad rows reported, invites issued)', async () => {
  const g = await api('POST', '/api/groups', { name: 'Group T', course_name: 'Writing', semester: 1, year: 2026, schedule: [{ day: 2, start: '08:30', end: '10:00', room: 'B1' }] }, T);
  assert.equal(g.status, 200);
  G = g.data.group.id;
  const r = await api('POST', `/api/groups/${G}/students`, { rows: [
    { university_id: '202400000001', full_name: 'Amina Test' }, { university_id: '202400000002', full_name: 'Bilal Test' },
    { university_id: '202400000003', full_name: 'Chaima Test' }, { university_id: 'bad id!', full_name: 'Bad Id' }, { university_id: '202400000009', full_name: '' }] }, T);
  assert.equal(r.data.created, 3);
  assert.equal(r.data.invalid.length, 2);
  assert.equal(r.data.invites.length, 3);
  for (const i of r.data.invites) S[i.university_id] = { code: i.code };
  const again = await api('POST', `/api/groups/${G}/students`, { rows: [{ university_id: '202400000001', full_name: 'Amina Test' }] }, T);
  assert.equal(again.data.already_in_group, 1);
});

test('student activation needs the right code and registers an approved device', async () => {
  const a = '202400000001';
  const dev = await newDevice();
  const wrong = await api('POST', '/api/auth/activate', { university_id: a, code: 'AAA-AAA', password: 'password1', device: { public_jwk: dev.public_jwk } });
  assert.equal(wrong.status, 400);
  const ok = await api('POST', '/api/auth/activate', { university_id: a, code: S[a].code.toLowerCase().replace('-', ' '), password: 'password1', device: { public_jwk: dev.public_jwk, label: 'Pixel' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  Object.assign(S[a], { token: ok.data.token, deviceId: ok.data.device_id, priv: dev.priv, sid: ok.data.user.student_id });
  assert.equal((await api('POST', '/api/auth/activate', { university_id: a, code: S[a].code, password: 'password1', device: { public_jwk: dev.public_jwk } })).status, 400, 'a code works once');
  for (const b of ['202400000002']) {
    const d = await newDevice();
    const r = await api('POST', '/api/auth/activate', { university_id: b, code: S[b].code, password: 'password1', device: { public_jwk: d.public_jwk } });
    Object.assign(S[b], { token: r.data.token, deviceId: r.data.device_id, priv: d.priv, sid: r.data.user.student_id });
  }
});

test('roster exposes approved public keys for offline checks, not secrets', async () => {
  const r = await api('GET', `/api/groups/${G}/roster`, null, T);
  const amina = r.data.students.find((s) => s.university_id === '202400000001');
  assert.equal(amina.devices[0].status, 'approved');
  assert.equal(amina.devices[0].public_jwk.kty, 'EC');
  assert.equal(amina.devices[0].public_jwk.d, undefined);
  const chaima = r.data.students.find((s) => s.university_id === '202400000003');
  assert.equal(chaima.devices.length, 0);
});

let SESSION;
test('sync accepts a genuine scan, ignores duplicates and rejects forged, stale and unknown scans', async () => {
  SESSION = uid();
  const start = Date.now();
  const a = S['202400000001'];
  const t = tNow();
  const good = await signCode(a.priv, '202400000001', a.deviceId, t);
  const [, univ, dev, tt, sig] = good.split('.');
  const mk = (over = {}, id = Math.random().toString(36)) => ({ client_id: id, univ_id: univ, device_id: dev, t: Number(tt), sig, scanned_at: Date.now(), ...over });
  const stale = await signCode(a.priv, '202400000001', a.deviceId, t - 300);
  const other = S['202400000002'];
  const forged = (await signCode(other.priv, '202400000001', a.deviceId, t)).split('.')[4];
  const body = { sessions: [{ id: SESSION, group_id: G, starts_at: start, topic: 'Test', scans: [
    mk(), mk({}, 'dup'), mk({ t: t - 300, sig: stale.split('.')[4] }, 'stale'), mk({ sig: forged }, 'forged'), mk({ device_id: 'nodevice01' }, 'nodev'),
    mk({ univ_id: '999999999999' }, 'ghost'), mk({ univ_id: '202400000003' }, 'notactive') ] }] };
  const r = await api('POST', '/api/sync', body, T);
  assert.equal(r.status, 200);
  const res = r.data.results[0];
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.accepted, 1);
  assert.equal(res.duplicates, 1);
  const reasons = Object.fromEntries(res.rejected.map((x) => [x.client_id, x.reason]));
  assert.equal(reasons.stale, 'stale_code');
  assert.equal(reasons.forged, 'bad_signature');
  assert.equal(reasons.nodev, 'unknown_device');
  assert.equal(reasons.ghost, 'unknown_student');
  assert.equal(reasons.notactive, 'unknown_device');
  assert.equal(res.attendance.find((x) => x.student_id === a.sid).status, 'present');
  // uploading the same batch again changes nothing
  const again = await api('POST', '/api/sync', body, T);
  assert.equal(again.data.results[0].accepted, 0);
});

test('a second phone stays pending until the teacher approves it', async () => {
  const a = S['202400000001'];
  const d2 = await newDevice();
  const reg = await api('POST', '/api/devices', { public_jwk: d2.public_jwk, label: 'Old tablet' }, a.token);
  assert.equal(reg.data.device.status, 'pending');
  const t = tNow();
  const code = (await signCode(d2.priv, '202400000001', reg.data.device.id, t)).split('.');
  const scan = { client_id: 'p1', univ_id: code[1], device_id: code[2], t: Number(code[3]), sig: code[4], scanned_at: Date.now() };
  let r = await api('POST', '/api/sync', { sessions: [{ id: SESSION, group_id: G, scans: [scan] }] }, T);
  assert.equal(r.data.results[0].rejected[0].reason, 'device_not_approved');
  assert.equal((await api('GET', '/api/devices?status=pending', null, T)).data.devices.length, 1);
  await api('POST', `/api/devices/${reg.data.device.id}/decision`, { status: 'approved' }, T);
  r = await api('POST', '/api/sync', { sessions: [{ id: SESSION, group_id: G, scans: [{ ...scan, client_id: 'p2' }] }] }, T);
  assert.equal(r.data.results[0].duplicates, 1, 'approved device is accepted, student already present');
});

test('manual marks win, closing creates absences and fires the absence rule once', async () => {
  const c = '202400000003';
  const roster = (await api('GET', `/api/groups/${G}/roster`, null, T)).data.students;
  const chaima = roster.find((s) => s.university_id === c);
  const r = await api('POST', '/api/sync', { sessions: [{ id: SESSION, group_id: G, status: 'closed', closed_at: Date.now(), marks: [{ client_id: 'm1', student_id: chaima.id, status: 'late', at: Date.now(), note: 'Arrived with the bus strike' }] }] }, T);
  const res = r.data.results[0];
  assert.equal(res.session.status, 'closed');
  const byId = Object.fromEntries(res.attendance.map((a) => [a.student_id, a]));
  assert.equal(byId[chaima.id].status, 'late');
  assert.equal(byId[chaima.id].method, 'manual');
  const bilal = S['202400000002'];
  assert.equal(byId[bilal.sid].status, 'absent');
  const log = (await api('GET', '/api/notifications', null, T)).data;
  const alerts = log.log.filter((n) => n.student_name === 'Bilal Test');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].status, 'sent');
  assert.match(alerts[0].body, /Group T/);
  // the absent student sees it in their inbox
  const inbox = (await api('GET', '/api/notifications', null, bilal.token)).data;
  assert.equal(inbox.inbox.length, 1);
  // closing again does not duplicate anything
  await api('POST', '/api/sync', { sessions: [{ id: SESSION, group_id: G, status: 'closed' }] }, T);
  assert.equal((await api('GET', '/api/notifications', null, T)).data.log.filter((n) => n.student_name === 'Bilal Test').length, 1);
});

test('excuse flow: student submits, teacher approves, the absence becomes excused', async () => {
  const b = S['202400000002'];
  const nope = await api('POST', '/api/excuses', { session_id: SESSION, reason: 'ok' }, S['202400000001'].token);
  assert.equal(nope.status, 400, 'present students cannot excuse');
  const bad = await api('POST', '/api/excuses', { session_id: SESSION, reason: 'Doctor', file: { name: 'x.pdf', data: Buffer.from('not a pdf').toString('base64') } }, b.token);
  assert.equal(bad.data.error, 'bad_file_type');
  const pdf = Buffer.from('%PDF-1.4\n%test').toString('base64');
  const ok = await api('POST', '/api/excuses', { session_id: SESSION, reason: 'Doctor appointment', file: { name: 'note.pdf', data: pdf } }, b.token);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await api('POST', '/api/excuses', { session_id: SESSION, reason: 'Again' }, b.token)).status, 409);
  const list = (await api('GET', '/api/excuses?state=pending', null, T)).data.excuses;
  assert.equal(list.length, 1);
  const file = await fetch(`${base}/api/excuses/${ok.data.id}/file`, { headers: { Authorization: 'Bearer ' + T } });
  assert.equal(file.status, 200);
  assert.equal(await file.text(), '%PDF-1.4\n%test');
  assert.equal((await fetch(`${base}/api/excuses/${ok.data.id}/file`, { headers: { Authorization: 'Bearer ' + S['202400000001'].token } })).status, 403);
  assert.equal((await api('POST', `/api/excuses/${ok.data.id}/decision`, { state: 'approved' }, T)).status, 200);
  const sess = (await api('GET', `/api/sessions/${SESSION}`, null, T)).data;
  assert.equal(sess.students.find((s) => s.id === b.sid).attendance.status, 'excused');
  const summary = (await api('GET', '/api/student/summary', null, b.token)).data.groups[0];
  assert.equal(summary.stats.absences, 0, 'excused absences do not count');
});

test('gradebook: weighted final out of 20, publishing notifies students and reveals grades', async () => {
  const roster = (await api('GET', `/api/groups/${G}/roster`, null, T)).data.students;
  const a = S['202400000001'];
  const q1 = (await api('POST', `/api/groups/${G}/assessments`, { title: 'Quiz', skill: 'writing', weight: 1, max_score: 20 }, T)).data.id;
  const q2 = (await api('POST', `/api/groups/${G}/assessments`, { title: 'Exam', skill: 'exam', weight: 3, max_score: 40 }, T)).data.id;
  assert.equal((await api('PUT', `/api/assessments/${q1}/grades`, { grades: [{ student_id: a.sid, score: 25 }] }, T)).status, 400, 'score above max is refused');
  await api('PUT', `/api/assessments/${q1}/grades`, { grades: [{ student_id: a.sid, score: 16, cefr: 'B2', feedback: 'Good' }] }, T);
  await api('PUT', `/api/assessments/${q2}/grades`, { grades: [{ student_id: a.sid, score: 30 }] }, T);
  const gb = (await api('GET', `/api/groups/${G}/gradebook`, null, T)).data;
  const me = gb.students.find((s) => s.id === a.sid);
  assert.equal(me.final, 15.25, '(16/20*1 + 30/40*3) / 4 * 20 = (0.8 + 2.25) / 4 * 20');
  assert.equal((await api('GET', '/api/student/summary', null, a.token)).data.groups[0].assessments.every((x) => x.score === null), true, 'unpublished grades stay hidden');
  await api('POST', `/api/assessments/${q1}/publish`, {}, T);
  const sum = (await api('GET', '/api/student/summary', null, a.token)).data.groups[0];
  assert.equal(sum.assessments.find((x) => x.id === q1).score, 16);
  assert.equal(sum.final, 16);
  assert.ok((await api('GET', '/api/notifications', null, a.token)).data.inbox.some((n) => n.kind === 'grade'));
  assert.equal(roster.length, 3);
});

test('rules: dry run previews recipients, approval gates messages, webhook failures retry then succeed', async () => {
  const rules = (await api('GET', '/api/rules', null, T)).data.rules;
  const abs = rules.find((r) => r.name === 'Absence alert');
  const dry = await api('POST', `/api/rules/${abs.id}/dry-run`, {}, T);
  assert.equal(dry.status, 200);
  const custom = await api('POST', '/api/rules', { name: 'Webhook on absence', trigger: 'session_closed', actions: [{ type: 'notify_student', channels: ['webhook'], title: { en: 'Absent' }, template: { en: 'Hi {name}' } }], needs_approval: true }, T);
  assert.equal(custom.status, 200);
  // new session, close with everyone absent: message waits for approval
  const s2 = uid();
  await api('POST', '/api/sync', { sessions: [{ id: s2, group_id: G, starts_at: Date.now() - 3600e3, status: 'closed' }] }, T);
  const pend = (await api('GET', '/api/notifications', null, T)).data.pending;
  assert.ok(pend.length >= 3, 'pending approval messages exist');
  assert.equal(fetchCalls.length, 0, 'nothing is sent before approval');
  failWebhook = 1;
  await api('POST', `/api/notifications/${pend[0].id}/approve`, {}, T);
  let n = srv.db.get('SELECT * FROM notifications WHERE id = ?', pend[0].id);
  assert.equal(n.status, 'queued', 'first webhook attempt failed, retry scheduled');
  assert.equal(n.attempts, 1);
  srv.db.run('UPDATE notifications SET next_attempt_at = ? WHERE id = ?', Date.now() - 1, n.id);
  await srv.engine.retryDue();
  n = srv.db.get('SELECT * FROM notifications WHERE id = ?', pend[0].id);
  assert.equal(n.status, 'sent');
  assert.ok(fetchCalls.length >= 2);
  await api('POST', `/api/notifications/${pend[1].id}/reject`, {}, T);
  assert.equal(srv.db.get('SELECT status FROM notifications WHERE id = ?', pend[1].id).status, 'rejected');
});

test('access control: students cannot use teacher routes and teachers cannot see each other\'s groups', async () => {
  assert.equal((await api('GET', '/api/groups', null, S['202400000001'].token)).status, 403);
  assert.equal((await api('GET', '/api/groups')).status, 401);
  srv.db.run('INSERT INTO users (id, role, login, password_hash, full_name, created_at) VALUES (?,?,?,?,?,?)', uid(), 'teacher', 'other@uni.dz', hashPassword('password22'), 'Other', Date.now());
  const o = (await api('POST', '/api/auth/login', { login: 'other@uni.dz', password: 'password22' })).data.token;
  assert.equal((await api('GET', `/api/groups/${G}/roster`, null, o)).status, 404);
  assert.equal((await api('GET', `/api/sessions/${SESSION}`, null, o)).status, 404);
  assert.equal((await api('POST', '/api/sync', { sessions: [{ id: uid(), group_id: G }] }, o)).data.results[0].ok, false);
  assert.equal((await fetch(base + '/../server/db.js')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e/server/db.js')).status, 404);
});

test('reports: group matrix and at-risk list', async () => {
  const rep = (await api('GET', `/api/reports/group/${G}`, null, T)).data;
  assert.equal(rep.students.length, 3);
  assert.ok(rep.sessions.length >= 2);
  const risk = (await api('GET', '/api/reports/at-risk', null, T)).data;
  assert.ok(Array.isArray(risk.rows));
  const dash = (await api('GET', '/api/dashboard', null, T)).data;
  assert.equal(typeof dash.counts.pending_excuses, 'number');
});
