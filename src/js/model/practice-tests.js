/* ===== module PracticeTestModel (js/model/practice-tests.js) =====
   public: TEST_Q, scoredTests, testsSD, blended, linReg, testTrend, calibration, testWhy
   shared state (getter/setter): tsRange */
const PracticeTestModel = (() => {
  /* ===== practice tests: blended score, regression, calibration, cadence =====
   blended score = (1 − w) × question-bank model + w × age-weighted average of the last 3 scored practice tests
                   test weight 0.5^(age/10 days),  W = sum of the weights,  w = W / (W + 2)
   pass / 85% chances: beta-binomial around the blended score (model error and test spread combined).
   trend         = least-squares line  score = a + b × day   (R² = 1 − SSres / SStot), shown from 4 scored tests
                   after the last test the projection slows: extra = b × 14 × (1 − e^(−days/14))
   band          = ± 1 standard error of the prediction  se·√(1 + 1/n + (x − x̄)² / Sxx)
   calibration   = least-squares  real = α + β × model forecast on that day, used from 5 tests when R² ≥ 0.3 */
  const TEST_Q = 60;
  function scoredTests(upTo) {
    return (state.tests || [])
      .filter(x => x.score != null && (!upTo || x.date <= upTo))
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  const HALF_LIFE = 10;
  const stdev = v => {
    const n = v.length;
    if (n < 2) return 0;
    const m = v.reduce((a, x) => a + x, 0) / n;
    return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1));
  };
  /* uncertainty of an average of practice tests: spread of your last 5 scores (at least 4 points; 8 with one test) ÷ √(effective n) */
  const testsSD = (asOf, nEff) => {
    const v = scoredTests(asOf)
      .slice(-5)
      .map(x => x.score);
    return (v.length > 1 ? Math.max(4, stdev(v)) : 8) / Math.sqrt(Math.max(1, nEff));
  };
  function blended(asOf) {
    asOf = asOf || todayISO();
    const f = forecast(asOf),
      last = scoredTests(asOf).slice(-3),
      n = last.length;
    if (!n) return { ...f, model: f.mu, testsAvg: null, n: 0, w: 0, W: 0 };
    /* each of the last 3 tests weighs 0.5^(age in days / 10): yesterday ≈ 0.93, three weeks ago ≈ 0.23 */
    const om = last.map(x => Math.pow(0.5, Math.max(0, diffDays(x.date, asOf)) / HALF_LIFE)),
      W = om.reduce((a, x) => a + x, 0);
    const avg = last.reduce((a, x, k) => a + om[k] * x.score, 0) / W / 100,
      w = W / (W + 2),
      mu = (1 - w) * f.mu + w * avg;
    const sd = Math.sqrt(((1 - w) * f.sd) ** 2 + (w * testsSD(asOf, (W * W) / om.reduce((a, x) => a + x * x, 0))) ** 2);
    return {
      ...f,
      mu,
      model: f.mu,
      testsAvg: avg,
      n,
      w,
      W,
      sd,
      pass: betaBinomTail(EXAM_Q, mu, sd, PASS_N),
      goal: betaBinomTail(EXAM_Q, mu, sd, GOAL_N),
    };
  }
  function linReg(pts) {
    const n = pts.length;
    if (n < 2) return null;
    const mx = pts.reduce((a, p) => a + p[0], 0) / n,
      my = pts.reduce((a, p) => a + p[1], 0) / n;
    let sxx = 0,
      sxy = 0,
      sst = 0;
    pts.forEach(([x, y]) => {
      sxx += (x - mx) ** 2;
      sxy += (x - mx) * (y - my);
      sst += (y - my) ** 2;
    });
    if (sxx === 0) return null;
    const b = sxy / sxx,
      a = my - b * mx;
    let sse = 0;
    pts.forEach(([x, y]) => {
      sse += (y - (a + b * x)) ** 2;
    });
    const r2 = sst === 0 ? (sse < 1e-12 ? 1 : 0) : Math.max(0, 1 - sse / sst),
      se = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
    return { a, b, r2, n, mx, sxx, se, at: x => a + b * x, band: x => se * Math.sqrt(1 + 1 / n + (x - mx) ** 2 / sxx) };
  }
  let tsRange = (() => {
    try {
      return localStorage.getItem(STORE + '-tsr') || 'all';
    } catch (e) {
      return 'all';
    }
  })();
  function testTrend(range) {
    const all = scoredTests(),
      today = todayISO();
    if (!all.length) return { n: 0, pts: [], reg: null };
    const from = (range || tsRange) === 'all' ? all[0].date : addDays(today, -SRDAYS[range || tsRange] + 1);
    const base = all[0].date,
      list = all.filter(x => x.date >= from),
      pts = list.map(x => [diffDays(base, x.date), x.score]);
    const reg = pts.length >= 4 ? linReg(pts) : null;
    let cross = null,
      exam = null;
    /* scores saturate: after the last test the projection slows down — the extra gain tends to (points per day × TAU),
     i.e. about two more weeks of your current pace — and it never leaves 0–100% */
    let proj = null;
    if (reg) {
      const xE = diffDays(base, state.deadline),
        xb = pts[pts.length - 1][0],
        yb = reg.at(xb),
        TAU = 14;
      proj = x => Math.max(0, Math.min(100, x <= xb ? reg.at(x) : yb + reg.b * TAU * (1 - Math.exp(-(x - xb) / TAU))));
      exam = proj(Math.max(xE, xb));
      if (yb >= GOAL) cross = 'already';
      else if (reg.b > 0 && GOAL - yb < reg.b * TAU) {
        const xc = xb - TAU * Math.log(1 - (GOAL - yb) / (reg.b * TAU));
        cross = xc <= xE ? addDays(base, Math.ceil(xc)) : 'late';
      } else cross = 'never';
    }
    return { n: pts.length, pts, reg, base, from, cross, exam, list, proj };
  }
  function calibration() {
    const pts = scoredTests().map(x => [forecastMu(x.date).mu * 100, x.score]);
    const reg = pts.length >= 2 ? linReg(pts) : null,
      bias = pts.length ? pts.reduce((a, p) => a + (p[1] - p[0]), 0) / pts.length : null;
    const l5 = pts.slice(-5),
      biasRecent = l5.length ? l5.reduce((a, p) => a + (p[1] - p[0]), 0) / l5.length : null;
    const usable = !!reg && pts.length >= 5 && reg.r2 >= 0.3;
    return {
      pts,
      reg,
      bias,
      biasRecent,
      nRecent: l5.length,
      usable,
      calibrated: usable ? Math.max(0, Math.min(100, reg.at(forecastMu().mu * 100))) : null,
    };
  }
  function testWhy(asOf, st) {
    st = st || settings();
    asOf = asOf || todayISO();
    const every = +st.testEvery || 0;
    if (!every) return { due: false, every: 0, next: null };
    const prev = (state.tests || [])
        .filter(x => x.date < asOf)
        .map(x => x.date)
        .sort(),
      last = prev[prev.length - 1];
    const daysLeft = diffDays(asOf, state.deadline),
      ev = daysLeft >= 0 && daysLeft <= 10 ? Math.min(every, 2) : every;
    const since = last ? diffDays(last, asOf) : Infinity;
    const acts = [...state.events.map(e => e.date), ...(state.tests || []).map(x => x.date)]
        .filter(d => d < asOf)
        .sort(),
      lastAct = acts[acts.length - 1],
      idle = lastAct ? diffDays(lastAct, asOf) : 0;
    const ms = srAll(asOf, true),
      avgR = wavg(ms),
      nDue = ms.filter(m => m.reps.length && m.over >= 0).length;
    let reason = null;
    if (!last || since >= ev) reason = ev < every ? 'testFinal' : 'test';
    else if (idle >= 3 && since >= 2) reason = 'testIdle';
    else if (((avgR != null && avgR < 0.75) || nDue >= 5) && since >= 2) reason = 'testRecall';
    return {
      due: !!reason,
      reason,
      every: ev,
      since,
      overdue: last ? since - ev : 0,
      next: reason ? asOf : addDays(last, ev),
    };
  }
  expose({
    tsRange: [
      () => tsRange,
      x => {
        tsRange = x;
      },
    ],
  });
  return { TEST_Q, scoredTests, testsSD, blended, linReg, testTrend, calibration, testWhy };
})();
const { TEST_Q, scoredTests, testsSD, blended, linReg, testTrend, calibration, testWhy } = PracticeTestModel;
