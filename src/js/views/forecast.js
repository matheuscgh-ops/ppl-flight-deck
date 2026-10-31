/* ===== module ForecastView (js/views/forecast.js) =====
   public: fcCls, renderFcMini, renderForecast */
const ForecastView = (() => {
  const fcCls = v => (v >= 0.85 ? 'good' : v >= 0.7 ? 'mid' : 'bad');
  function renderFcMini() {
    const f = blended();
    const b = $('#fcMiniBar');
    if (!b) return;
    $('#fcMiniVal').textContent = Math.round(f.mu * 100) + '%';
    b.style.width = Math.round(f.mu * 100) + '%';
    b.style.background = f.mu >= 0.85 ? COLORS[3] : f.mu >= 0.7 ? COLORS[2] : '#ff6b5e';
    $('#fcMiniSub').innerHTML = t('fcMiniSub')
      .replace('{p}', `<b>${Math.round(f.pass * 100)}%</b>`)
      .replace('{g}', `<b>${Math.round(f.goal * 100)}%</b>`);
  }
  function forecastSeries() {
    const today = todayISO(),
      first = [...state.events.map(e => e.date), ...(state.tests || []).map(x => x.date)].sort()[0] || today;
    let start = srRange === 'all' ? first : addDays(today, -SRDAYS[srRange] + 1);
    if (start < first && srRange !== 'all') start = start;
    const span = Math.max(1, diffDays(start, today)),
      step = span <= 45 ? 1 : span <= 120 ? 3 : 7,
      out = [];
    for (let x = 0; x <= span; x += step) {
      const d = addDays(start, x);
      out.push([x, forecast(d).mu]);
    }
    if (out[out.length - 1][0] !== span) out.push([span, forecast(today).mu]);
    return { start, span, pts: out };
  }
  function fcChartSVG(w, h) {
    const { start, span, pts } = forecastSeries(),
      ex = diffDays(start, state.deadline),
      x1 = Math.max(span + 1, Math.min(ex, span + 31)),
      exam = forecast(todayISO(), state.deadline).mu;
    const L = 36,
      R = 8,
      T = 14,
      B = 22,
      pw = w - L - R,
      ph = h - T - B,
      lo = 0; /* every percentage chart uses the full 0–100% scale */
    const X = x => L + (x / x1) * pw,
      Y = v => T + (1 - (v - lo) / (1 - lo)) * ph,
      f = n => n.toFixed(1);
    let g = '';
    [lo, (lo + 1) / 2, 1].forEach(
      v =>
        (g += `<line class="cg" x1="${L}" x2="${w - R}" y1="${f(Y(v))}" y2="${f(Y(v))}"/><text class="cy" x="${L - 5}" y="${f(Y(v) + 3.5)}" text-anchor="end">${Math.round(v * 100)}%</text>`)
    );
    g += `<line class="c70" x1="${L}" x2="${w - R}" y1="${f(Y(0.7))}" y2="${f(Y(0.7))}"/><line class="c85" x1="${L}" x2="${w - R}" y1="${f(Y(0.85))}" y2="${f(Y(0.85))}"/>`;
    const df = new Intl.DateTimeFormat(LOCALE[lang], { month: 'short', day: 'numeric' }),
      stp = x1 <= 10 ? 1 : x1 <= 24 ? 3 : x1 <= 60 ? 7 : x1 <= 130 ? 14 : 30;
    let lx = -99;
    for (let x = 0; x <= x1; x += stp) {
      const px = X(x);
      if (px - lx > 36 && px < w - 14) {
        g += `<text class="cx" x="${f(px)}" y="${h - 6}" text-anchor="middle">${esc(df.format(parse(addDays(start, x))))}</text>`;
        lx = px;
      }
    }
    g += `<line class="ctoday" x1="${f(X(span))}" x2="${f(X(span))}" y1="${T}" y2="${T + ph}"/><text class="cx" x="${f(X(span) + 3)}" y="${T - 3}">${esc(t('todayMark'))}</text>`;
    if (ex <= x1) {
      g += `<line class="cexam" x1="${f(X(ex))}" x2="${f(X(ex))}" y1="${T}" y2="${T + ph}"/><text class="cx" x="${f(X(ex) - 3)}" y="${T - 3}" text-anchor="end" style="fill:var(--exam)">${esc(t('examShort'))}</text>`;
      g += `<path class="s-proj" style="stroke:#f5a524" data-hs="${esc(t('fcProj'))}" d="M${f(X(span))} ${f(Y(pts[pts.length - 1][1]))}L${f(X(ex))} ${f(Y(exam))}"/>`;
    }
    g += `<path class="s-fc" data-hs="${esc(t('fcLine'))}" d="${pts.map((p, k) => (k ? 'L' : 'M') + f(X(p[0])) + ' ' + f(Y(p[1]))).join('')}"/>`;
    pts.forEach(p => {
      if (pts.length <= 31)
        g += `<circle cx="${f(X(p[0]))}" cy="${f(Y(p[1]))}" r="2.6" fill="#f5a524"><title>${esc(df.format(parse(addDays(start, p[0]))))}: ${Math.round(p[1] * 100)}%</title></circle>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(t('fcTitle'))}"${hv({ mode: 'line', l: L, t: T, pw, ph, x0: 0, x1, y0: lo, y1: 1, fmt: 'pct', base: start })}>${g}</svg>`;
  }
  function renderForecast() {
    const f = forecast(),
      ex = forecast(todayISO(), state.deadline),
      pc = v => Math.round(v * 100) + '%';
    {
      const B = blended();
      $('#fcOverall').innerHTML =
        `${esc(t('fcTitle'))}: <b>${Math.round(B.mu * 100)}%</b> · ${esc(B.n ? t('bankOverall').replace('{n}', B.n) : t('ovNoTests'))} <button type="button" class="linkbtn" id="fcToTests">${esc(t('statTests'))} →</button>`;
      $('#fcToTests').onclick = () => setStat('tests');
    }
    $('#fcKpis').innerHTML =
      `<div><b class="${fcCls(f.mu)}">${pc(f.mu)}</b><span>${esc(t('fcToday'))}</span></div><div><b class="${f.pass >= 0.8 ? 'good' : f.pass >= 0.5 ? 'mid' : 'bad'}">${pc(f.pass)}</b><span>${esc(t('fcPass'))}</span></div><div><b class="${f.goal >= 0.8 ? 'good' : f.goal >= 0.5 ? 'mid' : 'bad'}">${pc(f.goal)}</b><span>${esc(t('fcGoal'))}</span></div><div><b class="${fcCls(ex.mu)}">${pc(ex.mu)}</b><span>${esc(t('fcExamDay'))}</span></div>`;
    const box = $('#fcChart');
    box.innerHTML = fcChartSVG(Math.round(box.clientWidth || 1000), phoneMQ.matches ? 200 : 190);
    $('#fcLegend').innerHTML =
      `<span><i style="border-color:#f5a524"></i>${esc(t('fcLine'))}</span><span><i style="border-color:#f5a524;border-top-style:dashed"></i>${esc(t('fcProj'))}</span><span><i style="border-color:#c5ccd5;border-top-style:dashed"></i>${esc(t('fcPassLine'))}</span><span><i style="border-color:#4bce97;border-top-style:dashed"></i>${esc(t('fcGoalLine'))}</span>`;
    const lost = f.parts
        .slice()
        .sort((a, b) => b.lost - a.lost)
        .slice(0, 8),
      mx = Math.max(0.01, ...lost.map(x => x.lost));
    $('#fcLost').innerHTML = lost
      .map(
        x =>
          `<div class="lostrow" data-q="${x.i}"><span class="n">${esc(TOPICS[x.i].name)}</span><span class="bar"><i style="width:${(x.lost / mx) * 100}%"></i></span><span class="v">−${x.lost.toFixed(1)} q</span><span class="pp">${x.known ? Math.round(x.p * 100) + '%' : '?'}</span></div>`
      )
      .join('');
    $('#fcFormula').innerHTML = `<pre>${esc(t('fcFormula'))}</pre>`;
  }
  return { fcCls, renderFcMini, renderForecast };
})();
const { fcCls, renderFcMini, renderForecast } = ForecastView;
