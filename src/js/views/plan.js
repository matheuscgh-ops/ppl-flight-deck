/* ===== module PlanView (js/views/plan.js) =====
   public: renderPlanMini, renderPlanPage, renderPlanPt, manualTest, setManualTest */
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
    it.kind === 'test'
      ? 'data-pt="1"'
      : it.kind === 'custom' || it.kind === 'reflect'
        ? `data-cid="${esc(it.id)}"`
        : `data-q="${it.i}"`;
  const rowName = it => (it.kind === 'topic' || it.kind === 'test' ? planRowName(it) : itemTitle(it));
  const checkBtn = it =>
    it.id
      ? `<button type="button" class="pck" data-chk="${esc(it.id)}" aria-label="${esc(t('itemCheck'))}">${it.done ? '✓' : ''}</button>`
      : `<span class="pck">${it.done ? '✓' : ''}</span>`;
  /* error notebook: a 📝 button on error-review rows (write what you got wrong), and the count on a topic that has notes */
  function noteBtn(it) {
    if (it.kind === 'reflect') {
      const ts = (it.parts || []).map(x => x.i);
      if (!ts.length) return '';
      const n = ts.reduce((a, i) => a + notesOf(i).length, 0);
      return `<button type="button" class="notebtn" data-note="${ts[0]}" data-ntopics="${ts.join(',')}" data-nitem="${esc(it.id || '')}" aria-label="${esc(t('notesTitle'))}">📝${n ? ' ' + n : ''}</button>`;
    }
    if (it.kind === 'topic' && notesOf(it.i).length)
      return `<button type="button" class="notebtn" data-note="${it.i}" aria-label="${esc(t('notesTitle'))}">📝 ${notesOf(it.i).length}</button>`;
    return '';
  }
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
              `<div class="qrow${it.done ? ' done' : ''}" ${rowAttr(it)} title="${esc(t('reason_' + it.reason))}">${checkBtn(it)}<span class="qt">${it.start != null ? `<small class="qtime">${clockOf(it.start)}</small>` : ''}${esc(rowName(it))}${noteBtn(it)}</span><span class="pq">${it.n ? it.n + ' q' : it.kind === 'custom' || it.kind === 'reflect' ? fmtMin(it.min) : ''}</span><span class="rchip ${it.reason}">${esc(t('rs_' + it.reason))}</span></div>`
          )
          .join('')
      : `<div class="muted">${esc(t(fromPlan ? 'planRestDay' : 'allClear'))}</div>`;
  }
  /* the Plan tab: the week view, and today's energy when today comes from the suggestion */
  function renderPlanPage() {
    renderPlanWeek();
    const fromPlan = todayPlan().source !== 'suggested';
    $('#pwEnergy').hidden = fromPlan;
    if (fromPlan) return;
    $('#energySel').innerHTML = ['low', 'medium', 'high']
      .map(m => `<option value="${m}"${m === energyMode ? ' selected' : ''}>${esc(t('en_' + m))}</option>`)
      .join('');
    $('#energyPick').innerHTML = ['low', 'medium', 'high']
      .map(m => {
        const Q = buildPlan(null, null, m),
          icon = { low: '🔋', medium: '⚡', high: '🚀' }[m];
        return `<button type="button" role="tab" data-energy="${m}" class="${m === energyMode ? 'on' : ''}" aria-selected="${m === energyMode}" title="${esc(t('workload'))} ${Q.workload}/10"><span class="en">${icon} ${esc(t('en_' + m))}</span><span class="es">${Q.total} q · ${fmtMin(Q.minutes)}</span></button>`;
      })
      .join('');
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
    const T = todayPlan(),
      fromPlan = T.source !== 'suggested',
      inPlan = T.items.some(x => x.kind === 'test'),
      man = !fromPlan && manualTest();
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
  /* with a saved plan driving today, the test goes into that plan: the first free time in today's blocks that fits it;
     no room → offer to open the plan and make some */
  async function addTestToPlan(plan) {
    const today = todayISO(),
      need = testMinutes(),
      items = (plan.items || []).filter(it => it.date === today);
    const slot = ((plan.blocks || {})[today] || [])
      .map(([s, e]) => {
        const end = items
          .filter(it => it.start >= s && it.start < e)
          .reduce((a, it) => Math.max(a, it.start + it.min), s);
        return { start: end, free: e - end };
      })
      .find(x => x.free >= need);
    if (!slot) {
      if (await ask(t('ppNoRoom').replace('{m}', fmtMin(need)), t('pwEdit'))) openWizard({ mode: 'edit', plan });
      return;
    }
    commit(() => {
      const p = state.plans.find(x => x.id === plan.id);
      p.items.push({
        id: uid(),
        date: today,
        start: slot.start,
        min: need,
        kind: 'test',
        i: null,
        n: TEST_Q,
        reason: 'test',
        custom: true,
      });
      p.updated = Date.now();
    }, t('ppAddedToPlan'));
  }
  $('#ppAdd').onclick = () => {
    const T = todayPlan();
    if (T.source === 'suggested') setManualTest(!manualTest());
    else addTestToPlan(T.plan);
  };
  $('#ppLog').onclick = () => openPt();
  $('#energySel').addEventListener('change', e => setEnergy(e.target.value));
  $('#energyPick').addEventListener('click', e => {
    const b = e.target.closest('[data-energy]');
    if (b) setEnergy(b.dataset.energy);
  });
  /* the circle marks a saved plan's item done by hand; the row opens the log dialog */
  function onCheck(e) {
    const nb = e.target.closest('[data-note]');
    if (nb) {
      e.stopPropagation();
      openNotes(+nb.dataset.note, {
        topics: nb.dataset.ntopics ? nb.dataset.ntopics.split(',').map(Number) : null,
        itemId: nb.dataset.nitem || null,
      });
      return true;
    }
    const c = e.target.closest('[data-chk]');
    if (!c) return false;
    e.stopPropagation();
    toggleCheck(c.dataset.chk);
    return true;
  }
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
    fcTopDialog.open('#fcTopFull');
  }
  const fcTopDialog = modal('#fcTopBg', { close: '#fcTopClose' }),
    closeFcTop = fcTopDialog.close;
  $('#fcMini').onclick = openFcTop;
  $('#fcTopFull').onclick = () => {
    closeFcTop();
    goView('sr', 'fc');
  };
  return { renderPlanMini, renderPlanPage, renderPlanPt, manualTest, setManualTest };
})();
const { renderPlanMini, renderPlanPage, renderPlanPt, manualTest, setManualTest } = PlanView;
