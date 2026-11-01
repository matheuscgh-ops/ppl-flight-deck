/* ===== module HeatMap (js/views/heatmap.js) =====
   public: heatAt, heatData, heatColor, renderHeat, openHeat, closeHeat
   shared state (getter/setter): heatRange */
const HeatMap = (() => {
  /* ===== heat map: how warm each topic is, period by period =====
   heat (0–100) at the end of a period = chance of a right answer, the same number the exam forecast uses:
   last score × recall + 1/3 × (1 − recall)  (a fully forgotten topic falls to guessing, about 33).
   It cools when you stop reviewing (recall falls) or score badly, and warms when you review and get things right.
   Coldest topics first: the ones that need attention are at the top. */
  const HEAT_R = {
    '2w': { n: 14, len: 1 },
    '1m': { n: 30, len: 1 },
    '3m': { n: 13, len: 7 },
    '6m': { n: 26, len: 7 },
    '1y': { n: 12, len: 30 },
  };
  let heatRange = (() => {
    try {
      const v = localStorage.getItem(STORE + '-heatr');
      return HEAT_R[v] ? v : '3m';
    } catch (e) {
      return '3m';
    }
  })();
  function heatAt(i, d) {
    const m = srModel(i, d);
    if (!m.reps.length) return null;
    const R = m.R,
      sc = m.reps[m.reps.length - 1].p;
    return { heat: Math.round(100 * pRight(sc, R)), R, score: sc };
  }
  function heatData(range) {
    const H = HEAT_R[range || heatRange],
      today = todayISO(),
      ends = Array.from({ length: H.n }, (_, k) => addDays(today, -(H.n - 1 - k) * H.len));
    const rows = TOPICS.map((x, i) => ({ i, cells: ends.map(d => heatAt(i, d)) }));
    const last = r => {
      for (let k = r.cells.length - 1; k >= 0; k--) if (r.cells[k]) return r.cells[k].heat;
      return Infinity;
    };
    rows.sort((a, b) => last(a) - last(b) || TOPICS[b.i].q - TOPICS[a.i].q);
    return { ends, rows, len: H.len };
  }
  /* colors spread over the range that matters (≤ 50 cold blue … ≥ 95 hot red) so 80 vs 95 is clearly different */
  const HEAT_STOPS = [
    [0, [47, 75, 216]],
    [50, [47, 75, 216]],
    [62, [125, 147, 232]],
    [72, [160, 143, 208]],
    [82, [224, 138, 134]],
    [95, [242, 57, 44]],
    [100, [242, 57, 44]],
  ];
  function heatColor(v) {
    let a = HEAT_STOPS[0],
      b = HEAT_STOPS[HEAT_STOPS.length - 1];
    for (let k = 0; k < HEAT_STOPS.length - 1; k++)
      if (v >= HEAT_STOPS[k][0] && v <= HEAT_STOPS[k + 1][0]) {
        a = HEAT_STOPS[k];
        b = HEAT_STOPS[k + 1];
        break;
      }
    const f = b[0] === a[0] ? 0 : (v - a[0]) / (b[0] - a[0]),
      c = a[1].map((x, j) => Math.round(x + (b[1][j] - x) * f));
    return `rgb(${c.join(',')})`;
  }
  /* monthly squares (30 days) are labelled by the month they start in, so two periods never show the same month */
  function heatLabel(d, len) {
    const df = new Intl.DateTimeFormat(
      LOCALE[lang],
      len === 30 ? { month: 'short' } : len === 7 ? { month: 'short', day: 'numeric' } : { day: 'numeric' }
    );
    return df.format(parse(len === 30 ? addDays(d, -(len - 1)) : d));
  }
  /* text on a square stays readable on both ends of the scale */
  const inkOn = heat => (heat >= 88 || heat <= 56 ? '#fff' : '#15181c');

  /* compact view on the Statistics page: today only, one tile per topic, coldest first */
  function renderHeatNow() {
    const box = $('#heatNow');
    if (!box) return;
    const rows = TOPICS.map((x, i) => ({ i, c: heatAt(i, todayISO()) })).sort(
      (a, b) => (a.c ? a.c.heat : Infinity) - (b.c ? b.c.heat : Infinity) || TOPICS[b.i].q - TOPICS[a.i].q
    );
    box.innerHTML = rows
      .map(({ i, c }) =>
        c
          ? `<span class="hnt" data-hi="${i}" style="background:${heatColor(c.heat)};color:${inkOn(c.heat)}"><b>${pref('heatNums') ? c.heat : ''}</b><em>${esc(TOPICS[i].name)}</em></span>`
          : `<span class="hnt empty" data-hi="${i}"><b>—</b><em>${esc(TOPICS[i].name)}</em></span>`
      )
      .join('');
  }
  function renderHeat() {
    document.querySelectorAll('[data-heatr] button').forEach(b => b.classList.toggle('on', b.dataset.hr === heatRange));
    renderHeatNow();
    if (!$('#heatbg').hidden) renderHeatHistory();
  }

  /* history dialog: every period of the chosen interval, with filters and hover */
  const heatDialog = modal('#heatbg', { close: '#heatClose', onClose: () => (ctip.hidden = true) });
  function openHeat() {
    heatDialog.open('#heatClose');
    renderHeatHistory();
  }
  const closeHeat = heatDialog.close;
  $('#heatOpen').addEventListener('click', e => {
    e.stopPropagation();
    openHeat();
  });
  $('#heatPanel').addEventListener('click', openHeat);

  function renderHeatHistory() {
    const box = $('#heatGrid');
    if (!box) return;
    document.querySelectorAll('[data-heatr] button').forEach(b => b.classList.toggle('on', b.dataset.hr === heatRange));
    const { ends, rows, len } = heatData(),
      n = ends.length,
      cw = (box.clientWidth || 900) - (phoneMQ.matches ? 118 : 230),
      showNum = cw / n >= 26 && pref('heatNums');
    const step = n <= 14 ? (cw / n < 22 ? 2 : 1) : n <= 13 ? 1 : n <= 26 ? (cw / n < 30 ? 2 : 1) : 1,
      head = ends
        .map((d, k) => `<span class="hmh">${(n - 1 - k) % step === 0 ? esc(heatLabel(d, len)) : ''}</span>`)
        .join('');
    box.style.setProperty('--hn', n);
    box.innerHTML =
      `<div class="hmrow hmhead"><span class="hmn"></span>${head}</div>` +
      rows
        .map(
          r =>
            `<div class="hmrow"><span class="hmn" title="${esc(TOPICS[r.i].name)}">${esc(TOPICS[r.i].name)}</span>${r.cells.map((c, k) => (c ? `<span class="hmc" data-hi="${r.i}" data-hk="${k}" style="background:${heatColor(c.heat)};color:${inkOn(c.heat)}">${showNum ? c.heat : ''}</span>` : `<span class="hmc empty" data-hi="${r.i}" data-hk="${k}"></span>`)).join('')}</div>`
        )
        .join('');
    box._data = { ends, rows, len };
  }
  function heatNowTip(e, tile) {
    const i = +tile.dataset.hi,
      c = heatAt(i, todayISO());
    let html = `<div class="ctd">${esc(TOPICS[i].name)} · ${esc(t('todayMark'))}</div>`;
    html += c
      ? `<span><i style="background:${heatColor(c.heat)}"></i>${esc(t('heatWord'))} <b>${c.heat}</b></span><span>${esc(t('lgRecall'))} <b>${pct(c.R)}</b> · ${esc(t('lastScore'))} <b>${c.score}%</b></span>`
      : `<span class="muted">${esc(t('noHist'))}</span>`;
    showTip(e, html);
  }
  function showTip(e, html) {
    ctip.innerHTML = html;
    ctip.hidden = false;
    placeTip(ctip, e);
  }
  function heatTip(e, cell) {
    const D = $('#heatGrid')._data;
    if (!D) return;
    const i = +cell.dataset.hi,
      k = +cell.dataset.hk,
      row = D.rows.find(r => r.i === i),
      c = row.cells[k],
      prev = k ? row.cells[k - 1] : null;
    const df = new Intl.DateTimeFormat(LOCALE[lang], { month: 'short', day: 'numeric' }),
      end = D.ends[k],
      start = addDays(end, -(D.len - 1));
    const period = D.len === 1 ? df.format(parse(end)) : `${df.format(parse(start))} – ${df.format(parse(end))}`;
    let html = `<div class="ctd">${esc(TOPICS[i].name)} · ${esc(period)}</div>`;
    if (!c) html += `<span class="muted">${esc(t('noHist'))}</span>`;
    else {
      html += `<span><i style="background:${heatColor(c.heat)}"></i>${esc(t('heatWord'))} <b>${c.heat}</b></span><span>${esc(t('lgRecall'))} <b>${pct(c.R)}</b> · ${esc(t('lastScore'))} <b>${c.score}%</b></span>`;
      if (prev) {
        const dv = c.heat - prev.heat;
        html += `<span class="${dv > 0 ? 'warm' : dv < 0 ? 'cool' : ''}">${dv > 0 ? '▲ +' + dv + ' ' + esc(t('heatWarm')) : dv < 0 ? '▼ ' + dv + ' ' + esc(t('heatCool')) : '= ' + esc(t('heatSame'))}</span>`;
      }
    }
    document.querySelectorAll('#heatGrid .hmc.hovon').forEach(x => x.classList.remove('hovon'));
    cell.classList.add('hovon');
    showTip(e, html);
  }
  document.addEventListener(
    'mousemove',
    e => {
      if (!HOVER_OK.matches) return;
      const c = e.target.closest && e.target.closest('#heatGrid .hmc');
      const tile = !c && e.target.closest && e.target.closest('#heatNow .hnt');
      if (c) heatTip(e, c);
      else if (tile) heatNowTip(e, tile);
      else if (e.target.closest && e.target.closest('#heatNow')) ctip.hidden = true;
      else if (document.querySelector('#heatGrid .hmc.hovon')) {
        document.querySelectorAll('#heatGrid .hmc.hovon').forEach(x => x.classList.remove('hovon'));
        if (!e.target.closest('svg[data-hmode]')) ctip.hidden = true;
      }
    },
    { passive: true }
  );
  document.addEventListener(
    'pointerdown',
    e => {
      if (e.pointerType !== 'touch') return;
      const c = e.target.closest && e.target.closest('#heatGrid .hmc');
      if (c) heatTip(e, c);
      else document.querySelectorAll('#heatGrid .hmc.hovon').forEach(x => x.classList.remove('hovon'));
    },
    { passive: true }
  );
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-heatr] button');
    if (!b) return;
    heatRange = b.dataset.hr;
    try {
      localStorage.setItem(STORE + '-heatr', heatRange);
    } catch (x) {}
    renderHeatHistory();
  });

  expose({
    heatRange: [
      () => heatRange,
      x => {
        heatRange = x;
      },
    ],
  });
  return { heatAt, heatData, heatColor, renderHeat, openHeat, closeHeat };
})();
const { heatAt, heatData, heatColor, renderHeat, openHeat, closeHeat } = HeatMap;
