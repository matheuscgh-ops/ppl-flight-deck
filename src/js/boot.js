/* ===== module Boot (js/boot.js) =====
   public: — */
const Boot = (() => {
  seedDemoPlan();
  save(false);
  render();
  fromHash();
  renderSyncChip();
  if (syncOn()) syncPull(true);
  try {
    if ((location.hash || '') === '#selftest') showSelfTest();
  } catch (e) {}
  window.addEventListener('hashchange', () => {
    try {
      if (location.hash === '#selftest' && !document.getElementById('selftestBox')) showSelfTest();
    } catch (e) {}
  });
  if (!/Mac|iPhone|iPad/.test(navigator.platform))
    document.querySelectorAll('.kbd').forEach(k => {
      if (k.textContent === '⌘K') k.textContent = 'Ctrl K';
    });
  setInterval(() => {
    const delta = diffDays(todayISO(), state.deadline);
    renderSide();
  }, 60000);
  if (loadedFromFile) setTimeout(() => toast(t('fromFile')), 300);
  return {};
})();
