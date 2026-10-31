/* ===== module PreviewCarousel (js/views/preview-carousel.js) =====
   public: carList, carTick, renderSRPanel, clipSugg
   shared state (getter/setter): preview, pinned, carTopic */
const PreviewCarousel = (() => {
  let preview = null,
    prevTimer = null,
    pinned = null;
  /* carousel: every 3 s the dashboard preview moves through today's plan topics that have a memory curve
   (average → topic → topic …). It pauses while the mouse is over the panel or a card, or when a topic is picked. */
  let carTopic = null,
    carIdx = 0,
    carHold = false;
  const CAR_MS = 3000;
  /* rebuilt on every turn from today's plan as it is now (same order, topics still to do) — it follows any change to the plan */
  function carList() {
    const seen = new Set();
    return [
      null,
      ...todayPlan()
        .items.filter(x => x.kind === 'topic' && !x.done && !seen.has(x.i) && seen.add(x.i) && srModel(x.i).reps.length)
        .map(x => x.i),
    ];
  }
  function carPaint() {
    const L = carList(),
      k = Math.max(0, L.indexOf(carTopic)),
      on = preview == null && pinned == null;
    document
      .querySelectorAll('#sugg .qrow')
      .forEach(r => r.classList.toggle('car', on && carTopic != null && r.dataset.q === String(carTopic)));
    const d = $('#carDots');
    if (d) {
      d.hidden = L.length < 2 || !on;
      d.innerHTML = L.map((_, j) => `<i class="${j === k ? 'on' : ''}"></i>`).join('');
    }
  }
  function carTick() {
    if (
      carHold ||
      preview != null ||
      pinned != null ||
      document.hidden ||
      $('#viewDash').hidden ||
      !$('#srPanel').offsetParent
    )
      return;
    const L = carList();
    if (L.length < 2) {
      if (carTopic != null) {
        carTopic = null;
        drawPreview();
      }
      carPaint();
      return;
    }
    carIdx = (Math.max(0, L.indexOf(carTopic)) + 1) % L.length;
    carTopic = L[carIdx];
    drawPreview();
  }
  setInterval(carTick, CAR_MS);
  $('#srPanel').addEventListener('mouseenter', () => {
    carHold = true;
  });
  $('#srPanel').addEventListener('mouseleave', () => {
    carHold = false;
  });
  lanesEl.addEventListener('mouseenter', () => {
    carHold = true;
  });
  lanesEl.addEventListener('mouseleave', () => {
    carHold = false;
  });
  fitMQ.addEventListener?.('change', () => render());
  let rzFit;
  window.addEventListener('resize', () => {
    clearTimeout(rzFit);
    rzFit = setTimeout(() => {
      if (fitMQ.matches) drawPreview();
    }, 150);
  });
  function setPreview(i) {
    clearTimeout(prevTimer);
    if (i == null) {
      prevTimer = setTimeout(() => {
        if (preview != null) {
          preview = null;
          drawPreview();
        }
      }, 140);
      return;
    }
    if (i !== preview) {
      preview = i;
      drawPreview();
    }
  }
  function drawPreview() {
    const cur = preview != null ? preview : pinned != null ? pinned : carTopic;
    syncPick();
    if (cur != null) {
      const m = srModel(cur),
        [dt, cl] = dueText(m);
      $('#prevTitle').textContent = TOPICS[cur].name;
      $('#prevStats').innerHTML = m.reps.length
        ? `${esc(t('retention'))} <b>${pct(m.R)}</b> · S <b>${fmt(m.S, 1)}d</b> · <span class="duechip ${cl}" style="min-width:0">${esc(dt)}</span>`
        : esc(t('noHist'));
      $('#prevChart').innerHTML = m.reps.length
        ? topicChart(m, 380, fitH())
        : `<div class="empty">${esc(t('noHistLong'))}</div>`;
      $('#srLegend2').innerHTML = legendHTML(true);
    } else {
      const ms = srAll(),
        avg = wavg(ms),
        due = ms.filter(m => !m.reps.length || m.over >= 0).length;
      $('#prevTitle').textContent = t('avgCurve');
      $('#prevStats').innerHTML =
        `${esc(t('retention'))} <b>${pct(avg)}</b> · <b>${due}</b> ${esc(t('dueCount'))} · <span>${esc(t(matchMedia('(hover:none),(max-width:1099px)').matches ? 'pickHint' : 'hoverHint'))}</span>`;
      $('#prevChart').innerHTML = avgChart(ms, 380, fitH());
      $('#srLegend2').innerHTML = legendHTML(false);
    }
    carPaint();
  }
  /* picker: "All topics · average" + every tracked topic, most urgent first */
  function syncPick() {
    const sel = $('#prevPick');
    if (!sel) return;
    const ms = srAll();
    if (pinned != null && !ms.some(m => m.i === pinned)) pinned = null;
    const html =
      `<option value="">${esc(t('avgCurve'))}</option>` +
      ms.map(m => `<option value="${m.i}">${esc(TOPICS[m.i].name)} · ${pct(m.R)}</option>`).join('');
    if (sel._h !== html) {
      sel.innerHTML = html;
      sel._h = html;
    }
    sel.value = pinned == null ? '' : String(pinned);
  }
  $('#prevPick').addEventListener('change', e => {
    const v = e.target.value;
    pinned = v === '' ? null : +v;
    try {
      localStorage.setItem(STORE + '-pick', v);
    } catch (x) {}
    drawPreview();
  });
  try {
    const v = localStorage.getItem(STORE + '-pick');
    if (v) pinned = +v;
  } catch (x) {}
  function renderSRPanel() {
    paintSrRange();
    renderFcMini();
    renderPlanMini();
    drawPreview();
    requestAnimationFrame(clipSugg);
  }
  /* show only the suggestion rows that fully fit in the side panel */
  function clipSugg() {
    const p = $('#srPanel');
    if (!p || !p.offsetParent) return;
    const pb = p.getBoundingClientRect().bottom - 8;
    document.querySelectorAll('#sugg .qrow').forEach(r => (r.hidden = false));
    document.querySelectorAll('#sugg .qrow').forEach(r => {
      if (r.getBoundingClientRect().bottom > pb) r.hidden = true;
    });
  }
  window.addEventListener('resize', () => requestAnimationFrame(clipSugg));
  lanesEl.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse' || drag) return;
    const c = e.target.closest('.task');
    setPreview(c ? +c.dataset.topic : null);
  });
  lanesEl.addEventListener('pointerleave', () => setPreview(null));
  $('#sugg').addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const r = e.target.closest('.qrow[data-q]');
    setPreview(r ? +r.dataset.q : null);
  });
  $('#sugg').addEventListener('pointerleave', () => setPreview(null));
  $('#sugg').onclick = e => {
    const r = e.target.closest('.qrow');
    if (!r) return;
    if (r.dataset.pt) {
      openPt();
      return;
    }
    if (r.dataset.cid) {
      toggleCheck(r.dataset.cid);
      return;
    }
    if (matchMedia('(hover:none),(max-width:1099px)').matches) {
      pinned = +r.dataset.q;
      try {
        localStorage.setItem(STORE + '-pick', r.dataset.q);
      } catch (x) {}
      drawPreview();
      $('#prevPick').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else goView('sr', +r.dataset.q);
  };
  $('#openSR').onclick = () => goView('sr');

  /* inline score edit on the card: updates the latest study/review session */
  lanesEl.addEventListener('click', e => {
    const pill = e.target.closest('.task .score');
    if (!pill) return;
    e.stopPropagation();
    const i = +pill.closest('.task').dataset.topic,
      inp = document.createElement('input');
    inp.type = 'number';
    inp.min = 0;
    inp.max = 100;
    inp.className = 'scorein';
    inp.value = state.scores[i] ?? '';
    pill.replaceWith(inp);
    inp.focus();
    inp.select();
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      const v = inp.value.trim();
      if (!ok || v === '' || Math.round(+v) === state.scores[i]) {
        renderBoard();
        return;
      }
      const n = Math.max(0, Math.min(100, Math.round(+v)));
      commit(
        () => {
          state.scores[i] = n;
          const last = state.events
            .filter(x => x.topic === i && (x.kind === 'study' || x.kind === 'review'))
            .sort((a, b) => a.date.localeCompare(b.date))
            .pop();
          if (last) {
            last.score = n;
            last.partial = false;
          }
        },
        tf('scoreSaved', n).replace('{t}', TOPICS[i].name)
      );
    };
    inp.addEventListener('keydown', ev => {
      ev.stopPropagation();
      if (ev.key === 'Enter') finish(true);
      else if (ev.key === 'Escape') finish(false);
    });
    inp.addEventListener('blur', () => finish(true));
  });

  /* analysis tab */
  expose({
    preview: [
      () => preview,
      x => {
        preview = x;
      },
    ],
    pinned: [
      () => pinned,
      x => {
        pinned = x;
      },
    ],
    carTopic: [
      () => carTopic,
      x => {
        carTopic = x;
      },
    ],
  });
  return { carList, carTick, renderSRPanel, clipSugg };
})();
const { carList, carTick, renderSRPanel, clipSugg } = PreviewCarousel;
