// Educator accounts: sign-up with a profile, recovery codes, "forgot password", the owner's tools, and each educator's own data export.
import { uid, hashPassword, verifyPassword, jparse, str, clamp, num, recoveryCode, normalizeRecovery, weakPassword, DUMMY_HASH } from './util.js';
import { HttpError, bad, forbidden, notFound, conflict } from './http.js';
import { insertRule, defaultRules } from './engine.js';

export const ACCENTS = ['green', 'ink', 'plum', 'clay', 'teal', 'slate'];
const TITLES = ['', 'Mr', 'Ms', 'Dr', 'Prof', 'Assoc. Prof', 'Asst. Lecturer'];
const EMAIL = /^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/;
const RESET_TTL = 24 * 3600e3;

export function registerAccounts(app, ctx) {
  const { db, cfg } = ctx;
  const { teacher, owner } = ctx.auth;
  const { session, limit, profileOf } = ctx.helpers;
  const registrationOpen = () => db.kvGet('registration_open') !== '0';
  const hasTeacher = () => !!db.get("SELECT 1 AS x FROM users WHERE role IN ('teacher','admin')");

  const cleanProfile = (b = {}, base = {}) => {
    const subjects = (Array.isArray(b.subjects) ? b.subjects : typeof b.subjects === 'string' ? b.subjects.split(/[,;\n،]/) : base.subjects || [])
      .map((x) => str(x, 60)).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 20);
    const d = { ...(base.defaults || {}), ...(b.defaults || {}) };
    const defaults = {
      late_after_min: clamp(num(d.late_after_min, 15), 0, 120), close_after_min: clamp(num(d.close_after_min, 45), 5, 240),
      absence_warn: clamp(num(d.absence_warn, 2), 1, 20), absence_notice: clamp(num(d.absence_notice, 3), 1, 20), semester: clamp(num(d.semester, 1), 1, 2),
    };
    const pick = (k, n) => str(b[k] ?? base[k], n);
    const email = pick('public_email', 120);
    if (email && !EMAIL.test(email)) throw bad('bad_email', 'The contact email is not valid.');
    const title = pick('title', 20);
    return {
      title: TITLES.includes(title) ? title : '', institution: pick('institution', 120), faculty: pick('faculty', 120), department: pick('department', 120), degree: pick('degree', 120),
      specialization: pick('specialization', 120), office: pick('office', 60), phone: pick('phone', 30), public_email: email, subjects,
      accent: ACCENTS.includes(b.accent) ? b.accent : (ACCENTS.includes(base.accent) ? base.accent : 'green'), intro: pick('intro', 400), defaults,
    };
  };
  const saveProfile = (userId, p) => db.run(
    `INSERT INTO educators (user_id, title, institution, faculty, department, degree, specialization, office, phone, public_email, subjects, accent, intro, defaults, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET title=excluded.title, institution=excluded.institution, faculty=excluded.faculty, department=excluded.department, degree=excluded.degree, specialization=excluded.specialization,
       office=excluded.office, phone=excluded.phone, public_email=excluded.public_email, subjects=excluded.subjects, accent=excluded.accent, intro=excluded.intro, defaults=excluded.defaults, updated_at=excluded.updated_at`,
    userId, p.title, p.institution, p.faculty, p.department, p.degree, p.specialization, p.office, p.phone, p.public_email, JSON.stringify(p.subjects), p.accent, p.intro, JSON.stringify(p.defaults), Date.now());

  // ---------- sign-up ----------
  function register(req) {
    limit(`register:${req.ip}`, 10, 60 * 60e3);
    const first = !hasTeacher();
    if (!first && !registrationOpen()) throw forbidden('registration_closed', 'New educator accounts are closed on this installation. Ask the owner to open sign-up.');
    const email = str(req.body.email, 120).toLowerCase();
    const name = str(req.body.full_name, 80);
    const password = String(req.body.password || '');
    if (!EMAIL.test(email)) throw bad('bad_email', 'Enter a valid email address.');
    if (name.length < 3) throw bad('name_required', 'Enter your full name.');
    const weak = weakPassword(password, { email, name });
    if (weak) throw bad('weak_password', weak);
    if (db.get('SELECT 1 AS x FROM users WHERE login = ?', email)) throw conflict('email_taken', 'An account with this email already exists. Sign in, or use "Forgot password".');
    const profile = cleanProfile(req.body);
    const id = uid(); const code = recoveryCode();
    db.tx(() => {
      db.run('INSERT INTO users (id, role, login, password_hash, full_name, language, is_owner, recovery_hash, created_at, last_login) VALUES (?,?,?,?,?,?,?,?,?,?)',
        id, 'teacher', email, hashPassword(password), name, req.body.language === 'ar' ? 'ar' : 'en', first ? 1 : 0, hashPassword(normalizeRecovery(code)), Date.now(), Date.now());
      saveProfile(id, profile);
      for (const r of defaultRules()) insertRule(db, id, r);
      db.audit(id, 'account.create', 'user', id, null, { role: 'teacher', owner: first });
    });
    return { ...session(db.get('SELECT * FROM users WHERE id = ?', id)), recovery_code: code };
  }
  app.post('/api/auth/register', register);
  app.post('/api/auth/setup', register);

  // ---------- forgot password ----------
  // The code is either the recovery code shown at sign-up, or a one-time code the owner issued. Both give the same answer when wrong.
  app.post('/api/auth/forgot', (req) => {
    const email = str(req.body.email, 120).toLowerCase();
    limit(`forgot:${req.ip}`, 15, 60 * 60e3);
    limit(`forgot:${email}`, 6, 60 * 60e3);
    const code = normalizeRecovery(req.body.code);
    const u = db.get("SELECT * FROM users WHERE login = ? AND role IN ('teacher','admin') AND active = 1", email);
    const newPw = String(req.body.new_password || '');
    const fail = () => bad('bad_recovery', 'The email or the code is not right.');
    if (!u || code.length < 19) { verifyPassword(code, DUMMY_HASH); throw fail(); }
    let via = null, resetRow = null;
    if (u.recovery_hash && verifyPassword(code, u.recovery_hash)) via = 'recovery';
    else {
      for (const r of db.all('SELECT * FROM password_resets WHERE user_id = ? AND used_at IS NULL AND expires_at > ?', u.id, Date.now())) if (verifyPassword(code, r.code_hash)) { via = 'owner'; resetRow = r; break; }
    }
    if (!via) throw fail();
    const weak = weakPassword(newPw, { email, name: u.full_name });
    if (weak) throw bad('weak_password', weak);
    const next = recoveryCode();
    db.tx(() => {
      db.run('UPDATE users SET password_hash = ?, token_ver = token_ver + 1, failed_logins = 0, locked_until = 0, recovery_hash = ? WHERE id = ?', hashPassword(newPw), hashPassword(normalizeRecovery(next)), u.id);
      db.run('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', Date.now(), u.id);
      db.audit(u.id, 'account.reset', 'user', u.id, null, { via });
    });
    // The old recovery code is spent. A new one is shown so the educator always holds a working one.
    return { ok: true, recovery_code: next };
  });

  // ---------- profile and recovery code ----------
  app.get('/api/me/profile', teacher, (req) => ({ profile: profileOf(req.user.id) }));
  app.put('/api/me/profile', teacher, (req) => {
    const p = cleanProfile(req.body, profileOf(req.user.id) || {});
    saveProfile(req.user.id, p);
    if (req.body.full_name) db.run('UPDATE users SET full_name = ? WHERE id = ?', str(req.body.full_name, 80), req.user.id);
    db.audit(req.user.id, 'profile.update', 'user', req.user.id);
    return { user: ctx.helpers.publicUser(db.get('SELECT * FROM users WHERE id = ?', req.user.id)) };
  });
  app.post('/api/me/recovery', teacher, (req) => {
    limit(`recovery:${req.user.id}`, 6, 15 * 60e3);
    if (!verifyPassword(req.body.password, req.user.password_hash)) throw bad('wrong_password', 'The password is not right.');
    const code = recoveryCode();
    db.run('UPDATE users SET recovery_hash = ? WHERE id = ?', hashPassword(normalizeRecovery(code)), req.user.id);
    db.audit(req.user.id, 'account.recovery', 'user', req.user.id);
    return { recovery_code: code };
  });

  // ---------- the owner's tools ----------
  app.get('/api/educators', owner, () => ({
    registration_open: registrationOpen(),
    educators: db.all(`SELECT u.id, u.full_name, u.login, u.is_owner, u.active, u.created_at, u.last_login, e.institution, e.department,
        (SELECT COUNT(*) FROM groups g WHERE g.teacher_id = u.id AND g.archived = 0) AS groups FROM users u LEFT JOIN educators e ON e.user_id = u.id
        WHERE u.role IN ('teacher','admin') ORDER BY u.created_at`).map((r) => ({ ...r, is_owner: !!r.is_owner, active: !!r.active })),
  }));
  app.post('/api/settings/registration', owner, (req) => {
    db.kvSet('registration_open', req.body.open ? '1' : '0');
    db.audit(req.user.id, 'settings.registration', 'system', null, null, { open: !!req.body.open });
    return { registration_open: registrationOpen() };
  });
  // The https address students use to reach this computer (a tunnel or a domain). The QR codes and join links are built from it.
  app.post('/api/settings/public-url', owner, (req) => {
    const raw = str(req.body.url, 200);
    if (!raw) { db.kvSet('public_url', ''); db.audit(req.user.id, 'settings.public_url', 'system', null, null, { url: '' }); return { public_url: '' }; }
    let u;
    try { u = new URL(raw); } catch { throw bad('bad_url', 'Enter a full address that starts with https://'); }
    if (u.protocol !== 'https:' || u.pathname !== '/' || u.search || u.hash || u.username) throw bad('bad_url', 'Use an address like https://your-name.ngrok-free.app with nothing after it.');
    db.kvSet('public_url', u.origin);
    app.allowedHosts.add(u.host.toLowerCase()); app.allowedHosts.add(u.hostname.toLowerCase());
    db.audit(req.user.id, 'settings.public_url', 'system', null, null, { url: u.origin });
    return { public_url: u.origin };
  });
  app.post('/api/educators/:id/reset', owner, (req) => {
    const u = db.get("SELECT * FROM users WHERE id = ? AND role IN ('teacher','admin')", req.params.id);
    if (!u || u.id === req.user.id) throw notFound('educator_not_found', 'That educator does not exist.');
    const code = recoveryCode();
    db.run('INSERT INTO password_resets (id, user_id, code_hash, issued_by, expires_at, created_at) VALUES (?,?,?,?,?,?)', uid(), u.id, hashPassword(normalizeRecovery(code)), req.user.id, Date.now() + RESET_TTL, Date.now());
    db.audit(req.user.id, 'educator.reset_code', 'user', u.id);
    return { code, email: u.login, expires_at: Date.now() + RESET_TTL };
  });
  app.post('/api/educators/:id/active', owner, (req) => {
    const u = db.get("SELECT * FROM users WHERE id = ? AND role IN ('teacher','admin')", req.params.id);
    if (!u || u.id === req.user.id) throw notFound('educator_not_found', 'That educator does not exist.');
    db.run('UPDATE users SET active = ?, token_ver = token_ver + 1 WHERE id = ?', req.body.active ? 1 : 0, u.id);
    db.audit(req.user.id, req.body.active ? 'educator.enable' : 'educator.disable', 'user', u.id);
    return { ok: true };
  });

  // ---------- each educator can take their own data with them ----------
  app.get('/api/export/mine', teacher, (req, res) => {
    const id = req.user.id;
    const groups = db.all('SELECT * FROM groups WHERE teacher_id = ? ORDER BY created_at', id).map((g) => ({
      ...g, schedule: jparse(g.schedule, []), join_token: undefined,
      students: db.all('SELECT s.university_id, s.full_name, s.email, s.phone FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.group_id = ? ORDER BY s.full_name', g.id),
      sessions: db.all('SELECT id, starts_at, topic, status, closed_at FROM sessions WHERE group_id = ? ORDER BY starts_at', g.id).map((s) => ({
        ...s, attendance: db.all('SELECT s2.university_id, a.status, a.scanned_at, a.method, a.note FROM attendance a JOIN students s2 ON s2.id = a.student_id WHERE a.session_id = ? ORDER BY s2.full_name', s.id) })),
      assessments: db.all('SELECT id, title, skill, weight, max_score, due_at, published FROM assessments WHERE group_id = ?', g.id).map((a) => ({
        ...a, grades: db.all('SELECT s3.university_id, r.score, r.cefr, r.feedback FROM grades r JOIN students s3 ON s3.id = r.student_id WHERE r.assessment_id = ?', a.id) })),
    }));
    const body = JSON.stringify({ exported_at: new Date().toISOString(), educator: { name: req.user.full_name, email: req.user.login, profile: profileOf(id) }, groups }, null, 1);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Content-Disposition': `attachment; filename="hadir-my-data-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'no-store' });
    res.end(body);
    db.audit(id, 'export.mine', 'user', id);
  });
}
