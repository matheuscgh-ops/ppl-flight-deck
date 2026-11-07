/* ===== module NextLayout (next/layout.js) — demo-next.html only =====
   public: none
   Moves a few existing elements to where the new design wants them; their code and ids stay the same:
     · the "next up" bar (with focus mode and its stopwatch behind it) goes into the header, so it is also there on
       tablets and computers (it was a phones-only bar at the bottom). On phones the CSS still floats it at the bottom,
       above the tab bar.
     · the page's scroll padding follows the header's height, so nothing scrolls into view underneath it.                                                                                          */
(() => {
  const bar = $('#nowBar'),
    tools = $('header.top .tools');
  if (bar && tools) tools.parentNode.insertBefore(bar, tools);
  if (typeof renderNowBar === 'function') renderNowBar();
  /* anything scrolled into view (a focused card, a jump to a section) stops below the header that stays on top: the
     scroll padding follows the header's real height (it wraps to 2–3 rows on tablets and in longer languages) */
  const head = $('header.top');
  if (head && typeof ResizeObserver === 'function') {
    const fit = () => {
      const sticky = getComputedStyle(head).position === 'sticky';
      document.documentElement.style.scrollPaddingTop = sticky ? Math.ceil(head.offsetHeight + 8) + 'px' : '';
    };
    new ResizeObserver(fit).observe(head);
    fit();
  }
})();
