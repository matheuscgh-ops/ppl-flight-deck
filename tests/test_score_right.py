"""Score from right answers: a Kanban card in today's plan shows the questions planned today ("30/158 q"), and its score
can be typed as right answers of those questions (27 of 30 → 90%) — on the card and in the log dialog — or as a
percentage, as before. Desktop, laptop, iPad mini and iPhone — personal and demo."""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA))]
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:300]))
# today: Weather Information (18, 158 q) planned for 30 questions; Taxiing (22) not in the plan
PLAN = """(()=>{const T=todayISO();(state.plans||[]).forEach(p=>p.active=false);state.plans=(state.plans||[]).filter(p=>p.id!=='pS');
  state.plans.push({id:'pS',type:'daily',name:'',start:T,active:true,blocks:{[T]:[[1140,1260]]},items:[{id:'s1',date:T,start:1140,min:60,kind:'topic',i:18,n:30,reason:'weak'}]});
  state.statuses[18]='Doing';state.statuses[22]='Doing';state.events=state.events.filter(e=>!(e.date===T&&(e.topic===18||e.topic===22)));
  state.events.push({id:'sr18',date:addDays(T,-3),topic:18,kind:'study',score:60,partial:false,demo:false});
  state.events.push({id:'sr22',date:addDays(T,-3),topic:22,kind:'study',score:60,partial:false,demo:false});
  state.scores[18]=60;state.scores[22]=60;save();render()})()"""

with sync_playwright() as p:
    b = getattr(p, os.environ.get("PPL_BROWSER", "chromium")).launch()
    for f in ['index', 'demo']:
        for mode, opts in DEV:
            tag = f'{f} · {mode}'; W = opts['viewport']['width']; touch = opts.get('has_touch')
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: errs.append('browser dialog: ' + d.message) or d.dismiss())
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(500)
            ev = pg.evaluate
            ev("window.pplTour&&pplTour.end()"); ev("goView('dash')"); ev(PLAN); pg.wait_for_timeout(200)
            tap = (lambda s: pg.tap(s)) if touch else (lambda s: pg.click(s))
            def show(i): ev(f"(()=>{{const c=document.querySelector('.task[data-topic=\"{i}\"]');if(typeof goLane==='function'&&phoneMQ.matches)goLane(STATUS.indexOf(state.statuses[{i}]),false);c.scrollIntoView({{block:'center',inline:'center'}})}})()"); pg.wait_for_timeout(250)

            check(f'{tag}: questions planned today = 30 for Weather, none for Taxiing', ev("plannedToday(18)") == 30 and ev("plannedToday(22)") is None)
            meta = ev("document.querySelector('.task[data-topic=\"18\"] .tmeta span').textContent")
            check(f'{tag}: the Weather card shows 30 of its 158 questions', meta.replace(' ', ' ').startswith('30/158'), meta)
            # inline: right answers of the planned questions
            show(18); tap('.task[data-topic="18"] .score'); pg.wait_for_timeout(150)
            o = ev("(()=>{const m=document.querySelector('.task[data-topic=\"18\"] .scoremode'),i=document.querySelector('.task[data-topic=\"18\"] .scorein');return {mode:m&&m.textContent,ph:i&&i.placeholder,max:i&&i.max,val:i&&i.value}})()")
            check(f'{tag}: tapping the score asks for right answers of 30 (empty field, "/30")', o['mode'] == '/30' and o['ph'] == '✓' and o['max'] == '30' and o['val'] == '', o)
            pg.keyboard.type('27'); pg.wait_for_timeout(100)
            check(f'{tag}: while typing it shows the percentage (= 90%)', ev("document.querySelector('.task[data-topic=\"18\"] .scoremode').textContent") == '/30 = 90%')
            pg.keyboard.press('Enter'); pg.wait_for_timeout(250)
            check(f'{tag}: Enter saves 90% on the card and on the latest session', ev("state.scores[18]") == 90 and ev("state.events.find(e=>e.id==='sr18').score") == 90 and '90%' in ev("document.querySelector('.task[data-topic=\"18\"] .score').textContent"))
            ev("document.querySelector('#toast button').click()"); pg.wait_for_timeout(200)
            check(f'{tag}: Undo puts back 60%', ev("state.scores[18]") == 60)
            # switch to typing the percentage
            show(18); tap('.task[data-topic="18"] .score'); pg.wait_for_timeout(150)
            tap('.task[data-topic="18"] .scoremode'); pg.wait_for_timeout(120)
            check(f'{tag}: the "/30" button switches to typing the percentage, the editor stays open', ev("document.querySelector('.task[data-topic=\"18\"] .scoremode').textContent") == '%' and ev("document.activeElement.classList.contains('scorein')"))
            pg.keyboard.type('85'); pg.keyboard.press('Enter'); pg.wait_for_timeout(250)
            check(f'{tag}: typed as a percentage, 85 saves 85%', ev("state.scores[18]") == 85)
            # more right answers than questions can't go over 100%
            show(18); tap('.task[data-topic="18"] .score'); pg.wait_for_timeout(150); pg.keyboard.type('35'); pg.keyboard.press('Enter'); pg.wait_for_timeout(250)
            check(f'{tag}: more right answers than planned questions is capped at 100%', ev("state.scores[18]") == 100)
            # a topic not in today's plan keeps the plain percentage field
            show(22); tap('.task[data-topic="22"] .score'); pg.wait_for_timeout(150)
            check(f'{tag}: a card not in today\'s plan asks for the percentage, as before', not ev("document.querySelector('.task[data-topic=\"22\"] .scoremode')") and ev("document.querySelector('.task[data-topic=\"22\"] .scorein').value") == '60')
            pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
            # the log dialog: right answers of the planned questions fill the score; typing the score clears them
            ev("openModal(18,'review')"); pg.wait_for_timeout(150)
            check(f'{tag}: the log dialog offers "Right answers of 30"', ev("document.getElementById('mOf').value") == '30' and ev("document.getElementById('mRight').value") == '')
            pg.fill('#mRight', '27'); pg.wait_for_timeout(80)
            check(f'{tag}: 27 of 30 fills the score with 90', ev("document.getElementById('mScore').value") == '90')
            pg.fill('#mOf', '40'); pg.wait_for_timeout(80)
            check(f'{tag}: the number of questions can be changed (27 of 40 → 68)', ev("document.getElementById('mScore').value") == '68')
            pg.fill('#mScore', '75'); pg.wait_for_timeout(80)
            check(f'{tag}: typing the score yourself still works (right answers clear)', ev("document.getElementById('mRight').value") == '' and ev("document.getElementById('mScore').value") == '75')
            pg.fill('#mRight', '27'); pg.fill('#mOf', '30'); pg.wait_for_timeout(80)
            n0 = ev("state.events.length"); tap('#mSave'); pg.wait_for_timeout(250)
            check(f'{tag}: Save records the session with 90%', ev("state.events.length") == n0 + 1 and ev("state.events.at(-1).score") == 90 and ev("state.scores[18]") == 90)
            ev("openModal(22,'review')"); pg.wait_for_timeout(150)
            check(f'{tag}: for a topic not in today\'s plan the number of questions starts empty', ev("document.getElementById('mOf').value") == '')
            ev("closeModal()"); pg.wait_for_timeout(100)
            for l in ['pt', 'ja']:
                ev(f"document.querySelector('.flag[data-lang=\"{l}\"]').click()"); pg.wait_for_timeout(80)
                ev("openModal(18,'review')"); pg.wait_for_timeout(100)
                txt = ev("document.querySelector('#modalbg .modal').innerText")
                check(f'{tag} [{l}]: the right-answers field is translated', 'rightField' not in txt and 'ofWord' not in txt and ('acertos' in txt.lower() if l == 'pt' else '正解数' in txt))
                ev("closeModal()")
            ev("document.querySelector('.flag[data-lang=\"en\"]').click()"); pg.wait_for_timeout(80)
            check(f'{tag}: page fits the screen', ev('document.documentElement.scrollWidth') <= W)
            check(f'{tag}: no script errors or browser pop-ups', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} right-answers score tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
