/* ===== module HistogramCalibration (js/views/histogram-calibration.js) =====
   public: distStats, histBins, histSVG, binomQuantile, renderFcFull, calSVG */
const HistogramCalibration = (() => {
  function distStats(sc) {
    const v = sc.map(x => x.score),
      n = v.length;
    if (!n) return { mean: 0, sd: 0, min: 0, max: 0 };
    const m = v.reduce((a, x) => a + x, 0) / n;
    return {
      mean: m,
      sd: n > 1 ? Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)) : 0,
      min: Math.min(...v),
      max: Math.max(...v),
    };
  }
  function histBins(sc) {
    const lo = Math.min(50, Math.floor(Math.min(100, ...sc.map(x => x.score)) / 5) * 5),
      bins = [];
    for (let a = lo; a < 100; a += 5)
      bins.push({
        a,
        z: a + 5,
        n: sc.filter(x => x.score >= a && (a + 5 === 100 ? x.score <= 100 : x.score < a + 5)).length,
      });
    return bins;
  }
  function histSVG(sc, w, h) {
    if (!sc.length) return `<div class="empty">${esc(t('tsNone'))}</div>`;
    const bins = histBins(sc),
      lo = bins[0].a,
      mx = Math.max(1, ...bins.map(b => b.n)),
      L = 30,
      R = 10,
      T = 14,
      B = 24,
      pw = w - L - R,
      ph = h - T - B;
    const X = v => L + ((v - lo) / (100 - lo)) * pw,
      Y = n => T + (1 - n / mx) * ph,
      f = n => n.toFixed(1),
      st = distStats(sc);
    let g = '';
    const step = mx <= 5 ? 1 : Math.ceil(mx / 5);
    for (let k = 0; k <= mx; k += step)
      g += `<line class="cg" x1="${L}" x2="${w - R}" y1="${f(Y(k))}" y2="${f(Y(k))}"/><text class="cy" x="${L - 6}" y="${f(Y(k) + 3.5)}" text-anchor="end">${k}</text>`;
    bins.forEach(b => {
      if (b.n)
        g += `<rect class="s-hbar" data-bin="${b.a}" data-n="${b.n}" data-hl="${b.a}–${b.z === 100 ? 100 : b.z - 1}%: ${esc(t('histN').replace('{n}', b.n))}" x="${f(X(b.a) + 1)}" y="${f(Y(b.n))}" width="${f(X(b.z) - X(b.a) - 2)}" height="${f(Y(0) - Y(b.n))}" rx="3" fill="${scCol(b.a)}"><title>${b.a}–${b.z === 100 ? 100 : b.z - 1}%: ${b.n}</title></rect>`;
      else
        g += `<rect data-bin="${b.a}" data-n="0" data-hl="${b.a}–${b.z === 100 ? 100 : b.z - 1}%: ${esc(t('histN').replace('{n}', 0))}" x="${f(X(b.a) + 1)}" y="${f(Y(0) - 1)}" width="${f(X(b.z) - X(b.a) - 2)}" height="1" fill="#2a3038"/>`;
    });
    for (let v = lo; v <= 100; v += 10)
      g += `<text class="cx" x="${f(Math.min(X(v), w - R - 12))}" y="${h - 6}" text-anchor="middle">${v}%</text>`;
    g += `<line class="c70" x1="${f(X(70))}" x2="${f(X(70))}" y1="${T}" y2="${T + ph}"/><line class="c85" x1="${f(X(GOAL))}" x2="${f(X(GOAL))}" y1="${T}" y2="${T + ph}"/>`;
    g += `<line class="s-mean" x1="${f(X(st.mean))}" x2="${f(X(st.mean))}" y1="${T - 6}" y2="${T + ph}"/>`;
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(t('distTitle'))}"${hv({ mode: 'bars', l: L, t: T, pw, ph })}>${g}</svg>`;
  }
  function openCal() {
    $('#calBg').hidden = false;
    renderCal();
    $('#calClose').focus();
  }
  const closeCal = () => {
    $('#calBg').hidden = true;
  };
  document.addEventListener('click', e => {
    if (e.target.closest('.callink')) openCal();
  });
  $('#calClose').onclick = closeCal;
  $('#calBg').addEventListener('pointerdown', e => {
    if (e.target.id === 'calBg') closeCal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#calBg').hidden) closeCal();
  });
  /* full exam-forecast card: scale 40–100% with pass/goal marks, model and test markers, chances and 90% range of correct answers */
  function binomQuantile(n, p, q) {
    let lc = 0,
      c = 0;
    for (let j = 0; j <= n; j++) {
      if (j > 0) lc += Math.log(n - j + 1) - Math.log(j);
      c +=
        p <= 0
          ? j === 0
            ? 1
            : 0
          : p >= 1
            ? j === n
              ? 1
              : 0
            : Math.exp(lc + j * Math.log(p) + (n - j) * Math.log(1 - p));
      if (c >= q - 1e-12) return j;
    }
    return n;
  }
  function renderFcFull() {
    const el = $('#fcFull');
    if (!el) return;
    const k = testKpis(),
      sc = scoredTests();
    if (!k.n) {
      el.innerHTML = `<div class="ffhead"><span class="label">${esc(t('ffTitle'))}</span></div><div class="muted">${esc(t('tsNone'))}</div>`;
      return;
    }
    const tr = testTrend('all'),
      a3 = k.avg3 / 100,
      sd3 = testsSD(null, Math.min(3, k.n)),
      pass = betaBinomTail(EXAM_Q, a3, sd3, PASS_N),
      goal = betaBinomTail(EXAM_Q, a3, sd3, GOAL_N),
      X = v => Math.max(0, Math.min(100, ((v - 40) / 60) * 100)),
      col = v => (v >= 0.8 ? 'good' : v >= 0.5 ? 'mid' : 'bad');
    const l5 = sc.slice(-5).map(x => x.score),
      m5 = l5.reduce((a, x) => a + x, 0) / l5.length,
      sd = l5.length > 1 ? Math.sqrt(l5.reduce((a, x) => a + (x - m5) ** 2, 0) / (l5.length - 1)) : 0;
    const marks = [
      ['ffLast', k.last, '#e8ecf1'],
      ['ffAvg3', k.avg3, '#ffd08a'],
    ];
    if (tr.reg) marks.push(['ffExam', Math.round(tr.exam), '#f5a524']);
    let bar = `<i style="width:${X(k.avg3)}%"></i><em style="left:${X(70)}%;background:#c5ccd5"></em><em style="left:${X(GOAL)}%;background:#4bce97"></em>`;
    [40, 55, 70, 85, 100].forEach(v => (bar += `<span class="ax" style="left:${X(v)}%">${v}%</span>`));
    marks.forEach(([l, v, c]) => {
      bar += `<s style="left:${X(v)}%;background:${c}" title="${esc(t(l))} ${v}%"></s>`;
    });
    const lg = marks
      .map(([l, v, c]) => `<span><s style="background:${c}"></s>${esc(t(l))} <b>${v}%</b></span>`)
      .join('');
    el.innerHTML = `<div class="ffhead"><span class="label">${esc(t('ffTitle'))}</span><b class="${fcCls(a3)}">${k.avg3}%</b><span class="muted">${esc(t('ffSub'))}</span></div>
    <div class="ffscale">${bar}</div>
    <div class="fflg">${lg}</div>
    <div class="ffk four"><div><b class="${col(pass)}">${Math.round(pass * 100)}%</b><span>${esc(t('fcPass'))}</span></div><div><b class="${col(goal)}">${Math.round(goal * 100)}%</b><span>${esc(t('fcGoal'))}</span></div><div><b>${k.n70}<small class="muted"> / ${k.n}</small></b><span>${esc(t('ffPassed'))}</span></div><div><b class="${sd <= 5 ? 'good' : sd <= 9 ? 'mid' : 'bad'}">± ${sd.toFixed(1)}</b><span>${esc(t('ffConsist').replace('{n}', l5.length))}</span></div></div>
    <div class="muted ffnote">${
      tr.reg
        ? esc(
            t('ffTrendNote')
              .replace('{e}', Math.round(tr.exam))
              .replace('{w}', (tr.reg.b * 7 >= 0 ? '+' : '') + (tr.reg.b * 7).toFixed(1))
          )
        : esc(t('tsFew').replace('{n}', Math.max(1, 4 - tr.n)))
    }</div>`;
  }
  function calSVG(C, w, h) {
    if (C.pts.length < 1) return `<div class="empty">${esc(t('tsNone'))}</div>`;
    const lo = 0,
      L = 40,
      R = 18,
      T = 12,
      B = 26,
      pw = w - L - R,
      ph = h - T - B;
    const X = v => L + ((v - lo) / (100 - lo)) * pw,
      Y = v => T + (1 - (v - lo) / (100 - lo)) * ph,
      f = n => n.toFixed(1);
    let g = '';
    [lo, (lo + 100) / 2, 100].forEach(
      v =>
        (g += `<line class="cg" x1="${L}" x2="${w - R}" y1="${f(Y(v))}" y2="${f(Y(v))}"/><text class="cy" x="${L - 5}" y="${f(Y(v) + 3.5)}" text-anchor="end">${Math.round(v)}%</text><text class="cx" x="${f(Math.min(X(v), w - R - 12))}" y="${h - 8}" text-anchor="middle">${Math.round(v)}%</text>`)
    );
    g += `<line class="s-diag" x1="${f(X(lo))}" y1="${f(Y(lo))}" x2="${f(X(100))}" y2="${f(Y(100))}"/>`;
    if (C.reg) {
      const xs = C.pts.map(p => p[0]),
        xa = Math.min(...xs),
        xb = Math.max(...xs),
        cl = v => Math.max(lo, Math.min(100, v));
      g += `<path class="s-reg" d="M${f(X(xa))} ${f(Y(cl(C.reg.at(xa))))}L${f(X(xb))} ${f(Y(cl(C.reg.at(xb))))}"/>`;
    }
    C.pts.forEach(
      p =>
        (g += `<circle cx="${f(X(p[0]))}" cy="${f(Y(p[1]))}" r="5" fill="${scCol(p[1])}" stroke="#16191d" stroke-width="1.5" data-hl="${esc(t('calPredicted'))} ${Math.round(p[0])}% · ${esc(t('calReal'))} ${p[1]}%"><title>${esc(t('calPredicted'))} ${Math.round(p[0])}% → ${esc(t('calReal'))} ${p[1]}%</title></circle>`)
    );
    g += `<text class="cx" x="${L + 6}" y="${T + 10}">${esc(t('calAxis'))}</text>`;
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(t('calTitle'))}"${hv({ mode: 'pts', l: L, t: T, pw, ph })}>${g}</svg>`;
  }
  return { distStats, histBins, histSVG, binomQuantile, renderFcFull, calSVG };
})();
const { distStats, histBins, histSVG, binomQuantile, renderFcFull, calSVG } = HistogramCalibration;
