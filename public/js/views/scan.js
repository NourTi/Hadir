// Live roll call. Everything here runs on this phone: scanning, checking signatures, and saving. Uploading happens when there is a connection.
import { h, icon, toast, openModal, confirmDialog, empty, errorState, chip, field, loading } from '../ui.js';
import { t, addStrings, fmtTime, fmtDateTime } from '../i18n.js';
import { api } from '../api.js';
import { clock } from '../clock.js';
import * as roll from '../roll.js';
import { openSession, getBundle, loadBundle, rosterOf, saveLocal, syncAll, syncSoon, net, onNet } from '../offline.js';
import { startScanner, cameraAvailable, feedback } from '../scanner.js';
import { signCode } from '../crypto.js';
import { avatar } from '../kit.js';

addStrings({
  en: {
    'scan.back': 'Today', 'scan.late': 'Late after {time}', 'scan.closes': 'Scanning closes {time}', 'scan.started': 'Started {time}',
    'scan.present': 'Present', 'scan.late.n': 'Late', 'scan.notyet': 'Not yet', 'scan.excused': 'Excused',
    'scan.camera.start': 'Start camera', 'scan.camera.stop': 'Stop camera', 'scan.type': 'Enter a code', 'scan.undo': 'Undo last', 'scan.close': 'Close session', 'scan.topic': 'Topic',
    'scan.idle': 'Start the camera, then point it at a student’s code.', 'scan.idleNoCam': 'This browser cannot open the camera here. Cameras need HTTPS or localhost. You can still enter codes or mark students by hand.',
    'scan.denied': 'Camera access was blocked. Allow it in your browser settings, then try again.', 'scan.nocamera': 'No camera was found on this device.', 'scan.fallback': 'Using Hadir’s own code reader.',
    'scan.verdict.idle': 'Waiting for a scan', 'scan.verdict.idleSub': 'The result of each scan shows here.',
    'scan.v.present': '{name} is present', 'scan.v.late': '{name} is late', 'scan.v.dup': '{name} is already {status}', 'scan.v.sub': 'Signature valid, code fresh, {time}',
    'scan.r.malformed': 'Not a Hadir code', 'scan.r.malformedSub': 'Ask the student to open the code screen in the Hadir app.',
    'scan.r.unknown_student': 'Not in this group', 'scan.r.unknown_studentSub': 'Student ID {id} is not on this class list.',
    'scan.r.unknown_device': 'Unknown phone', 'scan.r.unknown_deviceSub': 'This phone is not on your list. Refresh the offline data when online, or mark {name} by hand.',
    'scan.r.device_not_approved': 'Phone waiting for approval', 'scan.r.device_not_approvedSub': 'Approve it in Settings when online. Mark {name} by hand for now.',
    'scan.r.bad_signature': 'Signature does not match', 'scan.r.bad_signatureSub': 'This code was not made by {name}’s phone.',
    'scan.r.stale_code': 'Code expired', 'scan.r.stale_codeSub': 'Ask {name} to show the new code. Codes last 45 seconds.',
    'scan.r.after_close': 'Scanning is closed', 'scan.r.after_closeSub': 'It is more than {n} minutes after the start. Mark {name} by hand if needed.',
    'scan.roster': 'Class list', 'scan.search': 'Search by name or ID', 'scan.f.all': 'All', 'scan.f.notyet': 'Not yet', 'scan.noMatch': 'No student matches', 'scan.mark': 'Set status',
    'scan.markTitle': 'Mark {name}', 'scan.note': 'Note (optional)', 'scan.byHand': 'Marked by hand', 'scan.viaQr': 'Scanned {time}', 'scan.saveMark': 'Save',
    'scan.enterTitle': 'Enter a code', 'scan.enterText': 'Paste the text of a student’s code. It is checked exactly like a scan.', 'scan.enterBtn': 'Check code',
    'scan.closeTitle': 'Close this session?', 'scan.closeText': '{n} students without a status will be marked absent. You can still change any status afterwards.', 'scan.closeBtn': 'Close and upload',
    'scan.closedOk': 'Session closed and uploaded.', 'scan.savedOffline': 'Session closed and saved on this phone. It uploads when you are back online.',
    'scan.closed': 'This session is closed.', 'scan.closedPending': 'Closed. Waiting to upload.', 'scan.undone': 'Last change undone.', 'scan.nothingUndo': 'Nothing to undo. Uploaded changes can be edited by setting a status.',
    'scan.noRoster': 'No class list on this phone', 'scan.noRosterText': 'Connect to the internet once to download the class list for this group.',
    'scan.recent': 'Latest scans', 'scan.sound': 'Sound and vibration',
    'scan.demo': 'Demo: scan a student’s phone', 'scan.demo.valid': 'Valid code', 'scan.demo.expired': 'Expired code (a screenshot)', 'scan.demo.forged': 'Forged code', 'scan.demo.go': 'Scan', 'scan.demo.hint': 'Signs a real code with the demo student’s key, so you can try every outcome without a second phone.',
    'scan.editTopic': 'Topic of this session',
  },
  ar: {
    'scan.back': 'اليوم', 'scan.late': 'التأخر بعد {time}', 'scan.closes': 'يُغلق المسح {time}', 'scan.started': 'بدأت {time}',
    'scan.present': 'حاضر', 'scan.late.n': 'متأخر', 'scan.notyet': 'لم يُسجَّل', 'scan.excused': 'مبرَّر',
    'scan.camera.start': 'تشغيل الكاميرا', 'scan.camera.stop': 'إيقاف الكاميرا', 'scan.type': 'إدخال رمز', 'scan.undo': 'تراجع عن الأخير', 'scan.close': 'إغلاق الحصة', 'scan.topic': 'الموضوع',
    'scan.idle': 'شغّل الكاميرا ثم وجّهها نحو رمز الطالب.', 'scan.idleNoCam': 'لا يستطيع هذا المتصفح فتح الكاميرا هنا. تحتاج الكاميرا إلى HTTPS أو localhost. يمكنك مع ذلك إدخال الرموز أو تسجيل الطلبة يدويًا.',
    'scan.denied': 'تم حظر الوصول إلى الكاميرا. اسمح به من إعدادات المتصفح ثم حاول من جديد.', 'scan.nocamera': 'لم يتم العثور على كاميرا في هذا الجهاز.', 'scan.fallback': 'يُستعمل قارئ الرموز الخاص بـ«حاضر».',
    'scan.verdict.idle': 'في انتظار المسح', 'scan.verdict.idleSub': 'تظهر هنا نتيجة كل عملية مسح.',
    'scan.v.present': '{name} حاضر', 'scan.v.late': '{name} متأخر', 'scan.v.dup': '{name} مسجَّل مسبقًا: {status}', 'scan.v.sub': 'التوقيع صحيح والرمز حديث، {time}',
    'scan.r.malformed': 'ليس رمز «حاضر»', 'scan.r.malformedSub': 'اطلب من الطالب فتح شاشة الرمز في تطبيق «حاضر».',
    'scan.r.unknown_student': 'ليس في هذا الفوج', 'scan.r.unknown_studentSub': 'الرقم الجامعي {id} غير موجود في قائمة هذا الفوج.',
    'scan.r.unknown_device': 'هاتف غير معروف', 'scan.r.unknown_deviceSub': 'هذا الهاتف ليس في قائمتك. حدّث البيانات عند الاتصال، أو سجّل {name} يدويًا.',
    'scan.r.device_not_approved': 'الهاتف ينتظر الموافقة', 'scan.r.device_not_approvedSub': 'وافق عليه من الإعدادات عند الاتصال. سجّل {name} يدويًا الآن.',
    'scan.r.bad_signature': 'التوقيع غير مطابق', 'scan.r.bad_signatureSub': 'لم يُنشأ هذا الرمز من هاتف {name}.',
    'scan.r.stale_code': 'انتهت صلاحية الرمز', 'scan.r.stale_codeSub': 'اطلب من {name} عرض الرمز الجديد. الرمز صالح 45 ثانية.',
    'scan.r.after_close': 'المسح مغلق', 'scan.r.after_closeSub': 'مرّت أكثر من {n} دقيقة على البداية. سجّل {name} يدويًا عند الحاجة.',
    'scan.roster': 'قائمة الفوج', 'scan.search': 'ابحث بالاسم أو الرقم', 'scan.f.all': 'الكل', 'scan.f.notyet': 'لم يُسجَّل', 'scan.noMatch': 'لا يوجد طالب مطابق', 'scan.mark': 'تحديد الحالة',
    'scan.markTitle': 'تسجيل {name}', 'scan.note': 'ملاحظة (اختياري)', 'scan.byHand': 'سُجّل يدويًا', 'scan.viaQr': 'مُسح {time}', 'scan.saveMark': 'حفظ',
    'scan.enterTitle': 'إدخال رمز', 'scan.enterText': 'الصق نص رمز الطالب. يُفحص تمامًا كما في المسح.', 'scan.enterBtn': 'فحص الرمز',
    'scan.closeTitle': 'إغلاق هذه الحصة؟', 'scan.closeText': 'سيُسجَّل {n} طلبة بلا حالة كغائبين. يمكنك تعديل أي حالة بعد ذلك.', 'scan.closeBtn': 'إغلاق ورفع',
    'scan.closedOk': 'تم إغلاق الحصة ورفعها.', 'scan.savedOffline': 'تم إغلاق الحصة وحفظها على هذا الهاتف. ستُرفع عند عودة الاتصال.',
    'scan.closed': 'هذه الحصة مغلقة.', 'scan.closedPending': 'مغلقة، في انتظار الرفع.', 'scan.undone': 'تم التراجع عن آخر تغيير.', 'scan.nothingUndo': 'لا شيء للتراجع عنه. لتعديل ما رُفع، غيّر الحالة مباشرة.',
    'scan.noRoster': 'لا توجد قائمة على هذا الهاتف', 'scan.noRosterText': 'اتصل بالإنترنت مرة واحدة لتحميل قائمة هذا الفوج.',
    'scan.recent': 'آخر عمليات المسح', 'scan.sound': 'الصوت والاهتزاز',
    'scan.demo': 'تجربة: مسح هاتف طالب', 'scan.demo.valid': 'رمز صحيح', 'scan.demo.expired': 'رمز منتهٍ (لقطة شاشة)', 'scan.demo.forged': 'رمز مزوَّر', 'scan.demo.go': 'امسح', 'scan.demo.hint': 'يوقّع رمزًا حقيقيًا بمفتاح الطالب التجريبي، لتجرّب كل النتائج بدون هاتف ثانٍ.',
    'scan.editTopic': 'موضوع هذه الحصة',
  },
});

export default async function mount(root, params, app) {
  let local = await openSession(params.id);
  let bundle = await getBundle();
  let roster = rosterOf(bundle, local.group_id);
  if (!roster.length) { try { bundle = await loadBundle(); roster = rosterOf(bundle, local.group_id); } catch { /* offline */ } }
  if (!roster.length) { root.append(empty(t('scan.noRoster'), t('scan.noRosterText'), h('a.btn.btn--ghost', { href: '#/today' }, t('scan.back')))); return; }
  app.setTitle(local.group_name);

  const byId = new Map(roster.map((s) => [s.id, s]));
  let filter = 'all', query = '', scanner = null, lastText = '', lastAt = 0, busy = false, highlight = null;
  const feed = [];
  const isClosed = () => local.status === 'closed';
  const save = async () => { await saveLocal(local); if (!isClosed()) syncSoon(5000); };

  // ----- header -----
  const title = h('h1');
  const meta = h('p.muted.small');
  const tallyEl = h('div.tally');
  const topicBtn = h('button.btn.btn--subtle.btn--sm', { type: 'button', onclick: editTopic }, icon('edit', 14), t('scan.topic'));
  const undoBtn = h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: undo }, icon('undo', 15), t('scan.undo'));
  const closeBtn = h('button.btn.btn--primary.btn--sm', { type: 'button', onclick: closeSession }, icon('check', 15), t('scan.close'));
  const soundBtn = h('button.icon-btn', { type: 'button', 'aria-label': t('scan.sound'), title: t('scan.sound'), onclick: () => { const off = localStorage.getItem('hadir.sound') === 'off'; try { localStorage.setItem('hadir.sound', off ? 'on' : 'off'); } catch { /* ignore */ } paintSound(); } });
  const paintSound = () => soundBtn.replaceChildren(icon(localStorage.getItem('hadir.sound') === 'off' ? 'mute' : 'volume', 18));

  // ----- left column -----
  const video = h('video', { hidden: true, playsinline: '', muted: '' });
  const frame = h('div.viewfinder__frame', { hidden: true });
  const idleMsg = h('p');
  const idle = h('div.viewfinder__idle', icon('camera', 30), idleMsg);
  const camBtn = h('button.btn.btn--primary.btn--block', { type: 'button', onclick: toggleCamera }, icon('camera', 18), t('scan.camera.start'));
  const verdict = h('div.verdict', { 'aria-live': 'polite' });
  const feedEl = h('ul.feed');
  idleMsg.textContent = cameraAvailable() ? t('scan.idle') : t('scan.idleNoCam');

  const demoPanel = app.config.demo ? buildDemo() : null;
  const left = h('div.scan__side',
    h('div.viewfinder', video, frame, idle), camBtn,
    h('div.row', h('button.btn.btn--ghost.btn--sm.grow', { type: 'button', onclick: enterCode }, icon('qr', 15), t('scan.type')), undoBtn),
    verdict, h('div', h('p.small.muted', t('scan.recent')), feedEl), demoPanel);

  // ----- right column: the class list -----
  const search = h('input.input.input--sm', { type: 'search', placeholder: t('scan.search'), 'aria-label': t('scan.search'), oninput: (e) => { query = e.target.value.trim().toLowerCase(); renderRoll(); } });
  const chipsEl = h('div.chips');
  const rollEl = h('ol.roll');
  const right = h('div.stack', h('div.sheet', h('header.sheet__head', h('h2', t('scan.roster')), h('div.row', search)), h('div.sheet__body', chipsEl), rollEl));

  root.append(
    h('div.scanhead', h('div', h('a.link.small', { href: '#/today' }, '← ', t('scan.back')), title, meta), h('div.row', topicBtn, soundBtn, closeBtn)),
    tallyEl && h('div', { style: { marginBottom: '18px' } }, tallyEl),
    h('div.scan', left, right));

  // ----- rendering -----
  function paintHeader() {
    title.textContent = local.group_name + (local.topic ? ` · ${local.topic}` : '');
    const lateAt = local.starts_at + local.late_after_min * 60e3, closeAt = local.starts_at + local.close_after_min * 60e3;
    meta.textContent = isClosed() ? (local.dirty ? t('scan.closedPending') : t('scan.closed')) : [t('scan.started', { time: fmtTime(local.starts_at) }), t('scan.late', { time: fmtTime(lateAt) }), t('scan.closes', { time: fmtTime(closeAt) })].join(' · ');
    closeBtn.hidden = isClosed(); camBtn.hidden = isClosed(); undoBtn.disabled = !local.events.length;
    const c = roll.counts(local, roster);
    tallyEl.replaceChildren(
      h('div.tally__item.tally__item--present', h('span.tally__n', c.present), h('span.tally__l', t('scan.present'))),
      h('div.tally__item.tally__item--late', h('span.tally__n', c.late), h('span.tally__l', t('scan.late.n'))),
      h('div.tally__item', h('span.tally__n', c.excused), h('span.tally__l', t('scan.excused'))),
      h('div.tally__item.tally__item--absent', h('span.tally__n', isClosed() ? c.absent : c.none + c.absent), h('span.tally__l', t('scan.notyet'))));
    return c;
  }
  function renderChips(c) {
    const items = [['all', t('scan.f.all'), c.total], ['present', t('scan.present'), c.present], ['late', t('scan.late.n'), c.late], ['none', t('scan.f.notyet'), c.none + c.absent], ['excused', t('scan.excused'), c.excused]];
    chipsEl.replaceChildren(...items.map(([id, label, n]) => h('button.fchip', { type: 'button', 'aria-pressed': String(filter === id), onclick: () => { filter = id; renderAll(); } }, `${label} ${n}`)));
  }
  function renderRoll() {
    const map = roll.attendanceMap(local);
    const rows = roster.map((s, i) => ({ s, i, st: roll.effectiveStatus(local, map, s.id), a: map[s.id] }))
      .filter(({ s, st }) => (filter === 'all' || (filter === 'none' ? !st || st === 'absent' : st === filter)) && (!query || s.full_name.toLowerCase().includes(query) || s.university_id.toLowerCase().includes(query)));
    rollEl.replaceChildren(...(rows.length ? rows.map(({ s, i, st, a }) => h('li.roll__row', { class: highlight === s.id ? 'is-new' : '' },
      h('span.roll__n', i + 1),
      h('div.roll__name', s.full_name, h('span.roll__id.ltr', a?.method === 'manual' ? t('scan.byHand') : a?.scanned_at ? t('scan.viaQr', { time: fmtTime(a.scanned_at) }) : s.university_id)),
      h('button.roll__btn', { type: 'button', 'aria-label': `${t('scan.mark')}: ${s.full_name}`, disabled: isClosed() && false, onclick: () => markModal(s) }, st ? chip(st) : chip('none', t('status.none')))))
      : [h('li.empty-note', t('scan.noMatch'))]));
  }
  function renderAll() { const c = paintHeader(); renderChips(c); renderRoll(); }
  function renderFeed() {
    feedEl.replaceChildren(...feed.slice(0, 5).map((f) => h('li', h('span', f.name), h('span', f.text))));
  }
  function setVerdict(kind, titleText, sub, stampIcon) {
    verdict.className = `verdict verdict--${kind} is-new`;
    verdict.replaceChildren(h('div.verdict__stamp', icon(stampIcon, 26)), h('div', h('p.verdict__title', titleText), h('p.verdict__sub', sub)));
    setTimeout(() => verdict.classList.remove('is-new'), 600);
  }
  verdict.className = 'verdict';
  verdict.append(h('div.verdict__stamp', { style: { opacity: '.4' } }, icon('scan', 26)), h('div', h('p.verdict__title', t('scan.verdict.idle')), h('p.verdict__sub', t('scan.verdict.idleSub'))));

  // ----- scanning -----
  async function handleText(text) {
    if (isClosed() || busy) return;
    const now = clock.now();
    if (text === lastText && now - lastAt < 3000) return;
    lastText = text; lastAt = now; busy = true;
    try {
      const r = await roll.checkScan(local, roster, text, now);
      if (r.ok && !r.duplicate) {
        local = roll.withScan(local, r.scan); highlight = r.student.id; await save();
        setVerdict(r.status, t(r.status === 'late' ? 'scan.v.late' : 'scan.v.present', { name: r.student.full_name }), t('scan.v.sub', { time: fmtTime(now) }), r.status === 'late' ? 'clock' : 'check');
        feedback(r.status); feed.unshift({ name: r.student.full_name, text: t(`status.${r.status}`) });
      } else if (r.ok) {
        setVerdict(r.status === 'late' ? 'late' : 'present', t('scan.v.dup', { name: r.student.full_name, status: t(`status.${r.status}`).toLowerCase() }), fmtTime(now), 'check');
        feedback('duplicate'); highlight = r.student.id;
      } else {
        const name = r.student?.full_name || '';
        setVerdict('reject', t(`scan.r.${r.reason}`), t(`scan.r.${r.reason}Sub`, { name, id: r.univ_id || '', n: local.close_after_min }), 'x');
        feedback('reject'); feed.unshift({ name: name || '?', text: t(`scan.r.${r.reason}`) });
      }
      renderFeed(); renderAll();
      setTimeout(() => { highlight = null; }, 1500);
    } finally { busy = false; }
  }

  async function toggleCamera() {
    if (scanner) { stopCamera(); return; }
    camBtn.disabled = true;
    try {
      scanner = await startScanner(video, handleText);
      video.hidden = false; frame.hidden = false; idle.hidden = true;
      camBtn.replaceChildren(icon('x', 18), t('scan.camera.stop')); camBtn.classList.replace('btn--primary', 'btn--ghost');
      if (!scanner.native) toast(t('scan.fallback'));
    } catch (e) {
      idle.hidden = false;
      idleMsg.textContent = e.code === 'denied' ? t('scan.denied') : e.code === 'no_camera' ? t('scan.nocamera') : e.code === 'no_camera_api' ? t('scan.idleNoCam') : t('scan.nocamera');
    } finally { camBtn.disabled = false; }
  }
  function stopCamera() {
    scanner?.stop(); scanner = null; video.hidden = true; frame.hidden = true; idle.hidden = false; idleMsg.textContent = t('scan.idle');
    camBtn.replaceChildren(icon('camera', 18), t('scan.camera.start')); camBtn.classList.replace('btn--ghost', 'btn--primary');
  }

  function enterCode() {
    const ta = h('textarea.input.ltr', { rows: 4, placeholder: 'HD1.…', spellcheck: false });
    openModal({ title: t('scan.enterTitle'), size: 'sm', body: [h('p.muted', t('scan.enterText')), ta],
      actions: [{ label: t('common.cancel') }, { label: t('scan.enterBtn'), kind: 'primary', onClick: async () => { lastText = ''; await handleText(ta.value.trim()); } }] });
    setTimeout(() => ta.focus(), 50);
  }

  function markModal(s) {
    const map = roll.attendanceMap(local); const cur = map[s.id]; let pick = cur?.status || null;
    const note = h('input.input', { type: 'text', maxlength: 200, placeholder: t('scan.note'), value: cur?.note || '' });
    const grid = h('div.statuspick');
    const paint = () => grid.replaceChildren(...['present', 'late', 'absent', 'excused'].map((st) => h('button', { type: 'button', 'aria-pressed': String(pick === st), onclick: () => { pick = st; paint(); } }, chip(st))));
    paint();
    openModal({ title: t('scan.markTitle', { name: s.full_name }), size: 'sm', body: [grid, field(t('scan.note'), note)],
      actions: [{ label: t('common.cancel') }, { label: t('scan.saveMark'), kind: 'primary', onClick: async () => {
        if (!pick) return false;
        if (isClosed()) { try { await api.put(`/api/sessions/${local.id}/attendance/${s.id}`, { status: pick, note: note.value }); } catch (e) { toast(e.message, 'error'); return false; } const r = await syncAll(); local = (await openSession(local.id)); renderAll(); return; }
        local = roll.withMark(local, s.id, pick, note.value.trim(), clock.now()); highlight = s.id; await save(); renderAll(); setTimeout(() => { highlight = null; }, 1500);
      } }] });
  }
  function editTopic() {
    const input = h('input.input', { type: 'text', maxlength: 120, value: local.topic || '' });
    openModal({ title: t('scan.editTopic'), size: 'sm', body: field(t('scan.topic'), input), actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', onClick: async () => { local = roll.withTopic(local, input.value.trim()); await save(); paintHeader(); } }] });
  }
  async function undo() {
    const r = roll.withoutLastEvent(local);
    if (!r.undone) { toast(t('scan.nothingUndo')); return; }
    local = r.local; await save(); renderAll(); toast(t('scan.undone'));
  }
  async function closeSession() {
    const c = roll.counts(local, roster);
    const ok = await confirmDialog({ title: t('scan.closeTitle'), message: t('scan.closeText', { n: c.none }), confirmLabel: t('scan.closeBtn') });
    if (!ok) return;
    stopCamera();
    local = roll.closed(local, clock.now()); await saveLocal(local);
    const res = await syncAll();
    if (res && !res.errors && !res.offline && !(await openSession(local.id).then((x) => x.dirty).catch(() => false))) { toast(t('scan.closedOk'), 'ok'); app.go(`/session/${local.id}`); }
    else { toast(t('scan.savedOffline'), 'ok'); app.go('/today'); }
  }

  // ----- demo helper: sign a real code with a seeded student's key -----
  function buildDemo() {
    let scenario = 'valid', who = roster[0]?.id, keys = null;
    const names = h('select.input.input--sm', { onchange: (e) => { who = e.target.value; }, 'aria-label': t('common.student') }, roster.map((s) => h('option', { value: s.id }, s.full_name)));
    const sc = h('select.input.input--sm', { onchange: (e) => { scenario = e.target.value; }, 'aria-label': t('scan.demo') }, [['valid', t('scan.demo.valid')], ['expired', t('scan.demo.expired')], ['forged', t('scan.demo.forged')]].map(([v, l]) => h('option', { value: v }, l)));
    const key = (jwk) => crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const go = h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: async () => {
      try {
        keys ||= (await api.get('/api/demo/keys')).keys;
        const k = keys.find((x) => x.student_id === who); const s = byId.get(who);
        if (!k) { toast(t('err.server'), 'error'); return; }
        const other = keys.find((x) => x.student_id !== who && byId.has(x.student_id));
        const at = Math.floor(clock.now() / 1000) - (scenario === 'expired' ? 60 : 0);
        const signer = scenario === 'forged' ? other : k;
        const code = await signCode(await key(signer.private_jwk), s.university_id, k.device_id, at);
        lastText = ''; await handleText(code);
      } catch (e) { toast(e.message || t('err.server'), 'error'); }
    } }, icon('phone', 15), t('scan.demo.go'));
    return h('div.callout', icon('flask', 18), h('div.stack.stack--sm', h('strong', t('scan.demo')), h('p.muted.small', t('scan.demo.hint')), names, h('div.row', sc, go)));
  }

  paintSound(); renderAll();
  const off = onNet(() => { if (!isClosed()) return; paintHeader(); });
  return () => { scanner?.stop(); off(); };
}
