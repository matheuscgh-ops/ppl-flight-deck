/* ===== module Util (js/core/util.js) =====
   public: $, pad, iso, parse, todayISO, nowMinutes, studyNow, setDayStart, diffDays, esc, uid, TOTAL, flip
   The study day: it starts at the plan grid's first hour (Settings, 6:00 by default) and runs 24 hours, so studying
   past midnight still belongs to the day you started (like the plan grid, which runs from 6:00 to 6:00). todayISO()
   is that day; nowMinutes() counts from its midnight (00:30 after midnight is 24 × 60 + 30). */
const Util = (() => {
  const $ = s => document.querySelector(s);
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  };
  /* minutes after midnight that still belong to the day before: the grid's first hour (Settings); 0 until the settings
     are loaded, or where a test sets it */
  let fixedStart = null;
  const setDayStart = m => (fixedStart = m);
  const dayStartMin = () => {
    if (fixedStart != null) return fixedStart;
    try {
      return typeof pref === 'function' ? pref('gridStart') * 60 : 0;
    } catch (e) {
      return 0;
    }
  };
  /* a Date whose calendar day is the study day (its clock time is shifted: only use its date) */
  const studyNow = () => new Date(Date.now() - dayStartMin() * 60000);
  const todayISO = () => iso(studyNow());
  const nowMinutes = () => {
    const n = new Date(),
      m = n.getHours() * 60 + n.getMinutes();
    return m < dayStartMin() ? m + 24 * 60 : m;
  };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const esc = s =>
    String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const TOTAL = TOPICS.reduce((a, b) => a + b.q, 0);
  /* FLIP: run mutate() (which moves elements in the page), then slide each of els from where it was to where it is
     now, so cards glide aside to open a gap instead of jumping (the Trello feel). Skipped with reduced motion. */
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function flip(els, mutate) {
    if (reduceMotion.matches) return mutate();
    const before = new Map(els.map(el => [el, el.getBoundingClientRect()]));
    mutate();
    els.forEach(el => {
      const a = before.get(el);
      if (!el.isConnected || !a) return;
      const b = el.getBoundingClientRect(),
        dx = a.left - b.left,
        dy = a.top - b.top;
      if (!dx && !dy) return;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px,${dy}px)`;
      el.getBoundingClientRect();
      el.style.transition = 'transform .16s cubic-bezier(.2,.8,.2,1)';
      el.style.transform = '';
      clearTimeout(el._flipT);
      el._flipT = setTimeout(() => (el.style.transition = ''), 200);
    });
  }
  return { $, pad, iso, parse, todayISO, nowMinutes, studyNow, setDayStart, diffDays, esc, uid, TOTAL, flip };
})();
const { $, pad, iso, parse, todayISO, nowMinutes, studyNow, setDayStart, diffDays, esc, uid, TOTAL, flip } = Util;
