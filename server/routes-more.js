import fs from 'node:fs';
import { uid, jparse, clamp, num, str } from './util.js';
import { bad, forbidden, notFound } from './http.js';
import { insertRule } from './engine.js';
import { groupStats, flagFor, finalGrade } from './stats.js';

const SKILLS = ['general', 'writing', 'speaking', 'reading', 'listening', 'grammar', 'vocabulary', 'exam'];
const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const TRIGGERS = ['session_closed', 'absence_count', 'assessment_upcoming', 'weekly_digest'];
const CHANNELS = ['inapp', 'telegram', 'webhook'];

export function registerMore(app, ctx) {
  const { db, engine, cfg } = ctx;
  const { teacher, student } = ctx.auth;
  const { ownedGroup } = ctx.helpers;
  const groupOut = (g) => ({ ...g, schedule: jparse(g.schedule, []), archived: !!g.archived });

  // ---------- gradebook ----------
  function gradebook(g) {
    const assessments = db.all('SELECT * FROM assessments WHERE group_id = ? ORDER BY COALESCE(due_at, created_at), created_at', g.id).map((a) => ({ ...a, published: !!a.published }));
    const students = db.all('SELECT st.* FROM enrollments e JOIN students st ON st.id = e.student_id WHERE e.group_id = ? ORDER BY st.full_name COLLATE NOCASE', g.id);
    const rows = db.all('SELECT * FROM grades WHERE assessment_id IN (SELECT id FROM assessments WHERE group_id = ?)', g.id);
    const byStudent = new Map();
    for (const r of rows) {
      if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, {});
      byStudent.get(r.student_id)[r.assessment_id] = { score: r.score, cefr: r.cefr, feedback: r.feedback };
    }
    return {
      group: groupOut(g), assessments,
      students: students.map((st) => {
        const grades = byStudent.get(st.id) || {};
        return { id: st.id, university_id: st.university_id, full_name: st.full_name, grades, ...finalGrade(assessments, grades) };
      }),
    };
  }
  app.get('/api/groups/:id/gradebook', teacher, (req) => gradebook(ownedGroup(req.user.id, req.params.id)));

  const assessmentFields = (b, base = {}) => {
    const skill = SKILLS.includes(b.skill) ? b.skill : base.skill || 'general';
    const title = str(b.title ?? base.title, 100);
    if (!title) throw bad('title_required', 'Give the assessment a title.');
    const weight = num(b.weight ?? base.weight, 1);
    const max = num(b.max_score ?? base.max_score, 20);
    if (!(weight > 0 && weight <= 100)) throw bad('bad_weight', 'The weight must be between 0 and 100.');
    if (!(max > 0 && max <= 1000)) throw bad('bad_max', 'The maximum score must be greater than 0.');
    const due = b.due_at === undefined ? base.due_at ?? null : b.due_at === null || b.due_at === '' ? null : num(b.due_at, null);
    return { title, skill, weight, max_score: max, due_at: due };
  };
  app.post('/api/groups/:id/assessments', teacher, (req) => {
    const g = ownedGroup(req.user.id, req.params.id);
    const f = assessmentFields(req.body);
    const id = uid();
    db.run('INSERT INTO assessments (id, group_id, title, skill, weight, max_score, due_at, created_at) VALUES (?,?,?,?,?,?,?,?)', id, g.id, f.title, f.skill, f.weight, f.max_score, f.due_at, Date.now());
    db.audit(req.user.id, 'assessment.create', 'assessment', id, null, f);
    return { id };
  });
  const ownedAssessment = (user, id) => {
    const a = db.get('SELECT a.* FROM assessments a JOIN groups g ON g.id = a.group_id WHERE a.id = ? AND g.teacher_id = ?', id, user.id);
    if (!a) throw notFound('assessment_not_found', 'That assessment does not exist.');
    return a;
  };
  app.patch('/api/assessments/:id', teacher, (req) => {
    const a = ownedAssessment(req.user, req.params.id);
    const f = assessmentFields(req.body, a);
    db.run('UPDATE assessments SET title = ?, skill = ?, weight = ?, max_score = ?, due_at = ? WHERE id = ?', f.title, f.skill, f.weight, f.max_score, f.due_at, a.id);
    db.audit(req.user.id, 'assessment.update', 'assessment', a.id, { title: a.title, weight: a.weight, max: a.max_score }, f);
  });
  app.del('/api/assessments/:id', teacher, (req) => {
    const a = ownedAssessment(req.user, req.params.id);
    db.run('DELETE FROM assessments WHERE id = ?', a.id);
    db.audit(req.user.id, 'assessment.delete', 'assessment', a.id, { title: a.title }, null);
  });
  app.put('/api/assessments/:id/grades', teacher, (req) => {
    const a = ownedAssessment(req.user, req.params.id);
    const list = Array.isArray(req.body.grades) ? req.body.grades.slice(0, 500) : [];
    let saved = 0;
    db.tx(() => {
      for (const r of list) {
        if (!db.get('SELECT 1 AS x FROM enrollments WHERE group_id = ? AND student_id = ?', a.group_id, r.student_id)) continue;
        const score = r.score === null || r.score === '' || r.score === undefined ? null : Number(r.score);
        if (score !== null && !(score >= 0 && score <= a.max_score)) throw bad('bad_score', `A score must be between 0 and ${a.max_score}.`);
        const cefr = CEFR.includes(r.cefr) ? r.cefr : null;
        const before = db.get('SELECT score, cefr FROM grades WHERE assessment_id = ? AND student_id = ?', a.id, r.student_id);
        db.run(`INSERT INTO grades (assessment_id, student_id, score, cefr, feedback, updated_at) VALUES (?,?,?,?,?,?)
                ON CONFLICT(assessment_id, student_id) DO UPDATE SET score = excluded.score, cefr = excluded.cefr, feedback = excluded.feedback, updated_at = excluded.updated_at`,
          a.id, r.student_id, score, cefr, str(r.feedback, 600) || null, Date.now());
        if (!before || before.score !== score) db.audit(req.user.id, 'grade.set', 'grade', `${a.id}:${r.student_id}`, before ?? null, { score, cefr });
        saved++;
      }
    });
    return { saved };
  });
  app.post('/api/assessments/:id/publish', teacher, (req) => {
    const a = ownedAssessment(req.user, req.params.id);
    const publish = req.body.published !== false;
    db.run('UPDATE assessments SET published = ? WHERE id = ?', publish ? 1 : 0, a.id);
    db.audit(req.user.id, publish ? 'assessment.publish' : 'assessment.unpublish', 'assessment', a.id);
    if (publish) {
      const g = db.get('SELECT * FROM groups WHERE id = ?', a.group_id);
      for (const r of db.all('SELECT st.* FROM grades gr JOIN students st ON st.id = gr.student_id WHERE gr.assessment_id = ? AND gr.score IS NOT NULL', a.id)) {
        const lang = (r.user_id && db.get('SELECT language FROM users WHERE id = ?', r.user_id)?.language) || 'en';
        engine.queue({
          ownerId: req.user.id, studentId: r.id, kind: 'grade', groupId: g.id, channels: ['inapp', 'telegram'], dedupe: `grade:${a.id}:${r.id}`,
          title: lang === 'ar' ? 'نتيجة جديدة' : 'New grade available',
          body: lang === 'ar' ? `نتيجة «${a.title}» في ${g.name} متاحة الآن.` : `Your grade for "${a.title}" in ${g.name} is now available.`,
        });
      }
    }
  });

  // ---------- rules ----------
  const ruleOut = (r) => ({ ...r, conditions: jparse(r.conditions, {}), actions: jparse(r.actions, []), needs_approval: !!r.needs_approval, enabled: !!r.enabled });
  function cleanRule(b, base = null) {
    const trigger = b.trigger ?? base?.trigger;
    if (!TRIGGERS.includes(trigger)) throw bad('bad_trigger', 'Choose when this rule should run.');
    const name = str(b.name ?? base?.name, 80);
    if (!name) throw bad('name_required', 'Give the rule a name.');
    const cond = b.conditions ?? jparse(base?.conditions, {});
    const conditions = {};
    if (trigger === 'absence_count') conditions.count = clamp(num(cond.count, 3), 1, 30);
    if (trigger === 'assessment_upcoming') conditions.hours = (Array.isArray(cond.hours) ? cond.hours : [72, 24, 2]).map((h) => clamp(num(h, 24), 1, 720)).slice(0, 5);
    const rawActions = b.actions ?? jparse(base?.actions, []);
    if (!Array.isArray(rawActions) || !rawActions.length) throw bad('action_required', 'Add at least one action.');
    const actions = rawActions.slice(0, 4).map((a) => {
      const type = ['notify_student', 'notify_teacher', 'webhook'].includes(a.type) ? a.type : null;
      if (!type) throw bad('bad_action', 'Unknown action.');
      if (type === 'notify_student' && trigger === 'weekly_digest') throw bad('bad_action', 'A weekly digest can only message you.');
      const channels = (Array.isArray(a.channels) ? a.channels : ['inapp']).filter((c) => CHANNELS.includes(c));
      const t = (v) => { const en = str(v?.en ?? (typeof v === 'string' ? v : ''), 600), ar = str(v?.ar ?? (typeof v === 'string' ? v : ''), 600); return { en: en || ar, ar: ar || en }; };
      return { type, channels: channels.length ? channels : ['inapp'], title: t(a.title), template: t(a.template) };
    });
    return { name, trigger, conditions, actions, needs_approval: b.needs_approval ?? base?.needs_approval ? 1 : 0, enabled: b.enabled === undefined ? (base ? base.enabled : 1) : b.enabled ? 1 : 0 };
  }
  const ownedRule = (user, id) => {
    const r = db.get('SELECT * FROM rules WHERE id = ? AND owner_id = ?', id, user.id);
    if (!r) throw notFound('rule_not_found', 'That rule does not exist.');
    return r;
  };
  app.get('/api/rules', teacher, (req) => ({ rules: db.all('SELECT * FROM rules WHERE owner_id = ? ORDER BY created_at, name', req.user.id).map(ruleOut) }));
  app.post('/api/rules', teacher, (req) => {
    const r = cleanRule(req.body);
    const id = insertRule(db, req.user.id, r);
    db.audit(req.user.id, 'rule.create', 'rule', id, null, { name: r.name });
    return { id };
  });
  app.patch('/api/rules/:id', teacher, (req) => {
    const base = ownedRule(req.user, req.params.id);
    const r = cleanRule(req.body, base);
    db.run('UPDATE rules SET name = ?, trigger = ?, conditions = ?, actions = ?, needs_approval = ?, enabled = ? WHERE id = ?', r.name, r.trigger, JSON.stringify(r.conditions), JSON.stringify(r.actions), r.needs_approval, r.enabled, base.id);
    db.audit(req.user.id, 'rule.update', 'rule', base.id, { enabled: base.enabled }, { enabled: r.enabled, name: r.name });
  });
  app.del('/api/rules/:id', teacher, (req) => {
    const r = ownedRule(req.user, req.params.id);
    db.run('DELETE FROM rules WHERE id = ?', r.id);
    db.audit(req.user.id, 'rule.delete', 'rule', r.id, { name: r.name }, null);
  });
  app.post('/api/rules/:id/dry-run', teacher, (req) => {
    const r = ownedRule(req.user, req.params.id);
    const plans = engine.planForRule(r);
    return { count: plans.length, plans: plans.slice(0, 60).map((p) => ({ name: p.preview.name, reason: p.preview.reason, title: p.title, body: p.body, channels: p.channels, needs_approval: p.needsApproval, to_teacher: !p.studentId })) };
  });
  app.post('/api/system/tick', teacher, async () => engine.tick(new Date()));

  // ---------- reports ----------
  app.get('/api/reports/group/:id', teacher, (req) => {
    const g = ownedGroup(req.user.id, req.params.id);
    const sessions = db.all('SELECT id, starts_at, topic, status FROM sessions WHERE group_id = ? ORDER BY starts_at', g.id);
    const stats = groupStats(db, g.id);
    const marks = new Map();
    for (const a of db.all('SELECT a.session_id, a.student_id, a.status FROM attendance a JOIN sessions s ON s.id = a.session_id WHERE s.group_id = ?', g.id)) {
      if (!marks.has(a.student_id)) marks.set(a.student_id, {});
      marks.get(a.student_id)[a.session_id] = a.status;
    }
    const students = db.all('SELECT st.* FROM enrollments e JOIN students st ON st.id = e.student_id WHERE e.group_id = ? ORDER BY st.full_name COLLATE NOCASE', g.id)
      .map((s) => ({ id: s.id, university_id: s.university_id, full_name: s.full_name, marks: marks.get(s.id) || {}, stats: stats.get(s.id), flag: flagFor(stats.get(s.id), g) }));
    const teacherRow = db.get('SELECT full_name FROM users WHERE id = ?', g.teacher_id);
    return { group: groupOut(g), teacher: teacherRow.full_name, sessions, students, generated_at: Date.now() };
  });
  app.get('/api/reports/student/:id', teacher, (req) => {
    if (!ctx.helpers.ownsStudent(req.user.id, req.params.id)) throw notFound('student_not_found', 'That student is not in your groups.');
    const st = db.get('SELECT id, university_id, full_name, email, phone FROM students WHERE id = ?', req.params.id);
    const groups = db.all('SELECT g.* FROM enrollments e JOIN groups g ON g.id = e.group_id WHERE e.student_id = ? AND g.teacher_id = ? AND g.archived = 0', st.id, req.user.id);
    return {
      student: st, generated_at: Date.now(), teacher: req.user.full_name,
      groups: groups.map((g) => ({
        group: groupOut(g), stats: groupStats(db, g.id).get(st.id), flag: flagFor(groupStats(db, g.id).get(st.id), g),
        history: db.all(`SELECT s.id AS session_id, s.starts_at, s.topic, a.status, a.note, a.scanned_at, a.method FROM sessions s LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = ?
                         WHERE s.group_id = ? AND s.status = 'closed' ORDER BY s.starts_at DESC`, st.id, g.id),
        grades: (() => { const gb = gradebook(g); const me = gb.students.find((x) => x.id === st.id); return { assessments: gb.assessments, grades: me.grades, final: me.final }; })(),
      })),
    };
  });
  app.get('/api/reports/at-risk', teacher, (req) => {
    const rows = [];
    for (const g of db.all('SELECT * FROM groups WHERE teacher_id = ? AND archived = 0', req.user.id)) {
      const stats = groupStats(db, g.id);
      const gb = gradebook(g);
      for (const s of gb.students) {
        const st = stats.get(s.id);
        const flag = flagFor(st, g);
        const lowGrade = s.final !== null && s.final < 10;
        if (flag !== 'ok' || lowGrade) rows.push({ group_id: g.id, group_name: g.name, student_id: s.id, university_id: s.university_id, full_name: s.full_name, absences: st.absences, rate: st.rate, flag, final: s.final, low_grade: lowGrade });
      }
    }
    rows.sort((a, b) => b.absences - a.absences || (a.final ?? 99) - (b.final ?? 99));
    return { rows, generated_at: Date.now(), teacher: req.user.full_name };
  });

  // ---------- student view ----------
  app.get('/api/student/summary', student, (req) => {
    const st = req.student;
    if (!st) throw notFound('no_student', 'No student record is linked to this account.');
    const groups = db.all('SELECT g.*, u.full_name AS teacher_name FROM enrollments e JOIN groups g ON g.id = e.group_id JOIN users u ON u.id = g.teacher_id WHERE e.student_id = ? AND g.archived = 0 ORDER BY g.created_at', st.id);
    return {
      student: { id: st.id, full_name: st.full_name, university_id: st.university_id },
      groups: groups.map((g) => {
        const stat = groupStats(db, g.id).get(st.id);
        const history = db.all(`SELECT s.id AS session_id, s.starts_at, s.topic, a.status, a.note, a.scanned_at,
            (SELECT state FROM excuses e WHERE e.student_id = ? AND e.session_id = s.id ORDER BY e.created_at DESC LIMIT 1) AS excuse_state
            FROM sessions s LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = ? WHERE s.group_id = ? AND s.status = 'closed' ORDER BY s.starts_at DESC LIMIT 60`, st.id, st.id, g.id);
        const assessments = db.all('SELECT * FROM assessments WHERE group_id = ? ORDER BY COALESCE(due_at, created_at)', g.id).map((a) => {
          const gr = a.published ? db.get('SELECT score, cefr, feedback FROM grades WHERE assessment_id = ? AND student_id = ?', a.id, st.id) : null;
          return { id: a.id, title: a.title, skill: a.skill, weight: a.weight, max_score: a.max_score, due_at: a.due_at, published: !!a.published, score: gr?.score ?? null, cefr: gr?.cefr ?? null, feedback: gr?.feedback ?? null };
        });
        const published = assessments.filter((a) => a.published);
        const final = finalGrade(published, Object.fromEntries(published.map((a) => [a.id, { score: a.score }]))).final;
        return {
          group: { id: g.id, name: g.name, course_name: g.course_name, teacher_name: g.teacher_name, semester: g.semester, year: g.year, absence_warn: g.absence_warn, absence_notice: g.absence_notice },
          stats: stat, flag: flagFor(stat, g), history, assessments, final,
        };
      }),
    };
  });

  // ---------- audit + backup ----------
  app.get('/api/audit', teacher, (req) => ({
    entries: db.all('SELECT l.*, l.at AS created_at, u.full_name AS actor FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id WHERE l.actor_id = ? ORDER BY l.id DESC LIMIT ?', req.user.id, clamp(num(req.query.limit, 80), 1, 300))
      .map((e) => ({ ...e, before: jparse(e.before_json, null), after: jparse(e.after_json, null), before_json: undefined, after_json: undefined })),
  }));
  app.get('/api/export/backup', ctx.auth.owner, (req, res) => {
    const file = engine.backup('download');
    const buf = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': buf.length, 'Content-Disposition': `attachment; filename="hadir-backup-${new Date().toISOString().slice(0, 10)}.db"`, 'Cache-Control': 'no-store' });
    res.end(buf);
    db.audit(req.user.id, 'export.backup', 'system', null);
  });

  // ---------- demo (only when DEMO_MODE=1) ----------
  if (cfg.demo) {
    app.post('/api/auth/demo', (req) => {
      const role = req.body.role === 'student' ? 'student' : 'teacher';
      const login = db.kvGet(role === 'student' ? 'demo_student_login' : 'demo_teacher_login');
      const u = login && db.get('SELECT * FROM users WHERE login = ?', login);
      if (!u) throw notFound('no_demo', 'Demo data is not loaded. Restart the server with DEMO_MODE=1.');
      return ctx.helpers.session(u);
    });
    app.get('/api/demo/keys', teacher, (req) => {
      const rows = db.all(
        `SELECT DISTINCT k.student_id, k.device_id, k.private_jwk, s.university_id FROM demo_keys k JOIN students s ON s.id = k.student_id
         JOIN enrollments e ON e.student_id = s.id JOIN groups g ON g.id = e.group_id WHERE g.teacher_id = ?`, req.user.id);
      return { keys: rows.map((r) => ({ student_id: r.student_id, university_id: r.university_id, device_id: r.device_id, private_jwk: jparse(r.private_jwk, null) })) };
    });
    app.post('/api/demo/reset', teacher, async (req) => {
      const { seedDemo } = await import('./seed.js');
      await seedDemo(db, engine, { reset: true });
      return { ok: true };
    });
  }
}
