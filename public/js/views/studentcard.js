// A teacher's report card for one student: attendance history and grades in every group they share.
import { h, icon, empty, chip, flagChip } from '../ui.js';
import { t, addStrings, fmtDateTime, fmtDate, fmtNum } from '../i18n.js';
import { api } from '../api.js';
import { pageHead, sheet, stat, rateText, printPage, avatar } from '../kit.js';

addStrings({
  en: {
    'card.title': 'Student report', 'card.print': 'Print', 'card.rate': 'Attendance', 'card.absences': 'Absences', 'card.late': 'Late', 'card.excused': 'Excused', 'card.history': 'Attendance history', 'card.grades': 'Grades',
    'card.noHistory': 'No closed sessions yet', 'card.final': 'Final grade out of 20', 'card.noGrades': 'No grades entered yet', 'card.score': 'Score', 'card.weight': 'Weight', 'card.generated': 'Generated {time} by {teacher}',
  },
  ar: {
    'card.title': 'تقرير الطالب', 'card.print': 'طباعة', 'card.rate': 'الحضور', 'card.absences': 'الغيابات', 'card.late': 'التأخرات', 'card.excused': 'المبرَّرة', 'card.history': 'سجل الحضور', 'card.grades': 'النقاط',
    'card.noHistory': 'لا توجد حصص مغلقة بعد', 'card.final': 'العلامة النهائية من 20', 'card.noGrades': 'لم تُدخل نقاط بعد', 'card.score': 'العلامة', 'card.weight': 'المعامل', 'card.generated': 'أُنشئ {time} بواسطة {teacher}',
  },
});

export default async function mount(root, params, app) {
  const r = await api.get(`/api/reports/student/${params.id}`);
  app.setTitle(r.student.full_name);
  root.append(
    h('p.small.no-print', h('a.link', { href: 'javascript:history.back()' }, '← ', t('nav.classes'))),
    pageHead(r.student.full_name, `${r.student.university_id}${r.student.email ? ` · ${r.student.email}` : ''}`, h('button.btn.btn--ghost', { type: 'button', onclick: printPage }, icon('print', 16), t('card.print'))),
    h('div.stack.stack--lg', r.groups.map((x) => {
      const gb = x.grades;
      return h('section.stack', h('div.row.row--between', h('h2', x.group.name), flagChip(x.flag)),
        h('div.stats', stat({ label: t('card.rate'), value: rateText(x.stats.rate) }), stat({ label: t('card.absences'), value: x.stats.absences, tone: 'alert' }), stat({ label: t('card.late'), value: x.stats.late }), stat({ label: t('card.excused'), value: x.stats.excused }),
          stat({ label: t('card.final'), value: gb.final == null ? '–' : fmtNum(gb.final) })),
        h('div.cols',
          sheet(t('card.history'), x.history.length ? h('ul.timeline', x.history.map((s) => h('li', h('span.timeline__when', fmtDateTime(s.starts_at)), h('span.muted.small', s.topic || ''), s.status ? chip(s.status) : chip('none')))) : empty(t('card.noHistory')), null, { flush: true }),
          sheet(t('card.grades'), gb.assessments.length ? h('table.ledger', h('thead', h('tr', h('th', t('common.name')), h('th.num', t('card.weight')), h('th.num', t('card.score')))),
            h('tbody', gb.assessments.map((a) => { const g = gb.grades[a.id]; return h('tr', h('td', a.title, h('div.skill', a.skill)), h('td.num', a.weight), h('td.num', g?.score == null ? '–' : `${fmtNum(g.score)} / ${a.max_score}${g.cefr ? ` · ${g.cefr}` : ''}`)); }))) : empty(t('card.noGrades')), null, { flush: true })));
    })),
    h('p.muted.small.print-only', t('card.generated', { time: fmtDateTime(r.generated_at), teacher: r.teacher })));
}
