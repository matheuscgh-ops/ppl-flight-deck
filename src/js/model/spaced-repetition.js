/* ===== module SpacedRepetition (js/model/spaced-repetition.js) =====
   public: recall, addDays, isTracked, srModel, srAll, scoreAt, evidenceOf, chanceAt, retentionScale, clearModels, UNKNOWN_N,
           REP_MIN_N */
const SpacedRepetition = (() => {
  /* ================= WHAT THE APP KNOWS ABOUT A TOPIC =================
   Four separate things, never mixed:
     observed result  what a session or a test showed: right / total (or only a %, for records saved before counts
                      were kept — their number of questions stays UNKNOWN, it is never invented)
     mastery          estimated share of the topic's questions you can answer, from all your results
     confidence       how much evidence that estimate rests on (effective number of questions)
     retention        ESTIMATED share of it still in memory today — a model, not a measurement of your memory

   EVIDENCE. Every scored session (Kanban log, plan tick with a score) and every topic result of an imported practice
   test is one observation: score p, sample n (questions; unknown → weighs as UNKNOWN_N = 15, the app's usual session)
   and the kind of attempt:
       first / new questions            weight 1     what you know
       repeat (the same questions)      weight 0.3   partly remembering the answers
       after seeing the answer          weight 0     no evidence (you just read it) — not a review either
   Records without a kind: the first of a day counts as a first attempt, a later one the same day as a repeat (a retake
   of the same set), so the BEST score of a day never replaces the first one.

   MASTERY  a trend of your results day by day (Holt's method, see MASTERY AS A TREND below): the first result is
            shrunk toward p̄ by its sample, m = (n·p + K·p̄) / (n + K), K = 4; later ones move the level by up to 85%
            (less for a small sample or a repeat) and a damped trend follows steady progress. Out of sample it beat
            repeating the last score; a 45-day average lagged 7 points behind (backtest of 2026-11-11).
            Confidence still uses Σ w·n with w = attempt weight × 0.15^(sessions of the topic since).
            p̄ = your overall level: the same weighted average over ALL topics, pulled toward 50% by 30 questions (50%
            when there is nothing at all) — a topic with little evidence is assumed to be like the rest of your work,
            not like a guess. With p̄ = 50%:
            2/2 → 67%, 40/40 → 95%; 50% then 100% on the same questions → 60%. A topic with no evidence at all gets p̄,
            marked as an assumption (low confidence).
   CONFIDENCE  N = Σ w·n effective questions: low under 10, medium under 30, high from 30 — and never "high" when
            every result behind it has an unknown sample (a % without a count).

   SPACED REPETITION (a review = a day with at least one retrieval of REP_MIN_N = 8 questions or more (or the whole
   topic, when it is smaller), or of unknown size; smaller samples count toward mastery but do not reset the review clock, so a few right answers in a practice
   test never postpone the review of a whole topic)
     R(t) = 1 / (1 + t / (9·S))      estimated recall t days after the last review; S = days until it falls to 90%
     first review:   S = 1 (score < 70) · 1.5 (70–84) · 2 (≥ 85)
     later review with score p (the day's first attempt), when recall had fallen to R:
         target  p ≥ 70  →  S · (1 + 1.2 · p/100 · (1.5 − R))
                 60–69   →  S                    (a weak result never lengthens the interval)
                 p < 60  →  max(1, 0.4 · S)
         S moves toward the target by λ = attempt weight × min(1, n / 15): a 40-question session moves it fully,
         4 questions barely; a record of unknown size moves it fully (as before counts were kept).
     a low score is ONE event: it lowers S once here and lowers mastery once — nothing else multiplies it again.
     Why it was low (explains the suggested activity, changes no number): recall was still ≥ 85% when you got it wrong
     → understanding; otherwise → forgetting.
   next review = when R falls to the review threshold r (Settings, default 90 %): last review + 9·S·(1/r − 1) days,
                 never more than 30% of the days left until the exam (Cepeda et al. 2008: the best gap for a test weeks
                 away is 20–40% of the time left; a gap past the exam date is useless)
   RETENTION FOR THE FORECAST  the chance of a right answer uses R with the time scaled by c, fitted to YOUR history:
                 among c = 1, 1.5, 2, 3, 5, 8, 13, 21, the one that best predicts your next session's score from the one
                 before (least squares over the last 200 pairs of sessions BEFORE the date forecast, so a past date
                 never sees what came after it; 20 needed, else c = 1). c > 1 means you
                 forget more slowly than the default curve; scheduling keeps c = 1 (reviews stay on the safe side).
   An imported "errors only" test with misses in a topic after its last review makes the topic due now.
   need (the order of the "needs recall" lists) = expected misses now × exam share × 60, × 1.2 when due.            */
  const UNKNOWN_N = 15,
    REP_MIN_N = 8,
    PRIOR_K = 4,
    POOL_K = 30,
    PRIOR_P = 0.5,
    DECAY_SESSION = 0.15 /* weight kept by a session for each later session of the same topic */,
    GAP_SHARE = 0.3 /* longest interval: 30% of the days left until the exam */,
    ATTEMPT_W = { first: 1, new: 1, repeat: 0.3, after: 0 };
  const SR_LISTS = ['Very Comfortable', 'Not Comfortable', 'To review'];
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
  /* the observations of topic i up to a date: sessions (with their attempt kind) and imported test results.
     Projected sessions of a weekly plan (proj) are reviews for the schedule but never evidence of mastery. */
  /* sessions grouped by topic, rebuilt when the list of events changes */
  let _byTopic = null;
  function sessionsOf(i) {
    const ev = state.events,
      key = ev.length + '|' + (ev.at(-1) || {}).id + '|' + (ev[0] || {}).id;
    if (!_byTopic || _byTopic.k !== key || _byTopic.ev !== ev) {
      const m = new Map();
      ev.forEach(e => {
        if (e.kind !== 'study' && e.kind !== 'review') return;
        if (!m.has(e.topic)) m.set(e.topic, []);
        m.get(e.topic).push(e);
      });
      _byTopic = { k: key, ev, m };
    }
    return _byTopic.m.get(i) || [];
  }
  function evidenceOf(i, today, before) {
    const inRange = d => (before ? d < today : d <= today),
      out = [],
      seen = {};
    sessionsOf(i).forEach(e => {
      if (e.partial || !inRange(e.date)) return;
      const first = !seen[e.date];
      seen[e.date] = true;
      const attempt = e.attempt || (first ? 'first' : 'repeat');
      out.push({
        date: e.date,
        p: e.score,
        right: e.right ?? null,
        total: e.total ?? null,
        attempt,
        src: e.proj ? 'proj' : 'log',
        id: e.id,
      });
    });
    (state.exams || []).forEach(x => {
      if (!inRange(x.date)) return;
      const r = (x.topics || []).find(t => t.i === i && t.total > 0 && t.right != null);
      if (r)
        out.push({
          date: x.date,
          p: Math.round((100 * r.right) / r.total),
          right: r.right,
          total: r.total,
          attempt: 'new',
          src: 'exam',
          exam: x.examId,
          id: x.id,
        });
    });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  const nOf = o => (o.total > 0 ? o.total : UNKNOWN_N);
  /* weighted evidence of a topic (no prior): { num, den, known (has a count), unknownN }; each result weighs its
     attempt × its sample × 0.15 per later session (day) of the same topic */
  function weigh(ev, today) {
    let num = 0,
      den = 0,
      unknownN = false,
      known = false;
    const days = [...new Set(ev.map(o => o.date))].sort(),
      after = d => days.length - 1 - days.indexOf(d);
    ev.forEach(o => {
      const w = ATTEMPT_W[o.attempt] * Math.pow(DECAY_SESSION, after(o.date)),
        n = nOf(o);
      if (o.total > 0) known = true;
      else unknownN = true;
      num += w * n * (o.p / 100);
      den += w * n;
    });
    return { num, den, known, unknownN };
  }
  /* MASTERY AS A TREND (Holt's linear method with a damped trend, per day of the topic):
       each day = the weighted mean of its results (attempt × sample), its weight w = Σ attempt × min(1, n / 15)
       first day   level = (n·p + K·p̄) / (n + K)   (the sample shrinkage: 2/2 is not 40/40), trend = 0
       later days  α' = α × min(1, w)   level ← α'·p + (1 − α')·(level + φ·trend)
                   trend ← β·(level − previous level) + (1 − β)·φ·trend
       mastery = level + φ·trend, between 0 and 1        α = 0.85, β = 0.5, φ = 0.8
     Chosen out of sample: fitted on the sessions up to 2026-10-20 of the personal backup, it predicted the next session
     of each topic after that date better than repeating the last score (3.7 vs 4.0 points, 34 sessions). */
  const HOLT = { a: 0.85, b: 0.5, phi: 0.8 };
  function holtMastery(meas, pbar) {
    const byDay = new Map();
    meas.forEach(o => {
      const w = ATTEMPT_W[o.attempt],
        n = nOf(o),
        d = byDay.get(o.date) || { num: 0, den: 0, w: 0 };
      d.num += w * n * (o.p / 100);
      d.den += w * n;
      d.w += w * Math.min(1, n / UNKNOWN_N);
      byDay.set(o.date, d);
    });
    let level = null,
      trend = 0;
    [...byDay.keys()].sort().forEach(k => {
      const d = byDay.get(k),
        p = d.num / d.den;
      if (level == null) {
        level = (d.den * p + PRIOR_K * pbar) / (d.den + PRIOR_K);
        return;
      }
      const a = HOLT.a * Math.min(1, d.w),
        prev = level;
      level = a * p + (1 - a) * (level + HOLT.phi * trend);
      trend = HOLT.b * (level - prev) + (1 - HOLT.b) * HOLT.phi * trend;
    });
    return Math.max(0, Math.min(1, level + HOLT.phi * trend));
  }
  const measured = ev => ev.filter(o => o.src !== 'proj' && o.p != null && ATTEMPT_W[o.attempt] > 0);
  /* p̄: your overall level on a date, from every topic's evidence (or its Sporty's score when it has none) */
  let _pool = null;
  function poolMean(today, before, skip) {
    const key = [
      today,
      before,
      skip ? [...skip].join() : '',
      state.events.length,
      (state.events.at(-1) || {}).id,
      (state.exams || []).length,
      state.scores.join(),
    ].join('|');
    if (_pool && _pool.k === key) return _pool.v;
    let num = 0,
      den = 0;
    TOPICS.forEach((_, i) => {
      let ev = measured(evidenceOf(i, today, before));
      if (skip && skip.size) ev = ev.filter(o => !(o.src === 'exam' && skip.has(o.exam)));
      const w = weigh(ev, today);
      if (w.den) {
        num += w.num;
        den += w.den;
      } else {
        const b = today !== todayISO() ? scoreAt(i, today) : state.scores[i];
        if (b != null) {
          num += UNKNOWN_N * (b / 100);
          den += UNKNOWN_N;
        }
      }
    });
    /* itself pulled toward 50% by 30 questions, so one topic's few results never become "your level" */
    const v = (num + POOL_K * PRIOR_P) / (den + POOL_K);
    _pool = { k: key, v };
    return v;
  }
  /* the models of the current data are kept until the data changes (a session added or removed, a score, a list, the
     exam date, the review threshold) or the screen is drawn again — the planner asks for the same topic many times */
  const _models = new Map();
  let _sig = '';
  const clearModels = () => {
    _models.clear();
    _sig = '';
  };
  function srModel(i, asOf, before, skip) {
    const sig = [
      state.events.length,
      (state.events.at(-1) || {}).id,
      (state.exams || []).length,
      state.deadline,
      state.scores.join(),
      state.statuses.join(),
      pref('reviewAt'),
      todayISO(),
    ].join('|');
    if (sig !== _sig) {
      _models.clear();
      _sig = sig;
    }
    const key = i + '|' + (asOf || '') + '|' + (before ? 1 : 0) + '|' + (skip && skip.size ? [...skip].join() : '');
    let m = _models.get(key);
    if (!m) {
      m = srModelCalc(i, asOf, before, skip);
      _models.set(key, m);
    }
    return m;
  }
  /* skip: exam ids whose topic results must be left out (the blended forecast already counts their overall score) */
  function srModelCalc(i, asOf, before, skip) {
    const today = asOf || todayISO();
    let ev = evidenceOf(i, today, before);
    if (skip && skip.size) ev = ev.filter(o => !(o.src === 'exam' && skip.has(o.exam)));
    /* --- mastery and confidence (projections and "after the answer" excluded) --- */
    const meas = measured(ev),
      W = weigh(meas, today);
    let { num, den, unknownN, known } = W;
    /* no scored session yet: the topic's Sporty's score (or the one known on that date), of unknown size */
    let base = null;
    if (!meas.length) {
      base = asOf && asOf !== todayISO() ? scoreAt(i, today) : state.scores[i];
      if (base != null) {
        num += UNKNOWN_N * (base / 100);
        den += UNKNOWN_N;
        unknownN = true;
      }
    }
    const pbar = poolMean(today, before, skip),
      prior = !den,
      mastery = meas.length ? holtMastery(meas, pbar) : (num + PRIOR_K * pbar) / (den + PRIOR_K);
    /* --- reviews (one per day: the day's first attempt that is a retrieval) --- */
    const days = {};
    ev.forEach(o => {
      if (o.attempt === 'after') return;
      if (o.total > 0 && o.total < Math.min(REP_MIN_N, TOPICS[i].q)) return;
      if (!days[o.date]) days[o.date] = o;
    });
    /* sessions logged without a score still count as reviews (score: the one known then) */
    const reps = [];
    let S = 0,
      prev = null,
      diag = null;
    Object.keys(days)
      .sort()
      .forEach(d => {
        const o = days[d],
          p = o.p ?? (asOf ? scoreAt(i, d) : state.scores[i]) ?? 70,
          lam = (ATTEMPT_W[o.attempt] ?? 1) * Math.min(1, nOf(o) / UNKNOWN_N);
        let Rb = null;
        if (prev == null) {
          S = p >= 85 ? 2 : p >= 70 ? 1.5 : 1;
          diag = p < 60 ? 'understanding' : null;
        } else {
          Rb = recall(diffDays(prev, d), S);
          const target = p >= 70 ? S * (1 + 1.2 * (p / 100) * (1.5 - Rb)) : p >= 60 ? S : Math.max(1, 0.4 * S);
          S = Math.max(1, S + lam * (target - S));
          diag = p < 70 ? (Rb >= 0.85 ? 'understanding' : 'forgetting') : null;
        }
        reps.push({ date: d, p, Rb, S, n: o.total ?? null, src: o.src, attempt: o.attempt });
        prev = d;
      });
    const last = meas[meas.length - 1] || null;
    const m = {
      i,
      reps,
      tracked: isTracked(i),
      R: null,
      S: null,
      over: null,
      /* observed: the last result (score, and right/total when known) */
      p: last ? last.p : base,
      obs: last ? { p: last.p, right: last.right, total: last.total, date: last.date, src: last.src } : null,
      mastery,
      prior /* nothing known about the topic: mastery = your overall level, an assumption */,
      nEff: den,
      conf: den / (den + 20),
      confLevel: den < 10 ? 'low' : den < 30 || !known ? 'medium' : 'high',
      unknownN,
      diag,
    };
    if (reps.length) {
      const l = reps[reps.length - 1],
        tn = diffDays(l.date, today),
        left = state.deadline ? diffDays(l.date, state.deadline) : -1,
        iv0 = Math.max(1, Math.round(9 * l.S * (1 / pref('reviewAt') - 1))),
        iv = left > 0 ? Math.min(iv0, Math.max(1, Math.round(GAP_SHARE * left))) : iv0;
      Object.assign(m, { R: recall(tn, l.S), S: l.S, last: l.date, next: addDays(l.date, iv), over: tn - iv });
    }
    /* misses imported from an "errors only" test after the last review: due now */
    const miss = (state.exams || [])
      .filter(x => x.mode === 'errors' && (before ? x.date < today : x.date <= today) && (!m.last || x.date >= m.last))
      .map(x => ({ date: x.date, n: (x.misses || []).filter(q => q.i === i).length, exam: x.examId }))
      .filter(x => x.n > 0);
    if (miss.length) {
      m.examMisses = miss[miss.length - 1];
      if (reps.length) m.over = Math.max(m.over, 0);
    }
    const share = typeof examShare === 'function' ? examShare(i).share : TOPICS[i].q / TOTAL;
    m.pr = 60 * share * (1 - chanceAt(m, today)) * (m.over != null && m.over >= 0 ? 1.2 : 1);
    return m;
  }
  /* chance of answering a question of the topic right on a date: mastery × recall + 1/3 × (1 − recall)
     (unknown mastery → 50%) */
  function chanceAt(m, date) {
    /* (a topic with no evidence uses your overall level p̄, see mastery; recall with your fitted time scale) */
    const asOf = date < todayISO() ? date : todayISO(),
      R = m.reps.length ? recall(diffDays(m.last, date) / retentionScale(asOf), m.S) : 1;
    return pRight(m.mastery * 100, R);
  }
  /* c: how much slower than the default curve you forget, fitted to your sessions (see RETENTION FOR THE FORECAST).
     Each pair = a scored session and the topic's model the day before it; the guess is mastery × R(gap / c) + 1/3 ×
     (1 − R). Cached per day and data. */
  const SCALES = [1, 1.5, 2, 3, 5, 8, 13, 21];
  let _fitting = false;
  /* upTo: only sessions BEFORE this date are used, so a forecast for a past date never sees what came after it */
  const _scales = new Map();
  let _scaleKey = '';
  function retentionScale(upTo) {
    if (_fitting) return 1;
    upTo = upTo || todayISO();
    /* keyed on your real sessions only: the projected sessions of a weekly plan never refit it */
    const real = state.events.filter(e => !e.proj),
      key = [todayISO(), real.length, (real.at(-1) || {}).id, (state.exams || []).length].join('|');
    if (key !== _scaleKey) {
      _scales.clear();
      _scaleKey = key;
    }
    if (_scales.has(upTo)) return _scales.get(upTo);
    _fitting = true;
    let v = 1;
    try {
      /* the first scored session of each topic per day, the most recent 200 of them (enough, and fast on a long
         history); each paired with the topic's model the day before */
      const cand = [];
      TOPICS.forEach((_, i) => {
        const seen = new Set();
        sessionsOf(i)
          .filter(e => !e.partial && !e.proj && e.score != null && e.date < upTo)
          .sort((a, b) => a.date.localeCompare(b.date))
          .forEach(e => {
            if (seen.has(e.date)) return;
            seen.add(e.date);
            cand.push({ i, e });
          });
      });
      const pairs = [];
      cand
        .sort((a, b) => a.e.date.localeCompare(b.e.date))
        .slice(-200)
        .forEach(({ i, e }) => {
          const m = srModel(i, e.date, true);
          if (m.reps.length) pairs.push({ m: m.mastery, S: m.S, gap: diffDays(m.last, e.date), obs: e.score / 100 });
        });
      if (pairs.length >= 20) {
        let best = Infinity;
        SCALES.forEach(c => {
          const sse = pairs.reduce((a, q) => {
            const R = recall(q.gap / c, q.S);
            return a + (q.m * R + (1 - R) / 3 - q.obs) ** 2;
          }, 0);
          if (sse < best - 1e-12) {
            best = sse;
            v = c;
          }
        });
      }
    } finally {
      _fitting = false;
    }
    _scales.set(upTo, v);
    return v;
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
      if (e.topic === i && e.score != null && !e.proj && e.date <= d && e.date >= bd) {
        best = e.score;
        bd = e.date;
      }
    });
    return best != null ? best : TOPICS[i].score;
  }
  return {
    recall,
    addDays,
    isTracked,
    srModel,
    srAll,
    scoreAt,
    evidenceOf,
    chanceAt,
    retentionScale,
    clearModels,
    UNKNOWN_N,
    REP_MIN_N,
  };
})();
const {
  recall,
  addDays,
  isTracked,
  srModel,
  srAll,
  scoreAt,
  evidenceOf,
  chanceAt,
  retentionScale,
  clearModels,
  UNKNOWN_N,
  REP_MIN_N,
} = SpacedRepetition;
