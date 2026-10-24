// Prints a QR matrix as JSON for scripts/verify-qr.py.
// Usage: node qr-dump.mjs <ecl> <minVersion> <text | @fill>   (@fill = a pseudo-random text that fills the version's capacity)
import { encodeQR, byteCapacity } from '../public/js/qr.js';
const [ecl, minVersion, ...rest] = process.argv.slice(2);
let text = rest.join(' ');
if (text === '@fill') {
  let seed = Number(minVersion) * 97 + ecl.charCodeAt(0);
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.|';
  text = Array.from({ length: byteCapacity(Number(minVersion), ecl) }, () => chars[rnd() % chars.length]).join('');
}
const q = encodeQR(text, { ecl, minVersion: Number(minVersion) });
console.log(JSON.stringify({ text, version: q.version, mask: q.mask, rows: q.modules.map((r) => r.map((b) => (b ? 1 : 0)).join('')) }));
