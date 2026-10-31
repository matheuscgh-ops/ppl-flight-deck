/* ===== module StatsCarousel (js/views/stats-carousel.js) =====
   public: renderStatCarousel
   The "Needs recall" card on Statistics: every 3 s it shows the memory curve of the next topic, picked the same way as
   the dashboard preview (today's plan order, topics still to do that have a curve). When the plan has nothing left it
   falls back to the topics with the lowest recall. It pauses while the pointer is over the card; a dot jumps to a topic,
   and clicking the chart scrolls to that topic's card below. */
const StatsCarousel = (() => {
  const TURN_MS = 3000,
    FALLBACK_COUNT = 6;
  let current = null,
    holding = false;

  /* topics to show, most urgent first, and whether they come from today's plan */
  function topics() {
    const fromPlan = carList().filter(i => i != null);
    if (fromPlan.length) return { list: fromPlan, fromPlan: true };
    const lowest = srAll()
      .filter(m => m.reps.length)
      .sort((a, b) => a.R - b.R)
      .slice(0, FALLBACK_COUNT)
      .map(m => m.i);
    return { list: lowest, fromPlan: false };
  }

  function isVisible() {
    const p = $('#scPanel');
    return !document.hidden && p && p.offsetParent && !$('#viewSR').hidden;
  }

  function renderStatCarousel() {
    const { list, fromPlan } = topics();
    if (!list.includes(current)) current = list[0] ?? null;
    $('#scSub').textContent = t(fromPlan ? 'scSub' : 'scFallback');
    $('#scDots').innerHTML = list
      .map(i => `<i class="${i === current ? 'on' : ''}" data-sc="${i}" title="${esc(TOPICS[i].name)}"></i>`)
      .join('');
    if (current == null) {
      $('#scTitle').textContent = '';
      $('#scStats').innerHTML = '';
      $('#scChart').innerHTML = `<div class="empty">${esc(t('scNone'))}</div>`;
      $('#scLegend').innerHTML = '';
      return;
    }
    const m = srModel(current),
      [dueLabel, dueClass] = dueText(m),
      box = $('#scChart');
    $('#scTitle').textContent = TOPICS[current].name;
    $('#scStats').innerHTML =
      `${esc(t('retention'))} <b>${pct(m.R)}</b> · S <b>${fmt(m.S, 1)}d</b> · <span class="duechip ${dueClass}" style="min-width:0">${esc(dueLabel)}</span>`;
    box.innerHTML = topicChart(m, Math.round(box.clientWidth || 420), phoneMQ.matches ? 190 : 250, srCardRange);
    $('#scLegend').innerHTML = legendHTML(true);
  }

  function turn() {
    if (holding || !isVisible()) return;
    const { list } = topics();
    if (list.length < 2) return;
    current = list[(Math.max(0, list.indexOf(current)) + 1) % list.length];
    renderStatCarousel();
  }
  setInterval(turn, TURN_MS);

  const panel = $('#scPanel');
  panel.addEventListener('mouseenter', () => (holding = true));
  panel.addEventListener('mouseleave', () => (holding = false));
  panel.addEventListener('click', e => {
    const dot = e.target.closest('[data-sc]');
    if (dot) {
      current = +dot.dataset.sc;
      renderStatCarousel();
      return;
    }
    if (current != null && e.target.closest('#scTitle, #scStats')) renderSRPage(current);
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => isVisible() && renderStatCarousel(), 150);
  });

  return { renderStatCarousel };
})();
const { renderStatCarousel } = StatsCarousel;
