// Offline storage (IndexedDB). Holds the teacher's class bundle and unsent sessions, and the student's signing key.
// If IndexedDB is unavailable (some private modes), it falls back to memory for this tab.
const DB = 'hadir', VERSION = 1;
let opening = null, memoryOnly = false;
const mem = { kv: new Map(), sessions: new Map() };

function open() {
  opening ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => { req.result.createObjectStore('kv'); req.result.createObjectStore('sessions', { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}
async function run(storeName, mode, fn, fallback) {
  if (!memoryOnly) {
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const result = fn(tx.objectStore(storeName));
        tx.oncomplete = () => resolve(result.result);
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } catch { memoryOnly = true; }
  }
  return fallback();
}

export const kv = {
  get: (k) => run('kv', 'readonly', (s) => s.get(k), () => mem.kv.get(k)),
  set: (k, v) => run('kv', 'readwrite', (s) => s.put(v, k), () => { mem.kv.set(k, v); }),
  del: (k) => run('kv', 'readwrite', (s) => s.delete(k), () => { mem.kv.delete(k); }),
};
export const sessions = {
  all: () => run('sessions', 'readonly', (s) => s.getAll(), () => [...mem.sessions.values()]),
  get: (id) => run('sessions', 'readonly', (s) => s.get(id), () => mem.sessions.get(id)),
  put: (v) => run('sessions', 'readwrite', (s) => s.put(v), () => { mem.sessions.set(v.id, v); }),
  del: (id) => run('sessions', 'readwrite', (s) => s.delete(id), () => { mem.sessions.delete(id); }),
};
export async function wipeAll() {
  await Promise.all([run('kv', 'readwrite', (s) => s.clear(), () => mem.kv.clear()), run('sessions', 'readwrite', (s) => s.clear(), () => mem.sessions.clear())]);
}
