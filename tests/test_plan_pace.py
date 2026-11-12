"""Your pace and the dynamic "Refresh plan".

Pace: ticking a topic block (or finishing it in focus mode) notes how long it took against the estimate; per-topic
factors (pulled toward your overall pace) scale the minutes per question, so plan times follow how fast you really
are. Topic weights: plain-recall topics are quicker than chart and calculation topics.
Refresh: blocks already done but planned for later move before now (nothing overlaps) and the rest of today's time
is filled; topic blocks left undone on earlier days move forward ("moved"); a ticked topic is not planned again the
same day. None of it changes a statistic. Desktop and phone — personal and demo."""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA))]
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:300]))
# a clock fixed at 21:00 today that tests can move forward: window.__adv(minutes)
CLOCK = """(()=>{const D=Date,b=new D();b.setHours(21,0,0,0);let T=b.getTime();const R=D.now();
  class F extends D{constructor(...a){if(a.length)super(...a);else super(T+(D.now()-R))} static now(){return T+(D.now()-R)}}
  window.Date=F;window.__adv=m=>{T+=m*60000}})()"""
STATS = "JSON.stringify([forecast().mu, blended().mu, counts(), state.scores, state.events.length, (state.tests||[]).length])"
# a weekly plan: yesterday Weather (18) undone with its error review; today Human Factors (13) at 21:00 and Taxiing
# (22) at 22:00 in a 20:30–23:30 block
PLAN = """(()=>{const T=todayISO(),Y=addDays(T,-1),M=mondayOf(T);(state.plans||[]).forEach(p=>p.active=false);
  state.plans=(state.plans||[]).filter(p=>p.id!=='pP');state.paces=[];
  state.settings={...(state.settings||{}),testEvery:0}; /* no practice test: this is about topic blocks */
  const blocks={};for(let k=0;k<7;k++)blocks[addDays(M,k)]=[[1230,1410]];blocks[Y]=[[1230,1410]];
  state.plans.push({id:'pP',type:'weekly',name:'',start:M,active:true,blocks,items:[
    {id:'y1',date:Y,start:1230,min:40,kind:'topic',i:18,n:30,reason:'weak'},
    {id:'y2',date:Y,start:1270,min:10,kind:'reflect',reason:'reflect',of:'y1',parts:[{i:18,m:8}]},
    {id:'t1',date:T,start:1260,min:29,kind:'topic',i:13,n:20,reason:'due'},
    {id:'t1r',date:T,start:1289,min:10,kind:'reflect',reason:'reflect',of:'t1',parts:[{i:13,m:5}]},
    {id:'t2',date:T,start:1320,min:28,kind:'topic',i:22,n:20,reason:'due'}]});
  ['t1','t2'].forEach(()=>{});state.events=state.events.filter(e=>!(e.date===T&&(e.topic===13||e.topic===22)));save();render()})()"""

with sync_playwright() as p:
    b = getattr(p, os.environ.get("PPL_BROWSER", "chromium")).launch()
    for f in os.environ.get('PPL_FILES', 'index demo').split():
        for k, (mode, opts) in enumerate(DEV):
            tag = f'{f} · {mode}'; W = opts['viewport']['width']
            c = b.new_context(**opts); c.add_init_script(CLOCK); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: errs.append('browser dialog: ' + d.message) or d.dismiss())
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(500)
            ev = pg.evaluate
            ev("window.pplTour&&pplTour.end()"); ev(PLAN); pg.wait_for_timeout(150)
            stats0 = ev(STATS)

            # ---------- topic weights ----------
            w = ev("(()=>{const st=settings(),q=i=>{const m=srModel(i,todayISO(),true);return (60/st.qph)*1*1.15>0&&baseMinutesPerQ(i,st,m,0.8)};return {hf:q(13),pq:q(17),wx:q(18),xc:q(12),tx:q(22)}})()")
            check(f'{tag}: recall topics are quicker than chart topics, and calculation topics the slowest (Human Factors < Taxiing < Weather < Cross-Country)',
                  w['hf'] < w['tx'] < w['wx'] < w['xc'] and abs(w['hf'] - w['pq']) < w['tx'] - w['hf'] + 1, w)

            # ---------- pace from ticks ----------
            check(f'{tag}: no observations → your pace is the estimate (1×)', ev("paceFactor(13)") == 1 and ev("paceTable().n") == 0)
            ev("__adv(10)"); ev("toggleCheck('t1')"); pg.wait_for_timeout(100)   # 21:10: HF ticked 10 min after its planned 21:00 start
            o = ev("JSON.stringify(state.paces)")
            p1 = ev("state.paces[0]")
            check(f'{tag}: the first tick of the day measures from the block\'s planned start (10 min for 20 questions)', p1 and p1['topic'] == 13 and abs(p1['min'] - 10) < 0.6 and p1['n'] == 20 and p1['src'] == 'tick', o)
            check(f'{tag}: the tick keeps when it happened', ev("state.plans.find(p=>p.id==='pP').items.find(x=>x.id==='t1').checkedAt") > 0)
            ev("__adv(15)"); ev("toggleCheck('t2')"); pg.wait_for_timeout(100)    # 21:25: Taxiing 15 min after the previous tick
            p2 = ev("state.paces[1]")
            check(f'{tag}: the next tick measures from the previous tick (15 min)', p2 and p2['topic'] == 22 and abs(p2['min'] - 15) < 0.6, p2)
            f13, f22, f18 = ev("paceFactor(13)"), ev("paceFactor(22)"), ev("paceFactor(18)")
            check(f'{tag}: faster than estimated → factors below 1, pulled toward the overall pace (topics without data follow it)', 0.35 <= f13 < 1 and 0.35 <= f22 < 1 and f18 < 1 and f18 > min(f13, f22), (f13, f22, f18))
            per = ev("(()=>{const st=settings(),m=srModel(13,todayISO(),true);return [minutesPerQ(13,st,m,0.8),baseMinutesPerQ(13,st,m,0.8)]})()")
            check(f'{tag}: plan minutes per question follow your pace', abs(per[0] - per[1] * f13) < 1e-9, per)
            check(f'{tag}: an implausible time (a forgotten tick) is ignored', ev("notePace(13,20,500,'tick')") is False and ev("state.paces.length") == 2)
            ev("toggleCheck('t2')"); pg.wait_for_timeout(80)
            check(f'{tag}: unticking clears the tick time', not ev("state.plans.find(p=>p.id==='pP').items.find(x=>x.id==='t2').checkedAt"))
            ev("toggleCheck('t2')"); pg.wait_for_timeout(80)

            # ---------- refresh: done early → the rest of today's time is filled; yesterday's undone block moves forward ----------
            ev("__adv(5)")   # 21:30
            n = ev("(()=>{let n=0;commit(()=>{n=refreshPlans()},'r');return n})()"); pg.wait_for_timeout(150)
            its = ev("state.plans.find(p=>p.id==='pP').items.filter(x=>x.date>=addDays(todayISO(),-1)&&x.date<=addDays(todayISO(),1)).map(x=>({id:x.id,d:x.date,s:x.start,m:x.min,k:x.kind,i:x.i,r:x.reason,done:itemDone(x)}))")
            T, Y = ev("todayISO()"), ev("addDays(todayISO(),-1)")
            today = sorted([x for x in its if x['d'] == T], key=lambda x: x['s'])
            nowm = 21 * 60 + 30
            done = [x for x in today if x['done']]
            check(f'{tag}: the two blocks done early move before now and do not overlap', len(done) == 2 and all(x['s'] + x['m'] <= nowm + 15 for x in done) and done[0]['s'] + done[0]['m'] <= done[1]['s'], done)
            rv = [x for x in today if x['id'] == 't1r']
            check(f'{tag}: the error review of a finished topic is kept and comes right after now', rv and rv[0]['s'] >= nowm and not rv[0]['done'], rv)
            fresh = [x for x in today if not x['done'] and x['k'] == 'topic']
            check(f'{tag}: the rest of today\'s time is filled with new work after now', fresh and all(x['s'] >= nowm for x in fresh), today)
            check(f'{tag}: a topic ticked today is not planned again today', not any(x['i'] in (13, 22) for x in fresh), fresh)
            check(f'{tag}: nothing in today\'s plan overlaps', all(today[j]['s'] + today[j]['m'] <= today[j + 1]['s'] for j in range(len(today) - 1)), today)
            check(f'{tag}: yesterday\'s undone Weather block left yesterday (with its error review)', not any(x['d'] == Y for x in its), [x for x in its if x['d'] == Y])
            moved = [x for x in its if x['i'] == 18 and x['k'] == 'topic' and x['d'] >= T]
            check(f'{tag}: … and is planned again from today, marked "moved"', moved and moved[0]['r'] == 'carried', moved)
            allw = ev("state.plans.find(p=>p.id==='pP').items.filter(x=>x.i===18&&x.kind==='topic'&&x.reason==='carried').length")
            check(f'{tag}: the moved topic is placed once as "moved", not every day', allw == 1, allw)
            check(f'{tag}: refreshing changes no statistic', ev(STATS) == stats0)

            # ---------- focus mode feeds the pace with its stopwatch ----------
            ev("""(()=>{const T=todayISO(),p=state.plans.find(q=>q.id==='pP'),it=p.items.filter(x=>x.date===T&&x.kind==='topic'&&!itemDone(x)).sort((a,b)=>b.n-a.n)[0]; /* the biggest block: 40 min is a plausible time for it */
                localStorage.setItem(STORE+'-focus',JSON.stringify({key:'id:'+it.id,acc:40*60000,run:0}));window.__fit=it})()""")
            n0 = ev("state.paces.length"); ev("openFocus(__fit)"); pg.wait_for_timeout(100); ev("document.getElementById('focusDone').click()"); pg.wait_for_timeout(200)
            pf = ev("state.paces.at(-1)")
            check(f'{tag}: "Finished" in focus mode notes the stopwatch time (40 min)', ev("state.paces.length") == n0 + 1 and pf['src'] == 'focus' and abs(pf['min'] - 40) < 0.2, pf)
            ev("closeModal()")

            # ---------- kept in backups and synced ----------
            check(f'{tag}: the pace survives a backup round trip', ev("normalize(JSON.parse(JSON.stringify(state))).paces.length") == ev("state.paces.length"))
            if f == 'index':
                check(f'{tag}: sync unites the pace of two devices', ev("(()=>{const a=JSON.parse(JSON.stringify(state)),b=JSON.parse(JSON.stringify(state));b.paces=[...b.paces,{id:'pX',topic:6,date:todayISO(),n:10,min:9,est:15,src:'tick'}];b.updatedAt=(a.updatedAt||0)+5;return mergeStates(a,b).paces.length===a.paces.length+1})()"))
            # ---------- Settings: your pace and its reset ----------
            ev("document.getElementById('setOpen').click()"); pg.wait_for_timeout(200)
            txt = ev("document.getElementById('setPaceVal').textContent")
            check(f'{tag}: Settings shows your pace (factor and sessions)', '×' in txt and str(ev("state.paces.length")) in txt, txt)
            pg.click('#setPaceReset'); pg.wait_for_timeout(150)
            check(f'{tag}: Reset goes back to the estimate', ev("state.paces.length") == 0 and ev("paceFactor(13)") == 1)
            for l in ['pt', 'ja']:
                ev(f"document.querySelector('.flag[data-lang=\"{l}\"]').click()"); pg.wait_for_timeout(80)
                check(f'{tag} [{l}]: pace and "moved" are translated', ev("t('setPace')") != 'setPace' and ev("t('rs_carried')") != 'rs_carried' and ev("t('paceNone')") != 'paceNone')
            ev("document.querySelector('.flag[data-lang=\"en\"]').click()")
            check(f'{tag}: page fits the screen', ev('document.documentElement.scrollWidth') <= W)
            check(f'{tag}: no script errors or browser pop-ups', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} pace & refresh tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
