/* ===== module ChartHover (js/ui/chart-hover.js) =====
   public: HOVER_OK, ctip */
const ChartHover = (() => {
  /* ===== chart hover: a dashed vertical line, a dot on every line and the values at that point =====
   line: x is snapped to whole days (or to the data point), values read off the drawn lines; bars / pts: the bar or point under the cursor */
  const HOVER_OK = matchMedia('(hover:hover) and (pointer:fine)');
  const ctip = (() => {
    const d = document.createElement('div');
    d.className = 'ctip';
    d.hidden = true;
    document.body.appendChild(d);
    return d;
  })();
  const pathPts = el =>
    (el._hp ??= [...el.getAttribute('d').matchAll(/[ML]\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)].map(m => [+m[1], +m[2]]));
  const svgPt = (svg, e) => {
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const m = svg.getScreenCTM();
    return m ? p.matrixTransform(m.inverse()) : p;
  };
  function hoverClear(svg) {
    (svg || document).querySelectorAll('.hov').forEach(x => x.remove());
    document.querySelectorAll('.hovon').forEach(x => x.classList.remove('hovon'));
    ctip.hidden = true;
  }
  function hoverFmt(v, fmtk) {
    return fmtk === 'pct'
      ? Math.round(v * 100) + '%'
      : fmtk === 'pct100'
        ? Math.round(v) + '%'
        : fmtk === 'q'
          ? fmt(Math.round(v)) + ' q'
          : String(Math.round(v));
  }
  function hoverShow(svg, e) {
    const d = svg.dataset,
      mode = d.hmode,
      P = svgPt(svg, e),
      L = +d.hl,
      T = +d.ht,
      pw = +d.hpw,
      ph = +d.hph,
      ns = 'http://www.w3.org/2000/svg';
    svg.querySelectorAll('title').forEach(x => x.remove());
    hoverClear();
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'hov');
    const add = (tag, a) => {
      const el = document.createElementNS(ns, tag);
      Object.entries(a).forEach(([k, v]) => el.setAttribute(k, v));
      g.appendChild(el);
      return el;
    };
    let html = '';
    if (mode === 'bars' || mode === 'pts') {
      let best = null,
        bd = 1e9;
      svg.querySelectorAll('[data-hl]').forEach(el => {
        if (mode === 'bars') {
          const x = +el.getAttribute('x'),
            w = +el.getAttribute('width');
          if (P.x >= x - 1 && P.x <= x + w + 1) {
            best = el;
            bd = 0;
          }
        } else {
          const dx = +el.getAttribute('cx') - P.x,
            dy = +el.getAttribute('cy') - P.y,
            dd = Math.hypot(dx, dy);
          if (dd < bd && dd < 24) {
            bd = dd;
            best = el;
          }
        }
      });
      if (!best) {
        ctip.hidden = true;
        return;
      }
      best.classList.add('hovon');
      if (mode === 'pts') {
        const cx = +best.getAttribute('cx'),
          cy = +best.getAttribute('cy');
        add('line', { x1: cx, x2: cx, y1: cy, y2: T + ph, class: 'hx' });
      }
      html = `<b>${esc(best.dataset.hl)}</b>`;
    } else {
      if (P.x < L - 2 || P.x > L + pw + 2) {
        ctip.hidden = true;
        return;
      }
      let xs, px, label;
      if (mode === 'idx') {
        const n = +d.hn,
          k = Math.max(0, Math.min(n - 1, Math.round((P.x - L) / (pw / Math.max(1, n - 1)))));
        px = L + (n < 2 ? pw / 2 : (k * pw) / (n - 1));
        label = JSON.parse(d.hlabels)[k];
      } else {
        const x0 = +d.hx0,
          x1 = +d.hx1,
          raw = Math.max(x0, Math.min(x1, x0 + ((P.x - L) / pw) * (x1 - x0)));
        /* fluid: continuous curves (spaced repetition) · pts: magnetic to the data points (practice tests), daily after the last one · day: whole days */
        if (d.hsnap === 'fluid') xs = raw;
        else if (d.hsnap === 'pts') {
          const src = svg.querySelector('path[data-hdisc]'),
            vx = src ? pathPts(src).map(q => x0 + ((q[0] - L) / pw) * (x1 - x0)) : [];
          if (vx.length && raw <= vx[vx.length - 1] + 0.5)
            xs = vx.reduce((a, v) => (Math.abs(v - raw) < Math.abs(a - raw) ? v : a), vx[0]);
          else xs = Math.round(raw);
        } else xs = Math.round(raw);
        xs = Math.max(x0, Math.min(x1, xs));
        px = L + ((xs - x0) / (x1 - x0)) * pw;
        label = new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', month: 'short', day: 'numeric' }).format(
          parse(addDays(d.hbase, Math.round(xs)))
        );
      }
      const y0 = +d.hy0,
        y1 = +d.hy1,
        val = py => y0 + (1 - (py - T) / ph) * (y1 - y0),
        rows = [];
      let firstY = null;
      svg.querySelectorAll('path[data-hs]').forEach(pa => {
        const pts = pathPts(pa);
        if (pts.length < 1 || px < pts[0][0] - 0.5 || px > pts[pts.length - 1][0] + 0.5) return;
        let py = null;
        if (pa.dataset.hdisc) {
          const v = pts.find(q => Math.abs(q[0] - px) <= Math.max(1.5, (pw / Math.max(1, +d.hx1 - +d.hx0)) * 0.5));
          if (v) py = v[1];
        } else
          for (let k = 0; k < pts.length; k++) {
            const a = pts[k],
              b = pts[k + 1] || a;
            if (px >= a[0] - 0.01 && px <= b[0] + 0.01) {
              py = b[0] === a[0] ? a[1] : a[1] + ((b[1] - a[1]) * (px - a[0])) / (b[0] - a[0]);
              break;
            }
          }
        if (py == null) return;
        const col = getComputedStyle(pa).stroke || '#e8ecf1';
        if (firstY == null) firstY = py;
        add('circle', { cx: px, cy: py, r: 4.5, fill: col, class: 'hdot' });
        rows.push(
          `<span><i style="background:${col}"></i>${esc(pa.dataset.hs)} <b>${hoverFmt(val(py), d.hfmt)}</b></span>`
        );
      });
      add('line', { x1: px, x2: px, y1: T, y2: T + ph, class: 'hx' });
      html = `<div class="ctd">${esc(label)}</div>${rows.join('') || `<span class="muted">—</span>`}`;
    }
    if (!g.parentNode) svg.appendChild(g);
    ctip.innerHTML = html;
    ctip.hidden = false;
    const r = ctip.getBoundingClientRect(),
      W = innerWidth,
      touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    let x = touch ? e.clientX - r.width / 2 : e.clientX + 14,
      y = e.clientY - r.height - (touch ? 44 : 12);
    if (touch) x = Math.max(8, Math.min(W - r.width - 8, x));
    else if (x + r.width > W - 8) x = e.clientX - r.width - 14;
    if (y < 8) y = e.clientY + (touch ? 36 : 16);
    ctip.style.left = x + 'px';
    ctip.style.top = y + 'px';
  }
  let touchSvg = null;
  document.addEventListener(
    'pointerdown',
    e => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      const svg = e.target.closest && e.target.closest('svg[data-hmode]');
      if (!svg) {
        if (!ctip.hidden && !(e.target.closest && e.target.closest('#heatGrid .hmc, #heatNow .hnt'))) hoverClear();
        touchSvg = null;
        return;
      }
      touchSvg = svg;
      hoverShow(svg, e);
    },
    { passive: true }
  );
  document.addEventListener(
    'pointermove',
    e => {
      if ((e.pointerType === 'touch' || e.pointerType === 'pen') && touchSvg && e.buttons) hoverShow(touchSvg, e);
    },
    { passive: true }
  );
  document.addEventListener('pointercancel', e => {
    if (e.pointerType === 'touch') {
      touchSvg = null;
      hoverClear();
    }
  });
  document.addEventListener(
    'mousemove',
    e => {
      if (!HOVER_OK.matches) return;
      const svg = e.target.closest && e.target.closest('svg[data-hmode]');
      if (!svg) {
        if (!ctip.hidden && !(e.target.closest && e.target.closest('#heatGrid .hmc, #heatNow .hnt'))) hoverClear();
        return;
      }
      hoverShow(svg, e);
    },
    { passive: true }
  );
  document.addEventListener('mouseleave', () => hoverClear());
  window.addEventListener(
    'scroll',
    () => {
      if (!ctip.hidden) hoverClear();
    },
    { passive: true }
  );
  return { HOVER_OK, ctip };
})();
const { HOVER_OK, ctip } = ChartHover;
