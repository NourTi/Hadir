// The educator-only part of Settings: portal profile, recovery code, own-data export, and the owner's list of educators.
import { h, icon, toast, confirmDialog, openModal, field, downloadBlob, empty, chip } from '../ui.js';
import { t, fmtDateTime } from '../i18n.js';
import { api, saveAuth, auth } from '../api.js';
import { sheet, select } from '../kit.js';
import { ACCENTS, TITLES, titleLabel, setAccent } from '../educator.js';
import { subjectList } from '../kit.js';
import '../strings-accounts.js';

const text = (name, v, extra = {}) => h('input.input', { name, type: 'text', value: v ?? '', maxlength: extra.max || 120, list: extra.list, dir: extra.dir, autocomplete: 'off' });

export function profileCard(app) {
  const u = app.user; const p = u.profile || {};
  const d = p.defaults || {};
  const title = h('select.input', { name: 'title' }, TITLES.map((x) => h('option', { value: x, selected: x === (p.title || '') }, x ? titleLabel(x) : t('acc.title.none'))));
  let accent = p.accent || 'green';
  const sw = h('div.swatches', { role: 'radiogroup', 'aria-label': t('acc.accent') }, ACCENTS.map(([k, hex]) => h('label.swatch', { style: { '--sw': hex }, title: k },
    h('input', { type: 'radio', name: 'accent', value: k, checked: k === accent, onchange: () => { accent = k; setAccent(k); } }), h('span'))));
  const num = (name, v, min, max) => h('input.input', { name, type: 'number', value: v ?? '', min, max, inputmode: 'numeric' });
  const intro = h('textarea.input', { name: 'intro', rows: 3, maxlength: 400 }, p.intro || '');
  intro.value = p.intro || '';
  const f = h('form.stack',
    h('p.muted.small', t('set.profileText')),
    h('div.form-grid', field(t('acc.name'), text('full_name', u.full_name, { max: 80 })), field(t('acc.title'), title), field(t('acc.institution'), text('institution', p.institution)), field(t('acc.faculty'), text('faculty', p.faculty)),
      field(t('acc.department'), text('department', p.department)), field(t('acc.degree'), text('degree', p.degree)), field(t('acc.specialization'), text('specialization', p.specialization)),
      field(t('acc.office'), text('office', p.office, { max: 60 })), field(t('acc.phone'), text('phone', p.phone, { max: 30, dir: 'ltr' })), field(t('acc.publicEmail'), text('public_email', p.public_email, { dir: 'ltr' }))),
    field(t('acc.subjects'), text('subjects', (p.subjects || []).join(', '), { list: subjectList(), max: 400 }), t('acc.subjectsHint')),
    field(t('acc.accent'), sw), field(t('acc.intro'), intro, t('acc.introHint')),
    h('strong', t('set.defaults')),
    h('div.form-grid', field(t('set.d.late'), num('late_after_min', d.late_after_min ?? 15, 0, 120)), field(t('set.d.close'), num('close_after_min', d.close_after_min ?? 45, 5, 240)),
      field(t('set.d.warn'), num('absence_warn', d.absence_warn ?? 2, 1, 20)), field(t('set.d.notice'), num('absence_notice', d.absence_notice ?? 3, 1, 20))),
    h('p.form-error', { role: 'alert' }), h('div.row', h('button.btn.btn--primary', { type: 'submit' }, t('common.save'))));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = f.querySelector('.form-error'); err.textContent = '';
    const v = Object.fromEntries(new FormData(f));
    try {
      const r = await api.put('/api/me/profile', {
        full_name: v.full_name, title: v.title, institution: v.institution, faculty: v.faculty, department: v.department, degree: v.degree, specialization: v.specialization, office: v.office,
        phone: v.phone, public_email: v.public_email, subjects: v.subjects, accent, intro: v.intro,
        defaults: { late_after_min: v.late_after_min, close_after_min: v.close_after_min, absence_warn: v.absence_warn, absence_notice: v.absence_notice },
      });
      saveAuth(auth.token, r.user); app.user = r.user; app.rebuild?.();
      toast(t('set.profileSaved'), 'ok');
    } catch (er) { err.textContent = er.message; }
  });
  return sheet(t('set.profile'), f);
}

export function recoveryCard() {
  const pw = h('input.input', { type: 'password', autocomplete: 'current-password' });
  const out = h('div');
  const err = h('p.form-error', { role: 'alert' });
  const btn = h('button.btn.btn--ghost', { type: 'button', onclick: async () => {
    err.textContent = '';
    try {
      const r = await api.post('/api/me/recovery', { password: pw.value }); pw.value = '';
      out.replaceChildren(h('strong', t('set.recoveryNew')), h('div.reccode.ltr', r.recovery_code), h('p.muted.small', t('rec.text')),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(r.recovery_code); toast(t('rec.copied'), 'ok'); } catch { /* visible anyway */ } } }, icon('copy', 15), t('rec.copy')));
    } catch (e) { err.textContent = e.message; }
  } }, icon('key', 16), t('set.recoveryBtn'));
  return sheet(t('set.recovery'), h('div.stack', h('p.muted.small', t('set.recoveryText')), field(t('auth.password'), pw), err, h('div.row', btn), out));
}

export function exportCard() {
  return sheet(t('set.exportMine'), h('div.row.row--between', h('p.muted.small', t('set.exportMineText')),
    h('button.btn.btn--ghost', { type: 'button', onclick: async () => { try { downloadBlob(await api.blob('/api/export/mine'), `hadir-my-data-${new Date().toISOString().slice(0, 10)}.json`); } catch (e) { toast(e.message, 'error'); } } }, icon('download', 16), t('set.exportMine'))));
}

export async function ownerCard(app) {
  const box = h('div');
  const draw = async () => {
    const { educators, registration_open } = await api.get('/api/educators');
    const open = h('input', { type: 'checkbox', checked: registration_open, onchange: async () => { try { await api.post('/api/settings/registration', { open: open.checked }); toast(t('own.done'), 'ok'); } catch (e) { toast(e.message, 'error'); open.checked = !open.checked; } } });
    box.replaceChildren(
      h('label.check.check--block', open, h('span', h('strong', t('own.open')), h('br'), h('span.muted.small', t('own.openHint')))),
      h('ul.educator-list', educators.map((e) => h('li', { class: e.active ? '' : 'is-off' },
        h('div', h('strong', e.full_name), ' ', e.is_owner ? chip('present', t('own.owner')) : null, e.active ? null : chip('absent', t('own.off')),
          h('div.muted.small.ltr', e.login), h('div.muted.small', [e.institution, e.department, t('own.groups', { n: e.groups })].filter(Boolean).join(' · '), ' · ', e.last_login ? t('own.last', { time: fmtDateTime(e.last_login) }) : t('own.never'))),
        e.is_owner ? null : h('div.row',
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: async () => {
            try {
              const r = await api.post(`/api/educators/${e.id}/reset`, {});
              openModal({ title: t('own.resetTitle'), size: 'sm', body: [h('p', t('own.resetText', { name: e.full_name, email: r.email })), h('div.reccode.ltr', r.code)], actions: [{ label: t('common.close') || 'OK' }] });
            } catch (er) { toast(er.message, 'error'); }
          } }, icon('key', 15), t('own.reset')),
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: async () => {
            if (e.active && !(await confirmDialog({ title: t('own.disable'), message: t('own.confirmOff', { name: e.full_name }), confirmLabel: t('own.disable'), danger: true }))) return;
            try { await api.post(`/api/educators/${e.id}/active`, { active: !e.active }); await draw(); } catch (er) { toast(er.message, 'error'); }
          } }, e.active ? t('own.disable') : t('own.enable')))))));
  };
  await draw();
  return sheet(t('own.title'), h('div.stack', h('p.muted.small', t('own.text')), box));
}

export function addressCard(app) {
  const input = h('input.input.ltr', { type: 'url', value: app.config?.public_url || '', placeholder: 'https://your-name.ngrok-free.app', autocomplete: 'off', spellcheck: false });
  const err = h('p.form-error', { role: 'alert' });
  return sheet(t('addr.title'), h('div.stack', h('p.muted.small', t('addr.text')), field(t('addr.label'), input, t('addr.hint')), err,
    h('div.row', h('button.btn.btn--primary', { type: 'button', onclick: async () => {
      err.textContent = '';
      try { const r = await api.post('/api/settings/public-url', { url: input.value }); app.config.public_url = r.public_url; toast(t('own.done'), 'ok'); } catch (e) { err.textContent = e.message; }
    } }, t('common.save')))));
}
