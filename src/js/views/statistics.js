/* ===== module StatisticsView (js/views/statistics.js) =====
   public: renderSRPage */
const StatisticsView = (() => {
  let srFilter = 'all';
  const FILTERS = [
    ['all', 'fAll'],
    ['due', 'fDue'],
    ['Not Comfortable', null],
    ['Very Comfortable', null],
    ['To review', null],
  ];
  function renderSRPage(focus) {
    paintSrRange();
    renderForecast();
    renderStatCarousel();
    renderHeat();
    renderVolPanel();
    const all = srAll(),
      avg = wavg(all),
      due = all.filter(m => !m.reps.length || m.over >= 0);
    $('#srKpis').innerHTML =
      `<div><b>${pct(avg)}</b><span>${esc(t('avgRet'))}</span></div><div><b>${due.length}</b><span>${esc(t('dueCount'))}</span></div><div><b>${all.length}</b><span>${esc(t('trackedN'))}</span></div>`;
    $('#formulaBody').innerHTML = t('formula');
    document
      .querySelectorAll('[data-srcr] button')
      .forEach(b => b.classList.toggle('on', b.dataset.scr === srCardRange));
    $('#srFilters').innerHTML = FILTERS.map(
      ([k, lk]) =>
        `<button data-f="${esc(k)}" class="${srFilter === k ? 'on' : ''}">${esc(lk ? t(lk) : label(k))}</button>`
    ).join('');
    const list = all.filter(
      m => srFilter === 'all' || (srFilter === 'due' ? !m.reps.length || m.over >= 0 : state.statuses[m.i] === srFilter)
    );
    const df = new Intl.DateTimeFormat(LOCALE[lang], { month: 'short', day: 'numeric' });
    $('#srGrid').innerHTML =
      list
        .map(m => {
          const [dt, cl] = dueText(m),
            si = STATUS.indexOf(state.statuses[m.i]),
            x = TOPICS[m.i];
          return `<article class="panel srcard" id="sr-${m.i}"><div class="srch"><div><h3>${esc(x.name)}</h3><div class="muted">${tf('qn', x.q)}</div></div><span class="chip" style="color:${COLORS[si]}">${esc(label(state.statuses[m.i]))}</span></div>
    <div class="kpirow"><div><b class="${m.R != null && m.R < 0.9 ? 'over' : ''}">${pct(m.R)}</b><span>${esc(t('retention'))}</span></div><div><b>${m.S ? fmt(m.S, 1) + 'd' : '—'}</b><span>${esc(t('stability'))}</span></div><div><b class="${cl}">${m.next ? esc(df.format(parse(m.next))) : '—'}</b><span>${esc(dt)}</span></div><div><b>${m.reps.length}</b><span>${esc(t('sessions'))}</span></div><div><b>${m.p != null ? m.p + '%' : '—'}</b><span>${esc(t('lastScore'))}</span></div></div>
    <div class="chart">${m.reps.length ? topicChart(m, 520, 220, srCardRange) : `<div class="empty">${esc(t('noHistLong'))}</div>`}</div>
    <div class="acts"><button data-log="${m.i}">${esc(t('logReview'))}</button></div></article>`;
        })
        .join('') || `<div class="muted">${esc(t('allClear'))}</div>`;
    /* phone / tablet: redraw each topic chart at its real width so text and lines keep their size (desktop keeps 520 × 220) */
    if (window.innerWidth < 1100)
      list.forEach(m => {
        if (!m.reps.length) return;
        const box = document.querySelector(`#sr-${m.i} .chart`),
          w = box && Math.round(box.clientWidth);
        if (w) box.innerHTML = topicChart(m, w, phoneMQ.matches ? 190 : 210, srCardRange);
      });
    if (focus != null) {
      const el = document.getElementById('sr-' + focus);
      if (el) {
        el.scrollIntoView({ block: 'center' });
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
      }
    }
  }
  $('#srFilters').onclick = e => {
    const b = e.target.closest('button');
    if (b) {
      srFilter = b.dataset.f;
      renderSRPage();
    }
  };
  $('#srGrid').onclick = e => {
    const b = e.target.closest('[data-log]');
    if (b) openModal(+b.dataset.log, 'review');
  };
  /* view switching works without touching the URL (sandboxed previews block history/hash changes);
   the hash is only updated as a best-effort extra so a real browser tab keeps back/forward */
  return { renderSRPage };
})();
const { renderSRPage } = StatisticsView;
