// Reports: the attendance register for a group (every session by every student), and a list of students who need attention.
import { h, icon, empty, chip, flagChip, downloadBlob, toCsv } from '../ui.js';
import { t, addStrings, fmtShort, fmtDateTime, fmtNum } from '../i18n.js';
import { api } from '../api.js';
import { fullName, institutionLine } from '../educator.js';
import { pageHead, sheet, tabs, groupPicker, rateText, printPage, avatar } from '../kit.js';

addStrings({
  en: {
    'rp.title': 'Reports', 'rp.sub': 'The register for a whole group, and the students who need a conversation.', 'rp.register': 'Register', 'rp.atRisk': 'Needs attention',
    'rp.noGroups': 'No groups yet', 'rp.noGroupsText': 'Reports appear once you have a group with closed sessions.', 'rp.noSessions': 'No sessions yet', 'rp.noSessionsText': 'Run a roll call and the register fills in by itself.',
    'rp.csv': 'Download CSV', 'rp.rate': 'Rate', 'rp.abs': 'Abs.', 'rp.legend': 'Present, late, absent, excused, not marked', 'rp.generated': '{group} · generated {time} by {teacher}',
    'rp.none': 'Everyone is on track', 'rp.noneText': 'No student is below your attendance limit or failing right now.', 'rp.col.student': 'Student', 'rp.col.group': 'Group', 'rp.col.abs': 'Absences', 'rp.col.rate': 'Attendance', 'rp.col.final': 'Final /20', 'rp.lowGrade': 'Low grade',
    'rp.open': 'Open report',
  },
  ar: {
    'rp.title': 'التقارير', 'rp.sub': 'سجل الفوج كاملًا، والطلبة الذين يحتاجون إلى حديث معك.', 'rp.register': 'السجل', 'rp.atRisk': 'يحتاجون انتباهًا',
    'rp.noGroups': 'لا توجد أفواج بعد', 'rp.noGroupsText': 'تظهر التقارير عندما يكون لديك فوج فيه حصص مغلقة.', 'rp.noSessions': 'لا توجد حصص بعد', 'rp.noSessionsText': 'ابدأ تسجيل الحضور وسيمتلئ السجل تلقائيًا.',
    'rp.csv': 'تنزيل CSV', 'rp.rate': 'النسبة', 'rp.abs': 'غياب', 'rp.legend': 'حاضر، متأخر، غائب، مبرَّر، غير مسجَّل', 'rp.generated': '{group} · أُنشئ {time} بواسطة {teacher}',
    'rp.none': 'الجميع على الطريق الصحيح', 'rp.noneText': 'لا يوجد طالب تحت حد الحضور أو راسب حاليًا.', 'rp.col.student': 'الطالب', 'rp.col.group': 'الفوج', 'rp.col.abs': 'الغيابات', 'rp.col.rate': 'الحضور', 'rp.col.final': 'النهائية /20', 'rp.lowGrade': 'علامة ضعيفة',
    'rp.open': 'فتح التقرير',
  },
});

export default async function mount(root, params, app) {
  app.setTitle(t('rp.title'));
  const { groups } = await api.get('/api/groups');
  let tab = params.id === 'risk' ? 'risk' : 'register';
  const holder = h('div.stack');
  if (!groups.length) { root.append(pageHead(t('rp.title'), t('rp.sub')), empty(t('rp.noGroups'), t('rp.noGroupsText'), h('a.btn.btn--primary', { href: '#/classes' }, t('cls.new')))); return; }
  let gid = groups.some((g) => g.id === params.id) ? params.id : groups[0].id;
  let reg = null, risk = null;

  const loadReg = async () => { reg = await api.get(`/api/reports/group/${gid}`); };

  const registerView = () => {
    if (!reg.sessions.length) return empty(t('rp.noSessions'), t('rp.noSessionsText'));
    const csv = () => toCsv([[t('common.student'), 'ID', ...reg.sessions.map((s) => new Date(s.starts_at).toISOString().slice(0, 10)), t('rp.rate'), t('rp.abs')],
      ...reg.students.map((s) => [s.full_name, s.university_id, ...reg.sessions.map((x) => (s.marks[x.id] ? t(`status.${s.marks[x.id]}`) : '')), s.stats?.rate == null ? '' : Math.round(s.stats.rate * 100) + '%', s.stats?.absences ?? 0])]);
    return h('div.stack',
      h('div.row.row--end.no-print', h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => downloadBlob(new Blob([csv()], { type: 'text/csv;charset=utf-8' }), `register-${reg.group.name}.csv`) }, icon('download', 15), t('rp.csv')),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: printPage }, icon('print', 15), t('common.print'))),
      sheet(null, h('div.matrix-wrap', h('table.ledger.matrix', h('thead', h('tr', h('th.sticky', t('common.student')), reg.sessions.map((s) => h('th.mcol', { title: `${fmtDateTime(s.starts_at)}${s.topic ? ` · ${s.topic}` : ''}` }, h('a', { href: `#/session/${s.id}` }, fmtShort(s.starts_at)))), h('th.num', t('rp.rate')), h('th.num', t('rp.abs')))),
        h('tbody', reg.students.map((s) => h('tr', h('td.sticky', h('a.person', { href: `#/student/${s.id}` }, avatar(s.full_name), h('span.person__name', s.full_name))),
          reg.sessions.map((x) => { const m = s.marks[x.id]; return h('td.mcell', h('span', { class: `sdot sdot--${m || 'none'}`, title: m ? t(`status.${m}`) : t('status.none') })); }),
          h('td.num', rateText(s.stats?.rate)), h('td.num', h('span', { class: s.flag === 'risk' ? 'text-absent' : '' }, s.stats?.absences ?? 0))))))), null, { flush: true }),
      h('p.muted.small', t('rp.legend')),
      h('p.muted.small.print-only', [institutionLine(app.user.profile), t('rp.generated', { group: reg.group.name, time: fmtDateTime(reg.generated_at), teacher: fullName(app.user) })].filter(Boolean).join(' — ')));
  };

  const riskView = () => (!risk.rows.length ? empty(t('rp.none'), t('rp.noneText'))
    : sheet(null, h('table.ledger', h('thead', h('tr', h('th', t('rp.col.student')), h('th', t('rp.col.group')), h('th.num', t('rp.col.abs')), h('th.num', t('rp.col.rate')), h('th.num', t('rp.col.final')), h('th'))),
      h('tbody', risk.rows.map((r) => h('tr', h('td', h('div.person', avatar(r.full_name), h('div', h('div.person__name', r.full_name), h('div.person__id.ltr', r.university_id)))), h('td', r.group_name),
        h('td.num', r.absences), h('td.num', rateText(r.rate)), h('td.num', r.final == null ? '–' : h('span', { class: r.low_grade ? 'text-absent' : '' }, fmtNum(r.final))),
        h('td', h('div.row', r.flag !== 'ok' ? flagChip(r.flag) : null, r.low_grade ? chip('late', t('rp.lowGrade')) : null, h('a.btn.btn--ghost.btn--sm', { href: `#/student/${r.student_id}` }, t('rp.open')))))))), null, { flush: true }));

  async function draw() {
    if (tab === 'risk') { risk ||= await api.get('/api/reports/at-risk'); } else if (!reg || reg.group.id !== gid) await loadReg();
    holder.replaceChildren(tabs([{ id: 'register', label: t('rp.register') }, { id: 'risk', label: t('rp.atRisk') }], tab, (x) => { tab = x; draw(); }), tab === 'risk' ? riskView() : registerView());
  }
  root.append(pageHead(t('rp.title'), t('rp.sub'), groupPicker(groups, gid, (v) => { gid = v; reg = null; draw(); })), holder);
  await draw();
}
