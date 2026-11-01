/* ===== module Schedule (js/model/schedule.js) =====
   live value (getter): DAY_START (first hour of the plan grid, from Settings)
   public: SLOT, DAY_END, mondayOf, planDays, planTotal, rangesTotal, normRanges, activeFor, todayPlan,
           itemDone, itemMissed, missedTopics, suggestDays, packDay, perQ, conflictsFor, weeklyUnder, clockOf,
           knapsack, toggleCheck, seedDemoPlan, testMinutes
   Saved study plans (state.plans) and the scheduler that fills selected time blocks with topics.

   A plan: { id, type: 'daily' | 'weekly', name, start (the date, or the Monday of the week), active,
             blocks: { date: [[startMin, endMin], …] }   time you blocked, minutes from midnight, 15-min steps
             energy: { date: 'low' | 'medium' | 'high' }
             items:  [{ id, date, start, min, kind: 'topic' | 'test' | 'custom', i, n, label, reason, custom, check }] }
             kind 'custom' = your own activity ("Review the material", "Simulator" …): a name and minutes, done by hand

   Where today's plan comes from: active daily plan for today → active weekly plan covering today → the suggestion
   built from your statistics (buildPlan).

   Filling the time (suggestDays):
     1. candidates = buildPlan for that day with the day's blocked minutes as the budget (same scoring as the daily
        plan: overdue reviews, topics without data, weak topics, new material; minutes per question from your speed,
        the topic's difficulty and the review time for misses). Topics missed in a plan during the last 7 days get
        a 25% priority boost.
     2. each continuous block is a knapsack: pick the chunks that protect the most exam-day questions
        (n × (1 − p on exam day) × urgency) within the block's minutes (dynamic programming, 1-minute steps); any
        time left is filled with part of the best remaining topic (at least 5 questions).
        Deep work (Cal Newport): few context switches, so a block holds at most one topic per ~45 minutes (Settings); the
        topics kept grow into the freed time (up to the topic's question count).
     3. inside a block the hardest work goes first, while you are fresh: practice test, then
        (1 − p now) × difficulty, plus a boost for overdue reviews and for topics not seen in a long time.
     4. for a week, the days are filled in order and each day assumes the earlier days were done (simulated sessions),
        so a topic reviewed on Monday is not due again on Tuesday. A topic appears at most once per day. */
const Schedule = (() => {
  const SLOT = 15,
    DAY_END = 24 * 60,
    MIN_CHUNK_Q = 5,
    MISSED_BOOST = 1.25,
    URGENCY = { due: 1.3, weak: 1.15, nodata: 1.1, new: 1, light: 0.8, test: 1.4, testDue: 1.4, custom: 1 };

  const plans = () => state.plans || (state.plans = []);
  function mondayOf(date) {
    const d = parse(date);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return iso(d);
  }
  const planDays = p => (p.type === 'daily' ? [p.start] : Array.from({ length: 7 }, (_, k) => addDays(p.start, k)));
  const rangesTotal = rs => (rs || []).reduce((a, [s, e]) => a + (e - s), 0);
  const planTotal = p => Object.values(p.blocks || {}).reduce((a, rs) => a + rangesTotal(rs), 0);
  const clockOf = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  /* merge a set of 15-minute slots (start minutes) into sorted [start, end] ranges */
  function normRanges(slots) {
    const s = [...new Set(slots)].sort((a, b) => a - b),
      out = [];
    s.forEach(m => {
      const last = out[out.length - 1];
      if (last && last[1] === m) last[1] = m + SLOT;
      else out.push([m, m + SLOT]);
    });
    return out;
  }

  /* ---------- which plan drives a date ---------- */
  function activeFor(date) {
    const on = plans().filter(p => p.active),
      newest = (a, b) => (b.updated || 0) - (a.updated || 0);
    const daily = on.filter(p => p.type === 'daily' && p.start === date).sort(newest)[0];
    if (daily) return { plan: daily, kind: 'daily' };
    const weekly = on
      .filter(p => p.type === 'weekly' && date >= p.start && date <= addDays(p.start, 6))
      .sort(newest)[0];
    return weekly ? { plan: weekly, kind: 'weekly' } : null;
  }

  function itemDone(it) {
    if (it.check) return true;
    if (it.kind === 'custom' || it.kind === 'reflect') return false;
    if (it.kind === 'test') return (state.tests || []).some(x => x.date === it.date && x.score != null);
    return state.events.some(
      e => e.date === it.date && e.topic === it.i && (e.kind === 'study' || e.kind === 'review')
    );
  }
  const itemMissed = it => it.date < todayISO() && !itemDone(it);

  /* topics left undone in an active plan during the 7 days before asOf (they get a priority boost) */
  function missedTopics(asOf) {
    const from = addDays(asOf, -7),
      out = new Set();
    plans()
      .filter(p => p.active)
      .forEach(p =>
        (p.items || []).forEach(it => {
          if (it.kind === 'topic' && it.date >= from && it.date < asOf && !itemDone(it)) out.add(it.i);
        })
      );
    return out;
  }

  /* today's list, from the plan that drives today, else the suggestion — same item shape as buildPlan */
  function todayPlan() {
    const today = todayISO(),
      src = activeFor(today);
    if (!src) return { source: 'suggested', items: buildPlan(null, null, energyMode).items };
    const items = (src.plan.items || [])
      .filter(it => it.date === today)
      .sort((a, b) => a.start - b.start)
      .map(it => ({ ...it, done: itemDone(it), reason: it.reason || 'custom' }));
    return { source: src.kind, plan: src.plan, items };
  }

  /* minutes for one question of topic i on a date (same formula as the daily plan) */
  function perQ(i, date, energy) {
    const m = srModel(i, date, true),
      sc = m.reps.length ? m.reps[m.reps.length - 1].p : state.scores[i],
      p = pRight(sc, m.reps.length ? m.R : 1),
      speed = { low: 1.15, medium: 1, high: 0.9 }[energy || 'medium'];
    return { per: minutesPerQ(i, settings(), m, p) * speed, p };
  }

  /* 0/1 knapsack over whole chunks, then fill what is left with part of the best remaining splittable chunk */
  function knapsack(cands, cap) {
    const n = cands.length,
      w = cands.map(c => Math.max(1, Math.ceil(c.n * c.per))),
      best = Array.from({ length: n + 1 }, () => new Float64Array(cap + 1));
    for (let k = 1; k <= n; k++)
      for (let c = 0; c <= cap; c++) {
        best[k][c] = best[k - 1][c];
        if (w[k - 1] <= c) best[k][c] = Math.max(best[k][c], best[k - 1][c - w[k - 1]] + cands[k - 1].value);
      }
    const pick = [];
    let c = cap;
    for (let k = n; k >= 1; k--)
      if (best[k][c] !== best[k - 1][c]) {
        pick.push({ ...cands[k - 1] });
        c -= w[k - 1];
      }
    const rest = cands.filter(x => !pick.some(p => p.key === x.key) && x.kind === 'topic');
    rest.sort((a, b) => b.value / b.n - a.value / a.n);
    for (const r of rest) {
      const fit = Math.floor((c + 1e-9) / r.per),
        least = Math.min(r.full || r.n, Math.max(MIN_CHUNK_Q, Math.ceil(10 / r.per)));
      if (fit >= least) {
        const part = { ...r, n: Math.min(r.n, fit) };
        part.value = (r.value * part.n) / r.n;
        pick.push(part);
        c -= Math.ceil(part.n * part.per);
        break;
      }
    }
    return pick;
  }

  const hardness = c => {
    if (c.kind === 'test') return 99;
    const m = srModel(c.i, c.date, true),
      last = m.reps.length ? m.reps[m.reps.length - 1].date : null,
      idle = last ? Math.min(0.5, diffDays(last, c.date) / 60) : 0.3;
    return (1 - c.p) * (c.diff || 1) + (c.reason === 'due' ? 0.3 : 0) + idle;
  };

  /* ---------- error review (reflection) ----------
     Expected misses of a topic chunk = questions × (1 − p) × difficulty (a test counts 60 × (1 − p)).
     Minutes = expected misses × your review minutes per wrong answer, rounded to 5, at least 10 and at most a quarter
     of the block; none when fewer than 3 misses are expected (topics you mostly get right). */
  const REFLECT_MIN = 10,
    REFLECT_SHARE = 0.25,
    REFLECT_FROM = 3,
    LEFTOVER_TOPIC = 20,
    MIN_ITEM = 10;
  const missesOf = c => c.n * (1 - (c.p ?? 0.5)) * (c.kind === 'test' ? 1 : c.diff || 1);
  function reflectFor(pick, cap) {
    const st = settings(),
      parts = pick.map(c => ({ i: c.kind === 'test' ? -1 : c.i, m: Math.round(missesOf(c)) })).filter(x => x.m > 0),
      E = pick.reduce((a, c) => a + missesOf(c), 0);
    if (!pref('reflect') || !st.reviewMin || E < REFLECT_FROM) return { min: 0, parts: [] };
    const max = Math.max(REFLECT_MIN, Math.floor((cap * REFLECT_SHARE) / 5) * 5),
      min = Math.max(REFLECT_MIN, Math.min(max, Math.round((E * st.reviewMin) / 5) * 5));
    return { min, parts: parts.sort((a, b) => b.m - a.m) };
  }
  /* the block's review is split among its topics in proportion to their expected misses, in 5-minute steps
     (largest remainder), so each topic is followed by the review of its own misses — the way the question bank
     shows the misses of a category right after you finish it. A topic whose share is under 5 minutes gets none. */
  function splitReflect(R, pick) {
    const w = pick.map(c => missesOf(c)),
      W = w.reduce((a, x) => a + x, 0),
      units = Math.round(R.min / 5);
    if (!R.min || !W) return pick.map(() => 0);
    const raw = w.map(x => (x / W) * units),
      got = raw.map(Math.floor);
    let left = units - got.reduce((a, x) => a + x, 0);
    raw
      .map((x, k) => [x - got[k], k])
      .sort((a, b) => b[0] - a[0])
      .forEach(([, k]) => {
        if (left > 0) {
          got[k]++;
          left--;
        }
      });
    return got.map(u => u * 5);
  }
  const usedBy = pick => pick.reduce((a, c) => a + Math.ceil(c.n * c.per), 0);
  /* the smallest chunk worth placing: 10 minutes (or the whole topic when it is shorter), never under 5 questions */
  const minN = c => (c.kind === 'test' ? c.n : Math.min(c.full, Math.max(MIN_CHUNK_Q, Math.ceil(MIN_ITEM / c.per))));

  /* fill one day's blocks; returns items with start times.
     Inside a block: topics (hardest first), each followed by the review of its own misses (the block's review split
     in proportion to each topic's expected misses). Topics are trimmed (easiest first) to make room for the reviews in
     the same block; only when that is impossible (a practice test or a topic that cannot shrink fills the block) does
     the whole review move to the start of the day's next block. */
  function packDay(date, ranges, energy) {
    const total = rangesTotal(ranges);
    if (!total) return [];
    const st = settings(),
      speed = { low: 1.15, medium: 1, high: 0.9 }[energy || 'medium'],
      boost = missedTopics(date),
      P = buildPlan(date, { ...st, minutes: total * 4 }, energy || 'medium');
    /* the review of misses is its own item, so each question here counts only the time to answer it */
    let cands = P.items
      .filter(x => !x.done && x.n > 0 && (x.kind === 'test' || x.kind === 'topic'))
      .map((x, k) => {
        const n = x.kind === 'test' ? TEST_Q : x.n,
          review = (1 - (x.p ?? 0.5)) * st.reviewMin * (x.kind === 'test' ? 1 : x.diff || 1) * speed;
        return {
          key: x.kind + (x.i ?? 't') + '_' + k,
          kind: x.kind,
          i: x.i,
          n,
          full: x.kind === 'test' ? TEST_Q : TOPICS[x.i].q,
          per: Math.max(0.2, x.per - review),
          p: x.p,
          diff: x.diff,
          reason: x.reason,
          date,
          value:
            (x.kind === 'test' ? TEST_Q * 1.5 : n * (1 - (x.pExam ?? x.p ?? 0.5))) *
            (URGENCY[x.reason] || 1) *
            (x.kind === 'topic' && boost.has(x.i) ? MISSED_BOOST : 1),
        };
      })
      .filter(c => c.per > 0);
    const out = [];
    let carry = null;
    ranges.forEach(([s, e], bi) => {
      const cap = e - s,
        capT = cap - (carry ? carry.min : 0);
      let t0 = s;
      if (carry) {
        out.push({
          id: uid(),
          date,
          start: t0,
          min: carry.min,
          kind: 'reflect',
          i: null,
          n: 0,
          reason: 'reflect',
          parts: carry.parts,
        });
        t0 += carry.min;
        carry = null;
      }
      if (!cands.length || capT < MIN_ITEM) return;
      let pick = knapsack(cands, capT);
      /* deep work: few topic switches — at most one topic per ~45 min; the kept topics grow into the freed time */
      const deep = pref('deepMin'),
        maxTopics = deep ? Math.max(1, Math.round(cap / deep)) : Infinity;
      if (pick.length > maxTopics) {
        pick = pick.sort((a, b) => b.value - a.value).slice(0, maxTopics);
        let left = capT - usedBy(pick);
        pick.forEach(c => {
          if (c.kind !== 'topic') return;
          const more = Math.min(c.full - c.n, Math.floor((left + 1e-9) / c.per));
          if (more > 0) {
            c.n += more;
            left -= Math.ceil(more * c.per);
          }
        });
      }
      /* 20+ minutes still free (after the review) → one more topic instead of empty time */
      const leftAfter = () => capT - usedBy(pick) - reflectFor(pick, cap).min;
      if (leftAfter() >= LEFTOVER_TOPIC) {
        const next = cands
          .filter(x => x.kind === 'topic' && !pick.some(p => p.kind === x.kind && p.i === x.i))
          .sort((a, b) => b.value / b.n - a.value / a.n)
          .find(x => Math.floor(leftAfter() / x.per) >= minN(x));
        if (next) {
          const fit = Math.floor((leftAfter() - 5) / next.per),
            n = Math.min(next.n, Math.max(minN(next), fit));
          pick.push({ ...next, n, value: (next.value * n) / next.n });
        }
      }
      /* room for the review in the same block: trim the easiest topics first, never under their smallest chunk */
      pick.sort((a, b) => hardness(b) - hardness(a));
      let R = reflectFor(pick, cap);
      for (let guard = 0; usedBy(pick) + R.min > capT && guard < 400; guard++) {
        const c = pick
          .slice()
          .reverse()
          .find(x => x.kind === 'topic' && x.n > minN(x));
        if (!c) break;
        c.n -= 1;
        R = reflectFor(pick, cap);
      }
      const fits = usedBy(pick) + R.min <= capT,
        hasNext = bi < ranges.length - 1,
        share = fits ? splitReflect(R, pick) : pick.map(() => 0);
      pick.forEach((c, k) => {
        const min = Math.max(1, Math.round(c.n * c.per)),
          id = uid();
        out.push({
          id,
          date,
          start: t0,
          min,
          kind: c.kind,
          i: c.kind === 'topic' ? c.i : null,
          n: c.n,
          reason: c.reason,
        });
        t0 += min;
        if (share[k]) {
          out.push({
            id: uid(),
            date,
            start: t0,
            min: share[k],
            kind: 'reflect',
            i: null,
            n: 0,
            reason: 'reflect',
            of: id,
            parts: [{ i: c.kind === 'test' ? -1 : c.i, m: Math.round(missesOf(c)) }],
          });
          t0 += share[k];
        }
        /* a topic is used once per day: drop the whole candidate even when only part of it was placed */
        cands = cands.filter(x => !(x.kind === c.kind && x.i === c.i));
      });
      if (R.min && !fits) {
        if (hasNext) carry = R;
        else {
          const room = Math.floor((e - t0) / 5) * 5;
          if (room >= REFLECT_MIN)
            out.push({
              id: uid(),
              date,
              start: t0,
              min: room,
              kind: 'reflect',
              i: null,
              n: 0,
              reason: 'reflect',
              parts: R.parts,
            });
        }
      }
    });
    return out;
  }

  /* fill several days in order, simulating the earlier days as done; returns { date: items } */
  function suggestDays(days, blocks, energies) {
    const saved = { events: state.events, tests: state.tests },
      out = {};
    try {
      state.events = state.events.slice();
      state.tests = (state.tests || []).slice();
      days
        .slice()
        .sort()
        .forEach(d => {
          const items = d < todayISO() ? [] : packDay(d, blocks[d] || [], (energies || {})[d]);
          out[d] = items;
          items.forEach(it => {
            if (it.kind === 'reflect') return;
            if (it.kind === 'test')
              state.tests.push({ id: 'sim' + it.id, date: d, q: TEST_Q, score: Math.round(blended(d).mu * 100) });
            else {
              const m = srModel(it.i, d, true),
                last = m.reps.length ? m.reps[m.reps.length - 1].p : 0;
              state.events.push({
                id: 'sim' + it.id,
                date: d,
                topic: it.i,
                kind: m.reps.length ? 'review' : 'study',
                score: Math.min(95, Math.max(70, last)),
                partial: false,
                demo: false,
              });
            }
          });
        });
    } finally {
      state.events = saved.events;
      state.tests = saved.tests;
    }
    return out;
  }

  /* minutes a practice test takes: answering 60 questions (×1.1) plus reviewing the expected misses */
  function testMinutes() {
    const st = settings();
    return Math.round(TEST_Q * (60 / st.qph) * 1.1 + TEST_Q * (1 - blended().mu) * st.reviewMin);
  }
  /* demo only: an example weekly plan for next week (evenings 19:30–21:00 on weekdays — Newport's deep-work block —,
     Saturday morning with room for a practice test, Sunday weekly review), created once. It starts next week so
     today's list still shows the suggestion and the energy choice; the week view's › shows the example. */
  function seedDemoPlan() {
    if (!BUILD.demo || (state.plans || []).length || !state.events.some(e => e.demo)) return;
    try {
      if (localStorage.getItem(STORE + '-seeded')) return;
      localStorage.setItem(STORE + '-seeded', '1');
    } catch (e) {}
    const mon = addDays(mondayOf(todayISO()), 7),
      blocks = {};
    for (let k = 0; k < 7; k++)
      blocks[addDays(mon, k)] =
        k < 5 ? [[19 * 60 + 30, 21 * 60]] : k === 5 ? [[9 * 60, 11 * 60 + 30]] : [[10 * 60, 11 * 60]];
    const days = Object.keys(blocks),
      items = [];
    days.filter(d => d < todayISO()).forEach(d => items.push(...packDay(d, blocks[d], 'medium')));
    Object.values(
      suggestDays(
        days.filter(d => d >= todayISO()),
        blocks,
        {}
      )
    ).forEach(l => items.push(...l));
    const sun = addDays(mon, 6),
      sunItems = items.filter(it => it.date === sun);
    const reviewStart = sunItems.length
      ? Math.min(
          11 * 60 - 30,
          sunItems.reduce((a, it) => Math.max(a, it.start + it.min), 10 * 60)
        )
      : 10 * 60;
    state.plans = [
      {
        id: uid(),
        type: 'weekly',
        name: t('demoPlanName'),
        start: mon,
        active: true,
        blocks,
        energy: {},
        items: items
          .filter(it => !(it.date === sun && it.start + it.min > 11 * 60 - 30))
          .concat([
            {
              id: uid(),
              date: sun,
              start: Math.min(reviewStart, 11 * 60 - 30),
              min: 30,
              kind: 'custom',
              i: null,
              n: 0,
              label: t('wzPresetList').split('|')[3],
              reason: 'custom',
              custom: true,
            },
          ]),
        created: Date.now(),
        updated: Date.now(),
        demo: true,
      },
    ];
  }
  /* what a plan item is called, and (error review) which topics' misses it covers */
  function itemTitle(it) {
    if (it.kind === 'test') return t('practiceTest');
    if (it.kind === 'custom') return it.label || t('wzCustomDefault');
    if (it.kind === 'reflect') return t('reflectName');
    return TOPICS[it.i].name;
  }
  /* one topic: "Weather · 8 expected misses"; several (a review carried to the next block): "Weather 8 · NAS 4" */
  const partName = x => (x.i === -1 ? t('practiceTest') : TOPICS[x.i].name);
  const reflectDetail = it => {
    const ps = it.parts || [];
    if (ps.length === 1) return `${partName(ps[0])} · ${t('reflectMisses').replace('{n}', ps[0].m)}`;
    return ps.map(x => `${partName(x)} ${x.m}`).join(' · ');
  };
  /* the manual done mark on a plan item (your own activities are only done this way) */
  function toggleCheck(id) {
    const p = (state.plans || []).find(x => (x.items || []).some(it => it.id === id));
    if (!p) return;
    const it = p.items.find(x => x.id === id),
      on = !it.check;
    commit(
      () => {
        const q = state.plans.find(x => x.id === p.id).items.find(x => x.id === id);
        if (on) q.check = true;
        else delete q.check;
        state.plans.find(x => x.id === p.id).updated = Date.now();
      },
      t(on ? 'itemChecked' : 'itemUnchecked')
    );
  }
  /* other active plans a plan would collide with when activated */
  function conflictsFor(plan) {
    return plans().filter(
      p =>
        p.active &&
        p.id !== plan.id &&
        p.type === plan.type &&
        (plan.type === 'daily' ? p.start === plan.start : p.start === plan.start)
    );
  }
  /* an active weekly plan that covers the date of a daily plan (the daily plan replaces only that day) */
  const weeklyUnder = plan =>
    plan.type === 'daily'
      ? plans().find(p => p.active && p.type === 'weekly' && plan.start >= p.start && plan.start <= addDays(p.start, 6))
      : null;

  /* the plan grid starts at the hour chosen in Settings (default 6:00) */
  expose({ DAY_START: [() => pref('gridStart') * 60, () => {}] });
  return {
    SLOT,
    DAY_END,
    mondayOf,
    planDays,
    planTotal,
    rangesTotal,
    normRanges,
    activeFor,
    todayPlan,
    itemDone,
    itemMissed,
    missedTopics,
    suggestDays,
    packDay,
    perQ,
    conflictsFor,
    weeklyUnder,
    clockOf,
    knapsack,
    toggleCheck,
    seedDemoPlan,
    testMinutes,
    itemTitle,
    reflectDetail,
  };
})();
const {
  SLOT,
  DAY_END,
  mondayOf,
  planDays,
  planTotal,
  rangesTotal,
  normRanges,
  activeFor,
  todayPlan,
  itemDone,
  itemMissed,
  missedTopics,
  suggestDays,
  packDay,
  perQ,
  conflictsFor,
  weeklyUnder,
  clockOf,
  knapsack,
  toggleCheck,
  seedDemoPlan,
  testMinutes,
  itemTitle,
  reflectDetail,
} = Schedule;
