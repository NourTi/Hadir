// Gradebook: weighted assessments, scores out of each maximum, CEFR level and feedback, and an out-of-20 final grade.
import { h, icon, toast, openModal, confirmDialog, empty, chip, field } from '../ui.js';
import { t, addStrings, fmtDate, fmtNum } from '../i18n.js';
import { api } from '../api.js';
import { pageHead, sheet, tabs, select, groupPicker, avatar } from '../kit.js';

const SKILLS = ['general', 'writing', 'speaking', 'reading', 'listening', 'grammar', 'vocabulary', 'exam'];
const CEFR = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

addStrings({
  en: {
    'gr.title': 'Grades', 'gr.sub': 'Scores, CEFR levels and feedback. Students see a grade only after you publish it.', 'gr.noGroups': 'No groups yet', 'gr.noGroupsText': 'Create a group and add students before entering grades.',
    'gr.overview': 'Overview', 'gr.new': 'New assessment', 'gr.noAssess': 'No assessments yet', 'gr.noAssessText': 'Add a quiz, an essay or an exam. Each has a weight and a maximum score.',
    'gr.final': 'Final /20', 'gr.finalHint': 'Weighted average of the scores entered so far, out of 20.', 'gr.published': 'Published', 'gr.draft': 'Draft', 'gr.publish': 'Publish to students', 'gr.unpublish': 'Hide from students',
    'gr.save': 'Save scores', 'gr.saved': '{n} scores saved.', 'gr.nothing': 'No changes to save.', 'gr.published.ok': 'Published. Students were notified.', 'gr.unpublished.ok': 'Hidden from students.',
    'gr.f.title': 'Title', 'gr.f.skill': 'Skill', 'gr.f.weight': 'Weight', 'gr.f.max': 'Maximum score', 'gr.f.due': 'Due date', 'gr.f.weightHint': 'Counts in proportion to the other weights.',
    'gr.edit': 'Edit', 'gr.deleteTitle': 'Delete this assessment?', 'gr.deleteText': 'Every score entered for {title} is removed. This cannot be undone.',
    'gr.col.score': 'Score /{max}', 'gr.col.cefr': 'CEFR', 'gr.col.feedback': 'Feedback', 'gr.feedbackPh': 'A short comment the student will read', 'gr.meta': 'Weight {w} · out of {m}', 'gr.created': 'Assessment added.', 'gr.updated': 'Assessment saved.',
    
  },
  ar: {
    'gr.title': 'النقاط', 'gr.sub': 'العلامات ومستويات الإطار الأوروبي والملاحظات. لا يرى الطالب علامته إلا بعد نشرها.', 'gr.noGroups': 'لا توجد أفواج بعد', 'gr.noGroupsText': 'أنشئ فوجًا وأضف طلبته قبل إدخال النقاط.',
    'gr.overview': 'نظرة عامة', 'gr.new': 'تقييم جديد', 'gr.noAssess': 'لا توجد تقييمات بعد', 'gr.noAssessText': 'أضف اختبارًا قصيرًا أو مقالًا أو امتحانًا. لكل تقييم معامل وعلامة قصوى.',
    'gr.final': 'النهائية /20', 'gr.finalHint': 'المعدل المرجَّح للعلامات المدخلة إلى الآن، من 20.', 'gr.published': 'منشور', 'gr.draft': 'مسودة', 'gr.publish': 'نشر للطلبة', 'gr.unpublish': 'إخفاء عن الطلبة',
    'gr.save': 'حفظ العلامات', 'gr.saved': 'تم حفظ {n} علامات.', 'gr.nothing': 'لا توجد تغييرات للحفظ.', 'gr.published.ok': 'تم النشر. أُشعر الطلبة.', 'gr.unpublished.ok': 'تم الإخفاء عن الطلبة.',
    'gr.f.title': 'العنوان', 'gr.f.skill': 'المهارة', 'gr.f.weight': 'المعامل', 'gr.f.max': 'العلامة القصوى', 'gr.f.due': 'تاريخ التسليم', 'gr.f.weightHint': 'يُحتسب بالنسبة إلى بقية المعاملات.',
    'gr.edit': 'تعديل', 'gr.deleteTitle': 'حذف هذا التقييم؟', 'gr.deleteText': 'ستُحذف كل علامات «{title}». لا يمكن التراجع عن ذلك.',
    'gr.col.score': 'العلامة /{max}', 'gr.col.cefr': 'المستوى', 'gr.col.feedback': 'ملاحظة', 'gr.feedbackPh': 'تعليق قصير يقرؤه الطالب', 'gr.meta': 'المعامل {w} · من {m}', 'gr.created': 'تمت إضافة التقييم.', 'gr.updated': 'تم حفظ التقييم.',
    
  },
});

export default async function mount(root, params, app) {
  app.setTitle(t('gr.title'));
  const { groups } = await api.get('/api/groups');
  if (!groups.length) { root.append(pageHead(t('gr.title'), t('gr.sub')), empty(t('gr.noGroups'), t('gr.noGroupsText'), h('a.btn.btn--primary', { href: '#/classes' }, t('cls.new')))); return; }
  const gid = groups.some((g) => g.id === params.id) ? params.id : groups[0].id;
  if (params.id !== gid) { app.go(`/grades/${gid}`); return; }
  let book = await api.get(`/api/groups/${gid}/gradebook`);
  let tab = 'overview';
  const edits = new Map(); // `${assessmentId}:${studentId}` -> row
  const holder = h('div.stack');

  const reload = async () => { book = await api.get(`/api/groups/${gid}/gradebook`); edits.clear(); draw(); };
  const assessmentModal = (a) => {
    const f = { title: h('input.input', { type: 'text', value: a?.title || '', maxlength: 100, required: true }), weight: h('input.input', { type: 'number', value: a?.weight ?? 1, min: 0.1, step: 'any' }), max: h('input.input', { type: 'number', value: a?.max_score ?? 20, min: 1, step: 'any' }),
      due: h('input.input', { type: 'date', value: a?.due_at ? new Date(a.due_at).toISOString().slice(0, 10) : '' }) };
    let skill = a?.skill || 'general'; const err = h('p.form-error', { role: 'alert' });
    openModal({ title: a ? t('gr.edit') : t('gr.new'), size: 'sm', body: [field(t('gr.f.title'), f.title), field(t('gr.f.skill'), select(SKILLS.map((s) => [s, t(`skill.${s}`)]), skill, (v) => { skill = v; })),
      h('div.form-grid', field(t('gr.f.weight'), f.weight, t('gr.f.weightHint')), field(t('gr.f.max'), f.max)), field(t('gr.f.due'), f.due), err],
    actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', onClick: async () => {
      const body = { title: f.title.value, skill, weight: Number(f.weight.value), max_score: Number(f.max.value), due_at: f.due.value ? new Date(`${f.due.value}T12:00:00`).getTime() : null };
      try { if (a) await api.patch(`/api/assessments/${a.id}`, body); else await api.post(`/api/groups/${gid}/assessments`, body); toast(t(a ? 'gr.updated' : 'gr.created'), 'ok'); await reload(); } catch (e) { err.textContent = e.message; return false; }
    } }] });
  };

  const overview = () => (!book.assessments.length ? empty(t('gr.noAssess'), t('gr.noAssessText'), h('button.btn.btn--primary', { type: 'button', onclick: () => assessmentModal(null) }, icon('plus', 16), t('gr.new')))
    : sheet(null, h('table.ledger.gradegrid', h('thead', h('tr', h('th', t('common.student')), book.assessments.map((a) => h('th.num', { title: a.title }, a.title)), h('th.num', t('gr.final')))),
      h('tbody', book.students.map((s) => h('tr', h('td', h('div.person', avatar(s.full_name), h('div', h('div.person__name', s.full_name), h('div.person__id.ltr', s.university_id)))),
        book.assessments.map((a) => { const g = s.grades[a.id]; return h('td.num', g?.score == null ? h('span.muted', '–') : fmtNum(g.score)); }),
        h('td.num', h('span', { class: `final ${s.final != null && s.final < 10 ? 'final--low' : ''}` }, s.final == null ? '–' : fmtNum(s.final))))))), null, { flush: true }));

  const assessmentView = (a) => {
    const rows = book.students.map((s) => ({ s, g: s.grades[a.id] || {} }));
    const inputs = rows.map(({ s, g }) => {
      const key = `${a.id}:${s.id}`; const cur = { student_id: s.id, score: g.score ?? '', cefr: g.cefr || '', feedback: g.feedback || '' };
      const touch = (patch) => { Object.assign(cur, patch); edits.set(key, { ...cur }); save.disabled = false; };
      return h('tr', h('td', h('div.person', avatar(s.full_name), h('div', h('div.person__name', s.full_name), h('div.person__id.ltr', s.university_id)))),
        h('td.num', h('input.input.input--sm.scoreinput', { type: 'number', min: 0, max: a.max_score, step: 'any', value: cur.score, 'aria-label': `${s.full_name} ${t('gr.col.score', { max: a.max_score })}`, oninput: (e) => touch({ score: e.target.value }) })),
        h('td', select(CEFR.map((c) => [c, c || '–']), cur.cefr, (v) => touch({ cefr: v }), { cls: 'input--sm', label: t('gr.col.cefr') })),
        h('td', h('input.input.input--sm', { type: 'text', maxlength: 600, value: cur.feedback, placeholder: t('gr.feedbackPh'), 'aria-label': t('gr.col.feedback'), oninput: (e) => touch({ feedback: e.target.value }) })));
    });
    const save = h('button.btn.btn--primary', { type: 'button', disabled: true, onclick: async () => {
      const list = [...edits.entries()].filter(([k]) => k.startsWith(`${a.id}:`)).map(([, v]) => v);
      if (!list.length) { toast(t('gr.nothing')); return; }
      try { const r = await api.put(`/api/assessments/${a.id}/grades`, { grades: list }); toast(t('gr.saved', { n: r.saved }), 'ok'); await reload(); } catch (e) { toast(e.message, 'error'); }
    } }, icon('check', 16), t('gr.save'));
    return h('div.stack',
      h('div.row.row--between', h('div', h('h2', a.title), h('p.muted.small', [t(`skill.${a.skill}`), t('gr.meta', { w: a.weight, m: a.max_score }), a.due_at ? fmtDate(a.due_at) : null].filter(Boolean).join(' · '))),
        h('div.row', chip(a.published ? 'present' : 'late', t(a.published ? 'gr.published' : 'gr.draft')),
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: async () => { await api.post(`/api/assessments/${a.id}/publish`, { published: !a.published }); toast(t(a.published ? 'gr.unpublished.ok' : 'gr.published.ok'), 'ok'); await reload(); } }, icon(a.published ? 'x' : 'send', 15), t(a.published ? 'gr.unpublish' : 'gr.publish')),
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => assessmentModal(a) }, icon('edit', 15), t('gr.edit')),
          h('button.icon-btn', { type: 'button', 'aria-label': t('common.delete'), onclick: async () => { if (await confirmDialog({ title: t('gr.deleteTitle'), message: t('gr.deleteText', { title: a.title }), confirmLabel: t('common.delete'), danger: true })) { await api.del(`/api/assessments/${a.id}`); tab = 'overview'; await reload(); } } }, icon('trash', 18)))),
      sheet(null, h('table.ledger.gradegrid', h('thead', h('tr', h('th', t('common.student')), h('th.num', t('gr.col.score', { max: a.max_score })), h('th', t('gr.col.cefr')), h('th', t('gr.col.feedback')))), h('tbody', inputs)), null, { flush: true }),
      h('div.row.row--end', save));
  };

  function draw() {
    const items = [{ id: 'overview', label: t('gr.overview') }, ...book.assessments.map((a) => ({ id: a.id, label: a.title }))];
    if (!items.some((i) => i.id === tab)) tab = 'overview';
    holder.replaceChildren(h('div.row.row--between', tabs(items, tab, (x) => { tab = x; draw(); }), h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => assessmentModal(null) }, icon('plus', 15), t('gr.new'))),
      ...(tab === 'overview' ? [overview(), book.assessments.length ? h('p.muted.small', t('gr.finalHint')) : null] : [assessmentView(book.assessments.find((a) => a.id === tab))]));
  }
  root.append(pageHead(t('gr.title'), t('gr.sub'), groupPicker(groups, gid, (v) => app.go(`/grades/${v}`))), holder);
  draw();
}
