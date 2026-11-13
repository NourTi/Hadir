// Educator side of homework / TD tracking, and the check-in code panel for self roll call.
import { h, icon, empty, toast, chip, field, openModal, confirmDialog } from '../ui.js';
import { t, addStrings, fmtDate } from '../i18n.js';
import { api } from '../api.js';
import { pageHead, stat } from '../kit.js';

addStrings({
  en: {
    'work.title': 'Work', 'work.tab': 'Work', 'work.new': 'New task', 'work.edit': 'Edit task', 'work.none': 'No tasks yet', 'work.noneText': 'Create homework, a TD or a project. Each student gets their own status and mark.',
    'work.kind.homework': 'Homework', 'work.kind.td': 'TD', 'work.kind.project': 'Project', 'work.kind.other': 'Other',
    'work.f.title': 'Title', 'work.f.kind': 'Type', 'work.f.due': 'Due date', 'work.f.max': 'Out of (optional)', 'work.f.details': 'Instructions', 'work.f.notify': 'Tell the students now',
    'work.s.pending': 'Pending', 'work.s.presented': 'Presented', 'work.s.late': 'Late', 'work.s.missing': 'Missing', 'work.s.excused': 'Excused',
    'work.due': 'Due {date}', 'work.noDue': 'No due date', 'work.marked': '{n} marked', 'work.visible': 'Marks shown', 'work.hidden': 'Marks hidden',
    'work.col.student': 'Student', 'work.col.status': 'Status', 'work.col.mark': 'Mark', 'work.col.note': 'Feedback',
    'work.allPresented': 'Mark all pending as presented', 'work.save': 'Save changes', 'work.saved': 'Saved.', 'work.nothing': 'Nothing to save.',
    'work.publish': 'Show marks to students', 'work.unpublish': 'Hide marks', 'work.published': 'Students can now see their marks.', 'work.unpublished': 'Marks hidden.',
    'work.copy': 'Copy to a group', 'work.copyTo': 'Copy to', 'work.copied': 'Task copied. Statuses and marks are not copied.', 'work.delete': 'Delete task', 'work.deleteText': 'This removes the task with all statuses and marks.', 'work.back': 'Back to group',
    'ci.title': 'Check-in code', 'ci.text': 'Students open Hadir and type this code. They are marked present on their own.', 'ci.open': 'Open check-in', 'ci.close': 'Stop check-in', 'ci.expires': 'New code in {n}s', 'ci.needNet': 'Needs a connection', 'ci.note': 'The code changes every 30 seconds. Show it only in the room.',
  },
  ar: {
    'work.title': 'الأعمال', 'work.tab': 'الأعمال', 'work.new': 'مهمة جديدة', 'work.edit': 'تعديل المهمة', 'work.none': 'لا مهام بعد', 'work.noneText': 'أنشئ واجبًا أو حصة أعمال موجّهة أو مشروعًا. لكل طالب حالته ونقطته.',
    'work.kind.homework': 'واجب', 'work.kind.td': 'أعمال موجّهة', 'work.kind.project': 'مشروع', 'work.kind.other': 'أخرى',
    'work.f.title': 'العنوان', 'work.f.kind': 'النوع', 'work.f.due': 'آخر أجل', 'work.f.max': 'من (اختياري)', 'work.f.details': 'التعليمات', 'work.f.notify': 'أعلم الطلبة الآن',
    'work.s.pending': 'قيد الانتظار', 'work.s.presented': 'قدّمه', 'work.s.late': 'متأخر', 'work.s.missing': 'لم يقدّمه', 'work.s.excused': 'معذور',
    'work.due': 'الأجل {date}', 'work.noDue': 'بلا أجل', 'work.marked': '{n} منقّطة', 'work.visible': 'النقاط ظاهرة', 'work.hidden': 'النقاط مخفية',
    'work.col.student': 'الطالب', 'work.col.status': 'الحالة', 'work.col.mark': 'النقطة', 'work.col.note': 'ملاحظة',
    'work.allPresented': 'اعتبر كل المنتظرين قد قدّموا', 'work.save': 'حفظ التغييرات', 'work.saved': 'تم الحفظ.', 'work.nothing': 'لا شيء للحفظ.',
    'work.publish': 'إظهار النقاط للطلبة', 'work.unpublish': 'إخفاء النقاط', 'work.published': 'يمكن للطلبة الآن رؤية نقاطهم.', 'work.unpublished': 'أُخفيت النقاط.',
    'work.copy': 'نسخ إلى فوج', 'work.copyTo': 'نسخ إلى', 'work.copied': 'تم نسخ المهمة. لا تُنسخ الحالات ولا النقاط.', 'work.delete': 'حذف المهمة', 'work.deleteText': 'سيحذف المهمة مع كل الحالات والنقاط.', 'work.back': 'العودة إلى الفوج',
    'ci.title': 'رمز تسجيل الحضور', 'ci.text': 'يفتح الطلبة «حاضر» ويكتبون هذا الرمز، فيُسجَّل حضورهم تلقائيًا.', 'ci.open': 'فتح التسجيل الذاتي', 'ci.close': 'إيقاف التسجيل الذاتي', 'ci.expires': 'رمز جديد خلال {n} ث', 'ci.needNet': 'يتطلب اتصالًا', 'ci.note': 'يتغيّر الرمز كل 30 ثانية. اعرضه داخل القاعة فقط.',
  },
});

export const STATUS_CHIP = { pending: 'none', presented: 'present', late: 'late', missing: 'absent', excused: 'excused' };
export const statusChip = (s) => chip(STATUS_CHIP[s] || 'none', t(`work.s.${s}`));
const KINDS = ['homework', 'td', 'project', 'other'];
const STATUSES = ['pending', 'presented', 'late', 'missing', 'excused'];
const sel = (options, value, onchange, cls = '') => h('select', { class: `input ${cls}`, onchange: (e) => onchange(e.target.value) }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
const endOfDay = (iso) => (iso ? new Date(`${iso}T23:59:00`).getTime() : null);
const isoDay = (ms) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60e3).toISOString().slice(0, 10) : '');

function taskModal(groupId, task, done) {
  const f = {
    title: h('input.input', { value: task?.title || '', maxlength: 140, autofocus: true }),
    kind: sel(KINDS.map((k) => [k, t(`work.kind.${k}`)]), task?.kind || 'homework', () => {}),
    due: h('input.input', { type: 'date', value: isoDay(task?.due_at) }),
    max: h('input.input', { type: 'number', min: 1, max: 1000, step: 0.5, value: task?.max_score ?? '', placeholder: '20' }),
    details: h('textarea.input', { rows: 4, maxlength: 2000 }, task?.details || ''),
    notify: h('input', { type: 'checkbox', checked: true }),
  };
  const err = h('p.form-error', { role: 'alert' });
  openModal({ title: task ? t('work.edit') : t('work.new'), size: 'md',
    body: h('div.stack', field(t('work.f.title'), f.title), h('div.grid2', field(t('work.f.kind'), f.kind), field(t('work.f.due'), f.due)), field(t('work.f.max'), f.max), field(t('work.f.details'), f.details),
      task ? null : h('label.row', f.notify, ' ', t('work.f.notify')), err),
    actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', onClick: async () => {
      err.textContent = '';
      const body = { title: f.title.value, kind: f.kind.value, due_at: endOfDay(f.due.value), max_score: f.max.value === '' ? null : Number(f.max.value), details: f.details.value };
      try { if (task) await api.patch(`/api/tasks/${task.id}`, body); else await api.post(`/api/groups/${groupId}/tasks`, { ...body, notify: f.notify.checked }); } catch (e) { err.textContent = e.message; return false; }
      done();
    } }] });
}

// The tab shown inside a group page.
export function workTab(group) {
  const box = h('div.stack');
  const load = async () => {
    const { tasks } = await api.get(`/api/groups/${group.id}/tasks`);
    box.replaceChildren(
      h('div.row.row--between', h('h2', t('work.title')), h('button.btn.btn--primary', { type: 'button', onclick: () => taskModal(group.id, null, load) }, icon('plus', 16), t('work.new'))),
      tasks.length ? h('ul.ledger-list.worklist', tasks.map((k) => h('li', h('a.worklist__row', { href: `#/work/${k.id}` },
        h('div.grow', h('strong', k.title), h('div.muted.small', [t(`work.kind.${k.kind}`), k.due_at ? t('work.due', { date: fmtDate(k.due_at) }) : t('work.noDue')].join(' · '))),
        h('div.row', k.counts.pending ? h('span.stamp.stamp--none', `${t('work.s.pending')} ${k.counts.pending}`) : null, k.counts.presented + k.counts.late ? chip('present', `${t('work.s.presented')} ${k.counts.presented + k.counts.late}`) : null,
          k.counts.missing ? chip('absent', `${t('work.s.missing')} ${k.counts.missing}`) : null, k.marked ? h('span.muted.small', t('work.marked', { n: k.marked })) : null,
          h('span.muted.small', k.marks_visible ? t('work.visible') : t('work.hidden'))))))) : empty(t('work.none'), t('work.noneText')));
  };
  load().catch((e) => box.replaceChildren(h('p.form-error', e.message)));
  return box;
}

// One task: every student's status, mark and feedback.
export default async function mount(root, params, app) {
  const data = await api.get(`/api/tasks/${params.id}`);
  let { task, group, students } = data;
  app.setTitle(task.title);
  const edits = new Map();
  const edit = (id, patch) => edits.set(id, { ...(edits.get(id) || { student_id: id }), ...patch });
  const out = h('div.stack');

  const draw = () => {
    const rows = students.map((s) => {
      const e = edits.get(s.id) || {};
      const status = e.status ?? s.status;
      return h('tr', h('td', h('strong', s.full_name), h('div.muted.small.ltr', s.university_id)),
        h('td', sel(STATUSES.map((k) => [k, t(`work.s.${k}`)]), status, (v) => { edit(s.id, { status: v }); }, 'input--sm')),
        h('td', h('input.input.input--sm.ltr', { type: 'number', step: 0.25, min: 0, max: task.max_score ?? 1000, value: e.score !== undefined ? e.score : (s.score ?? ''), 'aria-label': t('work.col.mark'), style: { width: '5.5rem' },
          oninput: (ev) => edit(s.id, { score: ev.target.value === '' ? null : Number(ev.target.value) }) }), task.max_score ? h('span.muted.small', ` / ${task.max_score}`) : null),
        h('td', h('input.input.input--sm', { value: e.feedback !== undefined ? e.feedback : s.feedback, maxlength: 600, 'aria-label': t('work.col.note'), oninput: (ev) => edit(s.id, { feedback: ev.target.value }) })));
    });
    const c = Object.fromEntries(STATUSES.map((k) => [k, students.filter((s) => (edits.get(s.id)?.status ?? s.status) === k).length]));
    out.replaceChildren(
      h('p.small', h('a.link', { href: `#/classes/${group.id}` }, '← ', t('work.back'))),
      pageHead(task.title, [t(`work.kind.${task.kind}`), group.name, task.due_at ? t('work.due', { date: fmtDate(task.due_at) }) : t('work.noDue')].join(' · '),
        h('button.btn.btn--ghost', { type: 'button', onclick: () => taskModal(group.id, task, () => reload()) }, icon('edit', 16), t('work.edit')),
        h('button.btn.btn--ghost', { type: 'button', onclick: copyTask }, icon('copy', 16), t('work.copy')),
        h('button.btn.btn--ghost', { type: 'button', onclick: async () => { if (await confirmDialog({ title: t('work.delete'), message: t('work.deleteText'), confirmLabel: t('common.delete'), danger: true })) { await api.del(`/api/tasks/${task.id}`); app.go(`/classes/${group.id}`); } } }, icon('trash', 16), t('work.delete'))),
      task.details ? h('p.muted', { style: { whiteSpace: 'pre-wrap' } }, task.details) : null,
      h('div.stats', STATUSES.map((k) => stat({ label: t(`work.s.${k}`), value: c[k] }))),
      h('div.row', h('button.btn.btn--ghost', { type: 'button', onclick: async () => { await api.put(`/api/tasks/${task.id}/students`, { all: 'presented' }); toast(t('work.saved'), 'ok'); reload(); } }, icon('check', 16), t('work.allPresented')),
        h('button.btn.btn--primary', { type: 'button', onclick: save }, t('work.save')),
        h('button.btn.btn--ghost', { type: 'button', onclick: toggle }, icon('eye', 16), task.marks_visible ? t('work.unpublish') : t('work.publish'))),
      h('p.muted.small', task.marks_visible ? t('work.visible') : t('work.hidden')),
      h('div.sheet', h('div.table-wrap', h('table.ledger', h('thead', h('tr', ['student', 'status', 'mark', 'note'].map((k) => h('th', t(`work.col.${k}`))))), h('tbody', rows)))));
  };
  async function reload() { const d = await api.get(`/api/tasks/${task.id}`); task = d.task; students = d.students; edits.clear(); draw(); }
  async function save() {
    if (!edits.size) { toast(t('work.nothing')); return; }
    try { await api.put(`/api/tasks/${task.id}/students`, { items: [...edits.values()] }); toast(t('work.saved'), 'ok'); await reload(); } catch (e) { toast(e.message, 'bad'); }
  }
  async function toggle() {
    if (edits.size) await save();
    const r = await api.post(`/api/tasks/${task.id}/publish`, { visible: !task.marks_visible });
    toast(r.marks_visible ? t('work.published') : t('work.unpublished'), 'ok'); reload();
  }
  async function copyTask() {
    const { groups } = await api.get('/api/groups');
    let target = group.id;
    openModal({ title: t('work.copy'), body: field(t('work.copyTo'), sel(groups.map((g) => [g.id, g.name]), target, (v) => { target = v; })),
      actions: [{ label: t('common.cancel') }, { label: t('work.copy'), kind: 'primary', onClick: async () => { await api.post(`/api/tasks/${task.id}/copy`, { group_id: target }); toast(t('work.copied'), 'ok'); } }] });
  }
  root.append(out); draw();
}

// Panel for the scan screen: open check-in, show the rotating 6-digit code.
export function checkinPanel(sessionId) {
  const code = h('div.checkin__code.ltr', '------'); const sub = h('div.muted.small'); const btn = h('button.btn.btn--ghost', { type: 'button' });
  const box = h('div.sheet.checkin', h('div.sheet__body.stack', h('div.row.row--between', h('strong', t('ci.title')), btn), h('p.muted.small', t('ci.text')), code, sub, h('p.muted.small', t('ci.note'))));
  let open = false, left = 0, timer = null;
  const paint = () => {
    btn.textContent = open ? t('ci.close') : t('ci.open'); code.hidden = !open; sub.hidden = !open;
    if (open) sub.textContent = t('ci.expires', { n: left });
  };
  const poll = async () => {
    try { const r = await api.get(`/api/sessions/${sessionId}/checkin`); open = r.open; left = r.expires_in; code.textContent = r.code ? `${r.code.slice(0, 3)} ${r.code.slice(3)}` : '------'; paint(); } catch { sub.hidden = false; sub.textContent = t('ci.needNet'); }
  };
  btn.onclick = async () => { try { await api.post(`/api/sessions/${sessionId}/checkin`, { open: !open }); await poll(); } catch (e) { toast(e.message, 'bad'); } };
  timer = setInterval(() => { if (!box.isConnected) { clearInterval(timer); return; } if (open) { left = Math.max(0, left - 1); if (left <= 0) poll(); else paint(); } }, 1000);
  poll();
  return box;
}
