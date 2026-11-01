/* ===== module PlanWizard (js/views/plan-wizard.js) =====
   public: openWizard, closeWizard, wizardState
   Creating, editing and viewing a plan in four steps:
     ① Type          daily (one date) or weekly (Mon–Sun of one week)
     ② Time blocks   click and drag down a day in 15-minute steps (touch: tap a start, then tap an end).
                     A drag stays in the day where it started, even if the pointer drifts into another day,
                     and stops when the button is released. Undo / Redo, clear a day, copy a day to the others.
     ③ Topics        suggested from your statistics (Schedule.suggestDays), editable: change, remove, move up,
                     add a topic in free time; energy per day.
     ④ Review        the week as it will look, then save (and activate, asking before replacing another plan). */
const PlanWizard = (() => {
  let W = null;
  const STEPS = ['wzType', 'wzBlocks', 'wzTopics', 'wzReview'];
  const ENERGIES = ['low', 'medium', 'high'];
  const days = () => planDays({ type: W.type, start: W.start });
  const longDay = d =>
    new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', month: 'short', day: 'numeric' }).format(parse(d));
  const shortDate = d => new Intl.DateTimeFormat(LOCALE[lang], { month: 'short', day: 'numeric' }).format(parse(d));
  const firstOpenWeek = () => {
    const m = mondayOf(todayISO());
    return addDays(m, 6) >= todayISO() ? m : addDays(m, 7);
  };
  const slotsOf = rs => {
    const out = new Set();
    (rs || []).forEach(([s, e]) => {
      for (let m = s; m < e; m += SLOT) out.add(m);
    });
    return out;
  };
  const totalBlocked = () => days().reduce((a, d) => a + rangesTotal(W.blocks[d]), 0);
  const snapshot = () => JSON.stringify(W.blocks);
  /* the day the Clear / Copy buttons act on: the last one edited, else the shown day (phone), else the first open day */
  const currentDay = () =>
    W.lastDay || (phoneMQ.matches ? days()[W.dayIdx] : days().find(d => d >= todayISO()) || days()[0]);

  /* ---------- open / close ---------- */
  function openWizard({ mode, plan, type, start }) {
    const base = plan ? JSON.parse(JSON.stringify(plan)) : null;
    W = {
      mode,
      step: mode === 'new' ? 1 : mode === 'view' ? 4 : 2,
      id: mode === 'edit' || mode === 'view' ? base.id : uid(),
      type: base ? base.type : type || 'daily',
      start: base ? (mode === 'copy' ? addDays(base.start, 7) : base.start) : start || todayISO(),
      name: base && mode !== 'copy' ? base.name || '' : '',
      blocks: {},
      items: [],
      energy: {},
      active: base && mode !== 'copy' ? base.active : false,
      hist: [],
      fut: [],
      dayIdx: 0,
      anchor: null,
      lastDay: null,
      changed: new Set(),
      editItem: null,
      addAt: null,
    };
    if (base) {
      const shift = mode === 'copy' ? 7 : 0;
      Object.entries(base.blocks || {}).forEach(([d, rs]) => (W.blocks[addDays(d, shift)] = rs.map(r => r.slice())));
      Object.entries(base.energy || {}).forEach(([d, e]) => (W.energy[addDays(d, shift)] = e));
      if (mode === 'copy') days().forEach(d => W.changed.add(d));
      else W.items = (base.items || []).map(it => ({ ...it }));
    }
    W.dayIdx = Math.max(0, days().indexOf(todayISO()));
    $('#wizbg').hidden = false;
    renderWizard();
  }
  function closeWizard() {
    $('#wizbg').hidden = true;
    W = null;
    render();
  }

  /* ---------- rendering ---------- */
  function renderWizard() {
    if (!W) return;
    const view = W.mode === 'view';
    $('#wzTitle').textContent = t(view ? 'wzViewTitle' : W.mode === 'edit' ? 'wzEditTitle' : 'wzNewTitle');
    $('#wzSteps').innerHTML = view
      ? ''
      : STEPS.map(
          (k, j) =>
            `<span class="${j + 1 === W.step ? 'on' : j + 1 < W.step ? 'past' : ''}"><b>${j + 1}</b>${esc(t(k))}</span>`
        ).join('<i></i>');
    $('#wzPresets').innerHTML = t('wzPresetList')
      .split('|')
      .map(x => `<option value="${esc(x)}"></option>`)
      .join('');
    const body = $('#wzBody');
    if (W.step === 1) body.innerHTML = stepType();
    if (W.step === 2) body.innerHTML = stepBlocks();
    if (W.step === 3) body.innerHTML = stepTopics();
    if (W.step === 4) body.innerHTML = stepReview();
    if (W.step === 2 || W.step === 4) {
      const shown = phoneMQ.matches ? [days()[W.dayIdx]] : days();
      scrollGrid(body, W.blocks, shown);
    }
    const back = $('#wzBack'),
      next = $('#wzNext'),
      save2 = $('#wzSaveOff');
    back.hidden = view || W.step === 1 || (W.mode !== 'new' && W.mode !== 'copy' && W.step === 2);
    back.textContent = t('wzBack');
    save2.hidden = view || W.step !== 4;
    save2.textContent = t('wzSaveOff');
    next.textContent = view ? t('pwEdit') : W.step === 4 ? t('wzSaveOn') : t('wzNext');
    next.disabled = !view && W.step === 2 && !totalBlocked();
  }

  function stepType() {
    const wk = W.type === 'weekly';
    return `<div class="wztypes">${['daily', 'weekly']
      .map(
        k =>
          `<button type="button" class="wztype${W.type === k ? ' on' : ''}" data-wtype="${k}"><b>${k === 'daily' ? '☀' : '▦'} ${esc(t(k === 'daily' ? 'pDailyLong' : 'pWeeklyLong'))}</b><span>${esc(t(k === 'daily' ? 'wzDailyHint' : 'wzWeeklyHint'))}</span></button>`
      )
      .join('')}</div>
      <div class="wzfields">${
        wk
          ? `<div class="field"><span class="flabel">${esc(t('wzWeek'))}</span><div class="wzweek"><button type="button" id="wzWkPrev" aria-label="Previous week">‹</button><b>${esc(shortDate(W.start))} – ${esc(shortDate(addDays(W.start, 6)))}</b><button type="button" id="wzWkNext" aria-label="Next week">›</button></div></div>`
          : `<label class="field"><span class="flabel">${esc(t('date'))}</span><input type="date" id="wzDate" min="${todayISO()}" value="${W.start}"></label>`
      }<label class="field"><span class="flabel">${esc(t('wzName'))}</span><input id="wzName" maxlength="40" placeholder="${esc(t('wzNameHint'))}" value="${esc(W.name)}"></label></div>
      <p class="wztip">${esc(t('wzTipDeep'))}</p>`;
  }

  function blockTips() {
    const tips = [];
    days().forEach(d =>
      (W.blocks[d] || []).forEach(([s, e]) => {
        if (e - s > 120) tips.push(t('wzTipLong').replace('{d}', longDay(d)).replace('{t}', clockOf(s)));
        else if (e - s < 30) tips.push(t('wzTipShort').replace('{d}', longDay(d)).replace('{t}', clockOf(s)));
      })
    );
    return tips.slice(0, 3);
  }
  function stepBlocks() {
    const ds = days(),
      phone = phoneMQ.matches,
      shown = phone ? [ds[W.dayIdx]] : ds,
      cur = currentDay();
    const tools = `<div class="wztools"><button type="button" id="wzUndo" ${W.hist.length ? '' : 'disabled'}>↶ ${esc(t('undo'))}</button><button type="button" id="wzRedo" ${W.fut.length ? '' : 'disabled'}>↷ ${esc(t('redo'))}</button><button type="button" id="wzClear" ${rangesTotal(W.blocks[cur]) ? '' : 'disabled'}>${esc(t('wzClear').replace('{d}', longDay(cur)))}</button>${W.type === 'weekly' ? `<button type="button" id="wzCopy" ${rangesTotal(W.blocks[cur]) ? '' : 'disabled'}>${esc(t('wzCopyDay').replace('{d}', longDay(cur)))}</button>` : ''}<span class="wztotal">${esc(t('wzTotal'))} <b>${fmtMin(totalBlocked())}</b></span></div>`;
    const tips = blockTips();
    return `<p class="wzhint">${esc(t(matchMedia('(hover:none)').matches ? 'wzHintTouch' : 'wzHintMouse'))}</p>${tools}${phone && ds.length > 1 ? stripHTML(ds, W.dayIdx, 'data-wzd', W.blocks) : ''}<div id="wzGrid">${gridHTML(shown, { blocks: W.blocks }, 'select', { anchor: W.anchor })}</div>${tips.length ? `<div class="wztips">${tips.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}`;
  }

  /* ---------- step 3: topics ---------- */
  function fitsBlock(it, rs) {
    return (rs || []).some(([s, e]) => it.start >= s && it.start < e);
  }
  function prepareTopics(force) {
    const ds = days().filter(d => d >= todayISO());
    W.items = W.items.filter(it => ds.includes(it.date) && fitsBlock(it, W.blocks[it.date]));
    const todo = ds.filter(
      d => rangesTotal(W.blocks[d]) && (force || W.changed.has(d) || !W.items.some(it => it.date === d))
    );
    if (!todo.length) return;
    W.items = W.items.filter(it => !todo.includes(it.date));
    const out = suggestDays(todo, W.blocks, Object.fromEntries(ds.map(d => [d, W.energy[d] || 'medium'])));
    Object.values(out).forEach(list => W.items.push(...list));
    W.changed.clear();
  }
  /* lay the items of one block one after the other, in their current order */
  function repack(d, s, e) {
    let t0 = s;
    W.items
      .filter(it => it.date === d && it.start >= s && it.start < e)
      .sort((a, b) => a.start - b.start || (a.ord ?? 0) - (b.ord ?? 0))
      .forEach(it => {
        it.start = t0;
        t0 += it.min;
      });
  }
  /* a topic and the error review of its misses move and go together; a review without its topic stands alone */
  function groupsOf(list) {
    const sorted = list.slice().sort((a, b) => a.start - b.start),
      gs = [];
    sorted.forEach(it => {
      const owner = it.kind === 'reflect' && it.of && gs.find(g => g[0].id === it.of);
      if (owner) owner.push(it);
      else gs.push([it]);
    });
    return gs;
  }
  function itemMinutes(kind, i, n, d) {
    return kind === 'test' ? testMinutes() : Math.max(1, Math.round(n * perQ(i, d, W.energy[d]).per));
  }
  function topicOptions(sel) {
    return (
      `<option value="c"${sel === 'c' ? ' selected' : ''}>${esc(t('wzCustom'))}</option>` +
      `<option value="t"${sel === 't' ? ' selected' : ''}>${esc(t('practiceTest'))}</option>` +
      TOPICS.map((x, i) => ({ x, i }))
        .sort((a, b) => a.x.name.localeCompare(b.x.name))
        .map(
          ({ x, i }) => `<option value="${i}"${String(sel) === String(i) ? ' selected' : ''}>${esc(x.name)}</option>`
        )
        .join('')
    );
  }
  /* one editor for a topic, the practice test or your own activity ("Review the material", "Simulator" …):
     for your own activity the number is minutes and you type a name; for a topic it is questions */
  function editorHTML(attrs, it, okAct, cancelAct) {
    const kind = it ? (it.kind === 'test' ? 't' : it.kind === 'custom' ? 'c' : String(it.i)) : '',
      isC = kind === 'c';
    return `<div class="wzit edit" ${attrs} data-kind="${isC ? 'c' : kind === 't' ? 't' : 'q'}"><select data-f="topic">${topicOptions(kind)}</select><input data-f="label" list="wzPresets" maxlength="60" placeholder="${esc(t('wzCustomHint'))}" value="${esc(it && it.label ? it.label : '')}"><input type="number" data-f="n" min="1" max="600" value="${it ? (isC ? it.min : it.n) : 10}" aria-label="${esc(t('wzAmount'))}"><span class="wzunit">${esc(isC ? 'min' : 'q')}</span><button type="button" class="primary" data-wact="${okAct}">✓</button><button type="button" data-wact="${cancelAct}">✕</button></div>`;
  }
  function readEditor(box, d) {
    const sel = box.querySelector('[data-f="topic"]').value,
      num = Math.max(1, Math.min(600, Math.round(+box.querySelector('[data-f="n"]').value || 10)));
    if (sel === 'c') {
      const label = box.querySelector('[data-f="label"]').value.trim() || t('wzCustomDefault');
      return { kind: 'custom', i: null, n: 0, min: num, label, reason: 'custom' };
    }
    const kind = sel === 't' ? 'test' : 'topic',
      i = kind === 'topic' ? +sel : null,
      n = kind === 'test' ? TEST_Q : Math.min(200, num);
    return { kind, i, n, min: itemMinutes(kind, i, n, d), label: undefined };
  }
  function stepTopics() {
    const ds = days().filter(d => rangesTotal(W.blocks[d]));
    if (!ds.length) return `<div class="pwempty">${esc(t('wzNoBlocks'))}</div>`;
    const top = `<div class="wztools"><button type="button" id="wzResuggest">↻ ${esc(t('wzResuggest'))}</button><span class="wztotal">${esc(t('wzPlanned'))} <b>${fmtMin(W.items.reduce((a, it) => a + it.min, 0))}</b> / ${fmtMin(totalBlocked())}</span></div>`;
    return (
      top +
      ds
        .map(d => {
          const rs = W.blocks[d],
            past = d < todayISO(),
            en = W.energy[d] || 'medium',
            dayItems = W.items.filter(it => it.date === d);
          const head = `<div class="wzdh"><b>${esc(longDay(d))}</b><span>${fmtMin(rangesTotal(rs))} ${esc(t('wzBlocked'))} · ${fmtMin(dayItems.reduce((a, it) => a + it.min, 0))} ${esc(t('wzPlannedLow'))}</span>${past ? '' : `<div class="seg wzen" data-wzen="${d}">${ENERGIES.map(m => `<button type="button" data-en="${m}" class="${m === en ? 'on' : ''}">${esc(t('en_' + m))}</button>`).join('')}</div>`}</div>`;
          const blocks = rs
            .map(([s, e]) => {
              const its = dayItems.filter(it => it.start >= s && it.start < e).sort((a, b) => a.start - b.start),
                used = its.reduce((a, it) => a + it.min, 0),
                free = e - s - used;
              const row = it => {
                if (W.editItem === it.id) return editorHTML(`data-wid="${esc(it.id)}"`, it, 'ok', 'cancel');
                const r = it.kind === 'test' ? 'test' : it.reason || 'custom';
                /* the review of a topic's misses sits right under it, as part of that topic */
                const child = it.kind === 'reflect' && it.of && its.some(x => x.id === it.of);
                const minutesOnly = it.kind === 'custom' || it.kind === 'reflect',
                  sub = child
                    ? t('reflectMisses').replace('{n}', it.parts[0].m)
                    : it.kind === 'reflect'
                      ? reflectDetail(it)
                      : t('rs_' + r) + (it.kind === 'custom' ? '' : ' · ' + t('wzGoal'));
                /* drag the card (or its grip on touch screens) to move it; click or tap it to edit */
                const editable = !past && it.kind !== 'reflect';
                return `<div class="wzit r-${r}${child ? ' child' : ''}${editable ? ' editable' : ''}" data-wid="${esc(it.id)}"${editable ? ` role="button" tabindex="0" aria-label="${esc(t('pwEdit') + ': ' + itemName(it))}"` : ''}><span class="wzt">${child || past ? '' : `<span class="wzgrip" aria-hidden="true">⠿</span>`}${clockOf(it.start)}</span><span class="wzn">${esc(itemName(it))}<small>${esc(sub)}</small></span><span class="wzq">${minutesOnly ? '' : it.n + ' q · '}${fmtMin(it.min)}</span><span class="wzacts">${past ? '' : `<button type="button" data-wact="del" aria-label="${esc(t('del'))}">×</button>`}</span></div>`;
              };
              const rows = groupsOf(its)
                .map(g => `<div class="wzg" data-gid="${esc(g[0].id)}">${g.map(row).join('')}</div>`)
                .join('');
              const key = `${d}|${s}`;
              const add =
                W.addAt === key
                  ? editorHTML(`data-wadd="${key}"`, null, 'addok', 'addcancel')
                  : free >= 5 && !past
                    ? `<div class="wzfree"><span>${esc(t('wzFree').replace('{m}', fmtMin(free)))}</span><button type="button" data-wact="add" data-key="${key}">+ ${esc(t('wzAdd'))}</button></div>`
                    : free < 0
                      ? `<div class="wzfree over"><span>${esc(t('wzOver').replace('{m}', fmtMin(-free)))}</span></div>`
                      : '';
              return `<div class="wzblk" data-d="${d}" data-s="${s}" data-e="${e}"><div class="wzbh">${clockOf(s)}–${clockOf(e)} · ${fmtMin(e - s)}</div>${rows || `<div class="wzfree"><span>${esc(t('wzNothingFits'))}</span></div>`}${add}</div>`;
            })
            .join('');
          return `<section class="wzday" data-d="${d}">${head}${blocks}</section>`;
        })
        .join('')
    );
  }

  /* ---------- step 4: review ---------- */
  function stepReview() {
    const ds = days(),
      phone = phoneMQ.matches,
      shown = phone ? [ds[W.dayIdx]] : ds,
      topics = new Set(W.items.filter(it => it.kind === 'topic').map(it => it.i)).size,
      L = planLabel({ type: W.type, start: W.start, name: W.name });
    return `<div class="wzsum"><div><b>${esc(L.name)}</b><span>${esc(t(W.type === 'daily' ? 'pDaily' : 'pWeekly'))} · ${esc(L.range)}</span></div><div><b>${fmtMin(totalBlocked())}</b><span>${esc(t('wzBlocked'))}</span></div><div><b>${fmtMin(W.items.reduce((a, it) => a + it.min, 0))}</b><span>${esc(t('wzPlannedLow'))}</span></div><div><b>${topics}</b><span>${esc(tf('pwTopics', topics).replace(/^\d+\s*/, ''))}</span></div></div>${phone && ds.length > 1 ? stripHTML(ds, W.dayIdx, 'data-wzd', W.blocks) : ''}<div id="wzGrid">${gridHTML(shown, { blocks: W.blocks, items: W.items }, 'view')}</div>`;
  }

  /* ---------- step navigation ---------- */
  function buildPlanObject() {
    const ds = days(),
      blocks = {},
      energy = {};
    ds.forEach(d => {
      if (rangesTotal(W.blocks[d])) blocks[d] = W.blocks[d];
      if (W.energy[d] && W.energy[d] !== 'medium') energy[d] = W.energy[d];
    });
    return {
      id: W.id,
      type: W.type,
      name: W.name.trim(),
      start: W.start,
      active: W.active,
      blocks,
      energy,
      items: W.items.filter(it => ds.includes(it.date)).map(({ ord, ...it }) => it),
      created: Date.now(),
    };
  }
  async function next() {
    if (W.mode === 'view') {
      W.mode = 'edit';
      W.step = 2;
      return renderWizard();
    }
    if (W.step === 1) {
      W.name = ($('#wzName') && $('#wzName').value) || '';
      if (W.type === 'daily' && $('#wzDate') && $('#wzDate').value)
        W.start = $('#wzDate').value < todayISO() ? todayISO() : $('#wzDate').value;
      W.dayIdx = Math.max(0, days().indexOf(todayISO()));
    }
    if (W.step === 2) prepareTopics(false);
    if (W.step === 4) {
      const ok = await savePlan(buildPlanObject(), true);
      if (ok) closeWizard();
      return;
    }
    W.step++;
    renderWizard();
  }
  function back() {
    if (W.step > 1) W.step--;
    renderWizard();
  }

  /* ---------- time-block selection ---------- */
  function setBlocks(d, slots) {
    const before = snapshot();
    W.blocks[d] = normRanges([...slots]);
    if (!W.blocks[d].length) delete W.blocks[d];
    if (snapshot() !== before) {
      W.changed.add(d);
      return before;
    }
    return null;
  }
  function pushHist(before) {
    if (before == null) return;
    W.hist.push(before);
    if (W.hist.length > 100) W.hist.shift();
    W.fut = [];
  }
  function paintColumn(col, slots) {
    col.querySelectorAll('.wks').forEach(el => el.classList.toggle('on', slots.has(+el.dataset.s)));
  }
  function slotAt(col, y) {
    const r = col.getBoundingClientRect(),
      row = Math.max(0, Math.min(ROWS - 1, Math.floor(((y - r.top) / r.height) * ROWS)));
    return DAY_START + row * SLOT;
  }
  const rangeSlots = (a, b) => {
    const out = [];
    for (let m = Math.min(a, b); m <= Math.max(a, b); m += SLOT) out.push(m);
    return out;
  };
  let drag = null;
  document.addEventListener('pointerdown', e => {
    if (!W || W.step !== 2 || e.pointerType === 'touch') return;
    const cell = e.target.closest && e.target.closest('#wzGrid .wks');
    if (!cell) return;
    const col = cell.closest('.wkcol');
    if (col.classList.contains('past')) return;
    e.preventDefault();
    const d = col.dataset.d,
      base = slotsOf(W.blocks[d]),
      s = +cell.dataset.s;
    drag = { d, col, base, anchor: s, add: !base.has(s), before: snapshot(), cur: null };
    dragTo(e.clientY);
  });
  function dragTo(y) {
    const s = slotAt(drag.col, y);
    if (s === drag.cur) return;
    drag.cur = s;
    const slots = new Set(drag.base);
    rangeSlots(drag.anchor, s).forEach(m => (drag.add ? slots.add(m) : slots.delete(m)));
    drag.slots = slots;
    paintColumn(drag.col, slots);
  }
  document.addEventListener('pointermove', e => {
    if (drag) dragTo(e.clientY); /* only the vertical position counts: the drag stays in the day where it started */
  });
  document.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    W.lastDay = d.d;
    pushHist(setBlocks(d.d, d.slots));
    renderWizard();
  });
  /* touch: tap a start block, then tap an end block in the same day (a tap on the same block toggles it) */
  let tapStart = null;
  document.addEventListener(
    'pointerdown',
    e => {
      if (W && W.step === 2 && e.pointerType === 'touch') tapStart = { x: e.clientX, y: e.clientY };
    },
    { passive: true }
  );
  document.addEventListener('pointerup', e => {
    if (!W || W.step !== 2 || e.pointerType !== 'touch' || !tapStart) return;
    const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > 10;
    tapStart = null;
    if (moved) return;
    const cell = e.target.closest && e.target.closest('#wzGrid .wks');
    if (!cell) return;
    const col = cell.closest('.wkcol');
    if (col.classList.contains('past')) return;
    const d = col.dataset.d,
      s = +cell.dataset.s,
      slots = slotsOf(W.blocks[d]);
    if (W.anchor && W.anchor.date === d) {
      rangeSlots(W.anchor.s, s).forEach(m => (W.anchor.add ? slots.add(m) : slots.delete(m)));
      W.anchor = null;
      W.lastDay = d;
      pushHist(setBlocks(d, slots));
    } else W.anchor = { date: d, s, add: !slots.has(s) };
    renderWizard();
  });
  function undo() {
    if (!W.hist.length) return;
    W.fut.push(snapshot());
    W.blocks = JSON.parse(W.hist.pop());
    days().forEach(d => W.changed.add(d));
    renderWizard();
  }
  function redo() {
    if (!W.fut.length) return;
    W.hist.push(snapshot());
    W.blocks = JSON.parse(W.fut.pop());
    days().forEach(d => W.changed.add(d));
    renderWizard();
  }

  /* ---------- drag and drop of topics (step 3) ----------
     Mouse: drag a card anywhere. Touch: drag it by its grip (⠿), so the list still scrolls with the finger.
     A topic moves with the review of its misses. While you drag, the cards open a gap where it will land (between two
     cards, in any block of the same day); on release the blocks are laid out again from their start. */
  let mv = null,
    dragEndedAt = 0;
  function dragStart(e, group) {
    const r = group.getBoundingClientRect(),
      ghost = group.cloneNode(true),
      gap = document.createElement('div');
    ghost.className = 'wzg wzghost';
    Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px' });
    document.body.appendChild(ghost);
    gap.className = 'wzgap';
    gap.style.height = r.height + 'px';
    group.after(gap);
    group.hidden = true;
    mv.on = true;
    mv.ghost = ghost;
    mv.gap = gap;
    mv.dy = e.clientY - r.top;
    document.body.classList.add('wzdragging');
  }
  function dragMove(e) {
    const { group, gap, ghost } = mv;
    ghost.style.top = e.clientY - mv.dy + 'px';
    const day = group.closest('.wzday'),
      y = e.clientY;
    /* the block under the pointer (or the nearest one), then the first card whose middle is below the pointer */
    const blks = [...day.querySelectorAll('.wzblk')];
    let blk = blks.find(b => {
      const r = b.getBoundingClientRect();
      return y >= r.top && y <= r.bottom;
    });
    if (!blk)
      blk = blks.reduce((best, b) => {
        const r = b.getBoundingClientRect(),
          d = Math.min(Math.abs(y - r.top), Math.abs(y - r.bottom));
        return !best || d < best.d ? { b, d } : best;
      }, null).b;
    const cards = [...blk.querySelectorAll('.wzg')].filter(g => g !== group && !g.hidden),
      before = cards.find(g => {
        const r = g.getBoundingClientRect();
        return y < r.top + r.height / 2;
      });
    const last = cards[cards.length - 1],
      anchor = last || blk.querySelector('.wzbh'),
      moving = before ? gap.nextSibling !== before : anchor.nextSibling !== gap;
    /* the cards of the day glide to open the gap where the dragged one will land */
    if (moving)
      flip([...day.querySelectorAll('.wzg:not([hidden]), .wzfree, .wzbh')], () =>
        before ? before.before(gap) : anchor.after(gap)
      );
    /* scroll the wizard when the card reaches its top or bottom edge */
    const body = $('#wzBody'),
      br = body.getBoundingClientRect();
    if (y < br.top + 40) body.scrollTop -= 12;
    else if (y > br.bottom - 40) body.scrollTop += 12;
  }
  function dragEnd(commit) {
    const { group, gap, ghost } = mv;
    ghost.remove();
    document.body.classList.remove('wzdragging');
    if (commit) {
      gap.replaceWith(group);
      group.hidden = false;
      /* read the new order from the page and lay every block of the day out again */
      const day = group.closest('.wzday'),
        d = day.dataset.d;
      day.querySelectorAll('.wzblk').forEach(b => {
        let t0 = +b.dataset.s;
        b.querySelectorAll('.wzg').forEach(g => {
          const first = W.items.find(x => x.id === g.dataset.gid),
            members = first ? [first, ...W.items.filter(x => x.kind === 'reflect' && x.of === first.id)] : [];
          members.forEach(x => {
            x.date = d;
            x.start = t0;
            t0 += x.min;
          });
        });
      });
      dragEndedAt = Date.now();
    } else {
      gap.remove();
      group.hidden = false;
    }
    mv = null;
    renderWizard();
  }
  $('#wzBody').addEventListener('pointerdown', e => {
    if (!W || W.step !== 3 || W.mode === 'view' || e.button > 0) return;
    const grip = e.target.closest('.wzgrip'),
      card = e.target.closest('.wzg');
    if (!card || e.target.closest('button, input, select, .wzit.edit')) return;
    if (e.pointerType !== 'mouse' && !grip) return;
    if (!card.querySelector('.wzgrip')) return;
    mv = { group: card, x: e.clientX, y: e.clientY, on: false, id: e.pointerId };
    if (grip) {
      e.preventDefault();
      dragStart(e, card);
    }
  });
  document.addEventListener('pointermove', e => {
    if (!mv || e.pointerId !== mv.id) return;
    if (!mv.on) {
      if (Math.hypot(e.clientX - mv.x, e.clientY - mv.y) < 6) return;
      dragStart(e, mv.group);
    }
    e.preventDefault();
    dragMove(e);
  });
  document.addEventListener('pointerup', e => {
    if (!mv || e.pointerId !== mv.id) return;
    if (mv.on) dragEnd(true);
    else mv = null;
  });
  document.addEventListener('pointercancel', () => {
    if (mv && mv.on) dragEnd(false);
    else mv = null;
  });
  $('#wzBody').addEventListener('keydown', e => {
    const card = e.target.closest && e.target.closest('.wzit.editable');
    if (!card || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    W.editItem = card.dataset.wid;
    renderWizard();
  });

  /* ---------- clicks inside the wizard ---------- */
  $('#wzBody').addEventListener('click', e => {
    if (!W) return;
    const tgt = e.target;
    const typeBtn = tgt.closest('[data-wtype]');
    if (typeBtn) {
      W.name = $('#wzName').value;
      W.type = typeBtn.dataset.wtype;
      W.start = W.type === 'weekly' ? firstOpenWeek() : todayISO();
      W.blocks = {};
      W.items = [];
      return renderWizard();
    }
    if (tgt.closest('#wzWkPrev') || tgt.closest('#wzWkNext')) {
      W.name = $('#wzName').value;
      const n = addDays(W.start, tgt.closest('#wzWkPrev') ? -7 : 7);
      if (addDays(n, 6) >= todayISO()) W.start = n;
      return renderWizard();
    }
    const dayBtn = tgt.closest('[data-wzd]');
    if (dayBtn) {
      W.dayIdx = +dayBtn.dataset.wzd;
      W.anchor = null;
      return renderWizard();
    }
    if (tgt.closest('#wzUndo')) return undo();
    if (tgt.closest('#wzRedo')) return redo();
    const cur = currentDay;
    if (tgt.closest('#wzClear')) {
      pushHist(setBlocks(cur(), new Set()));
      return renderWizard();
    }
    if (tgt.closest('#wzCopy')) {
      const src = cur(),
        before = snapshot();
      days().forEach(d => {
        if (d !== src && d >= todayISO()) {
          W.blocks[d] = (W.blocks[src] || []).map(r => r.slice());
          W.changed.add(d);
        }
      });
      if (snapshot() !== before) pushHist(before);
      return renderWizard();
    }
    if (tgt.closest('#wzResuggest')) {
      W.editItem = W.addAt = null;
      prepareTopics(true);
      return renderWizard();
    }
    const en = tgt.closest('[data-wzen] [data-en]');
    if (en) {
      const d = en.closest('[data-wzen]').dataset.wzen;
      W.energy[d] = en.dataset.en;
      W.changed.add(d);
      prepareTopics(false);
      return renderWizard();
    }
    /* click or tap a card to edit it (topic, practice test or your own activity with its name) */
    const card = tgt.closest('.wzit.editable');
    if (card && !tgt.closest('[data-wact]')) {
      if (Date.now() < dragEndedAt + 250) return;
      W.editItem = card.dataset.wid;
      W.addAt = null;
      return renderWizard();
    }
    const act = tgt.closest('[data-wact]');
    if (!act) return;
    const a = act.dataset.wact,
      row = act.closest('[data-wid]'),
      it = row && W.items.find(x => x.id === row.dataset.wid),
      blockOf = x => (W.blocks[x.date] || []).find(([s, e]) => x.start >= s && x.start < e);
    if (a === 'edit') W.editItem = it.id;
    if (a === 'editrow') W.editItem = it.id;
    if (a === 'cancel') W.editItem = null;
    if (a === 'del') {
      /* removing a topic also removes the review of its misses */
      const b = blockOf(it);
      W.items = W.items.filter(x => x !== it && !(x.kind === 'reflect' && x.of === it.id));
      if (b) repack(it.date, b[0], b[1]);
    }
    if (a === 'up') {
      /* a topic moves up together with its review, above the previous topic and its review */
      const b = blockOf(it),
        gs = groupsOf(W.items.filter(x => x.date === it.date && x.start >= b[0] && x.start < b[1])),
        k = gs.findIndex(g => g[0] === it);
      if (k > 0) {
        [gs[k - 1], gs[k]] = [gs[k], gs[k - 1]];
        let t0 = b[0];
        gs.flat().forEach(x => {
          x.start = t0;
          t0 += x.min;
        });
      }
    }
    if (a === 'ok') {
      const v = readEditor(row, it.date);
      if (v.kind !== it.kind || v.i !== it.i) {
        it.reason = v.kind === 'test' ? 'test' : 'custom';
        it.custom = true;
        /* another topic: the review of the old topic's misses no longer applies */
        W.items = W.items.filter(x => !(x.kind === 'reflect' && x.of === it.id));
      }
      Object.assign(it, v, { reason: v.kind === 'custom' ? 'custom' : it.reason });
      if (it.label === undefined) delete it.label;
      W.editItem = null;
      const b = blockOf(it);
      if (b) repack(it.date, b[0], b[1]);
    }
    if (a === 'add') W.addAt = act.dataset.key;
    if (a === 'addcancel') W.addAt = null;
    if (a === 'addok') {
      const box = act.closest('[data-wadd]'),
        [d, s] = box.dataset.wadd.split('|'),
        v = readEditor(box, d),
        b = (W.blocks[d] || []).find(r => r[0] === +s);
      const item = {
        id: uid(),
        date: d,
        start: b[1] - 1,
        ...v,
        reason: v.kind === 'test' ? 'test' : 'custom',
        custom: true,
      };
      if (item.label === undefined) delete item.label;
      W.items.push(item);
      repack(d, b[0], b[1]);
      W.addAt = null;
    }
    renderWizard();
  });
  /* the editor switches between questions (topic) and minutes + name (your own activity) */
  $('#wzBody').addEventListener('change', e => {
    const sel = e.target.closest('.wzit.edit [data-f="topic"]');
    if (!sel) return;
    const row = sel.closest('.wzit'),
      c = sel.value === 'c';
    row.dataset.kind = c ? 'c' : sel.value === 't' ? 't' : 'q';
    row.querySelector('.wzunit').textContent = c ? 'min' : 'q';
    const n = row.querySelector('[data-f="n"]');
    n.value = c ? 30 : 10;
    if (c) row.querySelector('[data-f="label"]').focus();
  });
  /* step 1 inputs keep their values while the type or week changes */
  $('#wzBody').addEventListener('input', e => {
    if (!W) return;
    if (e.target.id === 'wzName') W.name = e.target.value;
    if (e.target.id === 'wzDate' && e.target.value) W.start = e.target.value < todayISO() ? todayISO() : e.target.value;
  });
  $('#wzNext').onclick = () => next();
  $('#wzBack').onclick = back;
  $('#wzSaveOff').onclick = async () => {
    if (await savePlan(buildPlanObject(), false)) closeWizard();
  };
  $('#wzClose').onclick = closeWizard;
  document.addEventListener('keydown', e => {
    if (!W || $('#wizbg').hidden || !$('#askbg').hidden) return;
    if (e.key === 'Escape') closeWizard();
    if (W.step === 2 && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    }
  });

  const wizardState = () => W;
  return { openWizard, closeWizard, wizardState };
})();
const { openWizard, closeWizard, wizardState } = PlanWizard;
