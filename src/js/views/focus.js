/* ===== module Focus (js/views/focus.js) =====
   public: nextItem, renderNowBar, openFocus, closeFocus
   Two ways to get through today's plan without hunting for it:
     · the "next up" bar: on phones, a bar fixed at the bottom of the Dashboard and Plan tabs with the next item of
       today's plan that is not done (time, name, questions). Its circle ticks it; tapping it opens focus mode.
     · focus mode: a full-screen view of one item — the topic, what is planned, a stopwatch against the planned
       minutes, and "Finished": a topic opens the log so you type the score (that marks it done, as always), a practice
       test opens the practice-test log, your own activity or an error review is ticked.
   The stopwatch lives in this browser only (it survives a reload or a locked phone, it does not sync); the screen
   is kept awake while focus mode is open where the browser allows it. Nothing here changes a statistic: the score
   you log goes through the same dialog as before.                                                             */
const Focus = (() => {
  const KEY = STORE + '-focus';
  const itemKey = it => (it.id ? 'id:' + it.id : it.kind + ':' + (it.i ?? 't') + ':' + todayISO());
  /* today's items, in plan order, that are not done (an extra session you logged off-plan is skipped) */
  function todayLeft() {
    return todayPlan().items.filter(it => !it.done && it.reason !== 'extra' && (it.n || it.min));
  }
  function nextItem() {
    return todayLeft()[0] || null;
  }
  const nameOf = it => (it.kind === 'topic' || it.kind === 'test' ? planRowName(it) : itemTitle(it));
  const metaOf = it =>
    [
      it.start != null ? clockOf(it.start) : null,
      it.n ? it.n + ' q' : null,
      it.min ? fmtMin(it.min) : null,
      t('rs_' + it.reason) !== 'rs_' + it.reason ? t('rs_' + it.reason) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  const TICK = '<svg class="tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8.4 6.8 11 12 5.4"/></svg>';

  /* ---------- the "next up" bar (phones) ---------- */
  function renderNowBar() {
    const bar = $('#nowBar');
    if (!bar) return;
    const it = nextItem(),
      view = $('#viewDash').hidden && $('#viewPlan').hidden ? null : 'on';
    bar.hidden = !it || !view;
    document.body.classList.toggle('hasnow', !bar.hidden);
    if (!it) return;
    bar.dataset.key = itemKey(it);
    $('#nowChk').hidden = !it.id;
    if (it.id) $('#nowChk').dataset.chk = it.id;
    $('#nowName').textContent = nameOf(it);
    $('#nowMeta').textContent = metaOf(it);
    const left = todayLeft().length;
    $('#nowLeft').textContent = left > 1 ? '+' + (left - 1) : '';
  }

  /* ---------- the stopwatch (per item, in this browser) ---------- */
  const readW = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch (e) {
      return null;
    }
  };
  const writeW = w => {
    try {
      if (w) localStorage.setItem(KEY, JSON.stringify(w));
      else localStorage.removeItem(KEY);
    } catch (e) {}
  };
  let watch = null,
    cur = null,
    tick = null,
    lock = null;
  const elapsed = () => (watch ? watch.acc + (watch.run ? Date.now() - watch.run : 0) : 0);
  const mmss = ms => {
    const s = Math.floor(ms / 1000),
      h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60);
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s % 60).padStart(2, '0');
  };
  function drawClock() {
    if (!cur) return;
    const ms = elapsed(),
      plan = (cur.min || 0) * 60000,
      f = plan ? Math.min(1, ms / plan) : 0;
    $('#focusClock').textContent = mmss(ms);
    $('#focusRing').style.setProperty('--f', f);
    $('#focusRing').classList.toggle('over', plan > 0 && ms > plan);
    $('#focusPlanned').textContent = plan
      ? ms > plan
        ? t('focusOver').replace('{m}', fmtMin(Math.round((ms - plan) / 60000)))
        : t('focusPlanned').replace('{m}', fmtMin(cur.min))
      : '';
    $('#focusPause').textContent = t(
      watch && watch.run ? 'focusPause' : watch && watch.acc ? 'focusResume' : 'focusStart'
    );
  }
  async function keepAwake(on) {
    try {
      if (on && !lock && navigator.wakeLock) lock = await navigator.wakeLock.request('screen');
      if (!on && lock) {
        await lock.release();
        lock = null;
      }
    } catch (e) {
      lock = null;
    }
  }

  /* ---------- focus mode ---------- */
  function openFocus(it) {
    it = it || nextItem();
    if (!it) return;
    cur = it;
    const key = itemKey(it),
      saved = readW();
    watch = saved && saved.key === key ? saved : { key, acc: 0, run: Date.now() };
    writeW(watch);
    $('#focusName').textContent = nameOf(it);
    $('#focusMeta').textContent = metaOf(it);
    const isTopic = it.kind === 'topic';
    $('#focusNotes').hidden = !isTopic;
    if (isTopic) $('#focusNotes').textContent = '📝 ' + t('notesOpen').replace('{n}', notesOf(it.i).length);
    $('#focusDone').textContent = t(isTopic || it.kind === 'test' ? 'focusDone' : 'focusDoneTask');
    const left = todayLeft().filter(x => itemKey(x) !== key);
    $('#focusNextUp').textContent = left.length ? t('focusThen').replace('{x}', nameOf(left[0])) : '';
    $('#focusbg').hidden = false;
    document.body.classList.add('focusing');
    drawClock();
    clearInterval(tick);
    tick = setInterval(drawClock, 500);
    keepAwake(true);
    $('#focusDone').focus();
  }
  function closeFocus(keep = true) {
    if ($('#focusbg').hidden) return;
    $('#focusbg').hidden = true;
    document.body.classList.remove('focusing');
    clearInterval(tick);
    keepAwake(false);
    if (!keep) writeW(null);
    cur = null;
  }
  function togglePause() {
    if (!watch) return;
    if (watch.run) {
      watch.acc += Date.now() - watch.run;
      watch.run = 0;
    } else watch.run = Date.now();
    writeW(watch);
    drawClock();
  }
  /* "Finished": the same logging as everywhere else, so the statistics only change through the usual dialogs */
  function finish() {
    const it = cur;
    if (!it) return;
    /* the stopwatch is the most exact measure of your pace */
    const min = elapsed() / 60000;
    if (it.kind === 'topic' && it.n && min >= 2) commit(() => notePace(it.i, it.n, min, 'focus'), t('paceNoted'));
    closeFocus(false);
    if (it.kind === 'topic') {
      const m = srModel(it.i);
      openModal(it.i, m.reps.length ? 'review' : 'study');
    } else if (it.kind === 'test') openPt();
    else if (it.id) {
      if (it.kind === 'notes') goView('errors');
      toggleCheck(it.id);
    }
  }
  $('#focusClose').onclick = () => closeFocus(true);
  $('#focusPause').onclick = togglePause;
  $('#focusDone').onclick = finish;
  $('#focusNotes').onclick = () => {
    /* the notes dialog opens over the page; the stopwatch keeps running and focus mode reopens from the bar */
    if (!cur || cur.kind !== 'topic') return;
    const i = cur.i;
    closeFocus(true);
    openNotes(i);
  };
  document.addEventListener('keydown', e => {
    if ($('#focusbg').hidden) return;
    if (e.key === 'Escape') closeFocus(true);
    else if (e.key === ' ' && e.target === document.body) {
      e.preventDefault();
      togglePause();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !$('#focusbg').hidden) {
      keepAwake(true);
      drawClock();
    }
  });
  $('#nowOpen').onclick = () => openFocus();
  $('#nowChk').onclick = e => {
    e.stopPropagation();
    toggleCheck($('#nowChk').dataset.chk);
  };
  $('#planFocus').onclick = () => openFocus();
  return { nextItem, renderNowBar, openFocus, closeFocus };
})();
const { nextItem, renderNowBar, openFocus, closeFocus } = Focus;
