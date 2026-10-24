// English and Arabic. Each screen registers its own strings with addStrings(); shared ones live here.
const KEY = 'hadir.lang';
const dict = { en: {}, ar: {} };
let current = 'en';
const subs = new Set();

export function addStrings(s) { for (const l of ['en', 'ar']) Object.assign(dict[l], s[l] || {}); }
export const lang = () => current;
export const isRtl = () => current === 'ar';
export const onLang = (fn) => { subs.add(fn); return () => subs.delete(fn); };

export function t(key, vars) {
  let s = dict[current][key] ?? dict.en[key];
  if (s === undefined) { if (globalThis.HADIR_DEV) console.warn('missing string', key); return key; }
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}

export function setLang(l, { persist = true } = {}) {
  current = l === 'ar' ? 'ar' : 'en';
  const root = document.documentElement;
  root.lang = current; root.dir = current === 'ar' ? 'rtl' : 'ltr';
  if (persist) { try { localStorage.setItem(KEY, current); } catch { /* ignore */ } }
  subs.forEach((fn) => fn(current));
}
export function initLang() {
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
  const guess = saved || 'en';
  setLang(guess, { persist: false });
}

// Dates and numbers: Latin digits in both languages (the usual choice in Algerian universities).
const locale = () => (current === 'ar' ? 'ar-DZ-u-nu-latn' : 'en-GB');
const cache = new Map();
function fmt(kind, opts) {
  const k = kind + current;
  if (!cache.has(k)) cache.set(k, new Intl.DateTimeFormat(locale(), opts));
  return cache.get(k);
}
export const fmtDate = (ms) => fmt('d', { weekday: 'short', day: 'numeric', month: 'short' }).format(ms);
export const fmtDateLong = (ms) => fmt('dl', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(ms);
export const fmtShort = (ms) => fmt('s', { day: 'numeric', month: 'short' }).format(ms);
export const fmtTime = (ms) => fmt('t', { hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);
export const fmtDateTime = (ms) => `${fmtShort(ms)}, ${fmtTime(ms)}`;
export const fmtPct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
export const fmtNum = (n, d = 2) => (n == null ? '–' : new Intl.NumberFormat(locale(), { maximumFractionDigits: d }).format(n));

addStrings({
  en: {
    'status.present': 'Present', 'status.late': 'Late', 'status.absent': 'Absent', 'status.excused': 'Excused', 'status.none': 'Not yet',
    'flag.ok': 'On track', 'flag.warn': 'Warning', 'flag.risk': 'At risk',
    'err.offline': 'You are offline. Connect to the internet and try again.', 'err.server': 'Something went wrong on the server. Try again in a moment.',
    'common.save': 'Save', 'common.cancel': 'Cancel', 'common.close': 'Close', 'common.delete': 'Delete', 'common.edit': 'Edit', 'common.add': 'Add', 'common.remove': 'Remove',
    'common.confirm': 'Confirm', 'common.back': 'Back', 'common.retry': 'Try again', 'common.loading': 'Loading', 'common.search': 'Search', 'common.yes': 'Yes', 'common.no': 'No',
    'common.download': 'Download', 'common.print': 'Print', 'common.open': 'Open', 'common.all': 'All', 'common.none': 'None', 'common.copy': 'Copy', 'common.copied': 'Copied.',
    'common.name': 'Name', 'common.date': 'Date', 'common.status': 'Status', 'common.note': 'Note', 'common.group': 'Group', 'common.student': 'Student', 'common.students': 'Students',
    'common.offlineNeeded': 'This page needs a connection. Connect to the internet and open it again.', 'common.saved': 'Saved.', 'common.done': 'Done.',
    'common.language': 'Language', 'common.theme': 'Theme', 'common.light': 'Light', 'common.dark': 'Dark', 'common.auto': 'Match device',
  },
  ar: {
    'status.present': 'حاضر', 'status.late': 'متأخر', 'status.absent': 'غائب', 'status.excused': 'غياب مبرَّر', 'status.none': 'لم يُسجَّل بعد',
    'flag.ok': 'منتظم', 'flag.warn': 'تنبيه', 'flag.risk': 'مهدَّد بالإقصاء',
    'err.offline': 'لا يوجد اتصال بالإنترنت. اتصل بالشبكة وحاول من جديد.', 'err.server': 'حدث خطأ في الخادم. حاول مرة أخرى بعد قليل.',
    'common.save': 'حفظ', 'common.cancel': 'إلغاء', 'common.close': 'إغلاق', 'common.delete': 'حذف', 'common.edit': 'تعديل', 'common.add': 'إضافة', 'common.remove': 'إزالة',
    'common.confirm': 'تأكيد', 'common.back': 'رجوع', 'common.retry': 'حاول مجددًا', 'common.loading': 'جارٍ التحميل', 'common.search': 'بحث', 'common.yes': 'نعم', 'common.no': 'لا',
    'common.download': 'تنزيل', 'common.print': 'طباعة', 'common.open': 'فتح', 'common.all': 'الكل', 'common.none': 'لا شيء', 'common.copy': 'نسخ', 'common.copied': 'تم النسخ.',
    'common.name': 'الاسم', 'common.date': 'التاريخ', 'common.status': 'الحالة', 'common.note': 'ملاحظة', 'common.group': 'الفوج', 'common.student': 'الطالب', 'common.students': 'الطلبة',
    'common.offlineNeeded': 'هذه الصفحة تحتاج إلى اتصال بالإنترنت. اتصل بالشبكة ثم افتحها من جديد.', 'common.saved': 'تم الحفظ.', 'common.done': 'تم.',
    'common.language': 'اللغة', 'common.theme': 'المظهر', 'common.light': 'فاتح', 'common.dark': 'داكن', 'common.auto': 'حسب الجهاز',
  },
});
