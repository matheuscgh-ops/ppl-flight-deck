/* ===== module Settings (js/ui/settings.js) =====
   public: openSettings, closeSettings, setPref
   The gear in the header opens Settings. Every choice is applied at once, saved in your data (so it syncs and goes
   into the backup) and can be undone from the toast. The defaults are the values the app always used.
   Sections: exam · goal & memory · daily plan · plans · charts · display · sync · data · demo. */
const Settings = (() => {
  const RANGES = ['3d', '7d', '2w', '1m', '3m', '6m', '1y', 'all'];
  const HEAT_RANGES = ['2w', '1m', '3m', '6m', '1y'];
  const rangeLabel = r => (r === 'all' ? t('rAll') : r.toUpperCase());

  /* ---------- applying a change ---------- */
  function setPref(key, value) {
    commit(() => {
      state.settings = { ...(state.settings || {}), [key]: value };
    }, t('setSaved'));
    renderSettings();
  }
  /* the current interval of each chart, and how to change it */
  const RANGE_KINDS = {
    sr: { get: () => srRange, set: v => setSrRange(v), list: RANGES },
    card: {
      get: () => srCardRange,
      set: v => {
        srCardRange = v;
        try {
          localStorage.setItem(STORE + '-srcr', v);
        } catch (e) {}
      },
      list: RANGES,
    },
    vol: { get: () => volRange, set: v => (volRange = v), list: RANGES },
    ts: {
      get: () => tsRange,
      set: v => {
        tsRange = v;
        try {
          localStorage.setItem(STORE + '-tsr', v);
        } catch (e) {}
      },
      list: RANGES,
    },
    heat: {
      get: () => heatRange,
      set: v => {
        heatRange = v;
        try {
          localStorage.setItem(STORE + '-heatr', v);
        } catch (e) {}
      },
      list: HEAT_RANGES,
    },
  };
  function setRange(kind, v) {
    RANGE_KINDS[kind].set(v);
    setPref('ranges', { ...pref('ranges'), [kind]: v });
  }
  /* default intervals chosen in Settings win over this device's last choice when the app opens */
  function applyRanges() {
    const r = pref('ranges') || {};
    Object.entries(r).forEach(([k, v]) => {
      if (!RANGE_KINDS[k]) return;
      if (k === 'sr') srRange = v;
      else RANGE_KINDS[k].set(v);
    });
  }
  applyRanges();

  /* ---------- building the form ---------- */
  const opt = (v, label, cur) =>
    `<option value="${esc(String(v))}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
  const select = (id, options, cur) =>
    `<select id="${id}" data-set="${id}">${options.map(([v, l]) => opt(v, l, cur)).join('')}</select>`;
  const row = (labelKey, control, hintKey) =>
    `<div class="setrow"><span class="setlab">${esc(t(labelKey))}${hintKey ? `<small>${esc(t(hintKey))}</small>` : ''}</span>${control}</div>`;
  const toggle = (id, on) =>
    `<label class="switch"><input type="checkbox" id="${id}" data-set="${id}"${on ? ' checked' : ''}><span></span></label>`;
  const section = (titleKey, rows) => `<section class="setsec"><h4>${esc(t(titleKey))}</h4>${rows.join('')}</section>`;

  function renderSettings() {
    if ($('#setbg').hidden) return;
    const st = settings(),
      days = n => tf('setDays', n);
    $('#setBody').innerHTML = [
      section('setExamTitle', [
        row('setExamDate', `<input type="date" id="setExam" data-set="setExam" value="${state.deadline}">`),
        row(
          'setLang',
          select(
            'setLang',
            [
              ['en', 'English'],
              ['pt', 'Português'],
              ['ja', '日本語'],
            ],
            lang
          )
        ),
      ]),
      section('setGoalTitle', [
        row(
          'setGoal',
          select(
            'setGoal',
            [80, 85, 90].map(v => [v, v + '%']),
            pref('goal')
          ),
          'setGoalHint'
        ),
        row(
          'setReviewAt',
          select(
            'setReviewAt',
            [0.8, 0.85, 0.9, 0.95].map(v => [v, Math.round(v * 100) + '%']),
            pref('reviewAt')
          ),
          'setReviewAtHint'
        ),
        row(
          'setHalfLife',
          select(
            'setHalfLife',
            [7, 10, 14, 21].map(v => [v, days(v)]),
            pref('halfLife')
          ),
          'setHalfLifeHint'
        ),
        row(
          'setIdle',
          select(
            'setIdle',
            [2, 3, 4, 5].map(v => [v, days(v)]),
            pref('idleDays')
          ),
          'setIdleHint'
        ),
      ]),
      section('setPlanTitle', [
        row(
          'setMinutes',
          `<span class="setslider"><input type="range" id="setMin" data-set="setMin" min="30" max="360" step="15" value="${st.minutes}"><output id="setMinOut">${fmtMin(st.minutes)}</output></span>`
        ),
        row(
          'setQph',
          select(
            'setQphSel',
            [20, 25, 30, 35, 40, 45, 50, 60, 70, 80]
              .map(v => [v, String(v)])
              .concat([20, 25, 30, 35, 40, 45, 50, 60, 70, 80].includes(st.qph) ? [] : [[st.qph, String(st.qph)]]),
            st.qph
          )
        ),
        row(
          'setReview',
          select(
            'setReviewSel',
            [0, 0.5, 1, 1.5, 2, 3, 4]
              .map(v => [v, v + ' min'])
              .concat([0, 0.5, 1, 1.5, 2, 3, 4].includes(st.reviewMin) ? [] : [[st.reviewMin, st.reviewMin + ' min']]),
            st.reviewMin
          )
        ),
        row(
          'setTestsS',
          select(
            'setTestsSel',
            [[0, t('setOff')], ...[1, 2, 3, 4, 5, 6, 7, 10, 14].map(v => [v, days(v)])].concat(
              [0, 1, 2, 3, 4, 5, 6, 7, 10, 14].includes(st.testEvery) ? [] : [[st.testEvery, days(st.testEvery)]]
            ),
            st.testEvery
          )
        ),
        row(
          'setEnergy',
          select(
            'setEnergy',
            ['low', 'medium', 'high'].map(v => [v, t('en_' + v)]),
            pref('energy')
          ),
          'setEnergyHint'
        ),
        `<p class="setnote">${esc(t('setPlanNote'))} ${esc(t('planWeights'))}</p>`,
      ]),
      section('setPlansTitle', [
        row(
          'setGridStart',
          select(
            'setGridStart',
            [5, 6, 7, 8, 9].map(v => [v, clockOf(v * 60)]),
            pref('gridStart')
          )
        ),
        row(
          'setDeep',
          select('setDeep', [[0, t('setOff')], ...[30, 45, 60, 90].map(v => [v, tf('setDeepN', v)])], pref('deepMin')),
          'setDeepHint'
        ),
        row('setReflect', toggle('setReflect', pref('reflect')), 'setReflectHint'),
      ]),
      section(
        'setChartsTitle',
        [
          ['sr', 'setRangeSr'],
          ['card', 'setRangeCard'],
          ['vol', 'setRangeVol'],
          ['ts', 'setRangeTs'],
          ['heat', 'setRangeHeat'],
        ].map(([k, lk]) =>
          row(
            lk,
            select(
              'setRange_' + k,
              RANGE_KINDS[k].list.map(v => [v, rangeLabel(v)]),
              RANGE_KINDS[k].get()
            )
          )
        )
      ),
      section('setDisplayTitle', [
        row('setCarousel', toggle('setCarousel', pref('carousel')), 'setCarouselHint'),
        row('setHeatNums', toggle('setHeatNums', pref('heatNums'))),
      ]),
    ].join('');
    $('#setSync').hidden = BUILD.demo;
    $('#setDemo').hidden = !BUILD.demo;
    $('#setSyncState').textContent = ($('#syncChip span') && $('#syncChip span').textContent) || '';
    $('#clearDemo').hidden = !state.events.some(e => e.demo);
  }

  /* ---------- reading the form ---------- */
  $('#setBody').addEventListener('input', e => {
    if (e.target.id === 'setMin') $('#setMinOut').textContent = fmtMin(+e.target.value);
  });
  $('#setBody').addEventListener('change', e => {
    const el = e.target,
      id = el.dataset.set;
    if (!id) return;
    const v = el.type === 'checkbox' ? el.checked : el.value;
    const plan = k =>
      commit(() => (state.settings = { ...settings(), ...(state.settings || {}), [k]: +v }), t('setSaved'));
    if (id === 'setExam') {
      if (v) commit(() => (state.deadline = v), t('saved'));
    } else if (id === 'setLang') document.querySelector(`.flag[data-lang="${v}"]`).click();
    else if (id === 'setGoal') setPref('goal', +v);
    else if (id === 'setReviewAt') setPref('reviewAt', +v);
    else if (id === 'setHalfLife') setPref('halfLife', +v);
    else if (id === 'setIdle') setPref('idleDays', +v);
    else if (id === 'setMin') plan('minutes');
    else if (id === 'setQphSel') plan('qph');
    else if (id === 'setReviewSel') plan('reviewMin');
    else if (id === 'setTestsSel') plan('testEvery');
    else if (id === 'setEnergy') {
      setPref('energy', v);
      if (!state.plan || state.plan.date !== todayISO()) energyMode = v;
    } else if (id === 'setGridStart') setPref('gridStart', +v);
    else if (id === 'setDeep') setPref('deepMin', +v);
    else if (id.startsWith('setRange_')) setRange(id.slice(9), v);
    else if (id === 'setCarousel') setPref('carousel', v);
    else if (id === 'setHeatNums') setPref('heatNums', v);
    else if (id === 'setReflect') setPref('reflect', v);
    renderSettings();
  });

  /* ---------- open / close, sync, reset ---------- */
  const setDialog = modal('#setbg', { close: '#setClose' }),
    closeSettings = setDialog.close;
  function openSettings() {
    setDialog.open('#setClose');
    renderSettings();
  }
  $('#setOpen').onclick = openSettings;
  $('#setSyncOpen').onclick = () => {
    closeSettings();
    $('#syncChip').click();
  };
  $('#setReset').onclick = async () => {
    if (!(await ask(t('setResetAsk'), t('setReset')))) return;
    const keepLang = lang;
    commit(() => {
      state = normalize(defaultState()) || defaultState();
      state.lang = keepLang;
      state.plans = state.plans || [];
    }, t('setResetDone'));
    renderSettings();
  };

  return { openSettings, closeSettings, setPref };
})();
const { openSettings, closeSettings, setPref } = Settings;
