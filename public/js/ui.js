// Small UI toolkit: element builder, icons, toasts, dialogs. Text is always set with textContent, never as HTML,
// so a student's name can never inject markup.
import { t } from './i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'g', 'line', 'text', 'defs', 'use', 'polyline', 'polygon', 'ellipse']);

export function h(tag, props, ...kids) {
  const m = /^([a-z0-9]*)((?:[.#][\w-]+)*)$/i.exec(tag);
  const name = m?.[1] || 'div';
  const el = SVG_TAGS.has(name) ? document.createElementNS(SVG_NS, name) : document.createElement(name);
  const classes = [];
  for (const part of (m?.[2] || '').match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') classes.push(part.slice(1)); else el.id = part.slice(1);
  }
  if (props != null && props !== false && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') classes.push(...String(v).split(/\s+/).filter(Boolean));
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'indeterminate') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  if (classes.length) el.setAttribute('class', classes.join(' '));
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false || k === true) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const cls = (...a) => a.filter(Boolean).join(' ');
export const clear = (el) => { el.replaceChildren(); return el; };

// ---------- icons (our own constant markup, never user data) ----------
const ICONS = {
  today: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/>',
  classes: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9" r="2.4"/><path d="M17 14.2c2.4.3 4.3 2.4 4.3 5"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>',
  file: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h6"/>',
  award: '<circle cx="12" cy="9" r="5"/><path d="M9 13.5L8 21l4-2.4 4 2.4-1-7.5"/>',
  zap: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  chart: '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  bell: '<path d="M6 17v-6a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4"/>',
  logout: '<path d="M10 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M15 8l4 4-4 4M19 12H9"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 2.7 2.8 15.3 0 18M12 3c-2.8 2.7-2.8 15.3 0 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/>',
  wifioff: '<path d="M3 3l18 18M2.5 9a14 14 0 0 1 4-2.6M9.5 5.2A14 14 0 0 1 21.5 9M5.5 12.5a9.5 9.5 0 0 1 3.2-2M12.8 10a9.5 9.5 0 0 1 5.7 2.5M8.8 16a5 5 0 0 1 6.4 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/>',
  sync: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5"/>',
  camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM19 14h1v1M14 19h1v1M18 18h2v2h-2z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>',
  upload: '<path d="M12 20V9M7.5 13.5L12 9l4.5 4.5M5 4h14"/>',
  print: '<path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v6H7z"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  chevdown: '<path d="M6 9l6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>',
  alert: '<path d="M12 4l9 16H3zM12 10v4M12 17.2v.1"/>',
  more: '<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>',
  undo: '<path d="M9 7L4 12l5 5M4 12h10a6 6 0 0 1 6 6"/>',
  key: '<circle cx="8" cy="14" r="4"/><path d="M11 11l8-8M16 6l3 3M14 8l2 2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/>',
  inbox: '<path d="M4 13l2.5-7h11L20 13v6H4zM4 13h5l1 2h4l1-2h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v.1"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9zM17 9.5l4 5M21 9.5l-4 5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11"/>',
};
export function icon(name, size = 18, extra = '') {
  const span = document.createElement('span');
  span.className = `icon ${extra}`.trim();
  span.setAttribute('aria-hidden', 'true');
  span.style.width = span.style.height = `${size}px`;
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

// ---------- status stamps ----------
export const chip = (status, label) => h('span', { class: `stamp stamp--${status}` }, label ?? t(`status.${status}`));
export const flagChip = (flag) => h('span', { class: `stamp stamp--${flag === 'risk' ? 'absent' : flag === 'warn' ? 'late' : 'present'}` }, t(`flag.${flag}`));

// ---------- toasts ----------
let toastHost;
export function toast(message, kind = 'info') {
  if (!toastHost) { toastHost = h('div.toasts', { role: 'status', 'aria-live': 'polite' }); document.body.append(toastHost); }
  const el = h('div', { class: `toast toast--${kind}` }, kind === 'error' ? icon('alert', 16) : kind === 'ok' ? icon('check', 16) : null, h('span', message));
  toastHost.append(el);
  setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 200); }, kind === 'error' ? 6000 : 3200);
}

// ---------- dialogs ----------
export function openModal({ title, body, actions = [], size = 'md', onClose } = {}) {
  const dlg = h('dialog', { class: `modal modal--${size}`, 'aria-label': title || '' });
  const close = () => { if (dlg.open) dlg.close(); };
  const bar = h('header.modal__head', h('h2', title || ''), h('button.icon-btn', { type: 'button', 'aria-label': t('common.close'), onclick: close }, icon('x', 18)));
  const foot = actions.length ? h('footer.modal__foot', actions.map((a) => h('button', { type: 'button', class: `btn btn--${a.kind || 'ghost'}`, disabled: a.disabled, onclick: async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { const r = await a.onClick?.({ close, dlg }); if (r !== false && a.close !== false) close(); } finally { b.disabled = false; }
  } }, a.label))) : null;
  dlg.append(bar, h('div.modal__body', body), foot);
  dlg.addEventListener('close', () => { dlg.remove(); onClose?.(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  dlg.showModal();
  return { dlg, close };
}
export function confirmDialog({ title, message, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      title, size: 'sm', body: h('p', message),
      actions: [
        { label: t('common.cancel'), onClick: () => { answered = true; resolve(false); } },
        { label: confirmLabel || t('common.confirm'), kind: danger ? 'danger' : 'primary', onClick: () => { answered = true; resolve(true); } },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

// ---------- states ----------
export const spinner = () => h('span.spinner', { role: 'status', 'aria-label': t('common.loading') });
export const loading = () => h('div.state', spinner(), h('span', t('common.loading')));
export function empty(title, text, action) {
  return h('div.state.state--empty', h('p.state__title', title), text ? h('p.state__text', text) : null, action || null);
}
export function errorState(err, retry) {
  return h('div.state.state--error', icon(err?.offline ? 'wifioff' : 'alert', 22),
    h('p.state__title', err?.offline ? t('common.offlineNeeded') : err?.message || t('err.server')),
    retry ? h('button.btn.btn--ghost', { type: 'button', onclick: retry }, t('common.retry')) : null);
}

// ---------- misc ----------
export const debounce = (fn, ms = 200) => { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; };
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const csvCell = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
export function field(label, input, hint) {
  const id = input.id || (input.id = `f${Math.random().toString(36).slice(2, 8)}`);
  return h('div.field', h('label', { for: id }, label), input, hint ? h('p.field__hint', hint) : null);
}
export const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export function theme() {
  return {
    get: () => { try { return localStorage.getItem('hadir.theme') || 'auto'; } catch { return 'auto'; } },
    set(v) {
      try { if (v === 'auto') localStorage.removeItem('hadir.theme'); else localStorage.setItem('hadir.theme', v); } catch { /* ignore */ }
      if (v === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = v;
    },
    init() { const v = this.get(); if (v !== 'auto') document.documentElement.dataset.theme = v; },
  };
}
