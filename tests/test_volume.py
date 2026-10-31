"""Weekly study-volume card (Strava-style): numbers, live updates, big view, layout — personal and demo, desktop and phone."""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond), str(detail)[:200]))

SETUP = """(()=>{
  state.events=[];state.tests=[];
  const ev=(n,topic,kind,extra={})=>state.events.push({id:uid(),date:addDays(todayISO(),-n),topic,kind,from:null,to:null,score:null,partial:false,demo:false,...extra});
  ev(0,13,'study',{score:88});                 // Human Factors 51 q (this week)
  ev(0,22,'review',{score:74});                // Taxiing 38 q (this week)
  ev(0,14,'study',{partial:true});             // in progress → 0
  ev(0,5,'move',{from:'Todo',to:'Doing'});     // move → 0
  ev(7,18,'study',{score:30});                 // Weather 158 q (last week)
  ev(100,1,'study',{score:60});                // 41 q, outside 12 weeks
  state.tests.push({id:uid(),date:todayISO(),q:60,score:80});   // +60 this week
  state.tests.push({id:uid(),date:todayISO(),q:60,score:null}); // in progress → 0
  save();render();
})()"""

with sync_playwright() as p:
    b = p.chromium.launch()
    for f in ['index', 'demo']:
        url = 'file://' + os.path.join(ROOT, f + '.html')
        for mode, opts in [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
                           ('laptop', dict(viewport={'width': 1366, 'height': 768})),
                           ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
                           ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA))]:
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(url); pg.wait_for_timeout(400)
            tag = f'{f} · {mode}'
            check(f'{tag}: volume card shows a 12-week chart with 12 points', pg.evaluate("document.querySelectorAll('#volMini circle.vdot').length") == 12)
            check(f'{tag}: card fits its box (no overflow)', pg.evaluate("(()=>{const c=document.getElementById('volCard');return c.scrollWidth<=c.clientWidth+1})()"))
            check(f'{tag}: page is not wider than the screen', pg.evaluate('document.documentElement.scrollWidth') == opts['viewport']['width'])
            if mode == 'desktop':
                check(f'{tag}: still fits on one screen', pg.evaluate('document.documentElement.scrollHeight') == 1190)
            pg.evaluate(SETUP); pg.wait_for_timeout(150)
            wk = pg.evaluate('weeklyVolume(12).map(x=>x.q)')
            check(f'{tag}: this week = finished sessions + scored test (51+38+60 = 149)', wk[-1] == 149 and pg.inner_text('#volWeek') == '149', wk[-3:])
            check(f'{tag}: last week = 158 (Weather)', wk[-2] == 158, wk[-3:])
            check(f'{tag}: in-progress sessions/tests and card moves count 0', wk[-1] == 149)
            check(f'{tag}: sessions older than 12 weeks are not in the 12-week view', sum(wk) == 149 + 158, sum(wk))
            check(f'{tag}: "All" range includes the older session', sum(x['q'] for x in pg.evaluate('weeklyVolume(0)')) == 149 + 158 + 41)
            check(f'{tag}: weeks run Monday–Sunday', pg.evaluate("parse(weekStart(todayISO())).getDay()") == 1)
            check(f'{tag}: current week dot is highlighted', pg.evaluate("document.querySelectorAll('#volMini circle.vdot.cur').length") == 1)
            # live update
            before = pg.inner_html('#volMini')
            pg.evaluate("state.events.push({id:uid(),date:todayISO(),topic:16,kind:'review',score:90,partial:false,demo:false});save();render()")
            check(f'{tag}: logging a session updates the number (+114) and the chart', pg.inner_text('#volWeek') == '263' and pg.inner_html('#volMini') != before, pg.inner_text('#volWeek'))
            pg.evaluate("state.events.pop();save();render()")
            check(f'{tag}: deleting it goes back to 149', pg.inner_text('#volWeek') == '149')
            # active days moved next to the calendar
            check(f'{tag}: active days shown next to the calendar title', pg.is_visible('.calhead #activeDays') and pg.inner_text('#activeDays') == '3', pg.inner_text('#activeDays'))
            # practice test shortcut still works and does NOT open the big chart
            (pg.tap if mode in ('phone', 'iPad mini') else pg.click)('#ptStat'); pg.wait_for_timeout(150)
            check(f'{tag}: practice-test shortcut opens the practice-test dialog (not the chart)', pg.is_visible('#ptbg') and not pg.is_visible('#volbg'))
            pg.click('#ptClose'); pg.wait_for_timeout(100)
            # big view: opens ONLY from the corner icon
            (pg.tap if mode in ('phone', 'iPad mini') else pg.click)('#volMini'); pg.wait_for_timeout(150)
            check(f'{tag}: tapping the mini chart itself does NOT open the big view', not pg.is_visible('#volbg'))
            (pg.tap if mode in ('phone', 'iPad mini') else pg.click)('#volOpen'); pg.wait_for_timeout(250)
            check(f'{tag}: the corner icon opens the big view (default 3M = 13 weeks)', pg.is_visible('#volbg') and pg.evaluate("document.querySelectorAll('#volBig circle.vdot').length") == 13)
            exp = {'3d': (3, 149), '7d': (7, 149), '2w': (14, 149 + 158), '1m': (30, 149 + 158), '3m': (13, 149 + 158), '6m': (26, 149 + 158 + 41), '1y': (52, 149 + 158 + 41), 'all': (None, 149 + 158 + 41)}
            for r, (pts, tot) in exp.items():
                pg.click(f'#volRange [data-r="{r}"]'); pg.wait_for_timeout(80)
                n = pg.evaluate("document.querySelectorAll('#volBig circle.vdot').length")
                got = int(pg.inner_text('#volTotal').replace(',', '').replace('.', '').replace('\u202f', ''))
                check(f'{tag}: range {r.upper()} → {pts or "all"} points, total {tot} questions', (n == pts if pts else n >= 15) and got == tot, (n, got))
            pg.click('#volRange [data-r="7d"]'); pg.wait_for_timeout(80)
            check(f'{tag}: 7D compares with the previous 7 days (+% shown)', '%' in pg.inner_text('#volCmp'), pg.inner_text('#volCmp'))
            check(f'{tag}: date range shown under the total', '–' in pg.inner_text('#volDates'))
            check(f'{tag}: Y axis has question labels', pg.evaluate("document.querySelectorAll('#volBig text.vax').length") >= 3)
            check(f'{tag}: avg score still computed (weighted Sporty’s average)', pg.evaluate("document.getElementById('avg').textContent") == pg.evaluate("(()=>{let a=0,b=0;TOPICS.forEach((x,i)=>{const v=state.scores[i];if(v!=null){a+=x.q*v;b+=x.q}});return fmt(a/b,1)+'%'})()"))
            before = pg.inner_html('#volBig')
            pg.evaluate("state.events.push({id:uid(),date:todayISO(),topic:16,kind:'review',score:90,partial:false,demo:false});save();render()"); pg.wait_for_timeout(100)
            check(f'{tag}: big chart updates live while open', pg.inner_html('#volBig') != before and pg.inner_text('#volTotal').replace(',', '') == str(149 + 114))
            pg.evaluate("state.events.pop();save();render()")
            check(f'{tag}: big chart is not wider than the screen', pg.evaluate('document.documentElement.scrollWidth') == opts['viewport']['width'])
            if mode == 'phone':
                bx = pg.locator('#volbg .modal').bounding_box()
                check(f'{tag}: opens as a bottom sheet on the phone', abs(bx['y'] + bx['height'] - 874) < 2)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
            check(f'{tag}: closes with Escape', not pg.is_visible('#volbg'))
            for L, word in [('pt', 'Esta semana'), ('ja', '今週')]:
                pg.click(f'.flag[data-lang="{L}"]'); pg.wait_for_timeout(80)
                check(f'{tag}: translated ({L})', pg.evaluate("document.querySelector('#volCard .label').textContent") == word)
            check(f'{tag}: no JavaScript errors', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} study-volume tests passed\n')
for n, good, d in results:
    print(('PASS ' if good else 'FAIL ') + n + ('' if good else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
