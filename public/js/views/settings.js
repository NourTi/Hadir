// Settings for both roles: language, theme, Telegram, password and phones. Teachers also get approvals, backup, audit log and demo reset.
import { h, icon, toast, confirmDialog, empty, chip, field, downloadBlob, theme } from '../ui.js';
import { t, addStrings, setLang, lang, fmtDateTime } from '../i18n.js';
import { api, saveAuth, auth } from '../api.js';
import { profileCard, recoveryCard, exportCard, ownerCard, addressCard } from './settings-educator.js';
import '../strings-accounts.js';
import { pageHead, sheet, select, defList } from '../kit.js';

addStrings({
  en: {
    'set.title': 'Settings', 'set.sub': 'Your language, theme, contact details and security.', 'set.appearance': 'Appearance', 'set.account': 'Account', 'set.telegram': 'Telegram', 'set.telegramText': 'Add your Telegram chat id to receive messages there. Message the bot first so it can reach you.', 'set.chatId': 'Chat id',
    'set.password': 'Change password', 'set.current': 'Current password', 'set.new': 'New password', 'set.newHint': 'At least 8 characters.', 'set.changed': 'Password changed.', 'set.saved': 'Saved.', 'set.name': 'Full name',
    'set.devices': 'Phones', 'set.devicesText': 'Each phone signs the codes it shows with its own key. A new phone must be approved before its codes count.', 'set.noDevices': 'No phones yet', 'set.dev.approved': 'Approved', 'set.dev.pending': 'Waiting for approval', 'set.dev.revoked': 'Revoked',
    'set.approve': 'Approve', 'set.revoke': 'Revoke', 'set.devDone': 'Phone updated.', 'set.lastSeen': 'Last seen {time}', 'set.never': 'Never used',
    'set.data': 'Your data', 'set.backup': 'Download a backup', 'set.backupText': 'A complete copy of the database. Keep it somewhere safe.', 'set.audit': 'Recent activity', 'set.noAudit': 'Nothing recorded yet',
    'set.demo': 'Demo data', 'set.demoText': 'Restore the sample classes and students. Everything you changed is replaced.', 'set.demoReset': 'Reset demo data', 'set.demoOk': 'Demo data restored.', 'set.demoConfirm': 'Replace everything with the sample data?',
    'set.signOut': 'Sign out', 'set.pendingFirst': '{n} waiting',
  },
  ar: {
    'set.title': 'الإعدادات', 'set.sub': 'لغتك ومظهر التطبيق وبيانات الاتصال والأمان.', 'set.appearance': 'المظهر', 'set.account': 'الحساب', 'set.telegram': 'تلغرام', 'set.telegramText': 'أضف معرّف محادثة تلغرام لتصلك الرسائل هناك. راسل البوت أولًا ليتمكن من الوصول إليك.', 'set.chatId': 'معرّف المحادثة',
    'set.password': 'تغيير كلمة السر', 'set.current': 'كلمة السر الحالية', 'set.new': 'كلمة السر الجديدة', 'set.newHint': '8 أحرف على الأقل.', 'set.changed': 'تم تغيير كلمة السر.', 'set.saved': 'تم الحفظ.', 'set.name': 'الاسم الكامل',
    'set.devices': 'الهواتف', 'set.devicesText': 'يوقّع كل هاتف الرموز التي يعرضها بمفتاحه الخاص. يجب الموافقة على الهاتف الجديد قبل أن تُحتسب رموزه.', 'set.noDevices': 'لا توجد هواتف بعد', 'set.dev.approved': 'مُوافَق عليه', 'set.dev.pending': 'بانتظار الموافقة', 'set.dev.revoked': 'ملغى',
    'set.approve': 'موافقة', 'set.revoke': 'إلغاء', 'set.devDone': 'تم تحديث الهاتف.', 'set.lastSeen': 'آخر ظهور {time}', 'set.never': 'لم يُستخدم',
    'set.data': 'بياناتك', 'set.backup': 'تنزيل نسخة احتياطية', 'set.backupText': 'نسخة كاملة من قاعدة البيانات. احتفظ بها في مكان آمن.', 'set.audit': 'النشاط الأخير', 'set.noAudit': 'لم يُسجَّل شيء بعد',
    'set.demo': 'بيانات تجريبية', 'set.demoText': 'استعادة الأفواج والطلبة النموذجيين. يُستبدل كل ما غيّرته.', 'set.demoReset': 'إعادة البيانات التجريبية', 'set.demoOk': 'تمت استعادة البيانات التجريبية.', 'set.demoConfirm': 'استبدال كل شيء بالبيانات النموذجية؟',
    'set.signOut': 'تسجيل الخروج', 'set.pendingFirst': '{n} بانتظار',
  },
});

export default async function mount(root, params, app) {
  app.setTitle(t('set.title'));
  const isTeacher = app.user.role === 'teacher';
  const th = theme();
  const stack = h('div.stack.stack--lg');
  const card = (title, ...body) => sheet(title, h('div.stack', body));

  // Appearance
  const appearance = card(t('set.appearance'),
    field(t('common.language'), select([['en', 'English'], ['ar', 'العربية']], lang(), async (v) => { setLang(v); try { await api.patch('/api/me', { language: v }); } catch { /* offline: the choice still applies here */ } })),
    field(t('common.theme'), select([['auto', t('common.auto')], ['light', t('common.light')], ['dark', t('common.dark')]], th.get(), (v) => th.set(v))));

  // Account
  const tg = h('input.input.ltr', { type: 'text', inputmode: 'numeric', value: app.user.telegram_chat_id || '', maxlength: 40 });
  const nameInput = null; // teachers edit their name in the portal card
  const cur = h('input.input', { type: 'password', autocomplete: 'current-password' });
  const nw = h('input.input', { type: 'password', autocomplete: 'new-password', minlength: isTeacher ? 10 : 8 });
  const pwErr = h('p.form-error', { role: 'alert' });
  const save = async (body, okKey) => { try { const r = await api.patch('/api/me', body); Object.assign(app.user, r.user); toast(t(okKey), 'ok'); return true; } catch (e) { toast(e.message, 'error'); return false; } };
  const account = card(t('set.account'),
    defList([isTeacher ? [t('auth.email'), h('span.ltr', app.user.login)] : null, app.user.university_id ? [t('auth.univ'), h('span.ltr', app.user.university_id)] : null].filter(Boolean)),
    nameInput ? h('div.row', field(t('set.name'), nameInput), h('button.btn.btn--ghost', { type: 'button', onclick: () => save({ full_name: nameInput.value }, 'set.saved') }, t('common.save'))) : null,
    h('hr.rule'),
    h('div.stack', h('strong', t('set.telegram')), h('p.muted.small', t('set.telegramText')), h('div.row', field(t('set.chatId'), tg), h('button.btn.btn--ghost', { type: 'button', onclick: () => save({ telegram_chat_id: tg.value }, 'set.saved') }, t('common.save')))),
    h('hr.rule'),
    h('form.stack', { onsubmit: async (e) => { e.preventDefault(); pwErr.textContent = ''; try { const r = await api.patch('/api/me', { current_password: cur.value, new_password: nw.value }); if (r.token) saveAuth(r.token, r.user); cur.value = nw.value = ''; toast(t('set.changed'), 'ok'); } catch (er) { pwErr.textContent = er.message; } } },
      h('strong', t('set.password')), field(t('set.current'), cur), field(t('set.new'), nw, t(isTeacher ? 'set.pwHint' : 'set.newHint')), pwErr, h('div.row', h('button.btn.btn--primary', { type: 'submit' }, t('set.password')))));

  // Devices
  const devBox = h('div');
  const loadDevices = async () => {
    const { devices } = await api.get('/api/devices');
    const tone = (s) => (s === 'approved' ? 'present' : s === 'pending' ? 'late' : 'absent');
    if (isTeacher) { const n = devices.filter((d) => d.status === 'pending').length; if (n) app.refreshBadges?.(); }
    const decide = async (d, status) => { try { await api.post(`/api/devices/${d.id}/decision`, { status }); toast(t('set.devDone'), 'ok'); await loadDevices(); } catch (e) { toast(e.message, 'error'); } };
    devBox.replaceChildren(devices.length ? h('ul.ledger-list', devices.sort((a, b) => (b.status === 'pending') - (a.status === 'pending')).map((d) => h('li',
      h('div.grow', h('strong', isTeacher ? `${d.full_name} · ${d.label}` : d.label), h('p.muted.small', d.last_seen ? t('set.lastSeen', { time: fmtDateTime(d.last_seen) }) : t('set.never'))),
      chip(tone(d.status), t(`set.dev.${d.status}`)),
      isTeacher ? h('div.row', d.status !== 'approved' ? h('button.btn.btn--primary.btn--sm', { type: 'button', onclick: () => decide(d, 'approved') }, t('set.approve')) : null,
        d.status !== 'revoked' ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => decide(d, 'revoked') }, t('set.revoke')) : null) : null))) : empty(t('set.noDevices')));
  };
  const devices = card(t('set.devices'), h('p.muted.small', t('set.devicesText')), devBox);

  stack.append(...(isTeacher ? [profileCard(app)] : []), appearance, account, ...(isTeacher ? [recoveryCard()] : []), devices);

  // Teacher data tools
  if (isTeacher) {
    const auditBox = h('div');
    const { entries } = await api.get('/api/audit?limit=40');
    auditBox.append(entries.length ? h('ul.audit', entries.map((e) => h('li', h('span.audit__what', e.action), h('span.muted.small', ` ${e.actor || ''} · ${fmtDateTime(e.created_at)}`)))) : h('p.muted', t('set.noAudit')));
    if (app.user.is_owner) stack.append(await ownerCard(app), addressCard(app));
    stack.append(exportCard());
    stack.append(card(t('set.data'),
      app.user.is_owner ? [h('div.row.row--between', h('div', h('strong', t('set.backup')), h('p.muted.small', t('set.backupText'))), h('button.btn.btn--ghost', { type: 'button', onclick: async () => { try { downloadBlob(await api.blob('/api/export/backup'), `hadir-backup-${new Date().toISOString().slice(0, 10)}.db`); } catch (e) { toast(e.message, 'error'); } } }, icon('download', 16), t('set.backup'))), h('hr.rule')] : null, h('strong', t('set.audit')), auditBox,
      app.config?.demo ? [h('hr.rule'), h('div.row.row--between', h('div', h('strong', t('set.demo')), h('p.muted.small', t('set.demoText'))), h('button.btn.btn--ghost', { type: 'button', onclick: async () => { if (await confirmDialog({ title: t('set.demoReset'), message: t('set.demoConfirm'), confirmLabel: t('set.demoReset'), danger: true })) { await api.post('/api/demo/reset', {}); toast(t('set.demoOk'), 'ok'); app.go('/today'); } } }, icon('flask', 16), t('set.demoReset')))] : null));
  }
  stack.append(h('div.row', h('button.btn.btn--ghost', { type: 'button', onclick: () => app.signOut() }, icon('logout', 16), t('set.signOut'))));

  root.append(pageHead(t('set.title'), t('set.sub')), stack);
  await loadDevices();
}
