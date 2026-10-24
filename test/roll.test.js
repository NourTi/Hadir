// The offline roll-call engine against the real server: a class is run from the downloaded bundle alone, then uploaded.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/app.js';
import { signCode } from '../public/js/crypto.js';
import {
  newLocalSession, checkScan, withScan, withMark, withoutLastEvent, closed, counts, attendanceMap, syncPayload, applySyncResult, effectiveStatus,
} from '../public/js/roll.js';

let srv, base, token, bundle, keys;
async function api(method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}
const phoneKey = (jwk) => crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
async function codeFor(student, atMs) {
  const k = keys.find((x) => x.student_id === student.id);
  return signCode(await phoneKey(k.private_jwk), student.university_id, k.device_id, Math.floor(atMs / 1000));
}

before(async () => {
  srv = await createServer({ dbFile: ':memory:', demo: true, noScheduler: true, secret: 'test-secret' });
  await srv.app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${srv.app.server.address().port}`;
  token = (await api('POST', '/api/auth/demo', { role: 'teacher' })).token;
  bundle = await api('GET', '/api/offline-bundle');
  keys = (await api('GET', '/api/demo/keys')).keys;
});
after(async () => { await srv.stop(); });

test('a class runs from the downloaded bundle alone, then uploads', async () => {
  const group = bundle.groups[0];
  const roster = group.roster;
  const now = Date.now();
  let local = newLocalSession({ group, topic: 'Essay structure', now });
  assert.equal(local.status, 'open');

  // 1. a good scan is accepted and marked present
  const [a, b, c, d] = roster;
  let r = await checkScan(local, roster, await codeFor(a, now), now);
  assert.equal(r.ok, true); assert.equal(r.duplicate, false); assert.equal(r.status, 'present');
  local = withScan(local, r.scan);

  // 2. the same student again is a duplicate and adds nothing
  r = await checkScan(local, roster, await codeFor(a, now + 2000), now + 2000);
  assert.equal(r.ok, true); assert.equal(r.duplicate, true);

  // 3. a code older than 45 s is refused (a screenshot sent from outside the room)
  r = await checkScan(local, roster, await codeFor(b, now - 50e3), now);
  assert.equal(r.reason, 'stale_code');

  // 4. someone else's signature on a student's ID is refused
  const other = keys.find((k) => k.student_id === c.id);
  const forged = await signCode(await phoneKey(other.private_jwk), b.university_id, keys.find((k) => k.student_id === b.id).device_id, Math.floor(now / 1000));
  r = await checkScan(local, roster, forged, now);
  assert.equal(r.reason, 'bad_signature');

  // 5. garbage and unknown students are refused without throwing
  assert.equal((await checkScan(local, roster, 'hello', now)).reason, 'malformed');
  assert.equal((await checkScan(local, roster.slice(1), await codeFor(a, now), now)).reason, 'unknown_student');

  // 6. arriving after the late limit is marked late
  const lateAt = now + (local.late_after_min + 1) * 60e3;
  r = await checkScan(local, roster, await codeFor(b, lateAt), lateAt);
  assert.equal(r.status, 'late');
  local = withScan(local, r.scan);

  // 7. after the close limit a scan is refused and the teacher must mark by hand
  const tooLate = now + (local.close_after_min + 1) * 60e3;
  assert.equal((await checkScan(local, roster, await codeFor(c, tooLate), tooLate)).reason, 'after_close');
  local = withMark(local, c.id, 'present', 'Arrived with a note', now + 1000);
  assert.equal(attendanceMap(local)[c.id].method, 'manual');

  // 8. undo removes only the latest unsent change
  const undone = withoutLastEvent(local);
  assert.equal(undone.undone.kind, 'mark');
  assert.equal(attendanceMap(undone.local)[c.id], undefined);

  // 9. a scan after a manual absent wins, and the stale mark is dropped from the upload
  local = withMark(local, d.id, 'absent', null, now + 2000);
  r = await checkScan(local, roster, await codeFor(d, now + 3000), now + 3000);
  assert.equal(r.duplicate, false, 'a manual absent can be overridden by a real scan');
  local = withScan(local, r.scan);
  assert.equal(syncPayload(local).marks.filter((m) => m.student_id === d.id).length, 0);

  // 10. close while offline, then upload everything in one batch
  local = closed(local, now + 5 * 60e3);
  assert.equal(effectiveStatus(local, attendanceMap(local), roster[5].id), 'absent', 'unmarked students show as absent once closed');
  const payload = syncPayload(local);
  const sentIds = [...payload.scans, ...payload.marks].map((x) => x.client_id);
  const res = await api('POST', '/api/sync', { sessions: [payload] });
  const out = res.results[0];
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.rejected.length, 0, JSON.stringify(out.rejected));
  assert.equal(out.session.status, 'closed');

  local = applySyncResult(local, out, sentIds);
  assert.equal(local.dirty, false);
  assert.equal(local.events.length, 0);
  const c2 = counts(local, roster);
  assert.equal(c2.none, 0);
  assert.equal(c2.present + c2.late + c2.excused + c2.absent, roster.length);
  assert.equal(local.base[a.id].status, 'present');
  assert.equal(local.base[b.id].status, 'late');
  assert.equal(local.base[c.id].status, 'present');
  assert.equal(local.base[d.id].status, 'present');

  // 11. uploading the same batch twice changes nothing (the phone may retry after a dropped connection)
  const again = await api('POST', '/api/sync', { sessions: [payload] });
  assert.equal(again.results[0].ok, true);
  assert.equal(again.results[0].attendance.find((x) => x.student_id === a.id).status, 'present');
});

test('the server re-checks what the phone accepted', async () => {
  const group = bundle.groups[1];
  const roster = group.roster;
  const now = Date.now();
  const local = newLocalSession({ group, now });
  const payload = syncPayload(local);
  payload.scans = [{ client_id: 'x1', univ_id: roster[0].university_id, device_id: 'nodevice01', t: Math.floor(now / 1000), sig: 'A'.repeat(86), scanned_at: now }];
  const res = await api('POST', '/api/sync', { sessions: [payload] });
  assert.equal(res.results[0].rejected[0].reason, 'unknown_device');
});
