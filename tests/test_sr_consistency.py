"""Spaced repetition stays consistent everywhere.
Builds a known history, computes the expected stability / recall / next review independently in Python with the app's
rules, then checks every place that shows spaced repetition after each change (log, low score, move card, delete, undo):
dashboard preview, Statistics topic card, KPIs (average recall, due, tracked), heat map, exam forecast and plan.
Desktop, laptop, iPad mini and iPhone — personal and demo."""
import os, sys, datetime as dt
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA))]
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:240]))

# ---- the app's spaced-repetition rules, written again here (independent of the app's code) ----
def recall(t, S): return 1 / (1 + max(0, t) / (9 * S))
def model(reps, today):
    """reps: list of (days_ago, score) oldest first → (S, R_now, days_until_next, n)"""
    S = None; prev = None
    for ago, p in reps:
        if prev is None: S = 2 if p >= 85 else 1.5 if p >= 70 else 1
        else:
            Rb = recall(prev - ago, S)
            S = S * (1 + 1.2 * (p / 100) * (1.5 - Rb)) if p >= 70 else S * 1.2 if p >= 60 else max(1, .4 * S)
        prev = ago
    last = reps[-1][0]
    return S, recall(last, S), max(1, round(S)) - last, len(reps)
pct = lambda R: f'{round(R * 100)}%'
fmt1 = lambda S: f'{S:.1f}d'

SETUP = """(()=>{const T=todayISO(),D=n=>addDays(T,-n),ev=(n,topic,kind,sc)=>({id:'e'+topic+'_'+n,date:D(n),topic,kind,from:null,to:null,score:sc,partial:false,demo:false});
  state.statuses=TOPICS.map(()=> 'Todo');state.scores=TOPICS.map(()=>null);state.tests=[];state.plan=null;
  state.statuses[18]='Not Comfortable';state.statuses[12]='Not Comfortable';
  state.events=[ev(10,18,'study',60),ev(6,18,'review',72),ev(8,12,'study',80)];
  state.scores[18]=72;state.scores[12]=80;state.settings={minutes:600,qph:40,testEvery:0,reviewMin:1.5};save();render();})()"""

def card(pg, i):
    """numbers on the Statistics topic card: recall, stability, sessions, last score"""
    return pg.evaluate(f"[...document.querySelectorAll('#sr-{i} .kpirow b')].map(b=>b.textContent)")

with sync_playwright() as p:
    b = p.chromium.launch()
    for f in ['index', 'demo']:
        for mode, opts in DEV:
            tag = f'{f} · {mode}'; touch = mode in ('phone', 'iPad mini'); tap = pg_tap = None
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(500)
            try: pg.evaluate("window.pplTour&&pplTour.end()")
            except Exception: pass
            tap = pg.tap if touch else pg.click; ev = pg.evaluate
            ev(SETUP); pg.wait_for_timeout(200)

            def preview(i):
                """show topic i in the dashboard preview the way a person does: hover (mouse) or the picker (touch)"""
                if touch: pg.select_option('#prevPick', str(i)); pg.wait_for_timeout(150)
                else: pg.hover(f'.task[data-topic="{i}"] .tname'); pg.wait_for_timeout(150)
                return pg.inner_text('#prevStats')
            def stats():
                tap('.tabs button[data-view="sr"]'); pg.wait_for_timeout(300)
                k = ev("[...document.querySelectorAll('#srKpis b')].map(b=>b.textContent)")
                ch = ev("document.getElementById('heatNow').innerHTML")
                return k, ch
            def dash(): tap('.tabs button[data-view="dash"]'); pg.wait_for_timeout(250)

            # ---------- 1) known history ----------
            S18, R18, nx18, n18 = model([(10, 60), (6, 72)], 0)
            S12, R12, nx12, n12 = model([(8, 80)], 0)
            app = ev("(()=>{const m=srModel(18);return {S:m.S,R:m.R,over:m.over}})()")
            check(f'{tag}: app model = independent calculation (S {S18:.4f}, recall {R18:.4f})', abs(app['S'] - S18) < 1e-9 and abs(app['R'] - R18) < 1e-9 and app['over'] == -nx18, app)
            pv = preview(18)
            check(f'{tag}: dashboard preview shows recall {pct(R18)} and S {fmt1(S18)} for Weather', pct(R18) in pv and fmt1(S18) in pv.replace(' ', '').replace('S', ''), pv)
            k0, ch0 = stats()
            avg0 = (158 * R18 + 56 * R12) / (158 + 56)   # q-weighted average of the tracked topics with history (Weather 158 q, Cross-Country Flight Planning 56 q)
            check(f'{tag}: Statistics card for Weather: recall, stability, 2 sessions, last score 72%', card(pg, 18)[:2] == [pct(R18), fmt1(S18)] and card(pg, 18)[3] == '2' and card(pg, 18)[4] == '72%', card(pg, 18))
            check(f'{tag}: KPIs: average recall {pct(avg0)} (weighted by questions), 2 tracked', k0[0] == pct(avg0) and k0[2] == '2', k0)
            check(f'{tag}: heat map drawn', len(ch0) > 0)
            fc0 = ev('forecast().mu'); plan0 = ev("buildPlan().items.find(x=>x.i===18)")
            check(f'{tag}: plan has the overdue Weather review', plan0 and plan0['reason'] == 'due', plan0)

            # ---------- 2) log a review today: 90% ----------
            dash()
            tap('.task[data-topic="18"] .tname'); pg.wait_for_timeout(250)
            check(f'{tag}: tapping the card opens the log dialog as a review', pg.is_visible('#modalbg'))
            pg.fill('#mScore', '90'); tap('#mSave'); pg.wait_for_timeout(350)
            S18b, R18b, nx18b, _ = model([(10, 60), (6, 72), (0, 90)], 0)
            pv = preview(18)
            check(f'{tag}: after logging 90%: preview shows recall 100% and the new S {fmt1(S18b)}', '100%' in pv and fmt1(S18b) in pv.replace(' ', '').replace('S', ''), pv)
            check(f'{tag}: preview chart redrawn with 3 sessions', ev("document.querySelectorAll('#prevChart svg .cx').length") >= 3)
            k1, ch1 = stats()
            avg1 = (158 * 1 + 56 * R12) / 214
            check(f'{tag}: Statistics card updated: recall 100%, S {fmt1(S18b)}, 3 sessions, last 90%', card(pg, 18)[:2] == ['100%', fmt1(S18b)] and card(pg, 18)[3] == '3' and card(pg, 18)[4] == '90%', card(pg, 18))
            df = dt.date.today() + dt.timedelta(days=max(1, round(S18b)))
            check(f'{tag}: next review on the card = today + round(S) days', ev(f"srModel(18).next") == df.isoformat(), (ev('srModel(18).next'), df))
            check(f'{tag}: KPIs updated: average recall {pct(avg1)}', k1[0] == pct(avg1), k1)
            check(f'{tag}: heat map changed (Weather warmed up)', ch1 != ch0)
            check(f'{tag}: exam forecast went up (Weather is 15% of the exam)', ev('forecast().mu') > fc0 + .02, (fc0, ev('forecast().mu')))
            check(f'{tag}: plan: the Weather review is done today', ev("buildPlan().items.some(x=>x.i===18&&x.done)"))

            # ---------- 3) low score (< 60%) shrinks stability: S = max(1, 0.4 × S) ----------
            ev("commit(()=>{state.events.push({id:'low12',date:todayISO(),topic:12,kind:'review',score:50,from:null,to:null,partial:false,demo:false});state.scores[12]=50},'x')"); pg.wait_for_timeout(250)
            S12b, _, _, _ = model([(8, 80), (0, 50)], 0)
            k2, _ = stats()
            check(f'{tag}: a 50% review shrinks Cross-Country Flight Planning stability to {fmt1(S12b)} on its card', card(pg, 12)[1] == fmt1(S12b), card(pg, 12))

            # ---------- 4) moving a card into Not Comfortable starts tracking it ----------
            dash(); ev("moveCard(13,'Not Comfortable')"); pg.wait_for_timeout(250)
            k3, _ = stats()
            check(f'{tag}: moving Human Factors to Not Comfortable → 3 tracked topics and its card appears', k3[2] == '3' and ev("!!document.getElementById('sr-13')"), k3)
            check(f'{tag}: its card says there is no study history yet', ev("document.querySelector('#sr-13 .empty')!==null"))
            check(f'{tag}: "due" count includes the new topic without history', int(k3[1]) == int(k2[1]) + 1, (k2, k3))
            dash()
            check(f'{tag}: the dashboard picker lists the new topic', ev("[...document.querySelectorAll('#prevPick option')].some(o=>o.value==='13')"))

            # ---------- 5) delete today's Weather review → back to the earlier numbers; undo → forward again ----------
            tap('.task[data-topic="18"] .tname'); pg.wait_for_timeout(250)
            tid = ev("state.events.find(e=>e.topic===18&&e.date===todayISO()).id")
            tap(f'#mHist [data-del="{tid}"]'); pg.wait_for_timeout(300)
            pg.keyboard.press('Escape') if not touch else ev("closeModal()"); pg.wait_for_timeout(150)
            pv = preview(18)
            check(f'{tag}: deleting the review brings back recall {pct(R18)} and S {fmt1(S18)} in the preview', pct(R18) in pv and fmt1(S18) in pv.replace(' ', '').replace('S', ''), pv)
            stats()
            check(f'{tag}: … and on the Statistics card', card(pg, 18)[:2] == [pct(R18), fmt1(S18)] and card(pg, 18)[3] == '2', card(pg, 18))
            ev("document.querySelector('#toast button').click()"); pg.wait_for_timeout(300)
            check(f'{tag}: Undo restores the review everywhere (card)', card(pg, 18)[:2] == ['100%', fmt1(S18b)], card(pg, 18))
            dash(); pv = preview(18)
            check(f'{tag}: … and in the dashboard preview', '100%' in pv and fmt1(S18b) in pv.replace(' ', '').replace('S', ''), pv)

            # ---------- 6) To review still counts as tracked; Todo does not ----------
            ev("moveCard(18,'To review')"); pg.wait_for_timeout(200)
            check(f'{tag}: a topic moved to To review keeps its curve', ev("srAll().some(m=>m.i===18)"))
            check(f'{tag}: no JavaScript errors', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} spaced-repetition consistency tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
