/* ===== module PhoneDash (js/views/phone-dash.js) =====
   public: renderPhoneDash, weekStreak, openCalMax, openSrMax
   A cleaner dashboard on phones (Strava style). Nothing is removed — the big pieces become small cards that open the
   real thing:
     · Streak card: weeks in a row with at least one active day (the current week counts once it is active), and the
       day streak under it. Tapping it opens the calendar.
     · Training log: this week and last week as dots (bigger dot = more questions that day). Tapping it opens the
       full calendar in a maximized card.
     · Spaced repetition: average recall now and reviews due. Tapping it opens the spaced-repetition preview (picker,
       curve, intervals) in a maximized card.
   The real calendar and preview are moved into the maximized card and back, so they keep every feature. Larger
   screens are unchanged (these cards are hidden there).                                                        */
const PhoneDash = (() => {
  /* weeks (Monday to Sunday) in a row with activity; this week counts once it has an active day */
  function weekStreak() {
    const set = new Set(state.events.map(e => e.date).concat((state.tests || []).map(x => x.date)));
    const active = w => Array.from({ length: 7 }, (_, k) => addDays(w, k)).some(d => set.has(d));
    let w = mondayOf(todayISO());
    if (!active(w)) w = addDays(w, -7);
    let n = 0;
    while (active(w) && n < 520) {
      n++;
      w = addDays(w, -7);
    }
    return n;
  }
  /* questions done per day (study, review and practice tests), like the volume chart */
  function qByDay() {
    const by = {};
    state.events.forEach(e => {
      if ((e.kind === 'study' || e.kind === 'review') && !e.partial) by[e.date] = (by[e.date] || 0) + TOPICS[e.topic].q;
    });
    (state.tests || []).forEach(x => (by[x.date] = (by[x.date] || 0) + (x.q || 60)));
    state.events.forEach(e => {
      if (!(e.date in by)) by[e.date] = 0;
    });
    return by;
  }
  function renderPhoneDash() {
    if (!$('#streakCard')) return;
    const wk = weekStreak(),
      s = streakInfo();
    $('#streakWeeks').textContent = wk;
    $('#streakWeeksLbl').textContent = t(wk === 1 ? 'streakWeek' : 'streakWeeks');
    $('#streakDays').textContent = t('streakDaysLbl').replace('{n}', s.n);
    $('#streakCard').classList.toggle('cold', !wk);
    /* training log: two rows of 7 dots */
    const by = qByDay(),
      today = todayISO(),
      mon = mondayOf(today),
      max = Math.max(1, ...Object.values(by)),
      wf = new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'narrow' });
    const row = (w, lbl) => {
      let q = 0;
      const dots = Array.from({ length: 7 }, (_, k) => {
        const d = addDays(w, k),
          v = by[d];
        if (v) q += v;
        const size = v == null ? 0 : 8 + Math.round(14 * Math.sqrt(v / max));
        return `<span class="tl${d === today ? ' now' : ''}${d > today ? ' later' : ''}" title="${esc(d)}${v != null ? ' · ' + v + ' q' : ''}"><i${v != null ? ` class="on" style="--s:${size}px"` : ''}></i></span>`;
      }).join('');
      return `<div class="tlrow"><div class="tlhead"><span>${esc(t(lbl))}</span><b>${fmt(q)} q</b></div><div class="tldots">${dots}</div></div>`;
    };
    const days = Array.from({ length: 7 }, (_, k) => `<span>${esc(wf.format(parse(addDays(mon, k))))}</span>`).join('');
    $('#calMiniBody').innerHTML =
      `${row(mon, 'thisWeekShort')}${row(addDays(mon, -7), 'lastWeekShort')}<div class="tldays">${days}</div>`;
    /* spaced repetition: average recall now, reviews due */
    const ms = srAll(today, true),
      avgR = wavg(ms),
      due = ms.filter(m => m.reps.length && m.over >= 0).length;
    $('#srMiniBody').innerHTML =
      `<div class="srbig">${avgR == null ? '—' : Math.round(avgR * 100) + '%'}</div><div class="srsub">${esc(t('srRecallNow'))}</div><div class="srbar"><i style="width:${avgR == null ? 0 : Math.round(avgR * 100)}%"></i></div><div class="srdue${due ? ' on' : ''}">${esc(due ? t(due === 1 ? 'srDue1' : 'srDueN').replace('{n}', due) : t('srDue0'))}</div>`;
  }
  /* the maximized cards: the real element moves in, and back where it was on close */
  function maxCard(bgSel, bodySel, closeSel, elSel, after) {
    let home = null,
      next = null;
    const d = modal(bgSel, {
      close: closeSel,
      onClose: () => {
        const el = $(elSel);
        el.classList.remove('inmax');
        if (home) home.insertBefore(el, next);
        after && after();
      },
    });
    const open = () => {
      const el = $(elSel);
      home = el.parentNode;
      next = el.nextSibling;
      el.classList.add('inmax');
      $(bodySel).appendChild(el);
      d.open(closeSel);
      after && after();
    };
    open.close = d.close;
    return open;
  }
  const openCalMax = maxCard('#calMaxBg', '#calMaxBody', '#calMaxClose', '.cal', () => {
    renderCalendar();
    requestAnimationFrame(fitTags);
  });
  const openSrMax = maxCard('#srMaxBg', '#srMaxBody', '#srMaxClose', '#srPrev', () =>
    requestAnimationFrame(() => renderSRPanel())
  );
  const onKey = f => e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      f();
    }
  };
  /* "Statistics →" inside the maximized preview goes to the other tab: the card closes first */
  $('#openSR').addEventListener('click', () => openSrMax.close(), true);
  [
    ['#calMini', openCalMax],
    ['#streakCard', openCalMax],
    ['#srMini', openSrMax],
  ].forEach(([s, f]) => {
    $(s).addEventListener('click', f);
    $(s).addEventListener('keydown', onKey(f));
  });
  return { renderPhoneDash, weekStreak, openCalMax, openSrMax };
})();
const { renderPhoneDash, weekStreak, openCalMax, openSrMax } = PhoneDash;
