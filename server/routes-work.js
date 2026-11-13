// Homework, TD and project tracking (per-student status, marks and feedback), plus the check-in code for self roll call.
import crypto from 'node:crypto';
import { uid, str, num, clamp } from './util.js';
import { bad, notFound } from './http.js';
import { statusForTime } from './attendance.js';

const KINDS = ['homework', 'td', 'project', 'other'];
const STATUSES = ['pending', 'presented', 'late', 'missing', 'excused'];
const WINDOW = 30e3;

export function registerWork(app, ctx) {
  const { db, engine, cfg } = ctx;
  const { teacher, student } = ctx.auth;
  const { limit } = ctx.helpers;

  const ownGroup = (userId, id) => db.get('SELECT * FROM groups WHERE id = ? AND teacher_id = ?', id, userId) || (() => { throw notFound('group_not_found', 'That group is not in your list.'); })();
  const ownTask = (userId, id) => db.get('SELECT t.* FROM tasks t JOIN groups g ON g.id = t.group_id WHERE t.id = ? AND g.teacher_id = ?', id, userId) || (() => { throw notFound('task_not_found', 'That task is not in your groups.'); })();
  const roster = (groupId) => db.all('SELECT st.id, st.full_name, st.university_id FROM enrollments e JOIN students st ON st.id = e.student_id WHERE e.group_id = ? ORDER BY st.full_name COLLATE NOCASE', groupId);
  const notifyStudents = (task, group, kind, title, body, only) => {
    for (const s of roster(group.id)) {
      if (only && !only.has(s.id)) continue;
      try { engine.queue({ ownerId: group.teacher_id, studentId: s.id, kind: 'task', title, body, channels: ['inapp', 'telegram'], groupId: group.id, dedupe: `task-${kind}:${task.id}:${s.id}` })?.done.catch(() => {}); } catch { /* alerts never block the work */ }
    }
  };

  function taskInput(b, cur = {}) {
    const title = str(b.title ?? cur.title, 140);
    if (!title) throw bad('title_required', 'Give the task a title.');
    const kind = KINDS.includes(b.kind ?? cur.kind) ? (b.kind ?? cur.kind) : 'homework';
    const due = b.due_at === null || b.due_at === '' ? null : (b.due_at !== undefined ? num(b.due_at, null) : cur.due_at ?? null);
    const max = b.max_score === null || b.max_score === '' ? null : (b.max_score !== undefined ? clamp(num(b.max_score, 20), 1, 1000) : cur.max_score ?? null);
    return { title, kind, details: str(b.details ?? cur.details ?? '', 2000), due_at: due, max_score: max };
  }

  // ---------- educator: tasks of a group ----------
  app.get('/api/groups/:id/tasks', teacher, (req) => {
    const g = ownGroup(req.user.id, req.params.id);
    const n = roster(g.id).length;
    const tasks = db.all('SELECT * FROM tasks WHERE group_id = ? ORDER BY COALESCE(due_at, created_at) DESC', g.id).map((t) => {
      const rows = db.all('SELECT status, score FROM task_status WHERE task_id = ?', t.id);
      const count = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
      count.pending = n - rows.filter((r) => r.status !== 'pending').length;
      return { ...t, students: n, counts: count, marked: rows.filter((r) => r.score != null).length };
    });
    return { tasks };
  });
  app.post('/api/groups/:id/tasks', teacher, (req) => {
    const g = ownGroup(req.user.id, req.params.id);
    const v = taskInput(req.body || {});
    const id = uid(), now = Date.now();
    db.run('INSERT INTO tasks (id, group_id, kind, title, details, due_at, max_score, marks_visible, created_at, updated_at) VALUES (?,?,?,?,?,?,?,0,?,?)', id, g.id, v.kind, v.title, v.details, v.due_at, v.max_score, now, now);
    db.audit(req.user.id, 'task.create', 'task', id, null, { title: v.title });
    const task = db.get('SELECT * FROM tasks WHERE id = ?', id);
    if (req.body?.notify !== false) notifyStudents(task, g, 'new', `New ${v.kind === 'td' ? 'TD' : 'work'}: ${v.title}`, v.due_at ? `Due ${new Date(v.due_at).toISOString().slice(0, 10)}. Open Hadir, Work.` : 'Open Hadir, Work.');
    return { task };
  });
  app.patch('/api/tasks/:id', teacher, (req) => {
    const cur = ownTask(req.user.id, req.params.id);
    const v = taskInput(req.body || {}, cur);
    db.run('UPDATE tasks SET kind = ?, title = ?, details = ?, due_at = ?, max_score = ?, updated_at = ? WHERE id = ?', v.kind, v.title, v.details, v.due_at, v.max_score, Date.now(), cur.id);
    db.audit(req.user.id, 'task.edit', 'task', cur.id, { title: cur.title, due_at: cur.due_at }, { title: v.title, due_at: v.due_at });
    return { task: db.get('SELECT * FROM tasks WHERE id = ?', cur.id) };
  });
  app.del('/api/tasks/:id', teacher, (req) => {
    const cur = ownTask(req.user.id, req.params.id);
    db.run('DELETE FROM tasks WHERE id = ?', cur.id);
    db.audit(req.user.id, 'task.delete', 'task', cur.id, { title: cur.title }, null);
  });
  // Copy a task to another group of yours (for the next group or next semester). Statuses and marks are not copied.
  app.post('/api/tasks/:id/copy', teacher, (req) => {
    const cur = ownTask(req.user.id, req.params.id);
    const g = ownGroup(req.user.id, req.body?.group_id || cur.group_id);
    const id = uid(), now = Date.now();
    db.run('INSERT INTO tasks (id, group_id, kind, title, details, due_at, max_score, marks_visible, created_at, updated_at) VALUES (?,?,?,?,?,?,?,0,?,?)', id, g.id, cur.kind, cur.title, cur.details, req.body?.due_at ? num(req.body.due_at, null) : null, cur.max_score, now, now);
    return { task: db.get('SELECT * FROM tasks WHERE id = ?', id) };
  });
  app.get('/api/tasks/:id', teacher, (req) => {
    const t = ownTask(req.user.id, req.params.id);
    const g = db.get('SELECT id, name, course_name FROM groups WHERE id = ?', t.group_id);
    const st = new Map(db.all('SELECT * FROM task_status WHERE task_id = ?', t.id).map((r) => [r.student_id, r]));
    const students = roster(t.group_id).map((s) => { const r = st.get(s.id); return { ...s, status: r?.status || 'pending', score: r?.score ?? null, feedback: r?.feedback || '' }; });
    return { task: t, group: g, students };
  });
  // items: [{ student_id, status?, score?, feedback? }]  or  { all: 'presented' } to set everyone who is still pending.
  app.put('/api/tasks/:id/students', teacher, (req) => {
    const t = ownTask(req.user.id, req.params.id);
    const members = new Set(roster(t.group_id).map((s) => s.id));
    const now = Date.now();
    let items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (req.body?.all && STATUSES.includes(req.body.all)) {
      const have = new Map(db.all('SELECT student_id, status FROM task_status WHERE task_id = ?', t.id).map((r) => [r.student_id, r.status]));
      items = [...members].filter((id) => (have.get(id) || 'pending') === 'pending').map((id) => ({ student_id: id, status: req.body.all }));
    }
    let changed = 0;
    db.tx(() => {
      for (const it of items) {
        if (!members.has(it.student_id)) continue;
        const cur = db.get('SELECT * FROM task_status WHERE task_id = ? AND student_id = ?', t.id, it.student_id);
        const status = STATUSES.includes(it.status) ? it.status : (cur?.status || 'pending');
        let score = cur?.score ?? null;
        if (it.score !== undefined) score = it.score === null || it.score === '' ? null : clamp(num(it.score, 0), 0, t.max_score ?? 1000);
        const feedback = it.feedback !== undefined ? str(it.feedback, 600) : (cur?.feedback || null);
        db.run(`INSERT INTO task_status (task_id, student_id, status, score, feedback, updated_at) VALUES (?,?,?,?,?,?)
                ON CONFLICT (task_id, student_id) DO UPDATE SET status = excluded.status, score = excluded.score, feedback = excluded.feedback, updated_at = excluded.updated_at`, t.id, it.student_id, status, score, feedback || null, now);
        changed++;
      }
    });
    if (changed) db.audit(req.user.id, 'task.update', 'task', t.id, null, { students: changed });
    return { ok: true, changed };
  });
  // Show or hide the marks. Showing them tells every student with a mark.
  app.post('/api/tasks/:id/publish', teacher, (req) => {
    const t = ownTask(req.user.id, req.params.id);
    const visible = req.body?.visible === false ? 0 : 1;
    db.run('UPDATE tasks SET marks_visible = ?, updated_at = ? WHERE id = ?', visible, Date.now(), t.id);
    if (visible) {
      const g = db.get('SELECT * FROM groups WHERE id = ?', t.group_id);
      const marked = new Set(db.all('SELECT student_id FROM task_status WHERE task_id = ? AND (score IS NOT NULL OR feedback IS NOT NULL)', t.id).map((r) => r.student_id));
      notifyStudents(t, g, 'marks', `Marked: ${t.title}`, 'Your result is ready. Open Hadir, Work.', marked);
    }
    db.audit(req.user.id, visible ? 'task.publish' : 'task.unpublish', 'task', t.id, null, null);
    return { ok: true, marks_visible: !!visible };
  });

  // ---------- student: my work ----------
  app.get('/api/student/work', student, (req) => {
    const st = req.student;
    if (!st) throw notFound('no_student', 'No student record is linked to this account.');
    const now = Date.now();
    const groups = db.all('SELECT g.id, g.name, g.course_name FROM enrollments e JOIN groups g ON g.id = e.group_id WHERE e.student_id = ? AND g.archived = 0 ORDER BY g.name', st.id);
    const out = groups.map((g) => {
      const items = db.all('SELECT * FROM tasks WHERE group_id = ? ORDER BY COALESCE(due_at, created_at) DESC', g.id).map((t) => {
        const r = db.get('SELECT * FROM task_status WHERE task_id = ? AND student_id = ?', t.id, st.id);
        const status = r?.status || 'pending';
        const shown = !!t.marks_visible;
        return { id: t.id, kind: t.kind, title: t.title, details: t.details, due_at: t.due_at, max_score: t.max_score, status, overdue: status === 'pending' && t.due_at != null && t.due_at < now,
          marked: shown && r?.score != null, score: shown ? r?.score ?? null : null, feedback: shown ? r?.feedback || null : null, marks_visible: shown };
      });
      return { group: g, tasks: items };
    });
    const all = out.flatMap((g) => g.tasks);
    return { groups: out, summary: {
      todo: all.filter((t) => t.status === 'pending').length,
      overdue: all.filter((t) => t.overdue).length,
      presented: all.filter((t) => t.status === 'presented' || t.status === 'late').length,
      marked: all.filter((t) => t.marked).length,
    } };
  });

  // ---------- check-in code ----------
  const codeFor = (sessionId, w) => {
    const h = crypto.createHmac('sha256', cfg.secret).update(`checkin|${sessionId}|${w}`).digest();
    return String(h.readUInt32BE(0) % 1000000).padStart(6, '0');
  };
  const ownSession = (userId, id) => db.get('SELECT * FROM sessions WHERE id = ? AND teacher_id = ?', id, userId) || (() => { throw notFound('session_not_found', 'That session is not in your list.'); })();

  app.get('/api/sessions/:id/checkin', teacher, (req) => {
    const s = ownSession(req.user.id, req.params.id);
    const now = Date.now(), w = Math.floor(now / WINDOW);
    return { open: !!s.checkin_open && s.status === 'open', code: s.checkin_open ? codeFor(s.id, w) : null, expires_in: Math.ceil(((w + 1) * WINDOW - now) / 1000) };
  });
  app.post('/api/sessions/:id/checkin', teacher, (req) => {
    const s = ownSession(req.user.id, req.params.id);
    if (s.status !== 'open') throw bad('session_closed', 'This session is already closed.');
    const open = req.body?.open === false ? 0 : 1;
    db.run('UPDATE sessions SET checkin_open = ? WHERE id = ?', open, s.id);
    if (open && !s.checkin_open) {
      const g = db.get('SELECT * FROM groups WHERE id = ?', s.group_id);
      const here = new Set(db.all("SELECT student_id FROM attendance WHERE session_id = ? AND status IN ('present','late')", s.id).map((r) => r.student_id));
      for (const m of roster(g.id)) {
        if (here.has(m.id)) continue;
        try { engine.queue({ ownerId: g.teacher_id, studentId: m.id, kind: 'checkin', title: `Roll call is open: ${g.name}`, body: 'Open Hadir and enter the code shown in class.', channels: ['inapp', 'telegram'], groupId: g.id, dedupe: `checkin:${s.id}:${m.id}` })?.done.catch(() => {}); } catch { /* ignore */ }
      }
    }
    db.audit(req.user.id, open ? 'checkin.open' : 'checkin.close', 'session', s.id, null, null);
    return { open: !!open };
  });
  app.get('/api/student/checkin', student, (req) => {
    const rows = db.all(`SELECT s.id AS session_id, s.starts_at, s.topic, g.name AS group_name,
        (SELECT status FROM attendance a WHERE a.session_id = s.id AND a.student_id = ?1) AS status
      FROM sessions s JOIN groups g ON g.id = s.group_id JOIN enrollments e ON e.group_id = g.id AND e.student_id = ?1
      WHERE s.status = 'open' AND s.checkin_open = 1 ORDER BY s.starts_at DESC`, req.student.id);
    return { sessions: rows };
  });
  app.post('/api/student/checkin', student, (req) => {
    limit(`checkin:${req.user.id}`, 10, 60e3);
    const st = req.student;
    const code = String(req.body?.code ?? '').replace(/\D/g, '');
    const s = db.get(`SELECT s.* FROM sessions s JOIN enrollments e ON e.group_id = s.group_id AND e.student_id = ? WHERE s.id = ? AND s.status = 'open' AND s.checkin_open = 1`, st.id, String(req.body?.session_id || ''));
    if (!s) throw bad('checkin_closed', 'Roll call is not open for this class.');
    if (!db.get("SELECT 1 AS x FROM devices WHERE student_id = ? AND status = 'approved'", st.id)) throw bad('device_not_approved', 'Your educator has not approved this phone yet.');
    const now = Date.now(), w = Math.floor(now / WINDOW);
    const ok = [w - 1, w, w + 1].some((x) => { const a = Buffer.from(codeFor(s.id, x)), b = Buffer.from(code.padStart(6, '0')); return code.length === 6 && crypto.timingSafeEqual(a, b); });
    if (!ok) { limit(`checkin-bad:${req.user.id}`, 8, 10 * 60e3); throw bad('wrong_code', 'That code is not right. Check the screen and try again.'); }
    const status = statusForTime(s, now);
    const ex = db.get('SELECT * FROM attendance WHERE session_id = ? AND student_id = ?', s.id, st.id);
    if (!ex) db.run("INSERT INTO attendance (id, session_id, student_id, status, scanned_at, method, note, updated_at) VALUES (?,?,?,?,?,'system','Check-in code',?)", uid(), s.id, st.id, status, now, now);
    else if (ex.status === 'absent') db.run("UPDATE attendance SET status = ?, scanned_at = ?, method = 'system', note = 'Check-in code', updated_at = ? WHERE id = ?", status, now, now, ex.id);
    else return { result: 'duplicate', status: ex.status };
    return { result: 'accepted', status };
  });
}
