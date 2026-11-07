"""The 28 Sporty's topics and the ASA Prepware equivalence. Two topics were added at the end (Approach and Landing, Takeoff
and Climb): data saved with 26 topics loads and keeps everything, the two come in To Do. Each topic shows its ASA Prepware
chapter on the card, in the plan, in focus mode and in the log dialog (on by default in the personal app, off in the demo;
Settings › Display). Desktop, laptop, iPad mini and iPhone — personal and demo."""
import os, sys, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA))]
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:300]))
# a topic of the plan today: Weather Information (18) for 30 questions
PLAN = """(()=>{const T=todayISO();(state.plans||[]).forEach(p=>p.active=false);state.plans=(state.plans||[]).filter(p=>p.id!=='pA');
  state.plans.push({id:'pA',type:'daily',name:'',start:T,active:true,blocks:{[T]:[[1140,1260]]},items:[{id:'a1',date:T,start:1140,min:60,kind:'topic',i:18,n:30,reason:'weak'}]});
  save();render()})()"""

with sync_playwright() as p:
    b = getattr(p, os.environ.get("PPL_BROWSER", "chromium")).launch()
    for f in os.environ.get('PPL_FILES', 'index demo').split():
        for mode, opts in DEV:
            tag = f'{f} · {mode}'; W = opts['viewport']['width']
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: errs.append('browser dialog: ' + d.message) or d.dismiss())
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(500)
            ev = pg.evaluate
            ev("window.pplTour&&pplTour.end()"); ev("goView('dash')"); pg.wait_for_timeout(150)

            # --- the 28 topics ---
            check(f'{tag}: 28 topics, 1,125 questions, the last two are Approach and Landing and Takeoff and Climb',
                  ev("TOPICS.length") == 28 and ev("TOPICS.reduce((a,x)=>a+x.q,0)") == 1125 and ev("TOPICS[26].name") == 'Approach and Landing' and ev("TOPICS[27].name") == 'Takeoff and Climb' and ev("[TOPICS[26].q,TOPICS[27].q]") == [48, 19])
            check(f'{tag}: 28 cards on the board', ev("document.querySelectorAll('.task[data-topic]').length") == 28)
            check(f'{tag}: the progress bar counts 1,125 questions', ev("counts().reduce((a,b)=>a+b,0)") == 1125)
            if f == 'index':
                check(f'{tag}: the new topics start in To Do with no score', ev("[state.statuses[26],state.statuses[27],state.scores[26],state.scores[27]]") == ['Todo', 'Todo', None, None])
            # data saved with 26 topics (an older version of the app, or a backup)
            old = ev("(()=>{const o=JSON.parse(JSON.stringify(state));o.statuses=o.statuses.slice(0,26);o.scores=o.scores.slice(0,26);o.statuses[25]='Very Comfortable';o.scores[25]=91;return o})()")
            ev(f"localStorage.setItem(STORE, {json.dumps(json.dumps(old))})")
            pg.reload(); pg.wait_for_timeout(500); ev("window.pplTour&&pplTour.end()")
            check(f'{tag}: data saved with 26 topics loads: its 26 kept, the 2 new ones added in To Do',
                  ev("state.statuses.length") == 28 and ev("state.statuses[25]") == 'Very Comfortable' and ev("state.scores[25]") == 91 and ev("[state.statuses[26],state.statuses[27]]") == ['Todo', 'Todo'] and ev("state.events.length") == len(old['events']),
                  ev("[state.statuses.length,state.statuses[25],state.scores[25]]"))

            # --- the ASA equivalence ---
            on = ev("pref('asa')")
            check(f'{tag}: the ASA chapter is ' + ('on by default (personal app)' if f == 'index' else 'off by default (demo)'), on == (f == 'index'))
            if not on:
                check(f'{tag}: off → no ASA line anywhere', ev("document.querySelectorAll('.tasa,.qasa').length") == 0)
                ev("state.settings={...(state.settings||{}),asa:true};save();render()"); pg.wait_for_timeout(150)
            check(f'{tag}: every topic has a main ASA chapter, from the 10 Prepware chapters (736 questions)',
                  ev("TOPICS.every((_,i)=>asaOf(i)&&ASA_CHAPTERS.some(c=>c.name===asaOf(i).main))") and ev("ASA_CHAPTERS.length") == 10 and ev("ASA_CHAPTERS.reduce((a,c)=>a+c.q,0)") == 736)
            check(f'{tag}: Weather Information → Weather (also Weather Service); Pilot Qualifications → Regulations; Steep Turns → Aerodynamics',
                  ev("asaOf(18)") == {'main': 'Weather', 'also': ['Weather Service']} and ev("asaOf(17).main") == 'Regulations' and ev("asaOf(10).main") == 'Aerodynamics')
            one_line = ev("matchMedia('(min-width: 1100px) and (min-height: 1050px)').matches&&!document.body.classList.contains('srview')")
            tasa = ev("(()=>{const e=document.querySelector('.task[data-topic=\"18\"] .tasa');return e&&{txt:e.textContent,shown:getComputedStyle(e).display!=='none'}})()")
            if one_line:
                check(f'{tag}: one-line cards (the board fits the window) keep the name readable: the chapter is in the tooltip and the log dialog', tasa and not tasa['shown'] and 'ASA Prepware: Weather' in ev("document.querySelector('.task[data-topic=\"18\"]').title"), tasa)
            else:
                check(f'{tag}: the card shows "ASA · Weather" under its name', tasa and tasa['shown'] and tasa['txt'] == 'ASA · Weather', tasa)
            # log dialog
            ev("openModal(18,'review')"); pg.wait_for_timeout(150)
            check(f'{tag}: the log dialog shows the chapter and the ones it also appears in', ev("document.getElementById('mAsa').textContent") == 'In ASA Prepware: Weather (also Weather Service)' and not ev("document.getElementById('mAsa').hidden"))
            ev("closeModal()")
            # plan row and focus mode
            ev(PLAN); pg.wait_for_timeout(200)
            check(f'{tag}: today\'s plan shows the chapter under the topic', ev("[...document.querySelectorAll('#sugg .qasa')].some(e=>e.textContent==='ASA · Weather')"), ev("[...document.querySelectorAll('#sugg .qasa')].map(e=>e.textContent)"))
            ev("openFocus(todayPlan().items.find(x=>x.kind==='topic'&&x.i===18))"); pg.wait_for_timeout(150)
            check(f'{tag}: focus mode shows where to find the topic in ASA Prepware', ev("document.getElementById('focusAsa').textContent") == 'In ASA Prepware: Weather (also Weather Service)' and not ev("document.getElementById('focusAsa').hidden"))
            ev("closeFocus()"); ev("localStorage.removeItem(STORE+'-focus')")
            # the setting
            tap = (lambda s: pg.tap(s)) if opts.get('has_touch') else (lambda s: pg.click(s))
            ev("document.getElementById('setOpen').click()"); pg.wait_for_timeout(200)
            check(f'{tag}: Settings › Display has the ASA switch, on', ev("document.querySelector('[data-set=\"setAsa\"]').checked"))
            ev("(()=>{const e=document.querySelector('[data-set=\"setAsa\"]');e.checked=false;e.dispatchEvent(new Event('change',{bubbles:true}))})()"); pg.wait_for_timeout(200)
            ev("document.getElementById('setClose').click()"); pg.wait_for_timeout(150)
            check(f'{tag}: switching it off removes it from cards, plan and dialog', ev("pref('asa')") is False and ev("document.querySelectorAll('.tasa,.qasa').length") == 0 and (ev("openModal(18,'review')") or True) and ev("document.getElementById('mAsa').hidden"))
            ev("closeModal()")
            check(f'{tag}: statistics do not change with it (same forecast on and off)', ev("(()=>{const a=forecast().mu;state.settings.asa=true;const b=forecast().mu;state.settings.asa=false;return a===b})()"))
            for l, want in [('pt', 'No ASA Prepware: Weather (também Weather Service)'), ('ja', 'ASA Prepwareでは：Weather（Weather Serviceにも）')]:
                ev("state.settings.asa=true;save()")
                ev(f"document.querySelector('.flag[data-lang=\"{l}\"]').click()"); pg.wait_for_timeout(100)
                ev("openModal(18,'review')"); pg.wait_for_timeout(100)
                check(f'{tag} [{l}]: translated', ev("document.getElementById('mAsa').textContent") == want, ev("document.getElementById('mAsa').textContent"))
                ev("closeModal()")
            ev("document.querySelector('.flag[data-lang=\"en\"]').click()")
            check(f'{tag}: page fits the screen', ev('document.documentElement.scrollWidth') <= W)
            check(f'{tag}: no script errors or browser pop-ups', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} topics & ASA tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
