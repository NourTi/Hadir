import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeQR } from '../public/js/qr.js';
import { decodeQR } from '../public/js/qrdecode.js';

// Rasterise a code at a given scale and rotation, with a quiet zone, optional blur and a corrupted patch.
function render(text, { scale = 4, angle = 0, ecl = 'L', damage = 0, noise = 0 } = {}) {
  const q = encodeQR(text, { ecl }); const quiet = 4, n = q.size + quiet * 2;
  const W = Math.ceil(n * scale * 1.5), H = W; const data = new Uint8ClampedArray(W * H * 4);
  const c = Math.cos(angle), s = Math.sin(angle);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - W / 2, dy = y - H / 2, u = (c * dx + s * dy) / scale + n / 2, v = (-s * dx + c * dy) / scale + n / 2;
    let val = 235; const mx = Math.floor(u - quiet), my = Math.floor(v - quiet);
    if (mx >= 0 && my >= 0 && mx < q.size && my < q.size) val = q.modules[my][mx] ? 25 : 235;
    val += (Math.random() - 0.5) * noise;
    const p = (y * W + x) * 4; data[p] = data[p + 1] = data[p + 2] = val; data[p + 3] = 255;
  }
  if (damage) for (let i = 0; i < damage; i++) { const x = Math.floor(W * 0.4 + Math.random() * 20), y = Math.floor(H * 0.55 + Math.random() * 20); const p = (y * W + x) * 4; data[p] = data[p + 1] = data[p + 2] = 128; }
  return { data, W, H };
}
const sig = 'A'.repeat(86);
const code = (i) => `HD1.2021${String(i).padStart(4, '0')}.k3m9x2ab.${1760000000 + i}.${sig}`;

test('decodes the real code format at several scales', () => {
  for (const scale of [3, 4, 6, 9]) { const r = render(code(1), { scale }); assert.equal(decodeQR(r.data, r.W, r.H), code(1), `scale ${scale}`); }
});
test('decodes rotated codes, with noise', () => {
  for (const deg of [0, 15, 45, 90, 170, 280]) { const r = render(code(2), { scale: 5, angle: deg * Math.PI / 180, noise: 40 }); assert.equal(decodeQR(r.data, r.W, r.H), code(2), `angle ${deg}`); }
});
test('repairs damaged modules (Reed-Solomon)', () => {
  const r = render(code(3), { scale: 6, damage: 60, ecl: 'M' }); assert.equal(decodeQR(r.data, r.W, r.H), code(3));
});
test('returns null when there is no code', () => {
  const d = new Uint8ClampedArray(200 * 200 * 4).fill(200); assert.equal(decodeQR(d, 200, 200), null);
});
