/* ===== module Dashboard (js/views/dashboard.js) =====
   public: counts, streakInfo, renderCalendar, fitTags, renderSide, renderBoard, phoneMQ, laneInView, goLane, renderDash, render, moveCard, lanesEl
   shared state (getter/setter): dashDirty, drag */
const Dashboard = (() => {
  /* ---------- rendering ---------- */
  function updateTexts() {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
    document.querySelectorAll('[data-t]').forEach(el => (el.textContent = t(el.dataset.t)));
    document.querySelectorAll('[data-tt]').forEach(el => {
      el.title = t(el.dataset.tt);
      el.setAttribute('aria-label', t(el.dataset.tt));
    });
    document.querySelectorAll('.flag').forEach(b => {
      const on = b.dataset.lang === lang;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
    document.querySelectorAll('#seg button').forEach(b => (b.textContent = t(b.dataset.kind)));
    $('#docsLink').href = docsUrl(lang);
    const hasDemo = state.events.some(e => e.demo);
    $('#demoBadge').hidden = $('#clearDemo').hidden = $('#demoSep').hidden = !hasDemo;
  }
  function counts() {
    return STATUS.map(s => TOPICS.reduce((a, x, i) => a + (state.statuses[i] === s ? x.q : 0), 0));
  }
  function renderProgress() {
    const c = counts();
    $('#total').textContent = tf('total', fmt(TOTAL));
    $('#track').innerHTML = c
      .map((q, i) => {
        const p = (q / TOTAL) * 100;
        return `<div class="chunk" data-i="${i}" style="background:${COLORS[i]};width:${p}%" title="${esc(label(STATUS[i]))}: ${q} (${fmt(p, 1)}%)">${p >= (phoneMQ.matches ? 13 : 6) ? `<b>${fmt(p, 1)}%</b>` : ''}</div>`;
      })
      .join('');
    $('#legend').innerHTML = c
      .map(
        (q, i) =>
          `<div class="lg" data-i="${i}"><span class="dot" style="background:${COLORS[i]}"></span><div><strong>${esc(label(STATUS[i]))}</strong><small>${tf('qn', fmt(q))} · ${fmt((q / TOTAL) * 100, 1)}%</small></div></div>`
      )
      .join('');
  }
  function streakInfo() {
    const set = new Set(state.events.map(e => e.date).concat((state.tests || []).map(x => x.date)));
    const d = new Date();
    const todayDone = set.has(iso(d));
    if (!todayDone) d.setDate(d.getDate() - 1);
    let n = 0;
    while (set.has(iso(d))) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return { n, todayDone, days: set.size };
  }
  function renderCalendar() {
    const y = shown.getFullYear(),
      m = shown.getMonth();
    $('#month').textContent = new Intl.DateTimeFormat(LOCALE[lang], { month: 'long', year: 'numeric' }).format(
      new Date(y, m, 1, 12)
    );
    const by = {};
    state.events.forEach(e => (by[e.date] ??= []).push(e));
    (state.tests || []).forEach(x => (by[x.date] ??= []).push({ kind: 'test', date: x.date, q: x.q, score: x.score }));
    const start = (new Date(y, m, 1).getDay() + 6) % 7,
      gridStart = new Date(y, m, 1 - start, 12),
      today = todayISO();
    const weeks = Math.ceil((start + new Date(y, m + 1, 0).getDate()) / 7);
    $('#calgrid').style.setProperty('--weeks', weeks);
    let h = '<div class="strip" style="grid-column:8;grid-row:1/-1"></div>';
    t('days').forEach((d, i) => (h += `<div class="wd" style="grid-column:${i + 1};grid-row:1">${esc(d)}</div>`));
    h += `<div class="wd wk" style="grid-column:8;grid-row:1" title="${esc(t('wkTitle'))}">${esc(t('wk'))}</div>`;
    let curRow = -1;
    for (let r = 0; r < weeks; r++) {
      let hit = false,
        cur = false;
      for (let c = 0; c < 7; c++) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + r * 7 + c);
        const key = iso(d),
          out = d.getMonth() !== m,
          list = by[key] || [];
        if (list.length) hit = true;
        if (key === today) cur = true;
        /* only cards moved to Very Comfortable are listed; every action still makes the day active */
        /* day preview (desktop/tablet): completions first (green), then topics studied (blue/purple), then practice tests (orange); max 5 + "+N" */
        const items = [],
          seen = new Set();
        list
          .filter(e => e.kind === 'move' && e.to === 'Very Comfortable')
          .forEach(e => {
            if (!seen.has(e.topic)) {
              seen.add(e.topic);
              items.push({ k: '#16935e', n: TOPICS[e.topic].name });
            }
          });
        list
          .filter(e => e.kind === 'study' || e.kind === 'review')
          .forEach(e => {
            if (!seen.has(e.topic)) {
              seen.add(e.topic);
              items.push({ k: e.kind === 'study' ? '#2f7de1' : '#7158dc', n: TOPICS[e.topic].name });
            }
          });
        list
          .filter(e => e.kind === 'test')
          .forEach(e =>
            items.push({ k: '#c98200', n: `${t('practiceTest')}${e.score != null ? ' · ' + e.score + '%' : ''}` })
          );
        const tags =
          items
            .slice(0, 5)
            .map(it => `<span class="daytag" style="--k:${it.k}">${esc(it.n)}</span>`)
            .join('') + (items.length > 5 ? `<span class="daytag more">+${items.length - 5}</span>` : '');
        const tip = list
          .map(e =>
            e.kind === 'test'
              ? `${t('practiceTest')} (${e.q}) — ${e.score != null ? e.score + '%' : t('inProgress')}`
              : `${TOPICS[e.topic].name} — ${t(e.kind)}${e.kind === 'move' && e.to ? ' → ' + label(e.to) : ''}${e.partial ? ' (' + t('inProgress') + ')' : e.score != null ? ' · ' + e.score + '%' : ''}`
          )
          .join('\n');
        h += `<div class="day${out ? ' out' : ''}${list.length ? ' active' : ''}${key === today ? ' today' : ''}${key === state.deadline ? ' exam' : ''}" style="grid-column:${c + 1};grid-row:${r + 2}" data-date="${key}" title="${esc(tip)}"><div class="dhead"><span class="dnum">${d.getDate()}</span>${key === state.deadline ? `<span class="examtag">${esc(t('examShort'))}</span>` : ''}${list.length ? '<span class="dcheck">✓</span>' : ''}</div>${out ? '' : `<div class="tags">${tags}<span class="daytag more fit" hidden></span></div>`}</div>`;
      }
      if (cur) curRow = r;
      h += `<div class="wcheck${hit ? ' on' : ''}${cur ? ' cur' : ''}" data-row="${r + 2}" style="grid-column:8;grid-row:${r + 2}">${hit ? '✓' : ''}</div>`;
    }
    const s = streakInfo();
    $('#callegend').innerHTML =
      `<span><i style="background:#e2f8eb"></i>${esc(t('activeLegend'))}</span><span><i style="background:#16935e"></i>${esc(t('lgDone'))}</span><span><i style="background:#2f7de1"></i>${esc(t('study'))}</span><span><i style="background:#7158dc"></i>${esc(t('review'))}</span><span><i style="background:#c98200"></i>${esc(t('practiceTest'))}</span><span><i style="background:transparent;box-shadow:inset 0 0 0 2px var(--exam)"></i>${esc(t('examLegend'))}</span>`;
    const mk = `${y}-${pad(m + 1)}`,
      mEv = state.events.filter(e => e.date.startsWith(mk)),
      mDays = new Set(mEv.map(e => e.date)).size,
      mTopics = mEv.filter(e => e.kind === 'move' && e.to === 'Very Comfortable').length;
    const bRow = (curRow >= 0 ? curRow : weeks - 1) + 2;
    h = h.replace(new RegExp(`<div class="wcheck[^"]*" data-row="${bRow}"[^>]*>[^<]*</div>`), '');
    h += `<div class="bubblewrap" style="grid-column:8;grid-row:${bRow}" title="${s.n} ${esc(t('streak'))}"><div class="bubble">${s.n}</div></div>`;
    $('#calgrid').innerHTML = h;
    requestAnimationFrame(fitTags);
  }
  function fitTags() {
    document.querySelectorAll('#calgrid .tags').forEach(box => {
      const items = [...box.querySelectorAll('.daytag:not(.more)')],
        more = box.querySelector('.fit');
      if (!items.length) return;
      items.forEach(i => (i.hidden = false));
      more.hidden = true;
      box.querySelectorAll('.more:not(.fit)').forEach(m => (m.hidden = false));
      if (box.scrollHeight <= box.clientHeight + 1) return;
      more.hidden = false;
      let hidden = 0;
      const extra = box.querySelector('.more:not(.fit)'),
        base = extra ? +extra.textContent.slice(1) : 0;
      if (extra) extra.hidden = true;
      for (let k = items.length - 1; k >= 0 && box.scrollHeight > box.clientHeight + 1; k--) {
        items[k].hidden = true;
        hidden++;
        more.textContent = '+' + (hidden + base);
      }
    });
  }
  function renderSide() {
    const delta = diffDays(todayISO(), state.deadline);
    $('#countdown').textContent = delta === 0 ? '0' : fmt(Math.abs(delta));
    $('#countLabel').textContent = delta > 0 ? t('toGo') : delta === 0 ? t('examToday') : t('since');
    $('#examDate').value = state.deadline;
    let sq = 0,
      sw = 0;
    TOPICS.forEach((x, i) => {
      const v = state.scores[i];
      if (v != null) {
        sq += x.q;
        sw += x.q * v;
      }
    });
    const avg = sq ? sw / sq : 0;
    $('#avg').textContent = fmt(avg, 1) + '%';
    $('#stAvg').title = t('avgTip');
    $('#stPace').title = t('paceTip');
    $('#avgBar').style.width = Math.min(100, avg) + '%';
    $('#avgBar').style.background = avg >= GOAL ? COLORS[3] : COLORS[2];
    const left = TOTAL - counts()[3];
    $('#pace').textContent = delta > 0 ? fmt(Math.ceil(left / delta)) : '—';
    const s = streakInfo();
    $('#activeDays').textContent = fmt(s.days);
    renderVolume();
    const pts = (state.tests || []).filter(x => x.score != null).sort((a, b) => a.date.localeCompare(b.date));
    $('#ptBest').textContent = pts.length ? Math.max(...pts.map(x => x.score)) + '%' : '—';
    $('#ptStat').title = pts.length
      ? t('ptTip')
          .replace('{last}', pts[pts.length - 1].score + '%')
          .replace('{n}', (state.tests || []).length)
      : t('practiceTests');
  }
  function lastSeen() {
    const m = {};
    state.events.forEach(e => {
      if (!m[e.topic] || e.date > m[e.topic]) m[e.topic] = e.date;
    });
    return m;
  }
  function renderBoard() {
    const keepLane = phoneMQ.matches && lanesEl.children.length ? laneInView() : null;
    const seen = lastSeen(),
      today = todayISO();
    const fit = fitMQ.matches,
      colsOf = () => 1;
    const laneCols = STATUS.map(s => colsOf(state.statuses.filter(x => x === s).length));
    lanesEl.style.gridTemplateColumns = fit ? laneCols.map(c => `minmax(0,${c}fr)`).join(' ') : '';
    $('#lanes').innerHTML = STATUS.map((s, j) => {
      const keys = orderOf().filter(k => (typeof k === 'number' ? state.statuses[k] === s : cardOf(k)?.status === s)),
        ids = keys.filter(k => typeof k === 'number');
      const q = ids.reduce((a, i) => a + TOPICS[i].q, 0);
      const own = keys.length - ids.length;
      return `<div class="lane" data-lane="${j}" style="--accent:${COLORS[j]}"><div class="lanehead"><span class="lname">${esc(label(s))}</span><span class="lcount">${ids.length}${own ? ' + ' + own : ''} · ${tf('qn', fmt(q))}</span><button type="button" class="laneadd" data-cact="open" data-lane-add="${j}" aria-label="${esc(t('addCard'))}" title="${esc(t('addCard'))}">+</button></div><div class="lanecards${laneCols[j] > 1 ? ' multi' : ''}" style="${laneCols[j] > 1 ? `column-count:${laneCols[j]}` : ''}">${keys
        .map(i => {
          if (typeof i !== 'number') return ownCardHTML(cardOf(i));
          const x = TOPICS[i],
            v = state.scores[i],
            sc = v == null ? 'none' : v >= GOAL ? 'good' : v >= 70 ? 'mid' : 'low';
          const ls = seen[i] ? diffDays(seen[i], today) : null;
          const last = ls == null ? '' : ls <= 0 ? t('todayShort') : tf('ago', ls);
          return `<div class="task" tabindex="0" role="button" data-topic="${i}" aria-label="${esc(x.name)}" title="${esc(x.name)}"><div class="tname">${esc(x.name)}</div><div class="tmeta"><span>${tf('qn', x.q)}</span><span class="score sc-${sc}" title="${esc(t('editScore'))}">${v == null ? '—' : v + '%'}</span><span class="last">${esc(last)}</span></div></div>`;
        })
        .join('')}${composerHTML(j)}</div></div>`;
    }).join('');
    $('#cardCount').textContent = `(${TOPICS.length})`;
    $('#laneDots').innerHTML = STATUS.map(
      (s, j) => `<button type="button" data-go="${j}" aria-label="${esc(label(s))}"></button>`
    ).join('');
    if (keepLane != null) goLane(keepLane, false);
    updateDots();
  }
  /* ---------- your own cards (tasks such as "Review the theory"; not in the statistics) ---------- */
  let addLane = null,
    editCard = null;
  const cardOf = id => (state.cards || []).find(c => c.id === id);
  /* the saved order of every card (topics and yours), completed if anything is missing */
  const orderOf = () => normOrder(state.order, state.cards || []);
  function ownCardHTML(c) {
    if (!c) return '';
    if (editCard === c.id)
      return `<div class="task own editing" data-card="${esc(c.id)}"><textarea class="cardin" maxlength="80" rows="2" aria-label="${esc(t('cardHint'))}">${esc(c.title)}</textarea><div class="cardbtns"><button type="button" class="primary" data-cact="save">${esc(t('cardSave'))}</button><button type="button" data-cact="del">${esc(t('cardDel'))}</button><button type="button" class="cardx" data-cact="cancel" aria-label="${esc(t('close'))}">×</button></div></div>`;
    return `<div class="task own" tabindex="0" role="button" data-card="${esc(c.id)}" aria-label="${esc(c.title)}" title="${esc(c.title)}"><div class="tname">${esc(c.title)}</div><div class="tmeta"><span class="owntag">${esc(t('ownTag'))}</span></div></div>`;
  }
  function composerHTML(j) {
    if (addLane === j)
      return `<div class="composer" data-lane-add="${j}"><textarea class="cardin" maxlength="80" rows="2" placeholder="${esc(t('cardHint'))}" aria-label="${esc(t('cardHint'))}"></textarea><div class="cardbtns"><button type="button" class="primary" data-cact="add">${esc(t('addCardBtn'))}</button><button type="button" class="cardx" data-cact="close" aria-label="${esc(t('close'))}">×</button></div></div>`;
    return `<button type="button" class="addcard" data-cact="open" data-lane-add="${j}">+ ${esc(t('addCard'))}</button>`;
  }
  function focusCardInput() {
    const el = lanesEl.querySelector('.composer .cardin, .own.editing .cardin');
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }
  function addOwnCard(j, title) {
    title = title.trim().slice(0, 80);
    if (!title) return;
    const id = 'k' + uid();
    commit(() => {
      state.cards = [...(state.cards || []), { id, title, status: STATUS[j] }];
      state.order = [...orderOf(), id];
    }, t('cardAdded'));
    /* like Trello, the composer stays open for the next card */
    addLane = j;
    renderBoard();
    focusCardInput();
  }
  function cardAction(a, el) {
    const box = el.closest('[data-card], [data-lane-add]'),
      id = box && box.dataset.card,
      j = box && box.dataset.laneAdd != null ? +box.dataset.laneAdd : null;
    if (a === 'open') {
      addLane = j;
      editCard = null;
    } else if (a === 'close') addLane = null;
    else if (a === 'add') return addOwnCard(j, box.querySelector('.cardin').value);
    else if (a === 'cancel') editCard = null;
    else if (a === 'save') {
      const title = box.querySelector('.cardin').value.trim().slice(0, 80);
      editCard = null;
      if (title && title !== cardOf(id).title)
        return commit(() => {
          cardOf(id).title = title;
        }, t('cardEdited'));
    } else if (a === 'del') {
      editCard = null;
      return commit(() => {
        state.cards = state.cards.filter(c => c.id !== id);
        state.order = orderOf().filter(k => k !== id);
      }, t('cardDeleted'));
    }
    renderBoard();
    focusCardInput();
  }
  $('#lanes').addEventListener('click', e => {
    const b = e.target.closest('[data-cact]');
    if (b) cardAction(b.dataset.cact, b);
  });
  $('#lanes').addEventListener('keydown', e => {
    const inp = e.target.closest('.cardin');
    if (!inp) return;
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      cardAction(inp.closest('.composer') ? 'add' : 'save', inp);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cardAction(inp.closest('.composer') ? 'close' : 'cancel', inp);
    }
  });

  /* phone: which list is in view → dots */
  const phoneMQ = matchMedia('(max-width:640px)');
  function laneInView() {
    const lanes = [...lanesEl.children];
    if (!lanes.length) return 0;
    const mid = lanesEl.getBoundingClientRect().left + lanesEl.clientWidth / 2;
    let best = 0,
      dist = 1e9;
    lanes.forEach((l, k) => {
      const r = l.getBoundingClientRect(),
        d = Math.abs(r.left + r.width / 2 - mid);
      if (d < dist) {
        dist = d;
        best = k;
      }
    });
    return best;
  }
  function updateDots() {
    const k = laneInView();
    document.querySelectorAll('#laneDots button').forEach((b, j) => b.classList.toggle('on', j === k));
  }
  function goLane(k, smooth = true) {
    const l = lanesEl.children[k];
    if (!l) return;
    lanesEl.scrollTo({
      left: l.offsetLeft - (lanesEl.clientWidth - l.offsetWidth) / 2,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }
  let dashDirty = false;
  function renderDash() {
    renderProgress();
    renderCalendar();
    renderSide();
    renderBoard();
    renderSRPanel();
    renderTsStrip();
    dashDirty = false;
  }
  /* only the visible tab is redrawn; the dashboard is redrawn when you come back to it */
  function render() {
    energyMode = planDay().energy;
    updateTexts();
    if (!$('#viewDash').hidden) renderDash();
    else dashDirty = true;
    if (!$('#viewSR').hidden) {
      if (statMode === 'tests') renderStatTests();
      else renderSRPage();
    }
    if (!$('#viewPlan').hidden) renderPlanPage();
    if (!$('#viewTests').hidden) renderTestsPage();
    if (typeof renderSyncChip === 'function') renderSyncChip();
  }

  /* ---------- actions ---------- */
  function moveCard(i, to, date = todayISO()) {
    if (state.statuses[i] === to) {
      toast(t('already'));
      return;
    }
    commit(
      () => {
        state.events.push({ id: uid(), date, topic: i, kind: 'move', from: state.statuses[i], to, demo: false });
        state.statuses[i] = to;
      },
      `${TOPICS[i].name} → ${label(to)}`
    );
  }
  /* put card i right before card `before` (null = at the end of its list) in the saved card order */
  function placeCard(order, i, before) {
    const o = order.filter(x => x !== i),
      k = before == null ? o.length : o.indexOf(before);
    o.splice(k < 0 ? o.length : k, 0, i);
    return o;
  }
  /* a drop: another list (a move, logged with its date) and/or a new place inside the list, one Undo for both */
  function dropCard(i, to, before) {
    const own = typeof i === 'string' ? cardOf(i) : null,
      order = placeCard(orderOf(), i, before),
      moved = own ? own.status !== to : state.statuses[i] !== to,
      same = JSON.stringify(order) === JSON.stringify(state.order);
    if (!moved && same) return;
    if (own)
      return commit(
        () => {
          own.status = to;
          state.order = order;
        },
        moved ? `${own.title} → ${label(to)}` : t('reordered')
      );
    commit(
      () => {
        if (moved) {
          state.events.push({
            id: uid(),
            date: todayISO(),
            topic: i,
            kind: 'move',
            from: state.statuses[i],
            to,
            demo: false,
          });
          state.statuses[i] = to;
        }
        state.order = order;
      },
      moved ? `${TOPICS[i].name} → ${label(to)}` : t('reordered')
    );
  }

  /* pointer drag & drop: mouse drags after 5px, touch after a short press-and-hold */
  let drag = null;
  const lanesEl = $('#lanes');
  lanesEl.addEventListener('contextmenu', e => {
    if (e.target.closest('.task')) e.preventDefault();
  });
  lanesEl.addEventListener('pointerdown', e => {
    const card = e.target.closest('.task');
    if (!card || e.button > 0 || e.target.closest('.score,.scorein,.editing,.cardin,[data-cact]')) return;
    drag = {
      card,
      id: card.dataset.card ?? +card.dataset.topic,
      x: e.clientX,
      y: e.clientY,
      pid: e.pointerId,
      type: e.pointerType,
      active: false,
      timer: null,
      lane: null,
    };
    if (e.pointerType !== 'mouse')
      drag.timer = setTimeout(() => {
        if (drag && !drag.active) {
          startDrag(drag.x, drag.y);
          navigator.vibrate?.(15);
        }
      }, 260);
  });
  window.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (!drag.active) {
      if (drag.type === 'mouse' && dist > 5) startDrag(e.clientX, e.clientY);
      else if (drag.type !== 'mouse' && dist > 8) {
        clearTimeout(drag.timer);
        drag = null;
      }
      return;
    }
    moveGhost(e.clientX, e.clientY);
  });
  document.addEventListener(
    'touchmove',
    e => {
      if (drag && drag.active) e.preventDefault();
    },
    { passive: false }
  );
  function startDrag(x, y) {
    const r = drag.card.getBoundingClientRect();
    const g = drag.card.cloneNode(true);
    g.classList.add('ghost');
    g.style.width = r.width + 'px';
    drag.ox = x - r.left;
    drag.oy = y - r.top;
    drag.ghost = g;
    drag.active = true;
    lanesEl.style.scrollSnapType = 'none';
    document.body.appendChild(g);
    /* the card leaves a gap that follows the pointer: where the gap is, the card lands */
    const gap = document.createElement('div');
    gap.className = 'task-gap';
    gap.style.height = r.height + 'px';
    drag.card.after(gap);
    drag.gap = gap;
    drag.card.classList.add('dragging');
    document.body.classList.add('dragging');
    moveGhost(x, y);
  }
  function moveGhost(x, y) {
    drag.ghost.style.transform = `translate(${x - drag.ox}px,${y - drag.oy}px) rotate(3deg)`;
    if (y < 70) window.scrollBy(0, -14);
    else if (y > innerHeight - 70) window.scrollBy(0, 14);
    if (lanesEl.scrollWidth > lanesEl.clientWidth + 2) {
      const lb = lanesEl.getBoundingClientRect();
      if (x < lb.left + 44) lanesEl.scrollLeft -= 16;
      else if (x > lb.right - 44) lanesEl.scrollLeft += 16;
    }
    let lane = document.elementFromPoint(x, y)?.closest('.lane') || null;
    if (!lane) {
      /* below a short list (the board area, not just the cards) still counts as that list */
      const b = lanesEl.getBoundingClientRect(),
        board = (lanesEl.closest('.board') || lanesEl).getBoundingClientRect();
      if (y >= b.top - 20 && y <= Math.max(b.bottom, board.bottom) + 120)
        lane =
          [...lanesEl.children].find(l => {
            const r = l.getBoundingClientRect();
            return x >= r.left && x <= r.right;
          }) || null;
    }
    if (lane !== drag.lane) {
      drag.lane?.classList.remove('over');
      lane?.classList.add('over');
      drag.lane = lane;
    }
    /* magnetic: the gap jumps to the place between the cards nearest to the pointer */
    if (lane) {
      const box = lane.querySelector('.lanecards'),
        cards = [...box.querySelectorAll('.task')].filter(c => c !== drag.card),
        next = cards.find(c => {
          const r = c.getBoundingClientRect();
          return y < r.top + r.height / 2;
        });
      const moving = next ? drag.gap.nextSibling !== next : box.lastElementChild !== drag.gap;
      if (moving) {
        /* the cards of both lists glide to open (and close) the gap */
        const old = drag.gap.parentElement,
          els = [...new Set([...box.querySelectorAll('.task'), ...(old ? old.querySelectorAll('.task') : [])])];
        flip(els, () => (next ? next.before(drag.gap) : box.appendChild(drag.gap)));
      }
    }
  }
  function endDrag(e, cancel) {
    if (!drag || (e && e.pointerId !== drag.pid)) return;
    clearTimeout(drag.timer);
    const d = drag;
    drag = null;
    if (d.active) {
      lanesEl.style.scrollSnapType = '';
      d.ghost.remove();
      d.card.classList.remove('dragging');
      document.body.classList.remove('dragging');
      d.lane?.classList.remove('over');
      const after = d.gap.nextElementSibling,
        before =
          after && after.classList.contains('task') && after !== d.card
            ? (after.dataset.card ?? +after.dataset.topic)
            : null;
      d.gap.remove();
      if (!cancel && d.lane) dropCard(d.id, STATUS[+d.lane.dataset.lane], before);
    } else if (!cancel) {
      if (typeof d.id === 'string') {
        /* your own card: a click renames or deletes it */
        editCard = d.id;
        addLane = null;
        renderBoard();
        focusCardInput();
      } else openModal(d.id);
    }
  }
  window.addEventListener('pointerup', e => endDrag(e, false));
  window.addEventListener('pointercancel', e => endDrag(e, true));
  lanesEl.addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(lanesEl._raf);
      lanesEl._raf = requestAnimationFrame(updateDots);
    },
    { passive: true }
  );
  $('#laneDots').onclick = e => {
    const b = e.target.closest('[data-go]');
    if (b) goLane(+b.dataset.go);
  };
  phoneMQ.addEventListener?.('change', () => render());
  lanesEl.addEventListener('keydown', e => {
    const card = e.target.closest('.task');
    if (!card || e.target.closest('.cardin')) return;
    if (card.dataset.card != null) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        editCard = card.dataset.card;
        renderBoard();
        focusCardInput();
      }
      return;
    }
    const i = +card.dataset.topic;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openModal(i);
    } else if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const j = STATUS.indexOf(state.statuses[i]) + (e.key === 'ArrowRight' ? 1 : -1);
      if (j >= 0 && j < STATUS.length) {
        moveCard(i, STATUS[j]);
        document.querySelector(`.task[data-topic="${i}"]`)?.focus();
      }
    }
  });
  expose({
    dashDirty: [
      () => dashDirty,
      x => {
        dashDirty = x;
      },
    ],
    drag: [
      () => drag,
      x => {
        drag = x;
      },
    ],
  });
  return {
    counts,
    streakInfo,
    renderCalendar,
    fitTags,
    renderSide,
    renderBoard,
    phoneMQ,
    laneInView,
    goLane,
    renderDash,
    render,
    moveCard,
    lanesEl,
  };
})();
const {
  counts,
  streakInfo,
  renderCalendar,
  fitTags,
  renderSide,
  renderBoard,
  phoneMQ,
  laneInView,
  goLane,
  renderDash,
  render,
  moveCard,
  lanesEl,
} = Dashboard;
