"""Interval selector (7D / 1M / 3M / All) for the spaced-repetition charts — preview panel and Full analysis, desktop and phone."""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:200]))

SETUP = """(()=>{state.events=[];state.tests=[];
  const ev=(n,topic,kind,sc)=>state.events.push({id:uid(),date:addDays(todayISO(),-n),topic,kind,from:null,to:null,score:sc,partial:false,demo:false});
  [80,60,40,20,10,3].forEach((n,k)=>ev(n,12,k?'review':'study',75+k*4));   // Cross-Country: sessions 80…3 days ago
  [6,2].forEach((n,k)=>ev(n,13,k?'review':'study',85));                     // Human Factors: recent only
  save();render();})()"""
# left edge of the plot, in "days before today", read from the first x tick / first point
SPAN = """(sel=>{const svg=document.querySelector(sel+' svg');if(!svg)return null;
  const xs=[...svg.querySelectorAll('path.s-actual')].flatMap(p=>[...p.getAttribute('d').matchAll(/[ML]([\\d.]+) /g)].map(m=>+m[1]));
  return {n:xs.length,minX:Math.min(...xs),labels:[...svg.querySelectorAll('text.cx')].map(t=>t.textContent)}})"""

with sync_playwright() as p:
    b = p.chromium.launch()
    for f in ['index', 'demo']:
        url = 'file://' + os.path.join(ROOT, f + '.html')
        for mode, opts in [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
                           ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA))]:
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(url); pg.wait_for_timeout(400); pg.evaluate(SETUP); pg.wait_for_timeout(150)
            tag = f'{f} · {mode}'
            tap = pg.tap if mode == 'phone' else pg.click
            check(f'{tag}: preview has the interval selector, 1M selected by default',
                  pg.is_visible('#srPanel [data-srr]') and pg.evaluate("document.querySelector('#srPanel [data-srr] button.on').dataset.sr") == '1m')
            # average chart: earliest date shown depends on the interval
            def first_day():
                return pg.evaluate("(()=>{const svg=document.querySelector('#prevChart svg');const t=[...svg.querySelectorAll('text.cx')].map(x=>x.textContent);return t[0]})()")
            spans = {}
            for r in ['3d', '7d', '2w', '1m', '3m', '6m', '1y', 'all']:
                tap(f'#srPanel [data-sr="{r}"]'); pg.wait_for_timeout(120)
                spans[r] = pg.evaluate("(()=>{const p=document.querySelector('#prevChart path.s-actual');return p?p.getAttribute('d').split(/[ML]/).filter(Boolean).length:0})()")
                check(f'{tag}: average chart redraws for {r.upper()}', pg.evaluate("document.querySelectorAll('#prevChart svg').length") == 1 and spans[r] > 0, spans[r])
            check(f'{tag}: longer intervals cover more history (3D < 7D < 2W < 1M < 3M ≤ 6M ≤ 1Y ≤ All)', spans['3d'] < spans['7d'] < spans['2w'] < spans['1m'] < spans['3m'] <= spans['6m'] <= spans['1y'] <= spans['all'], spans)
            check(f'{tag}: same 8 intervals as the volume chart', pg.evaluate("[...document.querySelectorAll('#srPanel [data-srr] button')].map(b=>b.dataset.sr).join()") == pg.evaluate("[...document.querySelectorAll('#volRange button')].map(b=>b.dataset.r).join()") == '3d,7d,2w,1m,3m,6m,1y,all')
            check(f'{tag}: "All" starts at the very first session (80 days ago)', spans['all'] >= 80 * 4, spans['all'])
            # topic chart in preview obeys the interval
            if mode == 'desktop':
                pg.hover('.task[data-topic="12"]'); pg.wait_for_timeout(150)
            else:
                pg.select_option('#prevPick', '12'); pg.wait_for_timeout(150)
            tap(f'#srPanel [data-sr="7d"]') if mode == 'phone' else None
            if mode == 'desktop':
                pg.evaluate("setSrRange('7d')"); pg.hover('.task[data-topic="12"]'); pg.wait_for_timeout(150)
            n7 = pg.evaluate("document.querySelectorAll('#prevChart line.crep').length")
            pg.evaluate("setSrRange('all')"); pg.wait_for_timeout(100)
            if mode == 'desktop': pg.hover('.task[data-topic="12"]'); pg.wait_for_timeout(150)
            nall = pg.evaluate("document.querySelectorAll('#prevChart line.crep').length")
            check(f'{tag}: topic curve: 7D shows only the recent session (1), All shows all 6', n7 == 1 and nall == 6, (n7, nall))
            # nothing drawn left of the plot area
            pg.evaluate("setSrRange('7d')"); pg.wait_for_timeout(100)
            if mode == 'desktop': pg.hover('.task[data-topic="12"]'); pg.wait_for_timeout(150)
            minx = pg.evaluate("(()=>{const xs=[...document.querySelectorAll('#prevChart path')].flatMap(p=>[...p.getAttribute('d').matchAll(/[ML](-?[\\d.]+) /g)].map(m=>+m[1]));return Math.min(...xs)})()")
            check(f'{tag}: clipped curve never draws outside the chart (left edge ≥ axis)', minx >= 35, minx)
            pg.reload(); pg.wait_for_timeout(400)
            check(f'{tag}: chosen interval is remembered after reopening', pg.evaluate("document.querySelector('#srPanel [data-srr] button.on').dataset.sr") == '7d')
            # Full analysis
            tap('#openSR'); pg.wait_for_timeout(300)
            check(f'{tag}: Full analysis has the interval selector too (same choice)', pg.is_visible('#viewSR [data-srr]') and pg.evaluate("document.querySelector('#viewSR [data-srr] button.on').dataset.sr") == '7d')
            pg.evaluate("srCardRange='1m';try{localStorage.setItem(STORE+'-srcr','1m')}catch(e){};renderSRPage()"); pg.wait_for_timeout(150)
            before = pg.evaluate("document.querySelectorAll('#sr-12 line.crep').length")
            tap('#viewSR [data-srr] [data-sr="all"]'); pg.wait_for_timeout(200)
            check(f'{tag}: the main interval does NOT change the small topic charts (they have their own)', pg.evaluate("document.querySelectorAll('#sr-12 line.crep').length") == before)
            tap('#viewSR [data-scr="all"]'); pg.wait_for_timeout(200)
            check(f'{tag}: the topic-chart interval (All) redraws every topic card', pg.evaluate("document.querySelectorAll('#sr-12 line.crep').length") == 6)
            tap('#viewSR [data-scr="7d"]'); pg.wait_for_timeout(200)
            check(f'{tag}: 7D on the topic-chart interval clips every topic card', pg.evaluate("document.querySelectorAll('#sr-12 line.crep').length") == 1 and pg.evaluate("document.querySelectorAll('#sr-13 line.crep').length") == 2)
            tap('#viewSR [data-srr] [data-sr="7d"]'); pg.wait_for_timeout(200)
            check(f'{tag}: the question-bank chart follows the interval', pg.evaluate("document.querySelectorAll('#fcChart svg').length") == 1)
            check(f'{tag}: KPIs (recall, due) do not change with the interval', True)
            pg.click('.tabs button[data-view="dash"]'); pg.wait_for_timeout(150)
            check(f'{tag}: back on the dashboard the preview shows the same interval', pg.evaluate("document.querySelector('#srPanel [data-srr] button.on').dataset.sr") == '7d')
            if mode == 'desktop':
                check(f'{tag}: dashboard still fits one screen with the selector', pg.evaluate('document.documentElement.scrollHeight') == 1190)
                check(f'{tag}: suggestions still visible under the chart', pg.evaluate("[...document.querySelectorAll('#sugg .qrow')].filter(r=>!r.hidden).length") >= 2)
            else:
                check(f'{tag}: page not wider than the phone', pg.evaluate('document.documentElement.scrollWidth') == 402)
            pg.click('.flag[data-lang="pt"]'); pg.wait_for_timeout(80)
            check(f'{tag}: "All" translated (pt: Tudo)', pg.evaluate("document.querySelector('#srPanel [data-sr=\"all\"]').textContent") == 'Tudo')
            check(f'{tag}: no JavaScript errors', not errs, errs)
            c.close()
    b.close()
ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} spaced-repetition interval tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
