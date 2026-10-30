// Sign-in screen: first-run setup, teacher sign-in, student sign-in, and "join a class" with an invite code.
import { h, icon, theme, field, toast, downloadBlob } from '../ui.js';
import { t, lang, setLang } from '../i18n.js';
import { api } from '../api.js';
import { makeKey, saveDevice, deviceLabel } from '../device.js';
import { ACCENTS, TITLES, titleLabel, setAccent } from '../educator.js';
import { subjectList } from '../kit.js';
import '../strings-accounts.js';

export default function mountAuth(root, app) {
  const cfg = app.config;
  let mode = cfg.setup_needed ? 'register' : 'teacher';
  let pending = null; // a session waiting until the educator confirms they saved the recovery code
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

  const opt = (name, opts = {}) => h('input.input', { name, type: opts.type || 'text', autocomplete: opts.ac || 'off', dir: opts.dir, list: opts.list, maxlength: opts.max || 120, placeholder: opts.ph, spellcheck: false });

  // A one-time screen: the recovery code, with copy / download / print, and a box to tick before going on.
  function recoveryPanel(code, email, title, text, onDone, doneLabel) {
    const ok = h('input', { type: 'checkbox', id: 'rec-ok' });
    const go = h('button.btn.btn--primary.btn--lg.btn--block', { type: 'button', disabled: true, onclick: onDone }, doneLabel || t('rec.continue'));
    ok.addEventListener('change', () => { go.disabled = !ok.checked; });
    const fileText = `${t('rec.file', { email })}\n\n${code}\n\n${t('rec.fileNote')}\n`;
    return h('div.stack.recpanel', h('h1', title || t('rec.title')), h('p.muted', text || t('rec.text')),
      h('div.reccode.ltr', { 'aria-label': t('acc.code') }, code),
      h('div.row.no-print', h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(code); toast(t('rec.copied'), 'ok'); } catch { /* the code is visible anyway */ } } }, icon('copy', 15), t('rec.copy')),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => downloadBlob(new Blob([fileText], { type: 'text/plain;charset=utf-8' }), 'hadir-recovery-code.txt') }, icon('download', 15), t('rec.download')),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => window.print() }, icon('print', 15), t('rec.print'))),
      h('label.check.no-print', ok, h('span', t('rec.confirm'))), go);
  }

  function registerForm() {
    const first = !!cfg.setup_needed;
    if (!first && cfg.registration_open === false) return h('div.stack', h('h1', t('acc.createTitle')), h('p.callout.callout--warn', t('acc.closed')), h('button.btn.btn--ghost', { type: 'button', onclick: () => { mode = 'teacher'; render(); } }, t('acc.back')));
    const pw = h('input.input', { name: 'password', type: 'password', required: true, autocomplete: 'new-password', minlength: 10, spellcheck: false });
    const show = h('input', { type: 'checkbox', onchange: () => { pw.type = show.checked ? 'text' : 'password'; } });
    const title = h('select.input', { name: 'title' }, TITLES.map((x) => h('option', { value: x }, x ? titleLabel(x) : t('acc.title.none'))));
    let accent = 'green';
    const sw = h('div.swatches', { role: 'radiogroup', 'aria-label': t('acc.accent') }, ACCENTS.map(([k, hex]) => h('label.swatch', { style: { '--sw': hex }, title: k },
      h('input', { type: 'radio', name: 'accent', value: k, checked: k === 'green', onchange: () => { accent = k; setAccent(k); } }), h('span'))));
    const f = h('form.stack', { novalidate: false },
      h('h1', t(first ? 'acc.createFirst' : 'acc.createTitle')), h('p.muted', t(first ? 'acc.firstText' : 'acc.createText')),
      h('p.sectionlabel', t('acc.section.account')),
      field(t('acc.name'), input('full_name', 'text', { ac: 'name' })),
      field(t('acc.email'), input('email', 'email', { ac: 'email', dir: 'ltr' })),
      field(t('acc.password'), pw, t('acc.passwordHint')), h('label.check', show, h('span', t('acc.show'))),
      h('details.portal', { open: true }, h('summary', t('acc.section.portal')), h('p.muted.small', t('acc.portalText')),
        h('div.form-grid', field(t('acc.title'), title), field(t('acc.institution'), opt('institution', { ac: 'organization' })), field(t('acc.faculty'), opt('faculty')), field(t('acc.department'), opt('department')),
          field(t('acc.degree'), opt('degree')), field(t('acc.specialization'), opt('specialization'))),
        field(t('acc.subjects'), opt('subjects', { list: subjectList(), max: 400 }), t('acc.subjectsHint')),
        field(t('acc.accent'), sw)),
      h('p.form-error', { role: 'alert' }), h('button.btn.btn--primary.btn--lg.btn--block', { type: 'submit' }, t('acc.create')),
      first ? null : h('button.btn.btn--subtle.btn--block', { type: 'button', onclick: () => { setAccent('green'); mode = 'teacher'; render(); } }, t('acc.have')));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      submit(f, async (v) => {
        const body = { ...v, accent, language: lang() };
        const s = await api.post('/api/auth/register', body);
        pending = s; mode = 'recovery'; render();
      });
    });
    return f;
  }

  function forgotForm() {
    let done = null;
    const f = h('form.stack', h('h1', t('acc.forgotTitle')), h('p.muted', t('acc.forgotText')),
      field(t('acc.email'), input('email', 'email', { ac: 'username', dir: 'ltr' })),
      field(t('acc.code'), input('code', 'text', { dir: 'ltr', ph: 'XXXX-XXXX-XXXX-XXXX', cap: 'characters' })),
      field(t('acc.newPassword'), input('new_password', 'password', { ac: 'new-password', min: 10 }), t('acc.passwordHint')),
      h('p.form-error', { role: 'alert' }), h('button.btn.btn--primary.btn--lg.btn--block', { type: 'submit' }, t('acc.reset')),
      h('p.muted.small', t('acc.noCode')),
      h('button.btn.btn--subtle.btn--block', { type: 'button', onclick: () => { mode = 'teacher'; render(); } }, t('acc.back')));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      submit(f, async (v) => {
        const r = await api.post('/api/auth/forgot', v);
        done = { code: r.recovery_code, email: v.email };
        card.replaceChildren(recoveryPanel(done.code, done.email, t('acc.resetDone'), t('acc.resetDoneText'), () => { mode = 'teacher'; render(); }, t('acc.back')));
      });
    });
    return f;
  }
  function loginForm(role) {
    const f = h('form.stack',
      h('h1', t(role === 'teacher' ? 'auth.signinTitle' : 'auth.studentTitle')),
      field(t(role === 'teacher' ? 'auth.email' : 'auth.univ'), input('login', role === 'teacher' ? 'email' : 'text', { ac: 'username', dir: 'ltr', mode: role === 'teacher' ? 'email' : 'numeric' })),
      field(t('auth.password'), input('password', 'password', { ac: 'current-password' })),
      h('p.form-error', { role: 'alert' }), h('button.btn.btn--primary.btn--lg.btn--block', { type: 'submit' }, t('auth.signinBtn')),
      role === 'student' ? h('p.muted.small', t('auth.forgot'))
        : h('div.stack.stack--sm', h('button.linkbtn', { type: 'button', onclick: () => { mode = 'forgot'; render(); } }, t('acc.forgotLink')),
          cfg.registration_open === false ? null : h('button.btn.btn--ghost.btn--block', { type: 'button', onclick: () => { mode = 'register'; render(); } }, t('acc.new'))));
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
    if (mode === 'teacher' || mode === 'student' || mode === 'join') {
      const items = [['teacher', t('auth.teacher')], ['student', t('auth.student')], ['join', t('auth.join')]];
      card.append(h('div.seg.seg--full', { role: 'tablist' }, items.map(([id, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(mode === id), 'aria-pressed': String(mode === id), onclick: () => { mode = id; render(); } }, label))));
    }
    if (mode !== 'register') setAccent('green');
    card.append(mode === 'register' ? registerForm() : mode === 'forgot' ? forgotForm()
      : mode === 'recovery' ? recoveryPanel(pending.recovery_code, pending.user.login, null, null, () => app.onSignedIn(pending))
      : mode === 'teacher' ? loginForm('teacher') : mode === 'student' ? loginForm('student') : joinForm());
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
