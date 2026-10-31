"""Practice tests: tab, dashboard strip, Statistics › Practice tests, blended forecast, volume and plan cadence.
Runs on desktop, laptop, iPad mini and iPhone — personal (index.html) and demo (demo.html)."""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:220]))

DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA))]

# five scored tests rising ~1 point a day plus one test in progress
SETUP = """(()=>{state.events=[];state.settings={minutes:180,qph:40,testEvery:3,reviewMin:1.5};
  const ev=(n,topic,kind,sc)=>state.events.push({id:uid(),date:addDays(todayISO(),-n),topic,kind,from:null,to:null,score:sc,partial:false,demo:false});
  ev(1,18,'study',70);ev(1,13,'study',88);
  state.tests=[[16,62],[12,66],[8,70],[4,74],[1,78]].map(([n,s])=>({id:uid(),date:addDays(todayISO(),-n),q:60,score:s}));
  state.tests.push({id:'inprog',date:todayISO(),q:60,score:null});
  save();render();})()"""
EMPTY = "(()=>{state.tests=[];save();render();})()"

with sync_playwright() as p:
    b = p.chromium.launch()
    for f in ['index', 'demo']:
        url = 'file://' + os.path.join(ROOT, f + '.html')
        for mode, opts in DEV:
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(url); pg.wait_for_timeout(450)
            tag = f'{f} · {mode}'; touch = mode in ('phone', 'iPad mini'); tap = pg.tap if touch else pg.click
            W = opts['viewport']['width']; H = opts['viewport']['height']
            ev = pg.evaluate

            # ---------- tabs ----------
            check(f'{tag}: tab order Dashboard / Plan / Tests / Statistics', ev("[...document.querySelectorAll('.tabs button')].map(b=>b.dataset.view).join()") == 'dash,plan,tests,sr')
            check(f'{tag}: tab label "Practice tests" (same name everywhere)', pg.inner_text('.tabs button[data-view="tests"]') == 'Practice tests')
            check(f'{tag}: header tabs still fit the screen', ev('document.documentElement.scrollWidth') == W)

            # ---------- dashboard card (top row, between exam countdown and "This week") ----------
            pg.evaluate(SETUP); pg.wait_for_timeout(200)
            order = ev("[...document.querySelector('.toprow').children].map(x=>x.id||x.className.split(' ')[1])")
            check(f'{tag}: top row order: progress, countdown, practice tests, this week', order == ['progress', 'countdown', 'tsCard', 'volCard'], order)
            check(f'{tag}: no practice-test footer under the calendar', ev("document.getElementById('tsStrip')") is None and ev("document.querySelector('#viewDash > :last-child').className") == 'center')
            check(f'{tag}: card shows last score 78% and best 78%', pg.inner_text('#tsLast') == '78%' and '78%' in pg.inner_text('#tsBestMini'), (pg.inner_text('#tsLast'), pg.inner_text('#tsBestMini')))
            check(f'{tag}: card shows average of last 3 = 74% (visible)', pg.is_visible('#tsStripKpis') and '74%' in pg.inner_text('#tsStripKpis'), pg.inner_text('#tsStripKpis'))
            check(f'{tag}: card mini chart has 5 points and 70% / 85% lines', ev("document.querySelectorAll('#tsSpark circle').length") == 5 and ev("document.querySelectorAll('#tsSpark .c70,#tsSpark .c85').length") == 2)
            check(f'{tag}: card says next test in 2 days', 'in 2 d' in pg.inner_text('#tsStripNext'), pg.inner_text('#tsStripNext'))
            boxes = ev("['tsCard','volCard'].map(id=>{const b=document.getElementById(id).getBoundingClientRect();return [b.left,b.right,b.top,b.bottom]})")
            check(f'{tag}: practice-test card and "This week" do not overlap and fit the screen', all(b[1] <= W for b in boxes) and (boxes[0][1] <= boxes[1][0] or boxes[0][2] >= boxes[1][3] or boxes[1][2] >= boxes[0][3]), boxes)
            check(f'{tag}: progress legend names are not cut off', not ev("[...document.querySelectorAll('.progress .lg strong')].some(e=>e.scrollWidth>e.clientWidth+1)"))
            if mode in ('phone', 'iPad mini'):
                check(f'{tag}: countdown and "This week" stay side by side, practice tests below', ev("document.getElementById('tsCard').getBoundingClientRect().top>=document.getElementById('volCard').getBoundingClientRect().bottom-1") and abs(ev("document.querySelector('.countdown').getBoundingClientRect().top-document.getElementById('volCard').getBoundingClientRect().top")) < 1)
            if mode == 'desktop':
                check(f'{tag}: dashboard still fits one screen', ev('document.documentElement.scrollHeight') == H, ev('document.documentElement.scrollHeight'))
                ch = ev("document.querySelector('.cal').getBoundingClientRect().height")
                check(f'{tag}: calendar keeps its full height (no footer squeezing it)', ch >= (480 if f == 'index' else 440), ch)
                check(f'{tag}: top row height unchanged (≈134 px)', ev("document.querySelector('.toprow').getBoundingClientRect().height") <= 140, ev("document.querySelector('.toprow').getBoundingClientRect().height"))
                cal = ev("Math.max(...[...document.querySelectorAll('.cell .evs, .cell')].map(c=>c.scrollWidth-c.clientWidth))")
                check(f'{tag}: calendar cells do not overflow sideways', cal <= 1, cal)
            check(f'{tag}: dashboard not wider than the screen', ev('document.documentElement.scrollWidth') == W)
            # expand: quick look
            tap('#tsExpand'); pg.wait_for_timeout(250)
            check(f'{tag}: ⤢ opens the practice-test quick look', pg.is_visible('#tsQuickBg'))
            check(f'{tag}: quick look shows 5 KPIs, trend, chart and next test', ev("[...document.querySelectorAll('#tsQKpis b')].map(b=>b.textContent)") == ['78%', '78%', '74%', '3', '0'] and 'points/week' in pg.inner_text('#tsQTrend') and ev("document.querySelectorAll('#tsQChart circle').length") == 5 and 'in 2 d' in pg.inner_text('#tsQNext'))
            check(f'{tag}: quick look fits the screen', ev("document.querySelector('#tsQuickBg .modal').getBoundingClientRect().right") <= W)
            tap('#tsQuickBg .callink'); pg.wait_for_timeout(200)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
            check(f'{tag}: Escape closes only the accuracy dialog on top', not pg.is_visible('#calBg') and pg.is_visible('#tsQuickBg'))
            pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
            check(f'{tag}: second Escape closes the quick look', not pg.is_visible('#tsQuickBg'))

            # ---------- volume card: unchanged layout, +60 per scored test, 0 in progress ----------
            q_week = ev("weeklyVolume(12).at(-1).q")
            q_events = ev("(()=>{const ws=weekStart(todayISO());return state.events.filter(e=>weekStart(e.date)===ws&&e.kind!=='partial').length})()")
            n_tests_week = ev("(()=>{const ws=weekStart(todayISO());return state.tests.filter(x=>x.score!=null&&weekStart(x.date)===ws).length})()")
            ev("state.tests.forEach(x=>x.q=40);save();render()")
            check(f'{tag}: every scored practice test counts 60 questions (even if saved as 40)', ev("weeklyVolume(12).at(-1).q") == q_week)
            ev("state.tests=state.tests.filter(x=>x.score!=null);save();render()")
            check(f'{tag}: a test in progress adds 0 questions', ev("weeklyVolume(12).at(-1).q") == q_week)
            ev("state.tests.push({id:'inprog',date:todayISO(),q:60,score:null});save();render()")
            check(f'{tag}: "This week" number equals the volume series', pg.inner_text('#volWeek').replace(',', '') == str(q_week), (pg.inner_text('#volWeek'), q_week))
            kids = ev("[...document.querySelectorAll('#volCard *[id]')].map(x=>x.id).join()")
            check(f'{tag}: volume card unchanged (same elements, footer "Practice test (best)")', all(k in kids for k in ['volOpen','volWeek','volMini','ptStat','ptBest']) and 'tsCard' not in kids, kids)
            check(f'{tag}: volume footer still shows the best practice test', pg.inner_text('#ptBest') == '78%', pg.inner_text('#ptBest'))
            tap('#volOpen'); pg.wait_for_timeout(250)
            check(f'{tag}: big volume chart still opens with its range selector', pg.is_visible('#volbg') and ev("document.querySelectorAll('#volRange button').length") == 8)
            pg.click('#volClose'); pg.wait_for_timeout(100)

            # ---------- exam forecast card: same look, blended numbers ----------
            B = ev("(()=>{const B=blended();return {mu:B.mu,pass:B.pass,goal:B.goal,w:B.w,n:B.n,model:B.model,avg:B.testsAvg}})()")
            om = [0.5 ** (a / 10) for a in (8, 4, 1)]; Wt = sum(om); avg = sum(o * x for o, x in zip(om, (70, 74, 78))) / Wt / 100
            check(f'{tag}: blended score: last 3 tests weighted by age (half-life 10 days), w = W/(W+2)', B['n'] == 3 and abs(B['w'] - Wt / (Wt + 2)) < 1e-9 and abs(B['avg'] - avg) < 1e-9, (B, Wt / (Wt + 2), avg))
            check(f'{tag}: forecast card shows the blended score', pg.inner_text('#fcMiniVal') == f"{round(B['mu']*100)}%", (pg.inner_text('#fcMiniVal'), B))
            sub = pg.inner_text('#fcMiniSub')
            check(f'{tag}: forecast card chances come from the blended score', f"{round(B['pass']*100)}%" in sub and f"{round(B['goal']*100)}%" in sub, sub)
            check(f'{tag}: forecast card keeps its bar with 70% / 85% marks', ev("document.querySelectorAll('#fcMini .fcbar .m70, #fcMini .fcbar .m85').length") == 2)
            tap('#fcMini'); pg.wait_for_timeout(200)
            check(f'{tag}: tapping the forecast card lists 3 topics', pg.is_visible('#fcTopBg') and ev("document.querySelectorAll('#fcTopList .lostrow').length") == 3)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
            check(f'{tag}: Escape closes the top-3 dialog', not pg.is_visible('#fcTopBg'))
            ev(EMPTY); pg.wait_for_timeout(100)
            check(f'{tag}: without practice tests the card shows the question-bank model', pg.inner_text('#fcMiniVal') == f"{round(ev('forecast().mu')*100)}%")
            check(f'{tag}: empty card says there are no tests', pg.inner_text('#tsLast') == '—' and 'No scored' in pg.inner_text('#tsSpark'))
            pg.evaluate(SETUP); pg.wait_for_timeout(150)

            # ---------- Practice tests tab ----------
            tap('#tsExpand'); pg.wait_for_timeout(200)
            tap('#tsOpen'); pg.wait_for_timeout(300)
            check(f'{tag}: "Practice tests →" in the quick look opens the Tests tab', pg.is_visible('#viewTests') and not pg.is_visible('#viewDash'))
            check(f'{tag}: address is #tests', ev('location.hash') == '#tests')
            kp = ev("[...document.querySelectorAll('#tsKpis b')].map(b=>b.textContent)")
            check(f'{tag}: 5 KPIs: last 78% / best 78% / avg 74% / 3 ≥ 70% / 0 ≥ 85%', kp == ['78%', '78%', '74%', '3', '0'], kp)
            tt = pg.inner_text('#tsTrendTxt')
            check(f'{tag}: trend in plain words: +7.3 points/week, consistent progress, 85% date (R² in the tooltip)', '+7.3 points/week' in tt and 'consistent progress' in tt and 'reaches 85%' in tt and 'pp' not in tt and 'R² 1.00' in ev("document.querySelector('#tsTrendTxt span[title]').title"), tt)
            check(f'{tag}: chart has points, trend line, band and 70% / 85% lines', ev("document.querySelectorAll('#tsChart circle').length") == 5 and ev("document.querySelectorAll('#tsChart .s-reg,#tsChart .s-band,#tsChart .c70,#tsChart .c85').length") == 4)
            check(f'{tag}: the list shows 6 tests, the one in progress first', ev("document.querySelectorAll('#tsList .tsrow').length") == 6 and 'in progress' in pg.inner_text('#tsList .tsrow').lower(), pg.inner_text('#tsList')[:120])
            tap('#viewTests .callink'); pg.wait_for_timeout(200)
            check(f'{tag}: Tests tab also links to the model accuracy', pg.is_visible('#calBg'))
            tap('#calClose'); pg.wait_for_timeout(100)
            tap('#viewTests [data-tsr="7d"]'); pg.wait_for_timeout(200)
            check(f'{tag}: range 7D keeps 2 tests → "not enough data" for the trend', ev("document.querySelectorAll('#tsChart circle').length") == 2 and 'more scored' in pg.inner_text('#tsTrendTxt'), pg.inner_text('#tsTrendTxt'))
            tap('#viewTests [data-tsr="all"]'); pg.wait_for_timeout(150)
            # log a new test from the tab
            tap('#tsAdd'); pg.wait_for_timeout(200)
            check(f'{tag}: "+ Log practice test" opens the dialog with today', pg.is_visible('#ptbg') and pg.input_value('#ptDate') == ev('todayISO()'))
            pg.fill('#ptScore', '82'); tap('#ptSave'); pg.wait_for_timeout(250)
            check(f'{tag}: logging 82% adds it (always 60 questions)', ev("state.tests.filter(x=>x.score===82&&x.q===60).length") == 1 and pg.inner_text('#tsKpis b') == '82%')
            # edit
            rid = ev("state.tests.find(x=>x.score===82).id")
            tap(f'#tsList [data-edit="{rid}"]'); pg.wait_for_timeout(200)
            check(f'{tag}: Edit opens the dialog filled in', pg.is_visible('#ptbg') and pg.input_value('#ptScore') == '82')
            pg.fill('#ptScore', '84'); tap('#ptSave'); pg.wait_for_timeout(250)
            check(f'{tag}: editing changes the score without adding a test', ev("state.tests.filter(x=>x.score===84).length") == 1 and ev("state.tests.filter(x=>x.score===82).length") == 0 and ev('state.tests.length') == 7)
            tap(f'#tsList [data-edit="inprog"]'); pg.wait_for_timeout(200)
            pg.fill('#ptScore', '80'); tap('#ptSave'); pg.wait_for_timeout(250)
            check(f'{tag}: finishing the test in progress gives it a score', ev("state.tests.find(x=>x.id==='inprog').score") == 80)
            # delete + undo
            n = ev('state.tests.length')
            tap(f'#tsList [data-delpt="{rid}"]'); pg.wait_for_timeout(200)
            check(f'{tag}: delete removes the test', ev('state.tests.length') == n - 1)
            check(f'{tag}: delete offers undo', pg.is_visible('#toast'))
            check(f'{tag}: Tests page not wider than the screen', ev('document.documentElement.scrollWidth') == W, ev("[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.offsetParent!==null).slice(0,4).map(e=>(e.id||String(e.className)||e.tagName)+':'+Math.round(e.getBoundingClientRect().right))"))
            tap('#tsToStats'); pg.wait_for_timeout(300)
            check(f'{tag}: "Full statistics →" opens Statistics › Practice tests', pg.is_visible('#statTests') and not pg.is_visible('#statBank') and ev('location.hash') == '#stats-tests')

            # ---------- Statistics: Bank | Practice tests ----------
            check(f'{tag}: overall score panel explains the weights', 'weight' in pg.inner_text('#ovWeights') and ev("document.querySelectorAll('#ovKpis b').length") == 4)
            check(f'{tag}: trend chart drawn', ev("document.querySelectorAll('#tsChart2 .s-reg').length") == 1)
            check(f'{tag}: model accuracy is no longer a panel on the page', not pg.is_visible('#calChart') and ev("document.querySelector('#statTests #calChart')") is None)
            check(f'{tag}: trend panel has a "Learn about the model’s accuracy" link', pg.is_visible('#statTests .callink') and 'accuracy' in pg.inner_text('#statTests .callink'))
            tap('#statTests .callink'); pg.wait_for_timeout(250)
            check(f'{tag}: the link opens the accuracy dialog', pg.is_visible('#calBg'))
            check(f'{tag}: dialog shows one dot per test plus the perfect-model diagonal', ev("document.querySelectorAll('#calChart circle').length") == ev('scoredTests().length') and ev("document.querySelectorAll('#calChart .s-diag').length") == 1)
            check(f'{tag}: dialog shows R² and bias', 'R²' in pg.inner_text('#calTxt') and 'predicted' in pg.inner_text('#calTxt'), pg.inner_text('#calTxt'))
            check(f'{tag}: dialog fits the screen width', ev("document.querySelector('#calBg .modal').getBoundingClientRect().right") <= W, ev("document.querySelector('#calBg .modal').getBoundingClientRect().right"))
            pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
            check(f'{tag}: Escape closes the accuracy dialog', not pg.is_visible('#calBg'))
            hb = ev("[...document.querySelectorAll('#distChart rect[data-bin]')].map(r=>[+r.dataset.bin,+r.dataset.n])")
            check(f'{tag}: histogram uses 5-point bins whose counts add up to all tests', all(b[0] % 5 == 0 for b in hb) and sum(b[1] for b in hb) == ev('scoredTests().length'), hb)
            check(f'{tag}: histogram puts each score in the right bin', all(n == ev(f"scoredTests().filter(x=>x.score>={a}&&(x.score<{a+5}||{a+5}===100)).length") for a, n in hb), hb)
            check(f'{tag}: histogram marks the mean and the 70% / 85% lines', ev("document.querySelectorAll('#distChart .s-mean,#distChart .c70,#distChart .c85').length") == 3)
            st = ev("distStats(scoredTests())")
            check(f'{tag}: mean and standard deviation shown', f"{st['mean']:.1f}%" in pg.inner_text('#distTxt') and f"{st['sd']:.1f} points" in pg.inner_text('#distTxt'), pg.inner_text('#distTxt'))
            K = ev("(()=>{const k=testKpis(),a=k.avg3/100,sd=testsSD(null,Math.min(3,k.n));return {avg:k.avg3,pass:Math.round(betaBinomTail(60,a,sd,42)*100),goal:Math.round(betaBinomTail(60,a,sd,51)*100),n70:k.n70,n:k.n,sd}})()")
            ff = pg.inner_text('#fcFull')
            check(f'{tag}: card under the histogram uses practice-test metrics (avg of last 3, chances from tests, tests passed)', pg.is_visible('#fcFull') and f"{K['avg']}%" in ff and f"{K['pass']}%" in ff and f"{K['goal']}%" in ff and f"{K['n70']} / {K['n']}" in ff.replace('\n', ' '), (ff[:220], K))
            check(f'{tag}: card shows consistency (std dev) and the exam-day projection', '±' in ff and 'consistency' in ff and 'exam day' in ff.lower())
            check(f'{tag}: card does not use the question-bank model', 'bank' not in ff.lower())
            check(f'{tag}: card scale has 70% / 85% marks and last / avg / exam-day markers', ev("document.querySelectorAll('#fcFull .ffscale em').length") == 2 and ev("document.querySelectorAll('#fcFull .ffscale s').length") == 3)
            check(f'{tag}: card fits inside the histogram panel', ev("document.getElementById('fcFull').getBoundingClientRect().right<=document.getElementById('fcFull').parentElement.getBoundingClientRect().right+1"))
            bb = ev("(()=>{const sv=document.querySelector('#tsChart2 svg'),band=sv.querySelector('.s-band');return {clip:!!band.getAttribute('clip-path'),rect:!!sv.querySelector('clipPath rect')}})()")
            check(f'{tag}: trend band is clipped to the chart area (no overflow behind EXAM)', bb['clip'] and bb['rect'], bb)
            check(f'{tag}: interval between tests shown', 'days' in pg.inner_text('#gapTxt'))
            tap('#statSeg [data-stat="bank"]'); pg.wait_for_timeout(250)
            check(f'{tag}: "Question bank" shows forecast and spaced repetition again', pg.is_visible('#fcSection') and pg.is_visible('#heatPanel') and not pg.is_visible('#statTests'))
            tap('.tabs button[data-view="sr"]'); pg.wait_for_timeout(250)
            check(f'{tag}: Statistics tab opens on the question bank', pg.is_visible('#statBank'))
            check(f'{tag}: Statistics page not wider than the screen', ev('document.documentElement.scrollWidth') == W, ev("[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.offsetParent!==null).slice(0,4).map(e=>(e.id||String(e.className)||e.tagName)+':'+Math.round(e.getBoundingClientRect().right))"))

            if mode in ('desktop', 'laptop'):
                tap('#statSeg [data-stat="tests"]'); pg.wait_for_timeout(250)
                r = ev("[...document.querySelectorAll('#statTests .statduo > section')].map(x=>{const b=x.getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.width)]})")
                check(f'{tag}: desktop: trend and histogram side by side', len(r) == 2 and r[0][1] == r[1][1] and r[1][0] > r[0][0] and r[0][2] < W * .55, r)
                tap('#statSeg [data-stat="bank"]'); pg.wait_for_timeout(250)
                r = ev("['fcSection','fcLostPanel'].map(id=>{const b=document.getElementById(id).getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.width)]})")
                check(f'{tag}: desktop: question-bank model and "where you lose" side by side', r[0][1] == r[1][1] and r[1][0] > r[0][0] and r[0][2] < W * .55, r)
                check(f'{tag}: desktop: the average spaced-repetition panel is gone; compact heat map next to the study volume', ev("document.getElementById('srAvgChart')") is None and ev("document.getElementById('heatPanel').getBoundingClientRect().width") < W * .55)
                tap('.tabs button[data-view="tests"]'); pg.wait_for_timeout(250)
                r = ev("[...document.querySelectorAll('#viewTests .statduo > section')].map(x=>{const b=x.getBoundingClientRect();return [Math.round(b.left),Math.round(b.top)]})")
                check(f'{tag}: desktop: Tests tab chart and list side by side', len(r) == 2 and r[0][1] == r[1][1] and r[1][0] > r[0][0], r)
            else:
                tap('#statSeg [data-stat="tests"]'); pg.wait_for_timeout(250)
                r = ev("[...document.querySelectorAll('#statTests .statduo > section')].map(x=>Math.round(x.getBoundingClientRect().top))")
                check(f'{tag}: tablet/phone: trend and histogram stacked', len(r) == 2 and r[1] > r[0], r)
            # ---------- plan: cadence ----------
            ev("state.tests=[{id:'a',date:addDays(todayISO(),-3),q:60,score:75}];state.settings.testEvery=3;save();render()")
            check(f'{tag}: test every 3 days, last one 3 days ago → test in today\'s plan', ev("buildPlan().items.some(x=>x.kind==='test'&&x.n===60)"))
            tap('.tabs button[data-view="plan"]'); pg.wait_for_timeout(250)
            check(f'{tag}: Plan setting reads "every N days" and shows 3', 'every' in pg.inner_text('#viewPlan').lower() and pg.input_value('#setTests') == '3')
            pg.fill('#setTests', '7'); pg.press('#setTests', 'Enter'); pg.wait_for_timeout(700)
            check(f'{tag}: every 7 days → no test today', ev('settings().testEvery') == 7 and not ev("buildPlan().items.some(x=>x.kind==='test')"))
            pg.reload(); pg.wait_for_timeout(400)
            check(f'{tag}: the setting survives a reload', ev('settings().testEvery') == 7)
            ev("state.settings.testEvery=3;save();render()")
            check(f'{tag}: the setting goes into the backup', ev('JSON.parse(JSON.stringify(state)).settings.testEvery') == 3 and ev("normalize(JSON.parse(JSON.stringify(state))).settings.testEvery") == 3)

            # ---------- stale "in progress" tests ----------
            ev("state.tests=[{id:'old',date:addDays(todayISO(),-2),q:60,score:null},{id:'new',date:todayISO(),q:60,score:null},{id:'s',date:addDays(todayISO(),-1),q:60,score:80}];save();render()")
            tap('.tabs button[data-view="tests"]'); pg.wait_for_timeout(250)
            check(f'{tag}: a test "in progress" since an earlier day shows "finish or delete"', ev("document.querySelectorAll('#tsList .stale').length") == 1 and ev("!!document.querySelector('#tsList [data-id=\"old\"] .stale')"))
            check(f'{tag}: the Tests tab shows how many are stuck in progress', pg.is_visible('#tsStale') and '1 practice test' in pg.inner_text('#tsStale'), pg.inner_text('#tsStale'))
            tap('#tsList [data-delpt="old"]'); pg.wait_for_timeout(250)
            check(f'{tag}: deleting it clears the warning', not pg.is_visible('#tsStale'))
            check(f'{tag}: page with warnings not wider than the screen', ev('document.documentElement.scrollWidth') == W)

            # ---------- Plan: practice-test panel ----------
            ev("state.tests=[{id:'a',date:addDays(todayISO(),-1),q:60,score:80}];state.settings.testEvery=3;save();render()")
            tap('.tabs button[data-view="plan"]'); pg.wait_for_timeout(250)
            check(f'{tag}: Plan has a practice-test panel with next date and last test', pg.is_visible('#planPt') and 'in 2 d' in pg.inner_text('#ppInfo') and '80%' in pg.inner_text('#ppInfo'), pg.inner_text('#ppInfo'))
            check(f'{tag}: no test planned today before adding one', not ev("buildPlan(null,null,energyMode).items.some(x=>x.kind==='test')"))
            tap('#ppAdd'); pg.wait_for_timeout(300)
            check(f'{tag}: "+ Add to today’s plan" puts a 60-question test in the plan', ev("buildPlan(null,null,energyMode).items.some(x=>x.kind==='test'&&x.reason==='testManual'&&x.n===60)") and ev("document.querySelectorAll('#planList [data-pt]').length") == 1)
            check(f'{tag}: added test also shows in low energy', ev("buildPlan(null,null,'low').items.some(x=>x.kind==='test')"))
            check(f'{tag}: button switches to "Remove from today’s plan"', 'Remove' in pg.inner_text('#ppAdd'))
            tap('#planList [data-pt]'); pg.wait_for_timeout(250)
            check(f'{tag}: tapping the planned test opens the log dialog', pg.is_visible('#ptbg'))
            pg.fill('#ptScore', '83'); tap('#ptSave'); pg.wait_for_timeout(300)
            check(f'{tag}: logging it saves the test and marks the plan item done', ev("state.tests.some(x=>x.score===83&&x.date===todayISO())") and ev("buildPlan(null,null,energyMode).items.some(x=>x.kind==='test'&&x.done)"))
            tap('#ppAdd'); pg.wait_for_timeout(200)
            tap('#ppLog'); pg.wait_for_timeout(200)
            check(f'{tag}: "Log a practice test" opens the dialog directly', pg.is_visible('#ptbg'))
            pg.click('#ptClose'); pg.wait_for_timeout(100)
            check(f'{tag}: Plan page not wider than the screen', ev('document.documentElement.scrollWidth') == W, ev("[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.offsetParent!==null).slice(0,4).map(e=>(e.id||String(e.className)||e.tagName)+':'+Math.round(e.getBoundingClientRect().right))"))
            ev("state.plan=null;save();render()")

            # ---------- languages ----------
            pg.click('.flag[data-lang="pt"]'); pg.wait_for_timeout(150)
            check(f'{tag}: Portuguese tab "Simulados"', pg.inner_text('.tabs button[data-view="tests"]') == 'Simulados')
            pg.click('.flag[data-lang="ja"]'); pg.wait_for_timeout(150)
            check(f'{tag}: Japanese tab "模試"', pg.inner_text('.tabs button[data-view="tests"]') == '模試')
            pg.click('.flag[data-lang="en"]')
            check(f'{tag}: no JavaScript errors', not errs, errs)
            c.close()

    # ---------- demo data ----------
    c = b.new_context(viewport={'width': 1440, 'height': 900}); pg = c.new_page()
    pg.goto('file://' + os.path.join(ROOT, 'demo.html')); pg.wait_for_timeout(450)
    n = pg.evaluate('scoredTests().length')
    check('demo: 8–9 fictional practice tests', 8 <= n <= 9, n)
    check('demo: enough tests for trend and calibration', pg.evaluate('testTrend("all").reg!==null') and pg.evaluate('calibration().pts.length>=5'))
    c.close(); b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} practice-test tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
