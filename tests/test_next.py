"""The design layer (both apps, html.nx). Checks that the layer restyles without changing
behaviour: unit tests pass, every tab opens from its control, dialogs open and close, nothing overflows, no errors — and
the design itself: dark slate palette, sentence-case labels, a glass header that stays on top (desktop), a glass tab bar at
the bottom within thumb reach (phones), the next-up bar above it. Desktop, laptop, iPad mini and iPhone."""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA))]
VIEWS = [('dash', 'viewDash'), ('plan', 'viewPlan'), ('errors', 'viewErrors'), ('tests', 'viewTests'), ('sr', 'viewSR')]
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:300]))

with sync_playwright() as p:
    b = getattr(p, os.environ.get("PPL_BROWSER", "chromium")).launch()
    for f, mode, opts in [(f, m, o) for f in os.environ.get('PPL_FILES', 'index demo').split() for m, o in DEV]:
        tag = f'{f} · {mode}'; W = opts['viewport']['width']; H = opts['viewport']['height']; touch = opts.get('has_touch'); phone = W <= 640
        c = b.new_context(**opts); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: errs.append('browser dialog: ' + d.message) or d.dismiss())
        pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(600)
        ev = pg.evaluate
        ev("window.pplTour&&pplTour.end()"); ev("goView('dash')"); pg.wait_for_timeout(200)
        tap = (lambda s: pg.tap(s)) if touch else (lambda s: pg.click(s))

        check(f'{tag}: the logo (navigation arrow) is in the header and is the tab icon', 'svg' in ev("getComputedStyle(document.querySelector('.brand'),'::before').maskImage || getComputedStyle(document.querySelector('.brand'),'::before').webkitMaskImage") and '21365c' in ev("document.querySelector('link[rel=icon]').getAttribute('href')"))
        r = ev("selfTest()")
        check(f'{tag}: the built-in unit tests all pass', all(x['pass'] for x in r), [x['name'] for x in r if not x['pass']])
        if f == 'demo': check(f'{tag}: the demo keeps its own storage key', ev("BUILD.demo") is True and 'demo' in ev("STORE"), ev("STORE"))
        else: check(f'{tag}: the personal app keeps its storage key (your data)', ev("BUILD.demo") is False and 'demo' not in ev("STORE"), ev("STORE"))
        check(f'{tag}: the design layer is on (html.nx) and the page is dark', ev("document.documentElement.classList.contains('nx')") and ev("getComputedStyle(document.body).backgroundColor") == 'rgb(19, 23, 29)', ev("getComputedStyle(document.body).backgroundColor"))
        check(f'{tag}: section titles are in sentence case (not upper case)', ev("getComputedStyle(document.querySelector('.section')).textTransform") == 'none')

        bar = ev("(()=>{const r=document.querySelector('.tabs').getBoundingClientRect();return {top:r.top,bottom:r.bottom,pos:getComputedStyle(document.querySelector('.tabs')).position}})()")
        if phone:
            check(f'{tag}: the tabs are a bar at the bottom of the screen', bar['pos'] == 'fixed' and H - 120 < bar['top'] and bar['bottom'] <= H, bar)
            ico = ev("getComputedStyle(document.querySelector('.tabs button'),'::before').maskImage || getComputedStyle(document.querySelector('.tabs button'),'::before').webkitMaskImage")
            check(f'{tag}: each tab has an icon', ico and 'svg' in ico, ico)
            nb = ev("(()=>{const n=document.getElementById('nowBar');if(n.hidden)return null;return n.getBoundingClientRect().bottom})()")
            check(f'{tag}: the next-up bar sits above the tab bar', nb is None or nb <= bar['top'] + 1, (nb, bar))
            ev("window.scrollTo(0, 400)"); pg.wait_for_timeout(100)
            check(f'{tag}: the tab bar stays in place while scrolling', abs(ev("document.querySelector('.tabs').getBoundingClientRect().top") - bar['top']) < 1)
            ev("window.scrollTo(0, 0)")
        else:
            ev("goView('sr')"); pg.wait_for_timeout(200); ev("window.scrollTo(0, 600)"); pg.wait_for_timeout(100)
            check(f'{tag}: the header (with the tabs) stays on top while scrolling', ev("scrollY") > 0 and ev("document.querySelector('header.top').getBoundingClientRect().top") == 0, ev("[scrollY, document.querySelector('header.top').getBoundingClientRect().top]"))
            ev("goView('dash')"); pg.wait_for_timeout(150)
            ev("window.scrollTo(0, 0)")
            nb = ev("(()=>{const n=document.getElementById('nowBar');return {inHead:!!n.closest('header.top'),shown:!n.hidden&&getComputedStyle(n).display!=='none'}})()")
            check(f'{tag}: the next-up bar is in the header (computers and tablets too)', nb['inHead'] and nb['shown'], nb)
            tap('#nowOpen'); pg.wait_for_timeout(1300)
            check(f'{tag}: its play button opens focus mode and the stopwatch runs', not ev("document.getElementById('focusbg').hidden") and ev("document.getElementById('focusClock').textContent") not in ('', '0:00'), ev("document.getElementById('focusClock').textContent"))
            pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
            check(f'{tag}: Escape leaves focus mode', ev("document.getElementById('focusbg').hidden"))
            ev("localStorage.removeItem(STORE+'-focus')")
            check(f'{tag}: only the header is styled as the header (not other elements called .top)', ev("getComputedStyle(document.querySelector('.statduo.top')).position") != 'sticky')

        for v, vid in VIEWS:
            tap(f'.tabs button[data-view="{v}"]'); pg.wait_for_timeout(250)
            check(f'{tag}: the "{v}" tab opens its view', not ev(f"document.getElementById('{vid}').hidden") and ev(f"document.querySelector('.tabs button[data-view=\"{v}\"]').classList.contains('on')"))
            check(f'{tag}: "{v}" fits the screen width', ev('document.documentElement.scrollWidth') <= W, ev('document.documentElement.scrollWidth'))
        ev("goView('dash')"); pg.wait_for_timeout(150)

        # dialogs: the log dialog, settings; the tab bar hides behind a dialog on phones
        ev("openModal(18,'review')"); pg.wait_for_timeout(200)
        check(f'{tag}: the log dialog opens', not ev("document.getElementById('modalbg').hidden"))
        if phone: check(f'{tag}: the tab bar steps aside while a dialog is open', ev("getComputedStyle(document.querySelector('.tabs')).visibility") == 'hidden')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        check(f'{tag}: Escape closes it', ev("document.getElementById('modalbg').hidden"))
        tap('#setOpen'); pg.wait_for_timeout(200)
        check(f'{tag}: settings open from the gear', not ev("document.getElementById('setbg').hidden"))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        # a log through the dialog still changes the data as before
        n0 = ev("state.events.length"); ev("openModal(18,'review')"); pg.wait_for_timeout(150)
        pg.fill('#mScore', '77'); tap('#mSave'); pg.wait_for_timeout(250)
        check(f'{tag}: saving a session works as before', ev("state.events.length") == n0 + 1 and ev("state.scores[18]") == 77)
        check(f'{tag}: the toast is a dark glass pill', ev("getComputedStyle(document.getElementById('toast')).borderRadius") == '999px')
        check(f'{tag}: no script errors or browser pop-ups', not errs, errs)
        c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} new-design tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
