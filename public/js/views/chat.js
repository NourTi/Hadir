// Private chat. A student has one thread per educator; an educator sees a list of students who wrote and opens any student's thread.
import { h, icon, empty, toast } from '../ui.js';
import { t, fmtDateTime } from '../i18n.js';
import { api, auth } from '../api.js';
import { pageHead, avatar } from '../kit.js';

const MAX = 1000;
const digits = (v) => String(v || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
const waLink = (n) => `https://wa.me/${digits(n).replace(/^0/, '213')}`;

export default async function mount(root, params, app) {
  const isStudent = auth.user.role === 'student';
  const base = isStudent ? '/me/chat' : '/chat';
  app.setTitle(t('chat.title'));
  const { threads } = await api.get('/api/chat');

  // A student with a single educator goes straight to the conversation.
  const peerId = params.id || (isStudent && threads.length === 1 ? threads[0].peer_id : null);
  if (peerId) return thread(root, peerId, isStudent, base, app, threads);

  root.append(pageHead(t('chat.title'), t(isStudent ? 'chat.subStudent' : 'chat.subTeacher')));
  if (!threads.length) { root.append(empty(t('chat.none'), t(isStudent ? 'chat.noEducator' : 'chat.noneTeacher'))); return; }
  root.append(h('ul.ledger-list.chatlist', threads.map((x) => {
    const last = isStudent ? x.last?.body : x.last_body;
    const at = isStudent ? x.last?.created_at : x.last_at;
    return h('li', h('a.chatlist__row', { href: `#${base}/${x.peer_id}` }, avatar(x.name),
      h('div.chatlist__who', h('strong', x.name), h('span.muted.small', last || ''), at ? h('span.muted.small', fmtDateTime(at)) : null),
      x.unread ? h('span.badge', String(x.unread)) : null));
  })));
}

async function thread(root, peerId, isStudent, base, app, threads) {
  let data = await api.get(`/api/chat/${peerId}`);
  const log = h('div.chat__log', { role: 'log', 'aria-live': 'polite' });
  const err = h('p.form-error', { role: 'alert' });
  const input = h('textarea.input', { rows: 2, maxlength: MAX, placeholder: t('chat.placeholder'), 'aria-label': t('chat.placeholder') });
  const counter = h('span.muted.small', '');
  const mine = isStudent ? 'student' : 'teacher';

  const paint = () => {
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60 || !log.childNodes.length;
    log.replaceChildren(...(data.messages.length
      ? data.messages.map((m) => h('div.bubble', { class: m.sender === mine ? 'is-mine' : 'is-theirs' }, h('p', m.body), h('span.bubble__time', fmtDateTime(m.created_at))))
      : [h('p.muted.chat__empty', t(isStudent ? 'chat.noneStudent' : 'chat.none'))]));
    if (atBottom) log.scrollTop = log.scrollHeight;
  };
  const refresh = async () => {
    if (document.hidden) return;
    try { const d = await api.get(`/api/chat/${peerId}`); if (d.messages.length !== data.messages.length) { data = d; paint(); app.refreshBadges?.(); } } catch { /* offline: keep what is shown */ }
  };
  const send = async () => {
    const body = input.value.trim(); if (!body) return;
    err.textContent = '';
    try {
      const r = await api.post(`/api/chat/${peerId}`, { body });
      data.messages.push(r.message); input.value = ''; counter.textContent = ''; paint(); log.scrollTop = log.scrollHeight;
    } catch (e) { err.textContent = e.message; }
  };
  input.addEventListener('input', () => { counter.textContent = input.value.length > MAX - 150 ? t('chat.limit', { n: MAX - input.value.length }) : ''; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });

  const p = data.peer || {};
  const reach = !isStudent ? h('div.row.chat__reach', [
    p.whatsapp ? h('a.btn.btn--ghost.btn--sm', { href: waLink(p.whatsapp), target: '_blank', rel: 'noopener' }, icon('send', 14), t('chat.whatsapp')) : null,
    p.phone ? h('a.btn.btn--ghost.btn--sm.ltr', { href: `tel:${p.phone}` }, icon('phone', 14), p.phone) : null,
    p.email ? h('span.muted.small.ltr', p.email) : null,
  ]) : null;

  root.append(
    h('div.chat',
      (isStudent && threads.length <= 1) ? null : h('p.small.no-print', h('a.link', { href: `#${base}` }, '← ', t('chat.back'))),
      pageHead(p.name || t('chat.title'), isStudent ? t('chat.subStudent') : (p.university_id || '')),
      reach, log,
      h('form.chat__composer', { onsubmit: (e) => { e.preventDefault(); send(); } }, input,
        h('div.row.row--between', counter, h('button.btn.btn--primary', { type: 'submit' }, icon('send', 16), t('chat.send')))),
      err));
  paint();
  app.refreshBadges?.();
  const timer = setInterval(refresh, 8000);
  return () => clearInterval(timer);
}
