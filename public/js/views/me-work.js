// The student's work page: what to hand in, what was presented, and the marks once the educator shows them.
import { h, empty, toast, chip } from '../ui.js';
import { t, addStrings, fmtDate, fmtNum } from '../i18n.js';
import { api } from '../api.js';
import { pageHead, stat } from '../kit.js';
import { statusChip } from './work.js';

addStrings({
  en: { 'mw.title': 'My work', 'mw.sub': 'Homework, TD and projects from your educators, with your status and marks.', 'mw.todo': 'To do', 'mw.overdue': 'Overdue', 'mw.done': 'Presented', 'mw.marks': 'Marked',
    'mw.none': 'Nothing assigned yet', 'mw.noneText': 'When your educator gives you work, it appears here.', 'mw.overdueTag': 'Overdue', 'mw.feedback': 'Feedback', 'mw.instructions': 'Instructions', 'mw.soon': 'Mark not shown yet',
    'ci.card': 'Roll call is open', 'ci.enter': 'Enter the code shown in class', 'ci.go': 'Check in', 'ci.done': 'You are marked {status}.', 'ci.dup': 'You are already marked {status}.', 'ci.bad': 'That code is not right.' },
  ar: { 'mw.title': 'أعمالي', 'mw.sub': 'الواجبات والأعمال الموجّهة والمشاريع من أساتذتك، مع حالتك ونقاطك.', 'mw.todo': 'للإنجاز', 'mw.overdue': 'متأخرة', 'mw.done': 'مقدَّمة', 'mw.marks': 'منقّطة',
    'mw.none': 'لا شيء مكلَّف به بعد', 'mw.noneText': 'عندما يكلّفك أستاذك بعمل يظهر هنا.', 'mw.overdueTag': 'تجاوزت الأجل', 'mw.feedback': 'ملاحظة الأستاذ', 'mw.instructions': 'التعليمات', 'mw.soon': 'النقطة لم تُنشر بعد',
    'ci.card': 'تسجيل الحضور مفتوح', 'ci.enter': 'اكتب الرمز المعروض في القاعة', 'ci.go': 'سجّل حضوري', 'ci.done': 'تم تسجيلك: {status}.', 'ci.dup': 'أنت مسجّل بالفعل: {status}.', 'ci.bad': 'الرمز غير صحيح.' },
});

const order = (x) => (x.status === 'pending' ? (x.overdue ? 0 : 1) : x.marked ? 3 : 2);

export default async function mount(root, params, app) {
  app.setTitle(t('mw.title'));
  const w = await api.get('/api/student/work');
  const s = w.summary;
  root.append(pageHead(t('mw.title'), t('mw.sub')),
    h('div.stats', stat({ label: t('mw.todo'), value: s.todo }), stat({ label: t('mw.overdue'), value: s.overdue, tone: s.overdue ? 'bad' : undefined }), stat({ label: t('mw.done'), value: s.presented }), stat({ label: t('mw.marks'), value: s.marked })),
    h('div.stack.stack--lg', w.groups.some((g) => g.tasks.length) ? w.groups.filter((g) => g.tasks.length).map((g) => h('section.stack', h('h2', g.group.name),
      ...[...g.tasks].sort((a, b) => order(a) - order(b) || (a.due_at ?? 9e15) - (b.due_at ?? 9e15)).map((k) => h('article', { class: `workitem${k.overdue ? ' is-overdue' : ''}` },
        h('div.workitem__head', h('strong', k.title), h('div.row', k.overdue ? chip('absent', t('mw.overdueTag')) : null, statusChip(k.status))),
        h('div.muted.small', [t(`work.kind.${k.kind}`), k.due_at ? t('work.due', { date: fmtDate(k.due_at) }) : t('work.noDue')].join(' · ')),
        k.marked ? h('div.row', h('span.workitem__score', fmtNum(k.score)), k.max_score ? h('span.muted', `/ ${k.max_score}`) : null) : (k.status !== 'pending' && !k.marks_visible ? h('p.muted.small', t('mw.soon')) : null),
        k.feedback ? h('p', h('strong', `${t('mw.feedback')}: `), k.feedback) : null,
        k.details ? h('details', h('summary.small', t('mw.instructions')), h('p.muted', { style: { whiteSpace: 'pre-wrap' } }, k.details)) : null)))) : [empty(t('mw.none'), t('mw.noneText'))]));
}

// "Roll call is open" card for the student home. It polls while it is on screen.
export function checkinCard() {
  const box = h('div.stack');
  let timer = null;
  const load = async () => {
    if (!box.isConnected) { clearInterval(timer); return; }
    if (document.hidden) return;
    let list = [];
    try { list = (await api.get('/api/student/checkin')).sessions.filter((x) => x.status !== 'present' && x.status !== 'late'); } catch { return; }
    box.replaceChildren(...list.map((x) => {
      const input = h('input.input.ltr', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 7, placeholder: '000 000', 'aria-label': t('ci.enter') });
      const err = h('p.form-error', { role: 'alert' });
      const go = async () => {
        err.textContent = '';
        try {
          const r = await api.post('/api/student/checkin', { session_id: x.session_id, code: input.value });
          toast(t(r.result === 'accepted' ? 'ci.done' : 'ci.dup', { status: t(`status.${r.status}`) }), 'ok'); load();
        } catch (e) { err.textContent = e.code === 'wrong_code' ? t('ci.bad') : e.message; }
      };
      return h('form.checkincard', { onsubmit: (e) => { e.preventDefault(); go(); } }, h('strong', `${t('ci.card')} · ${x.group_name}`), h('p.muted.small', t('ci.enter')), input, err, h('button.btn.btn--primary', { type: 'submit' }, t('ci.go')));
    }));
  };
  load(); timer = setInterval(load, 15000);
  return box;
}
