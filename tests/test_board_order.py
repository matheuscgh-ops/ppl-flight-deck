"""Kanban drag and drop with a place: a card lands where you drop it (between two cards, in the same list or
another), the other cards slide aside, the order is saved (reload, backup, sync), one Undo reverts it, and a
move to another list is still logged with its date. Desktop, laptop, iPad mini and iPhone — personal and demo."""
import os, sys, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA))]
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:240]))

LANE = "(j=>[...document.querySelectorAll('.lane')[j].querySelectorAll('.task')].map(c=>+c.dataset.topic))"
# drag with real pointer events: mouse moves at once, touch presses and holds first (the board's long-press)
DRAG = """async ([from, toLane, beforeIdx, touch]) => {
  const card = document.querySelector(`.task[data-topic="${from}"]`), lane = document.querySelectorAll('.lane')[toLane];
  lane.scrollIntoView({block:'nearest', inline:'center'}); await new Promise(r=>setTimeout(r,250));
  const c = card.getBoundingClientRect(), P = (type, el, x, y) => el.dispatchEvent(new PointerEvent(type, {bubbles:true, cancelable:true, pointerId:3, pointerType: touch?'touch':'mouse', clientX:x, clientY:y, isPrimary:true, button:0}));
  let x = c.left + 10, y = c.top + 8;
  P('pointerdown', card, x, y);
  if (touch) await new Promise(r=>setTimeout(r,320));
  P('pointermove', window, x + 1, y + 7); await new Promise(r=>setTimeout(r,30));
  lane.scrollIntoView({block:'nearest', inline:'center'}); await new Promise(r=>setTimeout(r,250));
  const cards = [...lane.querySelectorAll('.task')].filter(t => t !== card), lr = lane.getBoundingClientRect();
  let tx = lr.left + lr.width / 2, ty;
  if (beforeIdx < cards.length) { const r = cards[beforeIdx].getBoundingClientRect(); ty = r.top + 3; }
  else { const r = cards.length ? cards[cards.length - 1].getBoundingClientRect() : lane.querySelector('.lanecards').getBoundingClientRect(); ty = r.bottom + 6; }
  for (let k = 1; k <= 6; k++) { P('pointermove', window, x + (tx - x) * k / 6, y + (ty - y) * k / 6); await new Promise(r=>setTimeout(r,40)); }
  const gap = !!document.querySelector('.task-gap'), ghost = !!document.querySelector('.ghost');
  P('pointerup', window, tx, ty); await new Promise(r=>setTimeout(r,250));
  return {gap, ghost};
}"""

with sync_playwright() as p:
    b = p.chromium.launch()
    for f in ['index', 'demo']:
        for mode, opts in DEV:
            tag = f'{f} · {mode}'; touch = mode in ('phone', 'iPad mini')
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: errs.append('browser dialog: ' + d.message) or d.dismiss())
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(500)
            ev = pg.evaluate
            ev("window.pplTour&&pplTour.end()"); ev("goView('dash')"); pg.wait_for_timeout(150)
            # a known board: 4 cards in Doing (lane 1), 3 in To review (lane 4)
            ev("""(()=>{state.statuses=state.statuses.map(()=> 'Very Comfortable');[2,5,8,11].forEach(i=>state.statuses[i]='Doing');[3,6,9].forEach(i=>state.statuses[i]='To review');
                 state.order=TOPICS.map((_,i)=>i);save();render()})()""")
            pg.wait_for_timeout(150)
            check(f'{tag}: lists follow the saved card order', ev(LANE + "(1)") == [2, 5, 8, 11])
            ev0 = ev("state.events.length")
            # inside the list: drop card 11 before card 5
            r = ev(DRAG, [11, 1, 1, touch])
            check(f'{tag}: while dragging, a tilted copy follows the pointer and a gap shows where it lands', r['gap'] and r['ghost'], r)
            check(f'{tag}: dropped inside its list, the card stays exactly where it was dropped', ev(LANE + "(1)") == [2, 11, 5, 8], ev(LANE + "(1)"))
            check(f'{tag}: reordering inside a list is not logged as a move', ev("state.events.length") == ev0 and not pg.query_selector('.task-gap') and not pg.query_selector('.ghost'))
            # to another list, at a position: card 8 between 3 and 6 in To review
            r = ev(DRAG, [8, 4, 1, touch])
            check(f'{tag}: dropped in another list, it lands between the two cards it was dropped between', ev(LANE + "(4)") == [3, 8, 6, 9] and ev(LANE + "(1)") == [2, 11, 5], [ev(LANE + "(1)"), ev(LANE + "(4)")])
            check(f'{tag}: a move to another list is still logged (one event, from → to)', ev("state.events.length") == ev0 + 1 and ev("(e=>e.kind==='move'&&e.topic===8&&e.from==='Doing'&&e.to==='To review')(state.events[state.events.length-1])"))
            # one Undo reverts the move and the place
            ev("document.querySelector('#toast button').click()"); pg.wait_for_timeout(200)
            check(f'{tag}: one Undo puts the card back in its list and place', ev(LANE + "(1)") == [2, 11, 5, 8] and ev(LANE + "(4)") == [3, 6, 9] and ev("state.events.length") == ev0)
            # saved: reload, backup
            ev(DRAG, [2, 1, 3, touch])
            want = ev(LANE + "(1)")
            check(f'{tag}: drop at the end of a list', want == [11, 5, 8, 2], want)
            pg.reload(); pg.wait_for_timeout(500); ev("window.pplTour&&pplTour.end()"); ev("goView('dash')"); pg.wait_for_timeout(150)
            check(f'{tag}: the order is saved (same after reload)', ev(LANE + "(1)") == want)
            check(f'{tag}: the order goes into the backup and survives a broken one', ev("normalize(JSON.parse(JSON.stringify(state))).order.join()") == ev("state.order.join()") and ev("normalize({...JSON.parse(JSON.stringify(state)),order:[1,1,2]}).order.length") == 26)
            # a tap still opens the card
            if touch: pg.tap('.task[data-topic="5"] .tname')
            else: pg.click('.task[data-topic="5"] .tname')
            pg.wait_for_timeout(250)
            check(f'{tag}: a tap or click (no drag) still opens the card', pg.is_visible('#modalbg'))
            check(f'{tag}: no script errors or browser pop-ups', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} board order tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
