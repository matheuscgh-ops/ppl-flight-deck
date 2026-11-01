/* ===== module Charts (js/ui/charts.js) =====
   public: dueText, pct, wavg, hv, SRDAYS, setSrRange, paintSrRange, topicChart, avgChart, legendHTML
   shared state (getter/setter): srRange, srCardRange */
const Charts = (() => {
  function dueText(m) {
    if (!m.reps.length) return [t('noHist'), 'over'];
    if (m.over > 0) return [tf('dueAgo', m.over), 'over'];
    if (m.over === 0) return [t('dueToday'), 'now'];
    return [tf('dueIn', -m.over), ''];
  }
  const rcls = R => (R == null ? 'sc-none' : R >= 0.9 ? 'sc-good' : R >= 0.8 ? 'sc-mid' : 'sc-low');
  const pct = R => (R == null ? '—' : Math.round(R * 100) + '%');
  function wavg(ms) {
    let a = 0,
      b = 0;
    ms.forEach(m => {
      if (m.R != null) {
        a += TOPICS[m.i].q * m.R;
        b += TOPICS[m.i].q;
      }
    });
    return b ? a / b : null;
  }

  /* hover metadata written on a chart's <svg>: the hover engine reads the scales from it (data-h-*) */
  const hv = o =>
    Object.entries(o)
      .map(([k, v]) => ` data-h${k}="${esc(String(v))}"`)
      .join('');
  function chartSVG(o) {
    const { w, h, x0, x1, series, ticks = [], todayX, examX } = o;
    const L = 36,
      R = 8,
      T = 14,
      B = 22,
      pw = w - L - R,
      ph = h - T - B;
    let lo = 1;
    series.forEach(s =>
      s.pts.forEach(p => {
        lo = Math.min(lo, p[1]);
      })
    );
    const ymin = 0; /* full 0–100% scale, like every percentage chart */
    const X = x => L + ((x - x0) / Math.max(1e-6, x1 - x0)) * pw,
      Y = v => T + (1 - (v - ymin) / (1 - ymin)) * ph;
    const f = n => n.toFixed(1);
    let g = '';
    [ymin, (ymin + 1) / 2, 1].forEach(
      v =>
        (g += `<line class="cg" x1="${L}" x2="${w - R}" y1="${f(Y(v))}" y2="${f(Y(v))}"/><text class="cy" x="${L - 5}" y="${f(Y(v) + 3.5)}" text-anchor="end">${Math.round(v * 100)}%</text>`)
    );
    g += `<line class="cth" x1="${L}" x2="${w - R}" y1="${f(Y(pref('reviewAt')))}" y2="${f(Y(pref('reviewAt')))}"/>`;
    let lastLx = -99;
    ticks.forEach(tk => {
      const x = X(tk.x);
      if (tk.line) g += `<line class="crep" x1="${f(x)}" x2="${f(x)}" y1="${T}" y2="${T + ph}"/>`;
      if (x - lastLx > 36 && x < w - 14) {
        g += `<text class="cx" x="${f(x)}" y="${h - 6}" text-anchor="middle">${esc(tk.label)}</text>`;
        lastLx = x;
      }
    });
    if (examX != null && examX >= x0 && examX <= x1) {
      const x = X(examX);
      g += `<line class="cexam" x1="${f(x)}" x2="${f(x)}" y1="${T}" y2="${T + ph}"/><text class="cx" x="${f(x - 3)}" y="${T - 3}" text-anchor="end" style="fill:var(--exam)">${esc(t('examShort'))}</text>`;
    }
    if (todayX != null && todayX >= x0 && todayX <= x1) {
      const x = X(todayX);
      g += `<line class="ctoday" x1="${f(x)}" x2="${f(x)}" y1="${T}" y2="${T + ph}"/><text class="cx" x="${f(x + 3)}" y="${T - 3}">${esc(t('todayMark'))}</text>`;
    }
    const HS = { 's-actual': 'lgRecall', 's-proj': 'lgProj', 's-examline': 'lgExam' };
    series.forEach(sr => {
      if (sr.pts.length > 1)
        g += `<path class="${sr.cls}"${HS[sr.cls] ? ` data-hs="${esc(t(HS[sr.cls]))}"` : ''} d="${sr.pts.map((p, k) => (k ? 'L' : 'M') + f(X(p[0])) + ' ' + f(Y(p[1]))).join('')}"/>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(t('tabSR'))}"${o.base ? hv({ mode: 'line', l: L, t: T, pw, ph, x0, x1, y0: ymin, y1: 1, fmt: 'pct', base: o.base, snap: 'fluid' }) : ''}>${g}</svg>`;
  }
  let srRange = (() => {
    try {
      return localStorage.getItem(STORE + '-srr') || '1m';
    } catch (e) {
      return '1m';
    }
  })();
  /* one interval for all the small per-topic charts in Statistics (separate from the two main charts) */
  let srCardRange = (() => {
    try {
      return localStorage.getItem(STORE + '-srcr') || '1m';
    } catch (e) {
      return '1m';
    }
  })();
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-srcr] button');
    if (!b) return;
    srCardRange = b.dataset.scr;
    try {
      localStorage.setItem(STORE + '-srcr', srCardRange);
    } catch (x) {}
    renderSRPage();
  });
  const SRDAYS = { '3d': 3, '7d': 7, '2w': 14, '1m': 30, '3m': 90, '6m': 182, '1y': 365, all: Infinity };
  function setSrRange(r) {
    srRange = r;
    try {
      localStorage.setItem(STORE + '-srr', r);
    } catch (e) {}
    renderSRPanel();
    if (!$('#viewSR').hidden) renderSRPage();
  }
  function paintSrRange() {
    document.querySelectorAll('[data-srr] button').forEach(b => b.classList.toggle('on', b.dataset.sr === srRange));
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-srr] button');
    if (b) setSrRange(b.dataset.sr);
  });
  function topicChart(m, w, h, range) {
    const o = m.reps[0].date,
      tN = diffDays(o, todayISO()),
      x1 = tN + 14,
      ex = diffDays(o, state.deadline);
    const actual = [],
      proj = [],
      ghosts = [],
      exam = [];
    m.reps.forEach((r, k) => {
      const t0 = diffDays(o, r.date),
        tEnd = k + 1 < m.reps.length ? diffDays(o, m.reps[k + 1].date) : x1;
      for (let x = t0; ; x = Math.min(x + 0.25, tEnd)) {
        const p = [x, recall(x - t0, r.S)];
        if (x <= tN) actual.push(p);
        if (x >= tN) proj.push(p);
        if (x >= tEnd) break;
      }
      if (k + 1 < m.reps.length) {
        const gs = [];
        for (let x = tEnd; ; x = Math.min(x + 0.5, x1)) {
          gs.push([x, recall(x - t0, r.S)]);
          if (x >= x1) break;
        }
        ghosts.push({ cls: 's-ghost', pts: gs });
      }
      if (ex > t0) exam.push([t0, recall(ex - t0, r.S)]);
    });
    if (exam.length && ex > tN) exam.push([tN, exam[exam.length - 1][1]]);
    const ticks = m.reps.map(r => {
      const x = diffDays(o, r.date);
      return { x, line: true, label: tf('dayN', x) };
    });
    const x0 = Math.max(-0.5, tN - SRDAYS[range || srRange]),
      clip = a => a.filter(p => p[0] >= x0);
    const series = [
      ...ghosts,
      { cls: 's-examline', pts: exam },
      { cls: 's-proj', pts: proj },
      { cls: 's-actual', pts: actual },
    ].map(sr => ({ ...sr, pts: clip(sr.pts) }));
    return chartSVG({ w, h, x0, x1, todayX: tN, examX: ex, ticks: ticks.filter(tk => tk.x >= x0), series, base: o });
  }
  function avgChart(ms, w, h) {
    const live = ms.filter(m => m.reps.length);
    if (!live.length) return `<div class="empty">${esc(t('noHistLong'))}</div>`;
    const today = todayISO(),
      minO = srRange === 'all' ? '0000-00-00' : addDays(today, -SRDAYS[srRange]);
    let o = live.map(m => m.reps[0].date).sort()[0];
    if (o < minO) o = minO;
    const tN = diffDays(o, today),
      x1 = tN + 14,
      ex = diffDays(o, state.deadline);
    const tp = live.map(m => ({ q: TOPICS[m.i].q, r: m.reps.map(r => ({ x: diffDays(o, r.date), S: r.S })) }));
    const at = (fn, x) => {
      let a = 0,
        b = 0;
      tp.forEach(tq => {
        let last = null;
        for (const r of tq.r) {
          if (r.x <= x) last = r;
          else break;
        }
        if (last) {
          a += tq.q * fn(last, x);
          b += tq.q;
        }
      });
      return b ? a / b : null;
    };
    const act = [],
      proj = [],
      exam = [];
    for (let x = 0; x <= x1; x += 0.25) {
      const v = at((r, xx) => recall(xx - r.x, r.S), x);
      if (v == null) continue;
      if (x <= tN) act.push([x, v]);
      if (x >= tN) proj.push([x, v]);
      if (ex > x && x <= tN && x % 1 === 0) exam.push([x, at(r => recall(ex - r.x, r.S), x)]);
    }
    const df = new Intl.DateTimeFormat(LOCALE[lang], { month: 'short', day: 'numeric' }),
      ticks = [];
    const stp = x1 <= 24 ? 2 : x1 <= 60 ? 7 : x1 <= 130 ? 14 : 30;
    for (let x = 0; x <= x1; x += stp) ticks.push({ x, line: true, label: df.format(parse(addDays(o, x))) });
    return chartSVG({
      w,
      h,
      x0: 0,
      x1,
      todayX: tN,
      examX: ex,
      ticks,
      series: [
        { cls: 's-examline', pts: exam },
        { cls: 's-proj', pts: proj },
        { cls: 's-actual', pts: act },
      ],
      base: o,
    });
  }
  function legendHTML(withGhost) {
    return `<span><i style="border-color:#579dff"></i>${esc(t('lgRecall'))}</span><span><i style="border-color:#579dff;border-top-style:dashed"></i>${esc(t('lgProj'))}</span>${withGhost ? `<span><i style="border-color:#4bce97;border-top-style:dashed"></i>${esc(t('lgGhost'))}</span>` : ''}<span><i style="border-color:#eef1f4;border-top-width:3px"></i>${esc(t('lgExam'))}</span><span><i style="border-color:#f5a524;border-top-style:dotted"></i>${esc(t('lgThresh'))}</span>`;
  }

  /* side panel: average by default, a card's own curve while hovering it */
  expose({
    srRange: [
      () => srRange,
      x => {
        srRange = x;
      },
    ],
    srCardRange: [
      () => srCardRange,
      x => {
        srCardRange = x;
      },
    ],
  });
  return { dueText, pct, wavg, hv, SRDAYS, setSrRange, paintSrRange, topicChart, avgChart, legendHTML };
})();
const { dueText, pct, wavg, hv, SRDAYS, setSrRange, paintSrRange, topicChart, avgChart, legendHTML } = Charts;
