/* ===== module Navigation (js/ui/navigation.js) =====
   public: goView, fromHash
   shared state (getter/setter): curView */
const Navigation = (() => {
  let curView = 'dash';
  function showView(v, focus) {
    curView = v;
    const sr = v === 'sr',
      pl = v === 'plan',
      ts = v === 'tests';
    document.body.classList.toggle('srview', sr || pl || ts);
    $('#viewDash').hidden = sr || pl || ts;
    $('#viewSR').hidden = !sr;
    $('#viewPlan').hidden = !pl;
    $('#viewTests').hidden = !ts;
    document.querySelectorAll('.tabs button').forEach(a => {
      const on = a.dataset.view === v;
      a.classList.toggle('on', on);
      a.setAttribute('aria-selected', on);
    });
    if (sr) {
      if (focus === 'tests') {
        setStat('tests');
        window.scrollTo(0, 0);
      } else {
        setStat('bank');
        renderSRPage(focus === 'fc' ? null : focus);
        if (focus === 'fc') $('#fcSection').scrollIntoView({ block: 'start' });
        else if (focus == null) window.scrollTo(0, 0);
      }
    } else if (pl) {
      renderPlanPage();
      window.scrollTo(0, 0);
    } else if (ts) {
      renderTestsPage();
      window.scrollTo(0, 0);
    } else {
      if (dashDirty) renderDash();
      else {
        renderCalendar();
        renderSRPanel();
        renderTsStrip();
      }
      window.scrollTo(0, 0);
    }
  }
  function goView(v, focus) {
    showView(v, focus);
    const h =
      v === 'sr'
        ? focus === 'tests'
          ? '#stats-tests'
          : '#review' + (focus != null && focus !== 'fc' ? '/' + focus : '')
        : v === 'plan'
          ? '#plan'
          : v === 'tests'
            ? '#tests'
            : '#dashboard';
    try {
      if (location.hash !== h) history.pushState({ v, focus }, '', h);
    } catch (e) {}
  }
  function fromHash() {
    let h = '';
    try {
      h = location.hash || '';
    } catch (e) {}
    if (h.startsWith('#review')) {
      const f = h.split('/')[1];
      showView('sr', f ? +f : null);
    } else if (h === '#plan') showView('plan');
    else if (h === '#tests') showView('tests');
    else if (h === '#stats-tests') showView('sr', 'tests');
    else showView('dash');
  }
  document.querySelectorAll('.tabs button').forEach(b => (b.onclick = () => goView(b.dataset.view)));
  window.addEventListener('popstate', e => {
    const st = e.state;
    if (st && st.v) showView(st.v, st.focus);
    else fromHash();
  });

  /* quick log palette (⌘K / Ctrl+K / "/") */
  expose({
    curView: [
      () => curView,
      x => {
        curView = x;
      },
    ],
  });
  return { goView, fromHash };
})();
const { goView, fromHash } = Navigation;
