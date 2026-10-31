/* ===== module PracticeTestsView (js/views/practice-tests.js) =====
   public: scCol, testKpis, renderTsStrip, renderTestsPage, setStat, renderStatTests, renderCal
   shared state (getter/setter): statMode */
const PracticeTestsView = (() => {
  /* ===== practice tests UI ===== */
  const scCol = v => (v == null ? '#8590a2' : v >= 85 ? COLORS[3] : v >= 70 ? COLORS[2] : '#ff6b5e');
  let tsClipN = 0;
  function tsSVG(w, h, big) {
    const tr = testTrend(),
      all = scoredTests();
    if (!all.length) return `<div class="empty">${esc(t('tsNone'))}</div>`;
    const base = tr.base || all[0].date,
      x0 = diffDays(base, tr.from || base),
      today = diffDays(base, todayISO()),
      xE = diffDays(base, state.deadline);
    const x1 = Math.max(today + 1, big && xE > today && xE - today <= 60 ? xE : today + 1),
      pts = tr.pts;
    const lo = big
      ? 0
      : Math.max(
          0,
          Math.min(60, Math.floor((Math.min(...pts.map(p => p[1]), 70) - 8) / 10) * 10)
        ); /* big charts: 0–100%; the tiny dashboard sparkline zooms */
    const L = big ? 36 : 4,
      R = big ? 10 : 4,
      T = big ? 16 : 4,
      B = big ? 22 : 4,
      pw = w - L - R,
      ph = h - T - B,
      X = x => L + ((x - x0) / Math.max(1, x1 - x0)) * pw,
      Y = v => T + (1 - (v - lo) / (100 - lo)) * ph,
      f = n => n.toFixed(1);
    let g = '';
    if (big) {
      [lo, (lo + 100) / 2, 100].forEach(
        v =>
          (g += `<line class="cg" x1="${L}" x2="${w - R}" y1="${f(Y(v))}" y2="${f(Y(v))}"/><text class="cy" x="${L - 5}" y="${f(Y(v) + 3.5)}" text-anchor="end">${Math.round(v)}%</text>`)
      );
      const df = new Intl.DateTimeFormat(LOCALE[lang], { month: 'short', day: 'numeric' }),
        span = x1 - x0,
        stp = span <= 10 ? 1 : span <= 24 ? 3 : span <= 60 ? 7 : span <= 130 ? 14 : 30;
      let lx = -99;
      for (let x = x0; x <= x1; x += stp) {
        const px = X(x);
        if (px - lx > 40 && px < w - 14) {
          g += `<text class="cx" x="${f(px)}" y="${h - 6}" text-anchor="middle">${esc(df.format(parse(addDays(base, x))))}</text>`;
          lx = px;
        }
      }
      g += `<line class="ctoday" x1="${f(X(today))}" x2="${f(X(today))}" y1="${T}" y2="${T + ph}"/>`;
      if (xE <= x1)
        g += `<line class="cexam" x1="${f(X(xE))}" x2="${f(X(xE))}" y1="${T}" y2="${T + ph}"/><text class="cx" x="${f(X(xE) - 3)}" y="${T - 3}" text-anchor="end" style="fill:var(--exam)">${esc(t('examShort'))}</text>`;
    }
    g += `<line class="c70" x1="${L}" x2="${w - R}" y1="${f(Y(70))}" y2="${f(Y(70))}"/><line class="c85" x1="${L}" x2="${w - R}" y1="${f(Y(85))}" y2="${f(Y(85))}"/>`;
    if (tr.reg && big) {
      const r = tr.reg,
        xa = pts[0][0],
        xb = pts[pts.length - 1][0],
        up = [],
        dn = [],
        cid = 'tsclip' + ++tsClipN,
        N = 40;
      const ctr = x => tr.proj(x);
      for (let k = 0; k <= N; k++) {
        const x = xa + ((x1 - xa) * k) / N,
          v = ctr(x),
          e = r.band(x);
        up.push([X(x), Y(v + e)]);
        dn.push([X(x), Y(v - e)]);
      }
      g += `<clipPath id="${cid}"><rect x="${L}" y="${T}" width="${pw}" height="${ph}"/></clipPath><path class="s-band" clip-path="url(#${cid})" d="M${up.map(p => f(p[0]) + ' ' + f(p[1])).join('L')}L${dn
        .reverse()
        .map(p => f(p[0]) + ' ' + f(p[1]))
        .join('L')}Z"/>`;
      g += `<path class="s-reg" data-hs="${esc(t('lgTrend'))}" d="M${f(X(xa))} ${f(Y(r.at(xa)))}L${f(X(xb))} ${f(Y(r.at(xb)))}"/><path class="s-regp" data-hs="${esc(t('lgTrendP'))}" d="M${Array.from(
        { length: 21 },
        (_, k) => {
          const x = xb + ((x1 - xb) * k) / 20;
          return f(X(x)) + ' ' + f(Y(Math.max(lo, ctr(x))));
        }
      ).join('L')}"/>`;
    }
    if (pts.length > 1)
      g += `<path fill="none" stroke="${big ? '#8f99a6' : '#ffd08a'}" stroke-width="${big ? 1.4 : 2}"${big ? ` data-hs="${esc(t('lgScore'))}" data-hdisc="1"` : ''} d="${pts.map((p, k) => (k ? 'L' : 'M') + f(X(p[0])) + ' ' + f(Y(p[1]))).join('')}"/>`;
    const df2 = new Intl.DateTimeFormat(LOCALE[lang], { month: 'short', day: 'numeric' });
    pts.forEach((p, k) => {
      g += `<circle cx="${f(X(p[0]))}" cy="${f(Y(p[1]))}" r="${big ? 4.5 : 3.4}" fill="${scCol(p[1])}" stroke="#16191d" stroke-width="1.5"><title>${esc(df2.format(parse(tr.list[k].date)))}: ${p[1]}%</title></circle>`;
      if (big && pts.length <= 14)
        g += `<text class="vval" x="${f(X(p[0]))}" y="${f(Y(p[1]) - 9)}" text-anchor="middle">${p[1]}</text>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="${big ? 'xMidYMid meet' : 'none'}" role="img" aria-label="${esc(t('tabTestsLong'))}"${big ? hv({ mode: 'line', l: L, t: T, pw, ph, x0, x1, y0: lo, y1: 100, fmt: 'pct100', base, snap: 'pts' }) : ''}>${g}</svg>`;
  }
  function trendText() {
    const tr = testTrend(),
      need = 4 - tr.n;
    if (tr.n < 4) return `<span class="few">${esc(t('tsFew').replace('{n}', Math.max(1, need)))}</span>`;
    const r = tr.reg,
      wk = r.b * 7,
      cons = r.r2 >= 0.6 ? 'tsCons' : r.r2 >= 0.3 ? 'tsMod' : 'tsNoisy',
      df = new Intl.DateTimeFormat(LOCALE[lang], { month: 'short', day: 'numeric' });
    const cross =
      tr.cross === 'already'
        ? t('tsAlready')
        : tr.cross === 'never' || tr.cross === 'late'
          ? t('tsNever')
          : t('tsCross').replace('{d}', df.format(parse(tr.cross)));
    return `<b>${esc(t('perWeek').replace('{v}', (wk >= 0 ? '+' : '') + wk.toFixed(1)))}</b> · <span title="R² ${r.r2.toFixed(2)} — ${esc(t('r2Tip'))}">${esc(t(cons))}</span> · ${esc(cross)} · ${esc(t('tsExam').replace('{s}', Math.round(tr.exam)))}`;
  }
  function nextText() {
    const w = testWhy();
    if (!w.every) return t('tsOff');
    if (w.due) return t('tsNextToday') + ' · ' + t('reason_' + w.reason);
    return t('tsNextIn').replace('{n}', diffDays(todayISO(), w.next));
  }
  function testKpis() {
    const sc = scoredTests(),
      last = sc[sc.length - 1],
      l3 = sc.slice(-3);
    return {
      last: last ? last.score : null,
      best: sc.length ? Math.max(...sc.map(x => x.score)) : null,
      avg3: l3.length ? Math.round(l3.reduce((a, x) => a + x.score, 0) / l3.length) : null,
      n70: sc.filter(x => x.score >= 70).length,
      n85: sc.filter(x => x.score >= 85).length,
      n: sc.length,
    };
  }
  const pctOr = v => (v == null ? '—' : v + '%');
  function renderTsStrip() {
    if (!$('#tsCard')) return;
    const k = testKpis();
    $('#tsLast').textContent = pctOr(k.last);
    $('#tsLast').style.color = k.last == null ? '' : scCol(k.last);
    $('#tsBestMini').innerHTML = k.best == null ? '' : `· ${esc(t('tsBest').toLowerCase())} <b>${pctOr(k.best)}</b>`;
    $('#tsStripKpis').innerHTML = `${esc(t('tsAvg3'))} <b>${pctOr(k.avg3)}</b>`;
    const sp = $('#tsSpark');
    sp.innerHTML = k.n
      ? tsSVG(Math.max(100, Math.round(sp.clientWidth || 220)), Math.max(30, Math.round(sp.clientHeight || 40)), false)
      : `<span class="muted" style="font-size:12px">${esc(t('tsNone'))}</span>`;
    const nx = $('#tsStripNext'),
      w = testWhy();
    nx.textContent = !w.every
      ? t('tsOffShort')
      : w.due
        ? t('tsNextShortToday')
        : t('tsNextShortIn').replace('{n}', diffDays(todayISO(), w.next));
    nx.title = nextText();
    if (!$('#tsQuickBg').hidden) renderTsQuick();
  }
  function renderTsQuick() {
    const k = testKpis();
    $('#tsQKpis').innerHTML = [
      ['tsLastLbl', pctOr(k.last), k.last],
      ['tsBest', pctOr(k.best), k.best],
      ['tsAvg3', pctOr(k.avg3), k.avg3],
      ['ts70', k.n70, null],
      ['ts85', k.n85, null],
    ]
      .map(
        ([l, v, c]) =>
          `<div><b class="${c == null ? '' : c >= 85 ? 'good' : c >= 70 ? 'mid' : 'bad'}">${v}</b><span>${esc(t(l))}</span></div>`
      )
      .join('');
    $('#tsQTrend').innerHTML = trendText();
    $('#tsQNext').textContent = nextText();
    const box = $('#tsQChart');
    box.innerHTML = tsSVG(Math.round(box.clientWidth || 600), phoneMQ.matches ? 200 : 240, true);
  }
  function openTsQuick() {
    $('#tsQuickBg').hidden = false;
    renderTsQuick();
    $('#tsQuickClose').focus();
  }
  const closeTsQuick = () => {
    $('#tsQuickBg').hidden = true;
  };
  function paintTsRange() {
    document.querySelectorAll('[data-tsrr] button').forEach(b => b.classList.toggle('on', b.dataset.tsr === tsRange));
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-tsrr] button');
    if (!b) return;
    tsRange = b.dataset.tsr;
    try {
      localStorage.setItem(STORE + '-tsr', tsRange);
    } catch (x) {}
    if (!$('#viewTests').hidden) renderTestsPage();
    if (!$('#viewSR').hidden) renderStatTests();
  });
  function renderTestsPage() {
    paintTsRange();
    const k = testKpis();
    $('#tsKpis').innerHTML = [
      ['tsLastLbl', pctOr(k.last), k.last],
      ['tsBest', pctOr(k.best), k.best],
      ['tsAvg3', pctOr(k.avg3), k.avg3],
      ['ts70', k.n70, null],
      ['ts85', k.n85, null],
    ]
      .map(
        ([l, v, c]) =>
          `<div><b class="${c == null ? '' : c >= 85 ? 'good' : c >= 70 ? 'mid' : 'bad'}">${v}</b><span>${esc(t(l))}</span></div>`
      )
      .join('');
    $('#tsTrendTxt').innerHTML = trendText();
    $('#tsNext').textContent = nextText();
    {
      const st = (state.tests || []).filter(x => x.score == null && x.date < todayISO()).length,
        b = $('#tsStale');
      b.hidden = !st;
      b.textContent = st ? t('staleBar').replace('{n}', st) : '';
    }
    const box = $('#tsChart');
    box.innerHTML = tsSVG(Math.round(box.clientWidth || 900), phoneMQ.matches ? 220 : 280, true);
    $('#tsLegend').innerHTML = tsLegendHTML();
    const df = new Intl.DateTimeFormat(LOCALE[lang], {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      L = (state.tests || [])
        .map((x, k) => ({ x, k }))
        .sort((a, b) => b.x.date.localeCompare(a.x.date) || b.k - a.k)
        .map(o => o.x);
    $('#tsList').innerHTML = L.length
      ? L.map(
          x =>
            `<div class="tsrow" data-id="${x.id}"><span class="k" style="background:${scCol(x.score)}"></span><span class="d">${esc(df.format(parse(x.date)))}<span class="muted"> · ${TEST_Q} q</span></span><span class="sc" style="color:${scCol(x.score)}">${x.score != null ? x.score + '%' : esc(t('inProgress'))}</span>${x.score == null && x.date < todayISO() ? `<span class="stale">${esc(t('staleTest'))}</span>` : ''}<button type="button" data-edit="${x.id}">${esc(t('edit'))}</button><button type="button" data-delpt="${x.id}" aria-label="${esc(t('del'))}">×</button></div>`
        ).join('')
      : `<div class="muted">${esc(t('tsNone'))}</div>`;
  }
  const tsLegendHTML = () =>
    `<span><i style="border-color:#8f99a6"></i>${esc(t('lgScore'))}</span><span><i style="border-color:#ffd08a"></i>${esc(t('lgTrend'))}</span><span><i style="border-color:#ffd08a;border-top-style:dashed"></i>${esc(t('lgTrendP'))}</span><span><i style="border-color:#ffd08a55;border-top-width:6px"></i>${esc(t('lgBand'))}</span><span><i style="border-color:#c5ccd5;border-top-style:dashed"></i>${esc(t('fcPassLine'))}</span><span><i style="border-color:#4bce97;border-top-style:dashed"></i>${esc(t('fcGoalLine'))}</span>`;
  $('#tsList').addEventListener('click', e => {
    const d = e.target.closest('[data-delpt]'),
      ed = e.target.closest('[data-edit]');
    if (d) {
      const id = d.dataset.delpt;
      commit(() => {
        state.tests = state.tests.filter(x => x.id !== id);
      }, t('deleted'));
    } else if (ed) openPt(ed.dataset.edit);
  });
  $('#tsAdd').onclick = () => openPt();
  $('#tsOpen').onclick = () => {
    closeTsQuick();
    goView('tests');
  };
  $('#tsExpand').onclick = openTsQuick;
  $('#tsQuickClose').onclick = closeTsQuick;
  $('#tsQAdd').onclick = () => {
    closeTsQuick();
    openPt();
  };
  $('#tsQuickBg').addEventListener('pointerdown', e => {
    if (e.target.id === 'tsQuickBg') closeTsQuick();
  });
  /* capture phase: runs before the other dialogs close, so Escape only closes the top one */
  document.addEventListener(
    'keydown',
    e => {
      if (e.key === 'Escape' && !$('#tsQuickBg').hidden && $('#ptbg').hidden && $('#calBg').hidden) closeTsQuick();
    },
    true
  );
  $('#tsToStats').onclick = () => goView('sr', 'tests');

  /* Statistics: Bank | Practice tests */
  let statMode = 'bank';
  function setStat(m) {
    statMode = m;
    $('#statBank').hidden = m !== 'bank';
    $('#statTests').hidden = m !== 'tests';
    document.querySelectorAll('#statSeg button').forEach(b => b.classList.toggle('on', b.dataset.stat === m));
    if (m === 'tests') renderStatTests();
    else renderSRPage();
  }
  $('#statSeg').onclick = e => {
    const b = e.target.closest('[data-stat]');
    if (b) setStat(b.dataset.stat);
  };
  function renderStatTests() {
    paintTsRange();
    const B = blended(),
      pc = v => Math.round(v * 100) + '%';
    $('#ovKpis').innerHTML =
      `<div><b class="${fcCls(B.mu)}">${pc(B.mu)}</b><span>${esc(t('ovScore'))}</span></div><div><b class="${B.pass >= 0.8 ? 'good' : B.pass >= 0.5 ? 'mid' : 'bad'}">${pc(B.pass)}</b><span>${esc(t('fcPass'))}</span></div><div><b class="${B.goal >= 0.8 ? 'good' : B.goal >= 0.5 ? 'mid' : 'bad'}">${pc(B.goal)}</b><span>${esc(t('fcGoal'))}</span></div><div><b>${pc(B.model)}</b><span>${esc(t('ovModel'))}</span></div>`;
    $('#ovWeights').innerHTML = B.n
      ? esc(
          t('ovWeights')
            .replace('{t}', Math.round(B.testsAvg * 100))
            .replace('{n}', B.n)
            .replace('{w}', Math.round(B.w * 100))
            .replace('{m}', Math.round(B.model * 100))
            .replace('{mw}', Math.round((1 - B.w) * 100))
        )
      : `<span class="few">${esc(t('ovNoTests'))}</span>`;
    $('#tsTrendTxt2').innerHTML = trendText();
    const b2 = $('#tsChart2');
    const trendH = phoneMQ.matches ? 220 : 280;
    b2.innerHTML = tsSVG(Math.round(b2.clientWidth || 900), trendH, true);
    $('#tsLegend2').innerHTML = tsLegendHTML();
    requestAnimationFrame(() => fillTrendCard(b2, trendH));
    const sc = scoredTests(),
      st = distStats(sc);
    $('#distTxt').innerHTML = sc.length
      ? `${esc(t('distMean'))} <b>${st.mean.toFixed(1)}%</b> · ${esc(t('distSd'))} <b>${esc(t('ptsUnit').replace('{v}', st.sd.toFixed(1)))}</b> · ${esc(t('distRange'))} <b>${st.min}–${st.max}%</b> · n=${sc.length}`
      : '';
    const dc = $('#distChart');
    dc.innerHTML = histSVG(sc, Math.round(dc.clientWidth || 900), phoneMQ.matches ? 200 : 230);
    $('#distLegend').innerHTML = sc.length
      ? `<span><i style="border-color:#e8ecf1"></i>${esc(t('distMean'))}</span><span><i style="border-color:#c5ccd5;border-top-style:dashed"></i>${esc(t('fcPassLine'))}</span><span><i style="border-color:#4bce97;border-top-style:dashed"></i>${esc(t('fcGoalLine'))}</span>`
      : '';
    const gaps = sc.slice(1).map((x, k) => diffDays(sc[k].date, x.date));
    $('#gapTxt').textContent = gaps.length
      ? t('gapTxt').replace('{d}', (gaps.reduce((a, x) => a + x, 0) / gaps.length).toFixed(1))
      : t('tsFew').replace('{n}', 2);
    $('#regFormula').textContent = t('regFormula');
    renderFcFull();
  }
  /* side by side with the histogram, the trend chart grows into the card's empty space so the card has no gap below */
  function fillTrendCard(box, baseH) {
    const card = box.closest('section');
    if (!card || !card.offsetParent || window.innerWidth < 1100) return;
    const last = card.lastElementChild.getBoundingClientRect().bottom,
      pad = parseFloat(getComputedStyle(card).paddingBottom) || 0,
      free = Math.floor(card.getBoundingClientRect().bottom - pad - last);
    if (free > 4) box.innerHTML = tsSVG(Math.round(box.clientWidth || 900), baseH + free, true);
  }
  function renderCal() {
    const C = calibration();
    $('#calTxt').innerHTML =
      C.pts.length < 2
        ? `<span class="few">${esc(t('calFew').replace('{n}', C.pts.length))}</span>`
        : `<b>${esc(
            t('calRecent')
              .replace('{n}', C.nRecent)
              .replace('{b}', (C.biasRecent >= 0 ? '+' : '') + C.biasRecent.toFixed(1))
          )}</b> · ${esc(t('calBias').replace('{b}', (C.bias >= 0 ? '+' : '') + C.bias.toFixed(1)))} · <span class="muted">R² ${C.reg ? C.reg.r2.toFixed(2) : '—'} · n=${C.pts.length}</span>` +
          (C.usable
            ? ` · <b>${esc(t('calOk').replace('{c}', Math.round(C.calibrated)))}</b>`
            : C.pts.length < 5
              ? ` · <span class="few">${esc(t('calFew').replace('{n}', C.pts.length))}</span>`
              : ` · <span class="few">${esc(t('calBad'))}</span>`);
    const cb = $('#calChart'),
      cw = Math.min(600, Math.round(cb.clientWidth || 600));
    cb.innerHTML = calSVG(C, cw, Math.round(cw * 0.78));
  }
  expose({
    statMode: [
      () => statMode,
      x => {
        statMode = x;
      },
    ],
  });
  return { scCol, testKpis, renderTsStrip, renderTestsPage, setStat, renderStatTests, renderCal };
})();
const { scCol, testKpis, renderTsStrip, renderTestsPage, setStat, renderStatTests, renderCal } = PracticeTestsView;
