// Camera QR scanning. Uses the browser's built-in BarcodeDetector where it exists (Chrome and Edge on Android and desktop),
// and falls back to Hadir's own decoder (qrdecode.js) everywhere else, so it also works on iPhones and Firefox.
let decoderPromise = null;

async function getDecoder() {
  if ('BarcodeDetector' in window) {
    try {
      const det = new BarcodeDetector({ formats: ['qr_code'] });
      return { native: true, decode: async (video) => { const r = await det.detect(video); return r[0]?.rawValue || ''; } };
    } catch { /* fall through to the built-in decoder */ }
  }
  decoderPromise ||= import('./qrdecode.js').then((m) => {
    const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true });
    return { native: false, decode: async (video) => {
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return '';
      const scale = Math.min(1, 720 / Math.max(w, h));
      cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
      cx.drawImage(video, 0, 0, cv.width, cv.height);
      const img = cx.getImageData(0, 0, cv.width, cv.height);
      return m.decodeQR(img.data, img.width, img.height) || '';
    } };
  });
  return decoderPromise;
}

export const cameraAvailable = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

// Returns { stop }. Calls onText(text) for every frame that holds a code (the caller ignores repeats).
export async function startScanner(video, onText) {
  if (!cameraAvailable()) throw Object.assign(new Error('no camera api'), { code: 'no_camera_api' });
  const decoder = await getDecoder();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) { throw Object.assign(new Error(e.name), { code: e.name === 'NotAllowedError' ? 'denied' : 'no_camera' }); }
  video.srcObject = stream;
  video.setAttribute('playsinline', ''); video.muted = true;
  await video.play().catch(() => {});
  let alive = true, last = 0, busy = false;
  const loop = async (ts) => {
    if (!alive) return;
    if (!busy && ts - last > (decoder.native ? 90 : 150) && video.readyState >= 2) {
      last = ts; busy = true;
      try { const text = await decoder.decode(video); if (text && alive) onText(text); } catch { /* a bad frame is fine */ }
      busy = false;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return {
    native: decoder.native,
    stop() { alive = false; stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; },
  };
}

// Short sounds and vibration so a teacher can scan without looking at the screen.
let ctx = null;
export function feedback(kind) {
  try {
    if (localStorage.getItem('hadir.sound') === 'off') return;
    navigator.vibrate?.(kind === 'reject' ? [60, 40, 60] : 35);
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    const tone = (freq, at, len) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = freq; o.type = 'sine'; g.gain.setValueAtTime(0.0001, ctx.currentTime + at); g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + len); o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + len + 0.02); };
    if (kind === 'present') { tone(880, 0, 0.09); tone(1175, 0.09, 0.1); }
    else if (kind === 'late') { tone(660, 0, 0.12); }
    else if (kind === 'duplicate') { tone(520, 0, 0.07); }
    else { tone(220, 0, 0.14); tone(180, 0.16, 0.18); }
  } catch { /* audio is optional */ }
}
