// Excuse inbox: read the reason, look at the attached proof, approve or refuse with an optional note.
import { h, icon, toast, openModal, empty, chip, field } from '../ui.js';
import { t, addStrings, fmtDateTime } from '../i18n.js';
import { api } from '../api.js';
import { pageHead, sheet, tabs, avatar } from '../kit.js';

addStrings({
  en: {
    'ex.title': 'Excuses', 'ex.sub': 'Approving an excuse turns that absence into an excused one. The student is told either way.',
    'ex.pending': 'Waiting', 'ex.approved': 'Approved', 'ex.rejected': 'Refused', 'ex.all': 'All',
    'ex.none': 'Nothing here', 'ex.noneText': 'Excuses your students send will appear in this list.', 'ex.file': 'View attachment', 'ex.approve': 'Approve', 'ex.reject': 'Refuse',
    'ex.note': 'Note for the student', 'ex.noteHint': 'Optional. They will see it with your decision.', 'ex.done.approved': 'Excuse approved.', 'ex.done.rejected': 'Excuse refused.', 'ex.sent': 'Sent {time}', 'ex.noReason': 'No reason written', 'ex.fileFail': 'Could not open the attachment.',
  },
  ar: {
    'ex.title': 'الأعذار', 'ex.sub': 'قبول العذر يحوّل الغياب إلى غياب مبرَّر. يُشعَر الطالب في الحالتين.',
    'ex.pending': 'في الانتظار', 'ex.approved': 'مقبولة', 'ex.rejected': 'مرفوضة', 'ex.all': 'الكل',
    'ex.none': 'لا شيء هنا', 'ex.noneText': 'ستظهر هنا الأعذار التي يرسلها طلبتك.', 'ex.file': 'عرض المرفق', 'ex.approve': 'قبول', 'ex.reject': 'رفض',
    'ex.note': 'ملاحظة للطالب', 'ex.noteHint': 'اختيارية. سيراها مع قرارك.', 'ex.done.approved': 'تم قبول العذر.', 'ex.done.rejected': 'تم رفض العذر.', 'ex.sent': 'أُرسل {time}', 'ex.noReason': 'لم يُكتب سبب', 'ex.fileFail': 'تعذر فتح المرفق.',
  },
});

export default async function mount(root, params, app) {
  app.setTitle(t('ex.title'));
  let tab = 'pending';
  let list = [];
  const holder = h('div.stack');

  const load = async () => { list = (await api.get(`/api/excuses${tab === 'all' ? '' : `?state=${tab}`}`)).excuses; draw(); };

  const openFile = async (e) => {
    try { const blob = await api.blob(`/api/excuses/${e.id}/file`); const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); } catch { toast(t('ex.fileFail'), 'error'); }
  };

  const decide = (e, state) => {
    const note = h('textarea.input', { rows: 3, maxlength: 300 });
    openModal({ title: `${t(state === 'approved' ? 'ex.approve' : 'ex.reject')} · ${e.full_name}`, size: 'sm', body: [field(t('ex.note'), note, t('ex.noteHint'))],
      actions: [{ label: t('common.cancel') }, { label: t(state === 'approved' ? 'ex.approve' : 'ex.reject'), kind: state === 'approved' ? 'primary' : 'danger', onClick: async () => {
        try { await api.post(`/api/excuses/${e.id}/decision`, { state, note: note.value }); toast(t(`ex.done.${state}`), 'ok'); app.refreshBadges?.(); await load(); } catch (err) { toast(err.message, 'error'); return false; }
      } }] });
  };

  const card = (e) => h('li.excuse',
    h('div.row.row--between', h('div.person', avatar(e.full_name), h('div', h('div.person__name', e.full_name), h('div.person__id', `${e.group_name} · ${fmtDateTime(e.starts_at)}`))),
      chip(e.state === 'approved' ? 'present' : e.state === 'rejected' ? 'absent' : 'late', t(`ex.${e.state}`))),
    h('p.excuse__reason', e.reason || h('span.muted', t('ex.noReason'))),
    e.decision_note ? h('p.muted.small', e.decision_note) : null,
    h('div.row.row--between', h('span.muted.small', t('ex.sent', { time: fmtDateTime(e.created_at) })),
      h('div.row', e.file_name ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => openFile(e) }, icon('eye', 15), t('ex.file')) : null,
        e.state === 'pending' ? [h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => decide(e, 'rejected') }, icon('x', 15), t('ex.reject')), h('button.btn.btn--primary.btn--sm', { type: 'button', onclick: () => decide(e, 'approved') }, icon('check', 15), t('ex.approve'))] : null)));

  function draw() {
    holder.replaceChildren(tabs([{ id: 'pending', label: t('ex.pending') }, { id: 'approved', label: t('ex.approved') }, { id: 'rejected', label: t('ex.rejected') }, { id: 'all', label: t('ex.all') }], tab, (x) => { tab = x; load(); }),
      list.length ? h('ul.excuses', list.map(card)) : empty(t('ex.none'), t('ex.noneText')));
  }

  root.append(pageHead(t('ex.title'), t('ex.sub')), holder);
  await load();
}
