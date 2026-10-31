/* ===== module PlanView (js/views/plan.js) =====
   public: renderPlanMini, renderPlanPage, manualTest, setManualTest, draftSettings */
const PlanView = (() => {
  /* totals of today's list, whatever drives it (a saved plan or the suggestion) */
  function todayList() {
    const T = todayPlan();
    if (T.source === 'suggested') return { ...buildPlan(null, null, energyMode), source: 'suggested' };
    const sum = (arr, k) => arr.reduce((a, x) => a + (x[k] || 0), 0),
      P = buildPlan(null, null, energyMode);
    return {
      ...P,
      source: T.source,
      plan: T.plan,
      items: T.items,
      total: sum(T.items, 'n'),
      minutes: sum(T.items, 'min'),
      done: sum(
        T.items.filter(x => x.done),
        'n'
      ),
      budget: rangesTotal((T.plan.blocks || {})[todayISO()]),
    };
  }
  const rowAttr = it =>
    it.kind === 'test' ? 'data-pt="1"' : it.kind === 'custom' ? `data-cid="${esc(it.id)}"` : `data-q="${it.i}"`;
  const rowName = it => (it.kind === 'custom' ? it.label || t('wzCustomDefault') : planRowName(it));
  const checkBtn = it =>
    it.id
      ? `<button type="button" class="pck" data-chk="${esc(it.id)}" aria-label="${esc(t('itemCheck'))}">${it.done ? '✓' : ''}</button>`
      : `<span class="pck">${it.done ? '✓' : ''}</span>`;
  function renderPlanMini() {
    const P = todayList(),
      fromPlan = P.source !== 'suggested';
    $('#planMiniMode').textContent = fromPlan
      ? t(P.source === 'daily' ? 'srcDaily' : 'srcWeekly')
      : t('en_' + energyMode);
    $('#planMiniMode').className = 'enpill ' + (fromPlan ? 'fromplan' : energyMode);
    $('#planMiniTot').textContent = `· ${P.total} q · ${fmtMin(P.minutes)}`;
    $('#sugg').innerHTML = P.items.length
      ? P.items
          .map(
            it =>
              `<div class="qrow${it.done ? ' done' : ''}" ${rowAttr(it)} title="${esc(t('reason_' + it.reason))}">${checkBtn(it)}<span class="qt">${it.start != null ? `<small class="qtime">${clockOf(it.start)}</small>` : ''}${esc(rowName(it))}</span><span class="pq">${it.n ? it.n + ' q' : it.kind === 'custom' ? fmtMin(it.min) : ''}</span><span class="rchip ${it.reason}">${esc(t('rs_' + it.reason))}</span></div>`
          )
          .join('')
      : `<div class="muted">${esc(t(fromPlan ? 'planRestDay' : 'allClear'))}</div>`;
  }
  function renderPlanPage() {
    renderPlanPt();
    renderPlanWeek();
    const P = todayList(),
      fromPlan = P.source !== 'suggested',
      st = settings(),
      df = new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'long', day: 'numeric', month: 'long' });
    $('#energyPick').innerHTML = ['low', 'medium', 'high']
      .map(m => {
        const Q = buildPlan(null, null, m);
        return `<button type="button" role="tab" data-energy="${m}" class="${m === energyMode ? 'on' : ''}" aria-selected="${m === energyMode}"><span class="en">${['low', 'medium', 'high'].indexOf(m) === 0 ? '🔋' : m === 'medium' ? '⚡' : '🚀'} ${esc(t('en_' + m))}</span><span class="es">${Q.total} q · ${fmtMin(Q.minutes)}</span><span class="ew"><i style="width:${Q.workload * 10}%"></i></span><span class="es">${esc(t('workload'))} ${Q.workload}/10</span></button>`;
      })
      .join('');
    $('#energyPick').hidden = fromPlan;
    $('#planSub').textContent =
      df.format(parse(todayISO())) +
      (fromPlan
        ? ' · ' +
          t('pwFrom')
            .replace('{s}', t(P.source === 'daily' ? 'srcDaily' : 'srcWeekly'))
            .replace('{n}', planLabel(P.plan).name)
        : ' · ' + t('pwFromSuggested')) +
      (P.final ? ' · ' + t('planFinal') : '');
    $('#planKpis').innerHTML =
      `<div><b>${fmtMin(P.minutes)}</b><span>${esc(t('planMinOf').replace('{b}', fmtMin(P.budget)))}</span></div><div><b>${P.total}</b><span>${esc(t('planQToday'))}</span></div><div><b>${P.done}</b><span>${esc(t('planDone'))}</span></div><div><b>${P.pace}</b><span>${esc(t('planPace'))}</span></div><div><b>${P.daysLeft}</b><span>${esc(t('toGo'))}</span></div>`;
    $('#planList').innerHTML = P.items.length
      ? P.items
          .map(
            it =>
              `<div class="pitem2${it.done ? ' done' : ''}${it.done || it.date == null || !itemMissed(it) ? '' : ' missed'}" ${rowAttr(it)}>${checkBtn(it)}<span class="pn">${it.start != null ? `<small class="qtime">${clockOf(it.start)}–${clockOf(it.start + it.min)}</small>` : ''}${esc(rowName(it))}<small>${esc(t('reason_' + it.reason))}${it.diff > 1.05 ? ' · ' + esc(t(it.diff >= 2 ? 'diffCalc' : it.diff >= 1.5 ? 'diffNav' : 'diffChart')) : ''}${it.p != null && it.kind === 'topic' ? ' · ' + esc(t('planChance').replace('{p}', Math.round(it.p * 100))) : ''}${it.stake ? ' · ' + esc(t('planStake').replace('{x}', it.stake.toFixed(1))) : ''}</small></span><span class="rchip ${it.reason}">${esc(t('rs_' + it.reason))}</span><span class="pq">${it.n ? it.n + ' q' : ''}<small>${it.min ? '~' + fmtMin(it.min) : ''}</small></span></div>`
          )
          .join('')
      : `<div class="muted">${esc(t(fromPlan ? 'planRestDay' : 'allClear'))}</div>`;
    ['minutes', 'qph', 'testEvery', 'reviewMin'].forEach(k => {
      const el = $('#' + SET_ID[k]);
      if (document.activeElement !== el) el.value = st[k];
    });
    updateDraft();
  }
  /* a practice test the user added to today's plan by hand (per device, per day) */
  const manualTest = d => (d || todayISO()) === todayISO() && !!planDay().test;
  function setManualTest(on) {
    state.plan = { ...planDay(), test: !!on };
    save();
    render();
  }
  function renderPlanPt() {
    if (!$('#planPt')) return;
    const w = testWhy(),
      k = testKpis(),
      df = new Intl.DateTimeFormat(LOCALE[lang], { month: 'short', day: 'numeric' }),
      last = scoredTests().at(-1);
    const inPlan = buildPlan(null, null, energyMode).items.some(x => x.kind === 'test'),
      man = manualTest();
    const parts = [
      !w.every
        ? t('tsOff')
        : w.due
          ? t('tsNextToday') + ' · ' + t('reason_' + w.reason)
          : t('tsNextIn').replace('{n}', diffDays(todayISO(), w.next)),
    ];
    if (last)
      parts.push(
        t('ppLast')
          .replace('{d}', df.format(parse(last.date)))
          .replace('{s}', last.score)
      );
    $('#ppInfo').textContent = parts.join(' · ');
    const b = $('#ppAdd');
    b.textContent = t(man ? 'ppRemove' : inPlan ? 'ppInPlan' : 'ppAdd');
    b.disabled = inPlan && !man;
  }
  $('#ppAdd').onclick = () => setManualTest(!manualTest());
  $('#ppLog').onclick = () => openPt();
  function startPlanItem(el) {
    if (!el) return;
    if (el.dataset.cid) {
      toggleCheck(el.dataset.cid);
      return;
    }
    if (el.dataset.pt) {
      openPt();
      return;
    }
    const i = +el.dataset.q;
    openModal(i, srModel(i).reps.length ? 'review' : 'study');
  }
  $('#energyPick').addEventListener('click', e => {
    const b = e.target.closest('[data-energy]');
    if (!b) return;
    const l = $('#planList');
    l.classList.add('loading');
    setTimeout(() => {
      setEnergy(b.dataset.energy);
      l.classList.remove('loading');
      void l.offsetWidth;
      l.classList.add('fresh');
    }, 250);
  });
  /* the circle marks a saved plan's item done by hand; the row opens the log dialog */
  function onCheck(e) {
    const c = e.target.closest('[data-chk]');
    if (!c) return false;
    e.stopPropagation();
    toggleCheck(c.dataset.chk);
    return true;
  }
  $('#planList').addEventListener('click', e => {
    if (!onCheck(e)) startPlanItem(e.target.closest('[data-q],[data-pt],[data-cid]'));
  });
  $('#sugg').addEventListener('click', e => onCheck(e), true);
  $('#openPlan').onclick = () => goView('plan');
  function openFcTop() {
    const B = blended(),
      top = B.parts
        .slice()
        .sort((a, b) => b.lost - a.lost)
        .slice(0, 3),
      mx = Math.max(0.01, ...top.map(x => x.lost));
    $('#fcTopDesc').textContent = t('fcTopDesc')
      .replace('{s}', Math.round(B.mu * 100))
      .replace('{p}', Math.round(B.pass * 100))
      .replace('{g}', Math.round(B.goal * 100));
    $('#fcTopList').innerHTML = top
      .map(
        x =>
          `<div class="lostrow" data-q="${x.i}"><span class="n">${esc(TOPICS[x.i].name)}</span><span class="bar"><i style="width:${(x.lost / mx) * 100}%"></i></span><span class="v">−${x.lost.toFixed(1)} q</span><span class="pp">${x.known ? Math.round(x.p * 100) + '%' : '?'}</span></div>`
      )
      .join('');
    $('#fcTopBg').hidden = false;
    $('#fcTopFull').focus();
  }
  const closeFcTop = () => {
    $('#fcTopBg').hidden = true;
  };
  $('#fcMini').onclick = openFcTop;
  $('#fcTopClose').onclick = closeFcTop;
  $('#fcTopBg').addEventListener('pointerdown', e => {
    if (e.target.id === 'fcTopBg') closeFcTop();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#fcTopBg').hidden) closeFcTop();
  });
  $('#fcTopFull').onclick = () => {
    closeFcTop();
    goView('sr', 'fc');
  };
  const SET_LIM = { minutes: [15, 600], qph: [5, 200], testEvery: [0, 14], reviewMin: [0, 10] };
  const SET_ID = { minutes: 'setMinutes', qph: 'setQph', testEvery: 'setTests', reviewMin: 'setReviewMin' };
  function draftSettings() {
    const d = { ...settings() };
    ['minutes', 'qph', 'testEvery', 'reviewMin'].forEach(k => {
      const el = $('#' + SET_ID[k]);
      const raw = +el.value,
        v = k === 'reviewMin' ? Math.round(raw * 2) / 2 : Math.round(raw);
      if (el.value !== '' && isFinite(v)) d[k] = Math.max(SET_LIM[k][0], Math.min(SET_LIM[k][1], v));
    });
    return d;
  }
  function updateDraft() {
    const d = draftSettings(),
      P = buildPlan(null, d, energyMode),
      ch = JSON.stringify(d) !== JSON.stringify(settings());
    $('#planCap').textContent = t(ch ? 'planCapNew' : 'planCapTxt')
      .replace('{c}', P.total)
      .replace('{m}', fmtMin(d.minutes));
    $('#planCap').classList.toggle('changed', ch);
  }
  ['Minutes', 'Qph', 'Tests', 'ReviewMin'].forEach(k => {
    const el = $('#set' + k);
    el.addEventListener('input', updateDraft);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        calcPlan();
      }
    });
  });
  let calcBusy = false;
  function calcPlan() {
    if (calcBusy) return;
    calcBusy = true;
    const d = draftSettings(),
      btn = $('#planCalc'),
      list = $('#planList');
    btn.disabled = true;
    btn.querySelector('.spin').hidden = false;
    list.classList.add('loading');
    list.classList.remove('fresh');
    setTimeout(() => {
      const changed = JSON.stringify(d) !== JSON.stringify(settings());
      if (changed)
        commit(() => {
          state.settings = d;
        }, t('planUpdated'));
      else renderPlanPage();
      list.classList.remove('loading');
      void list.offsetWidth;
      list.classList.add('fresh');
      btn.disabled = false;
      btn.querySelector('.spin').hidden = true;
      calcBusy = false;
      $('#viewPlan').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 450);
  }
  $('#planCalc').onclick = calcPlan;
  return { renderPlanMini, renderPlanPage, manualTest, setManualTest, draftSettings };
})();
const { renderPlanMini, renderPlanPage, manualTest, setManualTest, draftSettings } = PlanView;
