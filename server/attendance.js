import { uid, jparse, verifySignature } from './util.js';

export const STATUSES = ['present', 'late', 'absent', 'excused'];
const CODE_TOLERANCE_MS = 75e3; // a code is valid for 30 s; allow clock drift on top of that

function reject(db, session, scan, reason, studentId = null) {
  db.run('INSERT INTO scan_rejects (id, session_id, student_id, university_id, reason, scanned_at, created_at) VALUES (?,?,?,?,?,?,?)',
    uid(), session.id, studentId, String(scan.univ_id ?? '').slice(0, 40), reason, Number(scan.scanned_at) || null, Date.now());
  return { result: 'rejected', reason, univ_id: scan.univ_id ?? null, client_id: scan.client_id ?? null };
}

export function statusForTime(session, scannedAt) {
  return scannedAt <= session.starts_at + session.late_after_min * 60e3 ? 'present' : 'late';
}

// scan: { client_id, univ_id, device_id, t, sig, scanned_at }
export function applyScan(db, session, scan) {
  const scannedAt = Number(scan.scanned_at);
  const t = Number(scan.t);
  if (!scan.univ_id || !scan.device_id || !Number.isFinite(t) || !scan.sig || !Number.isFinite(scannedAt)) return reject(db, session, scan, 'malformed');
  const student = db.get('SELECT * FROM students WHERE university_id = ?', String(scan.univ_id));
  if (!student) return reject(db, session, scan, 'unknown_student');
  const enrolled = db.get('SELECT 1 AS x FROM enrollments WHERE group_id = ? AND student_id = ?', session.group_id, student.id);
  if (!enrolled) return reject(db, session, scan, 'not_enrolled', student.id);
  const device = db.get('SELECT * FROM devices WHERE id = ? AND student_id = ?', String(scan.device_id), student.id);
  if (!device) return reject(db, session, scan, 'unknown_device', student.id);
  if (device.status !== 'approved') return reject(db, session, scan, 'device_not_approved', student.id);
  if (!verifySignature(jparse(device.public_jwk, null), student.university_id, device.id, t, String(scan.sig))) return reject(db, session, scan, 'bad_signature', student.id);
  if (Math.abs(scannedAt - t * 1000) > CODE_TOLERANCE_MS) return reject(db, session, scan, 'stale_code', student.id);
  if (scannedAt < session.starts_at - 30 * 60e3) return reject(db, session, scan, 'too_early', student.id);
  if (scannedAt > session.starts_at + session.close_after_min * 60e3 && session.status === 'open') return reject(db, session, scan, 'after_close', student.id);
  if (session.status === 'closed' && session.closed_at && scannedAt > session.closed_at + 60e3) return reject(db, session, scan, 'after_close', student.id);

  const status = statusForTime(session, scannedAt);
  const ex = db.get('SELECT * FROM attendance WHERE session_id = ? AND student_id = ?', session.id, student.id);
  db.run('UPDATE devices SET last_seen = ? WHERE id = ?', Date.now(), device.id);
  if (!ex) {
    db.run('INSERT INTO attendance (id, session_id, student_id, status, scanned_at, device_id, method, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      uid(), session.id, student.id, status, scannedAt, device.id, 'qr', scannedAt);
    return { result: 'accepted', student_id: student.id, status };
  }
  if (ex.status === 'absent') {
    db.run("UPDATE attendance SET status = ?, scanned_at = ?, device_id = ?, method = 'qr', updated_at = ? WHERE id = ?", status, scannedAt, device.id, scannedAt, ex.id);
    return { result: 'accepted', student_id: student.id, status };
  }
  if (ex.scanned_at == null || scannedAt < ex.scanned_at) db.run('UPDATE attendance SET scanned_at = ? WHERE id = ?', scannedAt, ex.id);
  return { result: 'duplicate', student_id: student.id, status: ex.status };
}

// mark: { client_id, student_id, status, note, at }  (the teacher's own correction: it always wins over older data)
export function applyMark(db, session, mark, actorId) {
  if (!STATUSES.includes(mark.status)) return { result: 'rejected', reason: 'bad_status', student_id: mark.student_id };
  const enrolled = db.get('SELECT 1 AS x FROM enrollments WHERE group_id = ? AND student_id = ?', session.group_id, mark.student_id);
  if (!enrolled) return { result: 'rejected', reason: 'not_enrolled', student_id: mark.student_id };
  const at = Math.min(Number(mark.at) || Date.now(), Date.now() + 60e3);
  const note = mark.note ? String(mark.note).slice(0, 200) : null;
  const ex = db.get('SELECT * FROM attendance WHERE session_id = ? AND student_id = ?', session.id, mark.student_id);
  const scanned = mark.status === 'present' || mark.status === 'late' ? at : null;
  if (!ex) {
    db.run('INSERT INTO attendance (id, session_id, student_id, status, scanned_at, method, note, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      uid(), session.id, mark.student_id, mark.status, scanned, 'manual', note, at);
    db.audit(actorId, 'attendance.mark', 'attendance', `${session.id}:${mark.student_id}`, null, { status: mark.status, note });
    return { result: 'accepted', student_id: mark.student_id, status: mark.status };
  }
  if (at < ex.updated_at && ex.method === 'manual') return { result: 'skipped', reason: 'older_than_server', student_id: mark.student_id };
  if (ex.status === mark.status && (ex.note || null) === note) return { result: 'duplicate', student_id: mark.student_id, status: ex.status };
  db.run("UPDATE attendance SET status = ?, note = ?, method = 'manual', scanned_at = COALESCE(scanned_at, ?), updated_at = ? WHERE id = ?", mark.status, note, scanned, Math.max(at, ex.updated_at), ex.id);
  db.audit(actorId, 'attendance.edit', 'attendance', ex.id, { status: ex.status, note: ex.note }, { status: mark.status, note });
  return { result: 'accepted', student_id: mark.student_id, status: mark.status };
}

export function finalizeSession(db, engine, sessionId, actorId, closedAt = Date.now()) {
  const s = db.get('SELECT * FROM sessions WHERE id = ?', sessionId);
  if (!s || s.status === 'closed') return { closed: false, absent: 0 };
  let absent = 0;
  db.tx(() => {
    db.run("UPDATE sessions SET status = 'closed', closed_at = ? WHERE id = ?", closedAt, sessionId);
    const missing = db.all(
      `SELECT e.student_id FROM enrollments e WHERE e.group_id = ?
       AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.session_id = ? AND a.student_id = e.student_id)`, s.group_id, sessionId);
    for (const m of missing) {
      db.run("INSERT INTO attendance (id, session_id, student_id, status, method, updated_at) VALUES (?,?,?,?,?,?)", uid(), sessionId, m.student_id, 'absent', 'system', closedAt);
      absent++;
    }
    db.audit(actorId, 'session.close', 'session', sessionId, { status: 'open' }, { status: 'closed', absent });
  });
  engine.onSessionClosed(sessionId);
  return { closed: true, absent };
}

export function sessionAttendance(db, sessionId) {
  return db.all('SELECT student_id, status, scanned_at, method, note, updated_at FROM attendance WHERE session_id = ?', sessionId);
}
