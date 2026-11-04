"""Smarter plan: session-sized reviews, Refresh plan, check circles on plan blocks, review bands, Week/Day view with
titles that never overlap, and the Kanban "done today" tick. Desktop, laptop, iPad mini and iPhone — personal and demo.
Nothing here may change your statistics: those are compared before and after every action that should not touch them."""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA))]
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:240]))

# a weekly plan for this week with today and the next two days blocked (evening), built by the app itself
SETUP = """(()=>{const T=todayISO(),D=n=>addDays(T,-n),ev=(n,topic,sc,k)=>({id:'s'+topic+'_'+n,date:D(n),topic,kind:k||'study',from:null,to:null,score:sc,partial:false,demo:false});
  state.events=[ev(9,18,62),ev(6,6,75),ev(5,13,90),ev(4,10,70),ev(3,3,55)];state.tests=[{id:'t1',date:D(8),q:60,score:72}];
  state.settings={minutes:180,qph:40,testEvery:0,reviewMin:1.5};state.cards=[];state.cardChecks={};
  const days=[T,addDays(T,1),addDays(T,2)],blocks=Object.fromEntries(days.map(d=>[d,[[1140,1260],[1290,1350]]]));
  const out=suggestDays(days,blocks,{});
  state.plans=[{id:'pA',type:'weekly',name:'',start:mondayOf(T),active:true,blocks,energy:{},items:days.flatMap(d=>out[d]),updated:1}];
  /* keep the plan inside one Monday-Sunday week: move the days if today is late in the week */
  save();render();})()"""
STATS = "JSON.stringify([forecast().mu, blended().mu, counts(), state.scores, state.events.length, TOPICS.map((_,i)=>{const m=srModel(i);return [m.R,m.S,m.next]})])"

with sync_playwright() as p:
    b = p.chromium.launch()
    for f in ['index', 'demo']:
        for mode, opts in DEV:
            tag = f'{f} · {mode}'; touch = mode in ('phone', 'iPad mini'); W = opts['viewport']['width']
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: errs.append('browser dialog: ' + d.message) or d.dismiss())
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(500)
            ev = pg.evaluate; tap = pg.tap if touch else pg.click
            ev("window.pplTour&&pplTour.end()"); ev(SETUP); pg.wait_for_timeout(150)

            # ---------- session sizes ----------
            sizes = ev("state.plans[0].items.filter(x=>x.kind==='topic').map(x=>[x.i,x.n,TOPICS[x.i].q,x.reason])")
            # a review after a good score is a deliberate sample (10-19 questions); anything else is never cut under 20
            check(f'{tag}: no chunk of a big topic is under 20 questions unless it is a review sample (and none over a 40-question session)', all((n >= min(q, 20) or (r == 'due' and n >= 10)) and n <= 40 for i, n, q, r in sizes), sizes)
            check(f'{tag}: a review after a good score is smaller than after a weak one', ev("reviewSize(13,{reps:[{p:90}],R:0.9})<reviewSize(13,{reps:[{p:62}],R:0.9})"))

            # ---------- Week view: blocks never overlap, titles stay on one line inside their block ----------
            ev("goView('plan')"); pg.wait_for_timeout(250)
            if W > 640:
                ev("localStorage.removeItem(STORE+'-planview');renderPlanWeek()"); pg.wait_for_timeout(150)
                check(f'{tag}: Week view shows 7 days', ev("document.querySelectorAll('#pwGrid .wkcol').length") == 7)
            lay = ev("""[...document.querySelectorAll('#pwGrid .wkcol')].map(col=>{const r=[...col.querySelectorAll('.wki')].map(e=>e.getBoundingClientRect()).sort((a,b)=>a.top-b.top);
                return r.every((x,k)=>!k||x.top>=r[k-1].bottom-0.5)})""")
            check(f'{tag}: plan blocks never overlap each other', all(lay), lay)
            titles = ev("""[...document.querySelectorAll('#pwGrid .wki .wkmain b, #pwGrid .wkrev b')].filter(b=>b.offsetParent).map(b=>{const r=b.getBoundingClientRect(),p=b.closest('.wki').getBoundingClientRect(),cs=getComputedStyle(b);
                return cs.whiteSpace==='nowrap'&&r.height<=parseFloat(cs.lineHeight||14)*1.6+2&&r.top>=p.top-1&&r.bottom<=p.bottom+1})""")
            check(f'{tag}: every block title is one line, inside its block (no broken or overflowing names)', titles and all(titles), titles)
            check(f'{tag}: a topic and its error review are one block (the review is its bottom band)', ev("(()=>{const ds=[...document.querySelectorAll('#pwGrid .wkcol')].map(c=>c.dataset.d),its=state.plans[0].items.filter(x=>ds.includes(x.date));return its.filter(x=>x.kind==='reflect'&&x.of&&its.some(o=>o.id===x.of)).length===document.querySelectorAll('#pwGrid .wki.hasrev .wkrev').length})()") and ev("[...document.querySelectorAll('#pwGrid .wki')].every(e=>!e.className.includes('r-reflect')||!state.plans[0].items.find(x=>x.id===e.dataset.wi).of)"))

            # ---------- check circles on today's blocks ----------
            n_chk = ev("document.querySelectorAll('#pwGrid .wkcol.today [data-wchk]').length")
            check(f'{tag}: today\'s blocks have check circles (blocks and their reviews)', n_chk >= 2, n_chk)
            check(f'{tag}: future days have no check circles', ev("[...document.querySelectorAll('#pwGrid .wkcol:not(.today):not(.past) [data-wchk]')].length") == 0)
            al = ev("""[...document.querySelectorAll('#pwGrid .wkcol.today [data-wchk]')].filter(e=>e.offsetParent).map(e=>{const r=e.getBoundingClientRect(),p=(e.closest('.wkrev')||e.closest('.wki')).getBoundingClientRect(),
                txt=[...e.parentElement.children].filter(x=>x!==e&&x.tagName!=='DIV'&&x.offsetWidth).map(x=>x.getBoundingClientRect().right);return [Math.round(r.right),Math.round(r.width),r.top>=p.top-0.5&&r.bottom<=p.bottom+0.5,!txt.length||Math.max(...txt)<=r.left-2]})""")
            check(f'{tag}: check circles line up in one column, same size, inside their block, never touching the text', al and len({x[0] for x in al}) == 1 and len({x[1] for x in al}) == 1 and all(x[2] and x[3] for x in al), al)
            first = ev("[...document.querySelectorAll('#pwGrid .wkcol.today .wkmain [data-wchk]')].find(e=>e.offsetParent).dataset.wchk")
            ev(f"document.querySelector('#pwGrid [data-wchk=\"{first}\"]').scrollIntoView({{block:'center'}})"); pg.wait_for_timeout(100)
            tap(f'#pwGrid [data-wchk="{first}"]'); pg.wait_for_timeout(200)
            tk = ev("""(()=>{const e=document.querySelector('#pwGrid [data-wchk="'+%r+'"]');if(!e||!e.querySelector('svg'))return null;const c=e.getBoundingClientRect(),t=e.querySelector('svg').getBoundingClientRect();return [Math.abs(t.left+t.width/2-c.left-c.width/2),Math.abs(t.top+t.height/2-c.top-c.height/2)]})()""" % first)
            check(f'{tag}: the tick is drawn exactly in the middle of its circle', tk and tk[0] < 0.6 and tk[1] < 0.6, tk)
            check(f'{tag}: the circle marks the block done (and does not open anything)', ev(f"state.plans[0].items.find(x=>x.id==='{first}').check===true") and not pg.is_visible('#modalbg') and not pg.is_visible('#notebg'))
            rid = ev("([...document.querySelectorAll('#pwGrid .wkcol.today .wkrev [data-wchk]')].find(e=>e.offsetParent)||{}).dataset?.wchk||null")
            if rid:
                tap(f'#pwGrid [data-wchk="{rid}"]'); pg.wait_for_timeout(200)
                check(f'{tag}: the review band has its own circle', ev(f"state.plans[0].items.find(x=>x.id==='{rid}').check===true"))
            tap(f'#pwGrid [data-wchk="{first}"]'); pg.wait_for_timeout(200)
            check(f'{tag}: tapping again unticks it', ev(f"!state.plans[0].items.find(x=>x.id==='{first}').check"))

            # ---------- Day view ----------
            if W > 640:
                tap('#pwView [data-v="day"]'); pg.wait_for_timeout(200)
                check(f'{tag}: Day view shows one wide day with the day strip', ev("document.querySelectorAll('#pwGrid .wkcol').length") == 1 and pg.is_visible('#pwStrip .wkstrip'))
                pg.reload(); pg.wait_for_timeout(500); ev("window.pplTour&&pplTour.end()"); ev("goView('plan')"); pg.wait_for_timeout(200)
                check(f'{tag}: the Day/Week choice is remembered', ev("document.querySelectorAll('#pwGrid .wkcol').length") == 1)
                tap('#pwView [data-v="week"]'); pg.wait_for_timeout(150)
            else:
                check(f'{tag}: phones keep one day at a time (no Week/Day switch)', not pg.is_visible('#pwView') and ev("document.querySelectorAll('#pwGrid .wkcol').length") == 1)

            # ---------- Refresh plan ----------
            ev("""(()=>{const p=state.plans[0],T=todayISO(),d1=addDays(T,1),t=p.items.find(x=>x.date===d1&&x.kind==='topic');
                 p.items.push({id:'mine',date:d1,start:1290,min:20,kind:'custom',i:null,n:0,label:'Simulator',reason:'custom'});
                 window.__t=t&&t.i; save(); render()})()""")
            # a new, very good result on a topic planned tomorrow: its session should shrink or disappear
            ev("(()=>{if(window.__t==null)return;state.events.push({id:'fresh',date:todayISO(),topic:window.__t,kind:'review',from:null,to:null,score:96,partial:false,demo:false});state.scores[window.__t]=96;save();render()})()")
            before_stats = ev(STATS)
            past = ev("JSON.stringify(state.plans[0].items.filter(x=>x.date<todayISO()))")
            tomorrow0 = ev("state.plans[0].items.filter(x=>x.date===addDays(todayISO(),1)&&x.i===window.__t&&x.kind==='topic').reduce((a,x)=>a+x.n,0)")
            check(f'{tag}: the Refresh plan button is there while a plan has days ahead', pg.is_visible('#pwRefresh'))
            tap('#pwRefresh'); pg.wait_for_timeout(300)
            tomorrow1 = ev("state.plans[0].items.filter(x=>x.date===addDays(todayISO(),1)&&x.i===window.__t&&x.kind==='topic').reduce((a,x)=>a+x.n,0)")
            check(f'{tag}: refresh uses the new result (a topic just scored 96% gets fewer questions or none)', tomorrow1 < tomorrow0 or tomorrow0 == 0, (tomorrow0, tomorrow1))
            check(f'{tag}: refresh keeps your own activities in place', ev("state.plans[0].items.some(x=>x.id==='mine'&&x.start===1290)"))
            check(f'{tag}: refresh never touches past days, and blocks stay the same', ev("JSON.stringify(state.plans[0].items.filter(x=>x.date<todayISO()))") == past and ev("Object.values(state.plans[0].blocks).every(r=>JSON.stringify(r)==='[[1140,1260],[1290,1350]]')"))
            lay2 = ev("""(()=>{const its=state.plans[0].items;return Object.entries(state.plans[0].blocks).every(([d,rs])=>{const x=its.filter(i=>i.date===d).sort((a,b)=>a.start-b.start);
                return x.every((i,k)=>(!k||i.start>=x[k-1].start+x[k-1].min-0.01)&&rs.some(([s,e])=>i.start>=s&&i.start+i.min<=e+0.01))})})()""")
            check(f'{tag}: after refresh every item still fits its block, one after another', lay2)
            ev("document.querySelector('#toast button').click()"); pg.wait_for_timeout(200)
            check(f'{tag}: one Undo restores the plan as it was', ev("state.plans[0].items.filter(x=>x.date===addDays(todayISO(),1)&&x.i===window.__t&&x.kind==='topic').reduce((a,x)=>a+x.n,0)") == tomorrow0)
            check(f'{tag}: refresh and undo never change your statistics', ev(STATS) == before_stats)

            # ---------- Kanban: done today ----------
            ev("goView('dash')"); pg.wait_for_timeout(200)
            stats0 = ev(STATS)
            card = '.task[data-topic="13"]'
            ev(f"document.querySelector('{card}').scrollIntoView({{block:'center',inline:'center'}})"); pg.wait_for_timeout(250)
            if not touch:
                check(f'{tag}: the tick is hidden until you point at the card', ev(f"getComputedStyle(document.querySelector('{card} .tchk')).opacity") == '0')
                pg.hover(card); pg.wait_for_timeout(250)
                check(f'{tag}: pointing at the card shows the tick left of the name', ev(f"getComputedStyle(document.querySelector('{card} .tchk')).opacity") == '1' and ev(f"document.querySelector('{card} .tchk').getBoundingClientRect().right<=document.querySelector('{card} .tname').getBoundingClientRect().left+parseFloat(getComputedStyle(document.querySelector('{card} .tname')).paddingLeft)+1"))
            else:
                check(f'{tag}: on touch screens the tick ring is always there', float(ev(f"getComputedStyle(document.querySelector('{card} .tchk')).opacity")) > 0.3)
            tap(f'{card} .tchk'); pg.wait_for_timeout(250)
            check(f'{tag}: the tick marks the card done today (green), without opening the card', ev("state.cardChecks[13]===todayISO()") and ev(f"document.querySelector('{card} .tchk').classList.contains('on')") and not pg.is_visible('#modalbg'))
            check(f'{tag}: no "done today" text on the card, just the tick', 'Done today' not in pg.inner_text(card))
            check(f'{tag}: the tick changes no statistics', ev(STATS) == stats0)
            check(f'{tag}: a topic ticked today counts as done in today\'s plan', ev("itemDone({kind:'topic',i:13,date:todayISO()})"))
            ev("state.cardChecks[13]=addDays(todayISO(),-1);save();render()"); pg.wait_for_timeout(150)
            check(f'{tag}: the next day the tick is gone by itself', not ev(f"document.querySelector('{card}').classList.contains('checked')"))
            check(f'{tag}: no script errors or browser pop-ups', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} adaptive plan tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
