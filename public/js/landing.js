import { addStrings, initLang, setLang, lang, onLang, t } from './i18n.js';
import './landing-strings.js';
import { h, icon, theme } from './ui.js';
import { createDeviceKey, signCode } from './crypto.js';
import { qrSvg } from './qr.js';

const $ = (s, r = document) => r.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const themeCtl = theme();
themeCtl.init();

// ---------- strings, language, theme ----------
function applyStrings() {
  document.title = t('meta.title');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  const btn = $('#langBtn');
  btn.textContent = lang() === 'ar' ? 'English' : 'العربية';
  btn.lang = lang() === 'ar' ? 'en' : 'ar';
  $('#matrix').setAttribute('aria-label', t('rep.label'));
  $('#heroQr').setAttribute('aria-label', t('phone.qrlabel'));
  paintThemeBtn();
}
function effectiveDark() {
  const set = document.documentElement.dataset.theme;
  return set ? set === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
function paintThemeBtn() {
  const b = $('#themeBtn');
  b.replaceChildren(icon(effectiveDark() ? 'sun' : 'moon', 20));
  b.setAttribute('aria-label', t('common.theme'));
}
function decorate() {
  for (const el of document.querySelectorAll('[data-icon]')) el.replaceChildren(icon(el.dataset.icon, el.classList.contains('checks__mark') ? 20 : 22));
  for (const el of document.querySelectorAll('.net')) el.prepend(icon(el.classList.contains('net--off') ? 'wifioff' : 'wifi', 15));
}
$('#langBtn').addEventListener('click', () => setLang(lang() === 'ar' ? 'en' : 'ar'));
$('#themeBtn').addEventListener('click', () => { themeCtl.set(effectiveDark() ? 'light' : 'dark'); paintThemeBtn(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', paintThemeBtn);

// ---------- the roll-call register ----------
const ROWS = [
  ['Amina Benali', 'present'], ['Yacine Merabet', 'present'], ['Ines Khelifi', 'present'], ['Racim Haddad', 'late'], ['Lina Boudiaf', 'present'],
  ['Sofiane Ziani', 'absent'], ['Nour El Houda Cherif', 'present'], ['Anis Belkacem', 'present'], ['Meriem Touati', 'present'],
];
const ROTS = [-4, 2, -2, 3, -3, 2.5, -1.5, 3.5, -2.5];
const WORD = { present: ['حاضر', 'Present'], late: ['متأخر', 'Late'], absent: ['غائب', 'Absent'] };
const regRows = $('#regRows');
const stamps = ROWS.map(([name, status], i) => {
  const [ar, en] = WORD[status];
  const stamp = h('span', { class: `rstamp rstamp--${status}`, style: { '--rot': `${ROTS[i]}deg` } }, h('b', { lang: 'ar' }, ar), h('small', en));
  regRows.append(h('li.reg-row', h('span.reg-row__n', i + 1), h('span.reg-row__name', name), h('span.reg-row__mark', stamp)));
  return stamp;
});
const tallyN = $('#tallyN');
function playRegister() {
  if (reduced) { stamps.forEach((s) => { s.classList.add('on'); s.style.animationDuration = '.001ms'; }); tallyN.textContent = String(stamps.length); return; }
  $('#scanLine').classList.add('on');
  stamps.forEach((s, i) => setTimeout(() => { s.classList.add('on'); tallyN.textContent = String(i + 1); }, 1000 + i * 520));
}

// ---------- the phone: a real signed code that changes every 30 seconds ----------
const ID = '202431000001', DEVICE = 'k3m9x2pq7a', LIFE = 30;
let key = null, startedAt = Date.now();
async function nextCode() {
  const t0 = Math.floor(Date.now() / 1000);
  try {
    key ||= await createDeviceKey();
    return await signCode(key.privateKey, ID, DEVICE, t0);
  } catch {
    // Browsers only allow signing on secure origins. A fixed sample keeps the picture alive elsewhere.
    return `HD1.${ID}.${DEVICE}.${t0}.QN6bgOyD-r-oLUeCobDXyVshnJqaQlJ4r12f6LWCyXLE3fd4rNk580w_uItvRxTpdQgn0brvITrgsz2ZL1fR5g`;
  }
}
async function paintQr() {
  const code = await nextCode();
  $('#heroQr').innerHTML = qrSvg(code, { ecl: 'M', border: 2, label: t('phone.qrlabel') }); // our own SVG, no user data
  startedAt = Date.now();
}
function tick() {
  const left = Math.max(0, LIFE - (Date.now() - startedAt) / 1000);
  $('#timerBar').style.transform = `scaleX(${left / LIFE})`;
  $('#timerN').textContent = String(Math.ceil(left));
  if (left <= 0) paintQr();
}

// ---------- the semester matrix ----------
function buildMatrix() {
  const names = ['Amina Benali', 'Yacine Merabet', 'Ines Khelifi', 'Racim Haddad', 'Lina Boudiaf', 'Sofiane Ziani', 'Nour El Houda Cherif', 'Anis Belkacem', 'Meriem Touati', 'Walid Saadi', 'Hanane Bouzid', 'Oussama Kaci', 'Sarah Mebarki', 'Ilyes Amrani'];
  let seed = 20261021;
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let x = seed; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const SESSIONS = 16;
  const grid = $('#matrix');
  grid.append(h('span'), ...Array.from({ length: SESSIONS }, (_, i) => h('span.matrix__head', i + 1)));
  names.forEach((n, r) => {
    grid.append(h('span.matrix__name', n));
    for (let s = 0; s < SESSIONS; s++) {
      let st = 'present';
      const x = rnd();
      if (r === 5 && [4, 9, 13].includes(s)) st = 'absent';           // a student at risk
      else if (r === 9 && (s === 6 || s === 7 || s === 12)) st = 'absent';
      else if (x < 0.035) st = 'absent';
      else if (x < 0.11) st = 'late';
      else if (x < 0.14) st = 'excused';
      grid.append(h('i', { class: `cell cell--${st}` }));
    }
  });
}

initLang();
// Real installs start empty. The sample-data demo is offered only when the server runs in demo mode.
fetch('/api/config').then((r) => r.json()).then((c) => {
  if (c.demo) return;
  for (const a of document.querySelectorAll('a[href="/app/#/demo"]')) { a.href = '/app/'; a.dataset.i18n = 'cta.start'; }
  applyStrings();
}).catch(() => {});
decorate();
buildMatrix();
applyStrings();
onLang(() => { applyStrings(); paintQr(); });
paintQr().then(() => { playRegister(); setInterval(tick, 250); });
