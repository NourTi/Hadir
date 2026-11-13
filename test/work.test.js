import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from '../server/app.js';
import { hashPassword, uid } from '../server/util.js';

async function boot() {
  const a = await createServer({ dbFile: ':memory:', demo: false, noScheduler: true, secret: 'work-test-secret' });
  await a.app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${a.app.server.address().port}`;
  const call = async (method, path, body, token) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  return { a, call };
}

test('homework and TD: statuses, marks hidden until published, check-in code', async () => {
  const { a, call } = await boot();
  const t = (await call('POST', '/api/auth/register', { email: 'prof@example.org', full_name: 'Test Educator', password: 'Quiet-river-77' })).data.token;
  const gid = (await call('POST', '/api/groups', { name: 'G1', course_name: 'Writing', semester: 1, year: 2026 }, t)).data.group.id;
  await call('POST', `/api/groups/${gid}/students`, { rows: [{ university_id: '111111', full_name: 'Student One' }, { university_id: '222222', full_name: 'Student Two' }] }, t);
  const mk = async (univ) => {
    const st = a.db.get('SELECT * FROM students WHERE university_id = ?', univ); const id = uid();
    a.db.run("INSERT INTO users (id, role, login, password_hash, full_name, language, created_at) VALUES (?,?,?,?,?,?,?)", id, 'student', univ, hashPassword('student-pass-1'), st.full_name, 'en', Date.now());
    a.db.run('UPDATE students SET user_id = ? WHERE id = ?', id, st.id);
    a.db.run("INSERT INTO devices (id, student_id, label, public_jwk, status, created_at) VALUES (?,?,?,?,?,?)", uid(), st.id, 'phone', '{}', 'approved', Date.now());
    return { id: st.id, token: (await call('POST', '/api/auth/login', { login: univ, password: 'student-pass-1' })).data.token };
  };
  const s1 = await mk('111111'), s2 = await mk('222222');

  // create a TD, it starts as pending for everyone
  assert.equal((await call('POST', `/api/groups/${gid}/tasks`, { title: '' }, t)).status, 400);
  const task = (await call('POST', `/api/groups/${gid}/tasks`, { title: 'TD 1: Paragraph structure', kind: 'td', max_score: 20, due_at: Date.now() + 86400e3 }, t)).data.task;
  let w = (await call('GET', '/api/student/work', undefined, s1.token)).data;
  assert.equal(w.summary.todo, 1);
  assert.equal(w.groups[0].tasks[0].status, 'pending');

  // educator marks one presented with a score and one pending; marks stay hidden until published
  await call('PUT', `/api/tasks/${task.id}/students`, { items: [{ student_id: s1.id, status: 'presented', score: 15.5, feedback: 'Good topic sentences.' }] }, t);
  w = (await call('GET', '/api/student/work', undefined, s1.token)).data;
  assert.equal(w.groups[0].tasks[0].status, 'presented');
  assert.equal(w.groups[0].tasks[0].score, null, 'score hidden before publishing');
  assert.equal((await call('GET', '/api/tasks/' + task.id, undefined, t)).data.students.find((x) => x.id === s1.id).score, 15.5);
  await call('POST', `/api/tasks/${task.id}/publish`, {}, t);
  w = (await call('GET', '/api/student/work', undefined, s1.token)).data;
  assert.equal(w.groups[0].tasks[0].score, 15.5);
  assert.equal(w.groups[0].tasks[0].feedback, 'Good topic sentences.');
  assert.equal(w.summary.marked, 1);
  const w2 = (await call('GET', '/api/student/work', undefined, s2.token)).data;
  assert.equal(w2.groups[0].tasks[0].score, null, 'another student never sees my mark');

  // bulk: everyone still pending becomes presented
  await call('PUT', `/api/tasks/${task.id}/students`, { all: 'presented' }, t);
  assert.equal((await call('GET', '/api/student/work', undefined, s2.token)).data.groups[0].tasks[0].status, 'presented');
  // score is capped at the maximum
  await call('PUT', `/api/tasks/${task.id}/students`, { items: [{ student_id: s2.id, score: 99 }] }, t);
  assert.equal((await call('GET', '/api/tasks/' + task.id, undefined, t)).data.students.find((x) => x.id === s2.id).score, 20);
  // another educator cannot touch it
  const t2 = (await call('POST', '/api/auth/register', { email: 'other@example.org', full_name: 'Other Educator', password: 'Quiet-river-88' })).data.token;
  assert.equal((await call('GET', '/api/tasks/' + task.id, undefined, t2)).status, 404);

  // check-in code
  const sess = (await call('POST', '/api/sessions', { group_id: gid, starts_at: Date.now() }, t)).data.session;
  assert.equal((await call('GET', '/api/student/checkin', undefined, s1.token)).data.sessions.length, 0);
  await call('POST', `/api/sessions/${sess.id}/checkin`, { open: true }, t);
  assert.equal((await call('GET', '/api/student/checkin', undefined, s1.token)).data.sessions.length, 1);
  const code = (await call('GET', `/api/sessions/${sess.id}/checkin`, undefined, t)).data.code;
  assert.match(code, /^\d{6}$/);
  assert.equal((await call('POST', '/api/student/checkin', { session_id: sess.id, code: code === '000000' ? '111111' : '000000' }, s1.token)).status, 400);
  const ok = await call('POST', '/api/student/checkin', { session_id: sess.id, code }, s1.token);
  assert.equal(ok.data.result, 'accepted');
  assert.equal((await call('POST', '/api/student/checkin', { session_id: sess.id, code }, s1.token)).data.result, 'duplicate');
  const detail = (await call('GET', `/api/sessions/${sess.id}`, undefined, t)).data;
  assert.equal(detail.students.find((x) => x.id === s1.id).attendance.status, 'present');
  await call('POST', `/api/sessions/${sess.id}/checkin`, { open: false }, t);
  assert.equal((await call('POST', '/api/student/checkin', { session_id: sess.id, code }, s2.token)).status, 400, 'closed check-in refuses codes');
  await a.stop();
});
