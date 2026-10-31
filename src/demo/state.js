/* ===== module DemoData (demo/state.js) =====
   public: demoState, defaultState */
const DemoData = (() => {
  /* DEMO data: about a year of fictional study (all 26 topics) generated with the same spaced-repetition rules the app uses,
   so the heat map is filled for every interval up to 1Y: reviews at most 3 weeks apart, a two-week break ~5 months ago
   (everything cools, then warms again) and a few topics left alone lately (they cool at the end). */
  function demoState() {
    let seed = 20261030;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const base = new Date(),
      D = n => {
        const d = new Date(base);
        d.setDate(d.getDate() - n);
        return iso(d);
      };
    const ev = [],
      statuses = TOPICS.map(() => 'Todo'),
      scores = TOPICS.map(t => t.score);
    const add = (n, topic, kind, extra = {}) =>
      ev.push({
        id: uid(),
        date: D(n),
        topic,
        kind,
        from: null,
        to: null,
        score: null,
        partial: false,
        demo: true,
        _n: n,
        ...extra,
      });
    const move = (n, i, to) => {
      if (statuses[i] === to) return;
      add(n, i, 'move', { from: statuses[i], to });
      statuses[i] = to;
    };
    const R = (t, S) => 1 / (1 + t / (9 * S)),
      lerp = (a, b, f) => a + (b - a) * Math.max(0, Math.min(1, f));
    /* [topic, started N days ago, first score, last score, final list, day it reached Very Comfortable, day it slipped to To review] */
    const Y = 330,
      BREAK = [150, 164];
    const plan = [
      [12, Y + 40, 64, 94, 'VC', 24],
      [13, Y + 38, 66, 92, 'VC', 24],
      [16, Y + 37, 58, 90, 'VC', 24],
      [19, Y + 36, 80, 100, 'VC', 24],
      [20, Y + 35, 78, 100, 'VC', 24],
      [21, Y + 33, 62, 88, 'VC', 15],
      [11, Y + 32, 60, 86, 'VC', 15],
      [10, Y + 30, 70, 95, 'VC', 15],
      [6, Y + 28, 58, 87, 'VC', 8],
      [5, Y + 27, 60, 88, 'VC', 8],
      [8, Y + 22, 62, 89, 'VC', 3],
      [3, Y + 21, 60, 90, 'VC', 10],
      [9, Y + 19, 72, 93, 'VC', 12],
      [18, Y + 41, 30, 58, 'TR', 26, 6],
      [0, Y + 39, 55, 62, 'TR', 18, 2],
      [2, Y + 25, 35, 61, 'TR', 20, 4],
      [14, Y + 34, 52, 70, 'NC'],
      [15, Y + 33, 45, 64, 'NC'],
      [1, Y + 29, 48, 66, 'NC'],
      [22, Y + 26, 55, 71, 'NC'],
      [4, Y + 24, 50, 69, 'NC'],
      [17, Y + 20, 50, 68, 'Doing'],
      [23, Y + 14, 60, 74, 'Doing'],
      [24, Y + 12, 62, 77, 'Doing'],
      [7, Y + 9, 48, 63, 'Doing'],
      [25, Y + 16, 58, 76, 'Doing'],
    ];
    plan.forEach(([i, start, s0, s1, fin, vc, drop]) => {
      const scoreAt = d => {
        let v;
        if (fin === 'VC')
          v = d >= vc ? lerp(s0, 87, (start - d) / Math.max(1, start - vc)) : lerp(87, s1, (vc - d) / Math.max(1, vc));
        else if (fin === 'TR')
          v =
            d >= vc
              ? lerp(s0, 88, (start - d) / Math.max(1, start - vc))
              : lerp(88, s1, (vc - d) / Math.max(1, vc - drop));
        else v = lerp(s0, s1, (start - d) / Math.max(1, start));
        return Math.round(Math.max(0, Math.min(100, v + (rnd() * 6 - 3))));
      };
      const days = new Set();
      let S = 0,
        d = start,
        prev = null,
        p0 = null;
      while (d >= 0) {
        days.add(d);
        const p = scoreAt(d);
        if (prev == null) S = p >= 85 ? 2 : p >= 70 ? 1.5 : 1;
        else {
          const r = R(prev - d, S);
          S = p >= 70 ? S * (1 + 1.2 * (p / 100) * (1.5 - r)) : p >= 60 ? S * 1.2 : Math.max(1, 0.4 * S);
        }
        prev = d;
        d -= Math.max(2, Math.min(21, Math.round(S * (0.8 + rnd() * 0.4))));
        if (d <= BREAK[1] && d >= BREAK[0]) d = BREAK[0] - 1 - Math.floor(rnd() * 3);
      }
      if (vc != null) days.add(vc);
      if (drop != null) days.add(drop);
      const list = [...days].sort((a, b) => b - a);
      move(start, i, 'Doing');
      list.forEach((d, k) => {
        let p = scoreAt(d);
        if (d === vc) p = Math.max(p, 86);
        if (fin === 'TR' && d <= drop) p = Math.min(p, 66);
        if (k > 0 && rnd() < 0.07 && d !== vc && d !== drop) add(d, i, 'review', { partial: true });
        else add(d, i, k ? 'review' : 'study', { score: p });
        scores[i] = p;
        if (k === 1 && (fin === 'NC' || ((fin === 'VC' || fin === 'TR') && s0 < 72))) move(d, i, 'Not Comfortable');
        if (d === vc) move(d, i, 'Very Comfortable');
        if (d === drop) move(d, i, 'To review');
      });
    });
    /* a few weaker topics were left alone lately → they show up as overdue suggestions */
    for (let k = ev.length - 1; k >= 0; k--) {
      const e = ev[k];
      if ([18, 15, 22, 1, 14].includes(e.topic) && e.kind !== 'move' && e._n < 5) ev.splice(k, 1);
    }
    for (let k = ev.length - 1; k >= 0; k--) {
      const e = ev[k];
      if (e.topic === 15 && e.kind !== 'move' && e._n < 9) ev.splice(k, 1);
    }
    /* rest days a while ago, then a steady 11-day streak */
    ev.forEach(e => {
      if (e._n === 11 || e._n === 19 || e._n === 30) {
        e._n += 1;
        e.date = D(e._n);
      }
    });
    for (let n = 0; n <= 10; n++)
      if (!ev.some(e => e._n === n))
        add(n, [12, 16, 21, 6][n % 4], 'review', { score: Math.min(98, 85 + Math.round(rnd() * 10)) });
    ev.forEach(e => delete e._n);
    const tests = [
      [38, 55],
      [33, 61],
      [29, 59],
      [24, 66],
      [19, 71],
      [14, 70],
      [9, 77],
      [5, 82],
      [2, 86],
    ].map(([n, sc]) => ({ id: uid(), date: D(n), q: 60, score: sc }));
    const ex = new Date(base);
    ex.setDate(ex.getDate() + 31);
    return { v: 13, statuses, scores, events: ev, tests, deadline: iso(ex), lang: 'en', updatedAt: 0 };
  }
  function defaultState() {
    return demoState();
  }
  return { demoState, defaultState };
})();
const { demoState, defaultState } = DemoData;
