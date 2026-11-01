/* ===== module VolumeView (js/views/volume.js) =====
   public: weekStart, weeklyVolume, rangeSeries, renderVolume, renderVolPanel
   shared state (getter/setter): volRange */
const VolumeView = (() => {
  /* ===== weekly study volume (questions) =====
   A completed study/review session counts the topic's question count; a completed practice test counts its questions.
   Sessions in progress and card moves count 0. Weeks run Monday–Sunday, like the calendar. */
  function weekStart(isoD) {
    const d = parse(isoD);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return iso(d);
  }
  function weeklyVolume(n) {
    const by = {};
    const add = (d, q) => {
      const k = weekStart(d);
      by[k] = (by[k] || 0) + q;
    };
    state.events.forEach(e => {
      if ((e.kind === 'study' || e.kind === 'review') && !e.partial) add(e.date, TOPICS[e.topic].q);
    });
    (state.tests || []).forEach(x => {
      if (x.score != null) add(x.date, TEST_Q);
    });
    const cur = weekStart(todayISO());
    let first = cur;
    if (n) {
      first = addDays(cur, -7 * (n - 1));
    } else {
      const ks = Object.keys(by).sort();
      first = ks.length && ks[0] < cur ? ks[0] : addDays(cur, -7 * 11);
      if (diffDays(first, cur) / 7 < 11) first = addDays(cur, -7 * 11);
    }
    const out = [];
    for (let w = first; w <= cur; w = addDays(w, 7)) out.push({ w, q: by[w] || 0 });
    return out;
  }
  function volSVG(data, W, H, big) {
    const L = big ? 8 : 4,
      Rp = big ? 46 : 4,
      T = big ? 16 : 6,
      B = big ? 24 : 4,
      pw = W - L - Rp,
      ph = H - T - B;
    const max = Math.max(1, ...data.map(d => d.q));
    const nice = big ? Math.ceil(max / 50) * 50 || 50 : max;
    const X = k => L + (data.length < 2 ? pw / 2 : (k * pw) / (data.length - 1)),
      Y = v => T + ph - (v / nice) * ph,
      f = n => n.toFixed(1);
    const pts = data.map((d, k) => [X(k), Y(d.q)]),
      line = pts.map((p, k) => (k ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1])).join('');
    let g = `<defs><linearGradient id="vgrad${big ? 'b' : 'm'}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fc5200" stop-opacity=".45"/><stop offset="1" stop-color="#fc5200" stop-opacity="0"/></linearGradient></defs>`;
    if (big) {
      [0, 0.5, 1].forEach(r => {
        const y = T + ph - r * ph;
        g += `<line class="vgrid" x1="${L}" x2="${L + pw}" y1="${f(y)}" y2="${f(y)}"/><text class="vax" x="${W - 4}" y="${f(y + 3.5)}" text-anchor="end">${fmt(Math.round(nice * r))}</text>`;
      });
    }
    g += `<path d="${line}L${f(pts.at(-1)[0])} ${T + ph}L${f(pts[0][0])} ${T + ph}Z" fill="url(#vgrad${big ? 'b' : 'm'})"/><path class="vline"${big ? ` data-hs="${esc(t('totalQ'))}"` : ''} d="${line}"/>`;
    const xn = pts.at(-1)[0];
    g += `<line class="vnow" x1="${f(xn)}" x2="${f(xn)}" y1="${T}" y2="${T + ph}"/>`;
    const r = big ? 4.5 : data.length > 16 ? 2 : 3;
    pts.forEach((p, k) => {
      const cur = k === pts.length - 1;
      if (cur) g += `<circle class="vhalo" cx="${f(p[0])}" cy="${f(p[1])}" r="${r * 2.6}"/>`;
      g += `<circle class="vdot${cur ? ' cur' : ''}" cx="${f(p[0])}" cy="${f(p[1])}" r="${r}"><title>${esc(data[k].day ? new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', month: 'short', day: 'numeric' }).format(parse(data[k].w)) : t('weekOf').replace('{d}', new Intl.DateTimeFormat(LOCALE[lang], { month: 'short', day: 'numeric' }).format(parse(data[k].w))))}: ${data[k].q} ${esc(t('questionsUnit'))}</title></circle>`;
      if (big && data.length <= 14 && data[k].q)
        g += `<text class="vval" x="${f(p[0])}" y="${f(p[1] - 9)}" text-anchor="middle">${data[k].q}</text>`;
    });
    if (big && data[0].day) {
      const n = data.length,
        step = n <= 7 ? 1 : n <= 14 ? 2 : 7,
        lf = new Intl.DateTimeFormat(LOCALE[lang], n <= 7 ? { weekday: 'short' } : { month: 'short', day: 'numeric' });
      data.forEach((d, k) => {
        if ((n - 1 - k) % step === 0)
          g += `<text class="vax" x="${f(X(k))}" y="${H - 6}" text-anchor="middle">${esc(lf.format(parse(d.w)))}</text>`;
      });
    } else if (big) {
      let lastM = -1;
      const mf = new Intl.DateTimeFormat(LOCALE[lang], { month: 'short' });
      data.forEach((d, k) => {
        const m = parse(d.w).getMonth();
        if (m !== lastM && k > 0) {
          g += `<text class="vax" x="${f(X(k))}" y="${H - 6}" text-anchor="middle">${esc(mf.format(parse(d.w)).toUpperCase())}</text>`;
        }
        lastM = m;
      });
    }
    return `<svg${big ? hv({ mode: 'idx', l: L, t: T, pw, ph, y0: 0, y1: nice, fmt: 'q', n: data.length, labels: JSON.stringify(data.map(d => (d.day ? new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', month: 'short', day: 'numeric' }).format(parse(d.w)) : t('weekOf').replace('{d}', new Intl.DateTimeFormat(LOCALE[lang], { month: 'short', day: 'numeric' }).format(parse(d.w)))))) }) : ''} viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(t('volTitle'))}">${g}</svg>`;
  }
  let volRange = '3m';
  const RANGES = {
    '3d': { days: 3 },
    '7d': { days: 7 },
    '2w': { days: 14 },
    '1m': { days: 30 },
    '3m': { weeks: 13 },
    '6m': { weeks: 26 },
    '1y': { weeks: 52 },
    all: { all: true },
  };
  function dailyVolume() {
    const by = {};
    state.events.forEach(e => {
      if ((e.kind === 'study' || e.kind === 'review') && !e.partial) by[e.date] = (by[e.date] || 0) + TOPICS[e.topic].q;
    });
    (state.tests || []).forEach(x => {
      if (x.score != null) by[x.date] = (by[x.date] || 0) + TEST_Q;
    });
    return by;
  }
  function rangeSeries(r, shift = 0) {
    let R = RANGES[r];
    const by = dailyVolume(),
      today = todayISO();
    if (R.all) {
      if (shift) return [];
      const ks = Object.keys(by).sort(),
        first = ks.length ? weekStart(ks[0]) : today;
      R = { weeks: Math.max(13, Math.round(diffDays(first, weekStart(today)) / 7) + 1) };
    }
    if (R.days) {
      const end = addDays(today, -shift * R.days),
        out = [];
      for (let k = R.days - 1; k >= 0; k--) {
        const d = addDays(end, -k);
        out.push({ w: d, q: by[d] || 0, day: true });
      }
      return out;
    }
    const curW = addDays(weekStart(today), -shift * 7 * R.weeks),
      out = [];
    for (let k = R.weeks - 1; k >= 0; k--) {
      const w = addDays(curW, -7 * k);
      let q = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(w, i);
        if (d <= today) q += by[d] || 0;
      }
      out.push({ w, q });
    }
    return out;
  }
  function renderVolume() {
    const d = weeklyVolume(12),
      box = $('#volMini');
    if (!box) return;
    $('#volWeek').textContent = fmt(d.at(-1).q);
    const w = Math.max(120, Math.round(box.clientWidth || 240)),
      h = Math.max(30, Math.round(box.clientHeight || 46));
    box.innerHTML = volSVG(d, w, h, false);
    if (!$('#volbg').hidden) renderVolBig();
    renderVolPanel();
  }
  /* the big chart lives in two places with the same parts: the dashboard dialog and the Statistics page */
  const BIG_VIEWS = {
    dialog: { total: '#volTotal', dates: '#volDates', cmp: '#volCmp', chart: '#volBig', range: '#volRange' },
    page: { total: '#svTotal', dates: '#svDates', cmp: '#svCmp', chart: '#svBig', range: '#svRange' },
  };
  function paintBig(v) {
    const box = $(v.chart);
    if (!box) return;
    const d = rangeSeries(volRange),
      prev = rangeSeries(volRange, 1);
    const tot = d.reduce((a, x) => a + x.q, 0),
      ptot = prev.reduce((a, x) => a + x.q, 0);
    $(v.total).textContent = fmt(tot);
    const df = new Intl.DateTimeFormat(LOCALE[lang], { month: 'short', day: 'numeric', year: 'numeric' });
    const last = d.at(-1).day ? d.at(-1).w : addDays(d.at(-1).w, 6) > todayISO() ? todayISO() : addDays(d.at(-1).w, 6);
    $(v.dates).textContent = `${df.format(parse(d[0].w))} – ${df.format(parse(last))}`;
    if (ptot > 0) {
      const ch = Math.round(((tot - ptot) / ptot) * 100);
      $(v.cmp).innerHTML =
        `<b class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch)}%</b><br>${esc(t('vsPrior'))}`;
    } else $(v.cmp).innerHTML = '';
    box.innerHTML = volSVG(d, Math.round(box.clientWidth || 700), Math.round(box.clientHeight || 280), true);
    document.querySelectorAll(v.range + ' button').forEach(b => b.classList.toggle('on', b.dataset.r === volRange));
  }
  const renderVolBig = () => paintBig(BIG_VIEWS.dialog);
  function renderVolPanel() {
    if ($('#volPanel') && $('#volPanel').offsetParent) paintBig(BIG_VIEWS.page);
  }
  const volDialog = modal('#volbg', { close: '#volClose' });
  function openVol() {
    volDialog.open('#volClose');
    renderVolBig();
  }
  $('#volOpen').addEventListener('click', e => {
    e.stopPropagation();
    openVol();
  });
  const pickRange = e => {
    const b = e.target.closest('button');
    if (!b) return;
    volRange = b.dataset.r;
    if (!$('#volbg').hidden) renderVolBig();
    renderVolPanel();
  };
  $('#volRange').onclick = pickRange;
  $('#svRange').onclick = pickRange;
  let rzVol;
  window.addEventListener('resize', () => {
    clearTimeout(rzVol);
    rzVol = setTimeout(renderVolume, 120);
  });
  expose({
    volRange: [
      () => volRange,
      x => {
        volRange = x;
      },
    ],
  });
  return { weekStart, weeklyVolume, rangeSeries, renderVolume, renderVolPanel };
})();
const { weekStart, weeklyVolume, rangeSeries, renderVolume, renderVolPanel } = VolumeView;
