// One session, reviewed: who was there, how they were marked, scans that need a decision, and corrections.
import { h, icon, toast, confirmDialog, empty, chip, downloadBlob, toCsv } from '../ui.js';
import { t, addStrings, fmtDateTime, fmtTime, fmtDateLong } from '../i18n.js';
import { api } from '../api.js';
import { pageHead, sheet, statusPicker, avatar } from '../kit.js';

addStrings({
  en: {
    'ses.title': 'Session', 'ses.continue': 'Continue roll call', 'ses.export': 'Download CSV', 'ses.delete': 'Delete session', 'ses.deleteText': 'This removes the session and every mark in it. This cannot be undone.', 'ses.deleted': 'Session deleted.',
    'ses.open': 'Still open', 'ses.closed': 'Closed', 'ses.col.student': 'Student', 'ses.col.status': 'Status', 'ses.col.how': 'How', 'ses.col.excuse': 'Excuse',
    'ses.viaQr': 'Scanned {time}', 'ses.byHand': 'By hand', 'ses.system': 'Closed as absent', 'ses.changed': 'Status updated.', 'ses.excuse.pending': 'Waiting for you', 'ses.excuse.approved': 'Approved', 'ses.excuse.rejected': 'Refused',
    'ses.review': 'Scans to review', 'ses.reviewText': 'These scans were refused on upload. Accept the ones you recognise, dismiss the rest.', 'ses.accept': 'Accept', 'ses.dismiss': 'Dismiss', 'ses.accepted': 'Scan accepted.', 'ses.dismissed': 'Scan dismissed.',
    'scan.r.not_enrolled': 'Not in this group', 'scan.r.too_early': 'Scanned too early', 'scan.r.unknown_student': 'Unknown student ID', 'scan.r.malformed': 'Not a Hadir code', 'scan.r.unknown_device': 'Unknown phone', 'scan.r.device_not_approved': 'Phone not approved',
    'scan.r.bad_signature': 'Signature does not match', 'scan.r.stale_code': 'Code expired', 'scan.r.after_close': 'Scanned after scanning closed',
  },
  ar: {
    'ses.title': 'الحصة', 'ses.continue': 'متابعة تسجيل الحضور', 'ses.export': 'تنزيل CSV', 'ses.delete': 'حذف الحصة', 'ses.deleteText': 'سيؤدي هذا إلى حذف الحصة وكل تسجيلاتها. لا يمكن التراجع عن ذلك.', 'ses.deleted': 'تم حذف الحصة.',
    'ses.open': 'ما زالت مفتوحة', 'ses.closed': 'مغلقة', 'ses.col.student': 'الطالب', 'ses.col.status': 'الحالة', 'ses.col.how': 'الطريقة', 'ses.col.excuse': 'التبرير',
    'ses.viaQr': 'مُسح {time}', 'ses.byHand': 'يدويًا', 'ses.system': 'أُغلقت كغياب', 'ses.changed': 'تم تحديث الحالة.', 'ses.excuse.pending': 'ينتظر قرارك', 'ses.excuse.approved': 'مقبول', 'ses.excuse.rejected': 'مرفوض',
    'ses.review': 'عمليات مسح للمراجعة', 'ses.reviewText': 'رُفضت عمليات المسح هذه عند الرفع. اقبل ما تعرفه وتجاهل الباقي.', 'ses.accept': 'قبول', 'ses.dismiss': 'تجاهل', 'ses.accepted': 'تم قبول المسح.', 'ses.dismissed': 'تم تجاهل المسح.',
    'scan.r.not_enrolled': 'ليس في هذا الفوج', 'scan.r.too_early': 'مسح مبكر جدًا', 'scan.r.unknown_student': 'رقم جامعي غير معروف', 'scan.r.malformed': 'ليس رمز «حاضر»', 'scan.r.unknown_device': 'هاتف غير معروف', 'scan.r.device_not_approved': 'هاتف غير مُوافَق عليه',
    'scan.r.bad_signature': 'التوقيع غير مطابق', 'scan.r.stale_code': 'انتهت صلاحية الرمز', 'scan.r.after_close': 'مسح بعد إغلاق المسح',
  },
});

export default async function mount(root, params, app) {
  const load = () => api.get(`/api/sessions/${params.id}`);
  let data = await load();
  app.setTitle(`${data.group.name} · ${fmtDateTime(data.session.starts_at)}`);

  const draw = () => {
    const { session: s, group: g, students, rejects } = data;
    const counts = { present: 0, late: 0, absent: 0, excused: 0 };
    for (const st of students) if (st.attendance) counts[st.attendance.status]++;
    const csv = () => toCsv([[t('auth.univ'), t('common.name'), t('common.status'), t('ses.col.how')], ...students.map((x) => [x.university_id, x.full_name, x.attendance ? t(`status.${x.attendance.status}`) : '', x.attendance?.method || ''])]);
    const how = (a) => (!a ? '–' : a.method === 'qr' ? t('ses.viaQr', { time: fmtTime(a.scanned_at) }) : a.method === 'manual' ? `${t('ses.byHand')}${a.note ? ` · ${a.note}` : ''}` : t('ses.system'));
    const exc = (e) => (e ? chip(e.state === 'approved' ? 'present' : e.state === 'rejected' ? 'absent' : 'late', t(`ses.excuse.${e.state}`)) : '');

    root.replaceChildren(
      h('p.small', h('a.link', { href: `#/classes/${g.id}` }, '← ', g.name)),
      pageHead(`${g.name}`, `${fmtDateLong(s.starts_at)} · ${fmtTime(s.starts_at)}${s.topic ? ` · ${s.topic}` : ''}`,
        s.status === 'open' ? h('a.btn.btn--primary', { href: `#/scan/${s.id}` }, icon('scan', 16), t('ses.continue')) : null,
        h('button.btn.btn--ghost', { type: 'button', onclick: () => downloadBlob(new Blob([csv()], { type: 'text/csv;charset=utf-8' }), `session-${g.name}-${new Date(s.starts_at).toISOString().slice(0, 10)}.csv`) }, icon('download', 16), t('ses.export')),
        h('button.btn.btn--ghost', { type: 'button', onclick: async () => { if (await confirmDialog({ title: t('ses.delete'), message: t('ses.deleteText'), confirmLabel: t('common.delete'), danger: true })) { await api.del(`/api/sessions/${s.id}`); toast(t('ses.deleted'), 'ok'); app.go(`/classes/${g.id}`); } } }, icon('trash', 16), t('common.delete'))),
      h('div.stack',
        h('div.tally', ['present', 'late', 'excused', 'absent'].map((k) => h(`div.tally__item.tally__item--${k}`, h('span.tally__n', counts[k]), h('span.tally__l', t(`status.${k}`)))), h('div.tally__item', h('span.tally__n', s.status === 'open' ? t('ses.open') : t('ses.closed')))),
        rejects.length ? sheet(t('ses.review'), h('div.stack', h('p.muted', t('ses.reviewText')), h('ul.ledger-list', rejects.map((r) => h('li', h('div.grow', h('strong', r.full_name || r.university_id || '?'), h('p.muted.small', `${t(`scan.r.${r.reason}`)}${r.scanned_at ? ` · ${fmtTime(r.scanned_at)}` : ''}`)),
          r.student_id ? h('button.btn.btn--primary.btn--sm', { type: 'button', onclick: async () => { await api.post(`/api/rejects/${r.id}/resolve`, { action: 'accept', status: 'late' }); toast(t('ses.accepted'), 'ok'); data = await load(); draw(); } }, t('ses.accept')) : null,
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: async () => { await api.post(`/api/rejects/${r.id}/resolve`, { action: 'dismiss' }); toast(t('ses.dismissed')); data = await load(); draw(); } }, t('ses.dismiss'))))))) : null,
        sheet(null, h('table.ledger.people', h('thead', h('tr', h('th', t('ses.col.student')), h('th', t('ses.col.status')), h('th', t('ses.col.how')), h('th', t('ses.col.excuse')))),
          h('tbody', students.map((st) => h('tr', h('td', h('div.person', avatar(st.full_name), h('div', h('div.person__name', st.full_name), h('div.person__id.ltr', st.university_id)))),
            h('td', statusPicker(st.attendance?.status, async (v) => { if (!v) return; try { await api.put(`/api/sessions/${s.id}/attendance/${st.id}`, { status: v }); toast(t('ses.changed'), 'ok'); data = await load(); draw(); } catch (e) { toast(e.message, 'error'); } }, { allowNone: !st.attendance })),
            h('td.small.muted', how(st.attendance)), h('td', exc(st.excuse)))))), null, { flush: true })));
  };
  draw();
}
