// "Student access": the web address students open on their phones, as a link and a QR code, plus what must be true for it to work.
import { h, icon, toast } from '../ui.js';
import { t, addStrings } from '../i18n.js';
import { api } from '../api.js';
import { qrSvg } from '../qr.js';
import { pageHead, sheet, printPage } from '../kit.js';

addStrings({
  en: {
    'ac.title': 'Student access', 'ac.sub': 'Students open this address on their own phone, join with the invite code you gave them, and show their code at roll call.',
    'ac.addr': 'Address for students', 'ac.copy': 'Copy address', 'ac.copied': 'Address copied.', 'ac.print': 'Print a poster for the classroom', 'ac.scan': 'Scan to open Hadir',
    'ac.ok': 'Ready: this address is secure (https) and reachable from phones.', 'ac.localTitle': 'Students cannot open this address yet',
    'ac.localText': 'You are on {host}, which only exists on this computer. A phone cannot reach it, and phones only create their secure key on https addresses.',
    'ac.fix': 'Fastest fix: a free tunnel', 'ac.fix1': 'Install cloudflared (free) on this computer.', 'ac.fix2': 'Keep Hadir running, then run: cloudflared tunnel --url http://localhost:3000', 'ac.fix3': 'Open the https address it prints, sign in there, and come back to this page. The QR code will show that address.',
    'ac.steps': 'What each student does', 'ac.s1': 'Scans this QR code or opens the address on their phone.', 'ac.s2': 'Taps “Join with code” and enters their student ID, the invite code, and a new password.', 'ac.s3': 'Keeps the page open or adds it to the home screen. Their code is on the first screen.',
    'ac.codes': 'Where are the invite codes?', 'ac.codesText': 'Open Classes, choose a group, and look at the Account column. A student who lost a code gets a new one from the row menu.', 'ac.goClasses': 'Open Classes',
  },
  ar: {
    'ac.title': 'دخول الطلبة', 'ac.sub': 'يفتح الطلبة هذا العنوان على هواتفهم، وينضمون برمز الدعوة الذي أعطيتهم إياه، ثم يعرضون رمزهم عند تسجيل الحضور.',
    'ac.addr': 'عنوان الطلبة', 'ac.copy': 'نسخ العنوان', 'ac.copied': 'تم نسخ العنوان.', 'ac.print': 'طباعة ملصق للقاعة', 'ac.scan': 'امسح لفتح «حاضر»',
    'ac.ok': 'جاهز: العنوان آمن (https) ويمكن الوصول إليه من الهواتف.', 'ac.localTitle': 'لا يستطيع الطلبة فتح هذا العنوان بعد',
    'ac.localText': 'أنت على {host}، وهو موجود على هذا الحاسوب فقط. لا يصل إليه الهاتف، ولا تنشئ الهواتف مفتاحها الآمن إلا على عناوين https.',
    'ac.fix': 'أسرع حل: نفق مجاني', 'ac.fix1': 'ثبّت cloudflared (مجاني) على هذا الحاسوب.', 'ac.fix2': 'أبقِ «حاضر» يعمل، ثم نفّذ: cloudflared tunnel --url http://localhost:3000', 'ac.fix3': 'افتح عنوان https الذي يظهر، وسجّل الدخول هناك، ثم عد إلى هذه الصفحة. سيعرض رمز QR ذلك العنوان.',
    'ac.steps': 'ما يفعله كل طالب', 'ac.s1': 'يمسح رمز QR هذا أو يفتح العنوان على هاتفه.', 'ac.s2': 'يضغط «الانضمام برمز» ويدخل رقمه الجامعي ورمز الدعوة وكلمة سر جديدة.', 'ac.s3': 'يُبقي الصفحة مفتوحة أو يضيفها إلى الشاشة الرئيسية. رمزه في الشاشة الأولى.',
    'ac.codes': 'أين رموز الدعوة؟', 'ac.codesText': 'افتح «الأفواج» واختر فوجًا وانظر إلى عمود الحساب. من ضاع رمزه يحصل على رمز جديد من قائمة الصف.', 'ac.goClasses': 'فتح الأفواج',
  },
});

export default async function mount(root, params, app) {
  app.setTitle(t('ac.title'));
  const url = `${location.origin}/app/`;
  const host = location.hostname;
  const privateHost = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  const secure = location.protocol === 'https:' && !privateHost;
  const qr = h('div.access__qr'); qr.innerHTML = qrSvg(url, { ecl: 'M', border: 2, label: 'Hadir address' });

  const status = secure ? h('div.callout', icon('check', 18), h('div', t('ac.ok')))
    : h('div.callout.callout--warn', icon('alert', 18), h('div.stack.stack--sm', h('strong', t('ac.localTitle')), h('p', t('ac.localText', { host })), h('strong', t('ac.fix')),
      h('ol.steps', [t('ac.fix1'), t('ac.fix2'), t('ac.fix3')].map((x) => h('li', x)))));

  root.append(pageHead(t('ac.title'), t('ac.sub'), h('button.btn.btn--ghost.no-print', { type: 'button', onclick: printPage }, icon('print', 16), t('ac.print'))),
    h('div.stack.stack--lg', status,
      h('div.cols', sheet(t('ac.addr'), h('div.stack', h('div.access__url.ltr', url), h('div.row.no-print', h('button.btn.btn--primary', { type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(url); toast(t('ac.copied'), 'ok'); } catch { toast(url); } } }, icon('file', 16), t('ac.copy'))),
        h('div.access__poster', qr, h('p.access__scan', t('ac.scan'))))),
        h('div.stack', sheet(t('ac.steps'), h('ol.steps', [t('ac.s1'), t('ac.s2'), t('ac.s3')].map((x) => h('li', x)))),
          sheet(t('ac.codes'), h('div.stack', h('p', t('ac.codesText')), h('div.row.no-print', h('a.btn.btn--ghost', { href: '#/classes' }, t('ac.goClasses')))))))));
}
