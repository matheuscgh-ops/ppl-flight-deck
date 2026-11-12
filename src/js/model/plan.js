/* ===== module PlanModel (js/model/plan.js) =====
   public: settings, easeOf, minutesPerQ, buildPlan, planDay, setEnergy, fmtMin, planRowName, reviewSize, examPhase,
           STRETCH_DAYS, LASTDAY_MAX, paceFactor, paceTable, notePace, baseMinutesPerQ, minutesSplit, diffOf
   shared state (getter/setter): energyMode */
const PlanModel = (() => {
  /* ================= DAILY PLAN (mechanical, time-based) =================
   Budget = your minutes per night — a hard limit: the list never adds up to more.
   Minutes for one question of topic i (one unit: minutes, one pace factor for all of them):
       answer  = (60 / questions-per-hour) × difficulty_i × ease_i × pace_i
       review  = (1 − p_i) × review-minutes-per-wrong-answer × difficulty_i × pace_i      (you study every miss)
       daily list: minutes = answer + review (one row) · plan with times: answer in the topic block, review in its own
       "error review" block right after — the same two numbers, laid out differently
   p_i          = chance you get it right now (mastery × recall, as in the exam forecast; unknown → 50%)
   difficulty_i = 2.0 calculation topics (E6B, cross-country, performance charts), 1.6 navigation / weather charts,
                  1.3 chart-reading topics, 0.8 plain recall, 1.0 everything else
   ease_i       = from spaced-repetition stability S: 1.15 (no data) … 0.75 (S ≥ 30 days) — well-known topics go faster
   pace_i       = how long YOU take against these estimates (see "Your pace"); it changes durations only, never a score
   What goes in and in which order: Policy (the same rules as the plan with times and the weekly plan). */
  /* ================= EXAM PHASES (days left until the exam date) =================
   normal   > 21 days   the standard plan
   stretch  8–21 days   final stretch: "weak" means below your goal (not below 70%), new material counts 20% less,
                        a practice test at least every 3 days (every 2 in the last 10), error-notes review +5 min
   week     2–7 days    as the stretch, and no new material at all
   lastday  0–1 day     the day before and the exam day: no practice test, no topic never studied, reviews of at most
                        20 questions, at most 90 minutes in all — rest beats cramming
   after    the exam date has passed: the standard plan */
  const STRETCH_DAYS = 21,
    LASTDAY_MAX = 90;
  function examPhase(date) {
    const d = diffDays(date || todayISO(), state.deadline);
    return d < 0 ? 'after' : d <= 1 ? 'lastday' : d <= 7 ? 'week' : d <= STRETCH_DAYS ? 'stretch' : 'normal';
  }
  const DEF_SET = { minutes: 180, qph: 40, testEvery: 3, reviewMin: 1.5 };
  const settings = () => {
    const o = state.settings || {},
      r = { ...DEF_SET, ...o };
    if (o.testEvery == null && o.tests != null) r.testEvery = +o.tests > 0 ? Math.round(7 / +o.tests) : 0;
    delete r.tests;
    return r;
  };
  /* how long a question of the topic takes, from what the FAA questions ask:
       2.0  calculations with charts and the E6B: Pilotage and Dead Reckoning, Cross-Country Flight Planning,
            Performance and Limitations (weight and balance, density altitude, takeoff and landing charts)
       1.6  decoding and instruments: Navigation Systems (VOR, GPS), Weather Information (METAR, TAF, charts)
       1.3  reading a chart or a diagram: National Airspace System (sectional), Communications, Lights and Runways
            (signs, markings, light gun), Night Preparation (lighting, vision)
       0.8  plain recall, quick multiple choice: Human Factors, Pilot Qualifications, Airworthiness Requirements,
            the emergency topics (approach and landing, descent, equipment), Before Takeoff Check, Flight Deck
            Management, Slow Flight, Power-Off Stalls, Spin Awareness
       1.0  everything else
     Your own pace (paceFactor) then corrects these numbers topic by topic as you study. */
  const DIFF = {
    7: 2,
    12: 2,
    16: 2,
    6: 1.6,
    18: 1.6,
    14: 1.3,
    0: 1.3,
    8: 1.3,
    2: 0.8,
    3: 0.8,
    4: 0.8,
    11: 0.8,
    13: 0.8,
    17: 0.8,
    19: 0.8,
    20: 0.8,
    23: 0.8,
    24: 0.8,
    25: 0.8,
  };
  const diffOf = i => DIFF[i] || 1;
  const easeOf = m => (!m || !m.reps.length ? 1.15 : Math.max(0.75, Math.min(1.15, 1.15 - 0.12 * Math.log2(1 + m.S))));
  /* the estimates before your own pace is applied (what a pace observation is compared with) */
  const answerBase = (i, st, m) => (60 / st.qph) * diffOf(i) * easeOf(m);
  const reviewBase = (i, st, p) => (1 - p) * st.reviewMin * diffOf(i);
  function baseMinutesPerQ(i, st, m, p) {
    return answerBase(i, st, m) + reviewBase(i, st, p);
  }
  function minutesPerQ(i, st, m, p) {
    return baseMinutesPerQ(i, st, m, p) * paceFactor(i);
  }
  /* { answer, review } minutes per question of topic i, with your pace */
  function minutesSplit(i, st, m, p) {
    const f = paceFactor(i);
    return { answer: answerBase(i, st, m) * f, review: reviewBase(i, st, p) * f };
  }

  /* ================= YOUR PACE (learned from your check marks and focus mode) =================
     Every time a topic block of today's plan is ticked (or finished in focus mode) the time it took is compared with
     the estimate OF THE SAME WORK: r = minutes it took ÷ minutes estimated. A block of a plan with times holds only the
     answering (its error review is another block), so it is compared with the answering estimate; a row of the
     suggested daily list holds answering and review, so it is compared with both (basis 'answer' or 'all').
     Observations saved before the basis was recorded compared a block of answering with answering + review (different
     units), so they are kept in your data but not used. The time is the focus-mode stopwatch when there is one;
     otherwise from your previous tick today (or the block's planned start for the first one) to this tick. A ratio
     outside 0.25–4 is ignored (a forgotten tick, a break).
       weight of an observation  w = 0.5^(age in days / 30)
       all topics   g = exp( Σ w·ln r / (Σ w + 2) )                 (pulled toward 1 until there are a few)
       one topic    f = exp( (Σ w·ln r + 1.5·ln g) / (Σ w + 1.5) )   (pulled toward your overall pace)
     Minutes per question = estimate × f (between 0.35× and 2.5×). It only changes how much fits in your time, never
     a score, the forecast or a statistic.                                                                    */
  const PACE_HALF = 30,
    PACE_K_ALL = 2,
    PACE_K_TOPIC = 1.5;
  let _pace = null;
  function paceTable() {
    const obs = state.paces || [],
      key = obs.length + '|' + (obs.at(-1) || {}).id + '|' + todayISO();
    if (_pace && _pace.k === key) return _pace.v;
    const today = todayISO(),
      w = o => Math.pow(0.5, Math.max(0, diffDays(o.date, today)) / PACE_HALF),
      lr = o => Math.log(Math.max(0.25, Math.min(4, o.min / o.est)));
    let W = 0,
      S = 0;
    const per = {};
    obs.forEach(o => {
      if (!(o.est > 0 && o.min > 0) || !o.basis) return;
      const ww = w(o),
        l = lr(o);
      W += ww;
      S += ww * l;
      const x = (per[o.topic] ??= { W: 0, S: 0, n: 0 });
      x.W += ww;
      x.S += ww * l;
      x.n++;
    });
    const lg = S / (W + PACE_K_ALL),
      v = { all: Math.exp(lg), n: obs.filter(o => o.basis && o.est > 0 && o.min > 0).length, topic: {} };
    Object.entries(per).forEach(([i, x]) => {
      v.topic[i] = { f: Math.exp((x.S + PACE_K_TOPIC * lg) / (x.W + PACE_K_TOPIC)), n: x.n };
    });
    _pace = { k: key, v };
    return v;
  }
  function paceFactor(i) {
    const P = paceTable(),
      f = P.topic[i] ? P.topic[i].f : P.all;
    return Math.max(0.35, Math.min(2.5, f));
  }
  /* record how long n questions of topic i took (minutes); est = the estimate of the same work without your pace:
     basis 'answer' (a topic block of a plan with times) or 'all' (a row of the suggested list: answering and review) */
  function notePace(i, n, min, src, basis) {
    if (!(n > 0) || !(min > 0) || !TOPICS[i]) return false;
    basis = basis === 'all' ? 'all' : 'answer';
    const m = srModel(i, todayISO(), true),
      st = settings(),
      est = n * (basis === 'all' ? baseMinutesPerQ(i, st, m, topicPNow(i, m)) : answerBase(i, st, m));
    const r = min / est;
    if (r < 0.25 || r > 4) return false;
    state.paces = [
      ...(state.paces || []),
      {
        id: uid(),
        topic: i,
        date: todayISO(),
        n,
        min: Math.round(min * 10) / 10,
        est: Math.round(est * 10) / 10,
        src,
        basis,
      },
    ].slice(-400);
    return true;
  }
  const topicPNow = (i, m) => chanceAt(m || srModel(i, todayISO(), true), todayISO());
  /* how many questions a session takes, the way the question bank is used: a category is studied in sessions of up to
     SESSION questions (Weather, 158 q, is 40 at a time). A review is sized by how well you know the topic: a sample when
     your estimated mastery is good, a full session when it is not, a bit more the more you have forgotten since.
       mastery ≥ goal → 15 · ≥ 75% → 20 · ≥ 70% → 25 · below → 40   × (1 + forgotten share), between 10 and 40 */
  const SESSION = 40;
  function reviewSize(i, m) {
    const q = TOPICS[i].q,
      last = m.mastery != null ? m.mastery * 100 : 0,
      base = last >= GOAL ? 15 : last >= 75 ? 20 : last >= 70 ? 25 : SESSION,
      n = Math.round(base * (1 + Math.max(0, 1 - (m.R ?? 1))));
    return Math.min(q, Math.max(10, Math.min(SESSION, n)));
  }
  function buildPlan(asOf, over, mode, carry) {
    asOf = asOf || todayISO();
    mode = ENERGY[mode] ? mode : 'medium';
    const st = { ...(over || settings()) },
      daysLeft = Math.max(1, diffDays(asOf, state.deadline)),
      phase = examPhase(asOf),
      final = daysLeft <= 7,
      lastDay = phase === 'lastday';
    if (lastDay) st.minutes = Math.min(st.minutes, LASTDAY_MAX);
    const cap = Math.max(10, Math.round((st.minutes * st.qph) / 60)); /* questions/night with no review (reference) */
    /* a session logged that day, or a topic block of a saved plan ticked that day (no need to log it first) */
    const doneT = doneOn(asOf);
    /* the candidates and their values: Policy, the same as the plan with times */
    const minutesFor = (i, m, p) => minutesSplit(i, st, m, p),
      cands = topicCands(asOf, {
        mode,
        carry: carry ? new Set(carry) : null,
        done: doneT,
        minutesFor,
        withReview: true,
      }),
      tc = testCand(asOf, mode, st, true);
    if (tc) cands.unshift(tc);
    /* what you already did today keeps its place (and its minutes); the rest of the time goes by value per minute */
    const done = cands.filter(x => x.done),
      budget = st.minutes;
    let left = budget;
    const items = [];
    done.forEach(c => {
      /* what was done: the questions logged today when the count is known, otherwise a review-sized session (not a
         whole 40-question chunk the app never saw) */
      const logged = state.events
          .filter(e => e.date === asOf && e.topic === c.i && e.total > 0)
          .reduce((a, e) => a + e.total, 0),
        n0 = c.kind === 'test' ? c.n : logged || Math.min(c.n, reviewSize(c.i, srModel(c.i, asOf, true))),
        n = c.kind === 'test' ? c.n : Math.max(1, Math.min(n0, Math.floor((left + 1e-9) / c.per)));
      const min = Math.min(Math.max(0, left), Math.ceil(n * c.per - 1e-9));
      items.push({ ...c, n, min });
      left -= min;
    });
    const pick = orderCands(
      selectCands(
        cands.filter(x => !x.done),
        Math.max(0, left),
        5
      ),
      mode
    );
    pick.forEach(c => items.push({ ...c, min: Math.ceil(c.n * c.per - 1e-9) }));
    items.forEach(it => {
      if (it.kind === 'topic') it.stake = 60 * examShare(it.i).share * Math.min(1, it.n / it.nRef) * (1 - it.pExam);
    });
    const planned = new Set(items.filter(x => x.kind === 'topic').map(x => x.i));
    doneT.forEach(i => {
      if (!planned.has(i))
        items.push({ kind: 'topic', i, n: 0, min: 0, reason: 'extra', done: true, diff: diffOf(i), why: [] });
    });
    const remaining = TOPICS.reduce((a, x, i) => a + (state.statuses[i] === 'Very Comfortable' ? 0 : x.q), 0);
    const sum = (arr, k) => arr.reduce((a, x) => a + (x[k] || 0), 0);
    const qs = items.filter(x => x.n && x.p != null),
      wq = qs.reduce((a, x) => a + x.n, 0),
      inten = wq ? qs.reduce((a, x) => a + x.n * (1 - x.p) * (x.diff || 1), 0) / wq : 0;
    const workload = Math.max(1, Math.min(10, Math.round((inten / 1.1) * 10)));
    return {
      items,
      cap,
      mode,
      workload,
      budget: Math.round(budget),
      total: sum(items, 'n'),
      minutes: sum(items, 'min'),
      done: sum(
        items.filter(x => x.done),
        'n'
      ),
      doneMin: sum(
        items.filter(x => x.done),
        'min'
      ),
      daysLeft,
      final,
      phase,
      pace: Math.ceil(remaining / daysLeft),
    };
  }
  /* today's plan choices (energy mode, a test you added) live in the synced state, so phone and desktop agree */
  const planDay = () => {
    const p = state.plan;
    return p && p.date === todayISO() ? p : { date: todayISO(), energy: pref('energy'), test: false };
  };
  let energyMode = planDay().energy;
  function setEnergy(m) {
    energyMode = m;
    state.plan = { ...planDay(), energy: m };
    save();
    renderPlanMini();
    if (!$('#viewPlan').hidden) renderPlanPage();
    requestAnimationFrame(clipSugg);
  }
  const fmtMin = m =>
    m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m` : `${Math.round(m)} min`;
  function planRowName(it) {
    return it.kind === 'test' ? t('practiceTest') : TOPICS[it.i].name;
  }
  expose({
    energyMode: [
      () => energyMode,
      x => {
        energyMode = x;
      },
    ],
  });
  return {
    settings,
    easeOf,
    minutesPerQ,
    buildPlan,
    planDay,
    setEnergy,
    fmtMin,
    planRowName,
    reviewSize,
    examPhase,
    STRETCH_DAYS,
    LASTDAY_MAX,
    paceFactor,
    paceTable,
    notePace,
    baseMinutesPerQ,
    minutesSplit,
    diffOf,
  };
})();
const {
  settings,
  easeOf,
  minutesPerQ,
  buildPlan,
  planDay,
  setEnergy,
  fmtMin,
  planRowName,
  reviewSize,
  examPhase,
  STRETCH_DAYS,
  LASTDAY_MAX,
  paceFactor,
  paceTable,
  notePace,
  baseMinutesPerQ,
  minutesSplit,
  diffOf,
} = PlanModel;
