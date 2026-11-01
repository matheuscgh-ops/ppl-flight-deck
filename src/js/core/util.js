/* ===== module Util (js/core/util.js) =====
   public: $, pad, iso, parse, todayISO, diffDays, esc, uid, TOTAL, flip */
const Util = (() => {
  const $ = s => document.querySelector(s);
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  };
  const todayISO = () => iso(new Date());
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
  return { $, pad, iso, parse, todayISO, diffDays, esc, uid, TOTAL, flip };
})();
const { $, pad, iso, parse, todayISO, diffDays, esc, uid, TOTAL, flip } = Util;
