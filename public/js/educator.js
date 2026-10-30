// Per-educator portal: display name with title, accent colour, and the subjects they teach.
import { lang } from './i18n.js';

export const ACCENTS = [['green', '#1C5A49'], ['ink', '#1F4E79'], ['plum', '#6B2D5C'], ['clay', '#9A4A2B'], ['teal', '#0F6B73'], ['slate', '#3F4A5A']];
export const TITLES = ['', 'Dr', 'Prof', 'Assoc. Prof', 'Asst. Lecturer', 'Mr', 'Ms'];
const TITLE_EN = { Dr: 'Dr.', Prof: 'Prof.', 'Assoc. Prof': 'Assoc. Prof.', 'Asst. Lecturer': 'Asst. Lecturer', Mr: 'Mr.', Ms: 'Ms.' };
const TITLE_AR = { Dr: 'د.', Prof: 'أ.د.', 'Assoc. Prof': 'أستاذ محاضر', 'Asst. Lecturer': 'أستاذ مساعد', Mr: 'الأستاذ', Ms: 'الأستاذة' };
export const titleLabel = (title) => (title ? (lang() === 'ar' ? TITLE_AR : TITLE_EN)[title] || '' : '');
const TITLE_WORDS = /^(dr|prof|professor|mr|mrs|ms|د|أ\.?د|الأستاذ|الأستاذة)\.?$/i;

export function applyAccent(user) {
  const a = user?.profile?.accent;
  if (a && a !== 'green' && ACCENTS.some(([k]) => k === a)) document.documentElement.dataset.accent = a; else delete document.documentElement.dataset.accent;
}
export const setAccent = (a) => applyAccent({ profile: { accent: a } });

const words = (name) => String(name || '').trim().split(/\s+/).filter(Boolean);
const bare = (name) => { const w = words(name); while (w.length > 1 && TITLE_WORDS.test(w[0])) w.shift(); return w; };

// "Dr. Abdelhak Gandouzi" for headings and the sidebar.
export function fullName(user) {
  const title = titleLabel(user?.profile?.title);
  const name = bare(user?.full_name).join(' ');
  return title ? `${title} ${name}` : user?.full_name || '';
}
// "Dr. Abdelhak" for greetings.
export function shortName(user) {
  const title = titleLabel(user?.profile?.title);
  const w = bare(user?.full_name);
  // Arabic given names are often two words (عبد الحق), so keep two for Arabic script.
  const n = /[\u0600-\u06FF]/.test(w[0] || '') ? 2 : 1;
  return title ? `${title} ${w.slice(0, n).join(' ')}` : w.slice(0, 2).join(' ');
}
export const institutionLine = (p) => [p?.department, p?.institution].filter(Boolean).join(' · ');
