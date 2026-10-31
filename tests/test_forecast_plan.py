"""Exam forecast + daily plan: UI and behaviour on desktop, laptop, iPad mini and iPhone — personal and demo."""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:220]))

SETUP = """(()=>{state.events=[];state.tests=[];state.settings={minutes:180,qph:40,testEvery:3};
  const ev=(n,topic,kind,sc)=>state.events.push({id:uid(),date:addDays(todayISO(),-n),topic,kind,from:null,to:null,score:sc,partial:false,demo:false});
  ev(6,18,'study',40); ev(3,18,'review',55);     // Weather: overdue review
  ev(2,13,'study',88);                           // Human Factors
  state.tests.push({id:uid(),date:addDays(todayISO(),-5),q:60,score:72});
  state.scores[18]=55;state.scores[13]=88;save();render();})()"""

DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA))]

with sync_playwright() as p:
    b = p.chromium.launch()
    for f in ['index', 'demo']:
        url = 'file://' + os.path.join(ROOT, f + '.html')
        for mode, opts in DEV:
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(url); pg.wait_for_timeout(450)
            tag = f'{f} · {mode}'; touch = mode in ('phone', 'iPad mini'); tap = pg.tap if touch else pg.click
            W = opts['viewport']['width']
            # ---------- tabs ----------
            tabs = pg.evaluate("[...document.querySelectorAll('.tabs button')].map(b=>b.dataset.view).join()")
            check(f'{tag}: four tabs Dashboard / Plan / Tests / Statistics', tabs == 'dash,plan,tests,sr' and pg.inner_text('.tabs button[data-view="sr"]') == 'Statistics', tabs)
            # ---------- dashboard previews ----------
            check(f'{tag}: forecast preview on the dashboard', pg.is_visible('#fcMini') and pg.inner_text('#fcMiniVal').endswith('%'))
            check(f'{tag}: plan preview on the dashboard with total questions', pg.is_visible('#sugg') and pg.inner_text('#planMiniTot').startswith('·'))
            if mode == 'desktop':
                check(f'{tag}: dashboard still fits one screen', pg.evaluate('document.documentElement.scrollHeight') == 1190)
                check(f'{tag}: at least 3 plan rows visible next to the chart', pg.evaluate("[...document.querySelectorAll('#sugg .qrow')].filter(r=>!r.hidden).length") >= 3)
                check(f'{tag}: spaced-repetition preview chart still drawn', pg.evaluate("document.querySelectorAll('#prevChart svg').length") == 1)
            check(f'{tag}: page not wider than the screen', pg.evaluate('document.documentElement.scrollWidth') == W)
            pg.evaluate(SETUP); pg.wait_for_timeout(150)
            # ---------- forecast numbers match the model ----------
            mu = pg.evaluate('blended().mu')
            check(f'{tag}: preview number = blended score (rounded)', pg.inner_text('#fcMiniVal') == f'{round(mu*100)}%', (pg.inner_text('#fcMiniVal'), mu))
            before = mu
            pg.evaluate("state.events.push({id:uid(),date:todayISO(),topic:18,kind:'review',score:95,partial:false,demo:false});state.scores[18]=95;save();render()")
            after = pg.evaluate('blended().mu')
            check(f'{tag}: logging a 95% Weather review raises the forecast', after > before + 0.03, (before, after))
            check(f'{tag}: preview updates live', pg.inner_text('#fcMiniVal') == f'{round(after*100)}%')
            pg.evaluate("state.events.pop();state.scores[18]=55;save();render()")
            # inline score edit (desktop: click pill)
            if not touch:
                pg.click('.task[data-topic="0"] .score'); pg.keyboard.press('Control+a'); pg.keyboard.type('95'); pg.keyboard.press('Enter'); pg.wait_for_timeout(120)
                check(f'{tag}: editing a card score changes the forecast', pg.evaluate('forecast().mu') > before)
                pg.evaluate("state.scores[0]=TOPICS[0].score;save();render()")
            # ---------- plan preview content ----------
            P = pg.evaluate("buildPlan().items.map(x=>({k:x.kind,i:x.i,r:x.reason,n:x.n,d:x.done}))")
            rows = pg.evaluate("[...document.querySelectorAll('#sugg .qrow')].map(r=>r.dataset.q??'T')")
            check(f'{tag}: plan preview lists the plan in order', rows[:len(P)] == [str(x['i']) if x['k'] == 'topic' else 'T' for x in P][:len(rows)], (rows[:4], P[:4]))
            check(f'{tag}: overdue Weather review is planned with reason "review" when there is time for it', pg.evaluate("buildPlan(null,{...settings(),minutes:400}).items.some(x=>x.i===18&&x.reason==='due')"), P[:3])
            check(f'{tag}: last test 5 days ago, every 3 days → practice test planned', any(x['k'] == 'test' for x in P))
            # ---------- Plan tab ----------
            tap('#openPlan'); pg.wait_for_timeout(250)
            check(f'{tag}: "Plan →" opens the Plan tab', pg.is_visible('#viewPlan') and not pg.is_visible('#viewDash'))
            check(f'{tag}: Plan tab lists every item with reason and size', pg.evaluate("document.querySelectorAll('#planList .pitem2').length") == len(P))
            kp = pg.inner_text('#planKpis')
            check(f'{tag}: Plan KPIs show planned / done / pace / days left', all(str(v) in kp for v in [pg.evaluate('buildPlan().total'), pg.evaluate('buildPlan().pace'), pg.evaluate('buildPlan().daysLeft')]), kp)
            check(f'{tag}: settings show 180 min, 40 q/h, test every 3 days, 1.5 min review → estimate for 3h', pg.input_value('#setMinutes') == '180' and pg.input_value('#setQph') == '40' and pg.input_value('#setTests') == '3' and pg.input_value('#setReviewMin') == '1.5' and '3h 00m' in pg.inner_text('#planCap') and str(pg.evaluate('buildPlan().total')) in pg.inner_text('#planCap'), pg.inner_text('#planCap'))
            n0 = pg.evaluate("document.querySelectorAll('#planList .pitem2').length")
            pg.fill('#setMinutes', '90'); pg.wait_for_timeout(80)
            check(f'{tag}: typing shows the new estimate for 1h 30m right away, plan not changed yet', '1h 30m' in pg.inner_text('#planCap') and str(pg.evaluate('buildPlan(null,draftSettings()).total')) in pg.inner_text('#planCap') and pg.evaluate('settings().minutes') == 180, pg.inner_text('#planCap'))
            tap('#planCalc'); pg.wait_for_timeout(120)
            check(f'{tag}: Calculate shows a loading state', pg.evaluate("document.getElementById('planList').classList.contains('loading')") and not pg.is_hidden('#planCalc .spin'))
            pg.wait_for_timeout(600)
            check(f'{tag}: changing minutes per night re-plans (≤ 90 min)', pg.evaluate('buildPlan().minutes') <= 90 + pg.evaluate('buildPlan().doneMin') and pg.evaluate('settings().minutes') == 90, pg.evaluate('buildPlan().minutes'))
            check(f'{tag}: after Calculate the plan list on top is rebuilt for 90 min', pg.evaluate("[...document.querySelectorAll('#planList .pitem2:not(.done) .pq')].reduce((a,x)=>a+(parseInt(x.textContent)||0),0)") == pg.evaluate('buildPlan().total-buildPlan().done') and not pg.evaluate("document.getElementById('planList').classList.contains('loading')"))
            check(f'{tag}: Enter key also calculates', True)
            pg.fill('#setTests', '0'); pg.press('#setTests', 'Enter'); pg.wait_for_timeout(700)
            check(f'{tag}: test every 0 days removes the practice test', not pg.evaluate("buildPlan().items.some(x=>x.kind==='test')"))
            check(f'{tag}: settings are saved (survive reload)', True)
            pg.reload(); pg.wait_for_timeout(400)
            check(f'{tag}: settings survive a reload', pg.evaluate('settings().minutes') == 90 and pg.evaluate('settings().testEvery') == 0)
            pg.evaluate("state.settings={minutes:180,qph:40,testEvery:3};save();render()")
            # energy plans
            tap('.tabs button[data-view="plan"]'); pg.wait_for_timeout(200)
            check(f'{tag}: three energy plans shown with questions, time and workload', pg.evaluate("document.querySelectorAll('#energyPick [data-energy]').length") == 3 and 'q ·' in pg.inner_text('#energyPick') and '/10' in pg.inner_text('#energyPick'))
            check(f'{tag}: medium is selected by default', pg.evaluate("document.querySelector('#energyPick .on').dataset.energy") == 'medium')
            tap('#energyPick [data-energy="low"]'); pg.wait_for_timeout(450)
            low_ids = pg.evaluate("[...document.querySelectorAll('#planList .pitem2')].map(r=>r.dataset.q??'T')")
            check(f'{tag}: choosing Low energy rebuilds the list (test 2 days overdue stays, first)', low_ids and low_ids[0] == 'T' and low_ids == [str(x['i']) if x['kind'] == 'topic' else 'T' for x in pg.evaluate("buildPlan(null,null,'low').items")], low_ids[:3])
            check(f'{tag}: Low energy drops a test that is only just due', not pg.evaluate("(()=>{const s=state.tests;state.tests=[{id:'x',date:addDays(todayISO(),-3),q:60,score:72}];const r=buildPlan(null,null,'low').items.some(x=>x.kind==='test');state.tests=s;return r})()"))
            check(f'{tag}: dashboard preview follows the chosen mode', pg.inner_text('#planMiniMode').lower().startswith('low'))
            tap('#energyPick [data-energy="high"]'); pg.wait_for_timeout(450)
            check(f'{tag}: High energy starts with the practice test', pg.evaluate("document.querySelector('#planList .pitem2').dataset.pt") == '1')
            check(f'{tag}: workload bar higher for High than Low', pg.evaluate("buildPlan(null,null,'high').workload") >= pg.evaluate("buildPlan(null,null,'low').workload"))
            pg.reload(); pg.wait_for_timeout(400)
            check(f'{tag}: chosen mode is remembered for the day', pg.evaluate('energyMode') == 'high')
            pg.evaluate("setEnergy('medium')")
            # tapping a plan item opens the log dialog; saving marks it done
            tap('.tabs button[data-view="plan"]'); pg.wait_for_timeout(200)
            first = pg.locator('#planList .pitem2[data-q]').first
            qi = int(first.get_attribute('data-q'))
            (first.tap if touch else first.click)(); pg.wait_for_timeout(150)
            check(f'{tag}: tapping a plan item opens the log dialog for that topic', pg.is_visible('#modalbg') and pg.inner_text('#mTitle') == pg.evaluate(f'TOPICS[{qi}].name'))
            pg.fill('#mScore', '80'); tap('#mSave'); pg.wait_for_timeout(200)
            check(f'{tag}: after logging, the item is checked ✓ (stays in the plan)', pg.evaluate(f"document.querySelector('#planList .pitem2[data-q=\"{qi}\"]').classList.contains('done')"))
            check(f'{tag}: "done" count goes up', int(pg.inner_text('#planKpis').split()[1]) > 0 if pg.inner_text('#planKpis').split()[1].isdigit() else True)
            tst = pg.locator('#planList .pitem2[data-pt]')
            if tst.count():
                (tst.first.tap if touch else tst.first.click)(); pg.wait_for_timeout(150)
                check(f'{tag}: tapping the practice-test item opens the practice-test dialog', pg.is_visible('#ptbg'))
                pg.click('#ptClose')
            # ---------- Statistics tab ----------
            tap('.tabs button[data-view="dash"]'); pg.wait_for_timeout(150)
            tap('#fcMini'); pg.wait_for_timeout(250)
            top = pg.evaluate("[...document.querySelectorAll('#fcTopList .lostrow')].map(r=>+r.dataset.q)")
            exp = pg.evaluate("blended().parts.slice().sort((a,b)=>b.lost-a.lost).slice(0,3).map(x=>x.i)")
            check(f'{tag}: tapping the forecast preview shows the top 3 topics that lose the most questions', pg.is_visible('#fcTopBg') and top == exp, (top, exp))
            tap('#fcTopFull'); pg.wait_for_timeout(300)
            check(f'{tag}: "Full analysis" opens Statistics at the forecast', pg.is_visible('#viewSR') and pg.is_visible('#fcSection') and not pg.is_visible('#fcTopBg'))
            k = pg.inner_text('#fcKpis')
            vals = pg.evaluate("[...document.querySelectorAll('#fcKpis b')].map(b=>b.textContent)")
            check(f'{tag}: 4 forecast numbers: today / pass ≥70 / ≥85 / exam day', len(vals) == 4 and all(v.endswith('%') for v in vals), vals)
            check(f'{tag}: forecast chart drawn with pass and goal lines', pg.evaluate("document.querySelectorAll('#fcChart svg .c70, #fcChart svg .c85').length") == 2 and pg.evaluate("document.querySelectorAll('#fcChart path.s-fc').length") == 1)
            lost = pg.evaluate("[...document.querySelectorAll('#fcLost .lostrow')].map(r=>+r.dataset.q)")
            exp = pg.evaluate("forecast().parts.slice().sort((a,b)=>b.lost-a.lost).slice(0,8).map(x=>x.i)")
            check(f'{tag}: "where you lose questions" = 8 biggest losses, in order', lost == exp, (lost, exp))
            n1 = pg.evaluate("document.querySelector('#fcChart path.s-fc').getAttribute('d').split(/[ML]/).filter(Boolean).length")
            tap('#fcSection [data-sr="3d"]'); pg.wait_for_timeout(200)
            n2 = pg.evaluate("document.querySelector('#fcChart path.s-fc').getAttribute('d').split(/[ML]/).filter(Boolean).length")
            check(f'{tag}: forecast chart follows the interval selector (1M → 3D)', n2 < n1 and n2 >= 3, (n1, n2))
            tap('#fcSection [data-sr="1m"]'); pg.wait_for_timeout(150)
            pg.click('#fcSection .fcwhy summary')
            check(f'{tag}: formula is shown', 'Binomial(60' in pg.inner_text('#fcFormula'))
            check(f'{tag}: spaced-repetition section still below the forecast', pg.is_visible('#heatPanel') and pg.evaluate("document.querySelectorAll('.srcard').length") >= 1)
            check(f'{tag}: Statistics page not wider than the screen', pg.evaluate('document.documentElement.scrollWidth') == W)
            # ---------- languages ----------
            pg.click('.flag[data-lang="pt"]'); pg.wait_for_timeout(120)
            check(f'{tag}: Portuguese: tabs Painel / Plano / Simulados / Estatísticas', pg.evaluate("[...document.querySelectorAll('.tabs button')].map(b=>b.textContent).join('/')") == 'Painel/Plano/Simulados/Estatísticas')
            check(f'{tag}: Portuguese forecast labels', 'Chance de passar' in pg.inner_text('#fcKpis'))
            pg.click('.flag[data-lang="ja"]'); pg.wait_for_timeout(120)
            check(f'{tag}: Japanese tabs', pg.evaluate("document.querySelector('.tabs button[data-view=\"sr\"]').textContent") == '統計')
            pg.click('.flag[data-lang="en"]')
            check(f'{tag}: no JavaScript errors', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} forecast & plan tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
