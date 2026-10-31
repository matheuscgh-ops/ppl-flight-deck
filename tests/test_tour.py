"""Demo-only guided tour: spotlight, Next/Back/Skip, keyboard, interactive steps, first-visit start — on all devices.
Also checks the personal app has no tour at all."""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('short desktop window', dict(viewport={'width': 1920, 'height': 940})),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA))]
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:220]))
DEMO = 'file://' + os.path.join(ROOT, 'demo.html'); INDEX = 'file://' + os.path.join(ROOT, 'index.html')
REAL_USER = "Object.defineProperty(navigator,'webdriver',{get:()=>false})"   # behave like a person's browser

with sync_playwright() as p:
    b = p.chromium.launch()
    # ---- personal app: no tour ----
    pg = b.new_page(); pg.add_init_script(REAL_USER); pg.goto(INDEX); pg.wait_for_timeout(1200)
    check('personal app: no tour button, no tour script, nothing opens', pg.evaluate("!document.getElementById('tourBtn')&&!window.pplTour&&!document.querySelector('.tour-card')"))
    pg.close()

    for mode, opts in DEV:
        tag = f'demo · {mode}'; W = opts['viewport']['width']; H = opts['viewport']['height']
        c = b.new_context(**opts); c.add_init_script(REAL_USER); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(DEMO); pg.wait_for_timeout(1300)
        ev = pg.evaluate; tap = pg.tap if mode in ('phone', 'iPad mini') else pg.click
        check(f'{tag}: first visit opens the tour automatically', pg.is_visible('.tour-card') and ev('pplTour.step()') == 0)
        n = ev('pplTour.steps')
        check(f'{tag}: 18 steps, "Step 1 of 18"', n == 18 and 'step 1 of 18' in pg.inner_text('.tour-card').lower())
        # walk every step: highlight on the target, card inside the screen
        bad = []
        for k in range(n):
            ev(f'pplTour.go({k})'); pg.wait_for_timeout(1500)
            r = ev("""(()=>{const h=document.querySelector('.tour-hole').getBoundingClientRect(),c=document.querySelector('.tour-card').getBoundingClientRect();
              return {h:[h.left,h.top,h.right,h.bottom],c:[c.left,c.top,c.right,c.bottom],center:document.querySelector('.tour-hole').classList.contains('center')}})()""")
            sel = ev(f"(()=>{{const s=[null,'.board','.progress','#tsCard','#volCard','.cal','#fcMini','.nthen','.tabs button[data-view=\"plan\"]','#planWeek','#energyPick','#planList','#planPt','.tshero','#statSeg','#fcFull','.flags',null][{k}];if(!s)return null;const e=document.querySelector(s).getBoundingClientRect();return [e.left,e.top,e.right,e.bottom]}})()")
            cx = r['c']
            if not (cx[0] >= -1 and cx[1] >= -1 and cx[2] <= W + 1 and cx[3] <= H + 1): bad.append((k, 'card off screen', cx))
            if sel is None and not r['center']: bad.append((k, 'should be centered'))
            if sel is not None:
                h = r['h']; vis = [max(sel[0], 0), max(sel[1], 0), min(sel[2], W), min(sel[3], H)]
                if not (h[0] <= vis[0] + 1 and h[1] <= vis[1] + 1 and h[2] >= vis[2] - 1 and h[3] >= vis[3] - 5): bad.append((k, 'highlight misses target', h, vis))
        check(f'{tag}: every step highlights its element and keeps the card on screen', not bad, bad)
        # the tour scrolls by itself: start each step from the far end of the page, then the element must be visible and not under the card
        hidden = []
        for k in range(n):
            ev("window.scrollTo(0,document.documentElement.scrollHeight)"); pg.wait_for_timeout(80)
            ev(f'pplTour.go({k})'); pg.wait_for_timeout(1700)
            r = ev("""(()=>{const h=document.querySelector('.tour-hole');if(h.classList.contains('center'))return null;const hr=h.getBoundingClientRect(),c=document.querySelector('.tour-card').getBoundingClientRect();
              const vis=Math.max(0,Math.min(hr.bottom,innerHeight)-Math.max(hr.top,0))/Math.max(1,Math.min(hr.height,innerHeight));
              const freeBot=innerWidth<=640?c.top:innerHeight,fits=innerWidth<=640?hr.height<=freeBot-8:hr.height+c.height+24<=innerHeight;
              const ov=Math.max(0,Math.min(hr.bottom,c.bottom)-Math.max(hr.top,c.top))*Math.max(0,Math.min(hr.right,c.right)-Math.max(hr.left,c.left))/Math.max(1,hr.width*Math.min(hr.height,innerHeight));
              return {vis:+vis.toFixed(2),covered:+ov.toFixed(2),fits,topOk:hr.top>=-1&&hr.top<freeBot-40}})()""")
            if r and (r['vis'] < .9 and r['fits'] or (r['fits'] and r['covered'] > .05) or not r['topOk']): hidden.append((k, r))
        check(f'{tag}: the tour scrolls by itself so each highlighted element is visible and not under the card', not hidden, hidden)
        check(f'{tag}: page never wider than the screen during the tour', ev('document.documentElement.scrollWidth') == W)
        # buttons
        ev('pplTour.go(1)'); pg.wait_for_timeout(300)
        tap('[data-tour="next"]'); pg.wait_for_timeout(300)
        check(f'{tag}: Next goes forward', ev('pplTour.step()') == 2)
        tap('[data-tour="back"]'); pg.wait_for_timeout(300)
        check(f'{tag}: Back goes back', ev('pplTour.step()') == 1)
        if mode in ('desktop', 'laptop'):
            pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(250)
            check(f'{tag}: → key moves forward', ev('pplTour.step()') == 2)
            pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(250)
            check(f'{tag}: ← key moves back', ev('pplTour.step()') == 1)
        check(f'{tag}: clicks outside the highlight are blocked on normal steps', ev("document.elementFromPoint(innerWidth/2,innerHeight/2).classList.contains('tour-block')||!!document.elementFromPoint(innerWidth/2,innerHeight/2).closest('.tour-card')"))
        # interactive steps
        ev('pplTour.go(8)'); pg.wait_for_timeout(450)
        check(f'{tag}: interactive step pulses and says "Try it"', ev("document.querySelector('.tour-hole').classList.contains('act')") and 'Try it' in pg.inner_text('.tour-card'))
        tap('.tabs button[data-view="plan"]'); pg.wait_for_timeout(900)
        check(f'{tag}: clicking the Plan tab (the highlighted element) opens it and moves the tour on', ev("curView") == 'plan' and ev('pplTour.step()') == 9)
        check(f'{tag}: the next step shows the plans card (week view, new plan)', ev("document.querySelector('.tour-hole')") is not None and 'Plans' in pg.inner_text('.tour-card'))
        ev('pplTour.go(10)'); pg.wait_for_timeout(450)
        tap('#energyPick [data-energy="low"]'); pg.wait_for_timeout(900)
        check(f'{tag}: choosing Low energy works and moves the tour on', ev('energyMode') == 'low' and ev('pplTour.step()') == 11)
        ev('pplTour.go(14)'); pg.wait_for_timeout(500)
        check(f'{tag}: the tour switches tabs by itself (Statistics)', ev('curView') == 'sr')
        tap('#statSeg [data-stat="tests"]'); pg.wait_for_timeout(900)
        check(f'{tag}: clicking "Practice tests" in Statistics opens it and the tour stays there to show the forecast', pg.is_visible('#statTests') and ev('pplTour.step()') == 15 and ev('curView') == 'sr')
        # language
        ev('pplTour.go(2)'); pg.wait_for_timeout(300)
        check(f'{tag}: the tour card has the 3 language flags', ev("document.querySelectorAll('.tour-card [data-tlang]').length") == 3 and ev("document.querySelector('.tour-card [data-tlang=\"en\"]').classList.contains('on')"))
        tap('.tour-card [data-tlang="ja"]'); pg.wait_for_timeout(350)
        check(f'{tag}: a flag inside the tour switches the tour AND the app, without leaving the tour', ev('lang') == 'ja' and '次へ' in pg.inner_text('.tour-card') and ev('pplTour.step()') == 2 and ev("document.querySelector('.tabs button[data-view=\"sr\"]').textContent") == '統計')
        check(f'{tag}: the chosen flag is marked', ev("document.querySelector('.tour-card [data-tlang=\"ja\"]').classList.contains('on')"))
        tap('.tour-card [data-tlang="en"]'); pg.wait_for_timeout(300)
        ev("document.querySelector('.flag[data-lang=\"pt\"]').click()"); pg.wait_for_timeout(300)
        check(f'{tag}: tour follows the language (pt)', 'passo 3 de 18' in pg.inner_text('.tour-card').lower() and 'Próximo' in pg.inner_text('.tour-card'))
        ev("document.querySelector('.flag[data-lang=\"en\"]').click()"); pg.wait_for_timeout(200)
        # skip
        tap('[data-tour="skip"]'); pg.wait_for_timeout(300)
        check(f'{tag}: "Skip tour" closes it and returns to the dashboard', not pg.is_visible('.tour-card') and ev('pplTour.step()') == -1 and ev('curView') == 'dash')
        check(f'{tag}: app is usable again after the tour (no blocking layer)', not ev("[...document.querySelectorAll('.tour-block')].some(b=>!b.hidden)"))
        pg.reload(); pg.wait_for_timeout(1300)
        check(f'{tag}: after it was seen, it does not open again by itself', not pg.is_visible('.tour-card'))
        tap('#tourBtn'); pg.wait_for_timeout(400)
        check(f'{tag}: the Tour button restarts it', pg.is_visible('.tour-card') and ev('pplTour.step()') == 0)
        ev('pplTour.go(17)'); pg.wait_for_timeout(300)
        tap('[data-tour="next"]'); pg.wait_for_timeout(300)
        check(f'{tag}: "Finish" on the last step closes it', not pg.is_visible('.tour-card'))
        tap('#tourBtn'); pg.wait_for_timeout(300); pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
        check(f'{tag}: Esc closes the tour', not pg.is_visible('.tour-card'))
        check(f'{tag}: the extra bottom space is removed when the tour closes', ev("document.body.style.paddingBottom") == '')
        check(f'{tag}: no JavaScript errors', not errs, errs)
        c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} tour tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
