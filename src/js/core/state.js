/* ===== module AppState (js/core/state.js) =====
   public: normalize, local, t, tf, label, fmt, save, toast, commit, pref, normPrefs
   shared state (getter/setter): embedded, state, loadedFromFile, lang, shown, sel, mKind, prevIds */
const AppState = (() => {
  function normalize(o) {
    if (
      !o ||
      typeof o !== 'object' ||
      !Array.isArray(o.statuses) ||
      o.statuses.length !== TOPICS.length ||
      !Array.isArray(o.events)
    )
      return null;
    const ok = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
    const cl = v => (v == null || v === '' || !isFinite(v) ? null : Math.max(0, Math.min(100, Math.round(+v))));
    return {
      v: 12,
      statuses: o.statuses.map((s, i) => (STATUS.includes(s) ? s : TOPICS[i].status)),
      scores:
        Array.isArray(o.scores) && o.scores.length === TOPICS.length ? o.scores.map(cl) : TOPICS.map(x => x.score),
      events: o.events
        .filter(
          e =>
            e &&
            ok(e.date) &&
            Number.isInteger(e.topic) &&
            TOPICS[e.topic] &&
            ['study', 'review', 'move'].includes(e.kind)
        )
        .map(e => ({
          id: e.id || uid(),
          date: e.date,
          topic: e.topic,
          kind: e.kind,
          from: e.from || null,
          to: e.kind === 'move' ? e.to || e.status || null : null,
          score: cl(e.score),
          partial: !!e.partial,
          demo: !!e.demo,
        })),
      settings:
        o.settings && typeof o.settings === 'object'
          ? {
              minutes: +o.settings.minutes || DEF_SET0.minutes,
              qph: +o.settings.qph || DEF_SET0.qph,
              testEvery:
                o.settings.testEvery != null && Number.isFinite(+o.settings.testEvery)
                  ? +o.settings.testEvery
                  : o.settings.tests != null && Number.isFinite(+o.settings.tests)
                    ? +o.settings.tests > 0
                      ? Math.round(7 / +o.settings.tests)
                      : 0
                    : DEF_SET0.testEvery,
              reviewMin:
                Number.isFinite(+o.settings.reviewMin) && o.settings.reviewMin !== '' && o.settings.reviewMin != null
                  ? +o.settings.reviewMin
                  : DEF_SET0.reviewMin,
              ...normPrefs(o.settings),
            }
          : { ...DEF_SET0 },
      tests: Array.isArray(o.tests)
        ? o.tests
            .filter(x => x && ok(x.date))
            .map(x => ({ id: x.id || uid(), date: x.date, q: +x.q || 60, score: cl(x.score) }))
        : [],
      deadline: ok(o.deadline) ? o.deadline : '2026-11-30',
      lang: I18N[o.lang] ? o.lang : 'en',
      plan:
        o.plan && ok(o.plan.date)
          ? {
              date: o.plan.date,
              energy: ['low', 'medium', 'high'].includes(o.plan.energy) ? o.plan.energy : 'medium',
              test: !!o.plan.test,
            }
          : null,
      plans: Array.isArray(o.plans) ? o.plans.map(normPlan).filter(Boolean) : [],
      /* ids of deleted events / tests / plans (so a sync merge never brings them back); kept 60 days */
      deleted:
        o.deleted && typeof o.deleted === 'object'
          ? Object.fromEntries(
              Object.entries(o.deleted).filter(
                ([k, d]) => typeof k === 'string' && ok(d) && Date.now() - Date.parse(d) < 60 * 864e5
              )
            )
          : {},
      updatedAt: +o.updatedAt || 0,
    };
  }
  /* the Settings values (PREF_DEF); only allowed values are kept, anything else falls back to the default */
  const PREF_OK = {
    goal: v => [80, 85, 90].includes(v),
    reviewAt: v => [0.8, 0.85, 0.9, 0.95].includes(v),
    halfLife: v => [7, 10, 14, 21].includes(v),
    idleDays: v => [2, 3, 4, 5].includes(v),
    energy: v => ['low', 'medium', 'high'].includes(v),
    carousel: v => typeof v === 'boolean',
    heatNums: v => typeof v === 'boolean',
    gridStart: v => [5, 6, 7, 8, 9].includes(v),
    deepMin: v => [0, 30, 45, 60, 90].includes(v),
    reflect: v => typeof v === 'boolean',
  };
  const RANGE_OK = {
    sr: ['3d', '7d', '2w', '1m', '3m', '6m', '1y', 'all'],
    card: ['3d', '7d', '2w', '1m', '3m', '6m', '1y', 'all'],
    vol: ['3d', '7d', '2w', '1m', '3m', '6m', '1y', 'all'],
    ts: ['3d', '7d', '2w', '1m', '3m', '6m', '1y', 'all'],
    heat: ['2w', '1m', '3m', '6m', '1y'],
  };
  function normPrefs(o) {
    const out = {};
    Object.keys(PREF_OK).forEach(k => {
      if (o && o[k] != null && PREF_OK[k](o[k])) out[k] = o[k];
    });
    if (o && o.ranges && typeof o.ranges === 'object') {
      const r = {};
      Object.keys(RANGE_OK).forEach(k => {
        if (RANGE_OK[k].includes(o.ranges[k])) r[k] = o.ranges[k];
      });
      if (Object.keys(r).length) out.ranges = r;
    }
    return out;
  }
  /* a saved study plan (see Schedule); anything malformed is dropped */
  function normPlan(p) {
    const ok = s => /^\d{4}-\d{2}-\d{2}$/.test(s || ''),
      mins = v => Number.isInteger(v) && v >= 0 && v <= 1440;
    if (!p || typeof p !== 'object' || !['daily', 'weekly'].includes(p.type) || !ok(p.start)) return null;
    const blocks = {};
    Object.entries(p.blocks && typeof p.blocks === 'object' ? p.blocks : {}).forEach(([d, rs]) => {
      if (!ok(d) || !Array.isArray(rs)) return;
      const clean = rs.filter(r => Array.isArray(r) && mins(r[0]) && mins(r[1]) && r[1] > r[0]).map(r => [r[0], r[1]]);
      if (clean.length) blocks[d] = clean;
    });
    const energy = {};
    Object.entries(p.energy && typeof p.energy === 'object' ? p.energy : {}).forEach(([d, e]) => {
      if (ok(d) && ['low', 'medium', 'high'].includes(e)) energy[d] = e;
    });
    const items = (Array.isArray(p.items) ? p.items : [])
      .filter(
        it =>
          it &&
          ok(it.date) &&
          mins(it.start) &&
          +it.min > 0 &&
          (it.kind === 'test' ||
            it.kind === 'custom' ||
            it.kind === 'reflect' ||
            (it.kind === 'topic' && Number.isInteger(it.i) && TOPICS[it.i]))
      )
      .map(it => {
        const o = {
          id: String(it.id || uid()),
          date: it.date,
          start: it.start,
          min: Math.round(+it.min),
          kind: it.kind,
          i: it.kind === 'topic' ? it.i : null,
          n: Math.max(0, Math.round(+it.n || 0)),
          reason: typeof it.reason === 'string' ? it.reason.slice(0, 12) : 'custom',
        };
        if (it.kind === 'custom') o.label = String(it.label || '').slice(0, 60);
        if (it.kind === 'reflect')
          o.parts = (Array.isArray(it.parts) ? it.parts : [])
            .filter(x => x && (x.i === -1 || (Number.isInteger(x.i) && TOPICS[x.i])) && Number.isFinite(+x.m))
            .map(x => ({ i: x.i, m: Math.max(0, Math.round(+x.m)) }))
            .slice(0, 8);
        if (it.custom) o.custom = true;
        if (it.check) o.check = true;
        return o;
      });
    const extra = p.demo ? { demo: true } : {};
    return {
      id: String(p.id || uid()),
      type: p.type,
      name: String(p.name || '').slice(0, 40),
      start: p.start,
      active: !!p.active,
      blocks,
      energy,
      items,
      created: +p.created || 0,
      updated: +p.updated || 0,
      ...extra,
    };
  }
  function readLocal() {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORE)));
    } catch (e) {
      return null;
    }
  }
  let embedded = null;
  try {
    embedded = normalize(JSON.parse($('#embedded').textContent));
  } catch (e) {}
  const local = readLocal();
  let state,
    loadedFromFile = false;
  if (embedded && (!local || embedded.updatedAt > local.updatedAt)) {
    state = embedded;
    loadedFromFile = !!local;
  } else state = local || embedded || defaultState();
  try {
    const e = JSON.parse(localStorage.getItem(STORE + '-energy') || 'null'),
      pt = localStorage.getItem(STORE + '-ptday'),
      d = new Date(),
      td = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!state.plan && ((e && e.d === td) || pt === td))
      state.plan = { date: td, energy: e && e.d === td ? e.m : 'medium', test: pt === td };
    localStorage.removeItem(STORE + '-energy');
    localStorage.removeItem(STORE + '-ptday');
  } catch (e) {}
  let lang = state.lang,
    shown = new Date(),
    sel = -1,
    mKind = 'study';

  /* a Settings value, or its default */
  const pref = k => {
    const s = state && state.settings;
    return s && s[k] != null ? s[k] : PREF_DEF[k];
  };
  /* labels can carry live values: {G} goal %, {GN} right answers needed for it, {RV} review threshold % */
  const t = k => {
    const v = (I18N[lang] || I18N.en)[k] ?? I18N.en[k];
    return typeof v === 'string'
      ? v
          .replace(/\{G\}/g, GOAL)
          .replace(/\{GN\}/g, GOAL_N)
          .replace(/\{RV\}/g, Math.round(pref('reviewAt') * 100))
      : v;
  };
  const tf = (k, n) => t(k).replace('{n}', n);
  const label = s => t('labels')[STATUS.indexOf(s)];
  const fmt = (n, d = 0) =>
    new Intl.NumberFormat(LOCALE[lang], { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  /* remember which ids existed; any that disappear (delete, undo of an add, import) become tombstones */
  var prevIds = null;
  function trackDeletes() {
    const now = new Set([...state.events, ...(state.tests || []), ...(state.plans || [])].map(x => x.id));
    state.deleted ??= {};
    if (prevIds)
      prevIds.forEach(id => {
        if (!now.has(id)) state.deleted[id] = todayISO();
      });
    now.forEach(id => {
      if (state.deleted[id]) delete state.deleted[id];
    });
    prevIds = now;
  }
  function save(stamp = true) {
    trackDeletes();
    if (stamp) state.updatedAt = Date.now();
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
    } catch (e) {}
    if (stamp && typeof schedulePush === 'function') schedulePush();
  }

  let toastTimer;
  function toast(msg, undoFn) {
    const n = $('#toast');
    n.innerHTML = `<span>${esc(msg)}</span>` + (undoFn ? `<button type="button">${esc(t('undo'))}</button>` : '');
    if (undoFn)
      n.querySelector('button').onclick = () => {
        n.classList.remove('show');
        undoFn();
      };
    n.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => n.classList.remove('show'), undoFn ? 6000 : 2300);
  }
  function commit(mut, msg) {
    const before = JSON.stringify(state);
    mut();
    save();
    render();
    toast(msg, () => {
      state = JSON.parse(before);
      lang = state.lang;
      save();
      render();
      toast(t('undone'));
    });
  }
  expose({
    embedded: [
      () => embedded,
      x => {
        embedded = x;
      },
    ],
    state: [
      () => state,
      x => {
        state = x;
      },
    ],
    loadedFromFile: [
      () => loadedFromFile,
      x => {
        loadedFromFile = x;
      },
    ],
    lang: [
      () => lang,
      x => {
        lang = x;
      },
    ],
    shown: [
      () => shown,
      x => {
        shown = x;
      },
    ],
    sel: [
      () => sel,
      x => {
        sel = x;
      },
    ],
    mKind: [
      () => mKind,
      x => {
        mKind = x;
      },
    ],
    prevIds: [
      () => prevIds,
      x => {
        prevIds = x;
      },
    ],
  });
  return { normalize, local, t, tf, label, fmt, save, toast, commit, pref, normPrefs };
})();
const { normalize, local, t, tf, label, fmt, save, toast, commit, pref, normPrefs } = AppState;
