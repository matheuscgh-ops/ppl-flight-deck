/* ===== module HeaderControls (js/ui/header-controls.js) =====
   public: — */
const HeaderControls = (() => {
  /* header & calendar controls */
  document.querySelectorAll('.flag').forEach(
    b =>
      (b.onclick = () => {
        lang = b.dataset.lang;
        state.lang = lang;
        save(false);
        render();
      })
  );
  $('#prev').onclick = () => {
    shown = new Date(shown.getFullYear(), shown.getMonth() - 1, 1);
    renderCalendar();
  };
  $('#next').onclick = () => {
    shown = new Date(shown.getFullYear(), shown.getMonth() + 1, 1);
    renderCalendar();
  };
  $('#now').onclick = () => {
    shown = new Date();
    renderCalendar();
  };
  $('#examDate').onchange = e => {
    if (!e.target.value) return;
    const v = e.target.value;
    commit(() => {
      state.deadline = v;
    }, t('saved'));
  };
  $('#clearDemo').onclick = async () => {
    if (!(await ask(t('demoConfirm'), t('clear')))) return;
    commit(() => {
      state.events = state.events.filter(e => !e.demo);
      state.plans = (state.plans || []).filter(p => !p.demo);
    }, t('cleared'));
  };

  function download(name, content, type) {
    const a = document.createElement('a'),
      url = URL.createObjectURL(new Blob([content], { type }));
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(t('exported'));
  }
  $('#backup').onclick = () =>
    download(`PPL_backup_${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json');
  $('#saveHtml').onclick = () => {
    const json = JSON.stringify(state).replace(/</g, '\\u003c');
    const html = TEMPLATE.replace(
      /(<script id="embedded" type="application\/json">)[\s\S]*?(<\/script>)/,
      (m, a, b) => a + json + b
    );
    download(`PPL_Flight_Deck_${todayISO()}.html`, html, 'text/html');
  };
  $('#restore').onclick = () => $('#file').click();
  $('#file').onchange = async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const o = normalize(JSON.parse(await f.text()));
      if (!o) throw 0;
      commit(() => {
        state = o;
        lang = o.lang;
      }, t('imported'));
    } catch (err) {
      toast(t('invalid'));
    }
  };

  let rz;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(rz);
    rz = requestAnimationFrame(fitTags);
  });
  let lastDay = todayISO();
  setInterval(() => {
    if (todayISO() !== lastDay) {
      lastDay = todayISO();
      render();
    }
  }, 60000);
  return {};
})();
