// A compact QR decoder for browsers without BarcodeDetector (iPhone Safari, Firefox).
// Pipeline: binarise -> find three finder patterns -> sample the grid -> read format -> unmask -> Reed-Solomon -> byte mode.
import { QR_TABLES } from './qr.js';
const { ECC_PER_BLOCK, NUM_BLOCKS, rawModules } = QR_TABLES;

// ---- Galois field 256 ----
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
const inv = (a) => EXP[255 - LOG[a]];

// Corrects `block` (data + ecc codewords) in place. Returns false if it cannot.
function rsCorrect(block, nEcc) {
  const n = block.length;
  const S = [];
  let bad = false;
  for (let i = 0; i < nEcc; i++) { let s = 0; for (let j = 0; j < n; j++) s = mul(s, EXP[i]) ^ block[j]; S.push(s); if (s) bad = true; }
  if (!bad) return true;
  // Berlekamp-Massey
  let C = [1], B = [1], L = 0, m = 1, b = 1;
  for (let i = 0; i < nEcc; i++) {
    let d = S[i];
    for (let j = 1; j <= L; j++) d ^= mul(C[j] || 0, S[i - j]);
    if (!d) { m++; continue; }
    const T = C.slice(); const coef = mul(d, inv(b));
    while (C.length < B.length + m) C.push(0);
    for (let j = 0; j < B.length; j++) C[j + m] ^= mul(coef, B[j]);
    if (2 * L <= i) { L = i + 1 - L; B = T; b = d; m = 1; } else m++;
  }
  if (L * 2 > nEcc) return false;
  // Chien search: error at position p (from the end) if C(alpha^-p) = 0
  const pos = [];
  for (let p = 0; p < n; p++) { let v = 0; for (let j = 0; j <= L; j++) v ^= mul(C[j] || 0, EXP[(255 - (p % 255)) * j % 255]); if (!v) pos.push(p); }
  if (pos.length !== L) return false;
  // Error evaluator Omega = S(x)*C(x) mod x^nEcc
  const omega = new Array(nEcc).fill(0);
  for (let i = 0; i < nEcc; i++) for (let j = 0; j <= i && j <= L; j++) omega[i] ^= mul(C[j] || 0, S[i - j]);
  for (const p of pos) {
    const xi = EXP[p % 255], xinv = inv(xi);
    let num = 0, xp = 1; for (let i = 0; i < nEcc; i++) { num ^= mul(omega[i], xp); xp = mul(xp, xinv); }
    let den = 0; for (let j = 1; j <= L; j += 2) den ^= mul(C[j] || 0, EXP[(255 - (p % 255)) * (j - 1) % 255]);
    if (!den) return false;
    block[n - 1 - p] ^= mul(xi, mul(num, inv(den)));
  }
  for (let i = 0; i < nEcc; i++) { let s = 0; for (let j = 0; j < n; j++) s = mul(s, EXP[i]) ^ block[j]; if (s) return false; }
  return true;
}

// ---- Binarise (local mean via integral image) ----
function binarize(rgba, w, h, bias) {
  const g = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000;
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
  const r = Math.max(8, Math.floor(Math.min(w, h) / 10));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      out[y * w + x] = g[y * w + x] < (sum / ((x1 - x0) * (y1 - y0))) * bias ? 1 : 0;
    }
  }
  return out;
}

// ---- Finder patterns: 1:1:3:1:1 runs, confirmed in both directions ----
function ratioOk(r) {
  const tot = r[0] + r[1] + r[2] + r[3] + r[4]; if (tot < 7) return 0;
  const m = tot / 7, tol = m * 0.6;
  return Math.abs(r[0] - m) < tol && Math.abs(r[1] - m) < tol && Math.abs(r[2] - 3 * m) < 3 * tol && Math.abs(r[3] - m) < tol && Math.abs(r[4] - m) < tol ? m : 0;
}
function crossCheck(bin, w, h, cx, cy, vertical) {
  const get = (k) => (vertical ? bin[k * w + Math.round(cx)] : bin[Math.round(cy) * w + k]);
  const len = vertical ? h : w, c = Math.round(vertical ? cy : cx);
  const r = [0, 0, 0, 0, 0]; let k = c;
  while (k >= 0 && get(k)) { r[2]++; k--; } while (k >= 0 && !get(k)) { r[1]++; k--; } while (k >= 0 && get(k)) { r[0]++; k--; }
  k = c + 1;
  while (k < len && get(k)) { r[2]++; k++; } while (k < len && !get(k)) { r[3]++; k++; } while (k < len && get(k)) { r[4]++; k++; }
  const m = ratioOk(r); if (!m) return null;
  return { m, center: (vertical ? cy : cx) + ((r[2] - 1) / 2 - r[2] / 2) + 0.5 * 0 + ((r[3] + r[4] - r[0] - r[1]) / 2) * 0 };
}
function findFinders(bin, w, h) {
  const found = [];
  for (let y = 0; y < h; y++) {
    const runs = []; let cur = bin[y * w], start = 0;
    for (let x = 1; x <= w; x++) {
      if (x === w || bin[y * w + x] !== cur) { runs.push({ v: cur, s: start, n: x - start }); if (x < w) { cur = bin[y * w + x]; start = x; } }
    }
    for (let i = 0; i + 4 < runs.length; i++) {
      if (!runs[i].v) continue;
      const r = [0, 1, 2, 3, 4].map((j) => runs[i + j].n);
      const m = ratioOk(r); if (!m) continue;
      const cx = runs[i + 2].s + runs[i + 2].n / 2;
      if (!crossCheck(bin, w, h, cx, y, true)) continue;
      // refine centre along the vertical run containing (cx,y)
      let y0 = y, y1 = y; const xi = Math.round(cx);
      while (y0 > 0 && bin[(y0 - 1) * w + xi]) y0--; while (y1 < h - 1 && bin[(y1 + 1) * w + xi]) y1++;
      const cy = (y0 + y1) / 2 + 0.5;
      const hit = found.find((f) => Math.hypot(f.x - cx, f.y - cy) < f.m * 3);
      if (hit) { hit.x = (hit.x * hit.n + cx) / (hit.n + 1); hit.y = (hit.y * hit.n + cy) / (hit.n + 1); hit.m = (hit.m * hit.n + m) / (hit.n + 1); hit.n++; } else found.push({ x: cx, y: cy, m, n: 1 });
    }
  }
  return found.filter((f) => f.n >= 2).sort((a, b) => b.n - a.n).slice(0, 8);
}
function pickTriple(f) {
  let best = null, bestScore = Infinity;
  for (let a = 0; a < f.length; a++) for (let b = a + 1; b < f.length; b++) for (let c = b + 1; c < f.length; c++) {
    const P = [f[a], f[b], f[c]];
    for (let v = 0; v < 3; v++) {
      const o = P[v], p = P[(v + 1) % 3], q = P[(v + 2) % 3];
      const d1 = Math.hypot(p.x - o.x, p.y - o.y), d2 = Math.hypot(q.x - o.x, q.y - o.y), hyp = Math.hypot(p.x - q.x, p.y - q.y);
      const ms = (o.m + p.m + q.m) / 3; if (Math.abs(o.m - ms) > ms * 0.5 || Math.abs(p.m - ms) > ms * 0.5 || Math.abs(q.m - ms) > ms * 0.5) continue;
      const score = Math.abs(d1 - d2) / Math.max(d1, d2) + Math.abs(hyp - Math.hypot(d1, d2)) / hyp;
      if (score < bestScore) {
        bestScore = score;
        const cross = (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
        best = cross > 0 ? { tl: o, tr: p, bl: q } : { tl: o, tr: q, bl: p };
      }
    }
  }
  return bestScore < 0.45 ? best : null;
}

// ---- Structure of a QR symbol ----
const alignPos = (ver) => {
  if (ver === 1) return []; const n = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2; const r = [6];
  for (let i = n - 1; i >= 1; i--) r.splice(1, 0, size - 7 - (n - 1 - i) * step); return r.sort((a, b) => a - b);
};
function functionMask(ver) {
  const size = ver * 4 + 17, f = Array.from({ length: size }, () => new Uint8Array(size));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if ((x < 9 && y < 9) || (x >= size - 8 && y < 9) || (x < 9 && y >= size - 8) || x === 6 || y === 6) f[y][x] = 1;
    if (ver >= 7 && ((x < 6 && y >= size - 11 && y < size - 8) || (y < 6 && x >= size - 11 && x < size - 8))) f[y][x] = 1;
  }
  const ap = alignPos(ver);
  for (const cy of ap) for (const cx of ap) {
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === ap[ap.length - 1]) || (cy === 6 && cx === ap[ap.length - 1])) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) f[cy + dy][cx + dx] = 1;
  }
  return f;
}
const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0, (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
const ECL_FROM_BITS = ['M', 'L', 'H', 'Q'];
const FORMATS = (() => { const m = new Map(); for (let d = 0; d < 32; d++) { let r = d << 10; for (let i = 14; i >= 10; i--) if ((r >>> i) & 1) r ^= 0x537 << (i - 10); m.set(((d << 10) | r) ^ 0x5412, d); } return m; })();
const pop = (x) => { let c = 0; while (x) { c += x & 1; x >>>= 1; } return c; };
function readFormat(M, size) {
  const b = (x, y) => (M[y][x] ? 1 : 0);
  let a = 0, c = 0;
  for (let i = 0; i <= 5; i++) a |= b(8, i) << i; a |= b(8, 7) << 6; a |= b(8, 8) << 7; a |= b(7, 8) << 8; for (let i = 9; i < 15; i++) a |= b(14 - i, 8) << i;
  for (let i = 0; i < 8; i++) c |= b(size - 1 - i, 8) << i; for (let i = 8; i < 15; i++) c |= b(8, size - 15 + i) << i;
  let best = null, bd = 4;
  for (const [word, d] of FORMATS) for (const x of [a, c]) { const dist = pop(word ^ x); if (dist < bd) { bd = dist; best = d; } }
  return best == null ? null : { ecl: ECL_FROM_BITS[best >> 3], mask: best & 7 };
}

function decodeMatrix(M, ver) {
  const size = ver * 4 + 17; const fmt = readFormat(M, size); if (!fmt) return null;
  const fn = functionMask(ver), bits = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x]) bits.push((M[y][x] ? 1 : 0) ^ (MASKS[fmt.mask](x, y) ? 1 : 0));
    }
  }
  const total = Math.floor(rawModules(ver) / 8); if (bits.length < total * 8) return null;
  const cw = []; for (let i = 0; i < total; i++) { let v = 0; for (let k = 0; k < 8; k++) v = (v << 1) | bits[i * 8 + k]; cw.push(v); }
  const nb = NUM_BLOCKS[fmt.ecl][ver], ecc = ECC_PER_BLOCK[fmt.ecl][ver], shortLen = Math.floor(total / nb), nShort = nb - (total % nb);
  const blocks = Array.from({ length: nb }, () => []); let k = 0;
  const dataLen = (i) => shortLen - ecc + (i >= nShort ? 1 : 0);
  for (let i = 0; i <= shortLen - ecc; i++) for (let b = 0; b < nb; b++) if (i < dataLen(b)) blocks[b].push(cw[k++]);
  for (let i = 0; i < ecc; i++) for (let b = 0; b < nb; b++) blocks[b].push(cw[k++]);
  const data = [];
  for (const blk of blocks) { if (!rsCorrect(blk, ecc)) return null; data.push(...blk.slice(0, blk.length - ecc)); }
  // Byte mode only (that is all Hadir codes use); skip an ECI header if present.
  let pos = 0; const read = (n) => { let v = 0; for (let i = 0; i < n; i++, pos++) v = (v << 1) | ((data[pos >> 3] >> (7 - (pos & 7))) & 1); return v; };
  let mode = read(4); if (mode === 7) { const e = read(8); if (e & 0x80) read(8); mode = read(4); }
  if (mode !== 4) return null;
  const n = read(ver <= 9 ? 8 : 16); const out = new Uint8Array(n); for (let i = 0; i < n; i++) out[i] = read(8);
  return new TextDecoder().decode(out);
}

function sample(bin, w, h, tri, ver) {
  const dim = ver * 4 + 17, { tl, tr, bl } = tri, span = dim - 7;
  const ux = (tr.x - tl.x) / span, uy = (tr.y - tl.y) / span, vx = (bl.x - tl.x) / span, vy = (bl.y - tl.y) / span;
  const M = Array.from({ length: dim }, () => new Array(dim).fill(false));
  // Take the vote of the centre and four neighbours to tolerate blur and slight skew.
  const at = (px, py) => { const x = Math.round(px), y = Math.round(py); return x < 0 || y < 0 || x >= w || y >= h ? 0 : bin[y * w + x]; };
  for (let my = 0; my < dim; my++) for (let mx = 0; mx < dim; mx++) {
    const dx = mx + 0.5 - 3.5, dy = my + 0.5 - 3.5, px = tl.x + dx * ux + dy * vx, py = tl.y + dx * uy + dy * vy;
    const q = 0.25; let s = at(px, py) * 2; s += at(px + q * ux, py + q * uy) + at(px - q * ux, py - q * uy) + at(px + q * vx, py + q * vy) + at(px - q * vx, py - q * vy);
    M[my][mx] = s >= 4;
  }
  return M;
}

export function decodeQR(rgba, w, h) {
  for (const bias of [0.92, 1.0, 0.85]) {
    const bin = binarize(rgba, w, h, bias);
    const finders = findFinders(bin, w, h); if (finders.length < 3) continue;
    const tri = pickTriple(finders); if (!tri) continue;
    const ms = (tri.tl.m + tri.tr.m + tri.bl.m) / 3;
    const span = (Math.hypot(tri.tr.x - tri.tl.x, tri.tr.y - tri.tl.y) + Math.hypot(tri.bl.x - tri.tl.x, tri.bl.y - tri.tl.y)) / 2 / ms;
    const guess = Math.round((span + 7 - 17) / 4);
    for (const ver of [guess, guess - 1, guess + 1]) {
      if (ver < 1 || ver > 40) continue;
      try { const text = decodeMatrix(sample(bin, w, h, tri, ver), ver); if (text) return text; } catch { /* try the next guess */ }
    }
  }
  return null;
}
