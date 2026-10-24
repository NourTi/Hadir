// Today: what is on, what is running, what needs you, and whether this phone is ready for a room with no Wi-Fi.
import { h, icon, toast, openModal, empty, errorState, chip, field } from '../ui.js';
import { t, addStrings, fmtDateLong, fmtDate, fmtTime, fmtPct, fmtDateTime } from '../i18n.js';
import { api } from '../api.js';
import { pageHead, sheet, stat, select } from '../kit.js';
import { getBundle, ensureBundle, loadBundle, startOrResume, listLocal } from '../offline.js';

addStrings({
  en: {
    'today.morning': 'Good morning, {name}', 'today.afternoon': 'Good afternoon, {name}', 'today.evening': 'Good evening, {name}',
    'today.newRoll': 'New roll call', 'today.pickGroup': 'Choose a group', 'today.topic': 'Topic (optional)', 'today.start': 'Start roll call', 'today.noGroups': 'Add a group first', 'today.noGroupsText': 'Create a group and add its students, then you can start a roll call.', 'today.addGroup': 'Add a group',
    'today.stat.week': 'Attendance this week', 'today.stat.weekHint': 'Present or late, excused left out', 'today.stat.risk': 'At risk', 'today.stat.riskHint': 'Over the notice limit',
    'today.stat.excuses': 'Excuses to review', 'today.stat.messages': 'Messages to approve', 'today.stat.scans': 'Scans to review', 'today.stat.phones': 'New phones to approve',
    'today.classes': "Today's classes", 'today.noClasses': 'No classes scheduled today', 'today.noClassesText': 'Classes show here on the days in your group schedule. You can still start a roll call at any time.',
    'today.startBtn': 'Start roll call', 'today.continue': 'Continue', 'today.view': 'View', 'today.running': 'Running now', 'today.runningHint': 'Started on this phone or the server. Continue to keep scanning.',
    'today.recent': 'Recent sessions', 'today.col.when': 'When', 'today.col.group': 'Group', 'today.col.present': 'Present', 'today.col.late': 'Late', 'today.col.absent': 'Absent',
    'today.upcoming': 'Coming up', 'today.noUpcoming': 'No assessments with a date', 'today.due': 'Due {date}',
    'today.ready': 'Offline readiness', 'today.readyOk': 'Ready for a room with no Wi-Fi', 'today.readyOkText': '{students} students in {groups} groups are saved on this phone. Updated {time}.',
    'today.readyNone': 'Not saved on this phone yet', 'today.readyNoneText': 'Connect to the internet and download your class lists before you walk into class.', 'today.refresh': 'Refresh offline data', 'today.refreshed': 'Class lists updated on this phone.',
    'today.offlineView': 'Showing what is saved on this phone. Some numbers return when you are back online.', 'today.noRecent': 'No closed sessions yet',
    'today.waiting': '{n} scans waiting to upload',
  },
  ar: {
    'today.morning': 'صباح الخير، {name}', 'today.afternoon': 'مساء الخير، {name}', 'today.evening': 'مساء الخير، {name}',
    'today.newRoll': 'حصة جديدة', 'today.pickGroup': 'اختر الفوج', 'today.topic': 'موضوع الحصة (اختياري)', 'today.start': 'ابدأ تسجيل الحضور', 'today.noGroups': 'أضف فوجًا أولًا', 'today.noGroupsText': 'أنشئ فوجًا وأضف طلبته، ثم يمكنك بدء تسجيل الحضور.', 'today.addGroup': 'إضافة فوج',
    'today.stat.week': 'الحضور هذا الأسبوع', 'today.stat.weekHint': 'حاضر أو متأخر، دون الغياب المبرَّر', 'today.stat.risk': 'مهدَّدون بالإقصاء', 'today.stat.riskHint': 'تجاوزوا حدّ الإنذار',
    'today.stat.excuses': 'تبريرات للمراجعة', 'today.stat.messages': 'رسائل تنتظر موافقتك', 'today.stat.scans': 'عمليات مسح للمراجعة', 'today.stat.phones': 'هواتف جديدة للموافقة',
    'today.classes': 'حصص اليوم', 'today.noClasses': 'لا توجد حصص مبرمجة اليوم', 'today.noClassesText': 'تظهر الحصص هنا في الأيام الموجودة في جدول الفوج. ويمكنك بدء تسجيل الحضور في أي وقت.',
    'today.startBtn': 'ابدأ الحضور', 'today.continue': 'متابعة', 'today.view': 'عرض', 'today.running': 'جارية الآن', 'today.runningHint': 'بدأت على هذا الهاتف أو على الخادم. تابع لمواصلة المسح.',
    'today.recent': 'آخر الحصص', 'today.col.when': 'التاريخ', 'today.col.group': 'الفوج', 'today.col.present': 'حاضر', 'today.col.late': 'متأخر', 'today.col.absent': 'غائب',
    'today.upcoming': 'قريبًا', 'today.noUpcoming': 'لا توجد تقييمات بتاريخ محدد', 'today.due': 'الموعد {date}',
    'today.ready': 'الجاهزية بدون إنترنت', 'today.readyOk': 'جاهز لقاعة بلا شبكة', 'today.readyOkText': 'قوائم {students} طالبًا في {groups} أفواج محفوظة على هذا الهاتف. آخر تحديث {time}.',
    'today.readyNone': 'لم تُحفظ بعد على هذا الهاتف', 'today.readyNoneText': 'اتصل بالإنترنت وحمّل قوائم الأفواج قبل دخولك إلى القاعة.', 'today.refresh': 'تحديث البيانات المحفوظة', 'today.refreshed': 'تم تحديث قوائم الأفواج على هذا الهاتف.',
    'today.offlineView': 'تُعرض البيانات المحفوظة على هذا الهاتف. تعود بقية الأرقام عند الاتصال بالإنترنت.', 'today.noRecent': 'لا توجد حصص مغلقة بعد',
    'today.waiting': '{n} عمليات مسح في انتظار الرفع',
  },
});

// A short line from English writing, a different one each day. Public-domain authors only.
const QUOTES = [['The limits of my language mean the limits of my world.', 'Ludwig Wittgenstein'], ['Language is the dress of thought.', 'Samuel Johnson'], ['Nothing great was ever achieved without enthusiasm.', 'Ralph Waldo Emerson'],
  ['No one is useless in this world who lightens the burden of another.', 'Charles Dickens'], ['There is no charm equal to tenderness of heart.', 'Jane Austen'], ['The man who does not read good books has no advantage over the man who cannot read them.', 'Mark Twain'],
  ['Words are, of course, the most powerful drug used by mankind.', 'Rudyard Kipling'], ['A word after a word after a word is power.', 'Margaret Atwood'], ['We read to know we are not alone.', 'William Nicholson'],
  ['What is food to one is bitter poison to another.', 'Lucretius'], ['Tell me and I forget. Teach me and I remember. Involve me and I learn.', 'Benjamin Franklin (attributed)']];
const quoteOfDay = () => QUOTES[Math.floor(Date.now() / 864e5) % QUOTES.length];
const greeting = (name) => { const hr = new Date().getHours(); return t(hr < 12 ? 'today.morning' : hr < 18 ? 'today.afternoon' : 'today.evening', { name: name.split(/\s+/).slice(0, 2).join(' ') }); };

// With no connection, build the same picture from what the phone saved.
function fromBundle(bundle, locals) {
  const day = new Date().getDay();
  const today = (bundle?.groups || []).filter((g) => g.schedule.some((s) => s.day === day)).map((g) => {
    const slot = g.schedule.find((s) => s.day === day);
    return { group_id: g.id, name: g.name, start: slot.start, end: slot.end, room: slot.room, session_id: null };
  });
  const open = locals.filter((s) => s.status === 'open').map((s) => ({ id: s.id, group_id: s.group_id, group_name: s.group_name, starts_at: s.starts_at }));
  return { offline: true, today, open_sessions: open, recent_sessions: [], counts: {}, upcoming: [], week_rate: null };
}

export default async function mount(root, params, app) {
  app.setTitle(t('nav.today'));
  const [bundle, locals] = await Promise.all([ensureBundle().catch(() => getBundle()), listLocal()]);
  let dash;
  try { dash = await api.get('/api/dashboard'); } catch (e) { if (!e.offline) throw e; dash = fromBundle(bundle, locals); }
  const groups = bundle?.groups || [];

  const startFlow = (preset) => {
    if (!groups.length) { app.go('/classes'); return; }
    let groupId = preset || groups[0].id;
    const topic = h('input.input', { type: 'text', maxlength: 120, placeholder: t('today.topic') });
    openModal({
      title: t('today.newRoll'), size: 'sm',
      body: [field(t('common.group'), select(groups.map((g) => [g.id, g.name]), groupId, (v) => { groupId = v; })), field(t('today.topic'), topic)],
      actions: [{ label: t('common.cancel') }, { label: t('today.start'), kind: 'primary', onClick: async ({ close }) => {
        try { const s = await startOrResume(groupId, topic.value.trim()); close(); app.go(`/scan/${s.id}`); } catch (e) { toast(e.code === 'no_bundle' ? t('today.readyNoneText') : e.message, 'error'); return false; }
      } }],
    });
  };

  const openIds = new Set(dash.open_sessions.map((s) => s.id));
  const classRow = (c) => {
    const running = c.session_id && openIds.has(c.session_id);
    const done = c.session_id && !running;
    return h('div.classcard',
      h('span.classcard__time.num', c.start),
      h('div', h('p.classcard__name', c.name), h('p.classcard__sub', [c.end ? `${c.start}–${c.end}` : c.start, c.room ? ` · ${c.room}` : ''].join(''))),
      done ? h('a.btn.btn--ghost.btn--sm', { href: `#/session/${c.session_id}` }, t('today.view'))
        : h('button.btn.btn--primary.btn--sm', { type: 'button', onclick: async () => { if (running) app.go(`/scan/${c.session_id}`); else startFlow(c.group_id); } }, running ? t('today.continue') : t('today.startBtn')));
  };

  const c = dash.counts || {};
  const stats = h('div.stats',
    stat({ label: t('today.stat.week'), value: dash.week_rate == null ? '–' : fmtPct(dash.week_rate), hint: t('today.stat.weekHint'), ic: 'chart' }),
    stat({ label: t('today.stat.risk'), value: c.at_risk ?? '–', hint: t('today.stat.riskHint'), tone: 'alert', href: '#/reports', ic: 'alert' }),
    stat({ label: t('today.stat.excuses'), value: c.pending_excuses ?? '–', tone: 'alert', href: '#/excuses', ic: 'inbox' }),
    stat({ label: t('today.stat.messages'), value: c.pending_messages ?? '–', tone: 'alert', href: '#/automation/approve', ic: 'send' }),
    c.review_scans ? stat({ label: t('today.stat.scans'), value: c.review_scans, tone: 'alert', ic: 'scan' }) : null,
    c.pending_devices ? stat({ label: t('today.stat.phones'), value: c.pending_devices, tone: 'alert', href: '#/settings', ic: 'phone' }) : null);

  const running = dash.open_sessions.length ? sheet(t('today.running'), h('div', dash.open_sessions.map((s) =>
    h('div.classcard', h('span.classcard__time.num', fmtTime(s.starts_at)), h('div', h('p.classcard__name', s.group_name), h('p.classcard__sub', fmtDate(s.starts_at))),
      h('a.btn.btn--primary.btn--sm', { href: `#/scan/${s.id}` }, t('today.continue')))))) : null;

  const classes = sheet(t('today.classes'), dash.today.length ? h('div', dash.today.map(classRow)) : empty(t('today.noClasses'), t('today.noClassesText'),
    groups.length ? h('button.btn.btn--ghost', { type: 'button', onclick: () => startFlow() }, t('today.newRoll')) : h('a.btn.btn--primary', { href: '#/classes' }, t('today.addGroup'))));

  const recent = sheet(t('today.recent'), dash.recent_sessions.length ? h('table.ledger',
    h('thead', h('tr', h('th', t('today.col.when')), h('th', t('today.col.group')), h('th.num', t('today.col.present')), h('th.num', t('today.col.late')), h('th.num', t('today.col.absent')))),
    h('tbody', dash.recent_sessions.map((s) => h('tr', h('td', h('a.link', { href: `#/session/${s.id}` }, fmtDateTime(s.starts_at))), h('td', s.group_name),
      h('td.num', s.attendance_counts.present || 0), h('td.num', s.attendance_counts.late || 0), h('td.num', s.attendance_counts.absent || 0))))) : empty(t('today.noRecent')), null, { flush: true });

  // offline readiness
  const readyBody = h('div.stack.stack--sm');
  const paintReady = (b) => {
    readyBody.replaceChildren();
    if (b) {
      const students = new Set(b.groups.flatMap((g) => g.roster.map((r) => r.id))).size;
      readyBody.append(h('div.ready', icon('check', 22), h('div', h('strong', t('today.readyOk')), h('p.muted.small', t('today.readyOkText', { students, groups: b.groups.length, time: fmtDateTime(b.fetched_at) })))));
    } else readyBody.append(h('div.callout.callout--warn', icon('alert', 18), h('div', h('strong', t('today.readyNone')), h('p', t('today.readyNoneText')))));
    readyBody.append(h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: async (e) => {
      e.currentTarget.disabled = true;
      try { const nb = await loadBundle(); paintReady(nb); toast(t('today.refreshed'), 'ok'); } catch (er) { toast(er.message, 'error'); e.currentTarget.disabled = false; }
    } }, icon('sync', 15), t('today.refresh')));
  };
  paintReady(bundle);

  const upcoming = sheet(t('today.upcoming'), dash.upcoming.length ? h('ul.ledger-list', dash.upcoming.map((a) => h('li', h('div.grow', h('strong', a.title), h('p.muted.small', a.group_name)), h('span.muted.small', t('today.due', { date: fmtDate(a.due_at) }))))) : empty(t('today.noUpcoming')), null, { flush: true });

  root.append(
    h('section.hero-band', h('div.hero-band__text', h('p.hero-band__date', fmtDateLong(Date.now())), h('h1', greeting(app.user.full_name)), h('blockquote.hero-band__quote', quoteOfDay()[0], h('cite', quoteOfDay()[1]))),
      h('button.btn.btn--primary.btn--lg', { type: 'button', onclick: () => startFlow() }, icon('scan', 18), t('today.newRoll'))),
    h('div.stack.stack--lg',
      dash.offline ? h('div.callout.callout--warn', icon('wifioff', 18), t('today.offlineView')) : null,
      stats, running,
      h('div.cols.cols--wide', h('div.stack', classes, recent), h('div.stack', sheet(t('today.ready'), readyBody), upcoming))));
}
