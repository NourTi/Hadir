// Per-educator portal: display name with title, accent colour, and the subjects they teach.
import { lang } from './i18n.js';

export const ACCENTS = [
  ['green', '#1C5A49', '#12392F', '#E3EFEA', 'Green'], ['ink', '#1F4E79', '#14283F', '#E3ECF5', 'Ink'], ['plum', '#6B2D5C', '#3A1833', '#F2E6EF', 'Plum'], ['clay', '#9A4A2B', '#43231A', '#F6E8E1', 'Clay'], ['teal', '#0F6B73', '#0F3B40', '#DFF0F1', 'Teal'], ['slate', '#3F4A5A', '#232A35', '#E8EBEF', 'Slate'],
  ['ocean', '#0B5D8A', '#0E3449', '#E7F2F9', 'Ocean'],
  ['royal', '#2F4BA8', '#18213F', '#EAECF6', 'Royal blue'],
  ['indigo', '#4B3FA0', '#201C3A', '#ECEBF4', 'Indigo'],
  ['violet', '#7A3FB5', '#2B1B3C', '#F0EBF5', 'Violet'],
  ['rose', '#B03A63', '#3D1A26', '#F5EAEE', 'Rose'],
  ['crimson', '#A62B36', '#40171B', '#F6E9EB', 'Crimson'],
  ['ember', '#C4541C', '#452311', '#F8EDE8', 'Ember'],
  ['amber', '#A9700F', '#48330E', '#F9F2E7', 'Amber'],
  ['olive', '#5E6B1E', '#383F18', '#F4F6EA', 'Olive'],
  ['forest', '#245B2E', '#1C3A22', '#EBF4ED', 'Forest'],
  ['sage', '#587A68', '#26312B', '#EEF1F0', 'Sage'],
  ['bronze', '#7A5A2B', '#3C2F1B', '#F5F1EB', 'Bronze'],
  ['graphite', '#333B44', '#262B30', '#EEF0F1', 'Graphite'],
  ['midnight', '#1B2A4E', '#1B243C', '#EAEEF5', 'Midnight']
];
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
