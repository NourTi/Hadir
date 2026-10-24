// A student's published grades, with the weighted final out of 20.
import { h, empty } from '../ui.js';
import { t, addStrings, fmtDate, fmtNum } from '../i18n.js';
import { api } from '../api.js';
import { pageHead, sheet, stat } from '../kit.js';

addStrings({
  en: { 'mg.title': 'My grades', 'mg.sub': 'Your teacher publishes each grade when it is ready.', 'mg.none': 'No grades published yet', 'mg.noneText': 'They will appear here as soon as your teacher shares them.', 'mg.final': 'Final out of 20', 'mg.soon': 'Not published yet', 'mg.cefr': 'CEFR level' },
  ar: { 'mg.title': 'نقاطي', 'mg.sub': 'ينشر أستاذك كل علامة عندما تصبح جاهزة.', 'mg.none': 'لم تُنشر نقاط بعد', 'mg.noneText': 'ستظهر هنا بمجرد أن يشاركها أستاذك.', 'mg.final': 'النهائية من 20', 'mg.soon': 'لم تُنشر بعد', 'mg.cefr': 'المستوى' },
});

export default async function mount(root, params, app) {
  app.setTitle(t('mg.title'));
  const s = await api.get('/api/student/summary');
  root.append(pageHead(t('mg.title'), t('mg.sub')), h('div.stack.stack--lg', s.groups.length ? s.groups.map((x) => h('section.stack', h('div.row.row--between', h('h2', x.group.name)),
    h('div.stats', stat({ label: t('mg.final'), value: x.final == null ? '–' : fmtNum(x.final) })),
    x.assessments.length ? sheet(null, h('ul.gradelist', x.assessments.map((a) => h('li', h('div.grow', h('strong', a.title), h('div.muted.small', [t(`skill.${a.skill}`), a.due_at ? fmtDate(a.due_at) : null, `×${a.weight}`].filter(Boolean).join(' · ')), a.feedback ? h('p.small.feedback', a.feedback) : null),
      a.published ? h('div.gradebig', h('span.gradebig__n', a.score == null ? '–' : fmtNum(a.score)), h('span.muted.small', `/ ${a.max_score}${a.cefr ? ` · ${a.cefr}` : ''}`)) : h('span.muted.small', t('mg.soon'))))), null, { flush: true }) : empty(t('mg.none'), t('mg.noneText')))) : [empty(t('mg.none'), t('mg.noneText'))]));
}
