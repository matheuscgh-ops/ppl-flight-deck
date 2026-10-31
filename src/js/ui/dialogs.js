/* ===== module Dialogs (js/ui/dialogs.js) =====
   public: openModal, closeModal, openPt */
const Dialogs = (() => {
  function setSeg() {
    document.querySelectorAll('#seg button').forEach(b => b.classList.toggle('on', b.dataset.kind === mKind));
  }
  function renderHist() {
    const list = state.events
      .map((e, k) => ({ e, k }))
      .filter(o => o.e.topic === sel)
      .sort((a, b) => b.e.date.localeCompare(a.e.date) || b.k - a.k)
      .map(o => o.e);
    const kc = e =>
      e.kind === 'move' ? COLORS[Math.max(0, STATUS.indexOf(e.to))] : e.kind === 'study' ? COLORS[3] : COLORS[4];
    const df = new Intl.DateTimeFormat(LOCALE[lang], { year: 'numeric', month: 'short', day: 'numeric' });
    $('#mHist').innerHTML = list.length
      ? list
          .map(
            e =>
              `<div class="hrow"><span class="k" style="background:${kc(e)}"></span><span>${esc(df.format(parse(e.date)))} · ${esc(t(e.kind))}${e.kind === 'move' && e.to ? ' → ' + esc(label(e.to)) : ''}${e.score != null ? ' · ' + e.score + '%' : ''}${e.partial ? ' · ' + esc(t('inProgress')) : ''}</span>${e.demo ? `<span class="ex">${esc(t('example'))}</span>` : ''}<button type="button" data-del="${e.id}" aria-label="${esc(t('del'))}">×</button></div>`
          )
          .join('')
      : `<div class="muted">${esc(t('inactive'))}</div>`;
  }
  function openModal(i, kind = 'study') {
    sel = i;
    mKind = kind;
    const x = TOPICS[i];
    $('#mTitle').textContent = x.name;
    $('#mDesc').textContent =
      tf('qn', x.q) + (state.scores[i] == null ? '' : ` · ${state.scores[i]}%`) + ` · ${label(state.statuses[i])}`;
    $('#mScore').value = state.scores[i] ?? '';
    $('#mScore').placeholder = t('blankInProgress');
    $('#mStatus').innerHTML = STATUS.map(s => `<option value="${esc(s)}">${esc(label(s))}</option>`).join('');
    $('#mStatus').value = state.statuses[i];
    $('#mDate').value = todayISO();
    setSeg();
    renderHist();
    $('#modalbg').hidden = false;
    $('#mSave').focus();
  }
  function closeModal() {
    $('#modalbg').hidden = true;
    const i = sel;
    sel = -1;
    document.querySelector(`.task[data-topic="${i}"]`)?.focus();
  }
  $('#seg').onclick = e => {
    const b = e.target.closest('button');
    if (b) {
      mKind = b.dataset.kind;
      setSeg();
    }
  };
  $('#mSave').onclick = () => {
    const to = $('#mStatus').value,
      date = $('#mDate').value,
      i = sel;
    if (!date || i < 0) return;
    const moving = to !== state.statuses[i];
    const sv = $('#mScore').value.trim(),
      score = sv === '' ? null : Math.max(0, Math.min(100, Math.round(+sv)));
    const scoreChanged = score != null && score !== state.scores[i];
    if (mKind === 'none' && !moving && !scoreChanged) {
      toast(t('nothing'));
      return;
    }
    commit(() => {
      if (mKind !== 'none')
        state.events.push({
          id: uid(),
          date,
          topic: i,
          kind: mKind,
          from: null,
          to: null,
          score,
          partial: score == null,
          demo: false,
        });
      if (score != null) state.scores[i] = score;
      if (moving) {
        state.events.push({ id: uid(), date, topic: i, kind: 'move', from: state.statuses[i], to, demo: false });
        state.statuses[i] = to;
      }
    }, t('saved'));
    closeModal();
  };
  $('#mHist').onclick = e => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const id = b.dataset.del;
    commit(() => {
      state.events = state.events.filter(x => x.id !== id);
    }, t('deleted'));
    renderHist();
  };
  $('#mCancel').onclick = $('#mClose').onclick = closeModal;
  $('#modalbg').addEventListener('pointerdown', e => {
    if (e.target.id === 'modalbg') closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#modalbg').hidden) closeModal();
  });

  /* practice tests (FAA Practice Test sessions are not tied to one topic) */
  function renderPtHist() {
    const df = new Intl.DateTimeFormat(LOCALE[lang], { year: 'numeric', month: 'short', day: 'numeric' });
    const L = (state.tests || [])
      .map((x, k) => ({ x, k }))
      .sort((a, b) => b.x.date.localeCompare(a.x.date) || b.k - a.k)
      .map(o => o.x);
    $('#ptHist').innerHTML = L.length
      ? L.map(
          x =>
            `<div class="hrow"><span class="k" style="background:${x.score == null ? '#8590a2' : x.score >= 80 ? COLORS[3] : COLORS[2]}"></span><span>${esc(df.format(parse(x.date)))} · ${TEST_Q} q · ${x.score != null ? x.score + '%' : esc(t('inProgress'))}</span><button type="button" data-delpt="${x.id}" aria-label="${esc(t('del'))}">×</button></div>`
        ).join('')
      : `<div class="muted">${esc(t('inactive'))}</div>`;
  }
  let ptEdit = null;
  function openPt(id) {
    const x = id && typeof id === 'string' ? (state.tests || []).find(y => y.id === id) : null;
    ptEdit = x ? x.id : null;
    $('#ptScore').value = x && x.score != null ? x.score : '';
    $('#ptScore').placeholder = t('blankInProgress');
    $('#ptDate').value = x ? x.date : todayISO();
    $('#ptDesc').textContent = t('ptDesc');
    renderPtHist();
    $('#ptbg').hidden = false;
    $('#ptScore').focus();
  }
  const closePt = () => {
    $('#ptbg').hidden = true;
  };
  $('#ptStat').onclick = () => openPt();
  $('#ptStat').onkeydown = e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPt();
    }
  };
  $('#ptClose').onclick = $('#ptCancel').onclick = closePt;
  $('#ptbg').addEventListener('pointerdown', e => {
    if (e.target.id === 'ptbg') closePt();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#ptbg').hidden) closePt();
  });
  $('#ptSave').onclick = () => {
    const d = $('#ptDate').value;
    if (!d) return;
    const v = $('#ptScore').value.trim(),
      sc = v === '' ? null : Math.max(0, Math.min(100, Math.round(+v)));
    const eid = ptEdit;
    commit(() => {
      if (eid) {
        const x = state.tests.find(y => y.id === eid);
        if (x) {
          x.date = d;
          x.score = sc;
          x.q = TEST_Q;
        }
      } else (state.tests ??= []).push({ id: uid(), date: d, q: TEST_Q, score: sc });
    }, t('saved'));
    ptEdit = null;
    closePt();
  };
  $('#ptHist').onclick = e => {
    const b = e.target.closest('[data-delpt]');
    if (!b) return;
    const id = b.dataset.delpt;
    commit(() => {
      state.tests = state.tests.filter(x => x.id !== id);
    }, t('deleted'));
    renderPtHist();
  };

  /* day summary: tap/click any day of the calendar */
  function openDay(d) {
    const df = new Intl.DateTimeFormat(LOCALE[lang], {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const ev = state.events.filter(e => e.date === d),
      tests = (state.tests || []).filter(x => x.date === d);
    const vc = ev.filter(e => e.kind === 'move' && e.to === 'Very Comfortable'),
      ses = ev.filter(e => e.kind === 'study' || e.kind === 'review'),
      mv = ev.filter(e => e.kind === 'move' && e.to !== 'Very Comfortable');
    $('#dayTitle').textContent = df.format(parse(d));
    $('#daySub').textContent =
      d === state.deadline ? t('examLegend') : ev.length || tests.length ? t('dayActive') : t('dayEmpty');
    const row = (k, n, v) =>
      `<div class="dsrow"><span class="k" style="background:${k}"></span><span class="n">${esc(n)}</span><span class="v">${esc(v)}</span></div>`;
    const grp = (title, rows) =>
      rows.length ? `<div class="dsgroup"><span class="flabel">${esc(title)}</span>${rows.join('')}</div>` : '';
    const q = ses.reduce((a, e) => a + TOPICS[e.topic].q, 0);
    $('#dayBody').innerHTML =
      (ev.length || tests.length
        ? `<div class="dssum"><span><b>${ses.length}</b>${esc(t('daySessions'))}</span><span><b>${vc.length}</b>${esc(t('dayVC'))}</span><span><b>${tests.length}</b>${esc(t('practiceTests').replace(/ \(.*\)/, ''))}</span></div>`
        : '') +
      grp(
        t('vcLegend').replace(/ \(.*\)/, ''),
        vc.map(e => row(COLORS[3], TOPICS[e.topic].name, e.from ? label(e.from) + ' →' : ''))
      ) +
      grp(
        t('daySessions'),
        ses.map(e =>
          row(
            e.kind === 'study' ? COLORS[1] : COLORS[4],
            TOPICS[e.topic].name,
            `${t(e.kind)} · ${e.partial ? t('inProgress') : e.score != null ? e.score + '%' : '—'}`
          )
        )
      ) +
      grp(
        t('dayMoves'),
        mv.map(e => row(COLORS[Math.max(0, STATUS.indexOf(e.to))], TOPICS[e.topic].name, `→ ${label(e.to)}`))
      ) +
      grp(
        t('practiceTests').replace(/ \(.*\)/, ''),
        tests.map(x =>
          row(
            x.score == null ? '#8590a2' : x.score >= 80 ? COLORS[3] : COLORS[2],
            `${t('practiceTest')} · ${x.q} q`,
            x.score != null ? x.score + '%' : t('inProgress')
          )
        )
      ) +
      (ev.length || tests.length ? '' : `<p class="muted" style="margin:16px 0 4px">${esc(t('dayNone'))}</p>`);
    $('#daybg').hidden = false;
    $('#dayClose').focus();
  }
  const closeDay = () => {
    $('#daybg').hidden = true;
  };
  $('#calgrid').addEventListener('click', e => {
    const d = e.target.closest('.day[data-date]');
    if (d) openDay(d.dataset.date);
  });
  $('#dayClose').onclick = closeDay;
  $('#daybg').addEventListener('pointerdown', e => {
    if (e.target.id === 'daybg') closeDay();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#daybg').hidden) closeDay();
  });
  return { openModal, closeModal, openPt };
})();
const { openModal, closeModal, openPt } = Dialogs;
