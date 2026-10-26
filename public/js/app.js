// Entry point of the app: sign-in gate, shell (navigation, sync status), and a small hash router.
import { initLang, setLang, lang, onLang, t, addStrings } from './i18n.js';
import { h, icon, theme, toast, loading, errorState, clear, openModal, empty, chip } from './ui.js';
import { api, auth, saveAuth, clearAuth, onAuthExpired } from './api.js';
import { net, onNet, startAutoSync, ensureBundle, syncAll } from './offline.js';
import { fmtDateTime } from './i18n.js';
import './strings-app.js';

const root = document.getElementById('root');
const themeCtl = theme();
const app = { config: {}, user: null, setTitle, go, refreshBadges, openInbox, signOut, onSignedIn };
let stopView = null, navToken = 0, shell = null, badgeTimer = null;

const TEACHER_NAV = [
  ['/today', 'today', 'nav.today'], ['/classes', 'classes', 'nav.classes'], ['/grades', 'award', 'nav.grades'], ['/excuses', 'inbox', 'nav.excuses'],
  ['/automation', 'zap', 'nav.automation'], ['/reports', 'chart', 'nav.reports'], ['/access', 'phone', 'nav.access'], ['/settings', 'sliders', 'nav.settings'],
];
const TEACHER_TABS = ['/today', '/classes', '/grades', '/excuses'];
const STUDENT_NAV = [['/me', 'qr', 'nav.myCode'], ['/me/attendance', 'calendar', 'nav.attendance'], ['/me/grades', 'award', 'nav.grades'], ['/me/excuses', 'file', 'nav.excuses'], ['/me/settings', 'sliders', 'nav.settings']];

const R = (pattern, load) => ({ keys: [], re: new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => '([^/]+)') + '/?$'), names: [...pattern.matchAll(/:(\w+)/g)].map((m) => m[1]), load });
const TEACHER_ROUTES = [
  R('/today', () => import('./views/today.js')), R('/scan/:id', () => import('./views/scan.js')),
  R('/classes', () => import('./views/classes.js')), R('/classes/:id', () => import('./views/classes.js')),
  R('/session/:id', () => import('./views/session.js')), R('/student/:id', () => import('./views/studentcard.js')),
  R('/grades', () => import('./views/grades.js')), R('/grades/:id', () => import('./views/grades.js')),
  R('/excuses', () => import('./views/excuses.js')), R('/automation', () => import('./views/automation.js')),
  R('/automation/:tab', () => import('./views/automation.js')),
  R('/reports', () => import('./views/reports.js')), R('/reports/:id', () => import('./views/reports.js')),
  R('/access', () => import('./views/access.js')), R('/access/:id', () => import('./views/access.js')), R('/settings', () => import('./views/settings.js')),
];
const STUDENT_ROUTES = [
  R('/me', () => import('./views/me.js')), R('/me/attendance', () => import('./views/me-attendance.js')), R('/me/grades', () => import('./views/me-grades.js')),
  R('/me/excuses', () => import('./views/me-excuses.js')), R('/me/settings', () => import('./views/settings.js')),
];
const home = () => (auth.user?.role === 'student' ? '/me' : '/today');
const path = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];

export function go(p) { if (path() === p) route(); else location.hash = '#' + p; }
function setTitle(text) { document.title = text ? `${text} · Hadir` : 'Hadir'; }

// ---------- boot ----------
async function boot() {
  initLang(); themeCtl.init(); ready = true;
  registerWorker();
  try { app.config = await api.get('/api/config'); } catch { app.config = { offline: true }; }
  onAuthExpired(() => { toast(t('auth.expired'), 'error'); showAuth(); });

  // The landing page links here with #/demo to open the live demo straight away.
  if (app.config.demo && /^\/demo(-student)?$/.test(path())) {
    try { const s = await api.post('/api/auth/demo', { role: path() === '/demo-student' ? 'student' : 'teacher' }); saveAuth(s.token, s.user); history.replaceState(null, '', '/app/'); location.hash = '#' + (s.user.role === 'student' ? '/me' : '/today'); }
    catch (e) { toast(e.message, 'error'); }
  }
  const joinMatch = /^\/join\/([\w-]+)/.exec(path());
  if (joinMatch) { stopView?.(); const { default: mountJoin } = await import('./views/join.js'); return mountJoin(root, joinMatch[1], app); }
  if (!auth.token) return showAuth();
  try { const me = await api.get('/api/me'); saveAuth(auth.token, me.user); } catch (e) { if (!e.offline && e.status === 401) return showAuth(); }
  startSignedIn();
}

async function showAuth() {
  stopView?.(); stopView = null; shell = null; clearInterval(badgeTimer);
  try { app.config = await api.get('/api/config'); } catch { /* keep what we have */ }
  const { default: mountAuth } = await import('./views/auth.js');
  clear(root); root.className = '';
  mountAuth(root, app);
}
function onSignedIn(session) {
  saveAuth(session.token, session.user);
  if (session.user.language && session.user.language !== lang()) setLang(session.user.language);
  location.hash = '#' + home();
  startSignedIn();
}
function signOut() {
  clearAuth(); stopView?.(); stopView = null;
  location.hash = '';
  showAuth();
}
function startSignedIn() {
  app.user = auth.user;
  buildShell();
  if (auth.user.role !== 'student') { startAutoSync(); ensureBundle().catch(() => {}); }
  clearInterval(badgeTimer);
  badgeTimer = setInterval(() => { if (!document.hidden) refreshBadges(); }, 60e3);
  refreshBadges();
  route();
}

// ---------- shell ----------
function buildShell() {
  const isStudent = auth.user.role === 'student';
  const nav = isStudent ? STUDENT_NAV : TEACHER_NAV;
  const link = ([p, ic, key]) => h('a.nav__link', { href: '#' + p, dataset: { path: p } }, icon(ic, 20), h('span', t(key)), h('span.badge', { hidden: true, dataset: { badge: p } }));

  const mkSync = () => (isStudent ? null : h('button.syncpill', { type: 'button', onclick: () => syncAll().then(() => refreshBadges()) }));
  const mkBell = () => h('button.icon-btn', { type: 'button', 'aria-label': t('nav.messages'), onclick: openInbox }, icon('bell', 20), h('span.dot.bell-dot', { hidden: true }));
  const langBtn = h('button.btn.btn--subtle.btn--sm', { type: 'button', lang: lang() === 'ar' ? 'en' : 'ar', onclick: () => { setLang(lang() === 'ar' ? 'en' : 'ar'); api.patch('/api/me', { language: lang() }).catch(() => {}); } }, lang() === 'ar' ? 'English' : 'العربية');
  const darkNow = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  const themeBtn = h('button.icon-btn', { type: 'button', 'aria-label': t('common.theme'), onclick: () => { themeCtl.set(darkNow() ? 'light' : 'dark'); themeBtn.replaceChildren(icon(darkNow() ? 'sun' : 'moon', 20)); } }, icon(darkNow() ? 'sun' : 'moon', 20));
  const brand = h('a.brand.brand--app', { href: '#' + home(), 'aria-label': 'Hadir' }, h('span.brand__ar', { lang: 'ar' }, 'حاضر'), h('span.brand__en', 'Hadir'));
  const who = h('div.who', h('span.avatar', { 'aria-hidden': 'true' }, [...auth.user.full_name][0] || '?'), h('div.who__text', h('strong', auth.user.full_name), h('span.muted.small', t(isStudent ? 'role.student' : 'role.teacher'))));

  const side = h('aside.side', h('div.side__top', brand), h('nav.nav', { 'aria-label': t('nav.main') }, nav.map(link)),
    h('div.side__foot', isStudent ? null : h('div.side__sync', mkSync()), h('div.row.row--tools', langBtn, themeBtn, mkBell()), who,
      h('button.btn.btn--subtle.btn--sm.btn--block', { type: 'button', onclick: signOut }, icon('logout', 16, 'icon--flip'), t('nav.signOut'))));

  const top = h('header.topbar', h('a.brand.brand--app', { href: '#' + home(), 'aria-label': 'Hadir' }, h('span.brand__ar', { lang: 'ar' }, 'حاضر'), h('span.brand__en', 'Hadir')),
    h('div.topbar__tools', mkSync(), mkBell(), h('button.icon-btn', { type: 'button', 'aria-label': t('nav.menu'), onclick: openMenu }, icon('menu', 20))));

  const tabPaths = isStudent ? STUDENT_NAV.slice(0, 4).map((n) => n[0]) : TEACHER_TABS;
  const tabs = h('nav.tabbar', { 'aria-label': t('nav.main') }, nav.filter((n) => tabPaths.includes(n[0])).map(([p, ic, key]) =>
    h('a.tab', { href: '#' + p, dataset: { path: p } }, icon(ic, 22), h('span', t(key)), h('span.badge', { hidden: true, dataset: { badge: p } }))),
  isStudent ? null : h('button.tab', { type: 'button', onclick: openMenu }, icon('more', 22), h('span', t('nav.more'))));

  const main = h('main#main.main', { tabindex: '-1' });
  clear(root); root.className = 'app';
  root.append(side, h('div.stage', top, main), tabs);
  shell = { main, side, tabs, top };
  paintNet(net);
  document.querySelector('.skip')?.remove();
  document.body.prepend(h('a.skip', { href: '#main', onclick: (e) => { e.preventDefault(); main.focus(); } }, t('nav.skip')));
}
function openMenu() {
  const items = auth.user.role === 'student' ? STUDENT_NAV : TEACHER_NAV;
  const { close } = openModal({ title: t('nav.menu'), size: 'sm', body: h('nav.menu', items.map(([p, ic, key]) => h('a.menu__link', { href: '#' + p, onclick: () => close() }, icon(ic, 20), t(key)))) , actions: [{ label: t('nav.signOut'), kind: 'ghost', onClick: () => { signOut(); } }] });
}

function markCurrent(p) {
  for (const a of document.querySelectorAll('[data-path]')) {
    const base = a.dataset.path;
    const on = p === base || (base !== '/me' && p.startsWith(base + '/')) || (base === '/classes' && (p.startsWith('/session/') || p.startsWith('/student/'))) || (base === '/today' && p.startsWith('/scan/'));
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

// ---------- router ----------
async function route() {
  if (!auth.token || !shell) return;
  const p = path();
  const table = auth.user.role === 'student' ? STUDENT_ROUTES : TEACHER_ROUTES;
  let hit = null, params = {};
  for (const r of table) { const m = r.re.exec(p); if (m) { hit = r; params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])])); break; } }
  if (!hit) { go(home()); return; }
  markCurrent(p);
  const token = ++navToken;
  stopView?.(); stopView = null;
  const main = shell.main;
  clear(main); main.append(loading());
  try {
    const mod = await hit.load();
    if (token !== navToken) return;
    clear(main);
    const out = await mod.default(main, params, app);
    if (token !== navToken) { out?.(); return; }
    if (typeof out === 'function') stopView = out;
    window.scrollTo(0, 0);
  } catch (e) {
    if (token !== navToken) return;
    clear(main); console.error(e);
    main.append(errorState(e.code ? e : { message: t('err.view') }, () => route()));
  }
}
addEventListener('hashchange', route);
let ready = false;
onLang(() => { if (!ready) return; if (auth.token && shell) { buildShell(); route(); refreshBadges(); } else if (!auth.token) showAuth(); });

// ---------- badges, sync pill, inbox ----------
function paintNet(s) {
  for (const el of document.querySelectorAll('.syncpill')) {
    el.className = 'syncpill';
    let ic, text;
    if (s.syncing) { ic = 'sync'; text = t('net.syncing'); el.classList.add('is-busy'); }
    else if (!s.online) { ic = 'wifioff'; text = s.pending ? t('net.offlineWaiting', { n: s.pending }) : t('net.offline'); el.classList.add('is-off'); }
    else if (s.pending) { ic = 'upload'; text = t('net.waiting', { n: s.pending }); el.classList.add('is-wait'); }
    else { ic = 'check'; text = t('net.saved'); el.classList.add('is-ok'); }
    el.replaceChildren(icon(ic, 15), h('span', text));
    el.title = s.lastSync ? t('net.lastSync', { time: fmtDateTime(s.lastSync) }) : '';
  }
}
onNet(paintNet);
let lastRejectToast = 0;
onNet((s) => { if (s.lastRejects && s.lastSync && s.lastSync !== lastRejectToast) { lastRejectToast = s.lastSync; toast(t('net.rejected', { n: s.lastRejects }), 'error'); } });

const setBadge = (p, n) => document.querySelectorAll(`[data-badge="${p}"]`).forEach((b) => { b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n || ''); });
async function refreshBadges() {
  if (!auth.token) return;
  try {
    if (auth.user.role === 'student') {
      const n = await api.get('/api/notifications');
      document.querySelectorAll('.bell-dot').forEach((d) => { d.hidden = !n.unread; d.textContent = n.unread || ''; });
      return;
    }
    const [d, n] = await Promise.all([api.get('/api/dashboard'), api.get('/api/notifications')]);
    setBadge('/excuses', d.counts.pending_excuses);
    setBadge('/automation', d.counts.pending_messages);
    setBadge('/today', d.counts.review_scans + d.counts.pending_devices);
    document.querySelectorAll('.bell-dot').forEach((x) => { x.hidden = !n.unread; x.textContent = n.unread || ''; });
  } catch { /* offline: keep what is shown */ }
}

async function openInbox() {
  const body = h('div.inbox', loading());
  const m = openModal({ title: t('nav.messages'), body, size: 'md', actions: [{ label: t('inbox.markRead'), kind: 'ghost', close: false, onClick: async () => { await api.post('/api/notifications/read-all').catch(() => {}); refreshBadges(); m.close(); return false; } }] });
  try {
    const n = await api.get('/api/notifications');
    const list = n.inbox || [];
    clear(body);
    if (!list.length) body.append(empty(t('inbox.emptyTitle'), t('inbox.emptyText')));
    else body.append(h('ul.ledger-list', list.map((x) => h('li.inbox__item', { class: x.read_at ? '' : 'is-unread' }, h('div', h('p.inbox__title', x.title), h('p.muted.small', x.body), h('p.muted.small', fmtDateTime(x.created_at)))))));
  } catch (e) { clear(body); body.append(errorState(e)); }
}

function registerWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

boot();
