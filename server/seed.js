import crypto from 'node:crypto';
import { uid, shortId, inviteCode, hashPassword } from './util.js';
import { insertRule, defaultRules } from './engine.js';

const G1 = ['Amina Benali', 'Yacine Merabet', 'Ines Khelifi', 'Racim Haddad', 'Lina Boudiaf', 'Sofiane Ziani', 'Nour El Houda Cherif', 'Anis Belkacem',
  'Meriem Touati', 'Walid Saadi', 'Hanane Bouzid', 'Oussama Kaci', 'Sarah Mebarki', 'Ilyes Amrani', 'Khadidja Rahmani', 'Mohamed Amine Lakhdari',
  'Asma Djebbar', 'Zakaria Messaoudi', 'Rania Bensalem', 'Abdelkader Foudil', 'Fatima Zohra Hamidi', 'Takieddine Slimani', 'Chaima Ouali', 'Badreddine Kerroum'];
const G2 = ['Imene Zerrouki', 'Nabil Hamdani', 'Selma Boukhari', 'Rachid Mokrani', 'Dounia Belhadj', 'Amir Tebbal', 'Yasmine Kadri', 'Hocine Bouras',
  'Wissem Gherbi', 'Lamia Salhi', 'Fouad Bendjedid', 'Maissa Cheikh', 'Kamel Ouazani', 'Sabrina Hadjadj', 'Redouane Mansouri', 'Nesrine Allouche', 'Billel Guerfi', 'Houda Meziane'];
const G3 = ['Souad Benyoucef', 'Mehdi Hamouda', 'Kenza Aouadi', 'Larbi Chaoui', 'Rym Belkhir', 'Adel Mansour', 'Siham Taleb', 'Fares Ouldali', 'Ghania Berkane', 'Zine Eddine Haddou', 'Nadia Rezig', 'Samir Boudjemaa', 'Hiba Lounis', 'Younes Daoudi'];
const G4 = ['Chahinez Bouazza', 'Mourad Khelil', 'Asmaa Rahal', 'Taha Benmoussa', 'Ikram Slimani', 'Raouf Ait Ahmed', 'Djamila Hadj Said', 'Anouar Zeghdoud', 'Feriel Mekki', 'Ismail Ferhat'];
const G5 = ['Lydia Hamidouche', 'Sid Ahmed Brahimi', 'Meriem Bouchama', 'Abdelhak Soltani', 'Yousra Dib', 'Haithem Gacem', 'Amira Lahlou', 'Nassim Boukerche', 'Wafa Bellil', 'Okba Medjdoub', 'Soumia Tahar'];
const FEEDBACK = ['Clear structure. Watch article use (a/the).', 'Good range of vocabulary; link your ideas more.', 'Strong argument, a few tense slips.', 'Pronunciation is improving. Slow down in the conclusion.',
  'Well organised. Proofread for spelling.', 'Good effort. Support each point with an example.'];

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const TABLES = ['audit_log', 'notifications', 'rules', 'grades', 'assessments', 'excuses', 'scan_rejects', 'attendance', 'sessions', 'devices', 'enrollments', 'students', 'groups', 'demo_keys', 'users'];

export async function seedDemo(db, engine, { reset = false } = {}) {
  if (reset) {
    db.raw.exec('PRAGMA foreign_keys = OFF');
    for (const t of TABLES) db.raw.exec(`DELETE FROM ${t}`);
    db.raw.exec("DELETE FROM kv WHERE key != 'secret'");
    db.raw.exec('PRAGMA foreign_keys = ON');
  } else if (db.get('SELECT 1 AS x FROM users')) return false;

  const rand = rng(20261020);
  const now = Date.now();
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const teacherId = uid();
  db.run('INSERT INTO users (id, role, login, password_hash, full_name, language, created_at) VALUES (?,?,?,?,?,?,?)', teacherId, 'teacher', 'demo@hadir.app', hashPassword('demo1234'), 'Dr. Samira Haddad', 'en', now);
  for (const r of defaultRules()) insertRule(db, teacherId, r);

  const year = today0.getFullYear();
  const groups = [
    { name: 'Group B2', course: 'Writing Production', code: 'ENG-204', slots: [{ day: 2, start: '08:30', end: '10:00', room: 'B12' }, { day: 4, start: '10:00', end: '11:30', room: 'B12' }], names: G1, prefix: '20243100',
      absences: { 0: 1, 3: 3, 5: 1, 7: 2, 9: 1, 11: 2, 15: 1, 18: 1, 20: 1 }, latest: [3, 11, 15, 18], pending: [3, 18], excusedIdx: [0, 7] },
    { name: 'Group A1', course: 'Phonetics', code: 'ENG-112', slots: [{ day: 0, start: '13:00', end: '14:30', room: 'A04' }, { day: 2, start: '14:00', end: '15:30', room: 'A04' }], names: G2, prefix: '20243200',
      absences: { 2: 3, 4: 1, 9: 2, 12: 1 }, latest: [2, 9, 12], pending: [12], excusedIdx: [] },
    { name: 'Group C3', course: 'Linguistics', code: 'ENG-301', slots: [{ day: 1, start: '08:30', end: '10:00', room: 'C21' }, { day: 3, start: '13:00', end: '14:30', room: 'C21' }], names: G3, prefix: '20243300',
      absences: { 1: 2, 6: 1, 10: 3 }, latest: [1, 10], pending: [], excusedIdx: [] },
    { name: 'Group D1', course: 'British Literature', code: 'ENG-322', slots: [{ day: 0, start: '10:00', end: '11:30', room: 'A12' }, { day: 3, start: '08:30', end: '10:00', room: 'A12' }], names: G4, prefix: '20243400',
      absences: { 2: 1, 5: 2 }, latest: [5], pending: [], excusedIdx: [] },
    { name: 'Group E2', course: 'Grammar', code: 'ENG-105', slots: [{ day: 1, start: '14:00', end: '15:30', room: 'B03' }, { day: 4, start: '08:30', end: '10:00', room: 'B03' }], names: G5, prefix: '20243500',
      absences: { 0: 2, 7: 1 }, latest: [0], pending: [], excusedIdx: [] },
  ];

  const students = []; // { id, univ, name, deviceId, privateJwk }
  const out = [];
  for (const [gi, G] of groups.entries()) {
    const gid = uid();
    db.run(`INSERT INTO groups (id, teacher_id, name, course_name, code, semester, year, schedule, late_after_min, close_after_min, absence_warn, absence_notice, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, gid, teacherId, G.name, G.course, G.code, 1, year, JSON.stringify(G.slots), 15, 45, 2, 3, now - 60 * 86400e3 + gi);
    const roster = [];
    for (const [i, name] of G.names.entries()) {
      const id = uid(); const univ = G.prefix + String(i + 1).padStart(4, '0');
      const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      const pub = await crypto.subtle.exportKey('jwk', kp.publicKey); const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
      const deviceId = shortId(10);
      let userId = null;
      if (gi === 0 && i === 0) {
        userId = uid();
        db.run('INSERT INTO users (id, role, login, password_hash, full_name, language, created_at) VALUES (?,?,?,?,?,?,?)', userId, 'student', univ.toLowerCase(), hashPassword('demo1234'), name, 'en', now);
        db.kvSet('demo_student_login', univ.toLowerCase());
      }
      db.run('INSERT INTO students (id, university_id, full_name, email, user_id, invite_code, created_at) VALUES (?,?,?,?,?,?,?)', id, univ, name,
        `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@univ.example`, userId, userId ? null : inviteCode(), now - 50 * 86400e3);
      db.run("INSERT INTO devices (id, student_id, public_jwk, label, status, created_at) VALUES (?,?,?,?,'approved',?)", deviceId, id, JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }), 'Phone', now - 40 * 86400e3);
      db.run('INSERT INTO demo_keys (student_id, device_id, private_jwk) VALUES (?,?,?)', id, deviceId, JSON.stringify(priv));
      db.run('INSERT INTO enrollments (group_id, student_id, created_at) VALUES (?,?,?)', gid, id, now - 50 * 86400e3);
      roster.push({ id, univ, name, deviceId, index: i });
      students.push({ id, univ });
    }

    // Past sessions: each scheduled slot over the last six weeks, today excluded.
    const sessions = [];
    for (let d = 42; d >= 1; d--) {
      const day = new Date(today0); day.setDate(day.getDate() - d);
      for (const slot of G.slots) {
        if (day.getDay() !== slot.day) continue;
        const [h, m] = slot.start.split(':').map(Number);
        const startsAt = new Date(day); startsAt.setHours(h, m, 0, 0);
        sessions.push({ id: uid(), startsAt: startsAt.getTime() });
      }
    }
    sessions.sort((a, b) => a.startsAt - b.startsAt);
    const topics = ['Paragraph structure', 'Linking words', 'Describing graphs', 'Opinion essays', 'Peer review', 'Summarising', 'Formal emails', 'Reading for gist', 'Presentation skills', 'Vocabulary in context', 'Cause and effect', 'Revision'];
    sessions.forEach((s, si) => db.run("INSERT INTO sessions (id, group_id, teacher_id, starts_at, topic, status, closed_at, late_after_min, close_after_min, created_at) VALUES (?,?,?,?,?,'closed',?,?,?,?)",
      s.id, gid, teacherId, s.startsAt, topics[si % topics.length], s.startsAt + 90 * 60e3, 15, 45, s.startsAt));
    const last = sessions.length - 1;

    // Which sessions each student missed.
    const missed = new Map();
    for (const [idx, n] of Object.entries(G.absences)) {
      const set = new Set();
      if (G.latest.includes(Number(idx))) set.add(last);
      while (set.size < n) set.add(Math.floor(rand() * last));
      missed.set(Number(idx), set);
    }
    const excuseRows = [];
    for (const [si, s] of sessions.entries()) {
      for (const r of roster) {
        const miss = missed.get(r.index)?.has(si);
        let status = 'present', scanned = s.startsAt + Math.floor(rand() * 12 * 60e3), method = 'qr', note = null, device = r.deviceId;
        if (miss) {
          status = 'absent'; scanned = null; method = 'system'; device = null;
          if (G.excusedIdx.includes(r.index) && missed.get(r.index).size && [...missed.get(r.index)][0] === si) { status = 'excused'; method = 'manual'; note = 'Excuse approved'; excuseRows.push({ student: r.id, session: s.id, state: 'approved', at: s.startsAt + 86400e3 }); }
          else if (si === last && G.pending.includes(r.index)) excuseRows.push({ student: r.id, session: s.id, state: 'pending', at: now - 3600e3 * (2 + r.index) });
        } else if (rand() < 0.09) { status = 'late'; scanned = s.startsAt + (16 + Math.floor(rand() * 18)) * 60e3; }
        db.run('INSERT INTO attendance (id, session_id, student_id, status, scanned_at, device_id, method, note, updated_at) VALUES (?,?,?,?,?,?,?,?,?)', uid(), s.id, r.id, status, scanned, device, method, note, scanned ?? s.startsAt + 90 * 60e3);
      }
    }
    const reasons = ['I had a medical appointment and have a certificate.', 'My bus was cancelled because of the strike.', 'Family emergency, I am sorry I could not warn you earlier.'];
    excuseRows.forEach((e, i) => db.run('INSERT INTO excuses (id, student_id, session_id, reason, state, decided_at, decision_note, created_at) VALUES (?,?,?,?,?,?,?,?)',
      uid(), e.student, e.session, reasons[i % reasons.length], e.state, e.state === 'approved' ? e.at + 3600e3 : null, e.state === 'approved' ? 'Certificate received.' : null, e.at));
    for (const e of excuseRows.filter((x) => x.state === 'pending')) {
      const name = roster.find((r) => r.id === e.student).name;
      engine.queue({ ownerId: teacherId, kind: 'excuse', title: 'New excuse to review', body: `${name} sent an excuse for ${G.name}.`, channels: ['inapp'], groupId: gid, dedupe: `seed-excuse:${e.student}:${e.session}` });
    }

    // Assessments and grades.
    const plan = gi === 0
      ? [['Paragraph writing quiz', 'writing', 1, -24, true], ['Reading comprehension test', 'reading', 1, -10, true], ['Oral presentation', 'speaking', 2, 3, false], ['Final exam', 'exam', 3, 52, false]]
      : gi === 1 ? [['Transcription quiz (IPA)', 'speaking', 1, -20, true], ['Minimal pairs test', 'listening', 2, -6, true], ['Final phonetics exam', 'exam', 3, 40, false]]
      : gi === 2 ? [['Morphology quiz', 'grammar', 1, -18, true], ['Syntax assignment', 'writing', 2, -5, true], ['Linguistics midterm', 'exam', 3, 12, false]]
      : gi === 3 ? [['Poetry commentary', 'writing', 2, -15, true], ['Reading journal', 'reading', 1, -4, true], ['Literature exam', 'exam', 3, 30, false]]
      : [['Tenses test', 'grammar', 1, -12, true], ['Sentence structure quiz', 'grammar', 1, -3, true], ['Grammar final', 'exam', 3, 35, false]];
    for (const [title, skill, weight, offset, graded] of plan) {
      const aid = uid();
      const due = new Date(today0); due.setDate(due.getDate() + offset); due.setHours(10, 0, 0, 0);
      db.run('INSERT INTO assessments (id, group_id, title, skill, weight, max_score, due_at, published, created_at) VALUES (?,?,?,?,?,?,?,?,?)', aid, gid, title, skill, weight, 20, due.getTime(), graded ? 1 : 0, now - 30 * 86400e3);
      if (!graded) continue;
      for (const r of roster) {
        const ability = 11.5 + (rand() + rand() + rand() - 1.5) * 5;
        const score = Math.max(4, Math.min(19.5, Math.round((ability + (rand() - 0.5) * 3) * 4) / 4));
        const cefr = score >= 17 ? 'C1' : score >= 15 ? 'B2' : score >= 12 ? 'B1' : score >= 9 ? 'A2' : 'A1';
        db.run('INSERT INTO grades (assessment_id, student_id, score, cefr, feedback, updated_at) VALUES (?,?,?,?,?,?)', aid, r.id, score, ['writing', 'speaking'].includes(skill) ? cefr : null, rand() < 0.3 ? FEEDBACK[Math.floor(rand() * FEEDBACK.length)] : null, now - 5 * 86400e3);
      }
    }
    out.push({ gid, lastSession: sessions[last].id });
  }
  db.kvSet('demo_teacher_login', 'demo@hadir.app');
  const pending = [];
  for (const g of out) for (const q of engine.onSessionClosed(g.lastSession)) pending.push(q.done);
  await Promise.all(pending);
  db.audit(teacherId, 'demo.seed', 'system', null, null, { groups: out.length, students: students.length });
  return true;
}
