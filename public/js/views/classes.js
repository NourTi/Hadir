// Classes: your groups, their students (roster import, invite codes), and their sessions.
import { h, icon, toast, openModal, confirmDialog, empty, chip, flagChip, field, loading, downloadBlob, toCsv } from '../ui.js';
import { t, addStrings, lang, fmtPct, fmtDateTime } from '../i18n.js';
import { api } from '../api.js';
import { pageHead, sheet, tabs, select, avatar, parseRoster, rateText, subjectList } from '../kit.js';
import { startOrResume } from '../offline.js';

addStrings({
  en: {
    'cls.title': 'Classes', 'cls.sub': 'Your groups, their students and their sessions.', 'cls.new': 'New group', 'cls.emptyTitle': 'No groups yet', 'cls.emptyText': 'Create your first group, then import its students from a spreadsheet.',
    'cls.students': 'Students', 'cls.rate': 'Attendance', 'cls.risk': 'At risk', 'cls.sessions': 'Sessions', 'cls.edit': 'Edit group', 'cls.import': 'Import students', 'cls.start': 'Start roll call', 'cls.archive': 'Archive group',
    'cls.archiveText': '{name} will be hidden from your lists. Its records are kept.', 'cls.archived': 'Group archived.', 'cls.tab.roster': 'Students', 'cls.tab.sessions': 'Sessions',
    'cls.f.name': 'Group name', 'cls.f.namePh': 'Group B2', 'cls.f.course': 'Course', 'cls.f.coursePh': 'Academic Writing', 'cls.f.code': 'Course code', 'cls.f.semester': 'Semester', 'cls.f.year': 'Year',
    'cls.f.schedule': 'Weekly schedule', 'cls.f.addSlot': 'Add a slot', 'cls.f.late': 'Late after (minutes)', 'cls.f.close': 'Scanning closes after (minutes)', 'cls.f.warn': 'Warn at absences', 'cls.f.notice': 'Formal notice at absences',
    'cls.f.room': 'Room', 'cls.f.limits': 'Limits', 'cls.f.limitsHint': 'These set when a scan counts as late, when scanning stops, and when a student is flagged.',
    'cls.created': 'Group created.', 'cls.saved': 'Group saved.',
    'cls.col.student': 'Student', 'cls.col.account': 'Account', 'cls.col.rate': 'Attendance', 'cls.col.abs': 'Absences', 'cls.col.flag': 'Status', 'cls.col.phones': 'Phones',
    'cls.active': 'Joined', 'cls.invited': 'Invite code', 'cls.noPhone': 'None', 'cls.phones': '{ok} ready, {wait} waiting', 'cls.newCode': 'New invite code', 'cls.card': 'Student report', 'cls.remove': 'Remove from group',
    'cls.removeText': '{name} will leave this group. Their past attendance stays in the records.', 'cls.removed': 'Student removed.', 'cls.codeTitle': 'Invite code for {name}', 'cls.codeText': 'Give the student this code. It works once, with their student ID, at Join a class.',
    'cls.noStudents': 'No students yet', 'cls.noStudentsText': 'Import a list from Excel or paste it here. Each student gets an invite code to join from their phone.',
    'imp.title': 'Import students', 'imp.text': 'Paste rows from Excel or upload a CSV file. Columns: student ID, full name, then optionally email, phone and Telegram. A header row is fine.',
    'imp.paste': 'Paste the list here', 'imp.file': 'Choose a CSV file', 'imp.preview': '{n} students ready to add', 'imp.invalid': '{n} rows skipped: missing or invalid ID or name', 'imp.add': 'Add {n} students', 'imp.nothing': 'Nothing to add yet',
    'imp.doneTitle': 'Students added', 'imp.done': '{created} new, {existing} already known, {dup} already in this group.', 'imp.invites': 'Invite codes to hand out', 'imp.copy': 'Copy list', 'imp.csv': 'Download CSV', 'imp.none': 'Everyone already has an account.',
    'imp.note': 'Students join at the app with their ID and code. Codes can be reissued any time.',
    'cls.noSessions': 'No sessions yet', 'cls.noSessionsText': 'Start a roll call and it will appear here.',
    'cls.s.when': 'When', 'cls.s.topic': 'Topic', 'cls.s.status': 'Status', 'cls.s.open': 'Open', 'cls.s.closed': 'Closed',
    'day.0': 'Sunday', 'day.1': 'Monday', 'day.2': 'Tuesday', 'day.3': 'Wednesday', 'day.4': 'Thursday', 'day.5': 'Friday', 'day.6': 'Saturday',
  },
  ar: {
    'cls.title': 'الأفواج', 'cls.sub': 'أفواجك وطلبتها وحصصها.', 'cls.new': 'فوج جديد', 'cls.emptyTitle': 'لا توجد أفواج بعد', 'cls.emptyText': 'أنشئ فوجك الأول ثم استورد طلبته من ملف جدول.',
    'cls.students': 'الطلبة', 'cls.rate': 'الحضور', 'cls.risk': 'مهدَّدون', 'cls.sessions': 'الحصص', 'cls.edit': 'تعديل الفوج', 'cls.import': 'استيراد الطلبة', 'cls.start': 'ابدأ الحضور', 'cls.archive': 'أرشفة الفوج',
    'cls.archiveText': 'سيُخفى {name} من قوائمك. تبقى سجلاته محفوظة.', 'cls.archived': 'تمت أرشفة الفوج.', 'cls.tab.roster': 'الطلبة', 'cls.tab.sessions': 'الحصص',
    'cls.f.name': 'اسم الفوج', 'cls.f.namePh': 'الفوج 2', 'cls.f.course': 'المقياس', 'cls.f.coursePh': 'الكتابة الأكاديمية', 'cls.f.code': 'رمز المقياس', 'cls.f.semester': 'السداسي', 'cls.f.year': 'السنة',
    'cls.f.schedule': 'الجدول الأسبوعي', 'cls.f.addSlot': 'إضافة حصة', 'cls.f.late': 'التأخر بعد (دقيقة)', 'cls.f.close': 'يُغلق المسح بعد (دقيقة)', 'cls.f.warn': 'تنبيه عند عدد الغيابات', 'cls.f.notice': 'إنذار رسمي عند عدد الغيابات',
    'cls.f.room': 'القاعة', 'cls.f.limits': 'الحدود', 'cls.f.limitsHint': 'تحدد متى يُحتسب المسح تأخرًا، ومتى يتوقف المسح، ومتى يُوسَم الطالب.',
    'cls.created': 'تم إنشاء الفوج.', 'cls.saved': 'تم حفظ الفوج.',
    'cls.col.student': 'الطالب', 'cls.col.account': 'الحساب', 'cls.col.rate': 'الحضور', 'cls.col.abs': 'الغيابات', 'cls.col.flag': 'الحالة', 'cls.col.phones': 'الهواتف',
    'cls.active': 'منضم', 'cls.invited': 'رمز الدعوة', 'cls.noPhone': 'لا يوجد', 'cls.phones': '{ok} جاهز، {wait} في الانتظار', 'cls.newCode': 'رمز دعوة جديد', 'cls.card': 'تقرير الطالب', 'cls.remove': 'إزالة من الفوج',
    'cls.removeText': 'سيغادر {name} هذا الفوج. يبقى حضوره السابق في السجلات.', 'cls.removed': 'تمت إزالة الطالب.', 'cls.codeTitle': 'رمز دعوة {name}', 'cls.codeText': 'أعطِ الطالب هذا الرمز. يعمل مرة واحدة مع رقمه الجامعي في «الانضمام إلى فوج».',
    'cls.noStudents': 'لا يوجد طلبة بعد', 'cls.noStudentsText': 'استورد قائمة من Excel أو الصقها هنا. يحصل كل طالب على رمز دعوة للانضمام من هاتفه.',
    'imp.title': 'استيراد الطلبة', 'imp.text': 'الصق صفوفًا من Excel أو ارفع ملف CSV. الأعمدة: الرقم الجامعي، الاسم الكامل، ثم اختياريًا البريد والهاتف وتيليغرام. يمكن أن يبدأ الملف بسطر عناوين.',
    'imp.paste': 'الصق القائمة هنا', 'imp.file': 'اختر ملف CSV', 'imp.preview': '{n} طلبة جاهزون للإضافة', 'imp.invalid': 'تم تجاوز {n} صفوف: رقم أو اسم ناقص أو غير صالح', 'imp.add': 'إضافة {n} طلبة', 'imp.nothing': 'لا شيء للإضافة بعد',
    'imp.doneTitle': 'تمت إضافة الطلبة', 'imp.done': '{created} جدد، {existing} معروفون سابقًا، {dup} موجودون في هذا الفوج.', 'imp.invites': 'رموز الدعوة للتوزيع', 'imp.copy': 'نسخ القائمة', 'imp.csv': 'تنزيل CSV', 'imp.none': 'لدى الجميع حساب بالفعل.',
    'imp.note': 'ينضم الطلبة من التطبيق برقمهم الجامعي ورمزهم. يمكن إصدار الرموز من جديد في أي وقت.',
    'cls.noSessions': 'لا توجد حصص بعد', 'cls.noSessionsText': 'ابدأ تسجيل الحضور وستظهر الحصة هنا.',
    'cls.s.when': 'التاريخ', 'cls.s.topic': 'الموضوع', 'cls.s.status': 'الحالة', 'cls.s.open': 'مفتوحة', 'cls.s.closed': 'مغلقة',
    'day.0': 'الأحد', 'day.1': 'الإثنين', 'day.2': 'الثلاثاء', 'day.3': 'الأربعاء', 'day.4': 'الخميس', 'day.5': 'الجمعة', 'day.6': 'السبت',
  },
});

const slotText = (g) => (g.schedule || []).map((s) => `${t(`day.${s.day}`).slice(0, lang() === 'ar' ? 99 : 3)} ${s.start}`).join(' · ');

export default async function mount(root, params, app) {
  if (params.id) return detail(root, params.id, app);
  app.setTitle(t('cls.title'));
  const { groups } = await api.get('/api/groups');
  const draw = (list) => {
    root.replaceChildren(pageHead(t('cls.title'), t('cls.sub'), h('button.btn.btn--primary', { type: 'button', onclick: () => groupModal(null, async (g) => { toast(t('cls.created'), 'ok'); app.go(`/classes/${g.id}`); }) }, icon('plus', 18), t('cls.new'))),
      list.length ? h('div.groupgrid', list.map((g) => h('a.gcard', { href: `#/classes/${g.id}` },
        h('div', h('h3', g.name), h('p.gcard__meta', [g.course_name, g.code].filter(Boolean).join(' · ')), h('p.gcard__meta', slotText(g))),
        h('div.gcard__nums', h('div.gcard__num', h('b', g.students), h('span', t('cls.students'))), h('div.gcard__num', h('b', rateText(g.rate)), h('span', t('cls.rate'))), h('div.gcard__num', h('b', { style: { color: g.at_risk ? 'var(--absent)' : '' } }, g.at_risk), h('span', t('cls.risk'))), h('div.gcard__num', h('b', g.closed_sessions), h('span', t('cls.sessions'))))))) : empty(t('cls.emptyTitle'), t('cls.emptyText')));
  };
  draw(groups);
}

// ---------- group form ----------
export function groupModal(group, onSaved) {
  const g = group || { name: '', course_name: '', code: '', semester: 1, year: new Date().getFullYear(), schedule: [], late_after_min: 15, close_after_min: 45, absence_warn: 2, absence_notice: 3 };
  const slots = (g.schedule || []).map((s) => ({ ...s }));
  const inp = (name, v, type = 'text', extra = {}) => h('input.input', { name, type, value: v ?? '', ...extra });
  const f = { name: inp('name', g.name, 'text', { required: true, placeholder: t('cls.f.namePh'), maxlength: 80 }), course: inp('course', g.course_name, 'text', { placeholder: t('cls.f.coursePh'), maxlength: 80, list: subjectList() }), code: inp('code', g.code, 'text', { maxlength: 30, dir: 'ltr' }),
    year: inp('year', g.year, 'number', { min: 2000, max: 2100 }), late: inp('late', g.late_after_min, 'number', { min: 0, max: 120 }), close: inp('close', g.close_after_min, 'number', { min: 5, max: 240 }),
    warn: inp('warn', g.absence_warn, 'number', { min: 1, max: 20 }), notice: inp('notice', g.absence_notice, 'number', { min: 1, max: 20 }) };
  let semester = g.semester;
  const slotBox = h('div.slots');
  const paintSlots = () => slotBox.replaceChildren(...slots.map((s, i) => h('div.slot',
    select([0, 1, 2, 3, 4, 5, 6].map((d) => [d, t(`day.${d}`)]), s.day, (v) => { s.day = Number(v); }, { cls: 'input--sm', label: t('day.0') }),
    h('input.input.input--sm', { type: 'time', value: s.start, 'aria-label': 'start', onchange: (e) => { s.start = e.target.value; } }),
    h('input.input.input--sm', { type: 'time', value: s.end, 'aria-label': 'end', onchange: (e) => { s.end = e.target.value; } }),
    h('input.input.input--sm', { type: 'text', value: s.room || '', placeholder: t('cls.f.room'), maxlength: 30, onchange: (e) => { s.room = e.target.value; } }),
    h('button.icon-btn', { type: 'button', 'aria-label': t('common.remove'), onclick: () => { slots.splice(i, 1); paintSlots(); } }, icon('x', 16)))));
  paintSlots();
  const err = h('p.form-error', { role: 'alert' });
  const body = h('div.stack',
    h('div.form-grid', field(t('cls.f.name'), f.name), field(t('cls.f.course'), f.course), field(t('cls.f.code'), f.code),
      field(t('cls.f.semester'), select([[1, '1'], [2, '2']], semester, (v) => { semester = Number(v); })), field(t('cls.f.year'), f.year)),
    h('div.stack.stack--sm', h('strong', t('cls.f.schedule')), slotBox, h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => { slots.push({ day: 2, start: '08:30', end: '10:00', room: '' }); paintSlots(); } }, icon('plus', 15), t('cls.f.addSlot'))),
    h('div.stack.stack--sm', h('strong', t('cls.f.limits')), h('p.muted.small', t('cls.f.limitsHint')), h('div.form-grid', field(t('cls.f.late'), f.late), field(t('cls.f.close'), f.close), field(t('cls.f.warn'), f.warn), field(t('cls.f.notice'), f.notice))), err);
  openModal({ title: group ? t('cls.edit') : t('cls.new'), size: 'lg', body, actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', onClick: async () => {
    const payload = { name: f.name.value, course_name: f.course.value, code: f.code.value, semester, year: Number(f.year.value), schedule: slots, late_after_min: Number(f.late.value), close_after_min: Number(f.close.value), absence_warn: Number(f.warn.value), absence_notice: Number(f.notice.value) };
    try { const r = group ? await api.patch(`/api/groups/${group.id}`, payload) : await api.post('/api/groups', payload); await onSaved(r.group); } catch (e) { err.textContent = e.message; return false; }
  } }] });
}

// ---------- invites ----------
function showInvites(result, groupName) {
  const invites = result.invites;
  const csv = () => toCsv([['student_id', 'full_name', 'invite_code'], ...invites.map((i) => [i.university_id, i.full_name, i.code])]);
  const text = () => invites.map((i) => `${i.university_id}\t${i.full_name}\t${i.code}`).join('\n');
  openModal({ title: t('imp.doneTitle'), size: 'lg',
    body: [h('p', t('imp.done', { created: result.created, existing: result.existing, dup: result.already_in_group })),
      invites.length ? [h('p.muted', t('imp.note')), h('div.invites', h('table.ledger', h('thead', h('tr', h('th', t('cls.col.student')), h('th', t('auth.univ')), h('th', t('auth.code')))),
        h('tbody', invites.map((i) => h('tr', h('td', i.full_name), h('td.ltr', i.university_id), h('td', h('span.code.ltr', i.code)))))))] : h('p.muted', t('imp.none'))],
    actions: invites.length ? [{ label: t('imp.copy'), close: false, onClick: async () => { try { await navigator.clipboard.writeText(text()); toast(t('common.copied'), 'ok'); } catch { /* clipboard blocked */ } return false; } },
      { label: t('imp.csv'), close: false, onClick: () => { downloadBlob(new Blob([csv()], { type: 'text/csv;charset=utf-8' }), `invites-${groupName}.csv`); return false; } }, { label: t('common.close'), kind: 'primary' }] : [{ label: t('common.close'), kind: 'primary' }] });
}
function importModal(group, onDone) {
  let rows = [];
  const ta = h('textarea.input.ltr', { rows: 8, placeholder: '202431000001;Amina Benali\n202431000002;Yacine Merabet', spellcheck: false });
  const info = h('p.muted'); const bad = h('p.form-error');
  const refresh = () => {
    const parsed = parseRoster(ta.value);
    const okRows = parsed.filter((r) => /^[0-9A-Za-z][0-9A-Za-z\-_/]{0,39}$/.test(r.university_id) && r.full_name);
    rows = okRows; info.textContent = okRows.length ? t('imp.preview', { n: okRows.length }) : t('imp.nothing');
    bad.textContent = parsed.length - okRows.length ? t('imp.invalid', { n: parsed.length - okRows.length }) : '';
    addBtn.disabled = !okRows.length; addBtn.textContent = okRows.length ? t('imp.add', { n: okRows.length }) : t('imp.nothing');
  };
  ta.addEventListener('input', refresh);
  const file = h('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv', class: 'sr-only', id: 'impfile', onchange: async (e) => { const f = e.target.files[0]; if (f) { ta.value = await f.text(); refresh(); } } });
  const addBtn = h('button.btn.btn--primary', { type: 'button', disabled: true, onclick: async () => {
    addBtn.disabled = true;
    try { const r = await api.post(`/api/groups/${group.id}/students`, { rows }); m.close(); showInvites(r, group.name); onDone(); } catch (e) { bad.textContent = e.message; addBtn.disabled = false; }
  } }, t('imp.nothing'));
  const m = openModal({ title: t('imp.title'), size: 'lg', body: [h('p.muted', t('imp.text')), h('div.dropzone', h('label.btn.btn--ghost.btn--sm', { for: 'impfile' }, icon('upload', 15), t('imp.file')), file), field(t('imp.paste'), ta), info, bad], actions: [{ label: t('common.cancel') }] });
  m.dlg.querySelector('.modal__foot').append(addBtn);
}

// ---------- group detail ----------
async function detail(root, id, app) {
  let tab = 'roster';
  const [rost, sess] = await Promise.all([api.get(`/api/groups/${id}/roster`), api.get(`/api/sessions?group_id=${id}&limit=100`)]);
  let { group, students } = rost; const sessions = sess.sessions;
  app.setTitle(group.name);
  const body = h('div');
  const draw = () => {
    root.replaceChildren(
      h('p.small', h('a.link', { href: '#/classes' }, '← ', t('cls.title'))),
      pageHead(group.name, [group.course_name, group.code, `S${group.semester} ${group.year}`].filter(Boolean).join(' · ') + (group.schedule.length ? ` · ${slotText(group)}` : ''),
        h('button.btn.btn--ghost', { type: 'button', onclick: () => importModal(group, reload) }, icon('upload', 16), t('cls.import')),
        h('button.btn.btn--ghost', { type: 'button', onclick: () => groupModal(group, async (g) => { group = { ...group, ...g }; toast(t('cls.saved'), 'ok'); draw(); }) }, icon('edit', 16), t('cls.edit')),
        h('button.btn.btn--primary', { type: 'button', onclick: async () => { try { const s = await startOrResume(group.id); app.go(`/scan/${s.id}`); } catch (e) { toast(e.code === 'no_bundle' ? t('today.readyNoneText') : e.message, 'error'); } } }, icon('scan', 16), t('cls.start'))),
      h('div.stack', tabs([{ id: 'roster', label: `${t('cls.tab.roster')} ${students.length}` }, { id: 'sessions', label: `${t('cls.tab.sessions')} ${sessions.length}` }], tab, (x) => { tab = x; draw(); }), body));
    paint();
  };
  const paint = () => {
    body.replaceChildren(tab === 'roster' ? rosterView() : sessionsView());
  };
  const reload = async () => { const r = await api.get(`/api/groups/${id}/roster`); students = r.students; group = r.group; draw(); };

  const rosterView = () => {
    if (!students.length) return empty(t('cls.noStudents'), t('cls.noStudentsText'), h('button.btn.btn--primary', { type: 'button', onclick: () => importModal(group, reload) }, icon('upload', 16), t('cls.import')));
    return h('div.sheet', h('div.table-wrap', h('table.ledger.people',
      h('thead', h('tr', h('th', t('cls.col.student')), h('th', t('cls.col.account')), h('th.num', t('cls.col.rate')), h('th.num', t('cls.col.abs')), h('th', t('cls.col.flag')), h('th', t('cls.col.phones')), h('th'))),
      h('tbody', students.map((s) => {
        const ok = s.devices.filter((d) => d.status === 'approved').length, wait = s.devices.filter((d) => d.status === 'pending').length;
        return h('tr', h('td', h('div.person', avatar(s.full_name), h('div', h('div.person__name', s.full_name), h('div.person__id.ltr', s.university_id)))),
          h('td', s.activated ? chip('present', t('cls.active')) : h('span.code.ltr', s.invite_code || '–')), h('td.num', rateText(s.stats.rate)), h('td.num', s.stats.absences), h('td', flagChip(s.flag)),
          h('td.small', s.devices.length ? t('cls.phones', { ok, wait }) : h('span.muted', t('cls.noPhone'))),
          h('td', h('div.row.row--tight.row--end', h('a.btn.btn--subtle.btn--sm', { href: `#/student/${s.id}` }, t('cls.card')), rowMenu(s))));
      })))));
  };
  const rowMenu = (s) => h('button.icon-btn', { type: 'button', 'aria-label': s.full_name, onclick: () => {
    const m = openModal({ title: s.full_name, size: 'sm', body: h('div.menu',
      h('button.menu__link.btn--block', { type: 'button', style: { border: 0, background: 'none', textAlign: 'start' }, onclick: async () => { try { const r = await api.post(`/api/students/${s.id}/invite`); m.close(); openModal({ title: t('cls.codeTitle', { name: s.full_name }), size: 'sm', body: [h('p.muted', t('cls.codeText')), h('p', { style: { textAlign: 'center', fontSize: '2rem' } }, h('span.code.ltr', r.code))], actions: [{ label: t('common.close'), kind: 'primary' }] }); reload(); } catch (e) { toast(e.message, 'error'); } } }, icon('key', 20), t('cls.newCode')),
      h('button.menu__link.btn--block', { type: 'button', style: { border: 0, background: 'none', textAlign: 'start', color: 'var(--absent)' }, onclick: async () => { m.close(); if (await confirmDialog({ title: t('cls.remove'), message: t('cls.removeText', { name: s.full_name }), confirmLabel: t('common.remove'), danger: true })) { await api.del(`/api/groups/${id}/students/${s.id}`); toast(t('cls.removed'), 'ok'); reload(); } } }, icon('trash', 20), t('cls.remove'))) });
  } }, icon('more', 18));

  const sessionsView = () => (sessions.length ? h('div.sheet', h('div.table-wrap', h('table.ledger',
    h('thead', h('tr', h('th', t('cls.s.when')), h('th', t('cls.s.topic')), h('th.num', t('today.col.present')), h('th.num', t('today.col.late')), h('th.num', t('today.col.absent')), h('th', t('cls.s.status')))),
    h('tbody', sessions.map((s) => h('tr', h('td', h('a.link', { href: s.status === 'open' ? `#/scan/${s.id}` : `#/session/${s.id}` }, fmtDateTime(s.starts_at))), h('td', s.topic || '–'),
      h('td.num', s.attendance_counts.present || 0), h('td.num', s.attendance_counts.late || 0), h('td.num', s.attendance_counts.absent || 0), h('td', chip(s.status === 'open' ? 'late' : 'present', s.status === 'open' ? t('cls.s.open') : t('cls.s.closed'))))))))) : empty(t('cls.noSessions'), t('cls.noSessionsText')));
  draw();
}
