"""Whole-app audit: every view and dialog, in 3 languages, on desktop, laptop, iPad mini and iPhone, personal and demo.
Looks for what a person would notice: placeholders left in the text ({G}, {n} …), "undefined" / "NaN" / "null",
untranslated English on the Portuguese and Japanese screens, the page wider than the screen, elements sticking out,
JavaScript errors, browser pop-ups. Then checks that the same number is the same everywhere it is shown
(forecast, recall, heat, volume, progress, practice tests, today's plan, carousel)."""
import os, sys, re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA))]
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:300]))

# text that must never be visible
SCAN = r"""(()=>{const out=[];const walk=n=>{for(const c of n.childNodes){if(c.nodeType===3){const el=c.parentElement;if(!el||el.closest('script,style,#selftestBox'))continue;
  const s=el.getBoundingClientRect();if(!s.width&&!s.height)continue;if(getComputedStyle(el).visibility==='hidden')continue;const v=c.textContent;
  if(/\{[A-Za-z]{1,3}\}|\bundefined\b|\bNaN\b|\bnull\b|\bInfinity\b/.test(v))out.push(v.trim().slice(0,80))}else if(c.nodeType===1&&!c.hidden)walk(c)}};walk(document.body);return out.slice(0,6)})()"""
# visible elements sticking out on the right (outside any horizontal scroller)
OUTSIDE = r"""(()=>{const W=innerWidth,bad=[];document.querySelectorAll('body *').forEach(e=>{if(e.closest('svg')&&e.tagName!=='svg')return;const r=e.getBoundingClientRect();if(!r.width||r.right<=W+1)return;
  let p=e.parentElement,clipped=false;while(p&&p!==document.body){const st=getComputedStyle(p);if(/(auto|scroll|hidden)/.test(st.overflowX)||/(auto|scroll|hidden)/.test(st.overflow)){const pr=p.getBoundingClientRect();if(pr.right<=W+1){clipped=true;break}}p=p.parentElement}
  if(!clipped&&e.offsetParent!==null)bad.push((e.id||String(e.className).split(' ')[0]||e.tagName)+':'+Math.round(r.right))});return bad.slice(0,5)})()"""
# English words that would mean a missing translation on a pt / ja screen (whole words, visible text only)
ENGLISH = ['Settings', 'Today', 'Review', 'Plans', 'Weekly plan', 'Daily plan', 'Practice tests', 'Question bank', 'Save', 'Cancel', 'questions planned', 'Heat map', 'Needs recall', 'Study volume', 'My plans', 'New plan', 'Sync with Kanban']

VIEWS = [('dashboard', "goView('dash')"), ('plan · week', "goView('plan')"), ('plan · my plans', "goView('plan');document.querySelector('#pwTabs [data-pw=\"plans\"]').click()"),
         ('practice tests', "goView('tests')"), ('statistics · bank', "goView('sr');setStat('bank')"), ('statistics · tests', "goView('sr');setStat('tests')")]
DIALOGS = [('settings', "document.getElementById('setOpen').click()", '#setbg'),
           ('wizard · type', "openWizard({mode:'new'})", '#wizbg'),
           ('wizard · time blocks', "openWizard({mode:'new'});wizardState().blocks[todayISO()]=[[1140,1260]];document.getElementById('wzNext').click()", '#wizbg'),
           ('wizard · topics', "openWizard({mode:'new'});document.getElementById('wzNext').click();wizardState().blocks[todayISO()]=[[1140,1260]];wizardState().changed.add(todayISO());document.getElementById('wzNext').click()", '#wizbg'),
           ('wizard · review', "openWizard({mode:'new'});document.getElementById('wzNext').click();wizardState().blocks[todayISO()]=[[1140,1260]];wizardState().changed.add(todayISO());document.getElementById('wzNext').click();document.getElementById('wzNext').click()", '#wizbg'),
           ('sync with Kanban', "goView('plan');document.getElementById('kbSync').click()", '#kbbg'),
           ('heat-map history', "goView('sr');setStat('bank');document.getElementById('heatOpen').click()", '#heatbg'),
           ('study volume', "goView('dash');document.getElementById('volOpen').click()", '#volbg'),
           ('forecast top 3', "goView('dash');document.getElementById('fcMini').click()", '#fcTopBg'),
           ('log a session', "openModal(18,'review')", '#modalbg'),
           ('log a practice test', "openPt()", '#ptbg'),
           ('day summary', "goView('dash');document.querySelector('.day[data-date]').click()", '#daybg')]
CLOSE = "document.querySelectorAll('.modalbg').forEach(m=>m.hidden=true);window.closeWizard&&wizardState()&&closeWizard();document.getElementById('askbg').hidden=true"

with sync_playwright() as p:
    b = p.chromium.launch()
    for f in ['index', 'demo']:
        for mode, opts in DEV:
            c = b.new_context(**opts); pg = c.new_page(); errs = []; pops = []
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: pops.append(d.message) or d.dismiss())
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(500)
            ev = pg.evaluate; W = opts['viewport']['width']
            ev("window.pplTour&&pplTour.end()")
            if f == 'demo':  # make sure plans show up in the audit too
                ev("(()=>{const p=state.plans[0];if(p){p.start=mondayOf(todayISO());const sh=-7;p.items.forEach(it=>it.date=addDays(it.date,sh));const nb={};Object.entries(p.blocks).forEach(([d,r])=>nb[addDays(d,sh)]=r);p.blocks=nb;save();render()}})()")
            for L in ['en', 'pt', 'ja']:
                ev(f"document.querySelector('.flag[data-lang=\"{L}\"]').click()"); pg.wait_for_timeout(150)
                tag = f'{f} · {mode} · {L}'
                for name, js in VIEWS:
                    ev(CLOSE); ev(js); pg.wait_for_timeout(350)
                    bad = ev(SCAN); out = ev(OUTSIDE); wide = ev('document.documentElement.scrollWidth')
                    eng = [] if L == 'en' else [w for w in ENGLISH if re.search(r'(^|\W)' + re.escape(w) + r'(\W|$)', pg.inner_text('body'))]
                    check(f'{tag} · {name}: clean text, fits the screen{"" if L == "en" else ", translated"}', not bad and not out and wide == W and not eng, (bad, out, wide, eng))
                for name, js, sel in DIALOGS:
                    ev(CLOSE); ev("goView('dash')"); pg.wait_for_timeout(100)
                    try: ev(js)
                    except Exception as e: check(f'{tag} · {name}: opens', False, e); continue
                    pg.wait_for_timeout(350)
                    vis = pg.is_visible(sel)
                    bad = ev(SCAN); wide = ev('document.documentElement.scrollWidth')
                    inside = ev(f"(()=>{{const m=document.querySelector('{sel} .modal');if(!m)return true;const r=m.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1}})()")
                    eng = [] if L == 'en' else [w for w in ENGLISH if re.search(r'(^|\W)' + re.escape(w) + r'(\W|$)', pg.inner_text(sel))]
                    check(f'{tag} · dialog {name}: opens, clean text, inside the screen{"" if L == "en" else ", translated"}', vis and not bad and wide == W and inside and not eng, (vis, bad, wide, inside, eng))
                ev(CLOSE)
            ev("document.querySelector('.flag[data-lang=\"en\"]').click()")

            # ---------- the same number everywhere (desktop and phone are enough) ----------
            if mode in ('desktop', 'phone'):
                tag = f'{f} · {mode}'
                ev("goView('dash')"); pg.wait_for_timeout(300)
                check(f'{tag}: exam forecast — dashboard = blended forecast', pg.inner_text('#fcMiniVal') == f"{round(ev('blended().mu') * 100)}%")
                ev("goView('sr');setStat('bank')"); pg.wait_for_timeout(350)
                check(f'{tag}: exam forecast — Statistics header = dashboard', f"{round(ev('blended().mu') * 100)}%" in pg.inner_text('#fcOverall'))
                k = ev("[...document.querySelectorAll('#fcKpis b')].map(b=>b.textContent)")
                f0 = ev("(()=>{const f=forecast(),x=forecast(todayISO(),state.deadline);return [f.mu,f.pass,f.goal,x.mu].map(v=>Math.round(v*100)+'%')})()")
                check(f'{tag}: question-bank KPIs = forecast()', k == f0, (k, f0))
                srk = ev("[...document.querySelectorAll('#srKpis b')].map(b=>b.textContent)")
                exp = ev("(()=>{const a=srAll();return [pct(wavg(a)),String(a.filter(m=>!m.reps.length||m.over>=0).length),String(a.length)]})()")
                check(f'{tag}: recall KPIs (heat-map header) = spaced-repetition model', srk == exp, (srk, exp))
                tiles = ev("[...document.querySelectorAll('#heatNow .hnt:not(.empty)')].map(x=>[+x.dataset.hi,x.querySelector('b').textContent])")
                check(f'{tag}: every heat tile = chance of a right answer today', all(str(ev(f"heatAt({i},todayISO()).heat")) == v for i, v in tiles), tiles[:3])
                lost = ev("[...document.querySelectorAll('#fcLost .lostrow')].map(r=>+r.dataset.q)")
                check(f'{tag}: "where you lose" = forecast parts, most lost first', lost == ev("forecast().parts.slice().sort((a,b)=>b.lost-a.lost).slice(0,8).map(x=>x.i)"))
                vt = pg.inner_text('#svTotal').replace(',', '').replace('.', '').replace(' ', '').replace(' ', '')
                check(f'{tag}: study volume total = sum of the chosen range', vt == str(ev("rangeSeries(volRange).reduce((a,x)=>a+x.q,0)")), vt)
                sc = ev("document.getElementById('scTitle').textContent")
                check(f'{tag}: needs-recall carousel shows a topic from today\'s plan (or lowest recall)', sc == '' or ev(f"(()=>{{const L=carList().filter(i=>i!=null);const n={sc!r};return L.length?L.some(i=>TOPICS[i].name===n):srAll().some(m=>TOPICS[m.i].name===n)}})()"), sc)
                ev("goView('dash')"); pg.wait_for_timeout(250)
                wk = pg.inner_text('#volWeek').replace(',', '').replace('.', '').replace(' ', '')
                check(f'{tag}: "this week" volume = weekly volume', wk == str(ev("weeklyVolume(12).at(-1).q")), wk)
                prog = ev("[...document.querySelectorAll('.lg')].map(x=>x.innerText)")
                cnt = ev("STATUS.map(s=>TOPICS.reduce((a,x,i)=>a+(state.statuses[i]===s?x.q:0),0))")
                check(f'{tag}: progress legend = question counts per list, totals 1,058', sum(cnt) == 1058 and all(f'{n:,} q'.replace(',', ',') in t or f'{n} q' in t for n, t in zip(cnt, prog)), (cnt, prog))
                tot = pg.inner_text('#planMiniTot')
                T = ev("(()=>{const T=todayPlan();return [T.items.reduce((a,x)=>a+(x.n||0),0)]})()")
                check(f'{tag}: today\'s plan header total = its items', f'{T[0]} q' in tot, (tot, T))
                rows = ev("document.querySelectorAll('#sugg .qrow').length")
                check(f'{tag}: today\'s list has one row per item', rows == ev("todayPlan().items.length"), rows)
                lanes = ev("[...document.querySelectorAll('.lane')].map(l=>l.querySelectorAll('.task').length)")
                check(f'{tag}: Kanban columns = the lists (26 cards)', sum(lanes) == 26 and lanes == ev("STATUS.map(s=>state.statuses.filter(x=>x===s).length)"), lanes)
                ev("goView('tests')"); pg.wait_for_timeout(300)
                tk = ev("[...document.querySelectorAll('#tsKpis b')].map(b=>b.textContent)")
                kk = ev("(()=>{const k=testKpis();return [k.last,k.best,k.avg3].map(v=>v==null?'—':Math.round(v)+'%')})()")
                check(f'{tag}: practice-test KPIs = the logged tests', tk[:3] == kk, (tk, kk))
            check(f'{f} · {mode}: no JavaScript errors, no browser pop-ups anywhere', not errs and not pops, (errs, pops))
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} audit checks passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
