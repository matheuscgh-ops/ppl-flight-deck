"""Next-up bar (phones) and focus mode.

Phones: a bar fixed at the bottom of the Dashboard and Plan tabs shows the next item of today's plan that is not done;
its circle ticks a saved-plan item, tapping it opens focus mode. Focus mode: the item, a stopwatch against the planned
minutes (pause / resume, kept across a reload), "Finished" logs through the usual dialogs. Opening and closing it
changes no statistic. Desktop, laptop, iPad mini and iPhone — personal and demo, en/pt/ja."""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA)),
       ('small phone', dict(viewport={'width': 360, 'height': 740}, is_mobile=True, has_touch=True, user_agent=UA))]
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:300]))

STATS = "JSON.stringify([forecast().mu, blended().mu, counts(), state.scores, state.events.length, (state.tests||[]).length])"
# a saved daily plan for today: a topic, your own activity and an error review — all with ids, so they can be ticked
PLAN = """(()=>{const T=todayISO();state.plans=(state.plans||[]).filter(p=>p.id!=='pF');(state.plans||[]).forEach(p=>p.active=false);
  state.plans.push({id:'pF',type:'daily',name:'',start:T,active:true,blocks:{[T]:[[1140,1290]]},items:[
    {id:'f1',date:T,start:1140,min:40,kind:'topic',i:6,n:30,reason:'weak'},
    {id:'f2',date:T,start:1180,min:20,kind:'custom',label:'Radio calls',custom:true,reason:'custom'},
    {id:'f3',date:T,start:1200,min:15,kind:'reflect',reason:'reflect',parts:[{i:6,m:8}]}]});
  state.events=state.events.filter(e=>!(e.date===T&&e.topic===6));save();render()})()"""

with sync_playwright() as p:
    b = getattr(p, os.environ.get("PPL_BROWSER", "chromium")).launch()
    for f in os.environ.get('PPL_FILES', 'index demo').split():
        for mode, opts in DEV:
            tag = f'{f} · {mode}'; W = opts['viewport']['width']; phone = W <= 640; touch = opts.get('has_touch')
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: errs.append('browser dialog: ' + d.message) or d.dismiss())
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(500)
            ev = pg.evaluate
            ev("window.pplTour&&pplTour.end()"); ev("localStorage.removeItem(STORE+'-focus')"); ev("goView('dash')"); pg.wait_for_timeout(150)
            ev(PLAN); pg.wait_for_timeout(150)
            stats0 = ev(STATS)
            tap = (lambda s: pg.tap(s)) if touch else (lambda s: pg.click(s))

            # ---------- the bar ----------
            bar = ev("""(()=>{const b=document.getElementById('nowBar'),r=b.getBoundingClientRect(),cs=getComputedStyle(b);
                return {shown:!b.hidden&&cs.display!=='none',fixed:cs.position,bottom:Math.round(innerHeight-r.bottom),l:r.left,r:r.right,name:document.getElementById('nowName').textContent,meta:document.getElementById('nowMeta').textContent,left:document.getElementById('nowLeft').textContent}})()""")
            if phone:
                check(f'{tag}: the next-up bar is fixed at the bottom with the first item not done', bar['shown'] and bar['fixed'] == 'fixed' and 0 <= bar['bottom'] <= 40 and bar['l'] >= 0 and bar['r'] <= W and bar['name'] == ev("TOPICS[6].name") and '30 q' in bar['meta'] and bar['left'] == '+2', bar)
                pad = ev("parseFloat(getComputedStyle(document.querySelector('.app')).paddingBottom)")
                check(f'{tag}: the page leaves room for the bar (nothing hidden under it)', pad >= 80, pad)
                for v in ['plan', 'tests', 'sr', 'errors']:
                    ev(f"goView('{v}')"); pg.wait_for_timeout(120)
                    vis = ev("getComputedStyle(document.getElementById('nowBar')).display!=='none'&&!document.getElementById('nowBar').hidden")
                    check(f'{tag}: bar {"shown" if v == "plan" else "hidden"} on the {v} tab', vis == (v == 'plan'))
                ev("goView('dash')"); pg.wait_for_timeout(120)
                ev("openModal(3)"); pg.wait_for_timeout(100)
                check(f'{tag}: the bar steps aside while a dialog is open', ev("getComputedStyle(document.getElementById('nowBar')).display") == 'none')
                ev("closeModal()"); pg.wait_for_timeout(100)
                # ticking the bar's circle ticks the plan item and the bar moves to the next one
                tap('#nowChk'); pg.wait_for_timeout(250)
                check(f'{tag}: the bar\'s circle ticks the item and moves on to the next', ev("state.plans.find(p=>p.id==='pF').items.find(x=>x.id==='f1').check===true") and ev("document.getElementById('nowName').textContent") == 'Radio calls', ev("document.getElementById('nowName').textContent"))
                ev("toggleCheck('f1')"); pg.wait_for_timeout(200)
                check(f'{tag}: unticking brings it back', ev("document.getElementById('nowName').textContent") == ev("TOPICS[6].name"))
            else:
                check(f'{tag}: no next-up bar on larger screens', not bar['shown'], bar)

            # ---------- focus mode ----------
            if phone: tap('#nowOpen')
            else:
                ev("document.getElementById('planFocus').scrollIntoView({block:'center'})"); tap('#planFocus')
            pg.wait_for_timeout(300)
            o = ev("""(()=>{const bg=document.getElementById('focusbg'),r=document.querySelector('.focus').getBoundingClientRect();
                return {open:!bg.hidden,name:document.getElementById('focusName').textContent,done:document.getElementById('focusDone').textContent,notes:!document.getElementById('focusNotes').hidden,
                  next:document.getElementById('focusNextUp').textContent,fits:r.left>=0&&r.right<=innerWidth+0.5,cover:getComputedStyle(bg).position==='fixed'&&bg.getBoundingClientRect().width>=innerWidth-1}})()""")
            check(f'{tag}: {"the bar" if phone else "the ▶ button in today\'s plan"} opens focus mode on the next item', o['open'] and o['name'] == ev("TOPICS[6].name") and o['notes'] and 'Radio calls' in o['next'] and o['fits'] and o['cover'], o)
            pg.wait_for_timeout(1300)
            t1 = ev("document.getElementById('focusClock').textContent")
            check(f'{tag}: the stopwatch runs', t1 in ('0:01', '0:02'), t1)
            tap('#focusPause'); pg.wait_for_timeout(1200)
            t2 = ev("document.getElementById('focusClock').textContent"); lbl = ev("document.getElementById('focusPause').textContent")
            pg.wait_for_timeout(1100)
            check(f'{tag}: Pause stops it and the button says Resume', ev("document.getElementById('focusClock').textContent") == t2 and lbl == 'Resume', (t2, lbl))
            # a reload (or a locked phone) keeps the time
            pg.reload(); pg.wait_for_timeout(500); ev("window.pplTour&&pplTour.end()"); ev("goView('dash')"); pg.wait_for_timeout(100)
            ev("openFocus()"); pg.wait_for_timeout(200)
            check(f'{tag}: after a reload the same item keeps its time (still paused)', ev("document.getElementById('focusClock').textContent") == t2, ev("document.getElementById('focusClock').textContent"))
            tap('#focusPause'); pg.wait_for_timeout(1200)
            check(f'{tag}: Resume continues from there', ev("document.getElementById('focusClock').textContent") != t2)
            # the planned time: the ring fills, and past the plan it says how much over
            ev("(()=>{const w=JSON.parse(localStorage.getItem(STORE+'-focus'));w.acc=41*60000;w.run=0;localStorage.setItem(STORE+'-focus',JSON.stringify(w))})()")
            ev("closeFocus(true);openFocus()"); pg.wait_for_timeout(200)
            check(f'{tag}: past the planned minutes the ring turns amber and says how much over', ev("document.getElementById('focusRing').classList.contains('over')") and '1 min' in ev("document.getElementById('focusPlanned').textContent"), ev("document.getElementById('focusPlanned').textContent"))
            # Escape closes it and keeps the time
            pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
            check(f'{tag}: Escape closes focus mode, the time is kept', ev("document.getElementById('focusbg').hidden") and ev("!!localStorage.getItem(STORE+'-focus')"))
            check(f'{tag}: opening and closing focus mode changes no statistic', ev(STATS) == stats0)
            # Finished on a topic: the usual log dialog for that topic; logging it marks the item done
            ev("openFocus()"); pg.wait_for_timeout(150)
            tap('#focusDone'); pg.wait_for_timeout(250)
            check(f'{tag}: Finished on a topic opens its log dialog and resets the stopwatch', pg.is_visible('#modalbg') and ev("document.getElementById('mTitle').textContent") == ev("TOPICS[6].name") and not ev("localStorage.getItem(STORE+'-focus')"))
            ev("closeModal()"); pg.wait_for_timeout(100)
            ev("""(()=>{state.events.push({id:'fx',date:todayISO(),topic:6,kind:'review',score:82,partial:false,demo:false});save();render()})()"""); pg.wait_for_timeout(150)
            check(f'{tag}: once logged, the next item is your own activity', ev("nextItem()&&nextItem().id") == 'f2')
            # Finished on your own activity ticks it
            ev("openFocus()"); pg.wait_for_timeout(150)
            check(f'{tag}: your own activity has a plain Done and no notes button', ev("document.getElementById('focusDone').textContent") == 'Done' and ev("document.getElementById('focusNotes').hidden"))
            tap('#focusDone'); pg.wait_for_timeout(250)
            check(f'{tag}: Done ticks it in the plan', ev("state.plans.find(p=>p.id==='pF').items.find(x=>x.id==='f2').check===true") and ev("nextItem()&&nextItem().id") == 'f3')
            # languages
            for l in ['pt', 'ja']:
                ev(f"document.querySelector('.flag[data-lang=\"{l}\"]').click()"); pg.wait_for_timeout(80)
                ev("openFocus()"); pg.wait_for_timeout(150)
                txt = ev("document.querySelector('.focus').innerText")
                check(f'{tag} [{l}]: focus mode is translated (no raw keys or placeholders)', not any(k in txt for k in ('focusDone', 'focusPause', 'focusTitle', 'rs_', '{m}', '{x}')) and 'Finished' not in txt, txt[:120])
                ev("closeFocus(true)"); pg.wait_for_timeout(60)
            ev("document.querySelector('.flag[data-lang=\"en\"]').click()"); pg.wait_for_timeout(80)
            # everything done → no bar
            ev("toggleCheck('f3')"); pg.wait_for_timeout(200)
            if phone:
                left = ev("nextItem()")
                check(f'{tag}: with today\'s plan done the bar goes away', ev("document.getElementById('nowBar').hidden") == (left is None), left)
            check(f'{tag}: page fits the screen', ev('document.documentElement.scrollWidth') <= W, ev('document.documentElement.scrollWidth'))
            check(f'{tag}: no script errors or browser pop-ups', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} focus tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
