"""User guide: the built pages in docs/ (English default, Portuguese, Japanese), the header button that opens the
guide in the app's language, the link on the tour's last step, and the new app name. Desktop, laptop, iPad mini
and iPhone — personal and demo."""
import os, re, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs')
BASE = 'https://matheuscgh-ops.github.io/ppl-flight-deck/docs/'
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('iPad', dict(viewport={'width': 1024, 'height': 1366}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA)),
       ('small phone', dict(viewport={'width': 375, 'height': 667}, is_mobile=True, has_touch=True, user_agent=UA))]
URL = {'en': BASE, 'pt': BASE + 'pt.html', 'ja': BASE + 'ja.html'}
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:240]))

# ---------- static checks on the built guide ----------
pages = {n: open(os.path.join(DOCS, n), encoding='utf-8').read() for n in ('index.html', 'pt.html', 'ja.html')}
ids = {n: re.findall(r'\bid="([^"]+)"', s) for n, s in pages.items()}
check('docs: English is the default page (index.html), with pt and ja pages', '<html lang="en">' in pages['index.html'] and '<html lang="pt-BR">' in pages['pt.html'] and '<html lang="ja">' in pages['ja.html'])
check('docs: the three languages have the same sections (same ids, same order)', ids['index.html'] == ids['pt.html'] == ids['ja.html'] and len(ids['index.html']) >= 15, ids)
for n, s in pages.items():
    imgs = re.findall(r'src="(img/[^"]+)"', s)
    check(f'docs {n}: every screenshot exists', imgs and all(os.path.exists(os.path.join(DOCS, i)) for i in imgs), [i for i in imgs if not os.path.exists(os.path.join(DOCS, i))])
    check(f'docs {n}: every in-page link points to a section', all(h in ids[n] for h in re.findall(r'href="#([^"]+)"', s)))
    check(f'docs {n}: language switcher links all three pages and marks this one', all(f'href="{x}"' in s for x in ('index.html', 'pt.html', 'ja.html')) and s.count('aria-current="page"') == 1)
    check(f'docs {n}: new name, no leftover placeholders, no token', 'PPL Progress' in s and 'Flight Deck</' not in s and '@@' not in s.replace('@@FILE@@', '') and 'ghp_' not in s)
check('docs: the screenshots are the same set in every language', len({tuple(sorted({os.path.basename(x) for x in re.findall(r'src="(img/[^"]+)"', s)})) for s in pages.values()}) == 1)
for n, l in (('index.html', 'en'), ('pt.html', 'pt'), ('ja.html', 'ja')):
    check(f'docs {n}: screenshots are in its own language (img/{l}/)', all(x.startswith(f'img/{l}/') for x in re.findall(r'src="(img/[^"]+)"', pages[n])))
    check(f'docs {n}: has the science chapter with formulas, references and the Cal Newport principles', 'id="science"' in pages[n] and pages[n].count('doi.org') >= 6 and 'Newport' in pages[n] and 'id="sci-newport"' in pages[n])

with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------- the guide renders on every screen ----------
    for mode, opts in DEV:
        c = b.new_context(**opts); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        for n in pages:
            pg.goto('file://' + os.path.join(DOCS, n)); pg.wait_for_timeout(150)
            W = opts['viewport']['width']
            check(f'docs {n} · {mode}: no sideways scrolling', pg.evaluate('document.documentElement.scrollWidth') <= W, pg.evaluate('document.documentElement.scrollWidth'))
            check(f'docs {n} · {mode}: language switcher visible', pg.is_visible('.langs'))
        # switching language keeps the section being read
        pg.goto('file://' + os.path.join(DOCS, 'index.html') + '#plans'); pg.wait_for_timeout(100)
        pg.click('.langs a[href="ja.html"]'); pg.wait_for_timeout(250)
        check(f'docs · {mode}: switching language keeps the section (#plans)', pg.url.endswith('ja.html#plans'), pg.url)
        check(f'docs · {mode}: no script errors', not errs, errs)
        c.close()

    # ---------- app: header button, tour link, name ----------
    for f in ['index', 'demo']:
        for mode, opts in DEV:
            tag = f'{f} · {mode}'; W = opts['viewport']['width']
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: errs.append('browser dialog: ' + d.message) or d.dismiss())
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(500)
            ev = pg.evaluate
            ev("window.pplTour&&pplTour.end()"); pg.wait_for_timeout(100)
            check(f'{tag}: the app is called PPL / PROGRESS', 'PPL / PROGRESS' in pg.inner_text('.brand') and pg.title().startswith('PPL Progress'), pg.title())
            for l in ['en', 'pt', 'ja']:
                pg.click(f'.flag[data-lang="{l}"]'); pg.wait_for_timeout(120)
                href = pg.get_attribute('#docsLink', 'href')
                check(f'{tag} [{l}]: the docs button opens the guide in the app language', href == URL[l], href)
            check(f'{tag}: the docs button opens in a new tab, safely', pg.get_attribute('#docsLink', 'target') == '_blank' and 'noopener' in pg.get_attribute('#docsLink', 'rel'))
            r = ev("(()=>{const e=document.getElementById('docsLink'),r=e.getBoundingClientRect();return {v:e.offsetParent!==null,l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width}})()")
            check(f'{tag}: the docs button is visible and inside the screen', r['v'] and r['l'] >= 0 and r['r'] <= W and r['w'] >= 30, r)
            # no overlap with the other header controls
            boxes = ev("""[...document.querySelectorAll('#docsLink,#setOpen,.flags,.brand,#syncChip,#demoBadge,.tabs')].filter(e=>e.offsetParent!==null&&getComputedStyle(e).display!=='none').map(e=>{let r=e.getBoundingClientRect();if(e.classList.contains('brand')){const g=document.createRange();g.selectNodeContents(e);r=g.getBoundingClientRect()}return [e.id||e.className,r.left,r.top,r.right,r.bottom]})""")
            d = [x for x in boxes if x[0] == 'docsLink'][0]
            over = [x[0] for x in boxes if x[0] != 'docsLink' and not (x[3] <= d[1] + 0.5 or x[1] >= d[3] - 0.5 or x[4] <= d[2] + 0.5 or x[2] >= d[4] - 0.5)]
            check(f'{tag}: the docs button overlaps nothing in the header', not over, over)
            check(f'{tag}: header controls stay on one line (no wrapped gear)', W <= 640 or abs(ev("document.getElementById('setOpen').getBoundingClientRect().top") - ev("document.querySelector('.flags').getBoundingClientRect().top")) < 6)
            phone = W <= 640
            check(f'{tag}: {"icon only on phones and tablets" if W < 1280 else "icon and label on desktop"}', (not pg.is_visible('#docsLink span')) if W < 1280 else pg.is_visible('#docsLink span'))
            check(f'{tag}: page fits the screen', ev('document.documentElement.scrollWidth') <= W)
            if f == 'demo':
                for l in ['en', 'pt', 'ja']:
                    pg.click(f'.flag[data-lang="{l}"]'); pg.wait_for_timeout(100)
                    ev("pplTour.start()"); pg.wait_for_timeout(200); ev("pplTour.go(pplTour.steps-1)"); pg.wait_for_timeout(300)
                    a = pg.query_selector('.tour-card .tdocs')
                    check(f'{tag} [{l}]: the tour\'s last step links to the guide in the same language', a and a.get_attribute('href') == URL[l] and a.get_attribute('target') == '_blank' and pg.is_visible('.tour-card .tdocs'), a and a.get_attribute('href'))
                    ev("pplTour.go(0)"); pg.wait_for_timeout(150)
                    check(f'{tag} [{l}]: only the last step has the link', not pg.query_selector('.tour-card .tdocs'))
                    ev("pplTour.end()"); pg.wait_for_timeout(100)
            check(f'{tag}: no script errors or browser pop-ups', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} docs tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
