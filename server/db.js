import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('teacher','student','admin')),
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  telegram_chat_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  university_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  telegram_chat_id TEXT,
  user_id TEXT UNIQUE REFERENCES users(id),
  invite_code TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  course_name TEXT NOT NULL DEFAULT '',
  code TEXT,
  semester INTEGER NOT NULL DEFAULT 1,
  year INTEGER NOT NULL,
  schedule TEXT NOT NULL DEFAULT '[]',
  late_after_min INTEGER NOT NULL DEFAULT 15,
  close_after_min INTEGER NOT NULL DEFAULT 45,
  absence_warn INTEGER NOT NULL DEFAULT 2,
  absence_notice INTEGER NOT NULL DEFAULT 3,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS enrollments (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, student_id)
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  public_jwk TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('approved','pending','revoked')),
  created_at INTEGER NOT NULL,
  last_seen INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES users(id),
  starts_at INTEGER NOT NULL,
  topic TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at INTEGER,
  late_after_min INTEGER NOT NULL DEFAULT 15,
  close_after_min INTEGER NOT NULL DEFAULT 45,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_group ON sessions (group_id, starts_at);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present','late','absent','excused')),
  scanned_at INTEGER,
  device_id TEXT,
  method TEXT NOT NULL DEFAULT 'qr' CHECK (method IN ('qr','manual','system')),
  note TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance (student_id, scanned_at);

CREATE TABLE IF NOT EXISTS scan_rejects (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id TEXT,
  university_id TEXT,
  reason TEXT NOT NULL,
  scanned_at INTEGER,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS excuses (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  file_name TEXT,
  file_path TEXT,
  file_mime TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','rejected')),
  decision_note TEXT,
  decided_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  skill TEXT NOT NULL DEFAULT 'general',
  weight REAL NOT NULL DEFAULT 1,
  max_score REAL NOT NULL DEFAULT 20,
  due_at INTEGER,
  published INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS grades (
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score REAL,
  cefr TEXT,
  feedback TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (assessment_id, student_id)
);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  trigger TEXT NOT NULL,
  conditions TEXT NOT NULL DEFAULT '{}',
  actions TEXT NOT NULL DEFAULT '[]',
  needs_approval INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channels TEXT NOT NULL DEFAULT '["inapp"]',
  deliveries TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('pending_approval','queued','sent','failed','rejected')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER,
  rule_id TEXT,
  group_id TEXT,
  dedupe_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notifications_student ON notifications (student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_owner ON notifications (owner_id, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS demo_keys (student_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, private_jwk TEXT NOT NULL);
`;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  raw.exec(SCHEMA);
  const cache = new Map();
  const st = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = raw.prepare(sql); cache.set(sql, s); }
    return s;
  };
  const clean = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
  let depth = 0;
  const db = {
    raw, file,
    get: (sql, ...p) => st(sql).get(...clean(p)),
    all: (sql, ...p) => st(sql).all(...clean(p)),
    run: (sql, ...p) => st(sql).run(...clean(p)),
    tx(fn) {
      if (depth > 0) return fn();
      raw.exec('BEGIN IMMEDIATE');
      depth++;
      try { const r = fn(); raw.exec('COMMIT'); return r; } catch (e) { raw.exec('ROLLBACK'); throw e; } finally { depth--; }
    },
    kvGet: (key) => st('SELECT value FROM kv WHERE key = ?').get(key)?.value ?? null,
    kvSet: (key, value) => st('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value)),
    audit(actorId, action, entity, entityId, before, after) {
      st('INSERT INTO audit_log (actor_id, action, entity, entity_id, before_json, after_json, at) VALUES (?,?,?,?,?,?,?)')
        .run(actorId ?? null, action, entity ?? null, entityId ?? null, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), Date.now());
    },
    close() { raw.close(); },
  };
  return db;
}
