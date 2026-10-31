/* ===== module Util (js/core/util.js) =====
   public: $, pad, iso, parse, todayISO, diffDays, esc, uid, TOTAL */
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
  return { $, pad, iso, parse, todayISO, diffDays, esc, uid, TOTAL };
})();
const { $, pad, iso, parse, todayISO, diffDays, esc, uid, TOTAL } = Util;
