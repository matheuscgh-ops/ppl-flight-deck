"""A cleaner dashboard on phones (Strava style): streak card beside the countdown, the volume chart across the whole
width, a training-log card and a spaced-repetition card that open the real calendar and preview in a maximized card,
and the Kanban where it was. Larger screens are unchanged. Desktop, laptop, iPad mini and iPhone — personal and demo."""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA)),
       ('small phone', dict(viewport={'width': 360, 'height': 740}, is_mobile=True, has_touch=True, user_agent=UA))]
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:300]))
STATS = "JSON.stringify([forecast().mu, blended().mu, counts(), state.scores, state.events.length, (state.tests||[]).length])"
VIS = "(s=>{const e=document.querySelector(s);if(!e)return false;const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0})"
BOX = "(s=>{const r=document.querySelector(s).getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})"

with sync_playwright() as p:
    b = getattr(p, os.environ.get("PPL_BROWSER", "chromium")).launch()
    for f in os.environ.get('PPL_FILES', 'index demo').split():
        for k, (mode, opts) in enumerate(DEV):
            tag = f'{f} · {mode}'; W = opts['viewport']['width']; phone = W <= 640; touch = opts.get('has_touch')
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: errs.append('browser dialog: ' + d.message) or d.dismiss())
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(500)
            ev = pg.evaluate
            ev("window.pplTour&&pplTour.end()"); ev("goView('dash')"); pg.wait_for_timeout(200)
            stats0 = ev(STATS)
            tap = (lambda s: pg.tap(s)) if touch else (lambda s: pg.click(s))

            if k == 0:
                ws = ev("""(()=>{const T=todayISO(),M=mondayOf(T),e0=state.events,t0=state.tests;state.tests=[];
                    const ev=d=>({id:'w'+d,date:d,topic:1,kind:'study',score:80,partial:false,demo:false}),o={};
                    state.events=[];o.none=weekStreak();
                    state.events=[ev(addDays(M,-7)),ev(addDays(M,-14)),ev(addDays(M,-28))];o.lastTwo=weekStreak();
                    state.events.push(ev(T));o.withThis=weekStreak();
                    state.events=[ev(T)];o.onlyThis=weekStreak();
                    state.events=e0;state.tests=t0;return o})()""")
                check(f'{f}: week streak — none 0, last two weeks 2 (this week not active yet), +this week 3, only this week 1',
                      ws == {'none': 0, 'lastTwo': 2, 'withThis': 3, 'onlyThis': 1}, ws)

            if not phone:
                check(f'{tag}: larger screens unchanged — no streak, training-log or spaced-repetition cards',
                      not ev(VIS + "('#streakCard')") and not ev(VIS + "('#calMini')") and not ev(VIS + "('#srMini')"))
                check(f'{tag}: the calendar and the spaced-repetition preview are still on the page', ev(VIS + "('.cal')") and ev(VIS + "('#prevChart')"))
                if mode == 'desktop':
                    h = ev("document.querySelector('.toprow').getBoundingClientRect().height")
                    check(f'{tag}: top row height unchanged', h <= 140, h)
            else:
                cd, sk = ev(BOX + "('.countdown')"), ev(BOX + "('#streakCard')")
                check(f'{tag}: the streak card sits beside the countdown, same row', ev(VIS + "('#streakCard')") and abs(cd[1] - sk[1]) < 2 and sk[0] > cd[2] and sk[2] <= W, (cd, sk))
                wk = ev("weekStreak()"); s = ev("streakInfo().n")
                check(f'{tag}: streak card shows the week streak and the day streak', ev("document.getElementById('streakWeeks').textContent") == str(wk) and str(s) in ev("document.getElementById('streakDays').textContent"), (wk, s))
                vb, tb = ev(BOX + "('#volCard')"), ev(BOX + "('.toprow')")
                check(f'{tag}: the volume chart spans the whole width, with axes', abs(vb[0] - tb[0]) < 1 and abs(vb[2] - tb[2]) < 1 and vb[3] - vb[1] >= 170 and ev("document.querySelectorAll('#volMini .vax').length") >= 2, (vb, tb))
                check(f'{tag}: the calendar and the preview are folded into cards (not on the page)', not ev(VIS + "('.cal')") and not ev(VIS + "('#prevChart')"))
                bo = ev(BOX + "('.board')")
                check(f'{tag}: the Kanban stays on the dashboard', ev(VIS + "('.board')") and bo[2] <= W + 0.5)
                cm, sm = ev(BOX + "('#calMini')"), ev(BOX + "('#srMini')")
                check(f'{tag}: training log and spaced repetition side by side, inside the screen', ev(VIS + "('#calMini')") and ev(VIS + "('#srMini')") and abs(cm[1] - sm[1]) < 2 and cm[0] >= 0 and sm[2] <= W, (cm, sm))
                tl = ev("""(()=>{const rows=[...document.querySelectorAll('#calMiniBody .tlrow')],T=todayISO(),M=mondayOf(T);
                    const q=(a,b)=>{let s=0;state.events.forEach(e=>{if((e.kind==='study'||e.kind==='review')&&!e.partial&&e.date>=a&&e.date<=b)s+=TOPICS[e.topic].q});(state.tests||[]).forEach(x=>{if(x.date>=a&&x.date<=b)s+=(x.q||60)});return s};
                    return {rows:rows.length,dots:document.querySelectorAll('#calMiniBody .tl').length,now:document.querySelectorAll('#calMiniBody .tl.now').length,
                      tw:rows[0].querySelector('b').textContent,want:fmt(q(M,addDays(M,6)))+' q',lw:rows[1].querySelector('b').textContent,wantL:fmt(q(addDays(M,-7),addDays(M,-1)))+' q'}})()""")
                check(f'{tag}: training log: this week and last week, 7 dots each, today marked, question totals right', tl['rows'] == 2 and tl['dots'] == 14 and tl['now'] == 1 and tl['tw'] == tl['want'] and tl['lw'] == tl['wantL'], tl)
                sr = ev("""(()=>{const ms=srAll(todayISO(),true),R=wavg(ms),d=ms.filter(m=>m.reps.length&&m.over>=0).length;return {big:document.querySelector('#srMiniBody .srbig').textContent,want:R==null?'—':Math.round(R*100)+'%',due:document.querySelector('#srMiniBody .srdue').textContent,d}})()""")
                check(f'{tag}: spaced-repetition card: average recall now and reviews due (same numbers as the preview)', sr['big'] == sr['want'] and (str(sr['d']) in sr['due'] or (sr['d'] == 0 and 'Nothing' in sr['due'])), sr)
                # the calendar, maximized
                ev("document.getElementById('calMini').scrollIntoView({block:'center'})"); pg.wait_for_timeout(100)
                tap('#calMini'); pg.wait_for_timeout(350)
                o = ev("""(()=>{const cal=document.querySelector('.cal'),m=document.querySelector('#calMaxBg .modal').getBoundingClientRect();return {open:!document.getElementById('calMaxBg').hidden,inside:!!cal.closest('#calMaxBody'),
                    days:document.querySelectorAll('#calMaxBody .day').length,fits:m.left>=0&&m.right<=innerWidth+0.5,month:document.getElementById('month').textContent}})()""")
                check(f'{tag}: tapping the training log opens the real calendar in a maximized card', o['open'] and o['inside'] and o['days'] >= 28 and o['fits'] and ev(VIS + "('.cal')"), o)
                tap('#next'); pg.wait_for_timeout(150)
                check(f'{tag}: the maximized calendar works (next month)', ev("document.getElementById('month').textContent") != o['month'])
                tap('#now'); pg.wait_for_timeout(100)
                pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
                check(f'{tag}: closing puts the calendar back where it was (folded again)', ev("document.querySelector('.cal').parentNode.classList.contains('center')&&document.querySelector('.cal').nextElementSibling.classList.contains('side')") and not ev(VIS + "('.cal')"))
                tap('#streakCard'); pg.wait_for_timeout(300)
                check(f'{tag}: the streak card opens the calendar too', not ev("document.getElementById('calMaxBg').hidden"))
                tap('#calMaxClose'); pg.wait_for_timeout(200)
                # the spaced-repetition preview, maximized
                ev("document.getElementById('srMini').scrollIntoView({block:'center'})"); pg.wait_for_timeout(100)
                tap('#srMini'); pg.wait_for_timeout(450)
                o = ev("""(()=>{const m=document.querySelector('#srMaxBg .modal').getBoundingClientRect();return {open:!document.getElementById('srMaxBg').hidden,inside:!!document.getElementById('srPrev').closest('#srMaxBody'),
                    svg:!!document.querySelector('#prevChart svg'),fits:m.left>=0&&m.right<=innerWidth+0.5}})()""")
                check(f'{tag}: tapping spaced repetition opens the real preview (picker, curve) in a maximized card', o['open'] and o['inside'] and o['svg'] and o['fits'] and ev(VIS + "('#prevPick')"), o)
                ev("(()=>{const s=document.getElementById('prevPick');s.selectedIndex=Math.min(2,s.options.length-1);s.dispatchEvent(new Event('change',{bubbles:true}))})()"); pg.wait_for_timeout(200)
                check(f'{tag}: the picker works inside the maximized card', ev("!!document.querySelector('#prevChart svg, #prevChart .empty')"))
                tap('#srMaxClose'); pg.wait_for_timeout(200)
                check(f'{tag}: closing puts the preview back in the side panel (folded)', ev("document.getElementById('srPrev').parentNode.id") == 'srPanel' and not ev(VIS + "('#prevChart')"))
                check(f'{tag}: the forecast and today\'s plan stay on the page', ev(VIS + "('#fcMini')") and ev(VIS + "('.nthen')"))
                for l in ['pt', 'ja']:
                    ev(f"document.querySelector('.flag[data-lang=\"{l}\"]').click()"); pg.wait_for_timeout(100)
                    txt = ev("['#streakCard','#calMini','#srMini'].map(s=>document.querySelector(s).innerText).join(' | ')")
                    check(f'{tag} [{l}]: the cards are translated (no raw keys or placeholders)', not any(x in txt for x in ('streakTitle', 'trainLog', 'srDue', 'srRecall', '{n}', 'Last week', 'Streak')), txt)
                ev("document.querySelector('.flag[data-lang=\"en\"]').click()"); pg.wait_for_timeout(80)
            check(f'{tag}: nothing here changes a statistic', ev(STATS) == stats0)
            check(f'{tag}: page fits the screen', ev('document.documentElement.scrollWidth') <= W, ev('document.documentElement.scrollWidth'))
            check(f'{tag}: no script errors or browser pop-ups', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} phone dashboard tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
