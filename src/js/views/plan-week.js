/* ===== module PlanWeek (js/views/plan-week.js) =====
   live value (getter): ROWS
   public: gridHTML, stripHTML, scrollGrid, itemName, ask, activatePlan, savePlan, renderPlanWeek, planLabel
   The Plan tab's week view (what each day holds: daily plan → weekly plan) and the "My plans" list
   (view, edit, activate / deactivate, copy to next week, delete). Also the week grid used by the plan wizard. */
const PlanWeek = (() => {
  /* rows of the time-block grid (15-min slots from the grid start hour to midnight) */
  expose({ ROWS: [() => (DAY_END - DAY_START) / SLOT, () => {}] });
  let weekOf = mondayOf(todayISO()),
    tab = 'week',
    dayIdx = null;

  const dayName = d => new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', day: 'numeric' }).format(parse(d));
  const longDay = d =>
    new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', month: 'short', day: 'numeric' }).format(parse(d));
  const shortDate = d => new Intl.DateTimeFormat(LOCALE[lang], { month: 'short', day: 'numeric' }).format(parse(d));
  const itemName = itemTitle;
  /* own activities and error reviews are measured in minutes, topics and tests in questions */
  const sizeOf = it => (it.kind === 'custom' || it.kind === 'reflect' ? fmtMin(it.min) : it.n + ' q');
  const at = (top, rows) => `top:calc(var(--rowh) * ${top});height:calc(var(--rowh) * ${rows})`;
  function planLabel(p) {
    const range = p.type === 'daily' ? longDay(p.start) : `${shortDate(p.start)} – ${shortDate(addDays(p.start, 6))}`;
    return {
      range,
      name: p.name || (p.type === 'daily' ? longDay(p.start) : t('pwWeekOf').replace('{d}', shortDate(p.start))),
    };
  }

  /* ---------- week grid (view, review or time-block selection) ----------
     data: { blocks: {date: ranges}, items: [], daily: Set of dates that come from a daily plan }
     mode: 'view' (items, click to log) · 'select' (15-min slots you click and drag) */
  /* view mode shows only the hours in use (30 min of margin, whole hours, at least minSpan; the evening when empty).
     The Plan tab asks for 8 hours so the calendar fills the page. */
  function viewHours(days, data, minSpan = 240) {
    let lo = Infinity,
      hi = -Infinity;
    days.forEach(d =>
      ((data.blocks || {})[d] || []).forEach(([s, e]) => {
        lo = Math.min(lo, s);
        hi = Math.max(hi, e);
      })
    );
    (data.items || []).forEach(it => {
      if (!days.includes(it.date)) return;
      lo = Math.min(lo, it.start);
      hi = Math.max(hi, it.start + it.min);
    });
    if (lo === Infinity)
      return [Math.max(DAY_START, 22 * 60 - minSpan), Math.max(DAY_START, 22 * 60 - minSpan) + minSpan];
    let from = Math.max(DAY_START, Math.floor((lo - 30) / 60) * 60),
      to = Math.min(DAY_END, Math.ceil((hi + 30) / 60) * 60);
    while (to - from < minSpan) {
      if (to < DAY_END) to += 60;
      else if (from > DAY_START) from -= 60;
      else break;
    }
    return [from, to];
  }
  function gridHTML(days, data, mode, opts = {}) {
    const today = todayISO(),
      hours = [],
      [from, to] = mode === 'select' ? [DAY_START, DAY_END] : viewHours(days, data, opts.minSpan),
      nRows = (to - from) / SLOT,
      rowOf = m => (Math.max(from, Math.min(to, m)) - from) / SLOT;
    for (let m = from; m < to; m += 60)
      hours.push(`<span class="wkh" style="top:calc(var(--rowh) * ${rowOf(m)})">${clockOf(m)}</span>`);
    const cols = days
      .map(d => {
        const ranges = (data.blocks || {})[d] || [],
          past = d < today;
        let inner = '';
        if (mode === 'select') {
          const on = new Set();
          ranges.forEach(([s, e]) => {
            for (let m = s; m < e; m += SLOT) on.add(m);
          });
          for (let r = 0; r < ROWS; r++) {
            const m = DAY_START + r * SLOT,
              cls = [
                'wks',
                on.has(m) ? 'on' : '',
                m % 60 === 0 ? 'hr' : '',
                opts.anchor && opts.anchor.date === d && opts.anchor.s === m ? 'anchor' : '',
              ]
                .filter(Boolean)
                .join(' ');
            inner += `<i class="${cls}" data-s="${m}"></i>`;
          }
        } else {
          for (let r = 0; r < nRows; r += 4) inner += `<i class="wkline" style="top:calc(var(--rowh) * ${r})"></i>`;
          ranges.forEach(([s, e]) => (inner += `<i class="wkblk" style="${at(rowOf(s), rowOf(e) - rowOf(s))}"></i>`));
          (data.items || [])
            .filter(it => it.date === d)
            .forEach(it => {
              const done = itemDone(it),
                missed = !done && itemMissed(it),
                rows = Math.max(1, it.min / SLOT);
              inner += `<button type="button" class="wki r-${it.kind === 'test' ? 'test' : it.reason || 'custom'}${done ? ' done' : ''}${missed ? ' missed' : ''}${rows < 2 ? ' tiny' : ''}" style="${at(rowOf(it.start), rows)}" data-wi="${esc(it.id)}" title="${esc(`${clockOf(it.start)} · ${itemName(it)} · ${sizeOf(it)}${it.kind === 'reflect' ? ' · ' + reflectDetail(it) : ''}`)}"><b>${done ? '✓ ' : missed ? '! ' : ''}${esc(itemName(it))}</b><span>${clockOf(it.start)} · ${sizeOf(it)}</span></button>`;
            });
          if (d === today) {
            const now = new Date(),
              m = now.getHours() * 60 + now.getMinutes();
            if (m >= from && m <= to) inner += `<i class="wknow" style="top:calc(var(--rowh) * ${rowOf(m)})"></i>`;
          }
        }
        const daily = data.daily && data.daily.has(d);
        return `<div class="wkcol${past ? ' past' : ''}${d === today ? ' today' : ''}" data-d="${d}">${inner}${daily ? '<em class="wkdaily">D</em>' : ''}</div>`;
      })
      .join('');
    const head = days
      .map(d => {
        const tot = rangesTotal((data.blocks || {})[d]);
        return `<span class="wkd${d === today ? ' today' : ''}${d < today ? ' past' : ''}">${esc(dayName(d))}<small>${tot ? fmtMin(tot) : ''}</small></span>`;
      })
      .join('');
    return `<div class="wk ${mode}" style="--days:${days.length};--rows:${ROWS}"><div class="wkhead"><span></span>${head}</div><div class="wkscroll" data-from="${from}"><div class="wkbody" style="height:calc(var(--rowh) * ${nRows})"><div class="wktimes">${hours.join('')}</div>${cols}</div></div></div>`;
  }
  /* phone: one day at a time, picked from a strip */
  /* phone: one day at a time, picked from a 7-day strip (weekday, date, a dot when the day has planned time) */
  function stripHTML(days, idx, attr, blocks = {}) {
    const wd = new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'narrow' });
    return `<div class="wkstrip">${days
      .map(
        (d, k) =>
          `<button type="button" ${attr}="${k}" class="${k === idx ? 'on' : ''}${d === todayISO() ? ' today' : ''}" aria-label="${esc(dayName(d))}"><small>${esc(wd.format(parse(d)))}</small><b>${parse(d).getDate()}</b><i class="${rangesTotal(blocks[d]) ? 'has' : ''}"></i></button>`
      )
      .join('')}</div>`;
  }
  /* scroll the grid to the first planned time (or 17:00) so the evening is in view */
  function scrollGrid(box, blocks, days) {
    const sc = box.querySelector('.wkscroll');
    if (!sc) return;
    let first = Infinity;
    days.forEach(d => ((blocks || {})[d] || []).forEach(([s]) => (first = Math.min(first, s))));
    const m = first < Infinity ? first - 30 : 17 * 60,
      from = +sc.dataset.from || DAY_START,
      rowH = parseFloat(getComputedStyle(sc).getPropertyValue('--rowh')) || 12;
    sc.scrollTop = Math.max(0, ((m - from) / SLOT) * rowH);
  }

  /* ---------- confirm dialog (in the page, never a browser pop-up) ---------- */
  let askDone = null;
  function ask(text, yes) {
    $('#askText').textContent = text;
    $('#askYes').textContent = yes;
    $('#askbg').hidden = false;
    $('#askYes').focus();
    return new Promise(res => (askDone = res));
  }
  function answer(v) {
    $('#askbg').hidden = true;
    if (askDone) askDone(v);
    askDone = null;
  }
  $('#askYes').onclick = () => answer(true);
  $('#askNo').onclick = () => answer(false);
  $('#askbg').addEventListener('pointerdown', e => {
    if (e.target.id === 'askbg') answer(false);
  });
  document.addEventListener(
    'keydown',
    e => {
      if (e.key === 'Escape' && !$('#askbg').hidden) {
        e.stopImmediatePropagation();
        answer(false);
      }
    },
    true
  );

  /* ---------- saving and activating (asks before replacing another active plan) ---------- */
  async function confirmActivation(p) {
    const same = conflictsFor(p),
      under = weeklyUnder(p);
    if (same.length) {
      const ok = await ask(
        t(p.type === 'daily' ? 'askReplaceDaily' : 'askReplaceWeek')
          .replace('{d}', planLabel(p).range)
          .replace('{n}', planLabel(same[0]).name),
        t(p.type === 'daily' ? 'askReplaceDayBtn' : 'askReplaceWeekBtn').replace('{d}', planLabel(p).range)
      );
      if (!ok) return null;
    } else if (under) {
      const ok = await ask(
        t('askOverWeekly').replace('{w}', planLabel(under).range).replace('{d}', longDay(p.start)),
        t('askReplaceDayBtn').replace('{d}', longDay(p.start))
      );
      if (!ok) return null;
    }
    return same;
  }
  async function savePlan(p, activate) {
    let replace = [];
    if (activate) {
      replace = await confirmActivation(p);
      if (replace == null) return false;
    }
    commit(
      () => {
        state.plans = (state.plans || []).filter(x => x.id !== p.id);
        replace.forEach(x => {
          const o = state.plans.find(y => y.id === x.id);
          if (o) o.active = false;
        });
        state.plans.push({ ...p, active: !!activate, updated: Date.now() });
      },
      t(activate ? 'planSavedOn' : 'planSaved')
    );
    return true;
  }
  async function activatePlan(p, on) {
    if (on) {
      const replace = await confirmActivation(p);
      if (replace == null) return;
      commit(() => {
        state.plans.forEach(x => {
          if (replace.some(r => r.id === x.id)) x.active = false;
          if (x.id === p.id) {
            x.active = true;
            x.updated = Date.now();
          }
        });
      }, t('planOn'));
    } else
      commit(() => {
        const x = state.plans.find(y => y.id === p.id);
        if (x) x.active = false;
      }, t('planOff'));
  }

  /* ---------- the Plan tab card ---------- */
  function weekData(days) {
    const blocks = {},
      items = [],
      daily = new Set();
    days.forEach(d => {
      const src = activeFor(d);
      if (!src) return;
      blocks[d] = (src.plan.blocks || {})[d] || [];
      items.push(...(src.plan.items || []).filter(it => it.date === d));
      if (src.kind === 'daily') daily.add(d);
    });
    return { blocks, items, daily };
  }
  /* the calendar reaches the bottom of the screen on every device: the grid takes the height left below it
     (minus the legend and the card's padding), and the rows stretch to fill it (never under 14 px; scrolls if more) */
  function fitGrid() {
    const sc = $('#pwGrid .wkscroll'),
      body = sc && sc.querySelector('.wkbody');
    if (!sc || !body || $('#viewPlan').hidden) return;
    const rows = parseFloat(body.style.height.match(/\*\s*([\d.]+)/)?.[1]) || 32,
      below = ($('#pwLegend').offsetHeight || 0) + (($('#pwGrid .pwempty') || {}).offsetHeight || 0) + 44,
      avail = Math.max(260, Math.floor(innerHeight - (sc.getBoundingClientRect().top + window.scrollY) - below));
    const rowh = Math.max(14, Math.floor(avail / rows));
    sc.closest('.wk').style.setProperty('--rowh', rowh + 'px');
    sc.style.maxHeight = sc.style.height = avail + 'px';
  }
  let fitTimer;
  window.addEventListener('resize', () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => !$('#viewPlan').hidden && renderPlanWeek(), 120);
  });
  function renderPlanWeek() {
    const box = $('#planWeek');
    if (!box) return;
    document.querySelectorAll('#pwTabs button').forEach(b => b.classList.toggle('on', b.dataset.pw === tab));
    $('#pwWeekBox').hidden = tab !== 'week';
    $('#pwPlansBox').hidden = tab !== 'plans';
    const src = activeFor(todayISO());
    $('#pwSource').textContent = src
      ? t('pwFrom')
          .replace('{s}', t(src.kind === 'daily' ? 'srcDaily' : 'srcWeekly'))
          .replace('{n}', planLabel(src.plan).name)
      : t('pwFromSuggested');
    const all = state.plans || [];
    $('#pwTabs [data-pw="plans"]').textContent = `${t('pwPlans')} (${all.length})`;
    if (tab === 'week') {
      const days = Array.from({ length: 7 }, (_, k) => addDays(weekOf, k)),
        data = weekData(days);
      $('#pwRange').textContent = `${shortDate(days[0])} – ${shortDate(days[6])}`;
      if (dayIdx == null) dayIdx = Math.max(0, days.indexOf(todayISO()));
      const phone = phoneMQ.matches,
        shown = phone ? [days[dayIdx]] : days;
      $('#pwStrip').innerHTML = phone ? stripHTML(days, dayIdx, 'data-pwd', data.blocks) : '';
      const empty = !Object.values(data.blocks).some(r => r.length);
      /* weekly review (Cal Newport): planned vs done, so the next plan is based on what really happened */
      const planned = data.items.reduce((a, it) => a + it.min, 0),
        doneMin = data.items.filter(itemDone).reduce((a, it) => a + it.min, 0),
        missed = data.items.filter(itemMissed).length;
      $('#pwProg').hidden = !planned;
      $('#pwProgBar').style.width = planned ? Math.round((100 * doneMin) / planned) + '%' : '0';
      $('#pwProgTxt').textContent = planned
        ? `${fmtMin(doneMin)} / ${fmtMin(planned)}${missed ? ` · ${missed} ${t('pwMissed')}` : ''}`
        : '';
      $('#pwStats').innerHTML = planned
        ? `${esc(t('pwPlanned'))} <b>${fmtMin(planned)}</b> · ${esc(t('planDone'))} <b>${fmtMin(doneMin)}</b>${missed ? ` · <span class="miss">${missed} ${esc(t('pwMissed'))}</span>` : ''}`
        : '';
      /* weekly planning: from Friday on, nudge to plan next week when it has no plan yet */
      const dow = (parse(todayISO()).getDay() + 6) % 7,
        nextMon = addDays(mondayOf(todayISO()), 7),
        hasNext = (state.plans || []).some(p => p.active && p.type === 'weekly' && p.start === nextMon);
      $('#pwNudge').hidden = !(dow >= 4 && !hasNext && weekOf === mondayOf(todayISO()));
      $('#pwNudge').innerHTML =
        `<span>${esc(t('pwNudge'))}</span><button type="button" id="pwNudgeGo">${esc(t('pwNudgeBtn'))}</button>`;
      $('#pwGrid').innerHTML =
        gridHTML(shown, data, 'view', { minSpan: 8 * 60 }) +
        (empty ? `<div class="pwempty">${esc(t('pwEmptyWeek'))}</div>` : '');
      fitGrid();
      scrollGrid($('#pwGrid'), data.blocks, shown);
      $('#pwLegend').innerHTML =
        ['due', 'weak', 'nodata', 'new', 'test']
          .map(r => `<span><i class="r-${r}"></i>${esc(t('rs_' + r))}</span>`)
          .join('') +
        `<span>✓ ${esc(t('planDone'))}</span><span>! ${esc(t('pwMissed'))}</span><span><b class="wkdaily">D</b> ${esc(t('pwDailyDay'))}</span>`;
    } else renderPlansList(all);
  }
  function renderPlansList(all) {
    const sorted = all.slice().sort((a, b) => b.active - a.active || b.start.localeCompare(a.start));
    $('#pwList').innerHTML = sorted.length
      ? sorted
          .map(p => {
            const L = planLabel(p),
              topics = new Set((p.items || []).filter(it => it.kind === 'topic').map(it => it.i)).size;
            return `<div class="pwrow${p.active ? ' on' : ''}" data-pid="${esc(p.id)}"><span class="pwtype ${p.type}">${esc(t(p.type === 'daily' ? 'pDaily' : 'pWeekly'))}</span><span class="pwname">${esc(L.name)}<small>${esc(L.range)} · ${fmtMin(planTotal(p))} · ${esc(tf('pwTopics', topics))}</small></span><span class="pwstat">${esc(t(p.active ? 'pwActive' : 'pwInactive'))}</span><span class="pwacts"><button type="button" data-act="view">${esc(t('pwView'))}</button><button type="button" data-act="edit">${esc(t('pwEdit'))}</button><button type="button" data-act="${p.active ? 'off' : 'on'}">${esc(t(p.active ? 'pwDeactivate' : 'pwActivate'))}</button>${p.type === 'weekly' ? `<button type="button" data-act="copy">${esc(t('pwCopy'))}</button>` : ''}<button type="button" class="danger" data-act="del" aria-label="${esc(t('del'))}"><span class="lglab">×</span><span class="smlab">${esc(t('del'))}</span></button></span></div>`;
          })
          .join('')
      : `<div class="pwempty">${esc(t('pwNoPlans'))}</div>`;
  }

  $('#pwTabs').onclick = e => {
    const b = e.target.closest('[data-pw]');
    if (!b) return;
    tab = b.dataset.pw;
    renderPlanWeek();
  };
  $('#pwPrev').onclick = () => {
    weekOf = addDays(weekOf, -7);
    dayIdx = 0;
    renderPlanWeek();
  };
  $('#pwNext').onclick = () => {
    weekOf = addDays(weekOf, 7);
    dayIdx = 0;
    renderPlanWeek();
  };
  $('#pwRange').onclick = () => $('#pwToday').click();
  $('#pwToday').onclick = () => {
    weekOf = mondayOf(todayISO());
    dayIdx = null;
    renderPlanWeek();
  };
  $('#pwStrip').onclick = e => {
    const b = e.target.closest('[data-pwd]');
    if (!b) return;
    dayIdx = +b.dataset.pwd;
    renderPlanWeek();
  };
  $('#pwGrid').onclick = e => {
    const b = e.target.closest('[data-wi]');
    if (!b) return;
    const it = weekData(Array.from({ length: 7 }, (_, k) => addDays(weekOf, k))).items.find(x => x.id === b.dataset.wi);
    if (!it) return;
    if (it.kind === 'test') openPt();
    else if (it.kind === 'custom' || it.kind === 'reflect') toggleCheck(it.id);
    else openModal(it.i, srModel(it.i).reps.length ? 'review' : 'study');
  };
  $('#pwNew').onclick = () => openWizard({ mode: 'new' });
  $('#pwNudge').onclick = e => {
    if (e.target.closest('#pwNudgeGo'))
      openWizard({ mode: 'new', type: 'weekly', start: addDays(mondayOf(todayISO()), 7) });
  };
  $('#pwList').onclick = e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const p = (state.plans || []).find(x => x.id === b.closest('[data-pid]').dataset.pid);
    if (!p) return;
    const act = b.dataset.act;
    if (act === 'view') openWizard({ mode: 'view', plan: p });
    else if (act === 'edit') openWizard({ mode: 'edit', plan: p });
    else if (act === 'on' || act === 'off') activatePlan(p, act === 'on');
    else if (act === 'copy') openWizard({ mode: 'copy', plan: p });
    else if (act === 'del')
      commit(
        () => {
          state.plans = state.plans.filter(x => x.id !== p.id);
        },
        t('planDeleted').replace('{n}', planLabel(p).name)
      );
  };

  /* ---------- sync today's plan with the Kanban (never automatic: you review the moves and press OK) ----------
     → Doing: topics in today's plan that are in another list
     ← out of Doing: topics in Doing that are not in today's plan go back to the list they came from (else To Do) */
  function kanbanMoves() {
    const planned = [
      ...new Set(
        todayPlan()
          .items.filter(it => it.kind === 'topic')
          .map(it => it.i)
      ),
    ];
    const lastFrom = i => {
      const mv = state.events
        .filter(e => e.kind === 'move' && e.topic === i && e.to === 'Doing' && e.from && e.from !== 'Doing')
        .sort((a, b) => a.date.localeCompare(b.date))
        .pop();
      return mv ? mv.from : 'Todo';
    };
    const into = planned
      .filter(i => state.statuses[i] !== 'Doing')
      .map(i => ({ i, from: state.statuses[i], to: 'Doing' }));
    const out = TOPICS.map((_, i) => i)
      .filter(i => state.statuses[i] === 'Doing' && !planned.includes(i))
      .map(i => ({ i, from: 'Doing', to: lastFrom(i) }));
    return [...into, ...out];
  }
  let kbMoves = [];
  function openKanbanSync() {
    kbMoves = kanbanMoves();
    const T = todayPlan();
    $('#kbSub').textContent =
      T.source === 'suggested'
        ? t('pwFromSuggested')
        : t('pwFrom')
            .replace('{s}', t(T.source === 'daily' ? 'srcDaily' : 'srcWeekly'))
            .replace('{n}', planLabel(T.plan).name);
    $('#kbList').innerHTML = kbMoves.length
      ? kbMoves
          .map(
            (m, k) =>
              `<label class="kbrow"><input type="checkbox" data-kb="${k}" checked><span class="kbn">${esc(TOPICS[m.i].name)}</span><span class="kbmv"><span style="color:${COLORS[STATUS.indexOf(m.from)]}">${esc(label(m.from))}</span> → <span style="color:${COLORS[STATUS.indexOf(m.to)]}">${esc(label(m.to))}</span></span></label>`
          )
          .join('')
      : `<div class="pwempty">${esc(t('kbNothing'))}</div>`;
    paintKbOk();
    kbDialog.open(kbMoves.length ? '#kbOk' : '#kbCancel');
  }
  function paintKbOk() {
    const n = document.querySelectorAll('#kbList [data-kb]:checked').length;
    $('#kbOk').textContent = tf('kbApply', n);
    $('#kbOk').disabled = !n;
  }
  const kbDialog = modal('#kbbg', { close: '#kbClose' }),
    closeKb = kbDialog.close;
  $('#kbSync').onclick = openKanbanSync;
  $('#kbList').addEventListener('change', paintKbOk);
  $('#kbCancel').onclick = closeKb;
  $('#kbOk').onclick = () => {
    const pick = [...document.querySelectorAll('#kbList [data-kb]:checked')].map(x => kbMoves[+x.dataset.kb]);
    closeKb();
    if (!pick.length) return;
    commit(
      () => {
        pick.forEach(m => {
          state.events.push({
            id: uid(),
            date: todayISO(),
            topic: m.i,
            kind: 'move',
            from: m.from,
            to: m.to,
            demo: false,
          });
          state.statuses[m.i] = m.to;
        });
      },
      tf('kbDone', pick.length)
    );
  };

  return { gridHTML, stripHTML, scrollGrid, itemName, ask, activatePlan, savePlan, renderPlanWeek, planLabel };
})();
const { gridHTML, stripHTML, scrollGrid, itemName, ask, activatePlan, savePlan, renderPlanWeek, planLabel } = PlanWeek;
