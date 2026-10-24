// The student's home: a QR code that changes every 30 seconds, signed by this phone's own key. It works with no internet at all.
import { h, icon, chip, flagChip, errorState } from '../ui.js';
import { t, addStrings, fmtPct } from '../i18n.js';
import { api } from '../api.js';
import { clock } from '../clock.js';
import { signCode, CODE_LIFETIME_S } from '../crypto.js';
import { qrSvg } from '../qr.js';
import { ensureStudentDevice, refreshDeviceStatus } from '../device.js';
import { net } from '../offline.js';

addStrings({
  en: {
    'me.hello': 'Hello, {name}', 'me.show': 'Show this code to your teacher when they ask for attendance.', 'me.fine': 'Changes every 30 seconds', 'me.offlineOk': 'Works without internet',
    'me.pending': 'Waiting for your teacher to approve this phone', 'me.pendingText': 'You signed in on a new phone. Your teacher has to approve it once before its codes count. Your old phone keeps working meanwhile.', 'me.revoked': 'This phone was removed', 'me.revokedText': 'Ask your teacher to approve it again, or sign out and sign back in.',
    'me.check': 'Check again', 'me.noCrypto': 'This browser cannot create a secure code', 'me.noCryptoText': 'Open Hadir in a current version of Chrome, Safari or Firefox over a secure (https) connection.',
    'me.myClasses': 'My classes', 'me.rate': 'attendance', 'me.abs': 'absences', 'me.noClasses': 'You are not in any class yet.', 'me.clockOff': 'Your phone’s clock is {s}s off. Hadir corrects for it while you are online.',
  },
  ar: {
    'me.hello': 'مرحبًا {name}', 'me.show': 'اعرض هذا الرمز على أستاذك عندما يطلب تسجيل الحضور.', 'me.fine': 'يتغيّر كل 30 ثانية', 'me.offlineOk': 'يعمل دون إنترنت',
    'me.pending': 'بانتظار موافقة أستاذك على هذا الهاتف', 'me.pendingText': 'سجّلت الدخول من هاتف جديد. على أستاذك الموافقة عليه مرة واحدة قبل أن تُحتسب رموزه. يبقى هاتفك القديم يعمل في الأثناء.', 'me.revoked': 'تمت إزالة هذا الهاتف', 'me.revokedText': 'اطلب من أستاذك الموافقة عليه من جديد، أو سجّل الخروج ثم الدخول.',
    'me.check': 'تحقق مجددًا', 'me.noCrypto': 'لا يستطيع هذا المتصفح إنشاء رمز آمن', 'me.noCryptoText': 'افتح «حاضر» بنسخة حديثة من Chrome أو Safari أو Firefox عبر اتصال آمن (https).',
    'me.myClasses': 'أفواجي', 'me.rate': 'حضور', 'me.abs': 'غيابات', 'me.noClasses': 'لست مسجلًا في أي فوج بعد.', 'me.clockOff': 'ساعة هاتفك متأخرة أو متقدمة {s} ثانية. يصحّحها «حاضر» عندما تكون متصلًا.',
  },
});

export default async function mount(root, params, app) {
  app.setTitle(t('nav.myCode'));
  const user = app.user;
  let dev;
  try { dev = await ensureStudentDevice(user); } catch (e) {
    root.append(errorState(t('me.noCrypto'), t('me.noCryptoText')));
    return;
  }
  clock.sync(() => api.get('/api/time'));
  const qrBox = h('div.codecard__qr'); const bar = h('span'); const secs = h('span.ltr');
  const status = h('div');
  const card = h('div.codecard', h('div.codecard__who', h('div.codecard__name', user.full_name), h('div.codecard__sub.ltr', user.university_id)), qrBox, h('div.codecard__timer', bar),
    h('div.codecard__fine', h('span', t('me.fine')), secs), h('div.codecard__fine', h('span', [icon('wifioff', 14), ' ', t('me.offlineOk')])));
  const classes = h('div.stack');
  root.append(h('div.me', h('div.me__intro', h('h1', t('me.hello', { name: user.full_name.split(' ')[0] })), h('p.muted', t('me.show'))), status, card, classes));

  let stamp = 0, code = '';
  const render = async () => {
    const nowS = Math.floor(clock.now() / 1000);
    if (dev.status === 'revoked' || dev.status === 'pending') return;
    if (!code || nowS - stamp >= CODE_LIFETIME_S) {
      stamp = nowS;
      try { code = await signCode(dev.privateKey, user.university_id, dev.device_id, stamp); qrBox.innerHTML = qrSvg(code, { ecl: 'L', border: 2, label: 'Hadir attendance code' }); } catch { return; }
    }
    const left = CODE_LIFETIME_S - (nowS - stamp);
    bar.style.transform = `scaleX(${Math.max(0, left) / CODE_LIFETIME_S})`; secs.textContent = `${left}s`;
  };
  const paintStatus = () => {
    card.hidden = dev.status !== 'approved';
    status.replaceChildren(dev.status === 'approved' ? '' : h('div.notice', h('strong', t(dev.status === 'pending' ? 'me.pending' : 'me.revoked')), h('p', t(dev.status === 'pending' ? 'me.pendingText' : 'me.revokedText')),
      h('button.btn.btn--primary', { type: 'button', onclick: async () => { await refreshDeviceStatus(dev); paintStatus(); render(); } }, icon('sync', 16), t('me.check'))));
    const off = Math.abs(clock.offset()) / 1000; if (off > 20) status.append(h('p.muted.small', t('me.clockOff', { s: Math.round(off) })));
  };
  paintStatus();
  if (dev.status !== 'approved') refreshDeviceStatus(dev).then(() => { paintStatus(); render(); });
  await render();
  const tick = setInterval(render, 500);

  api.get('/api/student/summary').then((s) => {
    classes.replaceChildren(h('h2', t('me.myClasses')), ...(s.groups.length ? s.groups.map((g) => h('a.groupcard', { href: '#/me/attendance' }, h('div', h('strong', g.group.name), h('div.muted.small', g.group.teacher_name)),
      h('div.row', h('span.muted.small', `${fmtPct(g.stats?.rate)} ${t('me.rate')}`), h('span.muted.small', `${g.stats?.absences ?? 0} ${t('me.abs')}`), flagChip(g.flag)))) : [h('p.muted', t('me.noClasses'))]));
  }).catch(() => {});
  return () => clearInterval(tick);
}
