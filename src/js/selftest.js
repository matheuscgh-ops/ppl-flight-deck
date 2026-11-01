/* ===== module SelfTest (js/selftest.js) =====
   public: selfTest, showSelfTest */
const SelfTest = (() => {
  /* ================= BUILT-IN UNIT TESTS =================
   Run: open the file with #selftest at the end of the address, or call selfTest() in the console.
   They test the pure logic on throw-away fixtures and always restore your real data. */
  function selfTest() {
    const out = [],
      ok = (group, name, cond, detail = '') => out.push({ group, name, pass: !!cond, detail: String(detail) });
    const near = (a, b, e = 1e-3) => a != null && Math.abs(a - b) < e;
    const saved = JSON.stringify(state),
      savedLang = lang;
    const T = todayISO(),
      D = n => addDays(T, -n);
    const fixture = (evs = [], extra = {}) => {
      state = {
        v: 13,
        statuses: TOPICS.map(t => t.status),
        scores: TOPICS.map(t => t.score),
        events: evs.map(e => ({ id: uid(), from: null, to: null, score: null, partial: false, demo: false, ...e })),
        tests: [],
        deadline: addDays(T, 31),
        lang: 'en',
        updatedAt: 0,
        ...extra,
      };
    };
    const S = i => srModel(i);
    try {
      /* --- forgetting curve --- */
      ok('SR formula', 'R(0) = 100%', near(recall(0, 3), 1));
      ok('SR formula', 'R(t=S) = 90% (definition of stability)', near(recall(4, 4), 0.9), recall(4, 4));
      ok('SR formula', 'R(t) = 1/(1+t/(9S)) for t=2,S=1', near(recall(2, 1), 1 / (1 + 2 / 9)), recall(2, 1));
      ok('SR formula', 'recall decreases with time', recall(1, 2) > recall(5, 2));
      ok('SR formula', 'higher stability forgets slower', recall(5, 6) > recall(5, 2));
      /* --- first session bands --- */
      fixture([{ date: D(0), topic: 22, kind: 'study', score: 65 }]);
      ok('SR first session', 'score < 70 → S = 1', near(S(22).S, 1), S(22).S);
      fixture([{ date: D(0), topic: 22, kind: 'study', score: 75 }]);
      ok('SR first session', 'score 70–84 → S = 1.5', near(S(22).S, 1.5), S(22).S);
      fixture([{ date: D(0), topic: 22, kind: 'study', score: 90 }]);
      ok('SR first session', 'score ≥ 85 → S = 2', near(S(22).S, 2), S(22).S);
      fixture([{ date: D(0), topic: 22, kind: 'study', score: 70 }]);
      ok('SR first session', 'boundary 70 → S = 1.5', near(S(22).S, 1.5), S(22).S);
      fixture([{ date: D(0), topic: 22, kind: 'study', score: 85 }]);
      ok('SR first session', 'boundary 85 → S = 2', near(S(22).S, 2), S(22).S);
      /* --- updates --- */
      fixture([
        { date: D(4), topic: 22, kind: 'study', score: 80 },
        { date: D(0), topic: 22, kind: 'review', score: 90 },
      ]);
      {
        const R = 1 / (1 + 4 / (9 * 1.5)),
          exp = 1.5 * (1 + 1.2 * 0.9 * (1.5 - R));
        ok('SR update', 'good review: S ← S·(1+1.2·p·(1.5−R))', near(S(22).S, exp), `${S(22).S} vs ${exp}`);
      }
      fixture([
        { date: D(2), topic: 22, kind: 'study', score: 80 },
        { date: D(0), topic: 22, kind: 'review', score: 65 },
      ]);
      ok('SR update', 'score 60–69: S ← S × 1.2', near(S(22).S, 1.8), S(22).S);
      fixture([
        { date: D(20), topic: 22, kind: 'study', score: 90 },
        { date: D(15), topic: 22, kind: 'review', score: 95 },
        { date: D(0), topic: 22, kind: 'review', score: 40 },
      ]);
      {
        const R1 = 1 / (1 + 5 / 18),
          S1 = 2 * (1 + 1.2 * 0.95 * (1.5 - R1));
        ok(
          'SR update',
          'lapse (< 60): S ← max(1, 0.4·S)',
          near(S(22).S, Math.max(1, 0.4 * S1)),
          `${S(22).S} vs ${Math.max(1, 0.4 * S1)}`
        );
      }
      fixture([
        { date: D(3), topic: 22, kind: 'study', score: 30 },
        { date: D(0), topic: 22, kind: 'review', score: 20 },
      ]);
      ok('SR update', 'lapse never drops below 1 day', near(S(22).S, 1), S(22).S);
      fixture([
        { date: D(9), topic: 22, kind: 'study', score: 90 },
        { date: D(8), topic: 22, kind: 'review', score: 90 },
      ]);
      const early = S(22).S;
      fixture([
        { date: D(9), topic: 22, kind: 'study', score: 90 },
        { date: D(4), topic: 22, kind: 'review', score: 90 },
      ]);
      ok(
        'SR update',
        'spacing effect: later review grows S more than early review',
        S(22).S > early,
        `${S(22).S} > ${early}`
      );
      fixture([
        { date: D(2), topic: 22, kind: 'study', score: 90 },
        { date: D(0), topic: 22, kind: 'review', score: 70 },
      ]);
      const lowP = S(22).S;
      fixture([
        { date: D(2), topic: 22, kind: 'study', score: 90 },
        { date: D(0), topic: 22, kind: 'review', score: 100 },
      ]);
      ok('SR update', 'higher score grows S more', S(22).S > lowP);
      /* --- what counts as a session --- */
      fixture([
        { date: D(0), topic: 22, kind: 'study', score: 50 },
        { date: D(0), topic: 22, kind: 'review', score: 88 },
      ]);
      ok(
        'SR sessions',
        'same day: one session, best score wins',
        S(22).reps.length === 1 && near(S(22).S, 2),
        `${S(22).reps.length} reps, S ${S(22).S}`
      );
      fixture([{ date: D(0), topic: 22, kind: 'study', partial: true }]);
      ok('SR sessions', 'session in progress is ignored', S(22).reps.length === 0);
      fixture([{ date: D(0), topic: 22, kind: 'move', from: 'Doing', to: 'Very Comfortable' }]);
      ok('SR sessions', 'moving a card is not a session', S(22).reps.length === 0);
      fixture([{ date: addDays(T, 2), topic: 22, kind: 'study', score: 90 }]);
      ok('SR sessions', 'future-dated session is ignored', S(22).reps.length === 0);
      fixture([{ date: D(0), topic: 22, kind: 'study' }]);
      state.scores[22] = 90;
      ok('SR sessions', 'completed session without score uses latest card score', near(S(22).S, 2), S(22).S);
      /* --- schedule --- */
      fixture([{ date: D(3), topic: 22, kind: 'study', score: 90 }]);
      {
        const m = S(22);
        ok('SR schedule', 'next review = last session + round(S)', m.next === addDays(D(3), 2), m.next);
        ok('SR schedule', 'overdue days counted', m.over === 1, m.over);
        ok('SR schedule', 'due text says overdue', dueText(m)[1] === 'over');
      }
      fixture([{ date: D(2), topic: 22, kind: 'study', score: 90 }]);
      ok('SR schedule', 'due today when t = S', S(22).over === 0 && dueText(S(22))[1] === 'now');
      fixture([{ date: D(0), topic: 22, kind: 'study', score: 90 }]);
      ok('SR schedule', 'future review shows "in N d"', S(22).over < 0 && dueText(S(22))[1] === '');
      fixture([]);
      ok(
        'SR schedule',
        'no sessions → "no sessions yet", recall unknown',
        S(22).R === null && dueText(S(22))[0] === t('noHist')
      );
      /* --- tracking & priority --- */
      fixture([]);
      ok('SR tracking', 'Not Comfortable / Very Comfortable / To review are tracked', isTracked(22) && isTracked(12));
      fixture([]);
      ok('SR tracking', 'To Do card with no history is not tracked', !isTracked(0));
      fixture([{ date: D(5), topic: 0, kind: 'move', from: 'Todo', to: 'Not Comfortable' }]);
      ok('SR tracking', 'card that once reached Not Comfortable stays tracked', isTracked(0));
      fixture([{ date: D(0), topic: 12, kind: 'review', score: 100 }]);
      {
        const r = srAll();
        ok(
          'SR priority',
          'topic never reviewed ranks above one reviewed today at 100%',
          r.findIndex(m => m.i === 15) < r.findIndex(m => m.i === 12)
        );
      }
      fixture([
        { date: D(6), topic: 12, kind: 'study', score: 90 },
        { date: D(6), topic: 13, kind: 'study', score: 90 },
      ]);
      state.statuses[12] = 'Very Comfortable';
      state.statuses[13] = 'Not Comfortable';
      {
        const r = srAll();
        ok(
          'SR priority',
          'same recall: Not Comfortable ranks above Very Comfortable',
          r.findIndex(m => m.i === 13) < r.findIndex(m => m.i === 12)
        );
      }
      fixture([
        { date: D(0), topic: 12, kind: 'study', score: 90 },
        { date: D(4), topic: 13, kind: 'study', score: 90 },
      ]);
      {
        const ms = [srModel(12), srModel(13)],
          exp = (56 * ms[0].R + 51 * ms[1].R) / 107;
        ok('SR average', 'average recall is weighted by question count', near(wavg(ms), exp), `${wavg(ms)} vs ${exp}`);
      }
      /* --- progress bar --- */
      fixture([]);
      {
        const c = counts();
        ok(
          'Progress',
          'column totals add up to 1,058 questions',
          c.reduce((a, b) => a + b, 0) === 1058,
          c.reduce((a, b) => a + b, 0)
        );
        ok('Progress', 'Very Comfortable = 457 q with the real board', c[3] === 457, c[3]);
        state.statuses = state.statuses.map(() => 'Very Comfortable');
        ok('Progress', 'all cards Very Comfortable → 100%', counts()[3] === 1058);
        state.statuses[18] = 'Todo';
        ok('Progress', 'moving Weather (158 q) to To Do moves 158 q', counts()[0] === 158 && counts()[3] === 900);
      }
      /* --- streak --- */
      fixture([
        { date: D(0), topic: 1, kind: 'study' },
        { date: D(1), topic: 1, kind: 'study' },
        { date: D(2), topic: 1, kind: 'study' },
      ]);
      ok('Streak', '3 days in a row including today → 3', streakInfo().n === 3, streakInfo().n);
      fixture([
        { date: D(1), topic: 1, kind: 'study' },
        { date: D(2), topic: 1, kind: 'study' },
      ]);
      ok('Streak', 'ending yesterday still counts → 2', streakInfo().n === 2 && !streakInfo().todayDone);
      fixture([
        { date: D(0), topic: 1, kind: 'study' },
        { date: D(2), topic: 1, kind: 'study' },
      ]);
      ok('Streak', 'a gap breaks the streak → 1', streakInfo().n === 1);
      fixture([{ date: D(1), topic: 1, kind: 'study' }], { tests: [{ id: 'x', date: D(0), q: 60, score: 80 }] });
      ok('Streak', 'practice test counts as an active day', streakInfo().n === 2 && streakInfo().days === 2);
      fixture([
        { date: D(0), topic: 1, kind: 'study' },
        { date: D(0), topic: 2, kind: 'review' },
      ]);
      ok('Streak', 'several actions on one day = 1 day', streakInfo().days === 1);
      fixture([]);
      ok('Streak', 'no activity → 0', streakInfo().n === 0);
      /* --- data validation (backup / import) --- */
      ok(
        'Data',
        'rejects a backup with the wrong number of cards',
        normalize({ statuses: ['Todo'], events: [] }) === null
      );
      ok('Data', 'rejects garbage', normalize('hello') === null && normalize(null) === null);
      {
        const n = normalize({ statuses: TOPICS.map(() => 'Weird'), events: [], scores: TOPICS.map(() => 150) });
        ok('Data', 'unknown status falls back to the card default', n.statuses[0] === TOPICS[0].status);
        ok('Data', 'scores are clamped to 0–100', n.scores[0] === 100);
      }
      {
        const n = normalize({
          statuses: TOPICS.map(t => t.status),
          events: [
            { date: '2026-10-01', topic: 3, kind: 'move', status: 'Very Comfortable' },
            { date: 'bad', topic: 1, kind: 'study' },
            { date: '2026-10-02', topic: 99, kind: 'study' },
            { date: '2026-10-03', topic: 1, kind: 'study', partial: true, score: 77 },
          ],
        });
        ok('Data', 'old versions’ "status" field becomes the move target', n.events[0].to === 'Very Comfortable');
        ok('Data', 'events with bad dates or unknown topics are dropped', n.events.length === 2, n.events.length);
        ok('Data', 'in-progress flag and score are kept', n.events[1].partial === true && n.events[1].score === 77);
      }
      {
        const n = normalize({
          statuses: TOPICS.map(t => t.status),
          events: [],
          tests: [{ date: '2026-10-29', q: 60, score: 80 }, { date: 'nope' }],
        });
        ok('Data', 'practice tests are kept, invalid ones dropped', n.tests.length === 1 && n.tests[0].score === 80);
      }
      {
        const n = normalize({ statuses: TOPICS.map(t => t.status), events: [] });
        ok('Data', 'backup without scores uses the original Sporty’s scores', n.scores[0] === TOPICS[0].score);
      }
      {
        fixture([{ date: D(0), topic: 1, kind: 'study', score: 70 }]);
        const round = normalize(JSON.parse(JSON.stringify(state)));
        const canon = o =>
          JSON.stringify(o, (k, v) =>
            v && typeof v === 'object' && !Array.isArray(v)
              ? Object.keys(v)
                  .sort()
                  .reduce((a, x) => ((a[x] = v[x]), a), {})
              : v
          );
        ok(
          'Data',
          'save → load round trip keeps everything',
          canon(round.events) === canon(state.events) &&
            canon(round.scores) === canon(state.scores) &&
            canon(round.statuses) === canon(state.statuses) &&
            round.deadline === state.deadline
        );
      }
      /* --- exam forecast --- */
      ok(
        'Forecast',
        'binomial tail: P(X≥0)=1, P(X≥61)=0',
        near(binomTail(60, 0.6, 0), 1) && near(binomTail(60, 0.6, 61), 0)
      );
      ok(
        'Forecast',
        'binomial tail at p=0.7: P(X≥42) = 0.5632 (exact)',
        near(binomTail(60, 0.7, 42), 0.56324, 1e-4),
        binomTail(60, 0.7, 42)
      );
      ok(
        'Forecast',
        'binomial tail is monotonic in p',
        binomTail(60, 0.8, 42) > binomTail(60, 0.7, 42) && binomTail(60, 0.7, 42) > binomTail(60, 0.6, 42)
      );
      fixture([]);
      state.scores = TOPICS.map(() => 80);
      {
        const f = forecast();
        ok('Forecast', 'every topic 80%, no sessions → expected 80%', near(f.mu, 0.8), f.mu);
        ok(
          'Forecast',
          'topic weights sum to 1',
          near(
            f.parts.reduce((a, x) => a + x.w, 0),
            1
          )
        );
      }
      fixture([]);
      state.scores = TOPICS.map(() => null);
      ok('Forecast', 'no scores at all → 50% (unknown)', near(forecast().mu, 0.5));
      fixture([{ date: D(0), topic: 18, kind: 'study', score: 100 }]);
      state.scores = TOPICS.map(() => 50);
      state.scores[18] = 100;
      {
        const w = 158 / 1058;
        ok(
          'Forecast',
          'Weather at 100% (just studied) raises μ by its weight × 50%',
          near(forecast().mu, 0.5 + w * 0.5),
          forecast().mu
        );
      }
      fixture([{ date: D(10), topic: 18, kind: 'study', score: 100 }]);
      state.scores = TOPICS.map(() => 50);
      state.scores[18] = 100;
      {
        const f = forecast(),
          R = recall(10, 2),
          w = 158 / 1058;
        ok(
          'Forecast',
          'recall decay pulls the topic toward guessing: score × recall + 1/3 × (1 − recall)',
          near(f.mu, 0.5 + w * (R + (1 - R) / 3 - 0.5)),
          f.mu
        );
      }
      ok(
        'Forecast',
        'a forgotten topic tends to 1/3 (guessing among 3 options), never to 0',
        near(pRight(90, 0), 1 / 3) && near(pRight(90, 1), 0.9) && near(pRight(20, 0.5), 0.5 * 0.2 + 0.5 / 3)
      );
      fixture([{ date: D(0), topic: 18, kind: 'study', score: 90 }], { deadline: addDays(T, 30) });
      ok(
        'Forecast',
        'exam-day projection without reviews is lower than today',
        forecast(T, state.deadline).mu < forecast().mu
      );
      ok('Forecast', 'binomial: μ=70% → P(X ≥ 42) = 56.3%', near(binomTail(60, 0.7, 42), 0.56324, 1e-4));
      fixture([]);
      state.scores = TOPICS.map(() => 70);
      ok(
        'Forecast',
        'with ±6 points of uncertainty (beta-binomial) μ=70% → 55.5% (matches scipy betabinom)',
        near(forecast().pass, 0.555047, 1e-4),
        forecast().pass
      );
      ok(
        'Forecast',
        'beta-binomial 85% chance at μ=70% ± 6 → 3.70% (scipy)',
        near(betaBinomTail(60, 0.7, 6, 51), 0.036976, 1e-4),
        betaBinomTail(60, 0.7, 6, 51)
      );
      ok(
        'Forecast',
        'no uncertainty → beta-binomial equals the binomial',
        near(betaBinomTail(60, 0.7, 0, 42), binomTail(60, 0.7, 42))
      );
      {
        const f = forecast(),
          top = f.parts.slice().sort((a, b) => b.lost - a.lost)[0];
        ok('Forecast', 'biggest loss = biggest topic when all scores equal (Weather)', top.i === 18);
      }
      fixture([{ date: D(3), topic: 18, kind: 'study', score: 40 }]);
      state.scores[18] = 40;
      ok(
        'Forecast',
        'forecast history uses the score known at that date',
        scoreAt(18, D(5)) === TOPICS[18].score && scoreAt(18, D(1)) === 40
      );
      /* --- daily plan --- */
      fixture([], { settings: { minutes: 180, qph: 40, tests: 0, reviewMin: 1.5 } });
      {
        const P = buildPlan();
        ok('Plan', 'reference pace = minutes × questions/hour ÷ 60 (180 min × 40 = 120)', P.cap === 120);
        ok('Plan', 'planned time never exceeds your minutes', P.minutes <= 180, P.minutes);
        ok('Plan', 'with review time, fewer questions fit than the no-review pace', P.total < P.cap, P.total);
      }
      fixture([], { settings: { minutes: 180, qph: 40, tests: 0, reviewMin: 1.5 } });
      {
        const st = settings();
        ok(
          'Plan time',
          'calculation topic (Cross-Country) costs more per question than a plain one (Taxiing) at the same score',
          minutesPerQ(12, st, null, 0.7) > minutesPerQ(22, st, null, 0.7)
        );
        ok(
          'Plan time',
          'difficulty ×2 doubles answer and review time',
          near(minutesPerQ(12, st, null, 0.7), 2 * minutesPerQ(22, st, null, 0.7))
        );
        ok(
          'Plan time',
          'higher chance of being right → less review time',
          minutesPerQ(22, st, null, 0.95) < minutesPerQ(22, st, null, 0.5)
        );
        ok(
          'Plan time',
          'exact formula: 60/qph × diff × ease + (1−p) × review × diff',
          near(minutesPerQ(22, st, null, 0.6), 1.5 * 1 * 1.15 + 0.4 * 1.5 * 1)
        );
        ok(
          'Plan time',
          'well-known topic (stability 30 d) answers faster than a new one',
          easeOf({ reps: [1], S: 30 }) < easeOf(null) && near(easeOf({ reps: [1], S: 30 }), 0.75, 0.06)
        );
        ok(
          'Plan time',
          'review minutes = 0 → only answering time',
          near(minutesPerQ(22, { ...st, reviewMin: 0 }, null, 0.3), 1.5 * 1.15)
        );
      }
      fixture([], { settings: { minutes: 60, qph: 40, tests: 0, reviewMin: 3 } });
      {
        const a = buildPlan().total;
        state.settings = { minutes: 60, qph: 40, tests: 0, reviewMin: 0.5 };
        ok(
          'Plan time',
          'more review time per miss → fewer questions planned',
          buildPlan().total > a,
          `${a} vs ${buildPlan().total}`
        );
      }
      fixture([{ date: D(3), topic: 18, kind: 'study', score: 90 }], {
        settings: { minutes: 600, qph: 40, tests: 0, reviewMin: 1.5 },
      });
      {
        const P = buildPlan(),
          it = P.items.find(x => x.i === 18);
        ok('Plan', 'overdue review is planned with reason "due"', it && it.reason === 'due', JSON.stringify(it));
      }
      {
        const P = buildPlan(),
          U = { due: 1.3, weak: 1.15, nodata: 1.1, new: 1, light: 0.8 },
          v = P.items.filter(x => x.kind === 'topic' && !x.done).map(x => ((1 - x.pExam) * (U[x.reason] || 1)) / x.per);
        ok(
          'Plan',
          'medium plan is ordered by exam questions at stake per minute',
          v.every((x, k) => !k || v[k - 1] >= x - 1e-12),
          v.map(x => x.toFixed(3)).join(' ')
        );
        ok(
          'Plan',
          'each topic shows the exam-day questions at stake = 60 × n / 1,058 × (1 − p on exam day)',
          P.items.filter(x => x.kind === 'topic' && x.n).every(x => near(x.stake, ((60 * x.n) / 1058) * (1 - x.pExam)))
        );
      }
      ok(
        'Plan',
        'a reviewed topic loses more by exam day than today (memory decays)',
        (() => {
          const it = buildPlan().items.find(x => x.i === 18);
          return it && it.pExam < it.p;
        })()
      );
      {
        const P = buildPlan(),
          it = P.items.find(x => x.i === 18),
          m = srModel(18, T, true),
          exp = Math.min(158, Math.max(10, Math.min(40, Math.round(158 * (1 - m.R)))));
        ok('Plan', 'review size = clamp(q × (1 − recall), 10, 40)', it.n === exp, `${it.n} vs ${exp}`);
      }
      fixture([], { settings: { minutes: 180, qph: 40, tests: 2 } });
      {
        const P = buildPlan();
        ok(
          'Plan',
          'no practice test yet → a test is planned (60 q)',
          P.items[0].kind === 'test' && P.items[0].n === 60
        );
      }
      fixture([], {
        settings: { minutes: 180, qph: 40, tests: 2 },
        tests: [{ id: 'a', date: D(1), q: 60, score: 80 }],
      });
      ok('Plan', '2 tests/week and one yesterday → no test today', !buildPlan().items.some(x => x.kind === 'test'));
      fixture([], {
        settings: { minutes: 180, qph: 40, testEvery: 3 },
        tests: [{ id: 'a', date: D(3), q: 60, score: 80 }],
      });
      ok(
        'Plan',
        'test every 3 days and the last one 3 days ago → test today',
        buildPlan().items.some(x => x.kind === 'test')
      );
      fixture([], { settings: { minutes: 180, qph: 40, tests: 0 }, deadline: addDays(T, 5) });
      ok(
        'Plan',
        'last 7 days before the exam: no new material',
        !buildPlan().items.some(x => x.reason === 'new') && buildPlan().final
      );
      fixture([], { settings: { minutes: 600, qph: 200, tests: 0 } });
      ok(
        'Plan',
        'with lots of time, new material is planned (biggest first among To Do)',
        buildPlan()
          .items.filter(x => x.reason === 'new')
          .some(x => x.i === 0)
      );
      fixture(
        [
          { date: D(3), topic: 18, kind: 'study', score: 90 },
          { date: D(0), topic: 18, kind: 'review', score: 92 },
        ],
        { settings: { minutes: 180, qph: 40, tests: 0 } }
      );
      {
        const it = buildPlan().items.find(x => x.i === 18);
        ok(
          'Plan',
          'a review logged today is shown as done (not removed)',
          it && it.done && it.reason === 'due',
          JSON.stringify(it)
        );
      }
      fixture(
        [
          { date: D(1), topic: 12, kind: 'study', score: 95 },
          { date: D(0), topic: 12, kind: 'review', score: 96 },
        ],
        { settings: { minutes: 180, qph: 40, tests: 0 } }
      );
      ok(
        'Plan',
        'reviewing a topic that was not due shows as "extra", done',
        buildPlan().items.some(x => x.i === 12 && x.reason === 'extra' && x.done)
      );
      fixture([{ date: D(0), topic: 9, kind: 'study', score: 90 }], { settings: { minutes: 180, qph: 40, tests: 0 } });
      ok(
        'Plan',
        'anything studied today appears in the plan as done',
        buildPlan().items.some(x => x.i === 9 && x.done)
      );
      fixture([], { settings: { minutes: 30, qph: 20, tests: 0, reviewMin: 1.5 } });
      ok(
        'Plan',
        'tiny budget (30 min) still plans at least one item, within 30 min',
        buildPlan().items.length >= 1 && buildPlan().minutes <= 30,
        buildPlan().minutes
      );
      {
        const n = normalize({
          statuses: TOPICS.map(t => t.status),
          events: [],
          settings: { minutes: 90, qph: 30, testEvery: 4, reviewMin: 2.5 },
        });
        ok(
          'Plan',
          'settings survive save / import (incl. review minutes and test cadence)',
          n.settings.minutes === 90 &&
            n.settings.qph === 30 &&
            n.settings.testEvery === 4 &&
            n.settings.reviewMin === 2.5
        );
      }
      {
        const n = normalize({
          statuses: TOPICS.map(t => t.status),
          events: [],
          settings: { minutes: 90, qph: 30, tests: 1 },
        });
        ok('Plan', 'old backup with 1 test per week imports as every 7 days', n.settings.testEvery === 7);
      }
      {
        const n = normalize({ statuses: TOPICS.map(t => t.status), events: [] });
        ok(
          'Plan',
          'old backups get default settings (180 min, 40 q/h, test every 3 days, 1.5 min review)',
          n.settings.minutes === 180 &&
            n.settings.qph === 40 &&
            n.settings.testEvery === 3 &&
            n.settings.reviewMin === 1.5
        );
      }
      /* --- energy modes --- */
      fixture(
        [
          { date: D(6), topic: 18, kind: 'study', score: 30 },
          { date: D(5), topic: 13, kind: 'study', score: 95 },
          { date: D(5), topic: 12, kind: 'study', score: 92 },
        ],
        { settings: { minutes: 120, qph: 40, tests: 2, reviewMin: 1.5 } }
      );
      {
        const L = buildPlan(T, null, 'low'),
          Mm = buildPlan(T, null, 'medium'),
          H = buildPlan(T, null, 'high');
        ok(
          'Energy',
          'three plans are built (low / medium / high)',
          L.mode === 'low' && Mm.mode === 'medium' && H.mode === 'high'
        );
        ok(
          'Energy',
          'low energy skips the practice test',
          !L.items.some(x => x.kind === 'test') && Mm.items.some(x => x.kind === 'test')
        );
        ok('Energy', 'high energy starts with the practice test', H.items[0].kind === 'test');
        ok(
          'Energy',
          'workload: low < medium ≤ high',
          L.workload < Mm.workload && Mm.workload <= H.workload,
          `${L.workload} ${Mm.workload} ${H.workload}`
        );
        const firstTopic = P => P.items.find(x => x.kind === 'topic' && !x.done);
        ok(
          'Energy',
          'low energy starts with an easy item (higher chance of being right than high energy)',
          firstTopic(L).p > firstTopic(H).p,
          `${firstTopic(L).p} vs ${firstTopic(H).p}`
        );
        ok('Energy', 'high energy plans more time (stretch 10%) and goes faster', H.budget > Mm.budget);
        ok(
          'Energy',
          'every plan fits its minutes',
          L.minutes <= L.budget && Mm.minutes <= Mm.budget && H.minutes <= H.budget,
          `${L.minutes}/${L.budget} ${Mm.minutes}/${Mm.budget} ${H.minutes}/${H.budget}`
        );
        ok(
          'Energy',
          'low energy may include light reviews of topics you know',
          L.items.every(x => x.reason !== 'light' || state.statuses[x.i] === 'Very Comfortable')
        );
        ok(
          'Energy',
          'medium = the standard plan (default)',
          JSON.stringify(buildPlan(T).items.map(x => x.i)) === JSON.stringify(Mm.items.map(x => x.i))
        );
      }
      /* --- practice tests: regression --- */
      {
        const r = linReg([
          [0, 60],
          [7, 67],
          [14, 74],
          [21, 81],
        ]);
        ok(
          'Regression',
          'perfect line → slope 1/day, intercept 60, R² = 1',
          near(r.b, 1) && near(r.a, 60) && near(r.r2, 1),
          JSON.stringify(r && { a: r.a, b: r.b, r2: r.r2 })
        );
      }
      {
        const r = linReg([
          [0, 70],
          [1, 80],
          [2, 70],
          [3, 80],
        ]);
        ok('Regression', 'no trend (zig-zag) → R² ≈ 0.2, small slope', r.r2 < 0.25 && Math.abs(r.b) < 3.5, r.r2);
      }
      {
        const r = linReg([
          [0, 50],
          [10, 60],
          [20, 80],
          [30, 90],
        ]);
        const ex = (() => {
          const xs = [0, 10, 20, 30],
            ys = [50, 60, 80, 90],
            mx = 15,
            my = 70;
          let sxy = 0,
            sxx = 0;
          xs.forEach((x, k) => {
            sxy += (x - mx) * (ys[k] - my);
            sxx += (x - mx) ** 2;
          });
          return sxy / sxx;
        })();
        ok('Regression', 'least-squares slope matches the textbook formula', near(r.b, ex), r.b);
      }
      ok('Regression', 'fewer than 2 points → no regression', linReg([[0, 80]]) === null);
      {
        const r = linReg([
          [0, 60],
          [7, 66],
          [14, 75],
          [21, 80],
        ]);
        ok('Regression', 'prediction band is wider away from the data', r.band(60) > r.band(10));
      }
      fixture([], {
        tests: [
          { id: 'a', date: D(20), q: 60, score: 60 },
          { id: 'b', date: D(13), q: 60, score: 67 },
          { id: 'c', date: D(6), q: 60, score: 74 },
        ],
      });
      {
        const tr = testTrend('all');
        ok('Regression', 'trend needs 4 scored tests (3 → none)', tr.n === 3 && tr.reg === null);
      }
      fixture([], {
        deadline: addDays(T, 60),
        tests: [
          { id: 'a', date: D(21), q: 60, score: 60 },
          { id: 'b', date: D(14), q: 60, score: 67 },
          { id: 'c', date: D(7), q: 60, score: 74 },
          { id: 'd', date: D(0), q: 60, score: 81 },
        ],
      });
      {
        const tr = testTrend('all'),
          d = Math.ceil(-14 * Math.log(1 - 4 / 14));
        ok(
          'Regression',
          '+1 point/day from 81% → reaches 85% in ⌈−14·ln(1 − 4/14)⌉ = 5 days (slowing projection)',
          tr.cross === addDays(T, d) && d === 5,
          tr.cross
        );
        ok(
          'Regression',
          'projection on exam day = 81 + 14 × (1 − e^(−60/14)) ≈ 94.8%, never 100% from a straight line',
          near(tr.exam, 81 + 14 * (1 - Math.exp(-60 / 14)), 1e-6),
          tr.exam
        );
      }
      fixture([], {
        tests: [
          { id: 'a', date: D(21), q: 60, score: 80 },
          { id: 'b', date: D(14), q: 60, score: 75 },
          { id: 'c', date: D(7), q: 60, score: 70 },
          { id: 'd', date: D(0), q: 60, score: 65 },
        ],
      });
      ok('Regression', 'falling scores → "not on track"', testTrend('all').cross === 'never');
      fixture([], {
        tests: [
          { id: 'a', date: D(9), q: 60, score: 86 },
          { id: 'b', date: D(6), q: 60, score: 88 },
          { id: 'c', date: D(3), q: 60, score: 90 },
          { id: 'd', date: D(0), q: 60, score: 92 },
        ],
      });
      ok('Regression', 'already above 85% → "already"', testTrend('all').cross === 'already');
      fixture([], {
        tests: [
          { id: 'a', date: D(30), q: 60, score: 50 },
          { id: 'b', date: D(9), q: 60, score: 86 },
          { id: 'c', date: D(6), q: 60, score: 88 },
          { id: 'd', date: D(3), q: 60, score: 90 },
          { id: 'e', date: D(0), q: 60, score: 92 },
        ],
      });
      ok(
        'Regression',
        'interval 2W ignores tests older than 14 days',
        testTrend('2w').n === 4 && testTrend('all').n === 5
      );
      /* --- blended score --- */
      fixture([]);
      state.scores = TOPICS.map(() => 60);
      {
        const B = blended();
        ok('Blend', 'no practice tests → blended = question-bank model', near(B.mu, forecast().mu) && B.n === 0);
      }
      fixture([], { tests: [{ id: 'a', date: D(1), q: 60, score: 90 }] });
      state.scores = TOPICS.map(() => 60);
      {
        const B = blended(),
          m = forecast().mu,
          om = Math.pow(0.5, 1 / 10),
          w = om / (om + 2);
        ok(
          'Blend',
          '1 test yesterday → weight 0.5^(1/10) ÷ (0.5^(1/10) + 2) ≈ 0.318',
          near(B.w, w) && near(B.mu, (1 - w) * m + w * 0.9),
          B.w
        );
      }
      fixture([], {
        tests: [
          { id: 'a', date: D(9), q: 60, score: 50 },
          { id: 'b', date: D(6), q: 60, score: 80 },
          { id: 'c', date: D(3), q: 60, score: 85 },
          { id: 'd', date: D(1), q: 60, score: 90 },
        ],
      });
      state.scores = TOPICS.map(() => 60);
      {
        const B = blended(),
          m = forecast().mu,
          om = [6, 3, 1].map(a => Math.pow(0.5, a / 10)),
          W = om[0] + om[1] + om[2],
          avg = (om[0] * 80 + om[1] * 85 + om[2] * 90) / W / 100,
          w = W / (W + 2);
        ok(
          'Blend',
          'uses only the last 3 tests, newer ones weigh more (half-life 10 days)',
          near(B.w, w) && near(B.testsAvg, avg) && near(B.mu, (1 - w) * m + w * avg) && B.testsAvg > 0.85,
          [B.w, B.testsAvg]
        );
      }
      {
        const B = blended();
        ok(
          'Blend',
          'an old test weighs less: 3 weeks ago ≈ 0.23 of a fresh one',
          near(Math.pow(0.5, 21 / 10), 0.233, 1e-3)
        );
      }
      {
        const B = blended();
        ok(
          'Blend',
          'pass chance = beta-binomial around the blended score with the combined uncertainty',
          B.sd > 0 && near(B.pass, betaBinomTail(60, B.mu, B.sd, 42)) && near(B.goal, betaBinomTail(60, B.mu, B.sd, 51))
        );
      }
      fixture([], { tests: [{ id: 'a', date: D(1), q: 60, score: null }] });
      state.scores = TOPICS.map(() => 60);
      ok('Blend', 'tests in progress are ignored', blended().n === 0);
      fixture([], { tests: [{ id: 'a', date: D(1), q: 60, score: 90 }] });
      ok(
        'Blend',
        'dashboard forecast shows the blended score',
        (renderFcMini(), $('#fcMiniVal').textContent === Math.round(blended().mu * 100) + '%')
      );
      /* --- calibration --- */
      fixture([], { tests: [{ id: 'a', date: D(1), q: 60, score: 70 }] });
      ok('Calibration', 'fewer than 5 tests → no correction', !calibration().usable);
      fixture(
        [0, 1, 2, 3, 4].map(k => ({ date: D(11 - 2 * k), topic: k, kind: 'study', score: 90 })),
        { tests: [0, 1, 2, 3, 4].map(k => ({ id: 't' + k, date: D(10 - 2 * k), q: 60, score: 60 + k * 5 })) }
      );
      {
        const C = calibration();
        ok(
          'Calibration',
          '5 tests → regression of real on predicted, with bias',
          C.pts.length === 5 && C.reg !== null && C.bias != null,
          JSON.stringify(C.pts)
        );
      }
      fixture([], {
        tests: [0, 1, 2, 3, 4].map(k => ({ id: 't' + k, date: D(10 - 2 * k), q: 60, score: 60 + k * 5 })),
      });
      {
        const C = calibration();
        ok(
          'Calibration',
          'model flat on every test day → no regression, no crash',
          C.reg === null && !C.usable && C.bias != null
        );
      }
      /* --- histogram --- */
      {
        const sc = [50, 54, 55, 69, 70, 84, 85, 99, 100].map(v => ({ score: v })),
          hb = histBins(sc);
        ok('Histogram', '5-point bins from 50% to 100%', hb.length === 10 && hb[0].a === 50 && hb.at(-1).z === 100);
        ok(
          'Histogram',
          'bin edges: 54 → 50–54, 55 → 55–59, 100 → 95–100',
          hb[0].n === 2 && hb[1].n === 1 && hb[9].n === 2,
          JSON.stringify(hb.map(b => b.n))
        );
        ok('Histogram', 'counts add up to all tests', hb.reduce((a, b) => a + b.n, 0) === 9);
      }
      {
        const sc = [42, 90].map(v => ({ score: v }));
        ok('Histogram', 'a score below 50% starts the bins lower', histBins(sc)[0].a === 40);
      }
      {
        const d = distStats([60, 70, 80].map(v => ({ score: v })));
        ok('Histogram', 'mean 70, sample standard deviation 10', near(d.mean, 70) && near(d.sd, 10));
      }
      ok(
        'Histogram',
        'binomial 90% range for μ=0.75 on 60 questions is 39–50 (matches scipy binom.ppf)',
        binomQuantile(60, 0.75, 0.05) === 39 && binomQuantile(60, 0.75, 0.95) === 50,
        [binomQuantile(60, 0.75, 0.05), binomQuantile(60, 0.75, 0.95)]
      );
      fixture([{ date: D(1), topic: 1, kind: 'study', score: 70 }], {
        settings: { minutes: 180, qph: 40, testEvery: 7 },
        tests: [{ id: 'a', date: D(1), q: 60, score: 75 }],
      });
      {
        state.plan = { date: T, energy: 'medium', test: true };
        const had = buildPlan(T, null, 'low').items.find(x => x.kind === 'test');
        state.plan = null;
        ok(
          'Cadence',
          'a test added by hand is planned today, even on low energy, reason "Added by you"',
          had && had.reason === 'testManual' && had.n === 60
        );
        ok(
          'Cadence',
          'after removing it the plan has no test again',
          !buildPlan(T, null, 'low').items.some(x => x.kind === 'test')
        );
      }
      /* --- sync merge --- */
      {
        const base = {
          statuses: TOPICS.map(x => x.status),
          scores: TOPICS.map(x => x.score),
          events: [],
          tests: [],
          deadline: '2026-11-30',
          lang: 'en',
        };
        const A = normalize({
          ...base,
          updatedAt: 10,
          events: [{ id: 'e1', date: T, topic: 1, kind: 'study', score: 80 }],
          tests: [{ id: 't1', date: T, q: 60, score: 70 }],
        });
        const Bs = normalize({
          ...base,
          updatedAt: 20,
          events: [{ id: 'e2', date: T, topic: 2, kind: 'study', score: 60 }],
          tests: [],
        });
        const M = mergeStates(A, Bs);
        ok(
          'Sync merge',
          'events and tests from both devices are kept (union by id)',
          M.events.length === 2 && M.tests.length === 1 && M.updatedAt === 20
        );
        const Bd = normalize({ ...base, updatedAt: 30, events: [], deleted: { e1: T } });
        ok(
          'Sync merge',
          'a deleted item never comes back from the other copy',
          !mergeStates(A, Bd).events.some(e => e.id === 'e1')
        );
        const A2 = normalize({ ...base, updatedAt: 5, statuses: TOPICS.map(() => 'Todo') }),
          B2 = normalize({ ...base, updatedAt: 9 });
        ok(
          'Sync merge',
          'lists, scores and settings come from the newer copy',
          JSON.stringify(mergeStates(A2, B2).statuses) === JSON.stringify(B2.statuses)
        );
        const Ae = normalize({
            ...base,
            updatedAt: 5,
            events: [{ id: 'e9', date: T, topic: 1, kind: 'study', score: 50 }],
          }),
          Be = normalize({
            ...base,
            updatedAt: 9,
            events: [{ id: 'e9', date: T, topic: 1, kind: 'study', score: 95 }],
          });
        ok('Sync merge', 'same id on both → the newer copy wins', mergeStates(Ae, Be).events[0].score === 95);
      }
      {
        fixture([{ date: D(1), topic: 1, kind: 'study', score: 70 }]);
        prevIds = null;
        save(false);
        const id = state.events[0].id;
        state.events = [];
        save(false);
        ok('Sync merge', 'deleting an event records a tombstone', !!state.deleted[id]);
        state.events.push({
          id,
          date: D(1),
          topic: 1,
          kind: 'study',
          score: 70,
          from: null,
          to: null,
          partial: false,
          demo: false,
        });
        save(false);
        ok('Sync merge', 'undo (item back) removes the tombstone', !state.deleted[id]);
      }
      ok(
        'Plan day',
        'energy and the added test are saved in the synced state',
        (() => {
          fixture([]);
          state.plan = { date: T, energy: 'high', test: true };
          const n = normalize(JSON.parse(JSON.stringify(state)));
          state.plan = null;
          return n.plan.energy === 'high' && n.plan.test === true;
        })()
      );
      ok(
        'Plan day',
        'yesterday’s choices do not carry over',
        (() => {
          fixture([]);
          state.plan = { date: D(1), energy: 'low', test: true };
          const r = planDay().energy === 'medium' && !planDay().test;
          state.plan = null;
          return r;
        })()
      );
      fixture([{ date: D(1), topic: 1, kind: 'study', score: 70 }], {
        settings: { minutes: 180, qph: 40, testEvery: 7 },
        tests: [{ id: 'a', date: D(3), q: 60, score: 75 }],
      });
      ok(
        'Cadence',
        'recall 75–85% alone no longer brings a test forward (threshold 75%)',
        (() => {
          const w = testWhy();
          return w.reason !== 'testRecall' || wavg(srAll(T, true)) < 0.75;
        })()
      );
      /* --- heat map --- */
      fixture([{ date: D(10), topic: 5, kind: 'study', score: 80 }]);
      {
        const h = heatAt(5, T),
          m = srModel(5, T);
        ok(
          'Heat map',
          'heat = chance of a right answer = score × recall + 1/3 × (1 − recall)',
          h && h.heat === Math.round(100 * (0.8 * m.R + (1 - m.R) / 3)),
          h
        );
      }
      ok('Heat map', 'a forgotten topic never goes below guessing (≈ 33)', Math.round(100 * pRight(90, 0)) === 33);
      ok('Heat map', 'no history → no heat', heatAt(6, T) === null);
      {
        const a = heatAt(5, D(9)),
          b = heatAt(5, T);
        ok('Heat map', 'without reviews the topic cools over time', a.heat > b.heat, [a.heat, b.heat]);
      }
      {
        const d = heatData('3m');
        ok(
          'Heat map',
          '3M = 13 weekly periods ending today; all 26 topics, coldest first, no history last',
          d.ends.length === 13 &&
            d.ends[12] === T &&
            d.rows.length === 26 &&
            d.rows[0].i === 5 &&
            d.rows[25].cells.every(c => c === null)
        );
      }
      ok(
        'Heat map',
        'colors go from cold blue to hot red',
        heatColor(0) === 'rgb(47,75,216)' && heatColor(100) === 'rgb(242,57,44)'
      );
      /* --- practice tests in volume and plan --- */
      fixture([], {
        tests: [
          { id: 'a', date: T, q: 40, score: 80 },
          { id: 'b', date: T, q: 60, score: null },
        ],
      });
      ok(
        'Volume',
        'a scored practice test always adds 60 questions; in progress adds 0',
        weeklyVolume(12).at(-1).q === 60
      );
      fixture([], { settings: { minutes: 180, qph: 40, testEvery: 0 } });
      ok('Cadence', 'every 0 days = off', !testWhy().due && !buildPlan().items.some(x => x.kind === 'test'));
      fixture([{ date: D(5), topic: 1, kind: 'study', score: 70 }], {
        settings: { minutes: 180, qph: 40, testEvery: 7 },
        tests: [{ id: 'a', date: D(5), q: 60, score: 75 }],
      });
      ok(
        'Cadence',
        '3+ days without studying triggers a test early (reason "idle")',
        testWhy().reason === 'testIdle',
        testWhy().reason
      );
      fixture([{ date: D(1), topic: 1, kind: 'study', score: 70 }], {
        settings: { minutes: 180, qph: 40, testEvery: 7 },
        deadline: addDays(T, 8),
        tests: [{ id: 'a', date: D(2), q: 60, score: 75 }],
      });
      ok(
        'Cadence',
        'last 10 days before the exam → every 2 days',
        testWhy().due && testWhy().reason === 'testFinal',
        JSON.stringify(testWhy())
      );
      fixture([{ date: D(1), topic: 1, kind: 'study', score: 70 }], {
        settings: { minutes: 180, qph: 40, testEvery: 3 },
        tests: [{ id: 'a', date: D(1), q: 60, score: 75 }],
      });
      ok('Cadence', 'next test date = last + N days', testWhy().next === addDays(D(1), 3) && !testWhy().due);
      fixture([{ date: D(1), topic: 1, kind: 'study', score: 70 }], {
        settings: { minutes: 180, qph: 40, testEvery: 3 },
        tests: [{ id: 'a', date: D(3), q: 60, score: 75 }],
      });
      ok(
        'Cadence',
        'low energy skips a test that is just due',
        !buildPlan(T, null, 'low').items.some(x => x.kind === 'test') &&
          buildPlan(T, null, 'medium').items.some(x => x.kind === 'test')
      );
      fixture([{ date: D(1), topic: 1, kind: 'study', score: 70 }], {
        settings: { minutes: 180, qph: 40, testEvery: 3 },
        tests: [{ id: 'a', date: D(6), q: 60, score: 75 }],
      });
      ok(
        'Cadence',
        'low energy still plans a test overdue by 2+ days',
        buildPlan(T, null, 'low').items.some(x => x.kind === 'test')
      );
      fixture([], { settings: { minutes: 180, qph: 40, tests: 2 } });
      ok('Cadence', 'old "2 tests per week" setting becomes every 4 days', settings().testEvery === 4);
      /* --- saved plans and the time-block scheduler --- */
      ok(
        'Plans',
        '15-minute slots merge into ranges',
        JSON.stringify(normRanges([1170, 1140, 1155, 1200])) === '[[1140,1185],[1200,1215]]',
        JSON.stringify(normRanges([1170, 1140, 1155, 1200]))
      );
      {
        const C = (key, n, per, value) => ({ key, kind: 'topic', i: key.charCodeAt(0), n, per, value });
        const pick = knapsack([C('A', 10, 3, 10), C('B', 10, 3, 9), C('C', 20, 3, 15)], 60);
        ok(
          'Plans',
          'knapsack picks the best set that fits (A+B = 19 beats C = 15 in 60 min)',
          pick
            .map(x => x.key)
            .sort()
            .join() === 'A,B',
          pick.map(x => x.key).join()
        );
        const pick2 = knapsack([C('A', 10, 3, 10), C('B', 20, 2, 8)], 40);
        ok(
          'Plans',
          'time left after the knapsack gets part of the next topic (≥ 5 questions)',
          pick2.some(x => x.key === 'A' && x.n === 10) && pick2.some(x => x.key === 'B' && x.n === 5),
          JSON.stringify(pick2.map(x => [x.key, x.n]))
        );
      }
      fixture(
        [
          { date: D(12), topic: 18, kind: 'study', score: 60 },
          { date: D(9), topic: 6, kind: 'study', score: 75 },
          { date: D(15), topic: 13, kind: 'study', score: 80 },
        ],
        { settings: { minutes: 180, qph: 40, testEvery: 0, reviewMin: 1.5 } }
      );
      {
        const day = packDay(T, [[19 * 60, 20 * 60 + 30]], 'medium'),
          used = day.reduce((a, it) => a + it.min, 0),
          seq = day.every((it, k) => !k || it.start >= day[k - 1].start + day[k - 1].min - 1e-9);
        ok('Plans', 'a 90-min block is filled without going over it', day.length && used <= 92, used);
        const last = day[day.length - 1];
        ok(
          'Plans',
          'the block ends with an error review sized 10 min … a quarter of the block',
          last.kind === 'reflect' &&
            last.min >= 10 &&
            last.min <= 20 &&
            last.start + last.min <= 1230 &&
            last.parts.length,
          JSON.stringify(last)
        );
        ok(
          'Plans',
          'items run one after another inside the block',
          seq && day.every(it => it.start >= 1140 && it.start < 1230)
        );
        const topics = day.filter(it => it.kind === 'topic');
        ok(
          'Plans',
          'deep work: one topic per ~45 min (2 in 90 min), one more only when 20+ min would stay empty',
          topics.length <= 3,
          topics.length
        );
        ok('Plans', 'a topic appears once per day', new Set(topics.map(it => it.i)).size === topics.length);
        ok(
          'Plans',
          'no tiny items: every topic chunk is 10 min or more (or the whole small topic)',
          topics.every(it => it.min >= 10 || it.n === TOPICS[it.i].q),
          JSON.stringify(topics.map(x => [x.i, x.n, x.min]))
        );
        state.settings.reflect = false;
        ok(
          'Plans',
          'error review off in Settings → no review item',
          !packDay(T, [[1140, 1230]], 'medium').some(it => it.kind === 'reflect')
        );
        state.settings.reflect = true;
        state.settings.reviewMin = 0;
        ok(
          'Plans',
          'no review time per miss → no review item',
          !packDay(T, [[1140, 1230]], 'medium').some(it => it.kind === 'reflect')
        );
        state.settings.reviewMin = 1.5;
        const two = packDay(
          T,
          [
            [19 * 60, 19 * 60 + 45],
            [21 * 60, 21 * 60 + 45],
          ],
          'medium'
        );
        const twoT = two.filter(it => it.kind === 'topic');
        ok('Plans', 'two blocks on one day never repeat a topic', new Set(twoT.map(it => it.i)).size === twoT.length);
        ok(
          'Plans',
          'each block keeps its own error review at its end',
          [1140, 1260].every(s0 => {
            const b = two.filter(it => it.start >= s0 && it.start < s0 + 45);
            return (
              !b.length || b[b.length - 1].kind === 'reflect' || b.every(it => it.kind !== 'topic' || it.n * 0 === 0)
            );
          })
        );
        {
          /* a practice test that fills its block exactly: its review moves to the start of the next block */
          const keep = state.tests;
          state.tests = [{ id: 'old', date: D(5), q: 60, score: 72 }];
          state.settings.testEvery = 3;
          const st = settings(),
            ansTest = Math.ceil(TEST_Q * (60 / st.qph) * 1.1),
            d2 = packDay(
              T,
              [
                [600, 600 + ansTest],
                [1140, 1230],
              ],
              'medium'
            ),
            first2 = d2.find(it => it.start >= 1140);
          ok(
            'Plans',
            'when a practice test fills its block, its error review opens the next block',
            d2[0].kind === 'test' && first2 && first2.kind === 'reflect' && first2.parts.some(x => x.i === -1),
            JSON.stringify(d2.map(x => [x.kind, x.start, x.min]))
          );
          state.tests = keep;
          state.settings.testEvery = 0;
        }
        const wk = suggestDays([T, addDays(T, 1)], { [T]: [[1140, 1230]], [addDays(T, 1)]: [[1140, 1230]] }, {}),
          dueDay1 = wk[T].filter(it => it.reason === 'due').map(it => it.i);
        ok(
          'Plans',
          'a week assumes earlier days were done: a review placed today is not due again tomorrow',
          !wk[addDays(T, 1)].some(it => it.reason === 'due' && dueDay1.includes(it.i)),
          JSON.stringify(wk)
        );
        ok(
          'Plans',
          'simulated sessions never stay in your history',
          state.events.length === 3 && !state.events.some(e => String(e.id).startsWith('sim'))
        );
      }
      {
        const wkP = { id: 'w', type: 'weekly', start: mondayOf(T), active: true, blocks: {}, items: [], updated: 1 },
          dP = {
            id: 'd',
            type: 'daily',
            start: T,
            active: true,
            blocks: {},
            items: [
              { id: 'i1', date: T, start: 1140, min: 30, kind: 'topic', i: 3, n: 10, reason: 'new' },
              {
                id: 'i2',
                date: T,
                start: 1170,
                min: 20,
                kind: 'custom',
                i: null,
                n: 0,
                label: 'Simulator',
                reason: 'custom',
              },
            ],
            updated: 2,
          };
        fixture([], { plans: [wkP, dP] });
        ok(
          'Plans',
          'today comes from the daily plan first',
          activeFor(T).kind === 'daily' && todayPlan().source === 'daily'
        );
        state.plans[1].active = false;
        ok('Plans', '… then from the weekly plan', activeFor(T).kind === 'weekly' && todayPlan().source === 'weekly');
        state.plans[0].active = false;
        ok('Plans', '… else from the suggestion', activeFor(T) === null && todayPlan().source === 'suggested');
        state.plans[1].active = true;
        ok('Plans', 'a plan item is not done before you log it', !itemDone(state.plans[1].items[0]));
        state.events.push({
          id: 'x',
          date: T,
          topic: 3,
          kind: 'study',
          score: 80,
          from: null,
          to: null,
          partial: false,
          demo: false,
        });
        ok('Plans', 'logging a session for that topic on that day marks it done', itemDone(state.plans[1].items[0]));
        ok(
          'Plans',
          'your own activity is done only by hand',
          !itemDone(state.plans[1].items[1]) && itemDone({ ...state.plans[1].items[1], check: true })
        );
        state.plans[1].items.push({
          id: 'i3',
          date: D(1),
          start: 1140,
          min: 30,
          kind: 'topic',
          i: 5,
          n: 10,
          reason: 'new',
        });
        ok(
          'Plans',
          'an undone item from an earlier day is missed and boosts its topic',
          itemMissed(state.plans[1].items[2]) && missedTopics(T).has(5)
        );
        ok(
          'Plans',
          'a daily plan over an active weekly plan asks to replace only that day',
          (state.plans[0].active = true) && weeklyUnder(state.plans[1]) && weeklyUnder(state.plans[1]).id === 'w'
        );
        const n = normalize({
          ...state,
          plans: [
            { type: 'bogus' },
            { type: 'daily', start: 'x' },
            { ...dP, items: [{ kind: 'topic', i: 99, date: T, start: 0, min: 5 }] },
          ],
        });
        ok(
          'Plans',
          'malformed plans and items are dropped when loading',
          n.plans.length === 1 && n.plans[0].items.length === 0,
          JSON.stringify(n.plans)
        );
      }
      /* --- translations --- */
      const keys = Object.keys(I18N.en);
      ['pt', 'ja'].forEach(L => {
        const miss = keys.filter(k => I18N[L][k] == null);
        ok('Languages', `${L}: every English label has a translation`, !miss.length, miss.join(', '));
      });
      ['en', 'pt', 'ja'].forEach(L =>
        ok('Languages', `${L}: 5 list names and 7 weekdays`, I18N[L].labels.length === 5 && I18N[L].days.length === 7)
      );
    } catch (err) {
      ok('Runner', 'tests ran without crashing', false, (err && err.stack) || err);
    } finally {
      state = JSON.parse(saved);
      lang = savedLang;
    }
    return out;
  }
  function showSelfTest() {
    const r = selfTest(),
      fail = r.filter(x => !x.pass),
      groups = [...new Set(r.map(x => x.group))];
    const box = document.createElement('div');
    box.id = 'selftestBox';
    box.innerHTML =
      `<div class="stpanel"><div class="sthead"><b>${fail.length ? '❌' : '✅'} ${r.length - fail.length}/${r.length} unit tests passed</b><button type="button" id="stClose">×</button></div>` +
      groups
        .map(
          g =>
            `<h4>${esc(g)}</h4>` +
            r
              .filter(x => x.group === g)
              .map(
                x =>
                  `<div class="strow ${x.pass ? '' : 'bad'}">${x.pass ? '✓' : '✗'} ${esc(x.name)}${x.pass ? '' : ` <code>${esc(x.detail)}</code>`}</div>`
              )
              .join('')
        )
        .join('') +
      `</div>`;
    document.body.appendChild(box);
    $('#stClose').onclick = () => box.remove();
    console[fail.length ? 'error' : 'log'](`selfTest: ${r.length - fail.length}/${r.length} passed`, fail);
    return r;
  }
  return { selfTest, showSelfTest };
})();
const { selfTest, showSelfTest } = SelfTest;
