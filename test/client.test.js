// The phone-side code (public/js) must agree with the server about what a valid scan is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceKey, signCode, parseCode, verifyCode, b64u } from '../public/js/crypto.js';
import { verifySignature } from '../server/util.js';
import { encodeQR, qrSvg, byteCapacity } from '../public/js/qr.js';

test('a code signed on the phone verifies on the phone and on the server', async () => {
  const { privateKey, publicJwk } = await createDeviceKey();
  assert.equal(privateKey.extractable, false, 'the private key must not be extractable');
  assert.deepEqual(Object.keys(publicJwk).sort(), ['crv', 'kty', 'x', 'y']);
  const t = Math.floor(Date.now() / 1000);
  const code = await signCode(privateKey, '202431000001', 'k3m9x2pq7a', t);
  const parsed = parseCode(code);
  assert.ok(parsed, 'the code parses');
  assert.equal(parsed.univ_id, '202431000001');
  assert.equal(await verifyCode(publicJwk, parsed), true);
  assert.equal(verifySignature(publicJwk, parsed.univ_id, parsed.device_id, parsed.t, parsed.sig), true, 'server accepts it too');
});

test('forged, altered and foreign codes are refused', async () => {
  const a = await createDeviceKey(), b = await createDeviceKey();
  const t = Math.floor(Date.now() / 1000);
  const p = parseCode(await signCode(a.privateKey, '202431000001', 'k3m9x2pq7a', t));
  assert.equal(await verifyCode(b.publicJwk, p), false, 'another phone key does not verify');
  assert.equal(await verifyCode(a.publicJwk, { ...p, t: p.t + 1 }), false, 'a changed time does not verify');
  assert.equal(await verifyCode(a.publicJwk, { ...p, univ_id: '202431000002' }), false, 'a changed student does not verify');
  const sig = b64u.dec(p.sig); sig[5] ^= 1;
  assert.equal(await verifyCode(a.publicJwk, { ...p, sig: b64u.enc(sig) }), false, 'a flipped bit does not verify');
  for (const junk of ['', 'hello', 'HD1.a.b.c.d', 'HD2.202431000001.k3m9x2pq7a.1.' + p.sig, null]) assert.equal(parseCode(junk), null);
});

test('a real code fits a QR code and the SVG is well formed', async () => {
  const { privateKey } = await createDeviceKey();
  const code = await signCode(privateKey, '202431000001', 'k3m9x2pq7a', Math.floor(Date.now() / 1000));
  const q = encodeQR(code, { ecl: 'M' });
  assert.ok(q.version <= 9, `version ${q.version} keeps modules large enough to scan`);
  assert.ok(code.length <= byteCapacity(q.version, 'M'));
  const svg = qrSvg(code);
  assert.match(svg, /^<svg [^>]*viewBox="0 0 \d+ \d+"/);
  assert.throws(() => encodeQR('x'.repeat(5000)), RangeError);
});
