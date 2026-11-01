"""Settings (gear in the header): every control changes what it says, is saved (reload, backup), can be undone,
and the header keeps only tabs, sync chip, flags and the gear. Desktop, laptop, iPad mini and iPhone — personal and demo."""
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

SETUP = """(()=>{const T=todayISO(),D=n=>addDays(T,-n),ev=(n,topic,sc,k)=>({id:'s'+topic+'_'+n,date:D(n),topic,kind:k||'study',from:null,to:null,score:sc,partial:false,demo:false});
  state.events=[ev(10,18,80),ev(4,6,75),ev(4,13,90)];state.tests=[{id:'t1',date:D(20),q:60,score:60},{id:'t2',date:D(2),q:60,score:90}];
  state.settings={minutes:180,qph:40,testEvery:3,reviewMin:1.5};state.plans=[];state.plan=null;save();render();})()"""

with sync_playwright() as p:
    b = p.chromium.launch()
    for f in ['index', 'demo']:
        for mode, opts in DEV:
            tag = f'{f} · {mode}'; touch = mode in ('phone', 'iPad mini'); W = opts['viewport']['width']
            c = b.new_context(accept_downloads=True, **opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: errs.append('browser dialog: ' + d.message) or d.dismiss())
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(500)
            ev = pg.evaluate; tap = pg.tap if touch else pg.click
            ev("window.pplTour&&pplTour.end()"); ev(SETUP); pg.wait_for_timeout(200)
            def opn():
                if not pg.is_visible('#setbg'): tap('#setOpen'); pg.wait_for_timeout(200)
            def choose(sel, v):
                opn(); pg.select_option(sel, str(v)); pg.wait_for_timeout(150)
            def undo(): ev("document.querySelector('#toast button').click()"); pg.wait_for_timeout(200)

            # ---------- header ----------
            check(f'{tag}: header has the gear; Backup / Import / Save HTML moved into Settings', pg.is_visible('#setOpen') and not pg.is_visible('#backup') and not pg.is_visible('#saveHtml') and not pg.is_visible('#restore'))
            check(f'{tag}: header fits the screen', ev('document.documentElement.scrollWidth') == W)
            tap('#setOpen'); pg.wait_for_timeout(250)
            check(f'{tag}: the gear opens Settings with all sections', pg.is_visible('#setbg') and ev("document.querySelectorAll('#setbg .setsec:not([hidden])').length") >= (8 if f == 'index' else 8))
            check(f'{tag}: {"sync section in the personal app" if f == "index" else "demo: no sync section, a Demo section with the tour"}', (pg.is_visible('#setSyncOpen') and not ev("!!document.getElementById('tourBtn')")) if f == 'index' else (not pg.is_visible('#setSyncOpen') and pg.is_visible('#tourBtn')))
            check(f'{tag}: the dialog fits the screen', ev("(()=>{const r=document.querySelector('.setmodal').getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1})()"))

            # ---------- goal ----------
            fc85 = ev("forecast().goal")
            choose('#setGoal', 90)
            check(f'{tag}: goal 90% → the goal is 90 and needs 54 of 60 right', ev("GOAL") == 90 and ev("GOAL_N") == 54 and ev("state.settings.goal") == 90)
            check(f'{tag}: … the chance of reaching it is recomputed (lower than for 85%)', ev("forecast().goal") < fc85, (fc85, ev("forecast().goal")))
            ev("goView('sr')"); pg.wait_for_timeout(300)
            check(f'{tag}: … the charts and labels say 90%', 'Goal 90%' in pg.inner_text('#fcLegend') and '90%' in pg.inner_text('#fcKpis'))
            undo()
            check(f'{tag}: Undo brings the goal back to 85%', ev("GOAL") == 85 and 'Goal 85%' in pg.inner_text('#fcLegend'))
            ev("goView('dash')"); pg.wait_for_timeout(200)

            # ---------- memory ----------
            S = ev("srModel(18).S")
            choose('#setReviewAt', 0.8)
            check(f'{tag}: review at 80% → next review = last + 9·S·(1/0.8 − 1) days', ev("srModel(18).next") == ev(f"addDays(srModel(18).last,{max(1, round(9 * S * (1 / .8 - 1)))})"), (ev("srModel(18).next"), S))
            check(f'{tag}: … the chart legend says "Review at 80%"', 'Review at 80%' in ev("legendHTML(true)"))
            choose('#setReviewAt', 0.9)
            check(f'{tag}: 90% gives exactly S days (the original rule)', ev("srModel(18).next") == ev(f"addDays(srModel(18).last,{max(1, round(S))})"))
            mu7 = None
            choose('#setHalfLife', 7); mu7 = ev("blended().mu")
            choose('#setHalfLife', 21); mu21 = ev("blended().mu")
            check(f'{tag}: practice-test half-life changes the blended forecast (older test weighs more at 21 days)', mu21 < mu7, (mu7, mu21))
            choose('#setHalfLife', 10)
            ev("state.tests=[{id:'t3',date:addDays(todayISO(),-4),q:60,score:80}];state.events=state.events.map(e=>({...e,date:addDays(todayISO(),-4)}));state.settings.testEvery=7;save();render()")
            choose('#setIdle', 5)
            check(f'{tag}: 4 idle days with the trigger at 5 → no early practice test', ev("testWhy().reason") != 'testIdle', ev("testWhy()"))
            choose('#setIdle', 3)
            check(f'{tag}: … with the trigger at 3 → the test comes early', ev("testWhy().reason") == 'testIdle', ev("testWhy()"))
            ev(SETUP); pg.wait_for_timeout(150)

            # ---------- daily plan ----------
            opn()
            ev("(()=>{const s=document.getElementById('setMin');s.value='120';s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}))})()"); pg.wait_for_timeout(200)
            check(f'{tag}: minutes slider → 2h 00m, saved, and the suggested plan uses it', ev("settings().minutes") == 120 and ev("buildPlan().budget") == 120 and pg.inner_text('#setMinOut') == '2h 00m')
            choose('#setQphSel', 60); choose('#setReviewSel', 2); choose('#setTestsSel', 0)
            check(f'{tag}: questions per hour, review minutes and test cadence (Off) are saved', ev("[settings().qph,settings().reviewMin,settings().testEvery].join()") == '60,2,0' and not ev("testWhy().due"))
            check(f'{tag}: the suggested plan follows them', ev("buildPlan().budget") == 120 and not ev("buildPlan().items.some(x=>x.kind==='test')"))
            check(f'{tag}: the Daily plan section explains when these are used', 'no daily or weekly plan is active' in pg.inner_text('#setbg'))
            ev("goView('dash')"); pg.wait_for_timeout(150)
            choose('#setEnergy', 'high')
            check(f'{tag}: default energy High is used when nothing was picked today', ev("energyMode") == 'high' and ev("planDay().energy") == 'high')

            # ---------- plans ----------
            choose('#setGridStart', 8)
            ev("openWizard({mode:'new'})"); pg.wait_for_timeout(150); ev("document.getElementById('wzNext').click()"); pg.wait_for_timeout(200)
            check(f'{tag}: plan grid starting at 08:00 → 64 slots, the first one at 8:00', ev("document.querySelectorAll('#wzGrid .wkcol .wks').length") == 64 and ev("+document.querySelector('#wzGrid .wks').dataset.s") == 480)
            ev("closeWizard()"); pg.wait_for_timeout(150)
            choose('#setGridStart', 6)
            choose('#setDeep', 90)
            n90 = ev("(()=>{const d=packDay(todayISO(),[[1140,1230]],'medium').filter(x=>x.kind==='topic');return {n:d.length,full:d.length<2||d[0].n===TOPICS[d[0].i].q}})()")
            check(f'{tag}: deep work 90 min → one topic per 90-min block (a second only when the first is used up)', n90['n'] == 1 or (n90['n'] == 2 and n90['full']), n90)
            choose('#setDeep', 45)

            # ---------- charts, display ----------
            choose('#setRange_vol', '1y'); choose('#setRange_card', '3m')
            check(f'{tag}: default chart intervals apply at once', ev("volRange") == '1y' and ev("srCardRange") == '3m')
            choose('#setHeatNums', 'x') if False else None
            opn(); pg.locator('#setHeatNums').set_checked(False); pg.wait_for_timeout(150)
            check(f'{tag}: heat-map numbers off → the tiles show no numbers', ev("state.settings.heatNums") is False and ev("(()=>{goView('sr');return [...document.querySelectorAll('#heatNow .hnt:not(.empty) b')].every(b=>b.textContent==='')})()"))
            ev("goView('dash')"); pg.wait_for_timeout(150)
            opn(); pg.locator('#setCarousel').set_checked(False); pg.wait_for_timeout(150)
            if mode == 'desktop':
                tap('#setClose'); pg.mouse.move(3, 3); before = ev("carTopic"); pg.wait_for_timeout(3400)
                check(f'{tag}: carousel off → the preview stays put', ev("carTopic") == before)
            check(f'{tag}: the switches are saved', ev("state.settings.carousel") is False)

            # ---------- language and exam date ----------
            choose('#setLang', 'pt')
            check(f'{tag}: language from Settings switches the app (and the dialog)', ev("lang") == 'pt' and 'Ajustes' in pg.inner_text('#setTitle'))
            choose('#setLang', 'en')
            opn(); pg.fill('#setExam', '2026-12-20'); pg.dispatch_event('#setExam', 'change'); pg.wait_for_timeout(150)
            check(f'{tag}: exam date from Settings', ev("state.deadline") == '2026-12-20' and ev("document.getElementById('examDate').value") == '2026-12-20')

            # ---------- saved: reload, backup ----------
            pg.reload(); pg.wait_for_timeout(500); ev("window.pplTour&&pplTour.end()")
            check(f'{tag}: settings survive a reload (and the chart default applies on open)', ev("[GOAL,state.settings.minutes,state.settings.carousel,state.settings.gridStart,volRange].join()") == '85,120,false,6,1y')
            opn()
            with pg.expect_download() as d: tap('#backup')
            bk = json.loads(open(d.value.path()).read())
            check(f'{tag}: Backup JSON carries the settings and plans, never a token', bk['settings']['minutes'] == 120 and bk['settings']['ranges']['vol'] == '1y' and 'plans' in bk and 'ghp_' not in json.dumps(bk))
            # import a changed backup
            bk['settings']['goal'] = 80; path = os.path.join(os.path.dirname(d.value.path()), 'in.json'); open(path, 'w').write(json.dumps(bk))
            pg.set_input_files('#file', path); pg.wait_for_timeout(300)
            check(f'{tag}: Import restores data with its settings', ev("GOAL") == 80)
            # reset everything (asks first, undo works)
            opn(); tap('#setReset'); pg.wait_for_timeout(200)
            check(f'{tag}: Reset everything asks first (in the page, no browser pop-up)', pg.is_visible('#askbg'))
            tap('#askNo'); pg.wait_for_timeout(150)
            check(f'{tag}: … Cancel keeps everything', ev("GOAL") == 80)
            tap('#setReset'); pg.wait_for_timeout(150); tap('#askYes'); pg.wait_for_timeout(300)
            check(f'{tag}: … Reset goes back to the defaults', ev("GOAL") == 85 and ev("settings().minutes") == 180 and ev("state.settings.goal") is None)
            undo()
            check(f'{tag}: … and Undo brings everything back', ev("GOAL") == 80 and ev("settings().minutes") == 120)
            if f == 'index':
                opn(); tap('#setSyncOpen'); pg.wait_for_timeout(200)
                check(f'{tag}: "Manage sync…" opens the sync dialog', pg.is_visible('#syncbg') and not pg.is_visible('#setbg'))
                pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
            opn(); pg.keyboard.press('Escape') if not touch else tap('#setClose'); pg.wait_for_timeout(150)
            check(f'{tag}: Settings closes (Esc / ×)', not pg.is_visible('#setbg'))
            check(f'{tag}: page never wider than the screen', ev('document.documentElement.scrollWidth') == W)
            check(f'{tag}: no browser pop-ups, no JavaScript errors', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} settings tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
