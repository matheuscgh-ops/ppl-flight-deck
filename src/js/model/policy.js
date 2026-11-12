/* ===== module Policy (js/model/policy.js) =====
   public: ENERGY, energyOf, doneOn, topicCands, testCand, selectCands, orderCands, hardnessOf, minChunk, COVER_DAYS
   The ONE place that decides what is worth studying. The daily suggestion (buildPlan), the plan with times (packDay),
   the weekly plan (suggestDays) and Refresh plan all take their candidates and values from here; only how the chosen
   work is laid out differs (one list vs time blocks).

   ================= WHAT A TOPIC IS WORTH TODAY =================
     risk_i  = 60 × share_i × (1 − p_exam_i)
               questions of the FAA test LIKELY MISSED from topic i if you do not study it again: share_i = its official
               share of the test (Config.examShare), p_exam_i = chance of a right answer on exam day (mastery × recall,
               recall still falling until then). It is NOT an expected score gain: the app does not model how much a
               session teaches — only where misses are likely. Mastery already carries every low score and recent miss,
               so nothing else adds a "weak" or "difficult" penalty on top.
     value of a chunk of n questions = risk_i × min(1, n / n_ref) × timing
       n_ref = the session the topic needs now (a review sample sized by mastery, a 10-question diagnostic, or one
       40-question session): doing it addresses the topic's risk for now; a smaller chunk counts in proportion
       timing (each from a different fact, never the same evidence twice):
         × 1.2   review due by spaced repetition (or misses imported in an "errors only" test)
         × 1.25  left undone in a plan during the last 7 days (or moved by Refresh plan)
         × 0.8   new material in the final stretch (8–21 days); none at all in the last week
     coverage: each day the 2 topics untouched longest (14 days or more, or never; the highest risk first among
       equals) are raised to at least the day's median value per minute, so small, rarely tested or hard topics keep
       coming back instead of waiting forever — 2 a day, so they rotate in without crowding out the reviews due.
     area floor (a week): fair share of area a = its official share × (1 − its average p); an area whose minutes so far
       are under half its fair share of the week's minutes gets its best topic raised to the median value per minute;
       the two areas furthest below their share have that topic placed first that day.
     The choice is by value per minute (a fractional knapsack: values are linear in n, so taking the densest first and
     cutting the last one to fit is the best use of the time), never past the time you gave.

   ================= ENERGY (same rules in the daily list and the calendar) =================
     low     no practice test (unless one is overdue by 2+ days or you added it); chunks of at most 20 questions;
             easiest first; hard topics stay in, as guided examples or a concept review instead of a timed set
     medium  chunks of at most 40 questions (one question-bank session); most valuable first
     high    chunks of at most 40 questions; hardest first, while you are fresh
     Energy never changes the time you gave, the minutes per question or the value of a topic.

   ================= ACTIVITY (how to study the chunk) =================
     newQ        new questions                     new material, or practice with enough evidence
     concept     review the concept, then new q    mastery under 60% or a miss while recall was high (understanding)
     guided      guided examples                   the same as concept, on low energy
     retrieval   recall without notes              a review due, or a miss after a long gap (forgetting)
     fluency     fluency drill (timed)             mastery at or above your goal, but slower than your usual pace
     diagnostic  a short diagnostic (10 q)         a score with no sample (or under 10 questions) behind it      */
const Policy = (() => {
  const SESSION = 40,
    COVER_DAYS = 14,
    COVER_PER_DAY = 2,
    T_DUE = 1.2,
    T_PENDING = 1.25,
    T_NEW_STRETCH = 0.8,
    TEST_VALUE = 60;
  const ENERGY = {
    low: { test: false, chunk: 20, order: 'easy' },
    medium: { test: true, chunk: 40, order: 'value' },
    high: { test: true, chunk: 40, order: 'hard' },
  };
  const energyOf = mode => ENERGY[mode] || ENERGY.medium;
  /* topics already done on a date: a session logged that day, or a topic block of a plan ticked that day */
  function doneOn(date) {
    const s = new Set(
      state.events
        .filter(e => e.date === date && (e.kind === 'study' || e.kind === 'review') && !e.proj)
        .map(e => e.topic)
    );
    (state.plans || []).forEach(p =>
      (p.items || []).forEach(it => {
        if (it.date === date && it.kind === 'topic' && it.check) s.add(it.i);
      })
    );
    return s;
  }
  /* the last day you touched a topic: a review, a scored result, a ticked plan block or the Kanban "done today" */
  function lastTouch(i, date, m) {
    let d = m.last || (m.obs && m.obs.date) || '';
    (state.plans || []).forEach(p =>
      (p.items || []).forEach(it => {
        if (it.kind === 'topic' && it.i === i && it.check && it.date < date && it.date > d) d = it.date;
      })
    );
    const ck = (state.cardChecks || {})[i];
    if (ck && ck < date && ck > d) d = ck;
    return d || null;
  }
  /* the most frequent tags of the misses imported in the last 30 days (e.g. "TAF"), at most 2 */
  function missTags(i, date) {
    const from = addDays(date, -30),
      c = {};
    (state.exams || []).forEach(x => {
      if (x.date < from || x.date > date) return;
      (x.misses || []).forEach(q => {
        if (q.i === i) (q.tags || []).forEach(tg => (c[tg] = (c[tg] || 0) + 1));
      });
    });
    return Object.entries(c)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(x => x[0]);
  }
  const hardnessOf = c => (c.kind === 'test' ? 99 : (1 - (c.p ?? 0.5)) * (c.diff || 1));
  /* the smallest chunk worth doing: minQ questions or 10 minutes (the whole topic when it is smaller); a practice test
     is done whole — only one you added yourself may be cut to what fits (never under 5 questions) */
  const minChunk = (c, minQ) =>
    c.kind === 'test' ? (c.manual ? Math.min(c.n, 5) : c.n) : Math.min(c.full, Math.max(minQ, Math.ceil(10 / c.per)));
  function activityOf(m, reason, E, i, status) {
    const mast = m.mastery;
    if (reason === 'new' && !m.obs && !m.reps.length) return E.order === 'easy' ? 'concept' : 'newQ';
    if (m.confLevel === 'low' && (m.obs || m.p != null) && reason !== 'new') return 'diagnostic';
    if ((!m.prior && mast < 0.6) || m.diag === 'understanding') return E.order === 'easy' ? 'guided' : 'concept';
    if (reason === 'due' || m.diag === 'forgetting') return 'retrieval';
    if (!m.prior && mast * 100 >= GOAL && paceFactor(i) > 1.2) return 'fluency';
    return 'newQ';
  }
  /* every topic worth a place on date, with its chunk size, minutes and value.
     opts: mode (energy), carry (topics moved by Refresh), done (topics already done that day), minutesFor (i, m, p) →
     { answer, review } minutes per question, withReview (minutes per question include the review of misses) */
  function topicCands(date, opts) {
    const E = energyOf(opts.mode),
      phase = examPhase(date),
      final = ['week', 'lastday'].includes(phase),
      lastDay = phase === 'lastday',
      weakBelow = phase === 'normal' || phase === 'after' ? 70 : GOAL,
      xDay = state.deadline > date ? state.deadline : date,
      missed = typeof missedTopics === 'function' ? missedTopics(date) : new Set(),
      carry = opts.carry || new Set(),
      out = [];
    TOPICS.forEach((x, i) => {
      const m = srModel(i, date, true),
        status = state.statuses[i],
        isNew = ['Todo', 'Doing'].includes(status),
        due = m.reps.length && m.over != null && m.over >= 0,
        weak = !m.prior && !isNew && m.mastery * 100 < weakBelow,
        seenNew = (opts.seen && opts.seen[i]) || 0,
        last = lastTouch(i, date, m),
        /* studied today counts as touched today */
        idle = opts.done && opts.done.has(i) ? 0 : last ? diffDays(last, date) : Infinity;
      let reason = carry.has(i)
        ? 'carried'
        : due
          ? 'due'
          : weak
            ? 'weak'
            : m.tracked && !m.reps.length && !m.obs
              ? 'nodata'
              : isNew && seenNew < x.q && !(m.last && diffDays(m.last, date) < 2)
                ? 'new'
                : idle >= COVER_DAYS
                  ? 'coverage'
                  : /* an area of the test left behind this week brings back its topics not studied in the last 2 days */
                    opts.areaShort && opts.areaShort.includes(examShare(i).area) && idle >= 2
                    ? 'coverage'
                    : null;
      if (!reason) return;
      if (final && reason === 'new' && !m.obs && !m.reps.length) return;
      if (lastDay && reason === 'nodata') return;
      const pNow = chanceAt(m, date),
        pExam = chanceAt(m, xDay),
        sh = examShare(i),
        risk = 60 * sh.share * (1 - pExam),
        activity = activityOf(m, reason, E, i, status);
      /* nRef = the session this topic needs (a review sample, a diagnostic, or one 40-question session); energy and the
         last day may make the chunk smaller */
      const nRef = Math.max(
          1,
          Math.min(
            x.q,
            reason === 'due' || reason === 'carried'
              ? reviewSize(i, m)
              : activity === 'diagnostic'
                ? 10
                : reason === 'new'
                  ? Math.min(SESSION, x.q - seenNew)
                  : SESSION
          )
        ),
        n = Math.max(1, Math.min(nRef, E.chunk, lastDay ? 20 : SESSION));
      const timing =
        (due || m.examMisses ? T_DUE : 1) *
        (missed.has(i) || reason === 'carried' ? T_PENDING : 1) *
        (reason === 'new' && phase === 'stretch' ? T_NEW_STRETCH : 1);
      const t = opts.minutesFor(i, m, pNow),
        per = opts.withReview ? t.answer + t.review : t.answer;
      /* why: the main reasons, each backed by data that exists */
      const why = [];
      if (m.obs)
        why.push(
          m.obs.total > 0
            ? { k: 'last', right: m.obs.right, total: m.obs.total, src: m.obs.src }
            : { k: 'lastPct', p: m.obs.p, src: m.obs.src }
        );
      else if (m.p != null) why.push({ k: 'sportys', p: m.p });
      if (m.examMisses) why.push({ k: 'examMisses', n: m.examMisses.n, tags: missTags(i, date) });
      else {
        const tg = missTags(i, date);
        if (tg.length) why.push({ k: 'missTags', tags: tg });
      }
      if (due && !m.examMisses) why.push({ k: 'due', d: m.over });
      if (!m.prior && (weak || m.mastery < 0.6)) why.push({ k: 'mastery', p: Math.round(m.mastery * 100) });
      if (m.diag) why.push({ k: m.diag });
      if (missed.has(i) || reason === 'carried') why.push({ k: 'pending' });
      if (reason === 'coverage' || (idle >= COVER_DAYS && idle !== Infinity)) why.push({ k: 'idle', d: idle });
      if (reason === 'new' && !m.obs) why.push({ k: 'newMat' });
      why.push({ k: 'share', s: sh.share, est: sh.estimated, area: sh.area });
      out.push({
        kind: 'topic',
        i,
        n,
        full: x.q,
        reason,
        /* left undone on an earlier day and moved by Refresh plan: placed before anything else */
        forced: reason === 'carried',
        activity,
        done: !!(opts.done && opts.done.has(i)),
        per,
        review: t.review,
        answer: t.answer,
        diff: diffOf(i),
        p: pNow,
        pExam,
        risk,
        timing,
        idle,
        nRef,
        value: risk * Math.min(1, n / nRef) * timing,
        why,
        conf: m.confLevel,
        unknownN: m.unknownN,
        date,
      });
    });
    /* coverage: the 2 topics idle longest (14+ days, or never studied — the highest risk first) are worth at least
       the median value per minute of the day; 2 a day, so they rotate in without crowding out the reviews due.
       (measured on the full minutes, answering + review, so the daily list and the calendar lift the same topics) */
    const full = c => c.n * (c.answer + c.review),
      dens = out.map(c => c.value / full(c)).sort((a, b) => a - b),
      med = dens.length ? dens[Math.floor(dens.length / 2)] : 0;
    out
      .filter(c => c.idle >= COVER_DAYS && c.value / full(c) < med)
      .sort((a, b) => b.idle - a.idle || b.risk - a.risk || a.i - b.i)
      .slice(0, COVER_PER_DAY)
      .forEach(c => {
        c.value = med * full(c);
        c.covered = true;
      });
    /* area floor (weekly plans): an ACS area that got less than half its fair share of the week's time so far has its
       most valuable topic lifted to the median too, so no area of the test is left out for a whole week */
    let forcedAreas = 0;
    (opts.areaShort || []).forEach(a => {
      const c = out
        .filter(x => examShare(x.i).area === a && !x.done)
        .sort((x, y) => y.value / full(y) - x.value / full(x))[0];
      if (!c) return;
      if (c.value / full(c) < med) c.value = med * full(c);
      c.floor = true;
      /* the two areas furthest below their share (that have a topic to study) are placed first that day */
      if (forcedAreas < 2) {
        c.forced = true;
        forcedAreas++;
      }
    });
    return out;
  }
  /* the practice test of the day, when one is due (or added by hand), as a candidate; null otherwise */
  function testCand(date, mode, st, withReview) {
    const E = energyOf(mode),
      lastDay = examPhase(date) === 'lastday',
      testsToday = (state.tests || []).filter(x => x.date === date).length,
      tw = testWhy(date, st),
      man = date === todayISO() && typeof manualTest === 'function' && manualTest(date);
    if (!(testsToday || (tw.due && !lastDay) || man)) return null;
    if (!(E.test || testsToday || tw.overdue >= 2 || man)) return null;
    const mu = blended(date).mu,
      answer = (60 / st.qph) * 1.1,
      review = (1 - mu) * st.reviewMin;
    return {
      kind: 'test',
      forced: man || (!E.test && tw.overdue >= 2),
      manual: !!man,
      n: TEST_Q,
      full: TEST_Q,
      reason: tw.due ? tw.reason : man ? 'testManual' : 'test',
      activity: 'test',
      done: !!testsToday,
      per: withReview ? answer + review : answer,
      review,
      answer,
      diff: 1.1,
      p: mu,
      value: TEST_VALUE,
      why: [],
      date,
    };
  }
  /* choose within cap minutes: densest value per minute first, each chunk cut to what still fits (never under its
     smallest chunk); minQ = smallest chunk in questions. Returns copies with n set. */
  function selectCands(cands, cap, minQ) {
    const pick = [];
    let left = cap;
    cands
      .slice()
      .sort((a, b) => (b.forced ? 1 : 0) - (a.forced ? 1 : 0) || b.value / (b.n * b.per) - a.value / (a.n * a.per))
      .forEach(c => {
        const fit = Math.floor((left + 1e-9) / c.per),
          n = Math.min(c.n, fit);
        if (!n || n < minChunk(c, minQ)) return;
        const used = Math.ceil(n * c.per - 1e-9);
        if (used > left) return;
        pick.push({ ...c, n, value: (c.value * n) / c.n });
        left -= used;
      });
    return pick;
  }
  /* the order inside a day or a block, by energy: low → easiest first (a warm-up), medium → most valuable per minute
     first, high → hardest first; a practice test always opens the session (it is the most tiring) */
  function orderCands(list, mode) {
    const o = energyOf(mode).order,
      key = c =>
        o === 'easy'
          ? -hardnessOf(c)
          : o === 'hard'
            ? hardnessOf(c)
            : c.value / Math.max(0.1, (c.n || 1) * (c.per || 1));
    return list.slice().sort((a, b) => (b.kind === 'test') - (a.kind === 'test') || key(b) - key(a));
  }
  return { ENERGY, energyOf, doneOn, topicCands, testCand, selectCands, orderCands, hardnessOf, minChunk, COVER_DAYS };
})();
const { ENERGY, energyOf, doneOn, topicCands, testCand, selectCands, orderCands, hardnessOf, minChunk, COVER_DAYS } =
  Policy;
