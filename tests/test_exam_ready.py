"""Exam phases, "Ready for the exam?" and the forecast's track record.

The plan changes on its own as the exam gets close (final stretch from 21 days, final week, last day), the countdown
card has a readiness meter that opens a checklist, and the calibration dialog shows how far the forecast was from each
practice test. None of it changes a statistic. Desktop, laptop, iPad mini and iPhone — personal and demo, en/pt/ja."""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA)),
       ('small phone', dict(viewport={'width': 360, 'height': 780}, is_mobile=True, has_touch=True, user_agent=UA))]
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:300]))

STATS = "JSON.stringify([forecast().mu, blended().mu, blended().pass, counts(), state.scores, state.events.length, (state.tests||[]).length, TOPICS.map((_,i)=>srModel(i).R), calibration().bias])"
DL = "(d=>{state.deadline=addDays(todayISO(),d);render()})"

with sync_playwright() as p:
    b = getattr(p, os.environ.get("PPL_BROWSER", "chromium")).launch()
    for f in ['index', 'demo']:
        for k, (mode, opts) in enumerate(DEV):
            tag = f'{f} · {mode}'; W = opts['viewport']['width']
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: errs.append('browser dialog: ' + d.message) or d.dismiss())
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(500)
            ev = pg.evaluate
            ev("window.pplTour&&pplTour.end()"); ev("goView('dash')"); pg.wait_for_timeout(150)
            dl0 = ev("state.deadline")
            stats0 = ev(STATS)

            # ---------- the model (once per file: it does not depend on the screen) ----------
            if k == 0:
                ph = ev("""(()=>{const T=todayISO(),o={};for(const d of [40,22,21,8,7,2,1,0,-1]){state.deadline=addDays(T,d);o[d]=examPhase(T)}return o})()""")
                check(f'{f}: phases by days left (normal > 21, stretch 8–21, week 2–7, last day 0–1, after)',
                      ph == {'40': 'normal', '22': 'normal', '21': 'stretch', '8': 'stretch', '7': 'week', '2': 'week', '1': 'lastday', '0': 'lastday', '-1': 'after'}, ph)
                tw = ev("""(()=>{const T=todayISO(),st={...settings(),testEvery:5};state.tests=[{id:'tx',date:addDays(T,-3),q:60,score:80}];
                    state.deadline=addDays(T,40);const a=testWhy(T,st);state.deadline=addDays(T,15);const s=testWhy(T,st);
                    state.deadline=addDays(T,6);const w=testWhy(T,st);state.deadline=addDays(T,1);const l=testWhy(T,st);
                    return {a:[a.every,a.reason!=='testStretch'&&a.reason!=='testFinal'],s:[s.every,s.due,s.reason],w:[w.every,w.due,w.reason],l:[l.due]}})()""")
                check(f'{f}: practice test every 5 days normally, at least every 3 in the final stretch, every 2 in the last 10 days',
                      tw['a'] == [5, True] and tw['s'] == [3, True, 'testStretch'] and tw['w'] == [2, True, 'testFinal'], tw)
                check(f'{f}: no practice test on the day before the exam', tw['l'] == [False], tw)
                pg.reload(); pg.wait_for_timeout(400); ev("window.pplTour&&pplTour.end()")
                lp = ev("""(()=>{const T=todayISO();state.deadline=addDays(T,1);const P=buildPlan(T,{...settings(),minutes:240});
                    return {min:P.minutes,test:P.items.some(x=>x.kind==='test'),nodata:P.items.some(x=>x.reason==='nodata'||x.reason==='new'),big:P.items.filter(x=>x.kind==='topic'&&!x.done).map(x=>x.n),phase:P.phase}})()""")
                check(f'{f}: last day: at most 90 minutes, no test, nothing new, reviews of 20 questions or fewer',
                      lp['phase'] == 'lastday' and lp['min'] <= 90 and not lp['test'] and not lp['nodata'] and all(n <= 20 for n in lp['big']), lp)
                pk = ev("""(()=>{const T=todayISO();state.deadline=addDays(T,1);const it=packDay(T,[[1080,1260]],'medium');
                    const end=Math.max(...it.map(x=>x.start+x.min));return {n:it.length,end,test:it.some(x=>x.kind==='test')}})()""")
                check(f'{f}: a 3-hour block on the day before the exam is filled for 90 minutes at most', pk['n'] and pk['end'] <= 1080 + 90 and not pk['test'], pk)
                wk = ev("""(()=>{const T=todayISO(),D=addDays(T,1),i=TOPICS.findIndex((_,j)=>state.scores[j]==null||j===3);const s0=state.statuses[i],c0=state.scores[i],e0=state.events;
                    state.statuses[i]='To review';state.scores[i]=80;state.events=[...e0,{id:'wk80',date:T,topic:i,kind:'study',score:80,partial:false,demo:false}];
                    state.deadline=addDays(T,40);const a=buildPlan(D,{...settings(),minutes:2000}).items.find(x=>x.i===i);
                    state.deadline=addDays(T,15);const s=buildPlan(D,{...settings(),minutes:2000}).items.find(x=>x.i===i);
                    state.statuses[i]=s0;state.scores[i]=c0;state.events=e0;return {a:a&&a.reason,s:s&&s.reason}})()""")
                check(f'{f}: a topic at 80% counts as weak only in the final stretch (below the goal)', wk['s'] == 'weak' and wk['a'] != 'weak', wk)
                nr = ev("""(()=>{const T=todayISO();state.notes=[{id:'nq',topic:1,date:addDays(T,-2),text:'x'}];
                    state.deadline=addDays(T,40);const a=[notesReviewFor(T,45),notesReviewFor(T,60),notesReviewFor(T,120)];
                    state.deadline=addDays(T,15);const s=[notesReviewFor(T,45),notesReviewFor(T,60),notesReviewFor(T,120)];return {a,s}})()""")
                check(f'{f}: error-notes review: 0/10/15 min normally, 15/15/20 in the final stretch (from 45-min sessions)', nr == {'a': [0, 10, 15], 's': [15, 15, 20]}, nr)
                fr = ev("""(()=>{const r=forecastRecord(),ts=scoredTests();return {n:r.n,t:ts.length,ok:r.rows.every((x,j)=>Math.abs(x.pred-blended(addDays(ts[j].date,-1)).mu*100)<1e-9&&x.score===ts[j].score),
                    mae:r.mae,brier:r.brierPass}})()""")
                check(f'{f}: track record: one row per scored test, forecast = the overall forecast the day before',
                      fr['n'] == fr['t'] and fr['ok'] and (fr['n'] == 0 or (fr['mae'] >= 0 and 0 <= fr['brier'] <= 1)), fr)
                pg.reload(); pg.wait_for_timeout(400); ev("window.pplTour&&pplTour.end()"); ev("goView('dash')"); pg.wait_for_timeout(150)

            # ---------- the meter in the countdown card ----------
            r = ev("""(()=>{const b=document.getElementById('readyBar'),c=document.querySelector('.countdown').getBoundingClientRect(),r=b.getBoundingClientRect(),R=readiness();
                return {vis:b.offsetParent!==null,in:r.left>=c.left-0.5&&r.right<=c.right+0.5&&r.bottom<=c.bottom+0.5,h:r.height,segs:b.querySelectorAll('.rsegs i').length,
                  ok:b.querySelectorAll('.rsegs i.ok').length,txt:document.getElementById('readyTxt').textContent,want:R.ok+'/'+R.checks.length,label:b.getAttribute('aria-label')}})()""")
            check(f'{tag}: readiness meter visible inside the countdown card, one segment per check, matching count',
                  r['vis'] and r['in'] and r['segs'] == 5 and r['txt'] == r['want'] and r['ok'] == int(r['want'].split('/')[0]) and r['h'] >= 20, r)
            check(f'{tag}: page fits the screen', ev('document.documentElement.scrollWidth') <= W, ev('document.documentElement.scrollWidth'))

            # ---------- the dialog, in each language and each phase ----------
            for l in ['en', 'pt', 'ja']:
                ev(f"document.querySelector('.flag[data-lang=\"{l}\"]').click()"); pg.wait_for_timeout(80)
                for d, ph in (((40, 'normal'), (15, 'stretch'), (5, 'week'), (1, 'lastday'), (-3, 'after')) if mode in ('desktop', 'small phone') else ((15, 'stretch'),)):
                    ev(DL + f"({d})"); pg.wait_for_timeout(40)
                    ev("openReady()"); pg.wait_for_timeout(120)
                    o = ev("""(()=>{const m=document.querySelector('#readybg .modal'),r=m.getBoundingClientRect(),txt=m.innerText;
                        return {open:!document.getElementById('readybg').hidden,cls:document.getElementById('readyPhase').className,li:document.querySelectorAll('#readyList li').length,
                          raw:/\\b(rk|rd|phase|rec|ready)_?[A-Za-z]+_?[a-z]*\\b/.test(txt.replace(/[^\\x00-\\x7f]/g,' ').split(/\\s+/).filter(w=>/_/.test(w)).join(' ')),
                          brace:/\\{[a-z]+\\}/.test(txt),fits:r.left>=0&&r.right<=innerWidth+0.5,rec:document.getElementById('readyRec').innerText.length}})()""")
                    check(f'{tag} [{l}] {ph}: the dialog opens with the phase, 5 checks and the track record, no raw keys or placeholders',
                          o['open'] and o['cls'] == 'readyphase ' + ph and o['li'] == 5 and not o['raw'] and not o['brace'] and o['fits'] and o['rec'] > 20, o)
                    pg.keyboard.press('Escape'); pg.wait_for_timeout(60)
                ev(DL + "(15)"); pg.wait_for_timeout(40)
                check(f'{tag} [{l}]: in the final stretch the meter is marked', ev("document.getElementById('readyBar').classList.contains('stretch')"))
            ev("document.querySelector('.flag[data-lang=\"en\"]').click()"); pg.wait_for_timeout(60)
            ev(f"(()=>{{state.deadline={dl0!r};render()}})()"); pg.wait_for_timeout(60)
            # a tap on the meter opens it; "Plan" goes to the Plan tab
            ev("document.getElementById('readyBar').scrollIntoView({block:'center'})"); pg.wait_for_timeout(80)
            if opts.get('has_touch'): pg.tap('#readyBar')
            else: pg.click('#readyBar')
            pg.wait_for_timeout(150)
            check(f'{tag}: a tap or click on the meter opens the checklist', pg.is_visible('#readybg'))
            pg.click('#readyPlan'); pg.wait_for_timeout(200)
            check(f'{tag}: "Plan" closes it and opens the Plan tab', not pg.is_visible('#readybg') and pg.is_visible('#viewPlan'))
            # the calibration dialog shows the track record too
            ev("goView('sr','tests')"); pg.wait_for_timeout(200)
            ev("document.getElementById('calBg').hidden=false;renderCal()"); pg.wait_for_timeout(100)
            check(f'{tag}: the calibration dialog shows the forecast track record', len(ev("document.getElementById('recTxt').textContent")) > 20, ev("document.getElementById('recTxt').textContent"))
            ev("document.getElementById('calBg').hidden=true;goView('dash')"); pg.wait_for_timeout(100)
            check(f'{tag}: nothing here changes a statistic or the forecast', ev(STATS) == stats0)
            check(f'{tag}: no script errors or browser pop-ups', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} exam-readiness tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
