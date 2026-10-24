// A student sends an excuse for an absence, optionally with a photo or PDF, and follows its answer.
import { h, icon, toast, chip, empty, field } from '../ui.js';
import { t, addStrings, fmtDateTime } from '../i18n.js';
import { api } from '../api.js';
import { pageHead, sheet, select } from '../kit.js';

addStrings({
  en: { 'mx.title': 'Excuses', 'mx.sub': 'If you missed a class for a good reason, tell your teacher here.', 'mx.new': 'Send an excuse', 'mx.session': 'Which class', 'mx.reason': 'Reason', 'mx.file': 'Proof (optional)', 'mx.fileHint': 'A photo or PDF, up to 3 MB.', 'mx.send': 'Send', 'mx.sent': 'Excuse sent.',
    'mx.mine': 'My excuses', 'mx.none': 'No excuses sent', 'mx.noneText': 'Excuses you send, and your teacher’s answer, appear here.', 'mx.noAbsence': 'You have no absences without an excuse.', 'mx.big': 'That file is larger than 3 MB.', 'mx.pending': 'Waiting', 'mx.approved': 'Approved', 'mx.rejected': 'Refused', 'mx.pick': 'Choose a class' },
  ar: { 'mx.title': 'التبريرات', 'mx.sub': 'إذا غبت عن حصة لسبب وجيه فأخبر أستاذك هنا.', 'mx.new': 'إرسال عذر', 'mx.session': 'أي حصة', 'mx.reason': 'السبب', 'mx.file': 'إثبات (اختياري)', 'mx.fileHint': 'صورة أو PDF حتى 3 ميغابايت.', 'mx.send': 'إرسال', 'mx.sent': 'تم إرسال العذر.',
    'mx.mine': 'أعذاري', 'mx.none': 'لم يُرسل أي عذر', 'mx.noneText': 'تظهر هنا الأعذار التي ترسلها وجواب أستاذك.', 'mx.noAbsence': 'ليس لديك غيابات بلا عذر.', 'mx.big': 'الملف أكبر من 3 ميغابايت.', 'mx.pending': 'في الانتظار', 'mx.approved': 'مقبول', 'mx.rejected': 'مرفوض', 'mx.pick': 'اختر حصة' },
});

const readB64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });

export default async function mount(root, params, app) {
  app.setTitle(t('mx.title'));
  const holder = h('div.stack.stack--lg');
  root.append(pageHead(t('mx.title'), t('mx.sub')), holder);
  const wanted = new URLSearchParams((location.hash.split('?')[1]) || '').get('session');

  async function draw() {
    const [sum, ex] = await Promise.all([api.get('/api/student/summary'), api.get('/api/excuses')]);
    const taken = new Set(ex.excuses.filter((e) => e.state !== 'rejected').map((e) => e.session_id));
    const options = sum.groups.flatMap((g) => g.history.filter((r) => r.status === 'absent' && !taken.has(r.session_id)).map((r) => [r.session_id, `${g.group.name} · ${fmtDateTime(r.starts_at)}`]));
    const names = new Map(sum.groups.flatMap((g) => g.history.map((r) => [r.session_id, `${g.group.name} · ${fmtDateTime(r.starts_at)}`])));
    let sid = options.some(([v]) => v === wanted) ? wanted : options[0]?.[0];
    const reason = h('textarea.input', { rows: 4, maxlength: 600 }); const file = h('input', { type: 'file', accept: 'image/*,application/pdf' }); const err = h('p.form-error', { role: 'alert' });
    const form = options.length ? h('form.stack', { onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      const f = file.files[0]; if (f && f.size > 3 * 1024 * 1024) { err.textContent = t('mx.big'); return; }
      try { await api.post('/api/excuses', { session_id: sid, reason: reason.value, file: f ? { name: f.name, data: await readB64(f) } : undefined }); toast(t('mx.sent'), 'ok'); await draw(); } catch (er) { err.textContent = er.message; }
    } }, field(t('mx.session'), select(options, sid, (v) => { sid = v; })), field(t('mx.reason'), reason), field(t('mx.file'), file, t('mx.fileHint')), err, h('div.row', h('button.btn.btn--primary', { type: 'submit' }, icon('send', 16), t('mx.send')))) : h('p.muted', t('mx.noAbsence'));
    holder.replaceChildren(sheet(t('mx.new'), form),
      sheet(t('mx.mine'), ex.excuses.length ? h('ul.ledger-list', ex.excuses.map((e) => h('li', h('div.grow', h('strong', names.get(e.session_id) || ''), h('p.small', e.reason), e.decision_note ? h('p.muted.small', e.decision_note) : null),
        chip(e.state === 'approved' ? 'present' : e.state === 'rejected' ? 'absent' : 'late', t(`mx.${e.state}`))))) : empty(t('mx.none'), t('mx.noneText')), null, { flush: true }));
  }
  await draw();
}
