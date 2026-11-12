/* ===== module AppState (js/core/state.js) =====
   public: normalize, local, t, tf, label, fmt, save, toast, commit, pref, normPrefs, normOrder, asaShort, asaLong
   shared state (getter/setter): embedded, state, loadedFromFile, lang, shown, sel, mKind, prevIds */
const AppState = (() => {
  /* data saved before topics were added (26 of them) gets the new ones at the end, with their starting status and no
     score; a list longer than the app's topics is not ours */
  const OLD_TOPIC_COUNT = 26;
  const padTopics = (arr, fill) =>
    Array.isArray(arr) && arr.length >= OLD_TOPIC_COUNT && arr.length < TOPICS.length
      ? arr.concat(TOPICS.slice(arr.length).map(fill))
      : arr;
  const ATTEMPTS = ['first', 'new', 'repeat', 'after'];
  const WHY_ACTIVITIES = ['newQ', 'concept', 'guided', 'retrieval', 'fluency', 'diagnostic'];
  const WHY_KEYS = [
    'last',
    'lastPct',
    'sportys',
    'examMisses',
    'missTags',
    'due',
    'mastery',
    'understanding',
    'forgetting',
    'pending',
    'idle',
    'newMat',
    'share',
  ];
  /* an imported practice test as stored: unknown values stay unknown (null), never filled in */
  function normExams(list) {
    const ok = s => /^\d{4}-\d{2}-\d{2}$/.test(s || ''),
      int = v => (Number.isInteger(v) && v >= 0 ? v : null),
      str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
    return (Array.isArray(list) ? list : [])
      .filter(x => x && ok(x.date) && str(x.examId, 80) && (x.mode === 'full' || x.mode === 'errors'))
      .map(x => ({
        id: String(x.id || uid()).slice(0, 40),
        examId: str(x.examId, 80),
        date: x.date,
        platform: str(x.platform, 60),
        mode: x.mode,
        coverage: x.coverage === 'complete' ? 'complete' : 'partial',
        total: int(x.total),
        right: int(x.right),
        wrong: int(x.wrong),
        topics: (Array.isArray(x.topics) ? x.topics : [])
          .filter(t => t && Number.isInteger(t.i) && TOPICS[t.i])
          .map(t => ({
            i: t.i,
            total: int(t.total),
            right: int(t.right),
            wrong: int(t.wrong),
            seconds: int(t.seconds),
          })),
        misses: (Array.isArray(x.misses) ? x.misses : [])
          .filter(q => q && Number.isInteger(q.i) && TOPICS[q.i])
          .slice(0, 300)
          .map(q => ({
            i: q.i,
            qid: str(q.qid, 80),
            tags: (Array.isArray(q.tags) ? q.tags : [])
              .map(tg => str(tg, 40))
              .filter(Boolean)
              .slice(0, 6),
            acs: str(q.acs, 30),
            conf: Number.isFinite(q.conf) ? Math.max(0, Math.min(1, q.conf)) : null,
            errorType: str(q.errorType, 20),
            note: str(q.note, 500),
            seconds: int(q.seconds),
          })),
        importedAt: +x.importedAt || 0,
        ...(typeof x.sig === 'string' ? { sig: x.sig.slice(0, 20) } : {}),
      }))
      .slice(-300);
  }
  function normalize(o) {
    if (o && typeof o === 'object' && Array.isArray(o.statuses) && o.statuses.length < TOPICS.length) {
      const n = o.statuses.length;
      o = { ...o, statuses: padTopics(o.statuses, x => x.status) };
      if (Array.isArray(o.scores) && o.scores.length === n) o.scores = padTopics(o.scores, () => null);
    }
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
        .map(e => {
          const r = {
            id: e.id || uid(),
            date: e.date,
            topic: e.topic,
            kind: e.kind,
            from: e.from || null,
            to: e.kind === 'move' ? e.to || e.status || null : null,
            score: cl(e.score),
            partial: !!e.partial,
            demo: !!e.demo,
          };
          /* a session's sample (right answers of how many questions) and kind of attempt, when they were recorded —
             records without them keep an unknown sample (nothing is invented) */
          const n = Math.round(+e.total),
            k = Math.round(+e.right);
          if (e.kind !== 'move' && Number.isFinite(n) && n > 0 && Number.isFinite(k) && k >= 0 && k <= n) {
            r.total = n;
            r.right = k;
          }
          if (e.kind !== 'move' && ATTEMPTS.includes(e.attempt)) r.attempt = e.attempt;
          return r;
        }),
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
            .filter(x => !x.proj)
            .map(x => ({
              id: x.id || uid(),
              date: x.date,
              q: +x.q || 60,
              score: cl(x.score),
              /* a test imported from a file: the id of its record in exams, and its right answers */
              ...(typeof x.exam === 'string' && x.exam ? { exam: x.exam.slice(0, 80) } : {}),
              ...(Number.isInteger(x.right) && x.right >= 0 && x.right <= (+x.q || 60) ? { right: x.right } : {}),
            }))
        : [],
      /* practice tests imported from a file (see ExamImport): their topic results and misses, as evidence */
      exams: normExams(o.exams),
      deadline: ok(o.deadline) ? o.deadline : '2026-11-30',
      /* error notebook: what you got wrong in a topic (topic -1 = practice test), shown again when it comes back */
      notes: (Array.isArray(o.notes) ? o.notes : [])
        .filter(
          n =>
            n &&
            ok(n.date) &&
            typeof n.text === 'string' &&
            n.text.trim() &&
            (n.topic === -1 || (Number.isInteger(n.topic) && TOPICS[n.topic]))
        )
        .map(n => ({
          id: String(n.id || uid()).slice(0, 40),
          topic: n.topic,
          date: n.date,
          text: n.text.trim().slice(0, 2000),
        }))
        .slice(-2000),
      /* your pace: how long topic blocks took against the estimate (see paceFactor), the last 400 */
      paces: (Array.isArray(o.paces) ? o.paces : [])
        .filter(
          x => x && ok(x.date) && Number.isInteger(x.topic) && TOPICS[x.topic] && +x.min > 0 && +x.est > 0 && +x.n > 0
        )
        .map(x => ({
          id: String(x.id || uid()).slice(0, 40),
          topic: x.topic,
          date: x.date,
          n: Math.round(+x.n),
          min: +x.min,
          est: +x.est,
          src: x.src === 'focus' ? 'focus' : 'tick',
          /* what the estimate covered: answering only, or answering and review (older ones: unknown, not used) */
          ...(x.basis === 'answer' || x.basis === 'all' ? { basis: x.basis } : {}),
        }))
        .slice(-400),
      /* Kanban cards ticked "done today": card key (topic number or your card's id) → the date it was ticked */
      cardChecks:
        o.cardChecks && typeof o.cardChecks === 'object'
          ? Object.fromEntries(Object.entries(o.cardChecks).filter(([k, d]) => ok(d) && k.length <= 40))
          : {},
      /* your own cards on the Kanban (tasks such as "Review the theory"): a title and a list, no questions or score */
      cards: normCards(o.cards),
      /* the order of the cards inside the Kanban lists (where you dropped them): topic numbers and your cards' ids */
      order: normOrder(o.order, normCards(o.cards)),
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
    asa: v => typeof v === 'boolean',
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
      mins = v => Number.isInteger(v) && v >= 0 && v <= 48 * 60; /* a block may run past midnight (the study day) */
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
            it.kind === 'notes' ||
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
        if (it.kind === 'reflect' && typeof it.of === 'string') o.of = it.of.slice(0, 40);
        /* why the planner chose a topic block (shown under it): the activity and the main reasons, as planned */
        if (it.kind === 'topic' && WHY_ACTIVITIES.includes(it.activity)) o.activity = it.activity;
        if (it.kind === 'topic' && ['low', 'medium', 'high'].includes(it.conf)) o.conf = it.conf;
        if (it.kind === 'topic' && Array.isArray(it.why))
          o.why = it.why
            .filter(w => w && WHY_KEYS.includes(w.k))
            .slice(0, 10)
            .map(w =>
              Object.fromEntries(
                Object.entries(w)
                  .filter(([k, v]) => k.length <= 8 && (typeof v !== 'object' || (Array.isArray(v) && v.length <= 3)))
                  .map(([k, v]) => [
                    k,
                    Array.isArray(v) ? v.map(x => String(x).slice(0, 40)) : typeof v === 'string' ? v.slice(0, 20) : v,
                  ])
              )
            );
        if (it.custom) o.custom = true;
        if (it.check) o.check = true;
        if (it.check && Number.isFinite(+it.checkedAt) && +it.checkedAt > 0) o.checkedAt = +it.checkedAt;
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
  /* demo: a demo saved before the Errors tab existed gets the example error notes too */
  if (BUILD.demo && typeof demoNotes === 'function' && !(state.notes || []).length) state.notes = demoNotes();
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
  /* the matching ASA Prepware chapter of topic i (Settings › Display › ASA), short for cards and plan rows,
     long (with the chapters it also shows up in) for the log dialog and focus mode; '' when off */
  const asaShort = i => {
    const a = pref('asa') && asaOf(i);
    return a ? t('asaShort').replace('{c}', a.main) : '';
  };
  const asaLong = i => {
    const a = pref('asa') && asaOf(i);
    if (!a) return '';
    const also = a.also.length ? (lang === 'ja' ? '' : ' ') + t('asaAlso').replace('{c}', a.also.join(', ')) : '';
    return t('asaLong').replace('{c}', a.main) + also;
  };
  const label = s => t('labels')[STATUS.indexOf(s)];
  const fmt = (n, d = 0) =>
    new Intl.NumberFormat(LOCALE[lang], { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  /* remember which ids existed; any that disappear (delete, undo of an add, import) become tombstones */
  var prevIds = null;
  function normCards(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : [])
      .filter(c => c && typeof c.title === 'string' && c.title.trim() && STATUS.includes(c.status))
      .map(c => ({ id: String(c.id || uid()).slice(0, 40), title: c.title.trim().slice(0, 80), status: c.status }))
      .filter(c => !seen.has(c.id) && seen.add(c.id))
      .slice(0, 200);
  }
  /* every topic and every card once, in your order; anything missing goes to the end */
  function normOrder(order, cards) {
    const keys = [...TOPICS.map((_, i) => i), ...cards.map(c => c.id)],
      valid = new Set(keys),
      out = [];
    (Array.isArray(order) ? order : []).forEach(k => {
      if (valid.has(k) && !out.includes(k)) out.push(k);
    });
    keys.forEach(k => {
      if (!out.includes(k)) out.push(k);
    });
    return out;
  }
  function trackDeletes() {
    const now = new Set(
      [
        ...state.events,
        ...(state.tests || []),
        ...(state.plans || []),
        ...(state.cards || []),
        ...(state.notes || []),
        ...(state.exams || []),
      ].map(x => x.id)
    );
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
    if (typeof clearModels === 'function') clearModels();
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
  return { normalize, local, t, tf, label, fmt, save, toast, commit, pref, normPrefs, normOrder, asaShort, asaLong };
})();
const { normalize, local, t, tf, label, fmt, save, toast, commit, pref, normPrefs, normOrder, asaShort, asaLong } =
  AppState;
