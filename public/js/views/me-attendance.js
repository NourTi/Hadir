// A student's own attendance record, per class, with the option to send an excuse for an absence.
import { h, icon, chip, flagChip, empty } from '../ui.js';
import { t, addStrings, fmtDateTime, fmtPct } from '../i18n.js';
import { api } from '../api.js';
import { pageHead, sheet, stat } from '../kit.js';

addStrings({
  en: { 'ma.title': 'Attendance', 'ma.sub': 'Every closed session, as your teacher recorded it.', 'ma.none': 'No closed sessions yet', 'ma.noneText': 'Your record fills in after each class.', 'ma.rate': 'Attendance', 'ma.absences': 'Absences', 'ma.late': 'Late', 'ma.excused': 'Excused', 'ma.excuse': 'Send an excuse',
    'ma.ex.pending': 'Excuse sent', 'ma.ex.approved': 'Excuse approved', 'ma.ex.rejected': 'Excuse refused', 'ma.limit': 'Warning at {w} absences, formal notice at {n}.' },
  ar: { 'ma.title': 'الحضور', 'ma.sub': 'كل حصة مغلقة كما سجّلها أستاذك.', 'ma.none': 'لا توجد حصص مغلقة بعد', 'ma.noneText': 'يمتلئ سجلك بعد كل حصة.', 'ma.rate': 'الحضور', 'ma.absences': 'الغيابات', 'ma.late': 'التأخرات', 'ma.excused': 'المبرَّرة', 'ma.excuse': 'إرسال عذر',
    'ma.ex.pending': 'تم إرسال العذر', 'ma.ex.approved': 'العذر مقبول', 'ma.ex.rejected': 'العذر مرفوض', 'ma.limit': 'تنبيه عند {w} غيابات وإنذار رسمي عند {n}.' },
});

export default async function mount(root, params, app) {
  app.setTitle(t('ma.title'));
  const s = await api.get('/api/student/summary');
  root.append(pageHead(t('ma.title'), t('ma.sub')), h('div.stack.stack--lg', s.groups.length ? s.groups.map((x) => h('section.stack', h('div.row.row--between', h('h2', x.group.name), flagChip(x.flag)),
    h('div.stats', stat({ label: t('ma.rate'), value: fmtPct(x.stats?.rate) }), stat({ label: t('ma.absences'), value: x.stats?.absences ?? 0, tone: 'alert' }), stat({ label: t('ma.late'), value: x.stats?.late ?? 0 }), stat({ label: t('ma.excused'), value: x.stats?.excused ?? 0 })),
    h('p.muted.small', t('ma.limit', { w: x.group.absence_warn, n: x.group.absence_notice })),
    sheet(null, x.history.length ? h('ul.timeline', x.history.map((r) => h('li', h('span.timeline__when', fmtDateTime(r.starts_at)), h('span.muted.small.grow', r.topic || ''),
      r.excuse_state ? h('span.muted.small', t(`ma.ex.${r.excuse_state}`)) : r.status === 'absent' ? h('a.btn.btn--ghost.btn--sm', { href: `#/me/excuses?session=${r.session_id}` }, t('ma.excuse')) : null,
      r.status ? chip(r.status) : chip('none')))) : empty(t('ma.none'), t('ma.noneText')), null, { flush: true }))) : [empty(t('me.noClasses'))]));
}
