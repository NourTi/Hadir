import fs from 'node:fs';
import path from 'node:path';
import { uid, shortId, inviteCode, normalizeCode, hashPassword, verifyPassword, signToken, verifyToken, sanitizeJwk, jparse, clamp, num, str } from './util.js';
import { HttpError, bad, unauthorized, forbidden, notFound, conflict } from './http.js';
import { insertRule, defaultRules } from './engine.js';
import { applyScan, applyMark, finalizeSession, sessionAttendance, STATUSES } from './attendance.js';
import { groupStats, flagFor } from './stats.js';

const TOKEN_TTL = 30 * 24 * 3600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXCUSE_TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

export function registerCore(app, ctx) {
  const { db, engine, cfg } = ctx;

  // ---------- helpers ----------
  const hits = new Map();
  function limit(key, max = 10, windowMs = 10 * 60e3) {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return; }
    if (++h.n > max) throw new HttpError(429, 'too_many_attempts', 'Too many attempts. Wait a few minutes and try again.');
  }
  const publicUser = (u) => {
    const out = { id: u.id, role: u.role, full_name: u.full_name, login: u.login, language: u.language, telegram_chat_id: u.telegram_chat_id };
    if (u.role === 'student') {
      const s = db.get('SELECT id, university_id FROM students WHERE user_id = ?', u.id);
      if (s) { out.student_id = s.id; out.university_id = s.university_id; }
    }
    return out;
  };
  const session = (u, extra = {}) => ({ token: signToken({ sub: u.id, role: u.role }, cfg.secret, TOKEN_TTL), user: publicUser(u), ...extra });

  const auth = (...roles) => (req) => {
    const h = req.headers.authorization || '';
    const p = verifyToken(h.startsWith('Bearer ') ? h.slice(7) : '', cfg.secret);
    if (!p) throw unauthorized();
    const user = db.get('SELECT * FROM users WHERE id = ? AND active = 1', p.sub);
    if (!user) throw unauthorized();
    if (roles.length && !roles.includes(user.role)) throw forbidden();
    req.user = user;
    if (user.role === 'student') req.student = db.get('SELECT * FROM students WHERE user_id = ?', user.id);
  };
  const teacher = auth('teacher', 'admin');
  const student = auth('student');
  const anyone = auth();
  ctx.auth = { teacher, student, anyone };

  const ownedGroup = (teacherId, groupId) => {
    const g = db.get('SELECT * FROM groups WHERE id = ? AND teacher_id = ?', groupId, teacherId);
    if (!g) throw notFound('group_not_found', 'That group does not exist.');
    return g;
  };
  const ownedSession = (teacherId, sessionId) => {
    const s = db.get('SELECT * FROM sessions WHERE id = ? AND teacher_id = ?', sessionId, teacherId);
    if (!s) throw notFound('session_not_found', 'That session does not exist.');
    return s;
  };
  const ownsStudent = (teacherId, studentId) =>
    !!db.get('SELECT 1 AS x FROM enrollments e JOIN groups g ON g.id = e.group_id WHERE g.teacher_id = ? AND e.student_id = ?', teacherId, studentId);
  ctx.helpers = { ownedGroup, ownedSession, ownsStudent, publicUser, session, limit, UUID };

  const groupOut = (g) => ({ ...g, schedule: jparse(g.schedule, []), archived: !!g.archived });

  // ---------- config / time ----------
  app.get('/api/config', () => ({
    demo: cfg.demo, setup_needed: !db.get("SELECT 1 AS x FROM users WHERE role = 'teacher'"),
    telegram: !!cfg.telegramToken, webhook: !!cfg.webhookUrl, version: '1.0.0',
  }));
  app.get('/api/time', () => ({ now: Date.now() }));

  // ---------- auth ----------
  app.post('/api/auth/setup', (req) => {
    if (db.get("SELECT 1 AS x FROM users WHERE role = 'teacher'")) throw conflict('already_setup', 'This server already has a teacher account. Sign in instead.');
    const email = str(req.body.email, 120).toLowerCase();
    const name = str(req.body.full_name, 80);
    const password = String(req.body.password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('bad_email', 'Enter a valid email address.');
    if (!name) throw bad('name_required', 'Enter your name.');
    if (password.length < 8) throw bad('weak_password', 'Use a password with at least 8 characters.');
    const id = uid();
    db.tx(() => {
      db.run('INSERT INTO users (id, role, login, password_hash, full_name, language, created_at) VALUES (?,?,?,?,?,?,?)', id, 'teacher', email, hashPassword(password), name, req.body.language === 'ar' ? 'ar' : 'en', Date.now());
      for (const r of defaultRules()) insertRule(db, id, r);
      db.audit(id, 'account.create', 'user', id, null, { role: 'teacher' });
    });
    return session(db.get('SELECT * FROM users WHERE id = ?', id));
  });

  app.post('/api/auth/login', (req) => {
    const login = str(req.body.login, 120).toLowerCase();
    limit(`login:${req.ip}:${login}`, 10);
    const u = db.get('SELECT * FROM users WHERE login = ? AND active = 1', login);
    if (!u || !verifyPassword(req.body.password, u.password_hash)) throw unauthorized('bad_credentials', 'The ID or password is not right.');
    return session(u);
  });

  app.post('/api/auth/activate', (req) => {
    const univ = str(req.body.university_id, 40);
    limit(`activate:${req.ip}:${univ}`, 8);
    const st = db.get('SELECT * FROM students WHERE university_id = ?', univ);
    const code = normalizeCode(req.body.code);
    if (!st || !st.invite_code || st.invite_code !== code) throw bad('invalid_invite', 'That student ID and code do not match. Ask your teacher for a new code.');
    const password = String(req.body.password || '');
    if (password.length < 8) throw bad('weak_password', 'Use a password with at least 8 characters.');
    const jwk = sanitizeJwk(req.body.device?.public_jwk);
    if (!jwk) throw bad('bad_device_key', 'This phone could not create its signing key.');
    const deviceId = shortId(10);
    const userId = db.tx(() => {
      let uidv = st.user_id;
      if (uidv) db.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), uidv);
      else {
        uidv = uid();
        db.run('INSERT INTO users (id, role, login, password_hash, full_name, language, created_at) VALUES (?,?,?,?,?,?,?)', uidv, 'student', univ.toLowerCase(), hashPassword(password), st.full_name, req.body.language === 'ar' ? 'ar' : 'en', Date.now());
        db.run('UPDATE students SET user_id = ? WHERE id = ?', uidv, st.id);
      }
      db.run("UPDATE devices SET status = 'revoked' WHERE student_id = ? AND status != 'revoked'", st.id);
      db.run("INSERT INTO devices (id, student_id, public_jwk, label, status, created_at) VALUES (?,?,?,?,?,?)", deviceId, st.id, JSON.stringify(jwk), str(req.body.device?.label, 60) || 'Phone', 'approved', Date.now());
      db.run('UPDATE students SET invite_code = NULL WHERE id = ?', st.id);
      db.audit(uidv, 'student.activate', 'student', st.id, null, { device: deviceId });
      return uidv;
    });
    return session(db.get('SELECT * FROM users WHERE id = ?', userId), { device_id: deviceId });
  });

  // ---------- self-join: a student scans the class poster, types their own name and ID, and is enrolled ----------
  const normName = (x) => String(x || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const joinGroup = (token) => {
    const g = token && db.get('SELECT g.*, u.full_name AS teacher_name FROM groups g JOIN users u ON u.id = g.teacher_id WHERE g.join_token = ? AND g.archived = 0', String(token));
    if (!g) throw notFound('join_not_found', 'This join link is not valid. Ask your teacher for a new QR code.');
    return g;
  };
  app.get('/api/join/:token', (req) => {
    limit(`joininfo:${req.ip}`, 60);
    const g = joinGroup(req.params.token);
    return { group: { name: g.name, course_name: g.course_name, teacher_name: g.teacher_name }, open: !!g.join_open };
  });
  app.post('/api/join/:token', (req) => {
    limit(`join:${req.ip}`, 12);
    const g = joinGroup(req.params.token);
    if (!g.join_open) throw bad('join_closed', 'Joining is closed for this class. Ask your teacher to open it.');
    let univ = str(req.body.university_id, 40).replace(/\s+/g, '');
    const name = str(req.body.full_name, 80);
    const password = String(req.body.password || '');
    // The student ID is optional. Without one, Hadir gives the student a short ID of its own.
    if (!univ) { do { univ = 'H' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0'); } while (db.get('SELECT 1 AS x FROM students WHERE university_id = ?', univ)); }
    if (!/^[0-9A-Za-z][0-9A-Za-z\-_/]{0,39}$/.test(univ)) throw bad('bad_university_id', 'Use only letters, numbers, - or / in the student ID, or leave it empty.');
    if (name.length < 3) throw bad('name_required', 'Enter your full name.');
    if (password.length < 8) throw bad('weak_password', 'Use a password with at least 8 characters.');
    const jwk = sanitizeJwk(req.body.device?.public_jwk);
    if (!jwk) throw bad('bad_device_key', 'This phone could not create its signing key. Open the link in Chrome or Safari over https.');
    const deviceId = shortId(10);
    const label = str(req.body.device?.label, 60) || 'Phone';
    const lang = req.body.language === 'ar' ? 'ar' : 'en';
    const userId = db.tx(() => {
      let st = db.get('SELECT * FROM students WHERE university_id = ?', univ);
      let uidv;
      if (!st) {
        const id = uid();
        db.run('INSERT INTO students (id, university_id, full_name, created_at) VALUES (?,?,?,?)', id, univ, name, Date.now());
        st = db.get('SELECT * FROM students WHERE id = ?', id);
      } else if (st.user_id) {
        const u = db.get('SELECT * FROM users WHERE id = ?', st.user_id);
        if (!u || !verifyPassword(password, u.password_hash)) throw bad('already_registered', 'This student ID already has an account. Use the same password you chose before.');
        uidv = u.id;
      } else if (normName(st.full_name) !== normName(name)) {
        throw bad('name_mismatch', 'This ID is already on your teacher\'s list under a different name. Type your name exactly as your teacher listed it.');
      }
      if (!uidv) {
        uidv = uid();
        db.run('INSERT INTO users (id, role, login, password_hash, full_name, language, created_at) VALUES (?,?,?,?,?,?,?)', uidv, 'student', univ.toLowerCase(), hashPassword(password), st.full_name, lang, Date.now());
        db.run('UPDATE students SET user_id = ?, invite_code = NULL WHERE id = ?', uidv, st.id);
      }
      const hasApproved = db.get("SELECT 1 AS x FROM devices WHERE student_id = ? AND status = 'approved'", st.id);
      const status = hasApproved && !cfg.demo ? 'pending' : 'approved';
      db.run('INSERT INTO devices (id, student_id, public_jwk, label, status, created_at) VALUES (?,?,?,?,?,?)', deviceId, st.id, JSON.stringify(jwk), label, status, Date.now());
      db.run('INSERT OR IGNORE INTO enrollments (group_id, student_id, created_at) VALUES (?,?,?)', g.id, st.id, Date.now());
      db.audit(uidv, 'student.selfjoin', 'group', g.id, null, { student: st.id, device: deviceId, status });
      return uidv;
    });
    return session(db.get('SELECT * FROM users WHERE id = ?', userId), { device_id: deviceId, device_status: db.get('SELECT status FROM devices WHERE id = ?', deviceId)?.status });
  });
  // The teacher's side: get (and create) the join link of a group, open or close it, or replace it with a new one.
  app.post('/api/groups/:id/join', teacher, (req) => {
    const g = ownedGroup(req.user.id, req.params.id);
    let token = g.join_token;
    let open = g.join_open;
    if (!token || req.body.regenerate) token = shortId(16);
    if (req.body.open !== undefined) open = req.body.open ? 1 : 0;
    db.run('UPDATE groups SET join_token = ?, join_open = ? WHERE id = ?', token, open, g.id);
    db.audit(req.user.id, 'group.join', 'group', g.id, { open: g.join_open }, { open, regenerate: !!req.body.regenerate });
    return { token, open: !!open };
  });

  app.get('/api/me', anyone, (req) => ({ user: publicUser(req.user) }));
  app.patch('/api/me', anyone, (req) => {
    const b = req.body;
    if (b.language === 'en' || b.language === 'ar') db.run('UPDATE users SET language = ? WHERE id = ?', b.language, req.user.id);
    if (b.full_name && req.user.role === 'teacher') db.run('UPDATE users SET full_name = ? WHERE id = ?', str(b.full_name, 80), req.user.id);
    if (b.telegram_chat_id !== undefined) {
      const v = str(b.telegram_chat_id, 40) || null;
      db.run('UPDATE users SET telegram_chat_id = ? WHERE id = ?', v, req.user.id);
      if (req.student) db.run('UPDATE students SET telegram_chat_id = ? WHERE id = ?', v, req.student.id);
    }
    if (b.new_password) {
      if (!verifyPassword(b.current_password, req.user.password_hash)) throw bad('wrong_password', 'The current password is not right.');
      if (String(b.new_password).length < 8) throw bad('weak_password', 'Use a password with at least 8 characters.');
      db.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(b.new_password), req.user.id);
      db.audit(req.user.id, 'account.password', 'user', req.user.id);
    }
    return { user: publicUser(db.get('SELECT * FROM users WHERE id = ?', req.user.id)) };
  });

  // ---------- devices ----------
  app.post('/api/devices', student, (req) => {
    if (!req.student) throw notFound('no_student', 'No student record is linked to this account.');
    const jwk = sanitizeJwk(req.body.public_jwk);
    if (!jwk) throw bad('bad_device_key', 'This phone could not create its signing key.');
    const hasApproved = db.get("SELECT 1 AS x FROM devices WHERE student_id = ? AND status = 'approved'", req.student.id);
    const status = hasApproved && !cfg.demo ? 'pending' : 'approved';
    const id = shortId(10);
    db.run('INSERT INTO devices (id, student_id, public_jwk, label, status, created_at) VALUES (?,?,?,?,?,?)', id, req.student.id, JSON.stringify(jwk), str(req.body.label, 60) || 'Phone', status, Date.now());
    db.audit(req.user.id, 'device.register', 'device', id, null, { status });
    return { device: { id, status } };
  });
  app.get('/api/devices', anyone, (req) => {
    if (req.user.role === 'student') {
      return { devices: db.all('SELECT id, label, status, created_at, last_seen FROM devices WHERE student_id = ? ORDER BY created_at DESC', req.student.id) };
    }
    const status = req.query.status;
    const rows = db.all(
      `SELECT DISTINCT d.id, d.label, d.status, d.created_at, d.last_seen, s.id AS student_id, s.full_name, s.university_id FROM devices d
       JOIN students s ON s.id = d.student_id JOIN enrollments e ON e.student_id = s.id JOIN groups g ON g.id = e.group_id
       WHERE g.teacher_id = ? ${status ? 'AND d.status = ?' : ''} ORDER BY d.created_at DESC`, ...(status ? [req.user.id, status] : [req.user.id]));
    return { devices: rows };
  });
  app.post('/api/devices/:id/decision', teacher, (req) => {
    const d = db.get('SELECT * FROM devices WHERE id = ?', req.params.id);
    if (!d || !ownsStudent(req.user.id, d.student_id)) throw notFound('device_not_found', 'That phone is not registered.');
    const status = req.body.status;
    if (status !== 'approved' && status !== 'revoked') throw bad('bad_status', 'Choose approve or revoke.');
    db.run('UPDATE devices SET status = ? WHERE id = ?', status, d.id);
    db.audit(req.user.id, 'device.' + status, 'device', d.id, { status: d.status }, { status });
    return { ok: true };
  });

  // ---------- groups ----------
  const parseSchedule = (v) => {
    if (!Array.isArray(v)) return [];
    return v.slice(0, 14).map((x) => ({ day: clamp(num(x.day), 0, 6), start: /^\d{2}:\d{2}$/.test(x.start) ? x.start : '08:00', end: /^\d{2}:\d{2}$/.test(x.end) ? x.end : '09:30', room: str(x.room, 30) }));
  };
  const groupFields = (b, base = {}) => ({
    name: str(b.name ?? base.name, 80), course_name: str(b.course_name ?? base.course_name, 80), code: str(b.code ?? base.code, 30) || null,
    semester: clamp(num(b.semester ?? base.semester, 1), 1, 2), year: clamp(num(b.year ?? base.year, new Date().getFullYear()), 2000, 2100),
    schedule: JSON.stringify(parseSchedule(b.schedule ?? jparse(base.schedule, []))),
    late_after_min: clamp(num(b.late_after_min ?? base.late_after_min, 15), 0, 120), close_after_min: clamp(num(b.close_after_min ?? base.close_after_min, 45), 5, 240),
    absence_warn: clamp(num(b.absence_warn ?? base.absence_warn, 2), 1, 20), absence_notice: clamp(num(b.absence_notice ?? base.absence_notice, 3), 1, 20),
  });
  app.get('/api/groups', teacher, (req) => {
    const groups = db.all('SELECT * FROM groups WHERE teacher_id = ? AND archived = 0 ORDER BY created_at', req.user.id);
    return {
      groups: groups.map((g) => {
        const agg = db.get("SELECT SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END) AS att, SUM(CASE WHEN a.status IN ('present','late','absent') THEN 1 ELSE 0 END) AS den FROM attendance a JOIN sessions s ON s.id = a.session_id WHERE s.group_id = ? AND s.status = 'closed'", g.id);
        const stats = groupStats(db, g.id);
        const students = db.all('SELECT student_id FROM enrollments WHERE group_id = ?', g.id);
        return {
          ...groupOut(g),
          students: students.length,
          closed_sessions: stats.total,
          open_session_id: db.get("SELECT id FROM sessions WHERE group_id = ? AND status = 'open' ORDER BY starts_at DESC LIMIT 1", g.id)?.id ?? null,
          rate: agg.den ? agg.att / agg.den : null,
          at_risk: students.filter((s) => flagFor(stats.get(s.student_id), g) === 'risk').length,
        };
      }),
    };
  });
  app.post('/api/groups', teacher, (req) => {
    const f = groupFields(req.body);
    if (!f.name) throw bad('name_required', 'Give the group a name.');
    const id = uid();
    db.run(`INSERT INTO groups (id, teacher_id, name, course_name, code, semester, year, schedule, late_after_min, close_after_min, absence_warn, absence_notice, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, req.user.id, f.name, f.course_name, f.code, f.semester, f.year, f.schedule, f.late_after_min, f.close_after_min, f.absence_warn, f.absence_notice, Date.now());
    db.audit(req.user.id, 'group.create', 'group', id, null, { name: f.name });
    return { group: groupOut(db.get('SELECT * FROM groups WHERE id = ?', id)) };
  });
  app.patch('/api/groups/:id', teacher, (req) => {
    const g = ownedGroup(req.user.id, req.params.id);
    const f = groupFields(req.body, g);
    if (!f.name) throw bad('name_required', 'Give the group a name.');
    db.run(`UPDATE groups SET name=?, course_name=?, code=?, semester=?, year=?, schedule=?, late_after_min=?, close_after_min=?, absence_warn=?, absence_notice=? WHERE id=?`,
      f.name, f.course_name, f.code, f.semester, f.year, f.schedule, f.late_after_min, f.close_after_min, f.absence_warn, f.absence_notice, g.id);
    db.audit(req.user.id, 'group.update', 'group', g.id, { name: g.name }, { name: f.name });
    return { group: groupOut(db.get('SELECT * FROM groups WHERE id = ?', g.id)) };
  });
  app.del('/api/groups/:id', teacher, (req) => {
    const g = ownedGroup(req.user.id, req.params.id);
    db.run('UPDATE groups SET archived = 1 WHERE id = ?', g.id);
    db.audit(req.user.id, 'group.archive', 'group', g.id, null, null);
  });

  // ---------- roster ----------
  function rosterFor(g) {
    const stats = groupStats(db, g.id);
    const rows = db.all('SELECT s.* FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.group_id = ? ORDER BY s.full_name COLLATE NOCASE', g.id);
    return rows.map((s) => {
      const st = stats.get(s.id);
      const devices = db.all("SELECT id, label, status, public_jwk, last_seen FROM devices WHERE student_id = ? AND status != 'revoked'", s.id)
        .map((d) => ({ id: d.id, label: d.label, status: d.status, last_seen: d.last_seen, public_jwk: d.status === 'approved' ? jparse(d.public_jwk, null) : null }));
      return {
        id: s.id, university_id: s.university_id, full_name: s.full_name, email: s.email, phone: s.phone, telegram_chat_id: s.telegram_chat_id,
        activated: !!s.user_id, invite_code: s.invite_code, devices, stats: st, flag: flagFor(st, g),
      };
    });
  }
  app.get('/api/groups/:id/roster', teacher, (req) => {
    const g = ownedGroup(req.user.id, req.params.id);
    return { group: groupOut(g), students: rosterFor(g), server_time: Date.now() };
  });
  app.post('/api/groups/:id/students', teacher, (req) => {
    const g = ownedGroup(req.user.id, req.params.id);
    const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 500) : [];
    if (!rows.length) throw bad('no_rows', 'There are no students to add.');
    const out = { created: 0, existing: 0, already_in_group: 0, invalid: [], invites: [] };
    db.tx(() => {
      rows.forEach((r, i) => {
        const univ = str(r.university_id, 40);
        const name = str(r.full_name, 80);
        if (!/^[0-9A-Za-z][0-9A-Za-z\-_/]{0,39}$/.test(univ)) return out.invalid.push({ row: i + 1, reason: 'bad_university_id', value: univ });
        if (!name) return out.invalid.push({ row: i + 1, reason: 'name_required', value: univ });
        let s = db.get('SELECT * FROM students WHERE university_id = ?', univ);
        if (!s) {
          const id = uid(); const code = inviteCode();
          db.run('INSERT INTO students (id, university_id, full_name, email, phone, telegram_chat_id, invite_code, created_at) VALUES (?,?,?,?,?,?,?,?)',
            id, univ, name, str(r.email, 120) || null, str(r.phone, 30) || null, str(r.telegram, 40) || null, code, Date.now());
          s = db.get('SELECT * FROM students WHERE id = ?', id);
          out.created++; out.invites.push({ university_id: univ, full_name: name, code });
        } else {
          out.existing++;
          if (!s.user_id && s.invite_code) out.invites.push({ university_id: univ, full_name: s.full_name, code: s.invite_code });
        }
        const res = db.run('INSERT OR IGNORE INTO enrollments (group_id, student_id, created_at) VALUES (?,?,?)', g.id, s.id, Date.now());
        if (!res.changes) out.already_in_group++;
      });
      db.audit(req.user.id, 'roster.import', 'group', g.id, null, { created: out.created, existing: out.existing });
    });
    return out;
  });
  app.del('/api/groups/:id/students/:sid', teacher, (req) => {
    const g = ownedGroup(req.user.id, req.params.id);
    db.run('DELETE FROM enrollments WHERE group_id = ? AND student_id = ?', g.id, req.params.sid);
    db.audit(req.user.id, 'roster.remove', 'student', req.params.sid, { group: g.id }, null);
  });
  app.patch('/api/students/:sid', teacher, (req) => {
    if (!ownsStudent(req.user.id, req.params.sid)) throw notFound('student_not_found', 'That student is not in your groups.');
    const b = req.body;
    const s = db.get('SELECT * FROM students WHERE id = ?', req.params.sid);
    db.run('UPDATE students SET full_name = ?, email = ?, phone = ?, telegram_chat_id = ? WHERE id = ?',
      str(b.full_name ?? s.full_name, 80), str(b.email ?? s.email, 120) || null, str(b.phone ?? s.phone, 30) || null, str(b.telegram_chat_id ?? s.telegram_chat_id, 40) || null, s.id);
    return { ok: true };
  });
  app.post('/api/students/:sid/invite', teacher, (req) => {
    if (!ownsStudent(req.user.id, req.params.sid)) throw notFound('student_not_found', 'That student is not in your groups.');
    const code = inviteCode();
    db.run('UPDATE students SET invite_code = ? WHERE id = ?', code, req.params.sid);
    db.audit(req.user.id, 'student.invite', 'student', req.params.sid);
    return { code };
  });

  // ---------- sessions ----------
  function upsertSession(user, s) {
    const g = ownedGroup(user.id, s.group_id);
    const id = UUID.test(s.id || '') ? s.id.toLowerCase() : uid();
    let row = db.get('SELECT * FROM sessions WHERE id = ?', id);
    if (row && row.teacher_id !== user.id) throw forbidden();
    if (row && row.group_id !== g.id) throw bad('group_mismatch', 'This session belongs to another group.');
    if (!row) {
      const startsAt = clamp(num(s.starts_at, Date.now()), 946684800000, Date.now() + 366 * 86400e3);
      db.run('INSERT INTO sessions (id, group_id, teacher_id, starts_at, topic, status, late_after_min, close_after_min, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        id, g.id, user.id, startsAt, str(s.topic, 120) || null, 'open', clamp(num(s.late_after_min, g.late_after_min), 0, 120), clamp(num(s.close_after_min, g.close_after_min), 5, 240), Date.now());
      db.audit(user.id, 'session.open', 'session', id, null, { group: g.id });
    } else if (s.topic !== undefined && str(s.topic, 120) !== (row.topic || '')) {
      db.run('UPDATE sessions SET topic = ? WHERE id = ?', str(s.topic, 120) || null, id);
    }
    return db.get('SELECT * FROM sessions WHERE id = ?', id);
  }
  ctx.helpers.upsertSession = upsertSession;

  function syncOne(user, input) {
    let sess = upsertSession(user, input);
    const res = { id: sess.id, ok: true, accepted: 0, duplicates: 0, rejected: [], skipped: 0 };
    for (const scan of (input.scans || []).slice(0, 600)) {
      const r = applyScan(db, sess, scan);
      if (r.result === 'accepted') res.accepted++; else if (r.result === 'duplicate') res.duplicates++; else res.rejected.push({ client_id: r.client_id, univ_id: r.univ_id, reason: r.reason });
    }
    for (const mark of (input.marks || []).slice(0, 600)) {
      const r = applyMark(db, sess, mark, user.id);
      if (r.result === 'accepted') res.accepted++; else if (r.result === 'duplicate') res.duplicates++; else if (r.result === 'skipped') res.skipped++; else res.rejected.push({ student_id: r.student_id, reason: r.reason });
    }
    if (input.status === 'closed') finalizeSession(db, engine, sess.id, user.id, clamp(num(input.closed_at, Date.now()), sess.starts_at, Date.now()));
    sess = db.get('SELECT * FROM sessions WHERE id = ?', sess.id);
    res.session = { status: sess.status, closed_at: sess.closed_at };
    res.attendance = sessionAttendance(db, sess.id);
    return res;
  }
  app.post('/api/sync', teacher, (req) => {
    const results = [];
    for (const s of (Array.isArray(req.body.sessions) ? req.body.sessions : []).slice(0, 40)) {
      try { results.push(db.tx(() => syncOne(req.user, s))); } catch (e) { results.push({ id: s?.id ?? null, ok: false, error: e.code || 'sync_failed', message: e.message }); }
    }
    return { results, server_time: Date.now() };
  });

  const sessionRow = (s) => ({ ...s, attendance_counts: Object.fromEntries(db.all('SELECT status, COUNT(*) AS n FROM attendance WHERE session_id = ? GROUP BY status', s.id).map((r) => [r.status, r.n])) });
  app.get('/api/sessions', teacher, (req) => {
    const where = req.query.group_id ? 'AND s.group_id = ?' : '';
    const rows = db.all(`SELECT s.*, g.name AS group_name FROM sessions s JOIN groups g ON g.id = s.group_id WHERE s.teacher_id = ? ${where} ORDER BY s.starts_at DESC LIMIT ?`,
      ...(req.query.group_id ? [req.user.id, req.query.group_id, clamp(num(req.query.limit, 60), 1, 300)] : [req.user.id, clamp(num(req.query.limit, 60), 1, 300)]));
    return { sessions: rows.map(sessionRow) };
  });
  app.post('/api/sessions', teacher, (req) => ({ session: sessionRow(upsertSession(req.user, req.body)) }));
  app.get('/api/sessions/:id', teacher, (req) => {
    const s = ownedSession(req.user.id, req.params.id);
    const g = db.get('SELECT * FROM groups WHERE id = ?', s.group_id);
    const att = new Map(db.all('SELECT * FROM attendance WHERE session_id = ?', s.id).map((a) => [a.student_id, a]));
    const students = db.all('SELECT st.* FROM enrollments e JOIN students st ON st.id = e.student_id WHERE e.group_id = ? ORDER BY st.full_name COLLATE NOCASE', g.id)
      .map((st) => ({ id: st.id, university_id: st.university_id, full_name: st.full_name, attendance: att.get(st.id) ? { status: att.get(st.id).status, scanned_at: att.get(st.id).scanned_at, method: att.get(st.id).method, note: att.get(st.id).note } : null,
        excuse: db.get('SELECT id, state FROM excuses WHERE student_id = ? AND session_id = ? ORDER BY created_at DESC LIMIT 1', st.id, s.id) || null }));
    const rejects = db.all('SELECT r.*, st.full_name FROM scan_rejects r LEFT JOIN students st ON st.id = r.student_id WHERE r.session_id = ? AND r.resolved = 0 ORDER BY r.created_at', s.id);
    return { session: s, group: groupOut(g), students, rejects };
  });
  app.post('/api/sessions/:id/close', teacher, (req) => {
    const s = ownedSession(req.user.id, req.params.id);
    const r = finalizeSession(db, engine, s.id, req.user.id);
    return { ...r, session: db.get('SELECT * FROM sessions WHERE id = ?', s.id) };
  });
  app.del('/api/sessions/:id', teacher, (req) => {
    const s = ownedSession(req.user.id, req.params.id);
    db.run('DELETE FROM sessions WHERE id = ?', s.id);
    db.audit(req.user.id, 'session.delete', 'session', s.id, { group: s.group_id, starts_at: s.starts_at }, null);
  });
  app.put('/api/sessions/:id/attendance/:sid', teacher, (req) => {
    const s = ownedSession(req.user.id, req.params.id);
    if (!STATUSES.includes(req.body.status)) throw bad('bad_status', 'Choose present, late, absent or excused.');
    const r = db.tx(() => applyMark(db, s, { student_id: req.params.sid, status: req.body.status, note: req.body.note, at: Date.now() + 1 }, req.user.id));
    if (r.result === 'rejected') throw bad(r.reason, 'That student is not in this group.');
    return { ok: true, attendance: sessionAttendance(db, s.id).find((a) => a.student_id === req.params.sid) };
  });
  app.post('/api/rejects/:id/resolve', teacher, (req) => {
    const r = db.get('SELECT r.* FROM scan_rejects r JOIN sessions s ON s.id = r.session_id WHERE r.id = ? AND s.teacher_id = ?', req.params.id, req.user.id);
    if (!r) throw notFound('reject_not_found', 'That scan is not in your review list.');
    if (req.body.action === 'accept') {
      if (!r.student_id) throw bad('unknown_student', 'This code does not belong to a student in your groups.');
      const s = db.get('SELECT * FROM sessions WHERE id = ?', r.session_id);
      const status = STATUSES.includes(req.body.status) ? req.body.status : 'late';
      db.tx(() => applyMark(db, s, { student_id: r.student_id, status, note: 'Accepted from the review list', at: Date.now() }, req.user.id));
    }
    db.run('UPDATE scan_rejects SET resolved = 1 WHERE id = ?', r.id);
    return { ok: true };
  });

  // ---------- offline bundle (what the teacher's phone keeps for class) ----------
  app.get('/api/offline-bundle', teacher, (req) => {
    const groups = db.all('SELECT * FROM groups WHERE teacher_id = ? AND archived = 0 ORDER BY created_at', req.user.id);
    const open = db.all("SELECT * FROM sessions WHERE teacher_id = ? AND status = 'open' ORDER BY starts_at DESC", req.user.id);
    return {
      server_time: Date.now(),
      groups: groups.map((g) => ({ ...groupOut(g), roster: rosterFor(g) })),
      open_sessions: open.map((s) => ({ session: s, attendance: sessionAttendance(db, s.id) })),
    };
  });

  // ---------- excuses ----------
  app.post('/api/excuses', student, (req) => {
    const st = req.student;
    const sess = db.get('SELECT s.*, g.name AS group_name, g.teacher_id AS owner FROM sessions s JOIN groups g ON g.id = s.group_id WHERE s.id = ?', req.body.session_id);
    const a = sess && db.get('SELECT * FROM attendance WHERE session_id = ? AND student_id = ?', sess.id, st.id);
    if (!sess || !a || a.status !== 'absent') throw bad('not_absent', 'You can only send an excuse for a session where you were marked absent.');
    if (db.get("SELECT 1 AS x FROM excuses WHERE student_id = ? AND session_id = ? AND state IN ('pending','approved')", st.id, sess.id)) throw conflict('already_sent', 'You already sent an excuse for this session.');
    const reason = str(req.body.reason, 600);
    if (reason.length < 3) throw bad('reason_required', 'Write a short reason.');
    let file = {};
    if (req.body.file?.data) {
      const ext = String(req.body.file.name || '').split('.').pop().toLowerCase();
      const mime = EXCUSE_TYPES[ext];
      if (!mime) throw bad('bad_file_type', 'Attach a PDF, PNG, JPG or WEBP file.');
      const buf = Buffer.from(String(req.body.file.data), 'base64');
      if (buf.length > 3 * 1024 * 1024) throw bad('file_too_large', 'The file is larger than 3 MB.');
      const magic = { pdf: buf.subarray(0, 4).toString() === '%PDF', png: buf[0] === 0x89 && buf[1] === 0x50, jpg: buf[0] === 0xff && buf[1] === 0xd8, webp: buf.subarray(8, 12).toString() === 'WEBP' };
      if (!magic[ext]) throw bad('bad_file_type', 'That file does not look like a real ' + ext.toUpperCase() + '.');
      fs.mkdirSync(cfg.uploadDir, { recursive: true });
      const name = `${uid()}.${ext}`;
      fs.writeFileSync(path.join(cfg.uploadDir, name), buf);
      file = { file_name: str(req.body.file.name, 120), file_path: name, file_mime: mime };
    }
    const id = uid();
    db.run('INSERT INTO excuses (id, student_id, session_id, reason, file_name, file_path, file_mime, created_at) VALUES (?,?,?,?,?,?,?,?)', id, st.id, sess.id, reason, file.file_name ?? null, file.file_path ?? null, file.file_mime ?? null, Date.now());
    engine.queue({ ownerId: sess.owner, kind: 'excuse', title: 'New excuse to review', body: `${st.full_name} sent an excuse for ${sess.group_name}.`, channels: ['inapp'], groupId: sess.group_id, dedupe: `excuse:${id}` });
    return { id };
  });
  app.get('/api/excuses', anyone, (req) => {
    if (req.user.role === 'student') {
      return { excuses: db.all('SELECT e.id, e.session_id, e.reason, e.state, e.decision_note, e.file_name, e.created_at, e.decided_at FROM excuses e WHERE e.student_id = ? ORDER BY e.created_at DESC', req.student.id) };
    }
    const state = req.query.state;
    const rows = db.all(
      `SELECT e.id, e.session_id, e.reason, e.state, e.decision_note, e.file_name, e.created_at, e.decided_at, st.full_name, st.university_id, s.starts_at, s.topic, g.name AS group_name
       FROM excuses e JOIN students st ON st.id = e.student_id JOIN sessions s ON s.id = e.session_id JOIN groups g ON g.id = s.group_id
       WHERE g.teacher_id = ? ${state ? 'AND e.state = ?' : ''} ORDER BY (e.state = 'pending') DESC, e.created_at DESC LIMIT 200`, ...(state ? [req.user.id, state] : [req.user.id]));
    return { excuses: rows };
  });
  app.post('/api/excuses/:id/decision', teacher, (req) => {
    const e = db.get(`SELECT e.*, s.group_id, s.id AS sid, g.name AS group_name FROM excuses e JOIN sessions s ON s.id = e.session_id JOIN groups g ON g.id = s.group_id WHERE e.id = ? AND g.teacher_id = ?`, req.params.id, req.user.id);
    if (!e) throw notFound('excuse_not_found', 'That excuse does not exist.');
    const state = req.body.state;
    if (state !== 'approved' && state !== 'rejected') throw bad('bad_state', 'Choose approve or reject.');
    if (e.state !== 'pending') throw conflict('already_decided', 'This excuse was already decided.');
    const note = str(req.body.note, 300) || null;
    db.tx(() => {
      db.run('UPDATE excuses SET state = ?, decision_note = ?, decided_at = ? WHERE id = ?', state, note, Date.now(), e.id);
      if (state === 'approved') applyMark(db, db.get('SELECT * FROM sessions WHERE id = ?', e.sid), { student_id: e.student_id, status: 'excused', note: 'Excuse approved', at: Date.now() + 1 }, req.user.id);
      db.audit(req.user.id, 'excuse.' + state, 'excuse', e.id, { state: 'pending' }, { state, note });
    });
    const stu = db.get('SELECT * FROM students WHERE id = ?', e.student_id);
    const lang = (stu.user_id && db.get('SELECT language FROM users WHERE id = ?', stu.user_id)?.language) || 'en';
    const T = {
      en: { approved: ['Excuse approved', `Your excuse for ${e.group_name} was approved. The absence no longer counts.`], rejected: ['Excuse not accepted', `Your excuse for ${e.group_name} was not accepted.${note ? ' Note: ' + note : ''}`] },
      ar: { approved: ['تم قبول العذر', `تم قبول عذرك في ${e.group_name}. لن يُحتسب الغياب.`], rejected: ['لم يُقبل العذر', `لم يتم قبول عذرك في ${e.group_name}.${note ? ' ملاحظة: ' + note : ''}`] },
    }[lang][state];
    engine.queue({ ownerId: req.user.id, studentId: e.student_id, kind: 'excuse', title: T[0], body: T[1], channels: ['inapp', 'telegram'], groupId: e.group_id, dedupe: `excuse-decision:${e.id}` });
    return { ok: true };
  });
  app.get('/api/excuses/:id/file', anyone, (req, res) => {
    const e = db.get('SELECT e.*, g.teacher_id FROM excuses e JOIN sessions s ON s.id = e.session_id JOIN groups g ON g.id = s.group_id WHERE e.id = ?', req.params.id);
    if (!e || !e.file_path) throw notFound('file_not_found', 'No file was attached.');
    const allowed = req.user.role === 'student' ? req.student && req.student.id === e.student_id : e.teacher_id === req.user.id;
    if (!allowed) throw forbidden();
    const buf = fs.readFileSync(path.join(cfg.uploadDir, path.basename(e.file_path)));
    res.writeHead(200, { 'Content-Type': e.file_mime, 'Content-Length': buf.length, 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store' });
    res.end(buf);
  });

  // ---------- notifications ----------
  app.get('/api/notifications', anyone, (req) => {
    const shape = (n) => ({ ...n, channels: jparse(n.channels, []), deliveries: jparse(n.deliveries, {}) });
    if (req.user.role === 'student') {
      const rows = db.all(`SELECT * FROM notifications WHERE student_id = ? AND status IN ('sent','queued','failed') AND channels LIKE '%"inapp"%' ORDER BY created_at DESC LIMIT 60`, req.student.id);
      return { inbox: rows.map(shape), unread: rows.filter((r) => !r.read_at).length };
    }
    const inbox = db.all('SELECT * FROM notifications WHERE owner_id = ? AND student_id IS NULL ORDER BY created_at DESC LIMIT 40', req.user.id).map(shape);
    const pending = db.all("SELECT n.*, s.full_name AS student_name FROM notifications n LEFT JOIN students s ON s.id = n.student_id WHERE n.owner_id = ? AND n.status = 'pending_approval' ORDER BY n.created_at DESC", req.user.id).map(shape);
    const log = db.all("SELECT n.*, s.full_name AS student_name FROM notifications n LEFT JOIN students s ON s.id = n.student_id WHERE n.owner_id = ? AND n.student_id IS NOT NULL AND n.status != 'pending_approval' ORDER BY n.created_at DESC LIMIT 80", req.user.id).map(shape);
    return { inbox, pending, log, unread: inbox.filter((r) => !r.read_at).length };
  });
  app.post('/api/notifications/read-all', anyone, (req) => {
    if (req.user.role === 'student') db.run('UPDATE notifications SET read_at = ? WHERE student_id = ? AND read_at IS NULL', Date.now(), req.student.id);
    else db.run('UPDATE notifications SET read_at = ? WHERE owner_id = ? AND student_id IS NULL AND read_at IS NULL', Date.now(), req.user.id);
  });
  app.post('/api/notifications/:id/approve', teacher, async (req) => {
    const n = db.get('SELECT * FROM notifications WHERE id = ? AND owner_id = ?', req.params.id, req.user.id);
    if (!n) throw notFound('notification_not_found', 'That message does not exist.');
    await engine.approve(n.id, req.user.id);
  });
  app.post('/api/notifications/:id/reject', teacher, (req) => {
    const n = db.get('SELECT * FROM notifications WHERE id = ? AND owner_id = ?', req.params.id, req.user.id);
    if (!n) throw notFound('notification_not_found', 'That message does not exist.');
    engine.reject(n.id, req.user.id);
  });

  // ---------- dashboard ----------
  app.get('/api/dashboard', teacher, (req) => {
    const uidv = req.user.id;
    const groups = db.all('SELECT * FROM groups WHERE teacher_id = ? AND archived = 0 ORDER BY created_at', uidv);
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todays = groups.filter((g) => jparse(g.schedule, []).some((s) => s.day === now.getDay())).map((g) => {
      const slot = jparse(g.schedule, []).find((s) => s.day === now.getDay());
      return { group_id: g.id, name: g.name, start: slot.start, end: slot.end, room: slot.room,
        session_id: db.get('SELECT id FROM sessions WHERE group_id = ? AND starts_at >= ? ORDER BY starts_at DESC LIMIT 1', g.id, dayStart)?.id ?? null };
    });
    const open = db.all("SELECT s.*, g.name AS group_name FROM sessions s JOIN groups g ON g.id = s.group_id WHERE s.teacher_id = ? AND s.status = 'open' ORDER BY s.starts_at DESC", uidv);
    const recent = db.all("SELECT s.*, g.name AS group_name FROM sessions s JOIN groups g ON g.id = s.group_id WHERE s.teacher_id = ? AND s.status = 'closed' ORDER BY s.starts_at DESC LIMIT 6", uidv).map(sessionRow);
    const weekAgo = Date.now() - 7 * 86400e3;
    const wk = db.get(`SELECT SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END) AS att, SUM(CASE WHEN a.status IN ('present','late','absent') THEN 1 ELSE 0 END) AS den
      FROM attendance a JOIN sessions s ON s.id = a.session_id JOIN groups g ON g.id = s.group_id WHERE g.teacher_id = ? AND s.status = 'closed' AND s.starts_at >= ?`, uidv, weekAgo);
    let atRisk = 0;
    for (const g of groups) {
      const stats = groupStats(db, g.id);
      for (const r of db.all('SELECT student_id FROM enrollments WHERE group_id = ?', g.id)) if (flagFor(stats.get(r.student_id), g) === 'risk') atRisk++;
    }
    const count = (sql, ...p) => db.get(sql, ...p).n;
    return {
      server_time: Date.now(), today: todays, open_sessions: open, recent_sessions: recent,
      week_rate: wk.den ? wk.att / wk.den : null,
      counts: {
        pending_excuses: count("SELECT COUNT(*) AS n FROM excuses e JOIN sessions s ON s.id = e.session_id JOIN groups g ON g.id = s.group_id WHERE g.teacher_id = ? AND e.state = 'pending'", uidv),
        pending_messages: count("SELECT COUNT(*) AS n FROM notifications WHERE owner_id = ? AND status = 'pending_approval'", uidv),
        pending_devices: count("SELECT COUNT(DISTINCT d.id) AS n FROM devices d JOIN enrollments e ON e.student_id = d.student_id JOIN groups g ON g.id = e.group_id WHERE g.teacher_id = ? AND d.status = 'pending'", uidv),
        review_scans: count("SELECT COUNT(*) AS n FROM scan_rejects r JOIN sessions s ON s.id = r.session_id WHERE s.teacher_id = ? AND r.resolved = 0 AND r.student_id IS NOT NULL", uidv),
        at_risk: atRisk,
      },
      upcoming: db.all("SELECT a.id, a.title, a.skill, a.due_at, g.name AS group_name FROM assessments a JOIN groups g ON g.id = a.group_id WHERE g.teacher_id = ? AND a.due_at > ? ORDER BY a.due_at LIMIT 5", uidv, Date.now()),
    };
  });
}
