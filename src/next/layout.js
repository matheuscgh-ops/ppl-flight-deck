/* ===== module NextLayout (next/layout.js) — demo-next.html only =====
   public: none
   Moves a few existing elements to where the new design wants them; their code and ids stay the same:
     · the "next up" bar (with focus mode and its stopwatch behind it) goes into the header, so it is also there on
       tablets and computers (it was a phones-only bar at the bottom). On phones the CSS still floats it at the bottom,
       above the tab bar.                                                                                          */
(() => {
  const bar = $('#nowBar'),
    tools = $('header.top .tools');
  if (bar && tools) tools.parentNode.insertBefore(bar, tools);
  if (typeof renderNowBar === 'function') renderNowBar();
})();
