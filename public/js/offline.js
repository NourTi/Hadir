// Offline glue for the teacher's phone: keeps the class bundle and running sessions in IndexedDB, and uploads them when a connection exists.
import { api } from './api.js';
import { kv, sessions as store } from './store.js';
import { clock } from './clock.js';
import * as roll from './roll.js';

export const net = { online: typeof navigator !== 'undefined' ? navigator.onLine : true, syncing: false, pending: 0, lastSync: null, lastError: null, lastRejects: 0 };
const subs = new Set();
export const onNet = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => subs.forEach((fn) => fn({ ...net }));

const pendingOf = (list) => list.reduce((n, s) => n + s.events.length + (s.status === 'closed' && s.dirty && !s.events.length ? 1 : 0), 0);
async function recount() { net.pending = pendingOf(await store.all()); emit(); }

export const getBundle = () => kv.get('bundle');
export async function loadBundle() {
  const bundle = await api.get('/api/offline-bundle');
  bundle.fetched_at = Date.now();
  await kv.set('bundle', bundle);
  await clock.sync(() => api.get('/api/time'));
  net.online = true; emit();
  return bundle;
}
export async function ensureBundle({ maxAgeMs = 30 * 60e3 } = {}) {
  const have = await getBundle();
  if (have && Date.now() - have.fetched_at < maxAgeMs) return have;
  try { return await loadBundle(); } catch (e) { if (have) return have; throw e; }
}
export const rosterOf = (bundle, groupId) => bundle?.groups?.find((g) => g.id === groupId)?.roster || [];

export const listLocal = () => store.all();
export const getLocal = (id) => store.get(id);
export async function saveLocal(local) { await store.put(local); await recount(); return local; }
export async function dropLocal(id) { await store.del(id); await recount(); }

// Start a roll call, or pick up the one already running for this group. Works with no connection.
export async function startOrResume(groupId, topic = '') {
  const existing = (await store.all()).find((s) => s.group_id === groupId && s.status === 'open');
  if (existing) return existing;
  const bundle = await getBundle();
  const group = bundle?.groups?.find((g) => g.id === groupId);
  if (!group) throw Object.assign(new Error('no bundle'), { code: 'no_bundle' });
  const serverOpen = bundle.open_sessions?.find((o) => o.session.group_id === groupId);
  const local = serverOpen
    ? roll.localFromServer(serverOpen.session, group.name, serverOpen.attendance)
    : roll.newLocalSession({ group, topic, now: clock.now() });
  await saveLocal(local);
  syncSoon();
  return local;
}

// Open any session by id: from this phone if it is here, otherwise from the server.
export async function openSession(id) {
  const local = await store.get(id);
  if (local) return local;
  const data = await api.get(`/api/sessions/${id}`);
  const attendance = data.students.filter((s) => s.attendance).map((s) => ({ student_id: s.id, ...s.attendance }));
  const built = roll.localFromServer(data.session, data.group.name, attendance);
  if (built.status === 'open') await saveLocal(built);
  return built;
}

let running = false, timer = null;
export async function syncAll() {
  if (running) return null;
  running = true; net.syncing = true; emit();
  const summary = { sessions: 0, accepted: 0, rejected: 0, errors: 0, offline: false };
  try {
    const dirty = (await store.all()).filter((s) => s.dirty);
    if (!dirty.length) { net.lastError = null; return summary; }
    const sent = new Map(dirty.map((s) => { const p = roll.syncPayload(s); return [s.id, [...p.scans, ...p.marks].map((x) => x.client_id)]; }));
    const res = await api.post('/api/sync', { sessions: dirty.map(roll.syncPayload) });
    net.online = true;
    for (const r of res.results) {
      if (!r.ok) { summary.errors++; net.lastError = r.message || r.error; continue; }
      const fresh = await store.get(r.id);
      if (!fresh) continue;
      summary.sessions++; summary.accepted += r.accepted; summary.rejected += r.rejected.length;
      const next = roll.applySyncResult(fresh, r, sent.get(r.id) || []);
      if (next.status === 'closed' && !next.dirty) await store.del(r.id); else await store.put(next);
    }
    net.lastSync = Date.now(); net.lastRejects = summary.rejected; if (!summary.errors) net.lastError = null;
    await clock.sync(() => Promise.resolve({ now: res.server_time }));
  } catch (e) {
    if (e.offline) { net.online = false; summary.offline = true; } else { net.lastError = e.message; summary.errors++; }
  } finally {
    running = false; net.syncing = false; await recount();
  }
  return summary;
}
let soon = null;
export function syncSoon(ms = 1500) { clearTimeout(soon); soon = setTimeout(() => { if (navigator.onLine !== false) syncAll(); }, ms); }

export function startAutoSync() {
  if (timer) return;
  addEventListener('online', () => { net.online = true; emit(); syncAll(); });
  addEventListener('offline', () => { net.online = false; emit(); });
  timer = setInterval(() => { if (navigator.onLine !== false && net.pending > 0) syncAll(); }, 30e3);
  recount();
  if (navigator.onLine !== false) syncAll();
}
