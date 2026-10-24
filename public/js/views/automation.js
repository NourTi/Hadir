// Automation: rules that message students and you, an approval queue for sensitive notices, and a delivery log.
import { h, icon, toast, openModal, confirmDialog, empty, chip, field } from '../ui.js';
import { t, addStrings, fmtDateTime, lang } from '../i18n.js';
import { api } from '../api.js';
import { pageHead, sheet, tabs, select } from '../kit.js';

const TRIGGERS = ['session_closed', 'absence_count', 'assessment_upcoming', 'weekly_digest'];
const ACTIONS = ['notify_student', 'notify_teacher', 'webhook'];
const CHANNELS = ['inapp', 'telegram', 'webhook'];

addStrings({
  en: {
    'au.title': 'Automation', 'au.sub': 'Rules watch your classes and send the right message at the right time. Sensitive ones wait for your approval.',
    'au.rules': 'Rules', 'au.approve': 'To approve', 'au.log': 'Sent', 'au.runNow': 'Run rules now', 'au.ran': 'Rules checked. {n} messages created.', 'au.newRule': 'New rule',
    'au.noRules': 'No rules yet', 'au.noRulesText': 'A rule says: when this happens, send that.', 'au.noPending': 'Nothing waiting', 'au.noPendingText': 'Notices that need your approval will show up here before they reach a student.', 'au.noLog': 'Nothing sent yet', 'au.noLogText': 'Messages sent to students appear here, with how they were delivered.',
    'au.on': 'On', 'au.off': 'Off', 'au.edit': 'Edit', 'au.preview': 'Preview', 'au.previewTitle': 'What this rule would send now', 'au.previewNone': 'Nothing would be sent right now.', 'au.previewCount': '{n} messages', 'au.needsApproval': 'Asks you first',
    'au.t.session_closed': 'A session is closed', 'au.t.absence_count': 'A student reaches a number of absences', 'au.t.assessment_upcoming': 'An assessment is coming up', 'au.t.weekly_digest': 'Every week',
    'au.a.notify_student': 'Message the student', 'au.a.notify_teacher': 'Message me', 'au.a.webhook': 'Call a webhook',
    'au.ch.inapp': 'In app', 'au.ch.telegram': 'Telegram', 'au.ch.webhook': 'Webhook',
    'au.f.name': 'Rule name', 'au.f.trigger': 'When', 'au.f.count': 'Number of absences', 'au.f.hours': 'Hours before (comma separated)', 'au.f.needs': 'Ask me before sending', 'au.f.needsHint': 'The message waits in the approval list until you accept it.',
    'au.f.actions': 'Then', 'au.f.addAction': 'Add an action', 'au.f.title': 'Title', 'au.f.body': 'Message', 'au.f.channels': 'Channels', 'au.f.enAr': 'English', 'au.f.arAr': 'العربية',
    'au.vars': 'You can use {name} {group} {date} {count} {assessment} {hours} {digest}.', 'au.saved': 'Rule saved.', 'au.deleted': 'Rule deleted.', 'au.deleteTitle': 'Delete this rule?', 'au.deleteText': '"{name}" stops running. Messages already sent stay in the log.',
    'au.send': 'Approve and send', 'au.discard': 'Discard', 'au.sent': 'Message sent.', 'au.discarded': 'Message discarded.', 'au.toTeacher': 'To you', 'au.col.to': 'To', 'au.col.msg': 'Message', 'au.col.how': 'Delivery', 'au.col.when': 'When',
    'au.st.sent': 'Sent', 'au.st.queued': 'Queued', 'au.st.failed': 'Failed', 'au.st.rejected': 'Discarded', 'au.st.pending_approval': 'Waiting',
    'au.hint.telegram': 'Telegram needs a bot token on the server and the student’s chat id.', 'au.needAction': 'Add at least one action.',
  },
  ar: {
    'au.title': 'الأتمتة', 'au.sub': 'القواعد تراقب حصصك وترسل الرسالة المناسبة في الوقت المناسب. والحساسة منها تنتظر موافقتك.',
    'au.rules': 'القواعد', 'au.approve': 'بانتظار الموافقة', 'au.log': 'المُرسَل', 'au.runNow': 'تشغيل القواعد الآن', 'au.ran': 'تم فحص القواعد. أُنشئت {n} رسائل.', 'au.newRule': 'قاعدة جديدة',
    'au.noRules': 'لا توجد قواعد بعد', 'au.noRulesText': 'القاعدة تقول: عندما يحدث هذا، أرسل ذاك.', 'au.noPending': 'لا شيء ينتظر', 'au.noPendingText': 'الإشعارات التي تحتاج موافقتك تظهر هنا قبل وصولها إلى الطالب.', 'au.noLog': 'لم يُرسل شيء بعد', 'au.noLogText': 'الرسائل المرسلة إلى الطلبة تظهر هنا مع طريقة إيصالها.',
    'au.on': 'مفعّلة', 'au.off': 'متوقفة', 'au.edit': 'تعديل', 'au.preview': 'معاينة', 'au.previewTitle': 'ما الذي ستُرسله هذه القاعدة الآن', 'au.previewNone': 'لن يُرسل شيء الآن.', 'au.previewCount': '{n} رسائل', 'au.needsApproval': 'تسألك أولًا',
    'au.t.session_closed': 'عند إغلاق حصة', 'au.t.absence_count': 'عندما يبلغ طالب عددًا من الغيابات', 'au.t.assessment_upcoming': 'عندما يقترب تقييم', 'au.t.weekly_digest': 'كل أسبوع',
    'au.a.notify_student': 'راسل الطالب', 'au.a.notify_teacher': 'راسلني', 'au.a.webhook': 'استدعِ webhook',
    'au.ch.inapp': 'داخل التطبيق', 'au.ch.telegram': 'تلغرام', 'au.ch.webhook': 'Webhook',
    'au.f.name': 'اسم القاعدة', 'au.f.trigger': 'عندما', 'au.f.count': 'عدد الغيابات', 'au.f.hours': 'الساعات قبل الموعد (مفصولة بفاصلة)', 'au.f.needs': 'اسألني قبل الإرسال', 'au.f.needsHint': 'تبقى الرسالة في قائمة الموافقة حتى تقبلها.',
    'au.f.actions': 'ثم', 'au.f.addAction': 'إضافة إجراء', 'au.f.title': 'العنوان', 'au.f.body': 'الرسالة', 'au.f.channels': 'القنوات', 'au.f.enAr': 'English', 'au.f.arAr': 'العربية',
    'au.vars': 'يمكنك استخدام {name} {group} {date} {count} {assessment} {hours} {digest}.', 'au.saved': 'تم حفظ القاعدة.', 'au.deleted': 'تم حذف القاعدة.', 'au.deleteTitle': 'حذف هذه القاعدة؟', 'au.deleteText': 'ستتوقف «{name}» عن العمل. تبقى الرسائل المرسلة في السجل.',
    'au.send': 'قبول وإرسال', 'au.discard': 'تجاهل', 'au.sent': 'تم إرسال الرسالة.', 'au.discarded': 'تم تجاهل الرسالة.', 'au.toTeacher': 'إليك', 'au.col.to': 'إلى', 'au.col.msg': 'الرسالة', 'au.col.how': 'الإيصال', 'au.col.when': 'متى',
    'au.st.sent': 'أُرسلت', 'au.st.queued': 'في الطابور', 'au.st.failed': 'فشلت', 'au.st.rejected': 'تم تجاهلها', 'au.st.pending_approval': 'تنتظر',
    'au.hint.telegram': 'يحتاج تلغرام إلى رمز بوت على الخادم ومعرّف محادثة الطالب.', 'au.needAction': 'أضف إجراءً واحدًا على الأقل.',
  },
});

const pick = (v) => (v && typeof v === 'object' ? v[lang()] || v.en || v.ar || '' : v || '');
const blankAction = (type = 'notify_student') => ({ type, channels: ['inapp'], title: { en: '', ar: '' }, template: { en: '', ar: '' } });

export default async function mount(root, params, app) {
  app.setTitle(t('au.title'));
  let tab = ['rules', 'approve', 'log'].includes(params.tab) ? params.tab : 'rules';
  let rules = [], inbox = { pending: [], log: [] };
  const holder = h('div.stack');

  const load = async () => { [rules, inbox] = await Promise.all([api.get('/api/rules').then((r) => r.rules), api.get('/api/notifications')]); app.refreshBadges?.(); draw(); };

  function ruleModal(rule) {
    const r = rule ? structuredClone(rule) : { name: '', trigger: 'session_closed', conditions: {}, actions: [blankAction()], needs_approval: false, enabled: true };
    const name = h('input.input', { type: 'text', value: r.name, maxlength: 80 });
    const err = h('p.form-error', { role: 'alert' });
    const cond = h('div'); const actionsBox = h('div.stack');
    const needs = h('input', { type: 'checkbox', checked: !!r.needs_approval, id: 'au-needs' });

    const drawCond = () => {
      const node = (r.trigger === 'absence_count' ? field(t('au.f.count'), h('input.input', { type: 'number', min: 1, max: 30, value: r.conditions.count ?? 3, oninput: (e) => { r.conditions = { count: Number(e.target.value) }; } }))
        : r.trigger === 'assessment_upcoming' ? field(t('au.f.hours'), h('input.input.ltr', { type: 'text', value: (r.conditions.hours || [72, 24, 2]).join(', '), oninput: (e) => { r.conditions = { hours: e.target.value.split(/[,\s]+/).map(Number).filter((n) => n > 0) }; } })) : null);
      cond.replaceChildren(...(node ? [node] : []));
    };
    const drawActions = () => {
      const allowed = r.trigger === 'weekly_digest' ? ACTIONS.filter((a) => a !== 'notify_student') : ACTIONS;
      actionsBox.replaceChildren(...r.actions.map((a, i) => {
        if (!allowed.includes(a.type)) a.type = allowed[0];
        const bilingual = (key, label, rows) => h('div.form-grid', ['en', 'ar'].map((l) => field(`${label} · ${l === 'en' ? t('au.f.enAr') : t('au.f.arAr')}`,
          h(rows ? 'textarea.input' : 'input.input', { ...(rows ? { rows } : { type: 'text' }), dir: l === 'ar' ? 'rtl' : 'ltr', maxlength: 600, value: a[key][l] || '', oninput: (e) => { a[key][l] = e.target.value; } }))));
        return h('div.actionbox', h('div.row.row--between', select(allowed.map((x) => [x, t(`au.a.${x}`)]), a.type, (v) => { a.type = v; }, { cls: 'input--sm', label: t('au.f.actions') }),
          r.actions.length > 1 ? h('button.icon-btn', { type: 'button', 'aria-label': t('common.delete'), onclick: () => { r.actions.splice(i, 1); drawActions(); } }, icon('trash', 16)) : null),
        bilingual('title', t('au.f.title')), bilingual('template', t('au.f.body'), 3),
        h('div.row', h('span.muted.small', t('au.f.channels')), CHANNELS.map((c) => h('label.check', h('input', { type: 'checkbox', checked: a.channels.includes(c), onchange: (e) => { a.channels = e.target.checked ? [...new Set([...a.channels, c])] : a.channels.filter((x) => x !== c); } }), t(`au.ch.${c}`)))));
      }), r.actions.length < 4 ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => { r.actions.push(blankAction(r.trigger === 'weekly_digest' ? 'notify_teacher' : 'notify_student')); drawActions(); } }, icon('plus', 15), t('au.f.addAction')) : null);
    };
    drawCond(); drawActions();
    openModal({ title: rule ? t('au.edit') : t('au.newRule'), size: 'lg', body: [
      field(t('au.f.name'), name),
      field(t('au.f.trigger'), select(TRIGGERS.map((x) => [x, t(`au.t.${x}`)]), r.trigger, (v) => { r.trigger = v; r.conditions = {}; drawCond(); drawActions(); })), cond,
      h('div.stack', h('strong', t('au.f.actions')), h('p.muted.small', t('au.vars')), actionsBox),
      h('label.check.check--block', needs, h('span', h('strong', t('au.f.needs')), h('span.muted.small', ` ${t('au.f.needsHint')}`))), err],
    actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', onClick: async () => {
      const body = { name: name.value, trigger: r.trigger, conditions: r.conditions, actions: r.actions, needs_approval: needs.checked };
      try { if (rule) await api.patch(`/api/rules/${rule.id}`, body); else await api.post('/api/rules', body); toast(t('au.saved'), 'ok'); await load(); } catch (e) { err.textContent = e.message; return false; }
    } }] });
  }

  async function previewRule(r) {
    const res = await api.post(`/api/rules/${r.id}/dry-run`, {});
    openModal({ title: `${t('au.previewTitle')} · ${r.name}`, size: 'lg', body: res.count ? h('div.stack', h('p.muted', t('au.previewCount', { n: res.count })),
      h('ul.ledger-list', res.plans.map((p) => h('li', h('div.grow', h('strong', p.title), h('p.small', p.body), h('p.muted.small', `${p.to_teacher ? t('au.toTeacher') : p.name} · ${p.reason || ''}`)), p.needs_approval ? chip('late', t('au.needsApproval')) : null)))) : h('p.muted', t('au.previewNone')), actions: [{ label: t('common.close') }] });
  }

  const ruleCard = (r) => h('li.rule', { class: r.enabled ? '' : 'is-off' },
    h('div.rule__main', h('div.row', h('strong', r.name), r.needs_approval ? chip('late', t('au.needsApproval')) : null),
      h('p.muted.small', t(`au.t.${r.trigger}`) + (r.trigger === 'absence_count' ? ` (${r.conditions.count})` : r.trigger === 'assessment_upcoming' ? ` (${(r.conditions.hours || []).join(' / ')} h)` : '')),
      h('p.small', r.actions.map((a) => `${t(`au.a.${a.type}`)} · ${a.channels.map((c) => t(`au.ch.${c}`)).join(', ')}`).join('  →  '))),
    h('div.row', h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => previewRule(r) }, icon('eye', 15), t('au.preview')),
      h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => ruleModal(r) }, icon('edit', 15), t('au.edit')),
      h('label.switch', { title: t(r.enabled ? 'au.on' : 'au.off') }, h('input', { type: 'checkbox', role: 'switch', checked: r.enabled, 'aria-label': r.name, onchange: async (e) => { try { await api.patch(`/api/rules/${r.id}`, { enabled: e.target.checked }); r.enabled = e.target.checked; draw(); } catch (er) { toast(er.message, 'error'); await load(); } } }), h('span.switch__ui')),
      h('button.icon-btn', { type: 'button', 'aria-label': t('common.delete'), onclick: async () => { if (await confirmDialog({ title: t('au.deleteTitle'), message: t('au.deleteText', { name: r.name }), confirmLabel: t('common.delete'), danger: true })) { await api.del(`/api/rules/${r.id}`); toast(t('au.deleted'), 'ok'); await load(); } } }, icon('trash', 17))));

  const stateChip = (s) => chip(s === 'sent' ? 'present' : s === 'failed' ? 'absent' : 'late', t(`au.st.${s}`));
  const deliveryText = (n) => Object.entries(n.deliveries || {}).map(([c, d]) => `${t(`au.ch.${c}`) || c}: ${d?.ok ? '✓' : d?.error ? '✗' : '…'}`).join('  ');

  function draw() {
    const items = [{ id: 'rules', label: t('au.rules') }, { id: 'approve', label: t('au.approve'), count: inbox.pending.length || null }, { id: 'log', label: t('au.log') }];
    let body;
    if (tab === 'rules') body = rules.length ? h('ul.rules', rules.map(ruleCard)) : empty(t('au.noRules'), t('au.noRulesText'));
    else if (tab === 'approve') body = inbox.pending.length ? h('ul.rules', inbox.pending.map((n) => h('li.rule', h('div.rule__main', h('strong', n.title), h('p.small', n.body), h('p.muted.small', `${n.student_name || t('au.toTeacher')} · ${fmtDateTime(n.created_at)}`)),
      h('div.row', h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: async () => { await api.post(`/api/notifications/${n.id}/reject`, {}); toast(t('au.discarded')); await load(); } }, t('au.discard')),
        h('button.btn.btn--primary.btn--sm', { type: 'button', onclick: async () => { try { await api.post(`/api/notifications/${n.id}/approve`, {}); toast(t('au.sent'), 'ok'); } catch (e) { toast(e.message, 'error'); } await load(); } }, icon('send', 15), t('au.send')))))) : empty(t('au.noPending'), t('au.noPendingText'));
    else body = inbox.log.length ? sheet(null, h('table.ledger', h('thead', h('tr', h('th', t('au.col.to')), h('th', t('au.col.msg')), h('th', t('au.col.how')), h('th', t('au.col.when')))),
      h('tbody', inbox.log.map((n) => h('tr', h('td', n.student_name || '–'), h('td', h('strong', n.title), h('div.muted.small', n.body)), h('td', stateChip(n.status), h('div.muted.small', deliveryText(n))), h('td.small.muted', fmtDateTime(n.created_at)))))), null, { flush: true }) : empty(t('au.noLog'), t('au.noLogText'));
    holder.replaceChildren(tabs(items, tab, (x) => { tab = x; draw(); }), body);
  }

  root.append(pageHead(t('au.title'), t('au.sub'),
    h('button.btn.btn--ghost', { type: 'button', onclick: async (e) => { const btn = e.currentTarget; btn.disabled = true; try { const r = await api.post('/api/system/tick', {}); toast(t('au.ran', { n: (r?.reminders||0)+(r?.digests||0)+(r?.retried||0) }), 'ok'); await load(); } catch (er) { toast(er.message, 'error'); } finally { btn.disabled = false; } } }, icon('sync', 16), t('au.runNow')),
    h('button.btn.btn--primary', { type: 'button', onclick: () => ruleModal(null) }, icon('plus', 16), t('au.newRule'))), holder);
  await load();
}
