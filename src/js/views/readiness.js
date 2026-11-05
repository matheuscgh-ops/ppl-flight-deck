/* ===== module Readiness (js/views/readiness.js) =====
   public: readiness, renderReady, openReady
   "Ready for the exam?": five checks that say what is still missing before the exam, the exam phase the plan is in
   (see examPhase in js/model/plan.js) and how close the forecast has been to your practice tests (forecastRecord).
   It only reads your data; nothing here changes a statistic or the forecast.

     tests   the last 3 scored practice tests average at least your goal (85% by default)
     pass    chance to pass (≥ 70%) of at least 90%, from the overall forecast
     topics  every topic has a score
     weak    no topic scored below 70%
     due     no spaced-repetition review overdue                                                          */
const Readiness = (() => {
  const PASS_AIM = 0.9,
    WEAK = 70;
  function readiness() {
    const b = blended(),
      last = scoredTests().slice(-3),
      avg = last.length ? last.reduce((a, x) => a + x.score, 0) / last.length : null,
      unscored = TOPICS.map((_, i) => i).filter(i => state.scores[i] == null),
      weak = TOPICS.map((_, i) => i).filter(i => state.scores[i] != null && state.scores[i] < WEAK),
      due = srAll(todayISO(), true).filter(m => m.reps.length && m.over >= 0).length;
    const checks = [
      { k: 'tests', ok: last.length >= 3 && avg >= GOAL, avg, n: last.length },
      { k: 'pass', ok: b.pass >= PASS_AIM, v: b.pass },
      { k: 'topics', ok: !unscored.length, n: unscored.length },
      { k: 'weak', ok: !weak.length, list: weak.sort((x, y) => state.scores[x] - state.scores[y]) },
      { k: 'due', ok: !due, n: due },
    ];
    return {
      checks,
      ok: checks.filter(c => c.ok).length,
      phase: examPhase(),
      days: diffDays(todayISO(), state.deadline),
    };
  }
  const TICK = '<svg class="tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8.4 6.8 11 12 5.4"/></svg>';
  /* the meter in the exam-countdown card: one segment per check */
  function renderReady() {
    const bar = $('#readyBar');
    if (!bar) return;
    const R = readiness(),
      n = R.checks.length;
    $('#readySegs').innerHTML = R.checks.map(c => `<i class="${c.ok ? 'ok' : ''}"></i>`).join('');
    $('#readyTxt').textContent = `${R.ok}/${n}`;
    bar.classList.toggle('stretch', ['stretch', 'week', 'lastday'].includes(R.phase));
    const lbl = t('readyAria').replace('{k}', R.ok).replace('{n}', n);
    bar.setAttribute('aria-label', lbl);
    bar.title = lbl;
    if (!$('#readybg').hidden) fillDialog(R);
  }
  function detail(c) {
    const pct = v => Math.round(v * 100) + '%';
    if (c.k === 'tests')
      return c.n < 3
        ? t('rd_testsFew').replace('{n}', c.n)
        : t('rd_tests').replace('{v}', Math.round(c.avg)).replace('{g}', GOAL);
    if (c.k === 'pass') return t('rd_pass').replace('{v}', pct(c.v)).replace('{a}', pct(PASS_AIM));
    if (c.k === 'topics') return c.n ? t(c.n === 1 ? 'rd_topics1' : 'rd_topics').replace('{n}', c.n) : t('rd_topicsOk');
    if (c.k === 'weak')
      return c.list.length
        ? t('rd_weak')
            .replace('{n}', c.list.length)
            .replace(
              '{list}',
              c.list
                .slice(0, 3)
                .map(i => `${TOPICS[i].name} ${state.scores[i]}%`)
                .join(', ') + (c.list.length > 3 ? '…' : '')
            )
        : t('rd_weakOk');
    return c.n ? t(c.n === 1 ? 'rd_due1' : 'rd_due').replace('{n}', c.n) : t('rd_dueOk');
  }
  function fillDialog(R) {
    const n = R.checks.length,
      df = new Intl.DateTimeFormat(LOCALE[lang], { month: 'short', day: 'numeric' });
    $('#readySub').textContent = (R.days >= 0 ? t('readySub') : t('readySubPast'))
      .replace('{d}', R.days)
      .replace('{k}', R.ok)
      .replace('{n}', n);
    const head =
      R.phase === 'normal'
        ? t('phase_normal').replace('{date}', df.format(parse(addDays(state.deadline, -STRETCH_DAYS))))
        : t('phase_' + R.phase);
    $('#readyPhase').className = 'readyphase ' + R.phase;
    $('#readyPhase').innerHTML =
      `<b>${esc(head)}</b><span>${esc(t('phase_' + R.phase + '_d').replace('{m}', LASTDAY_MAX))}</span>`;
    $('#readyList').innerHTML = R.checks
      .map(
        c =>
          `<li class="${c.ok ? 'ok' : ''}"><span class="rdot">${c.ok ? TICK : ''}</span><span><b>${esc(t('rk_' + c.k))}</b><small>${esc(detail(c))}</small></span></li>`
      )
      .join('');
    const F = forecastRecord(),
      fmt1 = v => (Math.round(v * 10) / 10).toLocaleString(LOCALE[lang]);
    $('#readyRec').innerHTML = `<h4>${esc(t('recTitle'))}</h4>${esc(recText(F, fmt1))}`;
  }
  /* one sentence on the forecast's track record (also in the calibration dialog) */
  function recText(F, fmt1) {
    if (!F.n) return t('recNone');
    const b = F.bias,
      dir = Math.abs(b) < 1 ? t('recEven') : (b > 0 ? t('recUnder') : t('recOver')).replace('{v}', fmt1(Math.abs(b)));
    return (
      t('recTxt').replace('{n}', F.nRecent).replace('{m}', fmt1(F.mae)).replace('{dir}', dir) +
      ' ' +
      t('recBrier').replace('{v}', F.brierPass.toFixed(2))
    );
  }
  const readyDialog = modal('#readybg', { close: '#readyClose' });
  function openReady() {
    fillDialog(readiness());
    readyDialog.open('#readyClose');
  }
  $('#readyBar').addEventListener('click', openReady);
  $('#readyPlan').addEventListener('click', () => {
    readyDialog.close();
    goView('plan');
  });
  return { readiness, renderReady, openReady, recText };
})();
const { readiness, renderReady, openReady, recText } = Readiness;
