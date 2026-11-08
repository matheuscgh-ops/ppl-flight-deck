"""The study day: the plan grid runs 24 hours, from its first hour (Settings, 06:00) to the same hour the next morning, so
a block can run past midnight and still belong to the day it started. Until that hour the app keeps counting it as that
day: today's plan, the next-up bar, the sessions you log, the streak. Desktop, laptop, iPad mini and iPhone — personal
and demo, with the browser clock set to Saturday evening, just after midnight, and Sunday morning."""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA))]
SAT, SUN = '2026-11-07', '2026-11-08'
# a daily plan on Saturday from 20:00 to 01:30 the next morning, filled by the planner
PLAN = """(()=>{const T='%s';(state.plans||[]).forEach(p=>p.active=false);state.plans=(state.plans||[]).filter(p=>p.id!=='pN');
  state.plans.push({id:'pN',type:'daily',name:'',start:T,active:true,blocks:{[T]:[[1200,1530]]},items:[]});save();refreshPlans();render()})()""" % SAT
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:300]))

with sync_playwright() as p:
    b = getattr(p, os.environ.get("PPL_BROWSER", "chromium")).launch()
    for f in os.environ.get('PPL_FILES', 'index demo').split():
        for mode, opts in DEV:
            tag = f'{f} · {mode}'; W = opts['viewport']['width']
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: errs.append('browser dialog: ' + d.message) or d.dismiss())
            pg.clock.install(time=f'{SAT}T20:50:00')
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(500)
            ev = pg.evaluate
            ev("window.pplTour&&pplTour.end()")

            # --- Saturday evening ---
            check(f'{tag}: Saturday 20:50 is Saturday, the grid runs 06:00 → 06:00 (+1)', ev("[todayISO(),DAY_START,DAY_END]") == [SAT, 360, 1800])
            ev("goView('plan');openWizard({mode:'new',type:'daily',start:todayISO()})"); pg.wait_for_timeout(200)
            ev("document.getElementById('wzNext').click()"); pg.wait_for_timeout(250)
            g = ev("(()=>{const s=[...document.querySelectorAll('.wk.select .wkcol .wks')];return {n:s.length,mid:!!document.querySelector('.wks.mid[data-s=\"1440\"]'),last:s.length&&+s.at(-1).dataset.s,lbl:[...document.querySelectorAll('.wk.select .wkh')].map(e=>e.textContent).slice(-1)[0]}})()")
            check(f'{tag}: the time-block step has 24 hours of 15-minute slots, a midnight line and "+1" hours', g['n'] == 96 and g['mid'] and g['last'] == 1785 and g['lbl'] == '05:00+1', g)
            ev("closeWizard&&closeWizard()") if ev("typeof closeWizard==='function'") else pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
            ev(PLAN); pg.wait_for_timeout(250)
            items = ev("todayPlan().items.map(x=>[x.kind,x.start,x.start+x.min])")
            check(f'{tag}: the plan fills the evening and runs past midnight (to 01:30, inside the block)', items and max(x[2] for x in items) > 1440 and max(x[2] for x in items) <= 1530 and min(x[1] for x in items) >= 1200, items)
            ev("goView('plan')"); pg.wait_for_timeout(250)
            wk = ev("(()=>{const h=[...document.querySelectorAll('#pwGrid .wkh')].map(e=>e.textContent);return {h,mid:!!document.querySelector('#pwGrid .wkmid')}})()")
            check(f'{tag}: the week view shows the night hours with "+1" and the midnight line', wk['mid'] and '00:00+1' in wk['h'] and '01:00+1' in wk['h'], wk)
            check(f'{tag}: the plan survives saving and loading (blocks after midnight are kept)', ev("normalize(JSON.parse(JSON.stringify(state))).plans.find(p=>p.id==='pN').blocks['%s'][0][1]" % SAT) == 1530)

            # --- 00:40 on Sunday: still Saturday's study day ---
            pg.clock.set_system_time(f'{SUN}T00:40:00'); ev("render()"); pg.wait_for_timeout(200)
            check(f'{tag}: at 00:40 it is still Saturday (minute 24 × 60 + 40)', ev("[todayISO(),nowMinutes()]") == [SAT, 1480])
            n = ev("(()=>{const x=nextItem();return x&&[x.date,x.start]})()")
            check(f'{tag}: the next-up bar still shows Saturday\'s plan', n and n[0] == SAT, n)
            ev("refreshPlans();render()"); pg.wait_for_timeout(150)
            n = ev("(()=>{const x=nextItem();return x&&[x.date,x.start]})()")
            check(f'{tag}: Refresh at 00:40 moves what is left to after 00:40, still in Saturday\'s block', n and n[0] == SAT and 1470 <= n[1] < 1530, n)
            check(f'{tag}: the planner does not count the evening as missed', ev("todayPlan().items.length") > 0)
            n0 = ev("state.events.length"); ev("openModal(13,'review')"); pg.wait_for_timeout(120)
            pg.fill('#mScore', '88'); ev("document.getElementById('mSave').click()"); pg.wait_for_timeout(200)
            check(f'{tag}: a session logged at 00:40 counts for Saturday', ev("state.events.length") == n0 + 1 and ev("state.events.at(-1).date") == SAT, ev("state.events.at(-1).date"))
            check(f'{tag}: the streak counts Saturday as today', ev("streakInfo().n") >= 1)
            ev("renderCalendar()")
            check(f'{tag}: the calendar marks Saturday as today', ev("(()=>{const e=document.querySelector('.cal .day.today');return e&&e.dataset.date})()") == SAT)

            # --- Sunday morning: a new day ---
            pg.clock.set_system_time(f'{SUN}T06:10:00'); ev("render()"); pg.wait_for_timeout(150)
            check(f'{tag}: from 06:00 it is Sunday', ev("[todayISO(),nowMinutes()]") == [SUN, 370])
            # a plan with nothing after midnight keeps the night out of the week view
            ev("(()=>{const p=state.plans.find(p=>p.id==='pN');p.blocks={'%s':[[1080,1260]]};p.items=[];p.start='%s';save();refreshPlans();render()})()" % (SUN, SUN)); ev("goView('plan')"); pg.wait_for_timeout(250)
            hrs = ev("[...document.querySelectorAll('#pwGrid .wkh')].map(e=>e.textContent)")
            check(f'{tag}: with no blocks after 23:00 the week view stops before midnight', hrs and not any('+1' in h for h in hrs), hrs)
            # another start hour moves the end of the day with it
            ev("state.settings={...(state.settings||{}),gridStart:8};save()")
            pg.clock.set_system_time(f'{SUN}T07:30:00')
            check(f'{tag}: with the grid at 08:00 the day runs to 08:00 the next morning (07:30 is still the day before)', ev("[DAY_START,DAY_END,todayISO()]") == [480, 1920, SAT])
            ev("state.settings.gridStart=6;save()")
            check(f'{tag}: page fits the screen', ev('document.documentElement.scrollWidth') <= W)
            check(f'{tag}: no script errors or browser pop-ups', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} study-day tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
