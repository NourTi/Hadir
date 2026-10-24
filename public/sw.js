// Hadir service worker: the app shell is cached so the app opens, and roll call keeps working, with no connection.
const VERSION = 'hadir-v1';
const SHELL = ['/app/', '/manifest.webmanifest', '/css/base.css', '/css/app.css', '/css/theme.css', '/icons/icon.svg', '/icons/icon-180.png', '/icons/icon-192.png', '/icons/icon-512.png',
  ...['app', 'api', 'clock', 'crypto', 'device', 'i18n', 'kit', 'offline', 'qr', 'qrdecode', 'roll', 'scanner', 'store', 'strings-app', 'ui'].map((n) => `/js/${n}.js`),
  ...['auth', 'today', 'scan', 'classes', 'session', 'studentcard', 'grades', 'excuses', 'automation', 'reports', 'settings', 'access', 'me', 'me-attendance', 'me-grades', 'me-excuses'].map((n) => `/js/views/${n}.js`)];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return; // data always goes to the network
  if (req.mode === 'navigate') { e.respondWith(fetch(req).catch(() => caches.match('/app/'))); return; }
  // Stale-while-revalidate: instant from cache, refreshed in the background.
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const hit = await c.match(req);
    const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
