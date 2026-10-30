// "Student access": one QR code per class. A student scans it, types their own name and ID, and is in the class. No list to prepare.
import { h, icon, toast, confirmDialog, empty } from '../ui.js';
import { t, addStrings } from '../i18n.js';
import { api } from '../api.js';
import { qrSvg } from '../qr.js';
import { pageHead, sheet, groupPicker, printPage } from '../kit.js';

addStrings({
  en: {
    'ac.title': 'Student access', 'ac.sub': 'Show this QR code in class. Each student scans it with their own phone, types their name and student ID, and joins. You do not need to prepare a list.',
    'ac.noGroups': 'Create a class first', 'ac.noGroupsText': 'Each class gets its own QR code.', 'ac.newGroup': 'New group',
    'ac.link': 'Join link for {group}', 'ac.copy': 'Copy link', 'ac.copied': 'Link copied.', 'ac.print': 'Print for the classroom', 'ac.scan': 'Scan to join {group}', 'ac.scanSub': 'Open the camera on your phone, scan this code, then enter your name and student ID.',
    'ac.open': 'Joining is open', 'ac.closed': 'Joining is closed', 'ac.close': 'Close joining', 'ac.reopen': 'Open joining', 'ac.closedHint': 'New students cannot join until you open it again. Students already in the class are not affected.',
    'ac.renew': 'Make a new code', 'ac.renewTitle': 'Replace this QR code?', 'ac.renewText': 'The printed or shown code stops working. Students already in the class keep their accounts.', 'ac.renewed': 'New code created.',
    'ac.ok': 'This address is secure and reachable from phones.', 'ac.localTitle': 'Students cannot open this address yet',
    'ac.localText': 'You are on {host}, which only exists on this computer. Phones cannot reach it, and phones only create their secure key on https addresses. Open this page from your hosted https address instead.',
    'ac.steps': 'What each student does', 'ac.s1': 'Scans the QR code with the phone camera and opens the page.', 'ac.s2': 'Types their full name, student ID and a password they choose.', 'ac.s3': 'Sees their own QR code, which changes every 30 seconds. You scan it at roll call.',
    'ac.review': 'After students join', 'ac.reviewText': 'Check the list in Classes. A wrong or fake entry can be removed from the row menu. If a student changes phone, approve the new one in Settings.', 'ac.goClasses': 'Open Classes',
  },
  ar: {
    'ac.title': 'دخول الطلبة', 'ac.sub': 'اعرض هذا الرمز في القاعة. يمسحه كل طالب بهاتفه، ويكتب اسمه ورقمه الجامعي، وينضم. لا حاجة لتحضير قائمة.',
    'ac.noGroups': 'أنشئ فوجًا أولًا', 'ac.noGroupsText': 'لكل فوج رمز QR خاص به.', 'ac.newGroup': 'فوج جديد',
    'ac.link': 'رابط الانضمام إلى {group}', 'ac.copy': 'نسخ الرابط', 'ac.copied': 'تم نسخ الرابط.', 'ac.print': 'طباعة للقاعة', 'ac.scan': 'امسح للانضمام إلى {group}', 'ac.scanSub': 'افتح كاميرا هاتفك وامسح هذا الرمز، ثم أدخل اسمك ورقمك الجامعي.',
    'ac.open': 'الانضمام مفتوح', 'ac.closed': 'الانضمام مغلق', 'ac.close': 'إغلاق الانضمام', 'ac.reopen': 'فتح الانضمام', 'ac.closedHint': 'لا يستطيع طلبة جدد الانضمام حتى تفتحه من جديد. لا يتأثر الطلبة المسجلون.',
    'ac.renew': 'إنشاء رمز جديد', 'ac.renewTitle': 'استبدال هذا الرمز؟', 'ac.renewText': 'يتوقف الرمز المطبوع أو المعروض عن العمل. يحتفظ الطلبة المنضمون بحساباتهم.', 'ac.renewed': 'تم إنشاء رمز جديد.',
    'ac.ok': 'هذا العنوان آمن ويمكن الوصول إليه من الهواتف.', 'ac.localTitle': 'لا يستطيع الطلبة فتح هذا العنوان بعد',
    'ac.localText': 'أنت على {host}، وهو موجود على هذا الحاسوب فقط. لا تصل إليه الهواتف، ولا تنشئ الهواتف مفتاحها الآمن إلا على عناوين https. افتح هذه الصفحة من عنوانك المستضاف على https.',
    'ac.steps': 'ما يفعله كل طالب', 'ac.s1': 'يمسح الرمز بكاميرا الهاتف ويفتح الصفحة.', 'ac.s2': 'يكتب اسمه الكامل ورقمه الجامعي وكلمة سر يختارها.', 'ac.s3': 'يرى رمز QR الخاص به، وهو يتغير كل 30 ثانية. تمسحه أنت عند تسجيل الحضور.',
    'ac.review': 'بعد انضمام الطلبة', 'ac.reviewText': 'راجع القائمة في «الأفواج». يمكن حذف أي إدخال خاطئ أو وهمي من قائمة الصف. وإذا غيّر طالب هاتفه فوافق على الجديد من الإعدادات.', 'ac.goClasses': 'فتح الأفواج',
  },
});

export default async function mount(root, params, app) {
  app.setTitle(t('ac.title'));
  const { groups } = await api.get('/api/groups');
  if (!groups.length) { root.append(pageHead(t('ac.title'), t('ac.sub')), empty(t('ac.noGroups'), t('ac.noGroupsText'), h('a.btn.btn--primary', { href: '#/classes' }, t('ac.newGroup')))); return; }
  const gid = groups.some((g) => g.id === params.id) ? params.id : groups[0].id;
  const group = groups.find((g) => g.id === gid);
  const baseUrl = app.config?.public_url || location.origin;
  const host = new URL(baseUrl).hostname;
  const privateHost = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  const secure = new URL(baseUrl).protocol === 'https:' && !privateHost;
  let info = await api.post(`/api/groups/${gid}/join`, {});
  const body = h('div.stack.stack--lg');

  const link = () => `${baseUrl}/app/#/join/${info.token}`;
  const apply = async (patch) => { info = await api.post(`/api/groups/${gid}/join`, patch); draw(); };

  function draw() {
    const qr = h('div.access__qr'); qr.innerHTML = qrSvg(link(), { ecl: 'M', border: 2, label: 'Hadir join code' });
    const status = secure ? h('div.callout', icon('check', 18), h('div', t('ac.ok')))
      : h('div.callout.callout--warn', icon('alert', 18), h('div.stack.stack--sm', h('strong', t('ac.localTitle')), h('p', t('ac.localText', { host }))));
    body.replaceChildren(status,
      h('div.cols',
        sheet(t('ac.link', { group: group.course_name || group.name }), h('div.stack',
          h('div.access__poster', { class: info.open ? '' : 'is-closed' }, h('p.access__scan', t('ac.scan', { group: group.course_name || group.name })), qr, h('p.access__sub', t('ac.scanSub'))),
          h('div.access__url.ltr.no-print', link()),
          h('div.row.no-print', h('button.btn.btn--primary', { type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(link()); toast(t('ac.copied'), 'ok'); } catch { toast(link()); } } }, icon('file', 16), t('ac.copy')),
            h('button.btn.btn--ghost', { type: 'button', onclick: printPage }, icon('print', 16), t('ac.print'))))),
        h('div.stack',
          sheet(t(info.open ? 'ac.open' : 'ac.closed'), h('div.stack', info.open ? null : h('p.muted', t('ac.closedHint')),
            h('div.row', h('button.btn.btn--ghost', { type: 'button', onclick: () => apply({ open: !info.open }) }, t(info.open ? 'ac.close' : 'ac.reopen')),
              h('button.btn.btn--ghost', { type: 'button', onclick: async () => { if (await confirmDialog({ title: t('ac.renewTitle'), message: t('ac.renewText'), confirmLabel: t('ac.renew') })) { await apply({ regenerate: true }); toast(t('ac.renewed'), 'ok'); } } }, t('ac.renew'))))),
          sheet(t('ac.steps'), h('ol.steps', [t('ac.s1'), t('ac.s2'), t('ac.s3')].map((x) => h('li', x)))),
          sheet(t('ac.review'), h('div.stack', h('p', t('ac.reviewText')), h('div.row.no-print', h('a.btn.btn--ghost', { href: `#/classes/${gid}` }, t('ac.goClasses'))))))));
  }
  root.append(pageHead(t('ac.title'), t('ac.sub'), groupPicker(groups, gid, (v) => app.go(`/access/${v}`))), body);
  draw();
}
