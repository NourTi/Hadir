// Phone clocks drift. When online, we remember how far this phone is from the server and correct for it,
// so a student's code and the teacher's check agree even if one phone's clock is a minute off.
const KEY = 'hadir.clock';
let offset = 0;
try { offset = Number(localStorage.getItem(KEY)) || 0; } catch { /* storage unavailable */ }

export const clock = {
  now: () => Date.now() + offset,
  offset: () => offset,
  async sync(fetchTime) {
    try {
      const t0 = Date.now();
      const { now } = await fetchTime();
      const t1 = Date.now();
      offset = Math.round(now - (t0 + t1) / 2);
      try { localStorage.setItem(KEY, String(offset)); } catch { /* ignore */ }
      return offset;
    } catch { return offset; }
  },
};
