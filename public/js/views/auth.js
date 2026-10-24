// Sign-in screen: first-run setup, teacher sign-in, student sign-in, and "join a class" with an invite code.
import { h, icon, theme, field } from '../ui.js';
import { t, lang, setLang } from '../i18n.js';
import { api } from '../api.js';
import { makeKey, saveDevice, deviceLabel } from '../device.js';

export default function mountAuth(root, app) {
  const cfg = app.config;
  let mode = cfg.setup_needed ? 'setup' : 'teacher';
  const themeCtl = theme();
  const card = h('div.authcard');
  const darkNow = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);

  function tools() {
    const themeBtn = h('button.icon-btn', { type: 'button', 'aria-label': t('common.theme'), onclick: () => { themeCtl.set(darkNow() ? 'light' : 'dark'); themeBtn.replaceChildren(icon(darkNow() ? 'sun' : 'moon', 20)); } }, icon(darkNow() ? 'sun' : 'moon', 20));
    return h('div.auth__tools',
      h('button.btn.btn--subtle.btn--sm', { type: 'button', lang: lang() === 'ar' ? 'en' : 'ar', onclick: () => setLang(lang() === 'ar' ? 'en' : 'ar') }, lang() === 'ar' ? 'English' : 'العربية'), themeBtn);
  }

  async function submit(form, run) {
    const err = form.querySelector('.form-error'); const btn = form.querySelector('button[type=submit]');
    err.textContent = ''; btn.disabled = true;
    try { await run(Object.fromEntries(new FormData(form))); }
    catch (e) { err.textContent = e.message || t('err.server'); btn.disabled = false; err.scrollIntoView?.({ block: 'nearest' }); }
  }
  const input = (name, type, opts = {}) => h('input.input', { name, type, required: true, autocomplete: opts.ac || 'off', inputmode: opts.mode, minlength: opts.min, dir: opts.dir, placeholder: opts.ph, spellcheck: false, autocapitalize: opts.cap || 'off' });

  function setupForm() {
    const f = h('form.stack', { novalidate: false },
      h('h1', t('auth.setupTitle')), h('p.muted', t('auth.setupText')),
      field(t('auth.name'), input('full_name', 'text', { ac: 'name' })), field(t('auth.email'), input('email', 'email', { ac: 'email', dir: 'ltr' })),
      field(t('auth.password'), input('password', 'password', { ac: 'new-password', min: 8 }), t('auth.passwordHint')),
      h('p.form-error', { role: 'alert' }), h('button.btn.btn--primary.btn--lg.btn--block', { type: 'submit' }, t('auth.setupBtn')));
    f.addEventListener('submit', (e) => { e.preventDefault(); submit(f, async (v) => app.onSignedIn(await api.post('/api/auth/setup', { ...v, language: lang() }))); });
    return f;
  }
  function loginForm(role) {
    const f = h('form.stack',
      h('h1', t(role === 'teacher' ? 'auth.signinTitle' : 'auth.studentTitle')),
      field(t(role === 'teacher' ? 'auth.email' : 'auth.univ'), input('login', role === 'teacher' ? 'email' : 'text', { ac: 'username', dir: 'ltr', mode: role === 'teacher' ? 'email' : 'numeric' })),
      field(t('auth.password'), input('password', 'password', { ac: 'current-password' })),
      h('p.form-error', { role: 'alert' }), h('button.btn.btn--primary.btn--lg.btn--block', { type: 'submit' }, t('auth.signinBtn')),
      role === 'student' ? h('p.muted.small', t('auth.forgot')) : null);
    f.addEventListener('submit', (e) => { e.preventDefault(); submit(f, async (v) => app.onSignedIn(await api.post('/api/auth/login', v))); });
    return f;
  }
  function joinForm() {
    const f = h('form.stack', h('h1', t('auth.joinTitle')), h('p.muted', t('auth.joinText')),
      h('div.form-grid', field(t('auth.univ'), input('university_id', 'text', { dir: 'ltr', mode: 'numeric' })), field(t('auth.code'), input('code', 'text', { dir: 'ltr', ph: 'ABC-123', cap: 'characters' }))),
      field(t('auth.newPassword'), input('password', 'password', { ac: 'new-password', min: 8 }), t('auth.passwordHint')),
      h('p.form-error', { role: 'alert' }), h('button.btn.btn--primary.btn--lg.btn--block', { type: 'submit' }, t('auth.joinBtn')));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      submit(f, async (v) => {
        const key = await makeKey();
        const s = await api.post('/api/auth/activate', { university_id: v.university_id, code: v.code, password: v.password, language: lang(), device: { public_jwk: key.publicJwk, label: deviceLabel() } });
        await saveDevice({ privateKey: key.privateKey, device_id: s.device_id, univ_id: s.user.university_id, status: 'approved' });
        app.onSignedIn(s);
      });
    });
    return f;
  }

  async function demo(role) {
    try { app.onSignedIn(await api.post('/api/auth/demo', { role })); } catch (e) { card.querySelector('.form-error, .demo__err')?.append(e.message); }
  }

  function render() {
    card.replaceChildren();
    if (mode !== 'setup') {
      const items = [['teacher', t('auth.teacher')], ['student', t('auth.student')], ['join', t('auth.join')]];
      card.append(h('div.seg.seg--full', { role: 'tablist' }, items.map(([id, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(mode === id), 'aria-pressed': String(mode === id), onclick: () => { mode = id; render(); } }, label))));
    }
    card.append(mode === 'setup' ? setupForm() : mode === 'teacher' ? loginForm('teacher') : mode === 'student' ? loginForm('student') : joinForm());
    card.querySelector('input')?.focus({ preventScroll: true });
  }
  render();

  const points = [['wifioff', t('auth.p1')], ['shield', t('auth.p2')], ['globe', t('auth.p3')]];
  root.append(h('div.auth',
    h('aside.auth__brand', h('a.brand', { href: '/', 'aria-label': 'Hadir' }, h('span.brand__ar', { lang: 'ar' }, 'حاضر'), h('span.brand__en', 'Hadir')),
      h('div.auth__pitch', h('p.auth__tagline', t('auth.tagline')), h('ul.auth__points', points.map(([ic, text]) => h('li', icon(ic, 18), h('span', text))))),
      h('a.auth__back', { href: '/' }, icon('chevron', 16, 'icon--flip'), t('auth.back'))),
    h('main.auth__main', tools(), card,
      cfg.demo ? h('div.demo', h('p.demo__title', icon('flask', 16), t('auth.demoTitle')), h('p.muted.small', t('auth.demoText')),
        h('div.row', h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => demo('teacher') }, t('auth.demoTeacher')), h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => demo('student') }, t('auth.demoStudent'))), h('p.demo__err.form-error')) : null,
      cfg.offline ? h('p.form-error', t('err.offline')) : null)));
}
