"""Chart hover (mouse/trackpad): dashed crosshair to the axes, one dot per line present, values read correctly.
Statistics, Practice tests tab, dashboard preview and the dialogs opened from the dashboard. Touch devices: no hover UI.
Also: the interval selector for all small topic charts."""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:240]))

def hover(pg, sel, fx, fy=.5, setup=None):
    if setup: pg.evaluate(setup); pg.wait_for_timeout(350)
    el = pg.locator(sel).first; el.scroll_into_view_if_needed(); pg.wait_for_timeout(250)
    bb = el.bounding_box(); pg.mouse.move(bb['x'] + bb['width'] * fx, bb['y'] + bb['height'] * fy); pg.wait_for_timeout(120)
    return pg.evaluate("""(()=>({dots:document.querySelectorAll('.hov .hdot').length,lines:document.querySelectorAll('.hov .hx').length,
      tip:document.querySelector('.ctip').hidden?null:document.querySelector('.ctip').innerText}))()""")

with sync_playwright() as p:
    b = p.chromium.launch()
    for f in ['index', 'demo']:
        for mode, vp in [('desktop', (2000, 1190)), ('laptop', (1440, 900))]:
            tag = f'{f} · {mode}'
            c = b.new_context(viewport={'width': vp[0], 'height': vp[1]}); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(500)
            if f == 'index':   # give the personal file a known history so every chart has data
                pg.evaluate("""(()=>{const T=todayISO(),D=n=>addDays(T,-n),ev=(n,topic,sc)=>({id:'h'+topic+n,date:D(n),topic,kind:n>12?'study':'review',from:null,to:null,score:sc,partial:false,demo:false});
                  state.statuses[18]='Not Comfortable';state.events=[ev(20,18,60),ev(14,18,72),ev(6,18,80),ev(18,13,85),ev(9,13,90)];
                  state.tests=[[20,62],[14,68],[9,71],[5,75],[1,79]].map(([n,s])=>({id:'t'+n,date:D(n),q:60,score:s}));save();render()})()""")
            # SR average chart: two lines (recall + recall on exam day) → two dots
            r = hover(pg, '#srGrid .srcard .chart svg', .3, setup="goView('sr')")
            check(f'{tag}: spaced repetition (topic card): one dashed vertical line (no horizontal), two dots (recall + exam day) and both values', r['lines'] == 1 and r['dots'] == 2 and r['tip'] and 'Recall' in r['tip'] and 'exam day' in r['tip'], r)
            # where only the blue line exists (future part) → one dot
            r = hover(pg, '#srGrid .srcard .chart svg', .97)
            check(f'{tag}: spaced repetition: where only the projection exists → one dot', r['dots'] == 1 and 'Projection' in (r['tip'] or ''), r)
            # value read off the line = the app's own recall on that day
            ok = pg.evaluate("""(()=>{const s=document.querySelector('#srGrid .srcard .chart svg'),d=s.dataset;const pa=s.querySelector('path.s-actual');const pts=pa.getAttribute('d').match(/[ML][^ML]+/g).map(q=>q.slice(1).trim().split(' ').map(Number));
              const px=pts[Math.floor(pts.length/2)][0],py=pts[Math.floor(pts.length/2)][1],v=+d.hy0+(1-(py-+d.ht)/+d.hph)*(+d.hy1-+d.hy0);return v>0&&v<=1})()""")
            check(f'{tag}: values come from the chart scale (0–100%)', ok)
            # small topic chart
            r = hover(pg, '#srGrid .srcard .chart svg', .4)
            check(f'{tag}: small topic chart: crosshair, dot(s) and the date', r['lines'] >= 1 and r['dots'] >= 1 and r['tip'] and any(m in r['tip'] for m in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']), r)
            # forecast
            r = hover(pg, '#fcChart svg', .25)
            check(f'{tag}: question-bank model chart: forecast value with date', r['dots'] >= 1 and 'Forecast' in (r['tip'] or ''), r)
            # practice tests: trend + histogram + accuracy dialog
            r = hover(pg, '#tsChart2 svg', .5, setup="goView('sr','tests')")
            check(f'{tag}: practice-test trend: trend (or projection, after the last test) value at that day', r['dots'] >= 1 and ('Trend' in (r['tip'] or '') or 'Projection' in (r['tip'] or '')), r)
            r = hover(pg, '#distChart svg rect.s-hbar', .5, .5)
            check(f'{tag}: histogram: the bar under the cursor with its range and count, previous chart cleared', r['dots'] == 0 and r['tip'] and '%:' in r['tip'] and 'test' in r['tip'], r)
            pg.click('#statTests .callink'); pg.wait_for_timeout(300)
            r = hover(pg, '#calChart svg circle', .5, .5)
            check(f'{tag}: model accuracy dialog: predicted and real for the test under the cursor', r['tip'] and 'predicted' in r['tip'] and 'real' in r['tip'] and r['lines'] == 1, r)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
            r = hover(pg, '#tsChart svg', .45, setup="goView('tests')")
            check(f'{tag}: Practice tests tab chart has the hover', r['tip'] is not None and r['lines'] >= 1, r)
            # magnetic: practice-test trend snaps to the test days
            pg.evaluate("goView('sr','tests')"); pg.wait_for_timeout(300)
            el = pg.locator('#tsChart2 svg'); el.scroll_into_view_if_needed(); pg.wait_for_timeout(200); bb = el.bounding_box()
            xs = pg.evaluate("""(()=>{const s=document.querySelector('#tsChart2 svg'),pa=s.querySelector('path[data-hdisc]'),m=s.getScreenCTM();
              return pa.getAttribute('d').match(/[ML][^ML]+/g).map(q=>{const [x,y]=q.slice(1).trim().split(' ').map(Number);const p=s.createSVGPoint();p.x=x;p.y=y;return p.matrixTransform(m).x})})()""")
            snaps = []
            for k in range(len(xs) - 1):
                for frac in (.3, .7):
                    mx = xs[k] + (xs[k + 1] - xs[k]) * frac; pg.mouse.move(mx, bb['y'] + bb['height'] * .5); pg.wait_for_timeout(60)
                    vx = pg.evaluate("(()=>{const l=document.querySelector('#tsChart2 .hov .hx');if(!l)return null;const s=l.ownerSVGElement,p=s.createSVGPoint();p.x=+l.getAttribute('x1');p.y=0;return p.matrixTransform(s.getScreenCTM()).x})()")
                    snaps.append(abs(vx - (xs[k] if frac < .5 else xs[k + 1])) < 1.5 if vx is not None else False)
            check(f'{tag}: practice tests: the cursor snaps to the nearest test day (before / after the midpoint)', snaps and all(snaps), snaps)
            tipv = pg.evaluate("document.querySelector('.ctip').innerText")
            check(f'{tag}: practice tests: the tooltip shows that test score', 'Score' in tipv, tipv)
            # fluid: spaced repetition follows the cursor continuously
            pg.evaluate("goView('sr')"); pg.wait_for_timeout(300)
            el = pg.locator('#srGrid .srcard .chart svg').first; el.scroll_into_view_if_needed(); pg.wait_for_timeout(200); bb = el.bounding_box()
            pos = []
            for fx in (.30, .305, .31):
                pg.mouse.move(bb['x'] + bb['width'] * fx, bb['y'] + bb['height'] * .5); pg.wait_for_timeout(50)
                pos.append(pg.evaluate("+document.querySelector('#srGrid .hov .hx').getAttribute('x1')"))
            check(f'{tag}: spaced repetition: the crosshair moves fluidly (no jumps between days)', pos[0] < pos[1] < pos[2], pos)
            # histogram highlight
            pg.evaluate("goView('sr','tests')"); pg.wait_for_timeout(300)
            hover(pg, '#distChart svg rect.s-hbar', .5, .5); pg.wait_for_timeout(300)
            check(f'{tag}: histogram: the bar under the cursor is highlighted, the others dimmed', pg.evaluate("document.querySelectorAll('#distChart .hovon').length") == 1 and pg.evaluate("getComputedStyle([...document.querySelectorAll('#distChart rect[data-bin]')].find(r=>!r.classList.contains('hovon'))).opacity") == '0.35')
            # dashboard: preview (yes), mini charts (no)
            pg.mouse.move(3, 3); pg.wait_for_timeout(100)
            r = hover(pg, '#prevChart svg', .4, setup="goView('dash')")
            check(f'{tag}: dashboard spaced-repetition preview has the hover', r['tip'] is not None and r['dots'] >= 1, r)
            r = hover(pg, '#tsSpark svg', .5)
            check(f'{tag}: dashboard mini charts stay clean (no hover)', r['tip'] is None and r['dots'] == 0, r)
            r = hover(pg, '#volMini svg', .5)
            check(f'{tag}: dashboard volume mini chart stays clean', r['tip'] is None, r)
            pg.click('#volOpen'); pg.wait_for_timeout(350)
            r = hover(pg, '#volBig svg', .7)
            exp = pg.evaluate("rangeSeries(volRange).map(x=>x.q)")
            check(f'{tag}: full volume chart (dialog): questions of the week under the cursor', r['tip'] and ' q' in r['tip'] and any(f"{v:,} q" in r['tip'] for v in exp), (r, exp))
            pg.click('#volClose'); pg.wait_for_timeout(150)
            pg.mouse.move(5, 5); pg.wait_for_timeout(100)
            check(f'{tag}: leaving a chart removes the tooltip and lines', pg.evaluate("document.querySelector('.ctip').hidden&&!document.querySelector('.hov')"))
            # interval for all small topic charts
            pg.evaluate("goView('sr')"); pg.wait_for_timeout(300)
            check(f'{tag}: interval selector for the topic charts next to the filters (8 options)', pg.evaluate("document.querySelectorAll('[data-srcr] button').length") == 8 and pg.is_visible('[data-srcr]'))
            before = pg.evaluate("[...document.querySelectorAll('#srGrid .srcard svg')].map(s=>s.dataset.hx0)")
            top_before = pg.evaluate("document.querySelector('#fcChart svg').innerHTML.length")
            pg.click('[data-srcr] button[data-scr="7d"]'); pg.wait_for_timeout(300)
            after = pg.evaluate("[...document.querySelectorAll('#srGrid .srcard svg')].map(s=>s.dataset.hx0)")
            check(f'{tag}: choosing 7D changes ALL small topic charts at once', before and all(float(a) >= float(b_) for a, b_ in zip(after, before)) and after != before and pg.evaluate("document.querySelector('[data-srcr] button.on').dataset.scr") == '7d', (before[:3], after[:3]))
            check(f'{tag}: … and leaves the main chart as it was', pg.evaluate("document.querySelector('#fcChart svg').innerHTML.length") == top_before)
            pg.reload(); pg.wait_for_timeout(500); pg.evaluate("goView('sr')"); pg.wait_for_timeout(300)
            check(f'{tag}: the topic-chart interval is remembered', pg.evaluate("document.querySelector('[data-srcr] button.on').dataset.scr") == '7d')
            pg.click('[data-srcr] button[data-scr="1m"]')
            check(f'{tag}: no JavaScript errors', not errs, errs)
            c.close()
        # touch: no hover UI
        c = b.new_context(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA); pg = c.new_page()
        pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(400); pg.evaluate("goView('sr')"); pg.wait_for_timeout(300)
        el = pg.locator('#fcChart svg'); el.scroll_into_view_if_needed(); pg.wait_for_timeout(200); bb = el.bounding_box()
        cx, cy = bb['x'] + bb['width'] * .4, bb['y'] + bb['height'] * .5
        cdp = c.new_cdp_session(pg)
        def touch(kind, x, y): cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind == 'touchEnd' else [{'x': x, 'y': y}]})
        touch('touchStart', cx, cy); pg.wait_for_timeout(120)
        check(f'{f} · phone: tapping a chart shows the point (crosshair, dots, values)', not pg.evaluate("document.querySelector('.ctip').hidden") and pg.evaluate("document.querySelectorAll('.hov .hdot').length") >= 1)
        x1 = pg.evaluate("+document.querySelector('.hov .hx').getAttribute('x1')")
        for k in range(1, 6): touch('touchMove', cx + k * 12, cy); pg.wait_for_timeout(30)
        x2 = pg.evaluate("+document.querySelector('.hov .hx').getAttribute('x1')")
        check(f'{f} · phone: dragging the finger sideways scrubs along the chart', x2 > x1, (x1, x2))
        tb = pg.evaluate("document.querySelector('.ctip').getBoundingClientRect().bottom")
        check(f'{f} · phone: the box sits above the finger and inside the screen', tb < cy and pg.evaluate("(()=>{const r=document.querySelector('.ctip').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()"), tb)
        touch('touchEnd', 0, 0); pg.wait_for_timeout(80)
        pg.tap('.brand'); pg.wait_for_timeout(120)
        check(f'{f} · phone: tapping elsewhere closes it', pg.evaluate("document.querySelector('.ctip').hidden"))
        check(f'{f} · phone: charts keep vertical page scrolling (pan-y)', pg.evaluate("getComputedStyle(document.querySelector('#fcChart svg')).touchAction") == 'pan-y')
        check(f'{f} · phone: topic-chart interval selector fits the screen', pg.evaluate('document.documentElement.scrollWidth') == 402)
        vb = pg.evaluate("[document.querySelector('#fcChart svg').viewBox.baseVal.width,document.getElementById('fcChart').clientWidth]")
        cards = pg.evaluate("[...document.querySelectorAll('#srGrid .srcard .chart')].filter(b=>b.querySelector('svg')).map(b=>[b.querySelector('svg').viewBox.baseVal.width,b.clientWidth])")
        check(f'{f} · phone: every small topic chart is drawn at its real width (not shrunk from 520 px)', cards and all(abs(a - b_) <= 2 for a, b_ in cards), cards[:3])
        check(f'{f} · phone: question-bank chart drawn at the real width', abs(vb[0] - vb[1]) <= 2, vb)
        c.close()
    b.close()
ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} hover tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
