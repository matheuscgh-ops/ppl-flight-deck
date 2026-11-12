/* ===== module Forecast (js/model/forecast.js) =====
   live value (getter): GOAL_N = right answers needed for your goal (85% → 51 of 60)
   public: EXAM_Q, PASS_N, betaBinomTail, binomTail, pRight, forecastMu, forecast */
const Forecast = (() => {
  /* ================= EXAM FORECAST (mechanical) =================
   p_i  = chance of answering a question of topic i right on that day
        = mastery_i × recall_i + 1/3 × (1 − recall_i)            (unknown mastery → 50%; 1/3 = guessing among 3 options)
          mastery and recall are ESTIMATES (see SpacedRepetition): the forecast is a model, not a measurement
   The FAA test draws 60 questions; each comes from topic i with probability w_i = its official share of the test
   (ACS area share split inside the area by bank size — see Config.examShare). The 9% of areas with no Sporty's topic
   (Basic Instrument Maneuvers, Postflight Procedures) is scored with the average of the mapped topics.
   μ    = Σ w_i · p_i + unmapped · (Σ w_i · p_i / Σ w_i)      expected score
   X    ~ Binomial(60, μ)                     number of right answers
   P(pass) = P(X ≥ 42) (70%),  P(goal) = P(X ≥ 51) (85%)
   The chances use a beta-binomial: μ itself is uncertain by ±sd points (the model's error against your practice tests).
   skip: imported tests whose topic results are left out (the blended forecast counts their overall score instead). */
  const EXAM_Q = 60,
    PASS_N = 42,
    _goalN = () => Math.ceil((EXAM_Q * GOAL) / 100 - 1e-9);
  expose({ GOAL_N: [_goalN, () => {}] });
  /* log-gamma (Lanczos) and the beta-binomial tail: P(X ≥ k) when the chance per question is itself uncertain
   (mean mu, standard deviation sdpp percentage points). With no uncertainty it is the plain binomial. */
  function lgamma(x) {
    const g = 7,
      c = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
        12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
      ];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1;
    let a = c[0];
    const t = x + g + 0.5;
    for (let i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function betaBinomTail(n, mu, sdpp, k) {
    if (!(sdpp > 0.05)) return binomTail(n, mu, k);
    const m = Math.min(0.999, Math.max(0.001, mu)),
      v = (sdpp / 100) ** 2,
      kap = Math.max(2, (m * (1 - m)) / v - 1),
      a = m * kap,
      b = (1 - m) * kap,
      lB = lgamma(a) + lgamma(b) - lgamma(a + b);
    let sum = 0;
    for (let j = Math.max(0, k); j <= n; j++)
      sum += Math.exp(
        lgamma(n + 1) - lgamma(j + 1) - lgamma(n - j + 1) + lgamma(j + a) + lgamma(n - j + b) - lgamma(n + a + b) - lB
      );
    return Math.max(0, Math.min(1, sum));
  }
  function binomTail(n, p, k) {
    if (p <= 0) return k <= 0 ? 1 : 0;
    if (p >= 1) return 1;
    let lc = 0,
      sum = 0;
    for (let j = 0; j <= n; j++) {
      if (j > 0) lc += Math.log(n - j + 1) - Math.log(j);
      if (j >= k) sum += Math.exp(lc + j * Math.log(p) + (n - j) * Math.log(1 - p));
    }
    return Math.min(1, sum);
  }
  /* chance of a right answer on topic i = score × recall + 1/3 × (1 − recall):
   right after a session it is your score; as you forget it falls toward guessing among 3 options (1/3), not to 0 */
  const GUESS = 1 / 3,
    MODEL_SD0 = 6;
  const pRight = (sc, R) => (sc == null ? 0.5 : Math.max(0, Math.min(1, (R * sc) / 100 + (1 - R) * GUESS)));
  function forecastMu(asOf, at, skip) {
    asOf = asOf || todayISO();
    at = at || asOf;
    let mu = 0;
    const parts = [];
    TOPICS.forEach((x, i) => {
      const m = srModel(i, asOf, false, skip),
        w = examShare(i).share,
        p = chanceAt(m, at);
      mu += w * p;
      parts.push({ i, w, p, known: !m.prior, lost: EXAM_Q * w * (1 - p) });
    });
    const mapped = EXAM_SHARE.mapped;
    mu += EXAM_SHARE.unmapped * (mu / mapped);
    return { mu, parts, unmapped: EXAM_SHARE.unmapped };
  }
  /* uncertainty of the model (percentage points): its typical error against your last 5 practice tests
   (root-mean-square, 4–12), or 6 until there are 3 tests */
  let _msd = null;
  function modelSD() {
    const tests = scoredTests().slice(-5),
      key =
        todayISO() +
        '|' +
        JSON.stringify(tests) +
        '|' +
        state.events.length +
        '|' +
        (state.events.at(-1) || {}).id +
        '|' +
        (state.exams || []).length +
        '|' +
        state.scores.join();
    if (_msd && _msd.k === key) return _msd.v;
    const r = tests.map(x => x.score - forecastMu(x.date, null, x.exam ? new Set([x.exam]) : null).mu * 100);
    const v =
      r.length >= 3 ? Math.max(4, Math.min(12, Math.sqrt(r.reduce((a, x) => a + x * x, 0) / r.length))) : MODEL_SD0;
    _msd = { k: key, v };
    return v;
  }
  function forecast(asOf, at, skip) {
    const f = forecastMu(asOf, at, skip),
      sd = modelSD();
    return { ...f, sd, pass: betaBinomTail(EXAM_Q, f.mu, sd, PASS_N), goal: betaBinomTail(EXAM_Q, f.mu, sd, GOAL_N) };
  }
  return { EXAM_Q, PASS_N, betaBinomTail, binomTail, pRight, forecastMu, forecast };
})();
const { EXAM_Q, PASS_N, betaBinomTail, binomTail, pRight, forecastMu, forecast } = Forecast;
