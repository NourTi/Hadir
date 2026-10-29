// The page a student reaches by scanning the class QR code: name, student ID and a password, and they are in the class.
import { h, icon, theme, field } from '../ui.js';
import { t, addStrings, lang, setLang } from '../i18n.js';
import { api } from '../api.js';
import { makeKey, saveDevice, deviceLabel } from '../device.js';

addStrings({
  en: {
    'jn.title': 'Join {group}', 'jn.by': 'Taught by {teacher}', 'jn.text': 'Enter your details once. Your phone then shows the code your teacher scans at roll call.', 'jn.name': 'Full name', 'jn.nameHint': 'As it appears on your student card.', 'jn.id': 'Student ID (optional)', 'jn.idHint': 'Leave empty if you do not have one. Hadir will give you a short ID to sign in with.', 'jn.pw': 'Choose a password', 'jn.pwHint': 'At least 8 characters. You will use it to sign in later.',
    'jn.go': 'Join the class', 'jn.again': 'Already joined on this phone? Open the app instead.', 'jn.openApp': 'Open the app', 'jn.closed': 'Joining is closed', 'jn.closedText': 'Your teacher has closed joining for this class. Ask them to open it again.', 'jn.bad': 'This link does not work', 'jn.badText': 'The QR code may be old. Ask your teacher to show the current one.',
    'jn.existing': 'Already have an account? Enter the same student ID and your password to add this class.',
  },
  ar: {
    'jn.title': 'الانضمام إلى {group}', 'jn.by': 'الأستاذ {teacher}', 'jn.text': 'أدخل بياناتك مرة واحدة. بعدها يعرض هاتفك الرمز الذي يمسحه أستاذك عند تسجيل الحضور.', 'jn.name': 'الاسم الكامل', 'jn.nameHint': 'كما يظهر في بطاقة الطالب.', 'jn.id': 'الرقم الجامعي (اختياري)', 'jn.idHint': 'اتركه فارغًا إن لم يكن لديك. سيمنحك «حاضر» رقمًا قصيرًا لتسجيل الدخول.', 'jn.pw': 'اختر كلمة سر', 'jn.pwHint': '8 أحرف على الأقل. ستستخدمها لتسجيل الدخول لاحقًا.',
    'jn.go': 'الانضمام إلى الفوج', 'jn.again': 'انضممت سابقًا على هذا الهاتف؟ افتح التطبيق.', 'jn.openApp': 'فتح التطبيق', 'jn.closed': 'الانضمام مغلق', 'jn.closedText': 'أغلق أستاذك الانضمام لهذا الفوج. اطلب منه فتحه من جديد.', 'jn.bad': 'هذا الرابط لا يعمل', 'jn.badText': 'قد يكون الرمز قديمًا. اطلب من أستاذك عرض الرمز الحالي.',
    'jn.existing': 'لديك حساب؟ أدخل الرقم الجامعي نفسه وكلمة سرك لإضافة هذا الفوج.',
  },
});

export default async function mountJoin(root, token, app) {
  root.className = ''; root.replaceChildren();
  const card = h('div.authcard');
  const langBtn = h('button.btn.btn--subtle.btn--sm', { type: 'button', onclick: () => setLang(lang() === 'ar' ? 'en' : 'ar') }, lang() === 'ar' ? 'English' : 'العربية');
  const shell = h('div.auth.auth--join', h('main.auth__main', h('div.auth__tools', langBtn), h('a.brand', { href: '/', 'aria-label': 'Hadir' }, h('span.brand__ar', { lang: 'ar' }, 'حاضر'), h('span.brand__en', 'Hadir')), card));
  root.append(shell);

  let info;
  try { info = await api.get(`/api/join/${encodeURIComponent(token)}`); }
  catch (e) { card.append(h('div.stack', h('h1', t('jn.bad')), h('p.muted', t('jn.badText')))); return; }
  if (!info.open) { card.append(h('div.stack', h('h1', t('jn.closed')), h('p.muted', t('jn.closedText')), h('a.btn.btn--ghost', { href: '/app/' }, t('jn.openApp')))); return; }

  const input = (name, type, extra = {}) => h('input.input', { name, type, required: true, ...extra });
  const form = h('form.stack',
    h('div', h('h1', t('jn.title', { group: info.group.course_name || info.group.name })), h('p.muted', [info.group.name, t('jn.by', { teacher: info.group.teacher_name })].join(' · '))),
    h('p', t('jn.text')),
    field(t('jn.name'), input('full_name', 'text', { autocomplete: 'name', maxlength: 80 }), t('jn.nameHint')),
    field(t('jn.id'), input('university_id', 'text', { required: false, autocomplete: 'username', dir: 'ltr', maxlength: 40 }), t('jn.idHint')),
    field(t('jn.pw'), input('password', 'password', { autocomplete: 'new-password', minlength: 8 }), t('jn.pwHint')),
    h('p.muted.small', t('jn.existing')),
    h('p.form-error', { role: 'alert' }), h('button.btn.btn--primary.btn--lg.btn--block', { type: 'submit' }, t('jn.go')),
    h('p.small', h('a.link', { href: '/app/' }, t('jn.again'))));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('.form-error'); const btn = form.querySelector('button[type=submit]');
    err.textContent = ''; btn.disabled = true;
    const v = Object.fromEntries(new FormData(form));
    try {
      const key = await makeKey();
      const s = await api.post(`/api/join/${encodeURIComponent(token)}`, { ...v, language: lang(), device: { public_jwk: key.publicJwk, label: deviceLabel() } });
      await saveDevice({ privateKey: key.privateKey, device_id: s.device_id, univ_id: s.user.university_id, status: s.device_status || 'approved' });
      history.replaceState(null, '', '/app/');
      app.onSignedIn(s);
    } catch (er) { err.textContent = er.message || t('err.server'); btn.disabled = false; }
  });
  card.append(form);
  form.querySelector('input')?.focus({ preventScroll: true });
}
