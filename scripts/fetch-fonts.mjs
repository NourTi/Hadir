// Copies the three font families into public/fonts so the app never calls a font CDN.
// Usage: npm install --no-save @fontsource-variable/newsreader @fontsource-variable/public-sans @fontsource/ibm-plex-sans-arabic && node scripts/fetch-fonts.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'fonts');
fs.mkdirSync(out, { recursive: true });
const wanted = [
  ['@fontsource-variable/newsreader', ['newsreader-latin-wght-normal.woff2', 'newsreader-latin-wght-italic.woff2']],
  ['@fontsource-variable/public-sans', ['public-sans-latin-wght-normal.woff2']],
  ['@fontsource/ibm-plex-sans-arabic', [400, 500, 600, 700].map((w) => `ibm-plex-sans-arabic-arabic-${w}-normal.woff2`)],
];
let missing = 0;
for (const [pkg, files] of wanted) {
  for (const f of files) {
    const src = path.join(root, 'node_modules', pkg, 'files', f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, f)); else { missing++; console.warn('missing', pkg, f); }
  }
}
console.log(missing ? `${missing} font file(s) missing; the system fonts will be used for them.` : 'Fonts copied.');
