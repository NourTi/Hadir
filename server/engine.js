import fs from 'node:fs';
import path from 'node:path';
import { uid, jparse } from './util.js';
import { groupStats, flagFor } from './stats.js';

const BACKOFF = [60e3, 5 * 60e3, 30 * 60e3];
const pickLang = (obj, lang) => (typeof obj === 'string' ? obj : obj?.[lang] ?? obj?.en ?? '');
const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
const fmtDate = (ms, lang) => new Date(ms).toLocaleDateString(lang === 'ar' ? 'ar-DZ-u-nu-latn' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export function defaultRules() {
  const student = (channels, title, en, ar) => ({ type: 'notify_student', channels, title, template: { en, ar } });
  return [
    {
      name: 'Absence alert', trigger: 'session_closed', conditions: {}, needs_approval: 0,
      actions: [student(['inapp', 'telegram'], { en: 'You were marked absent', ar: 'تم تسجيل غيابك' },
        'Hello {name}, you were marked absent from {group} on {date}. If you have a valid reason, send an excuse from the app within a week.',
        'مرحبًا {name}، تم تسجيل غيابك عن حصة {group} بتاريخ {date}. إذا كان لديك عذر مقبول، أرسله من التطبيق خلال أسبوع.')],
    },
    {
      name: 'Warning at 2 absences', trigger: 'absence_count', conditions: { count: 2 }, needs_approval: 0,
      actions: [
        student(['inapp', 'telegram'], { en: 'Attendance warning', ar: 'تنبيه حضور' },
          'Hello {name}, you now have {count} absences in {group}. A third absence leads to a formal notice.',
          'مرحبًا {name}، لديك الآن {count} غيابات في {group}. الغياب الثالث يؤدي إلى إنذار رسمي.'),
        { type: 'notify_teacher', channels: ['inapp'], title: { en: 'A student reached 2 absences', ar: 'طالب بلغ غيابين' },
          template: { en: '{name} has {count} absences in {group}.', ar: '{name} لديه {count} غيابات في {group}.' } },
      ],
    },
    {
      name: 'Formal notice at 3 absences', trigger: 'absence_count', conditions: { count: 3 }, needs_approval: 1,
      actions: [
        student(['inapp', 'telegram'], { en: 'Formal attendance notice', ar: 'إنذار رسمي بالغياب' },
          'Dear {name}, you have reached {count} absences in {group}. Please meet your teacher before the next class.',
          'عزيزي {name}، بلغ عدد غياباتك {count} في {group}. يرجى مقابلة الأستاذ قبل الحصة القادمة.'),
        { type: 'notify_teacher', channels: ['inapp'], title: { en: 'A student reached 3 absences', ar: 'طالب بلغ ثلاثة غيابات' },
          template: { en: '{name} has {count} absences in {group}. A notice is waiting for your approval.', ar: '{name} لديه {count} غيابات في {group}. الإنذار بانتظار موافقتك.' } },
      ],
    },
    {
      name: 'Assessment reminders', trigger: 'assessment_upcoming', conditions: { hours: [72, 24, 2] }, needs_approval: 0,
      actions: [student(['inapp', 'telegram'], { en: 'Upcoming assessment', ar: 'تقييم قريب' },
        '{assessment} for {group} is in about {hours} hours.', 'تقييم «{assessment}» في {group} بعد حوالي {hours} ساعة.')],
    },
    {
      name: 'Weekly digest', trigger: 'weekly_digest', conditions: {}, needs_approval: 0,
      actions: [{ type: 'notify_teacher', channels: ['inapp', 'telegram'], title: { en: 'Your week in attendance', ar: 'ملخص الحضور الأسبوعي' }, template: { en: '{digest}', ar: '{digest}' } }],
    },
  ];
}

export function insertRule(db, ownerId, r) {
  const id = uid();
  db.run('INSERT INTO rules (id, owner_id, name, trigger, conditions, actions, needs_approval, enabled, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    id, ownerId, r.name, r.trigger, JSON.stringify(r.conditions || {}), JSON.stringify(r.actions || []), r.needs_approval ? 1 : 0, r.enabled === 0 ? 0 : 1, Date.now());
  return id;
}

export function createEngine(db, cfg = {}) {
  const fetchFn = cfg.fetch || globalThis.fetch;
  const log = cfg.log || (() => {});

  // ---------- notifications ----------
  function queue(o) {
    const id = uid();
    const channels = JSON.stringify(o.channels?.length ? o.channels : ['inapp']);
    const status = o.needsApproval ? 'pending_approval' : 'queued';
    const res = db.run(
      `INSERT OR IGNORE INTO notifications (id, owner_id, student_id, kind, title, body, channels, status, rule_id, group_id, dedupe_key, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, o.ownerId, o.studentId ?? null, o.kind || 'info', o.title, o.body, channels, status, o.ruleId ?? null, o.groupId ?? null, o.dedupe ?? null, Date.now());
    if (!res.changes) return null;
    return { id, done: o.needsApproval ? Promise.resolve() : deliver(id) };
  }

  async function post(url, payload) {
    const r = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  }

  async function deliver(id) {
    const n = db.get('SELECT * FROM notifications WHERE id = ?', id);
    if (!n || n.status === 'sent' || n.status === 'rejected' || n.status === 'pending_approval' || n.status === 'failed') return;
    const channels = jparse(n.channels, ['inapp']);
    const deliveries = jparse(n.deliveries, {});
    const student = n.student_id ? db.get('SELECT * FROM students WHERE id = ?', n.student_id) : null;
    const owner = db.get('SELECT * FROM users WHERE id = ?', n.owner_id);
    let failed = false;
    for (const ch of channels) {
      if (deliveries[ch] === 'sent' || String(deliveries[ch] || '').startsWith('skipped')) continue;
      try {
        if (ch === 'inapp') deliveries.inapp = 'sent';
        else if (ch === 'telegram') {
          const chat = student ? student.telegram_chat_id : owner?.telegram_chat_id;
          if (!cfg.telegramToken) deliveries.telegram = 'skipped: Telegram is not set up on this server';
          else if (!chat) deliveries.telegram = 'skipped: no Telegram chat ID';
          else {
            await post(`https://api.telegram.org/bot${cfg.telegramToken}/sendMessage`, { chat_id: chat, text: `${n.title}\n${n.body}` });
            deliveries.telegram = 'sent';
          }
        } else if (ch === 'webhook') {
          if (!cfg.webhookUrl) deliveries.webhook = 'skipped: no webhook URL';
          else {
            await post(cfg.webhookUrl, { event: 'notification', id: n.id, kind: n.kind, title: n.title, body: n.body, student: student ? { id: student.id, university_id: student.university_id, name: student.full_name, phone: student.phone, email: student.email } : null, group_id: n.group_id });
            deliveries.webhook = 'sent';
          }
        } else deliveries[ch] = 'skipped: unknown channel';
      } catch (e) {
        failed = true;
        deliveries[ch] = `failed: ${String(e.message).slice(0, 120)}`;
      }
    }
    const attempts = n.attempts + (failed ? 1 : 0);
    if (!failed) db.run("UPDATE notifications SET status = 'sent', deliveries = ?, sent_at = ?, next_attempt_at = NULL WHERE id = ?", JSON.stringify(deliveries), Date.now(), id);
    else if (attempts >= 3) db.run("UPDATE notifications SET status = 'failed', deliveries = ?, attempts = ? WHERE id = ?", JSON.stringify(deliveries), attempts, id);
    else db.run("UPDATE notifications SET status = 'queued', deliveries = ?, attempts = ?, next_attempt_at = ? WHERE id = ?", JSON.stringify(deliveries), attempts, Date.now() + BACKOFF[attempts - 1], id);
  }

  function approve(id, actorId) {
    const n = db.get("SELECT * FROM notifications WHERE id = ? AND status = 'pending_approval'", id);
    if (!n) return null;
    db.run("UPDATE notifications SET status = 'queued' WHERE id = ?", id);
    db.audit(actorId, 'notification.approve', 'notification', id, { status: n.status }, { status: 'queued' });
    return deliver(id);
  }
  function reject(id, actorId) {
    const n = db.get("SELECT * FROM notifications WHERE id = ? AND status = 'pending_approval'", id);
    if (!n) return false;
    db.run("UPDATE notifications SET status = 'rejected' WHERE id = ?", id);
    db.audit(actorId, 'notification.reject', 'notification', id, { status: n.status }, { status: 'rejected' });
    return true;
  }
  async function retryDue() {
    const due = db.all("SELECT id FROM notifications WHERE status = 'queued' AND next_attempt_at IS NOT NULL AND next_attempt_at <= ?", Date.now());
    for (const d of due) await deliver(d.id);
    return due.length;
  }

  // ---------- rule planning ----------
  const studentLang = (s) => (s.user_id ? db.get('SELECT language FROM users WHERE id = ?', s.user_id)?.language : null) || 'en';
  const teacherLang = (id) => db.get('SELECT language FROM users WHERE id = ?', id)?.language || 'en';

  function plansFor(rule, subject, vars) {
    // subject: { student?, group, lang(for teacher actions), dedupeBase }
    const out = [];
    const actions = jparse(rule.actions, []);
    actions.forEach((a, i) => {
      if (a.type === 'notify_student' && subject.student) {
        const lang = studentLang(subject.student);
        const v = { ...vars, name: subject.student.full_name };
        out.push({
          studentId: subject.student.id, ownerId: rule.owner_id, kind: 'rule', ruleId: rule.id, groupId: subject.group?.id ?? null,
          title: pickLang(a.title, lang), body: fill(pickLang(a.template, lang), v), channels: a.channels || ['inapp'], needsApproval: !!rule.needs_approval,
          dedupe: `${subject.dedupe}:${i}`, preview: { name: subject.student.full_name, reason: subject.reason },
        });
      } else if (a.type === 'notify_teacher') {
        const lang = teacherLang(rule.owner_id);
        const v = { ...vars, name: subject.student?.full_name || '' };
        out.push({
          studentId: null, ownerId: rule.owner_id, kind: 'rule', ruleId: rule.id, groupId: subject.group?.id ?? null,
          title: pickLang(a.title, lang), body: fill(pickLang(a.template, lang), v), channels: a.channels || ['inapp'], needsApproval: false,
          dedupe: `${subject.dedupe}:t${i}`, preview: { name: subject.student?.full_name || 'You', reason: subject.reason },
        });
      } else if (a.type === 'webhook') {
        out.push({
          studentId: subject.student?.id ?? null, ownerId: rule.owner_id, kind: 'rule', ruleId: rule.id, groupId: subject.group?.id ?? null,
          title: rule.name, body: fill(pickLang(a.template || '', 'en'), { ...vars, name: subject.student?.full_name || '' }) || rule.name,
          channels: ['webhook'], needsApproval: false, dedupe: `${subject.dedupe}:w${i}`, preview: { name: subject.student?.full_name || 'Webhook', reason: subject.reason },
        });
      }
    });
    return out;
  }

  function absencesIn(groupId, studentId) {
    return db.get("SELECT COUNT(*) AS n FROM attendance a JOIN sessions s ON s.id = a.session_id WHERE s.group_id = ? AND s.status = 'closed' AND a.student_id = ? AND a.status = 'absent'", groupId, studentId).n;
  }

  function planSessionClosed(rule, sessionId) {
    const sess = db.get('SELECT s.*, g.name AS group_name FROM sessions s JOIN groups g ON g.id = s.group_id WHERE s.id = ?', sessionId);
    if (!sess) return [];
    const group = db.get('SELECT * FROM groups WHERE id = ?', sess.group_id);
    const absent = db.all("SELECT st.* FROM attendance a JOIN students st ON st.id = a.student_id WHERE a.session_id = ? AND a.status = 'absent'", sessionId);
    const plans = [];
    for (const student of absent) {
      const count = absencesIn(group.id, student.id);
      if (rule.trigger === 'absence_count') {
        const target = jparse(rule.conditions, {}).count ?? group.absence_notice;
        if (count !== target) continue;
      }
      const lang = studentLang(student);
      const vars = { group: group.name, count, date: fmtDate(sess.starts_at, lang), session: sess.topic || '' };
      const base = rule.trigger === 'absence_count' ? `r:${rule.id}:g:${group.id}:${student.id}:${count}` : `r:${rule.id}:s:${sessionId}:${student.id}`;
      plans.push(...plansFor(rule, { student, group, dedupe: base, reason: rule.trigger === 'absence_count' ? `${count} absences` : 'absent' }, vars));
    }
    return plans;
  }

  function planUpcoming(rule, now = Date.now()) {
    const hours = [...(jparse(rule.conditions, {}).hours || [72, 24, 2])].sort((a, b) => b - a);
    const plans = [];
    const rows = db.all(
      `SELECT a.*, g.name AS group_name FROM assessments a JOIN groups g ON g.id = a.group_id
       WHERE g.teacher_id = ? AND a.due_at > ? AND a.due_at <= ?`, rule.owner_id, now, now + hours[0] * 3600e3);
    for (const a of rows) {
      const left = (a.due_at - now) / 3600e3;
      let band = null;
      hours.forEach((h, i) => { const lower = hours[i + 1] ?? 0; if (left <= h && left > lower) band = h; });
      if (band == null) continue;
      const group = db.get('SELECT * FROM groups WHERE id = ?', a.group_id);
      const students = db.all('SELECT s.* FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.group_id = ?', a.group_id);
      for (const student of students) {
        plans.push(...plansFor(rule, { student, group, dedupe: `r:${rule.id}:a:${a.id}:${band}:${student.id}`, reason: `${a.title} in ~${band}h` }, { group: group.name, assessment: a.title, hours: band }));
      }
    }
    return plans;
  }

  function digestText(ownerId, lang, now = Date.now()) {
    const groups = db.all('SELECT * FROM groups WHERE teacher_id = ? AND archived = 0', ownerId);
    const since = now - 7 * 86400e3;
    const lines = [];
    for (const g of groups) {
      const sess = db.all("SELECT id FROM sessions WHERE group_id = ? AND status = 'closed' AND starts_at >= ?", g.id, since);
      let att = 0, denom = 0;
      for (const s of sess) {
        const c = db.all('SELECT status, COUNT(*) AS n FROM attendance WHERE session_id = ? GROUP BY status', s.id);
        const get = (k) => c.find((x) => x.status === k)?.n || 0;
        att += get('present') + get('late');
        denom += get('present') + get('late') + get('absent');
      }
      const stats = groupStats(db, g.id);
      const students = db.all('SELECT s.* FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.group_id = ?', g.id);
      const risk = students.filter((s) => flagFor(stats.get(s.id), g) !== 'ok').map((s) => `${s.full_name} (${stats.get(s.id).absences})`);
      const rate = denom ? Math.round((att / denom) * 100) + '%' : '-';
      lines.push(lang === 'ar'
        ? `${g.name}: ${sess.length} حصص، نسبة الحضور ${rate}.${risk.length ? ' بحاجة لمتابعة: ' + risk.join('، ') : ''}`
        : `${g.name}: ${sess.length} sessions, ${rate} attendance.${risk.length ? ' Needs attention: ' + risk.join(', ') : ''}`);
    }
    const pending = db.get("SELECT COUNT(*) AS n FROM excuses e JOIN sessions s ON s.id = e.session_id JOIN groups g ON g.id = s.group_id WHERE g.teacher_id = ? AND e.state = 'pending'", ownerId).n;
    lines.push(lang === 'ar' ? `أعذار بانتظار قرارك: ${pending}` : `Excuses waiting for your decision: ${pending}`);
    return lines.join('\n');
  }

  function planDigest(rule, day) {
    const lang = teacherLang(rule.owner_id);
    return plansFor(rule, { dedupe: `r:${rule.id}:digest:${day}`, reason: 'weekly digest' }, { digest: digestText(rule.owner_id, lang) });
  }

  const activeRules = (ownerId, triggers) =>
    db.all(`SELECT * FROM rules WHERE enabled = 1 ${ownerId ? 'AND owner_id = ?' : ''} AND trigger IN (${triggers.map(() => '?').join(',')})`, ...(ownerId ? [ownerId] : []), ...triggers);

  function planForRule(rule, now = Date.now()) {
    if (rule.trigger === 'session_closed' || rule.trigger === 'absence_count') {
      const s = db.get("SELECT s.id FROM sessions s WHERE s.teacher_id = ? AND s.status = 'closed' ORDER BY s.starts_at DESC LIMIT 1", rule.owner_id);
      return s ? planSessionClosed(rule, s.id) : [];
    }
    if (rule.trigger === 'assessment_upcoming') return planUpcoming(rule, now);
    if (rule.trigger === 'weekly_digest') return planDigest(rule, new Date(now).toISOString().slice(0, 10));
    return [];
  }

  // Called when a session is finalized.
  function onSessionClosed(sessionId) {
    const sess = db.get('SELECT teacher_id FROM sessions WHERE id = ?', sessionId);
    if (!sess) return [];
    const queued = [];
    for (const rule of activeRules(sess.teacher_id, ['session_closed', 'absence_count'])) {
      for (const p of planSessionClosed(rule, sessionId)) { const q = queue(p); if (q) queued.push(q); }
    }
    return queued;
  }

  // Periodic work: reminders, weekly digest, retries, daily backup.
  async function tick(now = new Date()) {
    const out = { reminders: 0, digests: 0, retried: 0, backup: null };
    const t = now.getTime();
    for (const rule of activeRules(null, ['assessment_upcoming'])) for (const p of planUpcoming(rule, t)) if (queue(p)) out.reminders++;
    const day = now.toISOString().slice(0, 10);
    if (now.getDay() === 0 && now.getHours() >= 8 && db.kvGet('digest:' + day) == null) {
      db.kvSet('digest:' + day, '1');
      for (const rule of activeRules(null, ['weekly_digest'])) for (const p of planDigest(rule, day)) if (queue(p)) out.digests++;
    }
    out.retried = await retryDue();
    if (cfg.backupDir && now.getHours() >= 2 && db.kvGet('backup:' + day) == null) {
      db.kvSet('backup:' + day, '1');
      out.backup = backup(day);
    }
    return out;
  }

  function backup(label = new Date().toISOString().slice(0, 10)) {
    fs.mkdirSync(cfg.backupDir, { recursive: true });
    const file = path.join(cfg.backupDir, `hadir-${label}.db`);
    if (fs.existsSync(file)) fs.rmSync(file);
    db.raw.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const files = fs.readdirSync(cfg.backupDir).filter((f) => /^hadir-.*\.db$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 14))) fs.rmSync(path.join(cfg.backupDir, f));
    return file;
  }

  let timer = null;
  function start() {
    timer = setInterval(() => tick().catch((e) => log('tick failed', e)), 60e3);
    timer.unref?.();
  }
  function stop() { if (timer) clearInterval(timer); }

  return { queue, deliver, approve, reject, retryDue, planForRule, onSessionClosed, tick, backup, start, stop, digestText };
}
