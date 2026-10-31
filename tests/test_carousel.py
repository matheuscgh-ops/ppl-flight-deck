"""Dashboard spaced-repetition preview carousel: every 3 s it moves through today's plan topics that have a memory curve,
highlights the plan row, and pauses on hover (panel or Kanban card) or when a topic is picked. All devices, both files."""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA))]
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:220]))
SETUP = """(()=>{const T=todayISO(),D=n=>addDays(T,-n),ev=(n,topic,sc)=>({id:'c'+topic+'_'+n,date:D(n),topic,kind:n>8?'study':'review',from:null,to:null,score:sc,partial:false,demo:false});
  state.statuses=TOPICS.map(()=> 'Todo');state.statuses[18]='Not Comfortable';state.statuses[13]='Not Comfortable';state.statuses[12]='Very Comfortable';
  state.events=[ev(12,18,60),ev(6,18,70),ev(11,13,70),ev(5,13,80),ev(10,12,90),ev(3,12,95)];state.tests=[];state.plan=null;
  state.settings={minutes:600,qph:40,testEvery:0,reviewMin:1.5};pinned=null;preview=null;carTopic=null;try{localStorage.removeItem(STORE+'-pick')}catch(e){};save();render();})()"""

with sync_playwright() as p:
    b = p.chromium.launch()
    for f in ['index', 'demo']:
        for mode, opts in DEV:
            tag = f'{f} · {mode}'; touch = mode in ('phone', 'iPad mini')
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(400)
            ev = pg.evaluate
            ev(SETUP); pg.wait_for_timeout(200)
            pg.mouse.move(2, 2) if not touch else None
            L = ev("carList()")
            check(f'{tag}: carousel list = average + plan topics that have a curve', L[0] is None and len(L) >= 3 and all(isinstance(x, int) for x in L[1:]) and ev("carList().slice(1).every(i=>srModel(i).reps.length)"), L)
            ev("document.getElementById('srPanel').scrollIntoView({block:'center'})"); pg.wait_for_timeout(100)
            if not touch: pg.mouse.move(2, 2)
            t0 = pg.inner_text('#prevTitle')
            pg.wait_for_timeout(3300)
            t1 = pg.inner_text('#prevTitle')
            check(f'{tag}: after 3 seconds the preview shows the next topic of the plan', t1 != t0 and t1 == ev(f"TOPICS[{L[1]}].name"), (t0, t1))
            check(f'{tag}: the preview chart is that topic\'s curve', ev("document.querySelector('#prevChart svg')!==null") and ev("carTopic") == L[1])
            check(f'{tag}: the topic shown is highlighted in today\'s plan', ev(f"!!document.querySelector('#sugg .qrow.car[data-q=\"{L[1]}\"]')") and ev("document.querySelectorAll('#sugg .qrow.car').length") == 1)
            check(f'{tag}: dots show the position (2nd of {len(L)})', ev("document.querySelectorAll('#carDots i').length") == len(L) and ev("[...document.querySelectorAll('#carDots i')].findIndex(i=>i.classList.contains('on'))") == 1)
            for k in range(len(L) - 1): ev("carTick()")
            check(f'{tag}: after the last topic it goes back to the average', ev("carTopic") is None and pg.inner_text('#prevTitle') == ev("t('avgCurve')"))
            if not touch:
                pg.hover('#srPanel .prevtitle'); pg.wait_for_timeout(100)
                before = ev("carTopic"); ev("carTick()"); ev("carTick()")
                check(f'{tag}: mouse over the panel pauses the carousel', ev("carTopic") == before)
                pg.mouse.move(2, 2); pg.wait_for_timeout(100); ev("carTick()")
                check(f'{tag}: leaving the panel resumes it', ev("carTopic") != before)
                pg.hover('.task[data-topic="18"] .tname'); pg.wait_for_timeout(200)
                check(f'{tag}: hovering a Kanban card shows that card and pauses the carousel', pg.inner_text('#prevTitle') == ev("TOPICS[18].name"))
                cur = ev("carTopic"); ev("carTick()")
                check(f'{tag}: … while on the card the carousel does not move', ev("carTopic") == cur and pg.inner_text('#prevTitle') == ev("TOPICS[18].name"))
                pg.mouse.move(2, 2); pg.wait_for_timeout(300)
            else:
                pg.select_option('#prevPick', str(L[2])); pg.wait_for_timeout(150)
                ev("carTick()"); ev("carTick()")
                check(f'{tag}: picking a topic stops the carousel on it', pg.inner_text('#prevTitle') == ev(f"TOPICS[{L[2]}].name") and ev("document.getElementById('carDots').hidden"))
                pg.select_option('#prevPick', ''); pg.wait_for_timeout(150); ev("carTick()")
                check(f'{tag}: back to "average" in the picker → the carousel runs again', ev("carTopic") is not None)
            # dynamic: the list follows today's plan
            plan_order = ev("(()=>{const s=new Set();return buildPlan(null,null,energyMode).items.filter(x=>x.kind==='topic'&&!x.done&&!s.has(x.i)&&s.add(x.i)&&srModel(x.i).reps.length).map(x=>x.i)})()")
            check(f'{tag}: carousel order = today\'s plan order', ev("carList()")[1:] == plan_order, (ev("carList()"), plan_order))
            first = ev("carList()[1]")
            ev(f"commit(()=>{{state.events.push({{id:'done{first}',date:todayISO(),topic:{first},kind:'review',score:92,from:null,to:null,partial:false,demo:false}})}},'x')"); pg.wait_for_timeout(250)
            check(f'{tag}: a topic done today leaves the carousel', first not in ev("carList()"), ev("carList()"))
            ev("setEnergy('low')"); pg.wait_for_timeout(200)
            low = ev("(()=>{const s=new Set();return buildPlan(null,null,'low').items.filter(x=>x.kind==='topic'&&!x.done&&!s.has(x.i)&&s.add(x.i)&&srModel(x.i).reps.length).map(x=>x.i)})()")
            check(f'{tag}: changing the energy mode re-orders the carousel like the new plan', ev("carList()")[1:] == low, (ev("carList()"), low))
            ev("setEnergy('medium')")
            ev("goView('sr')"); pg.wait_for_timeout(200); cur = ev("carTopic"); ev("carTick()")
            check(f'{tag}: on other tabs the carousel does not run', ev("carTopic") == cur)
            ev("goView('dash')")
            check(f'{tag}: dashboard still not wider than the screen', ev('document.documentElement.scrollWidth') == opts['viewport']['width'])
            check(f'{tag}: no JavaScript errors', not errs, errs)
            c.close()
    b.close()
ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} carousel tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
