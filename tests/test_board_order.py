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
LANE2 = "(j=>[...document.querySelectorAll('.lane')[j].querySelectorAll('.task')].map(c=>c.dataset.card||+c.dataset.topic))"
# drag with real pointer events: mouse moves at once, touch presses and holds first (the board's long-press)
DRAG = """async ([from, toLane, beforeIdx, touch]) => {
  const card = document.querySelector(typeof from === 'string' ? `.task[data-card="${from}"]` : `.task[data-topic="${from}"]`), lane = document.querySelectorAll('.lane')[toLane];
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
            pg.keyboard.press('Escape'); ev("typeof closeModal==='function'&&closeModal()"); pg.wait_for_timeout(150)
            # ---------- your own cards (tasks): add, rename, drag, delete; never in the statistics ----------
            stats0 = ev("JSON.stringify([counts(),TOTAL])")
            ev("document.querySelectorAll('.lane')[4].scrollIntoView({block:'center',inline:'center'})"); pg.wait_for_timeout(250)
            add_sel = '.lane[data-lane="4"] .laneadd' if pg.is_visible('.lane[data-lane="4"] .laneadd') else '.lane[data-lane="4"] .addcard'
            check(f'{tag}: one way to add a card per list ("+" in the header on a one-screen desktop, "+ Add a card" below otherwise)', pg.is_visible('.lane[data-lane="4"] .laneadd') != pg.is_visible('.lane[data-lane="4"] .addcard'))
            (pg.tap if touch else pg.click)(add_sel); pg.wait_for_timeout(120)
            check(f'{tag}: "+ Add a card" opens a title box at the end of the list', pg.is_visible('.composer .cardin') and ev("document.activeElement.classList.contains('cardin')"))
            pg.keyboard.type('Review the theory'); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
            check(f'{tag}: Enter adds the card to that list and keeps the box open for the next one', ev("state.cards.length===1&&state.cards[0].title==='Review the theory'&&state.cards[0].status==='To review'") and pg.is_visible('.composer .cardin'))
            pg.keyboard.type('Simulator'); (pg.tap if touch else pg.click)('[data-cact="add"]'); pg.wait_for_timeout(150)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(120)
            check(f'{tag}: "Add card" adds another; Esc closes the box', ev("state.cards.map(c=>c.title).join('|')") == 'Review the theory|Simulator' and not pg.is_visible('.composer'))
            ids = ev("state.cards.map(c=>c.id)")
            check(f'{tag}: your cards show in the list as tasks, after the topics', ev(LANE2 + "(4)")[-2:] == ids and pg.locator('.task.own .owntag').count() == 2)
            check(f'{tag}: your cards are not in the statistics (progress and question bank unchanged)', ev("JSON.stringify([counts(),TOTAL])") == stats0)
            ev(DRAG, [ids[0], 1, 1, touch])
            check(f'{tag}: your card drags like any card and lands where dropped', ev(LANE2 + "(1)")[1:2] == [ids[0]] and ev("state.cards[0].status") == 'Doing', ev(LANE2 + "(1)"))
            check(f'{tag}: moving your card is not a study event', ev("state.events.every(e=>Number.isInteger(e.topic))"))
            ev(f"document.querySelector('.task[data-card=\"{ids[1]}\"]').scrollIntoView({{block:'center',inline:'center'}})"); pg.wait_for_timeout(250)
            (pg.tap if touch else pg.click)(f'.task[data-card="{ids[1]}"] .tname'); pg.wait_for_timeout(150)
            check(f'{tag}: a click on your card opens it to rename or delete', pg.is_visible('.own.editing .cardin') and pg.is_visible('[data-cact="del"]'))
            pg.fill('.own.editing .cardin', 'Simulator: steep turns'); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
            check(f'{tag}: rename saves with Enter', ev("state.cards[1].title") == 'Simulator: steep turns' and not pg.is_visible('.own.editing'))
            (pg.tap if touch else pg.click)(f'.task[data-card="{ids[1]}"] .tname'); pg.wait_for_timeout(150)
            (pg.tap if touch else pg.click)('[data-cact="del"]'); pg.wait_for_timeout(150)
            check(f'{tag}: Delete removes your card (remembered as deleted for sync)', ev("state.cards.length") == 1 and ev(f"!!state.deleted['{ids[1]}']"))
            ev("document.querySelector('#toast button').click()"); pg.wait_for_timeout(200)
            check(f'{tag}: Undo brings it back', ev("state.cards.length") == 2)
            pg.reload(); pg.wait_for_timeout(500); ev("window.pplTour&&pplTour.end()"); ev("goView('dash')"); pg.wait_for_timeout(150)
            check(f'{tag}: your cards and their places are saved (reload)', ev("state.cards.length") == 2 and ev(LANE2 + "(1)")[1:2] == [ids[0]])
            check(f'{tag}: sync unites cards made on two devices', ev("(()=>{const a=JSON.parse(JSON.stringify(state)),b=JSON.parse(JSON.stringify(state));b.cards=[...b.cards,{id:'kOther',title:'From the phone',status:'Todo'}];b.updatedAt=(a.updatedAt||0)+5;const m=mergeStates(a,b);return m.cards.length===3&&m.order.includes('kOther')})()"))
            check(f'{tag}: a broken card list in a backup is cleaned, not fatal', ev("normalize({...JSON.parse(JSON.stringify(state)),cards:[{title:''},{title:'ok',status:'Nope'},null]}).cards.length") == 0)
            # plan → Kanban: your own activities in today's plan become cards in Doing on Sync with Kanban (only that way)
            ev("""(()=>{const T=todayISO();state.plans=[{id:'pK',type:'daily',name:'',start:T,active:true,blocks:{[T]:[[1140,1260]]},
                 items:[{id:'a1',date:T,start:1140,min:30,kind:'custom',i:null,n:0,label:'Radio calls practice',reason:'custom'},
                        {id:'a2',date:T,start:1170,min:20,kind:'custom',i:null,n:0,label:'review the theory',reason:'custom'}]}];save();render()})()""")
            ev("(()=>{state.cards.forEach(c=>c.status='To review');save();render()})()")
            ev("goView('plan')"); pg.wait_for_timeout(200)
            check(f'{tag}: the plan editor does not offer Kanban cards (cards made on the Kanban stay off the plan)', ev("(openWizard({mode:'new',type:'daily',start:todayISO()}),!/Review the theory/.test(document.getElementById('wzBody').innerHTML))"))
            ev("closeWizard()"); pg.wait_for_timeout(100)
            (pg.tap if touch else pg.click)('#kbSync'); pg.wait_for_timeout(250)
            txt = pg.inner_text('#kbList')
            check(f'{tag}: Sync with Kanban lists the plan’s own activities: a new card, and your existing card moving to Doing', 'Radio calls practice' in txt and 'New card' in txt and 'Review the theory' in txt, txt)
            (pg.tap if touch else pg.click)('#kbOk'); pg.wait_for_timeout(250)
            check(f'{tag}: after OK the new card appears in Doing and the existing one moved there (no study events)', ev("state.cards.some(c=>c.title==='Radio calls practice'&&c.status==='Doing')&&state.cards.find(c=>c.id===%r).status==='Doing'&&state.cards.length===3" % ids[0]) and ev("state.events.every(e=>Number.isInteger(e.topic))"))
            ev("goView('dash')"); pg.wait_for_timeout(150)
            check(f'{tag}: the new card shows on the board', 'Radio calls practice' in pg.inner_text('.lane[data-lane="1"]'))
            ev("goView('plan')"); pg.wait_for_timeout(100); (pg.tap if touch else pg.click)('#kbSync'); pg.wait_for_timeout(250)
            check(f'{tag}: syncing again adds nothing twice', 'Radio calls practice' not in pg.inner_text('#kbList'))
            ev("document.getElementById('kbCancel').click()"); pg.wait_for_timeout(100)
            check(f'{tag}: no script errors or browser pop-ups', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} board order tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
