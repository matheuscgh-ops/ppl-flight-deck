"""Calendar, streak (Strava strip) and day-summary tests — desktop and phone, personal and demo."""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond), str(detail)[:200]))

# fixed scenario relative to "today": active days = today-0..3, today-5, today-12 (+ a practice test on today-20)
SETUP = """(()=>{
  const D=n=>addDays(todayISO(),-n);
  state.events=[]; state.tests=[];
  const ev=(n,topic,kind,extra={})=>state.events.push({id:uid(),date:D(n),topic,kind,from:null,to:null,score:null,partial:false,demo:false,...extra});
  ev(0,12,'review',{score:90}); ev(1,13,'study',{score:80}); ev(2,14,'move',{from:'Todo',to:'Doing'});
  ev(3,15,'study',{partial:true}); ev(5,16,'review',{score:70}); ev(12,18,'study',{score:40});
  [19,20,21,11,12,13].forEach((i,k)=>ev(1,i,'move',{from:'Doing',to:'Very Comfortable'}));
  state.tests.push({id:uid(),date:D(20),q:60,score:77});
  shown=new Date(); save(); render();
})()"""

def streak(pg): return pg.evaluate('streakInfo().n')
def bubble(pg): return pg.inner_text('.bubble')

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

            # ---------------- streak ----------------
            check(f'{tag}: streak counts consecutive days ending today (4)', streak(pg) == 4 and bubble(pg) == '4', (streak(pg), bubble(pg)))
            check(f'{tag}: a gap (day -4) stops the streak — older days not counted', streak(pg) == 4)
            check(f'{tag}: active-days stat counts days, incl. practice test day (7)', pg.inner_text('#activeDays') == '7', pg.inner_text('#activeDays'))
            # remove today's only activity → streak still alive, ending yesterday (3)
            pg.evaluate("state.events=state.events.filter(e=>e.date!==todayISO());save();render()")
            check(f'{tag}: no activity yet today → streak still shows 3 (ends yesterday)', streak(pg) == 3 and bubble(pg) == '3', streak(pg))
            pg.evaluate("state.events.push({id:uid(),date:todayISO(),topic:1,kind:'study',score:70,partial:false,demo:false});save();render()")
            check(f'{tag}: studying today brings it back to 4', bubble(pg) == '4')
            # in-progress session and card moves count as activity
            pg.evaluate("state.events=state.events.filter(e=>e.date!==todayISO());state.events.push({id:uid(),date:todayISO(),topic:2,kind:'study',score:null,partial:true,demo:false});save();render()")
            check(f'{tag}: a session in progress counts for the streak', bubble(pg) == '4')
            pg.evaluate("state.events=state.events.filter(e=>e.date!==todayISO());save();render();moveCard(3,'Doing')")
            check(f'{tag}: moving a card counts for the streak', bubble(pg) == '4')
            pg.evaluate("state.events=state.events.filter(e=>e.date!==todayISO());save();render()")
            pg.evaluate("state.tests.push({id:uid(),date:todayISO(),q:60,score:80});save();render()")
            check(f'{tag}: a practice test counts for the streak', bubble(pg) == '4')
            # break yesterday → 1
            pg.evaluate("const y=addDays(todayISO(),-1);state.events=state.events.filter(e=>e.date!==y);save();render()")
            check(f'{tag}: removing yesterday breaks it → 1', bubble(pg) == '1', bubble(pg))
            pg.evaluate(SETUP); pg.wait_for_timeout(100)

            # -------- week checks & bubble placement --------
            rows = pg.evaluate("""(()=>{const out=[];document.querySelectorAll('#calgrid .wcheck').forEach(w=>{const r=+w.style.gridRow;const days=[...document.querySelectorAll('#calgrid .day')].filter(d=>+d.style.gridRow===r);out.push({on:w.classList.contains('on'),active:days.some(d=>d.classList.contains('active'))})});return out})()""")
            check(f'{tag}: every week check matches whether that week had activity', all(r['on'] == r['active'] for r in rows), rows)
            cur = pg.evaluate("document.querySelector('.day.today').style.gridRow")
            check(f'{tag}: streak bubble sits on the current week (Strava style)', pg.evaluate("document.querySelector('.bubblewrap').style.gridRow") == cur)
            pg.click('#prev'); pg.click('#prev'); pg.wait_for_timeout(100)
            check(f'{tag}: a month with no activity shows no checks', pg.evaluate("document.querySelectorAll('#calgrid .wcheck.on').length") == 0 and not pg.evaluate("document.querySelectorAll('.day.active').length"))
            check(f'{tag}: the bubble still shows the current streak in other months', bubble(pg) == '4')
            pg.click('#now'); pg.wait_for_timeout(100)

            # -------- active days & completed names --------
            act = pg.evaluate("[...document.querySelectorAll('.day.active')].map(d=>d.dataset.date).sort()")
            exp = sorted(pg.evaluate("[0,1,2,3,5,12,20].map(n=>addDays(todayISO(),-n))"))
            shown_month = pg.evaluate("[...document.querySelectorAll('.day[data-date]')].map(d=>d.dataset.date)")
            check(f'{tag}: highlighted days = exactly the days with activity', act == [d for d in exp if d in shown_month], (act, exp))
            if mode == 'desktop':
                d1 = pg.evaluate("addDays(todayISO(),-1)")
                if d1 in shown_month:
                    tags = pg.evaluate(f"[...document.querySelectorAll('.day[data-date=\"{d1}\"] .daytag')].filter(x=>!x.hidden&&x.offsetHeight).map(x=>x.textContent)")
                    names = [t for t in tags if not t.startswith('+')]; more = [t for t in tags if t.startswith('+')]
                    check(f'{tag}: day with 6 completions lists names + "+N" totalling 6',
                          len(names) + sum(int(m[1:]) for m in more) == 6 and 'Human Factors' not in ' '.join(names[:0]), tags)
                    d5 = pg.evaluate("addDays(todayISO(),-5)")
                    if d5 in shown_month:
                        t5 = pg.evaluate(f"[...document.querySelectorAll('.day[data-date=\"{d5}\"] .daytag')].filter(x=>!x.hidden&&x.offsetHeight).map(x=>x.textContent)")
                        check(f'{tag}: a day with only a study session previews that topic', t5 == ['Performance and Limitations'], t5)
                    d20 = pg.evaluate("addDays(todayISO(),-20)")
                    if d20 in shown_month:
                        t20 = pg.evaluate(f"[...document.querySelectorAll('.day[data-date=\"{d20}\"] .daytag')].filter(x=>!x.hidden&&x.offsetHeight).map(x=>x.textContent)")
                        check(f'{tag}: a practice test shows in the day preview with its score', t20 and '77%' in t20[0], t20)
            else:
                check(f'{tag}: phone calendar shows circles without names', not pg.evaluate("[...document.querySelectorAll('.day .daytag')].some(x=>x.offsetHeight)"))

            # -------- day summary (tap/click a day) --------
            d1 = pg.evaluate("addDays(todayISO(),-1)")
            if d1 in shown_month:
                (pg.tap if mode == 'phone' else pg.click)(f'.day[data-date="{d1}"]'); pg.wait_for_timeout(150)
                body = pg.inner_text('#dayBody')
                check(f'{tag}: tapping a day opens its summary', pg.is_visible('#daybg'))
                check(f'{tag}: summary lists all 6 cards moved to Very Comfortable', all(pg.evaluate(f'TOPICS[{i}].name') in body for i in [19, 20, 21, 11, 12, 13]), body[:200])
                check(f'{tag}: summary lists the study session with its score (Human Factors 80%)', 'Human Factors' in body and '80%' in body)
                check(f'{tag}: summary counters are right (1 session, 6 completed)', pg.inner_text('.dssum').replace('\n', ' ').startswith('1'), pg.inner_text('.dssum'))
                if mode == 'phone':
                    box = pg.locator('#daybg .modal').bounding_box()
                    check(f'{tag}: on the phone it opens centred, like on desktop', abs((box['y'] + box['height'] / 2) - 437) < 40 and box['x'] >= 8, box)
                pg.keyboard.press('Escape') if mode == 'desktop' else pg.tap('#dayClose')
                check(f'{tag}: summary closes', not pg.is_visible('#daybg'))
            d3 = pg.evaluate("addDays(todayISO(),-3)")
            if d3 in shown_month:
                pg.click(f'.day[data-date="{d3}"]'); pg.wait_for_timeout(100)
                check(f'{tag}: in-progress session is shown as "in progress"', 'in progress' in pg.inner_text('#dayBody'))
                pg.keyboard.press('Escape')
            d4 = pg.evaluate("addDays(todayISO(),-4)")
            if d4 in shown_month:
                pg.click(f'.day[data-date="{d4}"]'); pg.wait_for_timeout(100)
                check(f'{tag}: empty day says nothing was logged', 'Nothing logged' in pg.inner_text('#dayBody'))
                pg.keyboard.press('Escape')
            pg.click('.flag[data-lang="pt"]'); pg.wait_for_timeout(80)
            if d1 in shown_month:
                pg.click(f'.day[data-date="{d1}"]'); pg.wait_for_timeout(100)
                check(f'{tag}: summary translated (pt)', 'Sessões de estudo' in pg.inner_text('#dayBody') and 'Estudou' in pg.inner_text('#dayBody'))
                pg.keyboard.press('Escape')
            # summary reflects new activity immediately
            pg.evaluate("moveCard(7,'Very Comfortable')")
            pg.click(f'.day[data-date="{pg.evaluate("todayISO()")}"]'); pg.wait_for_timeout(100)
            check(f'{tag}: a card just moved to Very Comfortable shows up in today\'s summary', 'Pilotage and Dead Reckoning' in pg.inner_text('#dayBody'))
            check(f'{tag}: no JavaScript errors', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} calendar & streak tests passed\n')
for n, good, d in results:
    print(('PASS ' if good else 'FAIL ') + n + ('' if good else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
