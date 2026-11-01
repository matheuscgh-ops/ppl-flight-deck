/* ===== module Modal (js/ui/modal.js) =====
   public: modal, placeTip
   Shared pieces for every dialog and tooltip:
   modal(bg, { close, onClose })  wires a dialog backdrop the same way everywhere: the × button, a click on the
                                  backdrop and Escape close it (Escape is left to the confirm box when it is open).
                                  Returns { open(focusSel), close(), isOpen() }.
   placeTip(tip, e, opts)         puts a floating tooltip next to the pointer, inside the screen
                                  (above the finger on touch). */
const Modal = (() => {
  function modal(bgSel, { close: closeSel, onClose } = {}) {
    const bg = $(bgSel);
    const isOpen = () => !bg.hidden;
    function close() {
      if (!isOpen()) return;
      bg.hidden = true;
      if (onClose) onClose();
    }
    function open(focusSel) {
      bg.hidden = false;
      const f = focusSel && $(focusSel);
      if (f) f.focus();
    }
    if (closeSel) $(closeSel).addEventListener('click', close);
    bg.addEventListener('pointerdown', e => {
      if (e.target === bg) close();
    });
    document.addEventListener('keydown', e => {
      const ask = document.getElementById('askbg');
      if (e.key === 'Escape' && isOpen() && (!ask || ask.hidden || bg === ask)) close();
    });
    return { open, close, isOpen };
  }
  function placeTip(tip, e, { gap = 14, touchLift = 40 } = {}) {
    const r = tip.getBoundingClientRect(),
      touch = e.pointerType === 'touch';
    let x = touch ? e.clientX - r.width / 2 : e.clientX + gap,
      y = e.clientY - r.height - (touch ? touchLift : 12);
    x = Math.max(8, Math.min(innerWidth - r.width - 8, x));
    if (y < 8) y = e.clientY + 20;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  return { modal, placeTip };
})();
const { modal, placeTip } = Modal;
