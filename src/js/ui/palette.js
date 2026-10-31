/* ===== module QuickLogPalette (js/ui/palette.js) =====
   public: — */
const QuickLogPalette = (() => {
  let palSel = 0,
    palItems = [];
  function palRender() {
    const q = $('#palIn').value.trim().toLowerCase();
    const rank = srAll().map(m => m.i);
    const order = [...rank, ...TOPICS.map((_, i) => i).filter(i => !rank.includes(i))];
    palItems = order
      .filter(
        i =>
          !q ||
          TOPICS[i].name
            .toLowerCase()
            .split(/\W+/)
            .some(w => w.startsWith(q)) ||
          TOPICS[i].name.toLowerCase().includes(q)
      )
      .slice(0, 9);
    palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
    $('#palList').innerHTML = palItems
      .map(
        (i, k) =>
          `<div class="pitem${k === palSel ? ' on' : ''}" data-k="${k}" role="option"><span class="dot" style="background:${COLORS[STATUS.indexOf(state.statuses[i])]}"></span><span class="n">${esc(TOPICS[i].name)}</span><small>${esc(label(state.statuses[i]))} · ${tf('qn', TOPICS[i].q)}</small></div>`
      )
      .join('');
  }
  function palOpen() {
    if (!$('#modalbg').hidden) return;
    $('#palIn').placeholder = t('palPh');
    $('#palIn').value = '';
    palSel = 0;
    palRender();
    $('#palbg').hidden = false;
    $('#palIn').focus();
  }
  function palClose() {
    $('#palbg').hidden = true;
  }
  function palPick(k, mode) {
    const i = palItems[k];
    if (i == null) return;
    palClose();
    if (mode === 'open') {
      openModal(i);
      return;
    }
    commit(
      () => state.events.push({ id: uid(), date: todayISO(), topic: i, kind: mode, from: null, to: null, demo: false }),
      t('logged').replace('{t}', TOPICS[i].name).replace('{k}', t(mode))
    );
    const c = document.querySelector(`.task[data-topic="${i}"]`);
    if (c) {
      c.scrollIntoView({ block: 'nearest' });
      c.classList.add('flash');
    }
  }
  $('#palIn').oninput = () => {
    palSel = 0;
    palRender();
  };
  $('#palIn').onkeydown = e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      palSel = Math.min(palSel + 1, palItems.length - 1);
      palRender();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      palSel = Math.max(palSel - 1, 0);
      palRender();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      palPick(palSel, e.altKey ? 'open' : e.shiftKey ? 'review' : 'study');
    } else if (e.key === 'Escape') {
      palClose();
    }
  };
  $('#palList').onclick = e => {
    const it = e.target.closest('.pitem');
    if (it) palPick(+it.dataset.k, e.shiftKey ? 'review' : 'study');
  };
  $('#palbg').addEventListener('pointerdown', e => {
    if (e.target.id === 'palbg') palClose();
  });
  document.addEventListener('keydown', e => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $('#palbg').hidden ? palOpen() : palClose();
    } else if (e.key === '/' && !typing && $('#palbg').hidden) {
      e.preventDefault();
      palOpen();
    }
  });

  /* modal */
  return {};
})();
