// Shared building blocks for the screens: page headers, sheets, stat tiles, tabs, pickers.
import { h, icon, chip } from './ui.js';
import { t, fmtPct } from './i18n.js';
import { auth } from './api.js';

export const pageHead = (title, sub, ...actions) =>
  h('header.pagehead', h('div.pagehead__text', h('h1', title), sub ? h('p.muted', sub) : null), actions.flat().filter(Boolean).length ? h('div.pagehead__actions', actions) : null);

export const sheet = (title, body, actions, { flush = false, id } = {}) =>
  h('section.sheet', { id }, title || actions ? h('header.sheet__head', title ? h('h2', title) : h('span'), actions ? h('div.row', actions) : null) : null, flush ? h('div.table-wrap', body) : h('div.sheet__body', body));

// A counter tile. With href it is a link; tone "alert" turns the number red when it is above zero.
export function stat({ label, value, hint, tone, href, ic }) {
  const tag = href ? 'a.stat' : 'div.stat';
  return h(tag, { href, class: tone === 'alert' && Number(value) > 0 ? 'is-alert' : '' },
    h('span.stat__label', ic ? icon(ic, 15) : null, label),
    h('span.stat__value.num', value ?? '–'),
    hint ? h('span.stat__hint', hint) : null);
}

export function tabs(items, current, onSelect, label) {
  return h('div.seg', { role: 'tablist', 'aria-label': label || '' }, items.map((it) =>
    h('button', { type: 'button', role: 'tab', 'aria-selected': String(it.id === current), 'aria-pressed': String(it.id === current), onclick: () => onSelect(it.id) },
      it.label, it.count ? h('span.seg__count', it.count) : null)));
}

export function select(options, value, onChange, { cls = '', label } = {}) {
  const el = h('select', { class: `input ${cls}`.trim(), 'aria-label': label || null, onchange: (e) => onChange(e.target.value) },
    options.map(([v, text]) => h('option', { value: v, selected: String(v) === String(value) }, text)));
  return el;
}

export const groupPicker = (groups, current, onChange) =>
  select(groups.map((g) => [g.id, g.name]), current, onChange, { label: t('common.group'), cls: 'input--sm' });

export function statusPicker(current, onChange, { allowNone = false } = {}) {
  const opts = ['present', 'late', 'absent', 'excused'].map((s) => [s, t(`status.${s}`)]);
  if (allowNone) opts.unshift(['', t('status.none')]);
  return select(opts, current || '', onChange, { cls: 'input--sm', label: t('common.status') });
}

export const rateText = (r) => (r == null ? '–' : fmtPct(r));
export const flagTone = (f) => (f === 'risk' ? 'absent' : f === 'warn' ? 'late' : 'present');

export function avatar(name) {
  const letters = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]).join('').toUpperCase();
  return h('span.avatar', { 'aria-hidden': 'true' }, letters);
}

export function defList(pairs) {
  return h('dl.kv', pairs.filter(Boolean).map(([k, v]) => [h('dt', k), h('dd', v)]));
}

export const row = (...kids) => h('div.row', kids);

// A status stamp that can be tapped to change the status.
export const statusStamp = (status) => chip(status || 'none', status ? undefined : t('status.none'));

// Trigger the browser print dialog for the current view.
export const printPage = () => window.print();

// Read a CSV (or semicolon / tab separated) text into rows of objects. The first line is a header if it has words like id or name.
export function parseRoster(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delim = [';', '\t', ','].reduce((best, d) => (lines[0].split(d).length > lines[0].split(best).length ? d : best), ',');
  const split = (line) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === delim) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const rows = lines.map(split);
  const head = rows[0].map((c) => c.toLowerCase());
  const hasHeader = head.some((c) => /(^|[^a-z])(id|matricule|name|nom|email|phone|الاسم|الرقم)/i.test(c)) && !/^\d{6,}$/.test(head[0]);
  const idx = (re, fallback) => { const i = head.findIndex((c) => re.test(c)); return hasHeader ? (i >= 0 ? i : fallback) : fallback; };
  const iId = idx(/id|matricule|number|num|رقم/, 0), iName = idx(/name|nom|full|اسم/, 1), iMail = idx(/mail/, 2), iPhone = idx(/phone|tel|mobile|هاتف/, 3), iTg = idx(/telegram/, 4);
  return rows.slice(hasHeader ? 1 : 0).map((r) => ({ university_id: r[iId] || '', full_name: r[iName] || '', email: r[iMail] || '', phone: r[iPhone] || '', telegram: r[iTg] || '' }));
}

// Subjects of an English department, offered as suggestions when naming a group (any other name can still be typed).
export const SUBJECTS = ['Linguistics', 'Phonetics and Phonology', 'Writing Production', 'Written Expression', 'Oral Expression', 'Grammar', 'Morphology and Syntax', 'Semantics and Pragmatics',
  'Sociolinguistics', 'Psycholinguistics', 'Applied Linguistics', 'Discourse Analysis', 'Reading Comprehension', 'Listening Comprehension', 'British Literature', 'American Literature',
  'Literary Studies', 'British Civilisation', 'American Civilisation', 'Cultural Studies', 'Translation', 'Research Methodology', 'ESP (English for Specific Purposes)', 'Didactics of English (TEFL)', 'Educational Psychology', 'Study Skills'];
// The educator's own subjects come first, then the department's usual list.
export function subjectList() {
  const own = auth.user?.profile?.subjects || [];
  const all = [...own, ...SUBJECTS.filter((x) => !own.includes(x))];
  const sig = all.join('|');
  let dl = document.getElementById('hd-subjects');
  if (dl && dl.dataset.sig !== sig) { dl.remove(); dl = null; }
  if (!dl) { dl = document.createElement('datalist'); dl.id = 'hd-subjects'; dl.dataset.sig = sig; for (const x of all) { const o = document.createElement('option'); o.value = x; dl.append(o); } document.body.append(dl); }
  return 'hd-subjects';
}
