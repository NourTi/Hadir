// The download page: strings in English and Arabic, language and theme switches.
import { addStrings, initLang, setLang, lang, onLang, t } from './i18n.js';
import { icon, theme } from './ui.js';

addStrings({
  en: {
    'nav.skip': 'Skip to content', 'nav.install': 'Install', 'nav.students': 'Students', 'nav.faq': 'Questions', 'nav.home': 'Home',
    'hero.kicker': 'Hadir for desktop', 'hero.title': 'Take Hadir to your own computer.',
    'hero.lead': 'Free. Your classes, students and grades stay on your computer, in a folder you own. Nothing to host and nothing to pay for.',
    'dl.win': 'Download for Windows', 'dl.portable': 'Portable version, no install', 'dl.other': 'macOS and Linux: build it from the source in two commands.', 'dl.otherLink': 'See how',
    'fact.os': 'Windows 10 or 11, 64-bit', 'fact.priv': 'No tracking, no outside requests', 'fact.lang': 'English and Arabic', 'fact.off': 'Roll call with no internet',
    'shot.cap': 'Hadir on the desktop, with an educator’s own portal.',
    'inst.title': 'Installed in four steps',
    'inst.1.t': 'Download', 'inst.1.b': 'Use the green button above. The installer is about 95 MB.',
    'inst.2.t': 'Open it', 'inst.2.b': 'Windows may say “Windows protected your PC”, because the app is new and not yet signed. Choose More info, then Run anyway.',
    'inst.3.t': 'Create your account', 'inst.3.b': 'Enter your name and email, add your title and subjects, and pick a colour. Save the recovery code it shows you: it is how you get back in if you forget your password.',
    'inst.4.t': 'Add a class', 'inst.4.b': 'Create a group, paste your student list or let students join with a QR code, and start your first roll call.',
    'stu.title': 'How your students connect', 'stu.lead': 'A phone only creates its signing key on a secure https address, so students need a link that opens on https. You set it up once.',
    'stu.1': 'Make a free static address that points to your computer, for example an ngrok static domain.', 'stu.2': 'In Hadir, open Settings, Student address, and paste it.',
    'stu.3': 'Open Student access, show the class QR code, and students join from their phones.', 'stu.4': 'From then on, roll call needs no internet in the room: students show their code, you scan it.',
    'feat.title': 'What you get',
    'f.1.t': 'Offline roll call', 'f.1.b': 'Signed QR codes, checked on your device. A screenshot cannot fake one.',
    'f.2.t': 'Your own portal', 'f.2.b': 'Your title, university, subjects and colour. Colleagues can create their own accounts on the same computer, and cannot see yours.',
    'f.3.t': 'Grades and excuses', 'f.3.b': 'Grades out of 20 with CEFR levels, and excuses with proof you approve in one tap.',
    'f.4.t': 'Automatic follow-up', 'f.4.b': 'Alerts after 2 and 3 absences, deadline reminders and a weekly digest. Formal notices wait for your approval.',
    'f.5.t': 'Reports', 'f.5.b': 'The semester on one sheet. Print it or open the CSV in Excel.',
    'f.6.t': 'Private by design', 'f.6.b': 'Data stays in your folder. Passwords are hashed, accounts lock after repeated failures, and there is a recovery code if you forget yours.',
    'src.title': 'Source code and other systems', 'src.lead': 'Hadir is open for you to read. Every release lists a checksum so you can verify your download.', 'src.repo': 'View the repository', 'src.releases': 'All releases',
    'faq.title': 'Questions',
    'faq.1.q': 'Is it really free?', 'faq.1.a': 'Yes. There is no hosting, no database to rent and no subscription. It runs on your computer.',
    'faq.2.q': 'Where is my data?', 'faq.2.a': 'In your app-data folder, for example %APPDATA%\\Hadir on Windows. Use Hadir, Back up now, in the app menu, to copy it somewhere safe.',
    'faq.3.q': 'I forgot my password.', 'faq.3.a': 'Choose Forgot your password on the sign-in page and enter your email, your recovery code and a new password. No code? The owner of the computer can issue a one-time code from Settings.',
    'faq.4.q': 'Does roll call need internet?', 'faq.4.a': 'No. Students join once, online. After that the codes are made on their phones and checked on your computer, in a room with no network at all.',
    'faq.5.q': 'Can colleagues use it too?', 'faq.5.a': 'Yes. Each educator creates an account on the same computer, or installs their own copy. Educators never see each other’s classes.',
    'foot.by': 'by Nour Mohammed Abdessamed', 'meta.title': 'Download Hadir for your computer',
  },
  ar: {
    'nav.skip': 'انتقل إلى المحتوى', 'nav.install': 'التثبيت', 'nav.students': 'الطلبة', 'nav.faq': 'أسئلة', 'nav.home': 'الرئيسية',
    'hero.kicker': 'حاضر لسطح المكتب', 'hero.title': 'خذ «حاضر» إلى حاسوبك.',
    'hero.lead': 'مجاني. أفواجك وطلبتك وعلاماتك تبقى على حاسوبك، في مجلد تملكه. لا استضافة ولا اشتراك.',
    'dl.win': 'تحميل لنظام ويندوز', 'dl.portable': 'نسخة محمولة دون تثبيت', 'dl.other': 'ماك ولينكس: ابنِه من الشفرة المصدرية بأمرين.', 'dl.otherLink': 'كيف؟',
    'fact.os': 'ويندوز 10 أو 11، 64 بت', 'fact.priv': 'بلا تتبّع وبلا طلبات خارجية', 'fact.lang': 'العربية والإنجليزية', 'fact.off': 'تسجيل الحضور دون إنترنت',
    'shot.cap': '«حاضر» على سطح المكتب، ببوابة خاصة بالأستاذ.',
    'inst.title': 'التثبيت في أربع خطوات',
    'inst.1.t': 'حمّل', 'inst.1.b': 'استعمل الزر الأخضر أعلاه. حجم المثبّت نحو 95 ميغابايت.',
    'inst.2.t': 'افتحه', 'inst.2.b': 'قد يعرض ويندوز «Windows protected your PC» لأن التطبيق جديد وغير موقّع بعد. اختر More info ثم Run anyway.',
    'inst.3.t': 'أنشئ حسابك', 'inst.3.b': 'أدخل اسمك وبريدك، وأضف لقبك ومقاييسك واختر لونًا. احفظ رمز الاسترداد الذي يظهر لك: به تعود إذا نسيت كلمة سرك.',
    'inst.4.t': 'أضف فوجًا', 'inst.4.b': 'أنشئ فوجًا، والصق قائمة طلبتك أو دعهم ينضمون برمز QR، وابدأ أول تسجيل حضور.',
    'stu.title': 'كيف يتصل طلبتك', 'stu.lead': 'لا ينشئ الهاتف مفتاح التوقيع إلا على عنوان https آمن، لذلك يحتاج الطلبة إلى رابط يفتح على https. تعدّه مرة واحدة.',
    'stu.1': 'أنشئ عنوانًا ثابتًا مجانيًا يشير إلى حاسوبك، مثل نطاق ngrok الثابت.', 'stu.2': 'في «حاضر» افتح الإعدادات ثم عنوان الطلبة والصقه.',
    'stu.3': 'افتح «دخول الطلبة» واعرض رمز QR للفوج، وينضم الطلبة من هواتفهم.', 'stu.4': 'بعدها لا يحتاج تسجيل الحضور إلى إنترنت في القاعة: يعرض الطلبة رمزهم وتمسحه أنت.',
    'feat.title': 'ما تحصل عليه',
    'f.1.t': 'حضور دون إنترنت', 'f.1.b': 'رموز QR موقّعة تُفحص على جهازك. ولا تنفع لقطة الشاشة.',
    'f.2.t': 'بوابتك الخاصة', 'f.2.b': 'لقبك وجامعتك ومقاييسك ولونك. ويستطيع زملاؤك إنشاء حساباتهم على الحاسوب نفسه دون أن يروا حسابك.',
    'f.3.t': 'العلامات والتبريرات', 'f.3.b': 'علامات على 20 مع مستويات CEFR، وتبريرات مرفقة بدليل تقبلها بضغطة واحدة.',
    'f.4.t': 'متابعة تلقائية', 'f.4.b': 'تنبيهات بعد غيابين وثلاثة، وتذكير بالمواعيد وملخص أسبوعي. والإنذارات الرسمية تنتظر موافقتك.',
    'f.5.t': 'التقارير', 'f.5.b': 'السداسي كله في ورقة واحدة. اطبعها أو افتح ملف CSV في إكسل.',
    'f.6.t': 'خصوصية بالتصميم', 'f.6.b': 'البيانات في مجلدك. كلمات السر مشفّرة، والحساب يُقفل بعد محاولات فاشلة، وهناك رمز استرداد إن نسيت كلمة سرك.',
    'src.title': 'الشفرة المصدرية وأنظمة أخرى', 'src.lead': '«حاضر» مفتوح لتقرأه. يحمل كل إصدار بصمة للتحقق من تحميلك.', 'src.repo': 'عرض المستودع', 'src.releases': 'كل الإصدارات',
    'faq.title': 'أسئلة',
    'faq.1.q': 'هل هو مجاني فعلًا؟', 'faq.1.a': 'نعم. لا استضافة ولا قاعدة بيانات مدفوعة ولا اشتراك. يعمل على حاسوبك.',
    'faq.2.q': 'أين بياناتي؟', 'faq.2.a': 'في مجلد بيانات التطبيق، مثل %APPDATA%\\Hadir في ويندوز. استعمل من قائمة التطبيق «Back up now» لنسخها إلى مكان آمن.',
    'faq.3.q': 'نسيت كلمة السر.', 'faq.3.a': 'اختر «نسيت كلمة السر» في صفحة الدخول وأدخل بريدك ورمز الاسترداد وكلمة سر جديدة. ليس لديك رمز؟ يستطيع مالك الحاسوب إصدار رمز لمرة واحدة من الإعدادات.',
    'faq.4.q': 'هل يحتاج تسجيل الحضور إلى إنترنت؟', 'faq.4.a': 'لا. ينضم الطلبة مرة واحدة عبر الإنترنت. بعدها تُصنع الرموز على هواتفهم وتُفحص على حاسوبك، في قاعة بلا شبكة إطلاقًا.',
    'faq.5.q': 'هل يستعمله زملائي أيضًا؟', 'faq.5.a': 'نعم. ينشئ كل أستاذ حسابًا على الحاسوب نفسه، أو يثبّت نسخته. ولا يرى الأساتذة أفواج بعضهم.',
    'foot.by': 'من إعداد نور محمد عبد الصمد', 'meta.title': 'تحميل «حاضر» لحاسوبك',
  },
});

const $ = (s, r = document) => r.querySelector(s);
const themeCtl = theme(); themeCtl.init();
const dark = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
function paint() {
  document.title = t('meta.title');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  const b = $('#langBtn'); b.textContent = lang() === 'ar' ? 'English' : 'العربية'; b.lang = lang() === 'ar' ? 'en' : 'ar';
  $('#themeBtn').replaceChildren(icon(dark() ? 'sun' : 'moon', 20)); $('#themeBtn').setAttribute('aria-label', t('common.theme'));
}
$('#langBtn').addEventListener('click', () => setLang(lang() === 'ar' ? 'en' : 'ar'));
$('#themeBtn').addEventListener('click', () => { themeCtl.set(dark() ? 'light' : 'dark'); paint(); });
for (const el of document.querySelectorAll('[data-icon]')) el.replaceChildren(icon(el.dataset.icon, el.closest('.btn') ? 20 : 22));
onLang(paint); initLang(); paint();
