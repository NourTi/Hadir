import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/app.js';

async function boot() {
  const a = await createServer({ dbFile: ':memory:', demo: false, noScheduler: true, secret: 'chat-test-secret' });
  await a.app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${a.app.server.address().port}`;
  const call = async (method, path, body, token) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  return { a, call };
}

test('contact details and a private two-way chat', async () => {
  const { a, call } = await boot();
  const t = (await call('POST', '/api/auth/register', { email: 'prof@example.org', full_name: 'Test Educator', password: 'Quiet-river-77' })).data;
  assert.ok(t.token, 'educator registered');
  const gid = (await call('POST', '/api/groups', { name: 'G1', course_name: 'Writing', semester: 1, year: 2026 }, t.token)).data.group.id;
  assert.ok(gid);
  const imp = await call('POST', `/api/groups/${gid}/students`, { rows: [{ university_id: '482009', full_name: 'Student One' }] }, t.token);
  assert.equal(imp.status, 200);
  const { hashPassword, uid } = await import('../server/util.js');
  const st = a.db.get('SELECT * FROM students WHERE university_id = ?', '482009');
  const uidv = uid();
  a.db.run("INSERT INTO users (id, role, login, password_hash, full_name, language, created_at) VALUES (?,?,?,?,?,?,?)", uidv, 'student', '482009', hashPassword('student-pass-1'), st.full_name, 'en', Date.now());
  a.db.run('UPDATE students SET user_id = ? WHERE id = ?', uidv, st.id);
  const stoken = (await call('POST', '/api/auth/login', { login: '482009', password: 'student-pass-1' })).data.token;
  assert.ok(stoken, 'student signed in');

  // contact details
  assert.equal((await call('PUT', '/api/me/contact', { email: 'bad' }, stoken)).status, 400);
  const ok = await call('PUT', '/api/me/contact', { email: 's1@example.org', phone: '+213 555 12 34 56', whatsapp: '0555123456' }, stoken);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.contact.email, 's1@example.org');
  assert.equal((await call('GET', '/api/me/contact', undefined, t.token)).status, 403, 'educators have no student contact route');

  // chat
  const teachers = (await call('GET', '/api/chat', undefined, stoken)).data.threads;
  assert.equal(teachers.length, 1);
  const tid = teachers[0].peer_id;
  assert.equal((await call('POST', `/api/chat/${tid}`, { body: '' }, stoken)).status, 400);
  assert.equal((await call('POST', `/api/chat/${tid}`, { body: 'x'.repeat(1001) }, stoken)).status, 400);
  assert.equal((await call('POST', `/api/chat/${tid}`, { body: 'Hello, I was absent last week.' }, stoken)).status, 200);
  assert.equal((await call('GET', '/api/chat/unread', undefined, t.token)).data.unread, 1);
  const sid = (await call('GET', '/api/chat', undefined, t.token)).data.threads[0].peer_id;
  const thread = (await call('GET', `/api/chat/${sid}`, undefined, t.token)).data;
  assert.equal(thread.messages.length, 1);
  assert.equal(thread.peer.phone, '+213 555 12 34 56');
  assert.equal((await call('GET', '/api/chat/unread', undefined, t.token)).data.unread, 0, 'reading clears the badge');
  assert.equal((await call('POST', `/api/chat/${sid}`, { body: 'Send me the excuse form.' }, t.token)).status, 200);
  assert.equal((await call('GET', '/api/chat/unread', undefined, stoken)).data.unread, 1);

  // a stranger educator cannot read this thread
  const t2 = (await call('POST', '/api/auth/register', { email: 'other@example.org', full_name: 'Other Educator', password: 'Quiet-river-88' })).data;
  if (t2.token) assert.equal((await call('GET', `/api/chat/${sid}`, undefined, t2.token)).status, 404);
  await a.stop();
});
