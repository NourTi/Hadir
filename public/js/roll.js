// The roll-call engine. Pure functions with no storage, network or DOM, so it runs the same in the browser and in tests.
// A "local session" is what the teacher's phone keeps while class is running, with or without internet:
//   { id, group_id, group_name, topic, starts_at, late_after_min, close_after_min, status: 'open'|'closed', closed_at,
//     base:   { [student_id]: { status, scanned_at, method, note } }   what the server already knows
//     events: [ { kind: 'scan', ... } | { kind: 'mark', ... } ]         what happened since, not yet uploaded
//   }
import { parseCode, verifyCode, CODE_TOLERANCE_MS, randomId } from './crypto.js';

export const STATUSES = ['present', 'late', 'absent', 'excused'];

export function newLocalSession({ group, topic = '', now, id = randomId() }) {
  return {
    id, group_id: group.id, group_name: group.name, topic, starts_at: now,
    late_after_min: group.late_after_min, close_after_min: group.close_after_min,
    status: 'open', closed_at: null, base: {}, events: [], dirty: true, created_at: now,
  };
}

// Rebuild a local session from what the server already holds (used when you open a session that was started elsewhere).
export function localFromServer(row, groupName, attendance) {
  return {
    id: row.id, group_id: row.group_id, group_name: groupName, topic: row.topic || '', starts_at: row.starts_at,
    late_after_min: row.late_after_min, close_after_min: row.close_after_min, status: row.status, closed_at: row.closed_at,
    base: Object.fromEntries((attendance || []).map((a) => [a.student_id, { status: a.status, scanned_at: a.scanned_at, method: a.method, note: a.note }])),
    events: [], dirty: false, created_at: row.created_at,
  };
}

// The attendance a teacher sees right now: server data, then unsent scans and marks on top, in order.
export function attendanceMap(local) {
  const map = { ...local.base };
  for (const ev of local.events) {
    if (ev.kind === 'scan') map[ev.student_id] = { status: ev.status, scanned_at: ev.scanned_at, method: 'qr', note: null };
    else map[ev.student_id] = { status: ev.status, scanned_at: ev.status === 'present' || ev.status === 'late' ? ev.at : null, method: 'manual', note: ev.note || null };
  }
  return map;
}

// Closing marks everyone who has no entry as absent. The server does the same; this keeps the screen honest while offline.
export function effectiveStatus(local, map, studentId) {
  return map[studentId]?.status ?? (local.status === 'closed' ? 'absent' : null);
}

export function counts(local, roster) {
  const map = attendanceMap(local);
  const c = { present: 0, late: 0, absent: 0, excused: 0, none: 0, total: roster.length };
  for (const s of roster) {
    const st = effectiveStatus(local, map, s.id);
    if (st) c[st]++; else c.none++;
  }
  return c;
}

export const statusForTime = (local, at) => (at <= local.starts_at + local.late_after_min * 60e3 ? 'present' : 'late');

// Check one scanned code against the class list, the student's public key and the clock. Never throws.
// Result: { ok, reason?, duplicate?, student?, status?, scan? }   (scan is the record to store when ok and not a duplicate)
export async function checkScan(local, roster, text, now) {
  const p = parseCode(text);
  if (!p) return { ok: false, reason: 'malformed' };
  const student = roster.find((s) => s.university_id === p.univ_id);
  if (!student) return { ok: false, reason: 'unknown_student', univ_id: p.univ_id };
  const own = (student.devices || []).find((d) => d.id === p.device_id);
  if (!own) return { ok: false, reason: 'unknown_device', student };
  if (own.status !== 'approved' || !own.public_jwk) return { ok: false, reason: 'device_not_approved', student };
  if (!(await verifyCode(own.public_jwk, p))) return { ok: false, reason: 'bad_signature', student };
  if (Math.abs(now - p.t * 1000) > CODE_TOLERANCE_MS) return { ok: false, reason: 'stale_code', student };
  if (now > local.starts_at + local.close_after_min * 60e3) return { ok: false, reason: 'after_close', student };
  const cur = attendanceMap(local)[student.id];
  if (cur && cur.status !== 'absent') return { ok: true, duplicate: true, student, status: cur.status };
  const status = statusForTime(local, now);
  return { ok: true, duplicate: false, student, status, scan: { kind: 'scan', client_id: randomId(), student_id: student.id, status, univ_id: p.univ_id, device_id: p.device_id, t: p.t, sig: p.sig, scanned_at: now } };
}

// Immutable-style helpers: each returns the changed session so callers can store it.
export function withScan(local, scan) {
  // A scan replaces any earlier unsent manual mark for the same student, so the server cannot overwrite it with a stale mark.
  const events = local.events.filter((e) => !(e.kind === 'mark' && e.student_id === scan.student_id));
  return { ...local, events: [...events, scan], dirty: true };
}
export function withMark(local, studentId, status, note, now) {
  const events = local.events.filter((e) => !(e.kind === 'mark' && e.student_id === studentId));
  return { ...local, events: [...events, { kind: 'mark', client_id: randomId(), student_id: studentId, status, note: note || null, at: now }], dirty: true };
}
// Undo only touches what has not been uploaded yet. Returns { local, undone } where undone is the removed event or null.
export function withoutLastEvent(local) {
  if (!local.events.length) return { local, undone: null };
  const undone = local.events[local.events.length - 1];
  return { local: { ...local, events: local.events.slice(0, -1), dirty: local.events.length > 1 || local.status === 'closed' || !local.synced_once }, undone };
}
export const withTopic = (local, topic) => ({ ...local, topic, dirty: true });
export const closed = (local, now) => ({ ...local, status: 'closed', closed_at: now, dirty: true });

export function syncPayload(local) {
  return {
    id: local.id, group_id: local.group_id, starts_at: local.starts_at, topic: local.topic || '',
    late_after_min: local.late_after_min, close_after_min: local.close_after_min,
    status: local.status, closed_at: local.closed_at,
    scans: local.events.filter((e) => e.kind === 'scan').map(({ client_id, univ_id, device_id, t, sig, scanned_at }) => ({ client_id, univ_id, device_id, t, sig, scanned_at })),
    marks: local.events.filter((e) => e.kind === 'mark').map(({ client_id, student_id, status, note, at }) => ({ client_id, student_id, status, note, at })),
  };
}

// After the server accepted a batch: its attendance becomes the new base, and only events added meanwhile stay unsent.
export function applySyncResult(local, result, sentIds) {
  const sent = new Set(sentIds);
  const events = local.events.filter((e) => !sent.has(e.client_id));
  const base = Object.fromEntries((result.attendance || []).map((a) => [a.student_id, { status: a.status, scanned_at: a.scanned_at, method: a.method, note: a.note }]));
  const status = result.session?.status === 'closed' ? 'closed' : local.status;
  const stillDirty = events.length > 0 || (local.status === 'closed' && status !== 'closed');
  return { ...local, base, events, status, closed_at: result.session?.closed_at ?? local.closed_at, synced_once: true, dirty: stillDirty };
}

export const REJECT_REASONS = ['malformed', 'unknown_student', 'unknown_device', 'device_not_approved', 'bad_signature', 'stale_code', 'after_close'];
