import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/app.js';

async function boot(extra = {}) {
  const a = await createServer({ dbFile: ':memory:', demo: false, noScheduler: true, secret: 'restore-test-secret', ...extra });
  await a.app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${a.app.server.address().port}`;
  const call = async (method, p, body, token) => {
    const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  return { a, call };
}

test('restore a backup onto a fresh server', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-rt-'));
  const A = await boot({ backupDir: dir });
  const ta = (await A.call('POST', '/api/auth/register', { email: 'old@example.org', full_name: 'Old Educator', password: 'Quiet-river-77' })).data.token;
  const gid = (await A.call('POST', '/api/groups', { name: 'Old Group', course_name: 'Writing', semester: 1, year: 2026 }, ta)).data.group.id;
  await A.call('POST', `/api/groups/${gid}/students`, { rows: [{ university_id: '111111', full_name: 'Student One' }, { university_id: '222222', full_name: 'Student Two' }] }, ta);
  const file = A.a.engine.backup('t1');
  const bytes = fs.readFileSync(file);
  await A.a.stop();

  // a fresh server: someone signs up again, then restores
  const B = await boot();
  const tb = (await B.call('POST', '/api/auth/register', { email: 'new@example.org', full_name: 'New Account', password: 'Quiet-river-88' })).data.token;
  assert.equal((await B.call('POST', '/api/restore', { data: bytes.toString('base64') })).status, 401, 'needs sign-in');
  assert.equal((await B.call('POST', '/api/restore', { data: Buffer.from('not a database '.repeat(400)).toString('base64') }, tb)).status, 400);
  assert.equal((await B.call('POST', '/api/restore', {}, tb)).status, 400);
  const r = await B.call('POST', '/api/restore', { data: bytes.toString('base64') }, tb);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.counts.students, 2);
  assert.equal(r.data.counts.groups, 1);
  // the old educator can sign in again and sees the old group
  const login = await B.call('POST', '/api/auth/login', { login: 'old@example.org', password: 'Quiet-river-77' });
  assert.ok(login.data.token, 'old account works after restore');
  const groups = (await B.call('GET', '/api/groups', undefined, login.data.token)).data.groups;
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'Old Group');
  await B.a.stop();
});
