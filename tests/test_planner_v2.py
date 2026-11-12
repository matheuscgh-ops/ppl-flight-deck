"""Planner v2: evidence, mastery and confidence; the official FAA share by ACS area; one policy for the daily list, the
calendar and the week; energy and time; projections that are never evidence; practice tests analysed by an AI
(import, preview, validation, duplicates, atomic apply, undo); explanations under each suggestion; backups, sync and
old data. Desktop and phone — personal and demo."""
import os, sys, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 1440, 'height': 900})),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA))]
FULL = open(os.path.join(ROOT, 'docs', 'examples', 'exam-full.json'), encoding='utf-8').read()
ERRS = open(os.path.join(ROOT, 'docs', 'examples', 'exam-errors-only.json'), encoding='utf-8').read()
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:400]))
# a clean slate with a few topics' history (all dates relative to today)
FIX = """(evs=>{const T=todayISO();state.events=evs.map((e,k)=>({id:'f'+k,from:null,to:null,score:null,partial:false,demo:false,...e,date:addDays(T,-e.ago)}));
  state.tests=[];state.exams=[];state.paces=[];(state.plans||[]).forEach(p=>p.active=false);state.deadline=addDays(T,40);
  state.settings={...(state.settings||{}),minutes:180,qph:40,testEvery:0,reviewMin:1.5};state.plan=null;
  state.scores=TOPICS.map(()=>null);save();render()})"""
STATE = "JSON.stringify([state.events,state.tests,state.exams||[],state.scores,state.statuses])"

with sync_playwright() as p:
    b = getattr(p, os.environ.get('PPL_BROWSER', 'chromium')).launch()
    for f in os.environ.get('PPL_FILES', 'index demo').split():
        for mode, opts in DEV:
            tag = f'{f} · {mode}'; W = opts['viewport']['width']
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: errs.append('browser dialog: ' + d.message) or d.dismiss())
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(500)
            ev = pg.evaluate
            ev("window.pplTour&&pplTour.end()")
            fix = lambda evs: ev(f"({FIX})({json.dumps(evs)})")

            # ---------- evidence, mastery, confidence ----------
            fix([{'ago': 6, 'topic': 18, 'kind': 'study', 'score': 50, 'right': 5, 'total': 10, 'attempt': 'first'},
                 {'ago': 6, 'topic': 18, 'kind': 'review', 'score': 100, 'right': 10, 'total': 10, 'attempt': 'repeat'}])
            m = ev("(()=>{const m=srModel(18);return {mast:m.mastery,S:m.S,reps:m.reps.length,p:m.reps[0].p}})()")
            check(f'{tag}: 50% then 100% on the same questions does not erase the first difficulty (mastery stays near 60%, the review counts the first try)',
                  m['mast'] < 0.65 and m['reps'] == 1 and m['p'] == 50 and abs(m['S'] - 1) < 1e-9, m)
            fix([{'ago': 6, 'topic': 18, 'kind': 'study', 'score': 50},
                 {'ago': 6, 'topic': 18, 'kind': 'review', 'score': 100}])
            check(f'{tag}: old records of one day (no kind of attempt): the first counts, the later one is a retake — never the best score',
                  ev("srModel(18).reps[0].p") == 50 and ev("srModel(18).mastery") < 0.7)
            fix([{'ago': 3, 'topic': 13, 'kind': 'study', 'score': 100, 'right': 2, 'total': 2}])
            a = ev("(()=>{const m=srModel(13);return [m.mastery,m.confLevel,m.reps.length]})()")
            fix([{'ago': 3, 'topic': 13, 'kind': 'study', 'score': 100, 'right': 40, 'total': 40}])
            bb = ev("(()=>{const m=srModel(13);return [m.mastery,m.confLevel,m.reps.length]})()")
            check(f'{tag}: 2/2 and 40/40 give different confidence (low vs high) and mastery (2/2 stays far from 100%)',
                  a[1] == 'low' and bb[1] == 'high' and a[0] < 0.85 and bb[0] > 0.9 and a[0] < bb[0], [a, bb])
            check(f'{tag}: 2 questions do not even count as a review (they would postpone the whole topic)', a[2] == 0 and bb[2] == 1, [a, bb])
            fix([{'ago': 10, 'topic': 22, 'kind': 'study', 'score': 80},
                 {'ago': 2, 'topic': 22, 'kind': 'review', 'score': 65}])
            s = ev("(()=>{const m=srModel(22);return [m.reps[0].S,m.S]})()")
            check(f'{tag}: a weak result (65%) does not lengthen the interval (S stays)', abs(s[0] - s[1]) < 1e-9, s)
            fix([{'ago': 20, 'topic': 22, 'kind': 'study', 'score': 90}, {'ago': 1, 'topic': 22, 'kind': 'review', 'score': 40}])
            check(f'{tag}: a miss after a long gap is "forgetting"; right after, "understanding"', ev("srModel(22).diag") == 'forgetting')
            fix([{'ago': 2, 'topic': 22, 'kind': 'study', 'score': 90}, {'ago': 1, 'topic': 22, 'kind': 'review', 'score': 40}])
            check(f'{tag}: … a miss while recall was still high is "understanding"', ev("srModel(22).diag") == 'understanding')
            fix([{'ago': 2, 'topic': 22, 'kind': 'study', 'score': 70, 'right': 7, 'total': 10, 'attempt': 'after'}])
            check(f'{tag}: a score typed after seeing the answers is neither evidence nor a review', ev("(()=>{const m=srModel(22);return m.reps.length===0&&m.obs===null})()"))

            # ---------- round 2: following progress, interval cap, fitted retention, area floor ----------
            fix([{'ago': 12 - 2 * k, 'topic': 22, 'kind': 'review' if k else 'study', 'score': 55 + 7 * k, 'right': 11 + 1 * k, 'total': 20} for k in range(6)])
            mm = ev("srModel(22).mastery")
            check(f'{tag}: mastery follows steady progress (55 → 90%: estimate near the latest result, not the old average)', mm > 0.8, mm)
            fix([{'ago': 40, 'topic': 13, 'kind': 'study', 'score': 95}, {'ago': 30, 'topic': 13, 'kind': 'review', 'score': 98}, {'ago': 1, 'topic': 13, 'kind': 'review', 'score': 99}])
            ev("state.deadline=addDays(todayISO(),10)")
            gap = ev("(()=>{const m=srModel(13);return diffDays(m.last,m.next)})()")
            check(f'{tag}: no review is planned further than 30% of the days left to the exam (10 days → at most 3)', gap <= 3, gap)
            sc = ev("retentionScale()")
            check(f'{tag}: with fewer than 20 pairs of sessions the forecast keeps the default curve (c = 1)', sc == 1, sc)
            fix([{'ago': 2 * (8 - k), 'topic': t, 'kind': 'review' if k else 'study', 'score': 70 + 2 * k} for t in (13, 22, 18) for k in range(8)])
            sc = ev("retentionScale()")
            check(f'{tag}: a history with no forgetting between sessions fits a slower curve (c > 1)', sc > 1, sc)
            fl = ev("""(()=>{const T=todayISO(),b={};for(let k=0;k<7;k++)b[addDays(T,k)]=[[1140,1320]];const o=suggestDays(Object.keys(b),b,{});
              const a=new Set();Object.values(o).forEach(l=>l.forEach(x=>{if(x.kind==='topic')a.add(examShare(x.i).area)}));return [...a]})()""")
            check(f'{tag}: a week of plans reaches every ACS area with a topic the planner can study (area floor)', len(fl) >= 7, fl)

            # ---------- official share by ACS area ----------
            w = ev("(()=>{const s=TOPICS.map((_,i)=>examShare(i).share);return {sum:s.reduce((a,x)=>a+x,0),un:EXAM_SHARE.unmapped,areas:ACS_AREAS.reduce((a,x)=>a+x.share,0),iv:examShare(26).share+examShare(27).share,wx:examShare(18).share,src:ACS_SOURCE.checked}})()")
            check(f'{tag}: shares: the 11 ACS areas add to 100%, topics + the 9% with no Sporty\'s topic add to 100%', w['areas'] == 100 and abs(w['sum'] + w['un'] - 1) < 1e-9 and abs(w['un'] - 0.09) < 1e-9, w)
            check(f'{tag}: an area\'s share is split among its topics, never given whole to each (IV = 20% for both its topics; Weather < 22%)', abs(w['iv'] - 0.20) < 1e-9 and w['wx'] < 0.22, w)
            check(f'{tag}: the source and the day it was checked are stored', w['src'] == '2026-11-11')
            fix([])
            r = ev("(()=>{const c=topicCands(todayISO(),{mode:'medium',minutesFor:(i,m,p)=>minutesSplit(i,settings(),m,p)});const f=forecastMu();return {risk:c.every(x=>Math.abs(x.risk-60*examShare(x.i).share*(1-x.pExam))<1e-9),fw:f.parts.every(x=>Math.abs(x.w-examShare(x.i).share)<1e-12)}})()")
            check(f'{tag}: the same share drives the forecast and the planner, once (risk = 60 × share × (1 − p), no second multiplier)', r['risk'] and r['fw'], r)

            # ---------- energy, time, one policy ----------
            fix([{'ago': 9, 'topic': 18, 'kind': 'study', 'score': 40}, {'ago': 8, 'topic': 7, 'kind': 'study', 'score': 50},
                 {'ago': 7, 'topic': 13, 'kind': 'study', 'score': 92}, {'ago': 7, 'topic': 12, 'kind': 'study', 'score': 88}])
            for budget in (30, 75, 180):
                ev(f"state.settings.minutes={budget}")
                mins = ev("['low','medium','high'].map(m=>buildPlan(todayISO(),null,m)).map(P=>[P.minutes,P.budget])")
                check(f'{tag}: {budget} min → every energy stays within the time you gave (no stretch)', all(x[0] <= budget and x[1] == budget for x in mins), mins)
            ev("state.settings.minutes=180")
            L = ev("buildPlan(todayISO(),null,'low').items.filter(x=>x.kind==='topic'&&!x.done).map(x=>[x.n,hardnessOf(x)])")
            check(f'{tag}: low energy in the daily list: chunks of 20 questions at most, easiest first', L and all(x[0] <= 20 for x in L) and all(L[k][1] <= L[k + 1][1] + 1e-9 for k in range(len(L) - 1)), L)
            cal = ev("""(()=>{const d=todayISO(),its=packDay(d,[[1140,1320]],'low');const tp=its.filter(x=>x.kind==='topic');
              const h=tp.map(x=>{const c=topicCands(d,{mode:'low',minutesFor:(i,m,p)=>minutesSplit(i,settings(),m,p)}).find(y=>y.i===x.i);return hardnessOf(c)});
              return {n:tp.map(x=>x.n),h,end:Math.max(...its.map(x=>x.start+x.min)),test:its.some(x=>x.kind==='test')}})()""")
            check(f'{tag}: low energy in the calendar too: 20-question chunks at most, easiest first, nothing past the block', cal['n'] and all(n <= 20 for n in cal['n']) and all(cal['h'][k] <= cal['h'][k + 1] + 1e-9 for k in range(len(cal['h']) - 1)) and cal['end'] <= 1320, cal)
            same = ev("""(()=>{const d=todayISO(),mf=(i,m,p)=>minutesSplit(i,settings(),m,p),A=topicCands(d,{mode:'medium',minutesFor:mf,withReview:true}),B=topicCands(d,{mode:'medium',minutesFor:mf,withReview:false});
              return A.length===B.length&&A.every((x,k)=>x.i===B[k].i&&x.reason===B[k].reason&&Math.abs(x.value-B[k].value)<1e-12)})()""")
            check(f'{tag}: the daily list and the calendar take the same candidates, reasons and values (only the layout differs)', same)
            pace = ev("""(()=>{state.paces=[];const T=todayISO();for(let k=0;k<6;k++)state.paces.push({id:'p'+k,topic:18,date:T,n:10,min:40,est:20,src:'tick',basis:'answer'});
              state.paces.push({id:'old',topic:13,date:T,n:10,min:80,est:20,src:'tick'});
              const st=settings(),m=srModel(18,T,true),p=chanceAt(m,T),s=minutesSplit(18,st,m,p),f=paceFactor(18);
              const a0=(60/st.qph)*diffOf(18)*easeOf(m),r0=(1-p)*st.reviewMin*diffOf(18);
              const c=topicCands(T,{mode:'medium',minutesFor:(i,mm,pp)=>minutesSplit(i,st,mm,pp),withReview:true}).find(x=>x.i===18);
              return {f,ra:s.answer/a0,rr:s.review/r0,per:c?Math.abs(c.per-(s.answer+s.review))<1e-9:null,old:paceFactor(13)}})()""")
            check(f'{tag}: a pace ≠ 1× scales answering and review by the same factor (one unit, one factor)', pace['f'] > 1.2 and abs(pace['ra'] - pace['f']) < 1e-9 and abs(pace['rr'] - pace['f']) < 1e-9 and pace['per'], pace)
            check(f'{tag}: old pace records (estimate covered answering + review, block timed answering only) are not used', abs(pace['old'] - ev("paceTable().all")) < 1e-9, pace)
            ev("state.paces=[]")

            # ---------- weekly projection ----------
            fix([{'ago': 4, 'topic': 22, 'kind': 'study', 'score': 60, 'right': 24, 'total': 40}])
            ev("state.statuses[22]='Not Comfortable'")
            before = ev(STATE)
            wk = ev("""(()=>{const T=todayISO(),b={};for(let k=0;k<7;k++)b[addDays(T,k)]=[[1140,1320]];const o=suggestDays(Object.keys(b),b,{});
              return Object.values(o).map(l=>l.filter(x=>x.kind==='topic'&&x.i===22).length)})()""")
            check(f'{tag}: the weak topic is planned during the week', sum(wk) >= 1, wk)
            # a projected session repeats the current mastery (about 60%): stability does not grow and the topic stays weak
            proj = ev("""(()=>{const T=todayISO(),m0=srModel(22,T,true),mb=srModel(22,addDays(T,1),true);state.events.push({id:'pj',date:T,topic:22,kind:'review',score:Math.round(m0.mastery*100),total:40,attempt:'new',proj:true,partial:false,demo:false});
              const m1=srModel(22,addDays(T,1),true);state.events.pop();return {S0:mb.S,S1:m1.S,m0:mb.mastery,m1:m1.mastery}})()""")
            check(f'{tag}: the week does not turn 60% into success: a projected session neither grows stability nor raises mastery', proj['S1'] <= proj['S0'] + 1e-9 and abs(proj['m1'] - proj['m0']) < 1e-9 and proj['m0'] < 0.7, proj)
            check(f'{tag}: projected sessions never become evidence (data unchanged after planning a week)', ev(STATE) == before)

            # ---------- coverage ----------
            # every other topic studied yesterday; Emergency Descent (2 q, 0.4% of the test) last touched 30 days ago
            fix([{'ago': 30, 'topic': 3, 'kind': 'study', 'score': 70}] + [{'ago': 1, 'topic': k, 'kind': 'study', 'score': 75} for k in range(28) if k != 3])
            ev("state.statuses=state.statuses.map(()=>'Very Comfortable')")
            cov = ev("(()=>{const c=topicCands(todayISO(),{mode:'medium',minutesFor:(i,m,p)=>minutesSplit(i,settings(),m,p)});const x=c.find(y=>y.i===3);const F=y=>y.n*(y.answer+y.review),d=c.map(y=>y.value/F(y)).sort((a,b)=>a-b);return x&&{r:x.reason,ok:x.value/F(x)>=d[Math.floor(d.length/2)]-1e-12}})()")
            check(f'{tag}: a tiny topic idle for 30 days (Emergency Descent, 2 q) is lifted to the day\'s median value (coverage)', cov and cov['ok'], cov)
            nlift = ev("(()=>{const T=todayISO();state.events=state.events.filter(e=>e.topic===3);return topicCands(T,{mode:'medium',minutesFor:(i,m,p)=>minutesSplit(i,settings(),m,p)}).filter(x=>x.covered).length})()")
            check(f'{tag}: coverage lifts at most 2 topics a day (they rotate in without crowding out reviews)', nlift <= 2, nlift)

            # ---------- import: errors only ----------
            fix([{'ago': 5, 'topic': 18, 'kind': 'study', 'score': 80, 'right': 32, 'total': 40}])
            before = ev(STATE)
            m0 = ev("JSON.stringify([srModel(18).obs,srModel(14).obs,srModel(16).obs])")
            ev("goView('tests')"); pg.wait_for_timeout(150)
            ev("document.getElementById('tsImport').click()"); pg.wait_for_timeout(150)
            pg.fill('#exIn', ERRS); pg.wait_for_timeout(200)
            check(f'{tag}: errors-only preview: uncertain question highlighted, confirm enabled, nothing applied yet',
                  ev("document.querySelectorAll('#exPrev .exq.unsure').length") >= 1 and not ev("document.getElementById('exOk').disabled") and ev(STATE) == before)
            ev("document.getElementById('exOk').click()"); pg.wait_for_timeout(200)
            x = ev("(()=>{const e=state.exams[0];return {n:state.exams.length,topics:e.topics.length,misses:e.misses.length,test:state.tests.find(t=>t.exam===e.examId)}})()")
            check(f'{tag}: errors only: no topic score (no denominator), misses kept, overall 51/60 recorded because total and wrong are known',
                  x['n'] == 1 and x['topics'] == 0 and x['misses'] == 3 and x['test'] and x['test']['score'] == 85, x)
            check(f'{tag}: errors only: topics keep their observed results (none becomes 0% or 100%)', ev("JSON.stringify([srModel(18).obs,srModel(14).obs,srModel(16).obs])") == m0)
            check(f'{tag}: errors only: a topic with misses is due for review now', ev("srModel(18).over") >= 0 and ev("!!srModel(18).examMisses"))
            check(f'{tag}: the suggestion explains it (misses imported, the tags)', 'METAR' in ev("(()=>{const c=topicCands(todayISO(),{mode:'medium',minutesFor:(i,m,p)=>minutesSplit(i,settings(),m,p),withReview:true}).find(x=>x.i===18);return whyText(c,true)})()"))
            # undo
            ev("document.querySelector('#toast button').click()"); pg.wait_for_timeout(200)
            check(f'{tag}: Undo restores the state from before the import', ev(STATE) == before)

            # ---------- import: full, duplicate, invalid ----------
            ev("document.getElementById('tsImport').click()"); pg.wait_for_timeout(150)
            pg.fill('#exIn', FULL); pg.wait_for_timeout(200)
            ev("document.getElementById('exOk').click()"); pg.wait_for_timeout(200)
            y = ev("(()=>{const m=srModel(18),a=srModel(25);return {ex:state.exams.length,tests:state.tests.length,obs:m.obs,repsWx:m.reps.length,spin:a.obs,scores18:state.scores[18]}})()")
            check(f'{tag}: full result: Weather 5/10 becomes evidence with its sample; a topic not in the test (Spin Awareness) gets nothing',
                  y['ex'] == 1 and y['obs']['right'] == 5 and y['obs']['total'] == 10 and y['obs']['src'] == 'exam' and (y['spin'] is None or y['spin'].get('src') != 'exam'), y)
            check(f'{tag}: the Sporty\'s score of the card is not overwritten by an imported result', y['scores18'] is None, y)
            bl = ev("(()=>{const b=blended(),t=state.tests.at(-1);return {skip:forecast(todayISO(),null,new Set([t.exam])).mu,model:b.model,with:forecast().mu}})()")
            check(f'{tag}: blended forecast: the model part leaves out this test\'s topic results (its overall score already counts)', abs(bl['skip'] - bl['model']) < 1e-12 and bl['with'] != bl['model'], bl)
            after1 = ev(STATE)
            ev("document.getElementById('tsImport').click()"); pg.wait_for_timeout(150)
            pg.fill('#exIn', FULL); pg.wait_for_timeout(200)
            check(f'{tag}: importing the same test again is refused (no duplicate evidence)', ev("document.getElementById('exOk').disabled") and 'exDupExam' in ev(f"checkExam({FULL}).errors.map(e=>e[0])"))
            alt = json.loads(FULL); alt['examId'] = 'other-id'
            pg.fill('#exIn', json.dumps(alt)); pg.wait_for_timeout(200)
            check(f'{tag}: the same content under another id is refused too', ev("document.getElementById('exOk').disabled"))
            bad = json.loads(FULL); bad['examId'] = 'bad-1'; bad['topics'][0]['right'] = 12
            pg.fill('#exIn', json.dumps(bad)); pg.wait_for_timeout(200)
            check(f'{tag}: invalid file (more right than questions) cannot be confirmed', ev("document.getElementById('exOk').disabled"))
            ev("document.getElementById('exOk').click()"); pg.wait_for_timeout(150)
            ev("applyExam(null)")
            check(f'{tag}: an invalid import changes nothing', ev(STATE) == after1)
            for label, mut in [('unknown topic', lambda o: o['topics'][0].update(topicId='nope')),
                               ('right + wrong ≠ total', lambda o: o['topics'][1].update(wrong=5)),
                               ('duplicate question id', lambda o: o['questions'].append(dict(o['questions'][0]))),
                               ('future date', lambda o: o.update(date='2099-01-01')),
                               ('topics do not add to the total', lambda o: o['overall'].update(total=61, wrong=14))]:
                o = json.loads(FULL); o['examId'] = 'v-' + label; mut(o)
                errs_ = ev(f"checkExam({json.dumps(o)}).errors.map(e=>e[0])")
                check(f'{tag}: validation: {label} → refused', len(errs_) > 0, errs_)
            eo = json.loads(ERRS); eo['examId'] = 'e2'; eo['topics'] = [{'topicId': 'weather-information', 'total': 10, 'right': 7}]
            check(f'{tag}: validation: errors only cannot carry a topic score', 'exErrorsNoScore' in ev(f"checkExam({json.dumps(eo)}).errors.map(e=>e[0])"))
            pg.keyboard.press('Escape'); ev("document.getElementById('exCancel').click()")
            # edit in the preview: re-classify the uncertain question
            ev("state.exams=[];state.tests=[];save()")
            ev("document.getElementById('tsImport').click()"); pg.wait_for_timeout(150)
            pg.fill('#exIn', ERRS); pg.wait_for_timeout(200)
            sel = pg.locator('#exPrev select[data-q="3"]')
            sel.select_option('navigation-systems-and-radar-services'); pg.wait_for_timeout(200)
            check(f'{tag}: the preview can re-classify a question (no more unclassified)', 'exUnclassifiedN' not in ev("checkExam(JSON.parse(document.getElementById('exIn').value)).warnings.map(w=>w[0])"))
            ev("document.getElementById('exCancel').click()"); pg.wait_for_timeout(100)
            check(f'{tag}: Cancel imports nothing', ev("state.exams.length") == 0)

            # ---------- backup, sync, old data ----------
            ev(f"(()=>{{const r=checkExam({FULL});state=applyExam(r.exam);save()}})()")
            ev("state.events.push({id:'nn',date:todayISO(),topic:9,kind:'study',score:80,right:8,total:10,attempt:'first',partial:false,demo:false});state.paces=[{id:'pa',topic:9,date:todayISO(),n:10,min:20,est:15,src:'tick',basis:'answer'}]")
            rt = ev("""(()=>{const n=normalize(JSON.parse(JSON.stringify(state)));const e=n.events.find(x=>x.id==='nn');
              const m=mergeStates({...JSON.parse(JSON.stringify(state)),exams:[],updatedAt:2},{...JSON.parse(JSON.stringify(state)),updatedAt:1});
              return {ex:n.exams.length&&n.exams[0].topics.length,sig:!!n.exams[0].sig,e:[e.right,e.total,e.attempt],pace:n.paces[0].basis,merged:m.exams.length,test:n.tests.at(-1).exam}})()""")
            check(f'{tag}: backup / sync keep the new data (imported tests, right/total, attempt, pace basis) and the merge unites imported tests',
                  rt['ex'] > 0 and rt['sig'] and rt['e'] == [8, 10, 'first'] and rt['pace'] == 'answer' and rt['merged'] == 1 and rt['test'], rt)
            old = ev("""(()=>{const o=JSON.parse(JSON.stringify(state));delete o.exams;o.events=o.events.map(e=>{const {right,total,attempt,...r}=e;return r});o.tests=o.tests.map(({exam,right,...r})=>r);
              const n=normalize(o);state=n;render();return {ok:!!n,mu:forecast().mu,plan:buildPlan().items.length}})()""")
            check(f'{tag}: data saved before (no exams, no counts) still loads and plans', old['ok'] and 0 < old['mu'] < 1 and old['plan'] > 0, old)
            # explanation on the dashboard
            ev("state.exams=[];state.tests=[];(state.plans||[]).forEach(p=>p.active=false);save();goView('dash');render()"); pg.wait_for_timeout(200)
            check(f'{tag}: every suggested topic says what to do and why', ev("[...document.querySelectorAll('#sugg .qrow[data-q]')].filter(r=>!r.classList.contains('done')).every(r=>r.querySelector('.qwhy')&&r.title.includes('%'))"))
            check(f'{tag}: page fits the screen', ev('document.documentElement.scrollWidth') <= W)
            check(f'{tag}: no script errors or browser pop-ups', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} planner v2 tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
