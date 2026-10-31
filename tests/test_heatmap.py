"""Statistics › Question bank layout and the heat map by topic: top row (forecast · where you lose · needs-recall carousel),
compact heat map of today (tiles, coldest first) with its history dialog (interval toggle, colors, hover / tap details),
study volume always open on the page. All devices, both files."""
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
SETUP = """(()=>{const T=todayISO(),D=n=>addDays(T,-n),ev=(n,topic,sc)=>({id:'hm'+topic+'_'+n,date:D(n),topic,kind:'review',from:null,to:null,score:sc,partial:false,demo:false});
  state.statuses=TOPICS.map(()=> 'Todo');state.statuses[18]='Not Comfortable';state.statuses[12]='Very Comfortable';
  state.events=[ev(40,18,60),ev(30,18,70),ev(20,18,80),ev(35,12,95),ev(3,12,96)];save();render();})()"""
with sync_playwright() as p:
    b = p.chromium.launch()
    for f in ['index', 'demo']:
        for mode, opts in DEV:
            tag = f'{f} · {mode}'; touch = mode in ('phone', 'iPad mini'); W = opts['viewport']['width']
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(400)
            ev = pg.evaluate; tap = pg.tap if touch else pg.click
            ev(SETUP); ev("goView('sr')"); pg.wait_for_timeout(400)
            order = ev("[...document.querySelectorAll('#statBank > *')].map(x=>x.id||x.className.split(' ')[0])")
            check(f'{tag}: layout: top row (forecast · where you lose · needs recall), then heat map + study volume', order[:2] == ['stattrio', 'statduo'] and ev("[...document.querySelectorAll('#statBank > .stattrio > section')].map(x=>x.id).join()") == 'fcSection,fcLostPanel,scPanel' and ev("[...document.querySelectorAll('#statBank > .statduo > section')].map(x=>x.id).join()") == 'heatPanel,volPanel', order)
            boxes = ev("['fcSection','fcLostPanel','scPanel','heatPanel','volPanel'].map(id=>{const b=document.getElementById(id).getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.width)]})")
            if W >= 1400:
                check(f'{tag}: wide screens: the three top cards share one row, each under 45% of the width', len({x[1] for x in boxes[:3]}) == 1 and all(x[2] < W * .45 for x in boxes[:3]), boxes)
            if W >= 1100:
                check(f'{tag}: heat map and study volume side by side', boxes[3][1] == boxes[4][1] and boxes[4][0] > boxes[3][0], boxes)
            else:
                check(f'{tag}: tablet/phone: cards stacked', all(boxes[k + 1][1] > boxes[k][1] for k in range(4)), boxes)
            check(f'{tag}: the 3 spaced-repetition numbers (average recall, due, tracked) are in the heat map header', ev("document.querySelectorAll('#heatPanel #srKpis b').length") == 3)
            # compact heat map: today only
            tiles = ev("[...document.querySelectorAll('#heatNow .hnt')].map(x=>({i:+x.dataset.hi,v:x.querySelector('b').textContent,e:x.classList.contains('empty'),bg:getComputedStyle(x).backgroundColor}))")
            check(f'{tag}: compact heat map: one tile per topic (26), no past periods on the page, no legend', len(tiles) == 26 and ev("document.querySelectorAll('#statBank .hmc').length") == 0 and not ev("document.getElementById('heatLegend')"), len(tiles))
            check(f'{tag}: compact: coldest first, topics without history last', tiles[0]['i'] == 18 and tiles[1]['i'] == 12 and all(x['e'] for x in tiles[2:]), tiles[:3])
            h0 = ev("heatAt(18,todayISO())")
            check(f'{tag}: compact tile = heat today, with its color', tiles[0]['v'] == str(h0['heat']) and ev(f"heatColor({h0['heat']})").replace(' ', '') == tiles[0]['bg'].replace(' ', ''), (tiles[0], h0))
            if not touch:
                ev("document.getElementById('heatPanel').scrollIntoView({block:'center'})"); pg.hover('#heatNow .hnt >> nth=0'); pg.wait_for_timeout(150)
                tip = ev("document.querySelector('.ctip').hidden?null:document.querySelector('.ctip').innerText")
                check(f'{tag}: hovering a tile shows topic, heat, recall and last score', tip and ev("TOPICS[18].name") in tip and str(h0['heat']) in tip and 'Recall' in tip, tip)
                pg.mouse.move(3, 3); pg.wait_for_timeout(100)
            check(f'{tag}: history dialog closed until you click the card', not pg.is_visible('#heatbg'))
            tap('#heatNow .hnt >> nth=3'); pg.wait_for_timeout(250)
            check(f'{tag}: clicking the card opens the history dialog with filters', pg.is_visible('#heatbg') and ev("document.querySelectorAll('#heatbg [data-heatr] button').length") == 5)
            # needs-recall carousel and study volume on the page
            check(f'{tag}: needs-recall carousel shows a topic from today\'s plan (same pick as the dashboard)', ev("(()=>{const L=carList().filter(i=>i!=null);const n=document.getElementById('scTitle').textContent;return L.length?L.some(i=>TOPICS[i].name===n):!!n})()"), ev("document.getElementById('scTitle').textContent"))
            check(f'{tag}: carousel draws the topic curve', ev("document.querySelectorAll('#scChart svg').length") == 1)
            check(f'{tag}: study volume already open on the page (total, chart, 8 intervals)', ev("document.querySelectorAll('#svBig circle.vdot').length") == 13 and ev("document.querySelectorAll('#svRange button').length") == 8 and ev("document.getElementById('svTotal').textContent") == ev("fmt(rangeSeries('3m').reduce((a,x)=>a+x.q,0))"))
            for r, n in [('2w', 14), ('1m', 30), ('3m', 13), ('6m', 26), ('1y', 12)]:
                tap(f'[data-heatr] [data-hr="{r}"]'); pg.wait_for_timeout(150)
                cols = ev("document.querySelector('#heatGrid .hmrow:not(.hmhead)').querySelectorAll('.hmc').length")
                check(f'{tag}: {r.upper()} → {n} squares per topic', cols == n, cols)
            tap('[data-heatr] [data-hr="1y"]'); pg.wait_for_timeout(150)
            labs = [x for x in ev("[...document.querySelectorAll('#heatGrid .hmhead .hmh')].map(x=>x.textContent)") if x]
            check(f'{tag}: 1Y month labels never repeat', len(labs) == len(set(labs)), labs)
            check(f'{tag}: the heat map never makes the page wider than the screen', ev('document.documentElement.scrollWidth') == W)
            tap('[data-heatr] [data-hr="3m"]'); pg.wait_for_timeout(150)
            if mode == 'desktop':
                check(f'{tag}: squares show their number when there is room', ev("document.querySelector('#heatGrid .hmc:not(.empty)').textContent.trim()") != '')
            if mode == 'phone':
                tap('[data-heatr] [data-hr="1m"]'); pg.wait_for_timeout(150)
                check(f'{tag}: small squares (1M on a phone) show color only', ev("[...document.querySelectorAll('#heatGrid .hmc:not(.empty)')].every(x=>x.textContent.trim()==='')"))
                tap('[data-heatr] [data-hr="3m"]'); pg.wait_for_timeout(150)
            # heat value and color follow the formula
            last = ev("(()=>{const r=document.querySelector('#heatGrid .hmrow:nth-child(2)'),cs=[...r.querySelectorAll('.hmc')];const c=cs[cs.length-1];return {i:+c.dataset.hi,bg:getComputedStyle(c).backgroundColor}})()")
            h = ev(f"heatAt({last['i']},todayISO())")
            check(f'{tag}: heat = chance of a right answer (score × recall + 1/3 × (1 − recall))', h['heat'] == round(100 * (h['score'] / 100 * h['R'] + (1 - h['R']) / 3)), h)
            check(f'{tag}: last square = heat today with its color', h and ev(f"heatColor({h['heat']})").replace(' ', '') == last['bg'].replace(' ', ''), (h, last))
            check(f'{tag}: a topic left alone cools (Weather: last review 20 days ago is colder than the week it was reviewed)', ev("heatAt(18,addDays(todayISO(),-20)).heat") > ev("heatAt(18,todayISO()).heat"))
            # hover / tap
            ev("document.getElementById('heatPanel').scrollIntoView({block:'center'})"); pg.wait_for_timeout(200)
            sel = '#heatGrid .hmrow:nth-child(2) .hmc:not(.empty) >> nth=-1'
            if touch: pg.tap(sel)
            else: pg.hover(sel)
            pg.wait_for_timeout(200)
            tip = ev("document.querySelector('.ctip').hidden?null:document.querySelector('.ctip').innerText")
            check(f'{tag}: {"tapping" if touch else "hovering"} a square shows topic, period, heat, recall, last score and the change', tip and ev("TOPICS[18].name") in tip and str(h['heat']) in tip and 'Chance of a right answer' in tip and 'Recall' in tip and 'Last score' in tip and ('cooling' in tip or 'warming' in tip or 'steady' in tip), tip)
            check(f'{tag}: the square is highlighted', ev("document.querySelectorAll('#heatGrid .hmc.hovon').length") == 1)
            if not touch:
                pg.mouse.move(3, 3); pg.wait_for_timeout(120)
                check(f'{tag}: moving away hides the details', ev("document.querySelector('.ctip').hidden"))
            tap('[data-heatr] [data-hr="6m"]')
            if not touch:
                pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
                check(f'{tag}: Escape closes the history dialog', not pg.is_visible('#heatbg'))
            else:
                tap('#heatClose'); pg.wait_for_timeout(100)
                check(f'{tag}: the close button closes the history dialog', not pg.is_visible('#heatbg'))
            pg.reload(); pg.wait_for_timeout(400); ev("goView('sr')"); pg.wait_for_timeout(300)
            check(f'{tag}: the interval choice is remembered', ev("document.querySelector('[data-heatr] button.on').dataset.hr") == '6m')
            ev("heatRange='3m';try{localStorage.setItem(STORE+'-heatr','3m')}catch(e){}")
            pg.click('.flag[data-lang="pt"]'); pg.wait_for_timeout(150)
            check(f'{tag}: Portuguese title', 'mapa de calor' in pg.inner_text('#heatPanel').lower())
            pg.click('.flag[data-lang="en"]')
            check(f'{tag}: no JavaScript errors', not errs, errs)
            c.close()
    # demo data covers every interval
    c = b.new_context(viewport={'width': 1440, 'height': 900}); pg = c.new_page()
    pg.goto('file://' + os.path.join(ROOT, 'demo.html')); pg.wait_for_timeout(500); pg.evaluate("window.pplTour&&pplTour.end()"); pg.evaluate("goView('sr')"); pg.wait_for_timeout(400)
    check('demo: compact heat map fully covered (26 tiles with a value)', pg.evaluate("document.querySelectorAll('#heatNow .hnt:not(.empty)').length") == 26)
    t0 = pg.evaluate("document.getElementById('scTitle').textContent"); pg.mouse.move(3, 3); pg.wait_for_timeout(3300)
    check('demo: the needs-recall carousel turns every 3 s', pg.evaluate("document.getElementById('scTitle').textContent") != t0, t0)
    pg.hover('#scPanel'); t1 = pg.evaluate("document.getElementById('scTitle').textContent"); pg.wait_for_timeout(3300)
    check('demo: … and pauses while the pointer is over it', pg.evaluate("document.getElementById('scTitle').textContent") == t1)
    pg.mouse.move(3, 3); pg.click('#heatPanel'); pg.wait_for_timeout(200)
    for r in ['2w', '1m', '3m', '6m', '1y']:
        pg.click(f'[data-heatr] [data-hr="{r}"]'); pg.wait_for_timeout(200)
        check(f'demo: heat map fully covered at {r.upper()} (26 topics, no empty square)', pg.evaluate("document.querySelectorAll('#heatGrid .hmc.empty').length") == 0 and pg.evaluate("document.querySelectorAll('#heatGrid .hmrow:not(.hmhead)').length") == 26)
    c.close()
    b.close()
ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} heat map tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
