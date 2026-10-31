/* ===== module PlanModel (js/model/plan.js) =====
   public: settings, easeOf, minutesPerQ, buildPlan, planDay, setEnergy, fmtMin, planRowName
   shared state (getter/setter): energyMode */
const PlanModel = (() => {
  /* ================= DAILY PLAN (mechanical, time-based) =================
   Budget = your minutes per night.
   Minutes for one question of topic i:
       answer  = (60 / questions-per-hour) × difficulty_i × ease_i
       review  = (1 − p_i) × review-minutes-per-wrong-answer × difficulty_i      (you study every miss)
       minutes = answer + review
   p_i          = chance you get it right now = last score × recall (as in the exam forecast; unknown → 50%)
   difficulty_i = 2.0 calculation topics (E6B, cross-country, performance charts), 1.6 navigation / weather charts,
                  1.3 chart-reading topics, 1.0 everything else
   ease_i       = from spaced-repetition stability S: 1.15 (no data) … 0.75 (S ≥ 30 days) — well-known topics go faster
   Order: 1) practice test when due  2) reviews due today  3) topics never scored, weak topics (< 70%)
          4) new material (skipped in the last 7 days). Each item is cut to what still fits in the remaining minutes.
   Topics left undone in a saved plan during the last 7 days get a 25% priority boost (see Schedule). */
  const DEF_SET = { minutes: 180, qph: 40, testEvery: 3, reviewMin: 1.5 };
  const settings = () => {
    const o = state.settings || {},
      r = { ...DEF_SET, ...o };
    if (o.testEvery == null && o.tests != null) r.testEvery = +o.tests > 0 ? Math.round(7 / +o.tests) : 0;
    delete r.tests;
    return r;
  };
  const DIFF = {
    7: 2,
    12: 2,
    16: 2,
    6: 1.6,
    18: 1.6,
    14: 1.3,
    0: 1.3,
    8: 1.3,
  }; /* Pilotage, Cross-Country, Performance · Navigation, Weather · Airspace, Comms/Lights, Night */
  const diffOf = i => DIFF[i] || 1;
  const easeOf = m => (!m || !m.reps.length ? 1.15 : Math.max(0.75, Math.min(1.15, 1.15 - 0.12 * Math.log2(1 + m.S))));
  function minutesPerQ(i, st, m, p) {
    return (60 / st.qph) * diffOf(i) * easeOf(m) + (1 - p) * st.reviewMin * diffOf(i);
  }
  function topicPNow(i, m) {
    const sc = m && m.reps.length ? m.reps[m.reps.length - 1].p : state.scores[i];
    return pRight(sc, m && m.reps.length ? m.R : 1);
  }
  /* ENERGY MODES (v1)
   low   : skips the practice test, picks the easiest/fastest items first (high chance of being right, known topics),
           and assumes you go 15% slower.
   medium: the standard order (test → reviews due → no data → weak → new).
   high  : practice test first, then the hardest work (most expected misses × difficulty), assumes you go 10% faster
           and stretches the evening 10%.
   Workload (1–10) = average of (chance of missing × difficulty) over the planned questions, scaled.            */
  const ENERGY = {
    low: { speed: 1.15, stretch: 1, test: false, order: 'easy' },
    medium: { speed: 1, stretch: 1, test: true, order: 'standard' },
    high: { speed: 0.9, stretch: 1.1, test: true, order: 'hard' },
  };
  function buildPlan(asOf, over, mode) {
    asOf = asOf || todayISO();
    const st0 = over || settings(),
      E = ENERGY[mode || 'medium'],
      st = { ...st0, minutes: st0.minutes * E.stretch },
      daysLeft = Math.max(1, diffDays(asOf, state.deadline)),
      final = daysLeft <= 7;
    const cap = Math.max(10, Math.round((st.minutes * st.qph) / 60)); /* questions/night with no review (reference) */
    const doneT = new Set(
      state.events.filter(e => e.date === asOf && (e.kind === 'study' || e.kind === 'review')).map(e => e.topic)
    );
    const testsToday = (state.tests || []).filter(x => x.date === asOf).length,
      items = [],
      used = new Set(),
      planned = new Set();
    let left = st.minutes;
    const models = {};
    const M = i => (models[i] ??= srModel(i, asOf, true));
    const push = it => {
      const per = it.per,
        want = it.n;
      if (!it.done) {
        if (left < per * Math.min(5, want) - 1e-9) return false;
        it.n = Math.max(1, Math.min(want, Math.floor((left + 1e-9) / per)));
      }
      it.min = Math.round(it.n * per);
      left -= it.n * per;
      if (it.kind === 'topic' && it.pExam != null) it.stake = ((EXAM_Q * it.n) / TOTAL) * (1 - it.pExam);
      items.push(it);
      if (it.kind === 'topic') planned.add(it.i);
      return true;
    };
    const xDay = state.deadline > asOf ? state.deadline : asOf;
    /* pExam = chance of getting a question of the topic right ON EXAM DAY if you do not study it again (memory keeps decaying) */
    const topicItem = (i, n, reason) => {
      const m = M(i),
        p = topicPNow(i, m),
        pExam = m.reps.length
          ? pRight(
              m.reps[m.reps.length - 1].p,
              recall(diffDays(m.reps[m.reps.length - 1].date, xDay), m.reps[m.reps.length - 1].S)
            )
          : p;
      return {
        kind: 'topic',
        i,
        n,
        reason,
        done: doneT.has(i),
        per: minutesPerQ(i, st, m, p) * E.speed,
        diff: diffOf(i),
        p,
        pExam,
      };
    };
    const cands = [];
    const add = it => cands.push(it);
    const tw = testWhy(asOf, st0),
      man = asOf === todayISO() && manualTest(asOf);
    if (testsToday || tw.due || man) {
      const mu = blended(asOf).mu;
      if (E.test || testsToday || tw.overdue >= 2 || man)
        add({
          kind: 'test',
          forced: man || (!E.test && tw.overdue >= 2),
          n: TEST_Q,
          reason: tw.due ? tw.reason : man ? 'testManual' : 'test',
          done: !!testsToday,
          per: ((60 / st.qph) * 1.1 + (1 - mu) * st.reviewMin) * E.speed,
          diff: 1.1,
          p: mu,
        });
    }
    const ms = srAll(asOf, true);
    ms.filter(m => m.reps.length && m.over >= 0).forEach(m => {
      const q = TOPICS[m.i].q;
      used.add(m.i);
      add(topicItem(m.i, Math.min(q, Math.max(10, Math.min(40, Math.round(q * (1 - m.R))))), 'due'));
    });
    ms.filter(m => !m.reps.length && !used.has(m.i)).forEach(m => {
      used.add(m.i);
      add(topicItem(m.i, Math.min(TOPICS[m.i].q, 40), 'nodata'));
    });
    TOPICS.map((x, i) => i)
      .filter(
        i => !used.has(i) && ['Not Comfortable', 'To review'].includes(state.statuses[i]) && (state.scores[i] ?? 0) < 70
      )
      .sort((a, b) => TOPICS[b].q - TOPICS[a].q)
      .forEach(i => {
        used.add(i);
        add(topicItem(i, Math.min(TOPICS[i].q, 40), 'weak'));
      });
    const newOnes = [];
    if (!final)
      TOPICS.map((x, i) => i)
        .filter(i => !used.has(i) && ['Todo', 'Doing'].includes(state.statuses[i]))
        .sort((a, b) => (state.statuses[b] === 'Doing') - (state.statuses[a] === 'Doing') || TOPICS[b].q - TOPICS[a].q)
        .forEach(i => {
          used.add(i);
          newOnes.push(topicItem(i, Math.min(TOPICS[i].q, 40), 'new'));
        });
    /* low energy: easiest first — also topics you already know (Very Comfortable, recently reviewed) as light reviews */
    if (E.order === 'easy')
      TOPICS.map((x, i) => i)
        .filter(i => !used.has(i) && state.statuses[i] === 'Very Comfortable')
        .forEach(i => {
          used.add(i);
          const it = topicItem(i, Math.min(TOPICS[i].q, 20), 'light');
          if (it.p >= 0.6) add(it);
        });
    cands.push(...newOnes);
    const done = cands.filter(x => x.done),
      todo = cands.filter(x => !x.done);
    const tRank = x => (x.kind !== 'test' ? 1 : x.forced ? 0 : 2);
    if (E.order === 'easy') todo.sort((a, b) => tRank(a) - tRank(b) || a.per - b.per || b.p - a.p);
    /* standard: practice test first, then the most exam questions at stake per minute of study:
     (1 − pExam) × urgency ÷ minutes per question — every bank question is equally likely on the exam, so this is the
     expected exam-day questions protected per minute (urgency: overdue review 1.3, weak 1.15, no data 1.1, new 1.0) */
    const URG = { due: 1.3, weak: 1.15, nodata: 1.1, new: 1, light: 0.8 },
      missed = typeof missedTopics === 'function' ? missedTopics(asOf) : new Set(),
      val = x => ((1 - x.pExam) * (URG[x.reason] || 1) * (missed.has(x.i) ? 1.25 : 1)) / x.per;
    if (E.order === 'standard') todo.sort((a, b) => (b.kind === 'test') - (a.kind === 'test') || val(b) - val(a));
    if (E.order === 'hard')
      todo.sort((a, b) => (b.kind === 'test') - (a.kind === 'test') || (1 - b.p) * b.diff - (1 - a.p) * a.diff);
    [...done, ...todo].forEach(push);
    doneT.forEach(i => {
      if (!planned.has(i)) items.push({ kind: 'topic', i, n: 0, min: 0, reason: 'extra', done: true, diff: diffOf(i) });
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
      mode: mode || 'medium',
      workload,
      budget: Math.round(st.minutes),
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
      pace: Math.ceil(remaining / daysLeft),
    };
  }
  /* today's plan choices (energy mode, a test you added) live in the synced state, so phone and desktop agree */
  const planDay = () => {
    const p = state.plan;
    return p && p.date === todayISO() ? p : { date: todayISO(), energy: 'medium', test: false };
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
  return { settings, easeOf, minutesPerQ, buildPlan, planDay, setEnergy, fmtMin, planRowName };
})();
const { settings, easeOf, minutesPerQ, buildPlan, planDay, setEnergy, fmtMin, planRowName } = PlanModel;
