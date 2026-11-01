/* ===== module SpacedRepetition (js/model/spaced-repetition.js) =====
   public: recall, addDays, isTracked, srModel, srAll, scoreAt */
const SpacedRepetition = (() => {
  /* ================= SPACED REPETITION (DEMO MODEL) =================
   R(t) = 1 / (1 + t / (9·S))      recall t days after the last session; S = days until recall falls to 90%
   first session:   S = 1 (score < 70) · 1.5 (70–84) · 2 (≥ 85)
   later session with score p, when recall had fallen to R:
     p ≥ 70  →  S ← S · (1 + 1.2 · p/100 · (1.5 − R))
     60–69   →  S ← S · 1.2
     p < 60  →  S ← max(1, 0.4 · S)
   next review = when recall falls to the review threshold r (Settings, default 90 %):
                 last session + 9·S·(1/r − 1) days  (r = 90 % gives exactly S days)
   priority = (1 − R_now + 0.05 · min(days overdue, 10)) · √questions · list weight · (1 + max(0, 85 − score)/100)
*/
  const SR_LISTS = ['Very Comfortable', 'Not Comfortable', 'To review'];
  const LISTW = { 'Not Comfortable': 1.4, 'To review': 1.3, 'Very Comfortable': 1 };
  const recall = (dt, S) => 1 / (1 + Math.max(0, dt) / (9 * S));
  const addDays = (s, n) => {
    const d = parse(s);
    d.setDate(d.getDate() + n);
    return iso(d);
  };
  function isTracked(i) {
    return (
      SR_LISTS.includes(state.statuses[i]) ||
      state.events.some(
        e => e.topic === i && e.kind === 'move' && (e.to === 'Very Comfortable' || e.to === 'Not Comfortable')
      )
    );
  }
  function srModel(i, asOf, before) {
    const today = asOf || todayISO(),
      by = {};
    state.events.forEach(e => {
      if (
        e.topic === i &&
        (e.kind === 'study' || e.kind === 'review') &&
        !e.partial &&
        (before ? e.date < today : e.date <= today)
      )
        (by[e.date] ??= []).push(e);
    });
    const reps = [];
    let S = 0,
      prev = null;
    Object.keys(by)
      .sort()
      .forEach(d => {
        const sc = by[d].map(e => e.score).filter(v => v != null),
          p = sc.length ? Math.max(...sc) : ((asOf ? scoreAt(i, d) : state.scores[i]) ?? 70);
        let Rb = null;
        if (prev == null) S = p >= 85 ? 2 : p >= 70 ? 1.5 : 1;
        else {
          Rb = recall(diffDays(prev, d), S);
          S = p >= 70 ? S * (1 + 1.2 * (p / 100) * (1.5 - Rb)) : p >= 60 ? S * 1.2 : Math.max(1, 0.4 * S);
        }
        reps.push({ date: d, p, Rb, S });
        prev = d;
      });
    const m = { i, reps, tracked: isTracked(i), R: null, S: null, over: null, p: state.scores[i] };
    if (reps.length) {
      const l = reps[reps.length - 1],
        tn = diffDays(l.date, today),
        iv = Math.max(1, Math.round(9 * l.S * (1 / pref('reviewAt') - 1)));
      Object.assign(m, { R: recall(tn, l.S), S: l.S, last: l.date, p: l.p, next: addDays(l.date, iv), over: tn - iv });
    }
    const w = LISTW[state.statuses[i]] || 0.8,
      gap = 1 + Math.max(0, GOAL - (m.p ?? 70)) / 100;
    m.pr = (reps.length ? 1 - m.R + 0.05 * Math.min(Math.max(m.over, 0), 10) : 0.45) * Math.sqrt(TOPICS[i].q) * w * gap;
    return m;
  }
  function srAll(asOf, before) {
    return TOPICS.map((_, i) => srModel(i, asOf, before))
      .filter(m => m.tracked)
      .sort((a, b) => b.pr - a.pr);
  }
  /* latest known Sporty's score of a topic on a date (falls back to the starting score) */
  function scoreAt(i, d) {
    let best = null,
      bd = '';
    state.events.forEach(e => {
      if (e.topic === i && e.score != null && e.date <= d && e.date >= bd) {
        best = e.score;
        bd = e.date;
      }
    });
    return best != null ? best : TOPICS[i].score;
  }
  return { recall, addDays, isTracked, srModel, srAll, scoreAt };
})();
const { recall, addDays, isTracked, srModel, srAll, scoreAt } = SpacedRepetition;
