// Student contact details and the private chat between a student and the educators who teach them.
import { uid, str } from './util.js';
import { bad, forbidden, notFound } from './http.js';

const EMAIL = /^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/;
const PHONE = /^\+?[0-9][0-9 ().-]{5,19}$/;
const MAX_BODY = 1000;

export function registerChat(app, ctx) {
  const { db, engine } = ctx;
  const { teacher, student, anyone } = ctx.auth;
  const { limit } = ctx.helpers;

  // ---------- contact details (the student's own) ----------
  const contactOf = (s) => ({ registration_no: s.registration_no || '', email: s.email || '', phone: s.phone || '', whatsapp: s.whatsapp || '', telegram_chat_id: s.telegram_chat_id || '' });
  app.get('/api/me/contact', student, (req) => ({ contact: contactOf(req.student) }));
  app.put('/api/me/contact', student, (req) => {
    const b = req.body || {};
    const registration_no = str(b.registration_no, 30).replace(/\s+/g, '');
    if (registration_no && !/^[A-Za-z0-9._/-]{4,30}$/.test(registration_no)) throw bad('bad_registration', 'The student ID number should be 4 to 30 letters or digits, with no spaces.');
    const email = str(b.email, 120), phone = str(b.phone, 24), whatsapp = str(b.whatsapp, 24);
    if (email && !EMAIL.test(email)) throw bad('bad_email', 'That email address does not look right.');
    if (phone && !PHONE.test(phone)) throw bad('bad_phone', 'Enter the phone number with digits only, for example +213 555 12 34 56.');
    if (whatsapp && !PHONE.test(whatsapp)) throw bad('bad_whatsapp', 'Enter the WhatsApp number with digits only, for example +213 555 12 34 56.');
    db.run('UPDATE students SET registration_no = ?, email = ?, phone = ?, whatsapp = ? WHERE id = ?', registration_no || null, email || null, phone || null, whatsapp || null, req.student.id);
    return { contact: contactOf(db.get('SELECT * FROM students WHERE id = ?', req.student.id)) };
  });

  // ---------- who may talk to whom ----------
  const teaches = (teacherId, studentId) => !!db.get('SELECT 1 AS x FROM enrollments e JOIN groups g ON g.id = e.group_id WHERE g.teacher_id = ? AND e.student_id = ?', teacherId, studentId);
  const teacherName = (id) => db.get('SELECT full_name FROM users WHERE id = ?', id)?.full_name || '';

  // ---------- threads ----------
  app.get('/api/chat', anyone, (req) => {
    if (req.user.role === 'student') {
      const rows = db.all(`SELECT DISTINCT u.id AS peer_id, u.full_name AS name FROM enrollments e JOIN groups g ON g.id = e.group_id JOIN users u ON u.id = g.teacher_id WHERE e.student_id = ?`, req.student.id);
      return { threads: rows.map((r) => {
        const last = db.get('SELECT body, sender, created_at FROM messages WHERE teacher_id = ? AND student_id = ? ORDER BY created_at DESC LIMIT 1', r.peer_id, req.student.id);
        const unread = db.get("SELECT COUNT(*) AS n FROM messages WHERE teacher_id = ? AND student_id = ? AND sender = 'teacher' AND read_at IS NULL", r.peer_id, req.student.id).n;
        return { ...r, last, unread };
      }) };
    }
    const rows = db.all(`SELECT s.id AS peer_id, s.full_name AS name, s.university_id,
        (SELECT body FROM messages m WHERE m.teacher_id = ?1 AND m.student_id = s.id ORDER BY created_at DESC LIMIT 1) AS last_body,
        (SELECT sender FROM messages m WHERE m.teacher_id = ?1 AND m.student_id = s.id ORDER BY created_at DESC LIMIT 1) AS last_sender,
        (SELECT MAX(created_at) FROM messages m WHERE m.teacher_id = ?1 AND m.student_id = s.id) AS last_at,
        (SELECT COUNT(*) FROM messages m WHERE m.teacher_id = ?1 AND m.student_id = s.id AND m.sender = 'student' AND m.read_at IS NULL) AS unread
      FROM students s WHERE EXISTS (SELECT 1 FROM messages m WHERE m.teacher_id = ?1 AND m.student_id = s.id) ORDER BY unread DESC, last_at DESC`, req.user.id);
    return { threads: rows };
  });
  app.get('/api/chat/unread', anyone, (req) => {
    const n = req.user.role === 'student'
      ? db.get("SELECT COUNT(*) AS n FROM messages WHERE student_id = ? AND sender = 'teacher' AND read_at IS NULL", req.student.id).n
      : db.get("SELECT COUNT(*) AS n FROM messages WHERE teacher_id = ? AND sender = 'student' AND read_at IS NULL", req.user.id).n;
    return { unread: n };
  });
  // The peer is the educator's id for a student, and the student's id for an educator.
  const pair = (req) => {
    const peer = req.params.peer;
    const teacherId = req.user.role === 'student' ? peer : req.user.id;
    const studentId = req.user.role === 'student' ? req.student.id : peer;
    if (!teaches(teacherId, studentId)) throw req.user.role === 'student' ? forbidden('no_chat', 'You can only write to your own educator.') : notFound('student_not_found', 'That student is not in your groups.');
    return { teacherId, studentId };
  };
  app.get('/api/chat/:peer', anyone, (req) => {
    const { teacherId, studentId } = pair(req);
    const mine = req.user.role === 'student' ? 'student' : 'teacher';
    db.run('UPDATE messages SET read_at = ? WHERE teacher_id = ? AND student_id = ? AND sender != ? AND read_at IS NULL', Date.now(), teacherId, studentId, mine);
    const messages = db.all('SELECT id, sender, body, created_at, read_at FROM messages WHERE teacher_id = ? AND student_id = ? ORDER BY created_at DESC LIMIT 200', teacherId, studentId).reverse();
    const peer = req.user.role === 'student' ? { name: teacherName(teacherId) } : db.get('SELECT full_name AS name, university_id, registration_no, email, phone, whatsapp FROM students WHERE id = ?', studentId);
    return { peer, messages };
  });
  app.post('/api/chat/:peer', anyone, (req) => {
    const { teacherId, studentId } = pair(req);
    limit(`chat:${req.user.id}`, 30, 10 * 60e3);
    const body = String(req.body?.body ?? '').replace(/\r\n/g, '\n').trim();
    if (!body) throw bad('empty_message', 'Write a message first.');
    if (body.length > MAX_BODY) throw bad('message_too_long', `Keep the message under ${MAX_BODY} characters.`);
    const sender = req.user.role === 'student' ? 'student' : 'teacher';
    const id = uid(), now = Date.now();
    db.run('INSERT INTO messages (id, teacher_id, student_id, sender, body, created_at) VALUES (?,?,?,?,?,?)', id, teacherId, studentId, sender, body, now);
    const snippet = body.length > 140 ? body.slice(0, 137) + '…' : body;
    try {
      if (sender === 'student') {
        const s = db.get('SELECT full_name FROM students WHERE id = ?', studentId);
        engine.queue({ ownerId: teacherId, studentId: null, kind: 'message', title: `Message from ${s.full_name}`, body: snippet, channels: ['inapp', 'telegram'], groupId: null })?.done.catch(() => {});
      } else {
        engine.queue({ ownerId: teacherId, studentId, kind: 'message', title: `Message from ${teacherName(teacherId)}`, body: snippet, channels: ['inapp', 'telegram'] })?.done.catch(() => {});
      }
    } catch { /* a failed alert never blocks the message */ }
    return { message: { id, sender, body, created_at: now, read_at: null } };
  });
}
