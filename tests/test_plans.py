"""Saved study plans (Plan tab): week view, the 4-step wizard (type → time blocks → topics → review), My plans
(view, edit, activate / deactivate, copy to next week, delete + undo), replace prompts, where today's plan comes from
(daily → weekly → suggestion), done / missed marks, your own activities, sync merge and backup.
Desktop, laptop, iPad mini and iPhone — personal and demo."""
import os, sys, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA))]
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:240]))

# a clean slate: no plans, a few sessions so the scheduler has reviews, weak topics and new material to place
SETUP = """(()=>{const T=todayISO(),D=n=>addDays(T,-n),ev=(n,topic,sc)=>({id:'p'+topic+'_'+n,date:D(n),topic,kind:'study',from:null,to:null,score:sc,partial:false,demo:false});
  state.events=[ev(12,18,60),ev(9,6,75),ev(15,13,80),ev(20,1,90)];state.tests=[];state.plans=[];state.plan=null;
  state.settings={minutes:180,qph:40,testEvery:0,reviewMin:1.5};save();render();})()"""

with sync_playwright() as p:
    b = p.chromium.launch()
    for f in ['index', 'demo']:
        for mode, opts in DEV:
            tag = f'{f} · {mode}'; touch = mode in ('phone', 'iPad mini'); phone = mode == 'phone'; W = opts['viewport']['width']
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: errs.append('browser dialog: ' + d.message) or d.dismiss())
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(500)
            ev = pg.evaluate; tap = pg.tap if touch else pg.click
            ev("window.pplTour&&pplTour.end()")
            if f == 'demo':
                check(f'{tag}: the demo comes with an example weekly plan for next week (today still shows the suggestion)', ev("state.plans.length===1&&state.plans[0].type==='weekly'&&state.plans[0].active&&state.plans[0].start===addDays(mondayOf(todayISO()),7)&&todayPlan().source==='suggested'"))
                check(f'{tag}: … including your own activity (weekly review on Sunday)', ev("state.plans[0].items.some(it=>it.kind==='custom')"))
            ev(SETUP); pg.wait_for_timeout(200)
            T = ev('todayISO()')

            # ---------- empty week view ----------
            ev("goView('plan')"); pg.wait_for_timeout(300)
            check(f'{tag}: the Plan tab starts with the week view', pg.is_visible('#planWeek') and pg.is_visible('#pwWeekBox') and ev("document.querySelector('#viewPlan > section').id") == 'planWeek')
            check(f'{tag}: no active plan → blank days and today comes from the suggestion', ev("document.querySelectorAll('#pwGrid .wki').length") == 0 and 'suggestion' in pg.inner_text('#pwSource') and pg.is_visible('#pwEnergy'))
            check(f'{tag}: {"phone shows one day with a day strip" if phone else "7 day columns"}', ev("document.querySelectorAll('#pwGrid .wkcol').length") == (1 if phone else 7) and (not phone or ev("document.querySelectorAll('#pwStrip button').length") == 7))

            # ---------- wizard: daily plan ----------
            tap('#pwNew'); pg.wait_for_timeout(200)
            check(f'{tag}: + New plan opens the wizard on step 1 (type)', pg.is_visible('#wizbg') and ev("wizardState().step") == 1 and ev("document.querySelectorAll('[data-wtype]').length") == 2)
            tap('#wzNext'); pg.wait_for_timeout(200)
            check(f'{tag}: step 2 shows the day in 15-minute slots from 6:00 to 24:00', ev("document.querySelectorAll('#wzGrid .wkcol').length") == 1 and ev("document.querySelectorAll('#wzGrid .wkcol .wks').length") == 72)
            check(f'{tag}: Next stays off until some time is blocked', ev("document.getElementById('wzNext').disabled"))
            if touch:
                a = pg.locator('#wzGrid .wks[data-s="1140"]'); a.scroll_into_view_if_needed(); a.tap(); pg.wait_for_timeout(80)
                check(f'{tag}: touch: the first tap marks the start', ev("document.querySelectorAll('#wzGrid .wks.anchor').length") == 1)
                pg.locator('#wzGrid .wks[data-s="1245"]').tap(); pg.wait_for_timeout(80)
            else:
                a = pg.locator('#wzGrid .wks[data-s="1140"]'); a.scroll_into_view_if_needed(); b1 = a.bounding_box(); b2 = pg.locator('#wzGrid .wks[data-s="1245"]').bounding_box()
                pg.mouse.move(b1['x'] + 4, b1['y'] + 3); pg.mouse.down(); pg.mouse.move(b1['x'] + 4, b2['y'] + 3, steps=6); pg.mouse.up(); pg.wait_for_timeout(80)
            blocks = ev("JSON.stringify(wizardState().blocks)")
            check(f'{tag}: {"tap start + tap end" if touch else "click and drag"} blocks 19:00–21:00', blocks == json.dumps({T: [[1140, 1260]]}, separators=(',', ':')), blocks)
            tap('#wzUndo'); pg.wait_for_timeout(60)
            check(f'{tag}: Undo removes the selection', ev("JSON.stringify(wizardState().blocks)") == '{}')
            tap('#wzRedo'); pg.wait_for_timeout(60)
            check(f'{tag}: Redo brings it back', ev("JSON.stringify(wizardState().blocks)") == blocks and pg.inner_text('.wztotal').endswith('2h 00m'))
            tap('#wzNext'); pg.wait_for_timeout(400)
            items = ev("wizardState().items.map(it=>({s:it.start,m:it.min,i:it.i,k:it.kind,r:it.reason}))")
            used = sum(x['m'] for x in items)
            check(f'{tag}: step 3 suggests topics inside the block, one after another, without going over', items and items[0]['s'] == 1140 and used <= 122 and all(items[k]['s'] >= items[k - 1]['s'] + items[k - 1]['m'] - .01 for k in range(1, len(items))), items)
            tops = [x for x in items if x['k'] == 'topic']
            check(f'{tag}: deep work: one topic per ~45 min (3 in 2 h, +1 only to avoid 20+ empty minutes), each topic once', len(tops) <= 4 and len({x['i'] for x in tops}) == len(tops), items)
            check(f'{tag}: the block ends with the error review (hardest topics first, review last)', items[-1]['k'] == 'reflect' and 10 <= items[-1]['m'] <= 30, items[-1])
            check(f'{tag}: the review row names the topics and their expected misses', 'Error review' in pg.inner_text('#wzBody') and ev("(()=>{const r=wizardState().items.find(x=>x.kind==='reflect');return r.parts.length>0&&r.parts.every(x=>x.m>0)})()"))
            check(f'{tag}: daily plan keeps the effort choice (Low / Medium / High)', ev("document.querySelectorAll('[data-wzen] [data-en]').length") == 3)
            # remove the last item and add your own activity in the free time
            pg.locator('[data-wact="del"]').last.click() if not touch else pg.locator('[data-wact="del"]').last.tap(); pg.wait_for_timeout(80)
            tap('[data-wact="add"] >> nth=0'); pg.wait_for_timeout(80)
            pg.select_option('.wzit.edit [data-f="topic"]', 'c'); pg.fill('.wzit.edit [data-f="label"]', 'Simulator'); pg.fill('.wzit.edit [data-f="n"]', '15')
            tap('[data-wact="addok"]'); pg.wait_for_timeout(80)
            check(f'{tag}: you can add your own activity (name + minutes) in free time', ev("wizardState().items.some(it=>it.kind==='custom'&&it.label==='Simulator'&&it.min===15)"))
            # edit the first topic: change its questions
            tap('[data-wact="edit"] >> nth=0'); pg.wait_for_timeout(80)
            pg.fill('.wzit.edit [data-f="n"]', '5'); tap('[data-wact="ok"]'); pg.wait_for_timeout(80)
            check(f'{tag}: editing a topic changes its questions and minutes, later items move up', ev("(()=>{const its=wizardState().items.slice().sort((a,b)=>a.start-b.start);return its[0].n===5&&its.every((x,k)=>!k||x.start===its[k-1].start+its[k-1].min)})()"))
            tap('#wzNext'); pg.wait_for_timeout(300)
            check(f'{tag}: step 4 reviews the plan before saving', ev("wizardState().step") == 4 and ev("document.querySelectorAll('#wzGrid .wki').length") >= 2 and pg.is_visible('#wzSaveOff'))
            tap('#wzNext'); pg.wait_for_timeout(300)
            check(f'{tag}: Save & activate (nothing to replace → no question)', not pg.is_visible('#askbg') and not pg.is_visible('#wizbg') and ev("state.plans.length===1&&state.plans[0].active&&state.plans[0].type==='daily'"))
            check(f'{tag}: today now comes from the daily plan (energy choice hidden)', ev("todayPlan().source") == 'daily' and not pg.is_visible('#energyPick') and 'Daily plan' in pg.inner_text('#pwSource'))
            check(f'{tag}: today\'s list (dashboard) shows the planned times', ev("(goView('dash'),document.querySelectorAll('#sugg .qtime').length)") >= 2)
            ev("goView('plan')"); pg.wait_for_timeout(150)

            # ---------- practice test card follows the plan that drives today ----------
            ev("goView('tests')"); pg.wait_for_timeout(250)
            check(f'{tag}: with a daily plan active, the practice-test card offers to add it to that plan', pg.inner_text('#ppAdd') == "+ Add to today’s plan" or 'Add' in pg.inner_text('#ppAdd'), pg.inner_text('#ppAdd'))
            tap('#ppAdd'); pg.wait_for_timeout(250)
            if pg.is_visible('#askbg'):
                check(f'{tag}: no free time for a 60-question test → asks to open the plan', 'practice test needs' in pg.inner_text('#askText'))
                tap('#askNo'); pg.wait_for_timeout(150)
            ev("state.plans[0].blocks[todayISO()]=[[1140,1260],[1260+15,1260+15+Math.max(150,testMinutes()+15)]];save();render()"); pg.wait_for_timeout(150)
            tap('#ppAdd'); pg.wait_for_timeout(250)
            check(f'{tag}: … with room it goes into the first free time and the card says it is in the plan', ev("todayPlan().items.some(x=>x.kind==='test'&&x.start>=1275)") and ev("document.getElementById('ppAdd').disabled"), ev("todayPlan().items.map(x=>x.kind+'@'+x.start)"))
            ev("state.plans[0].items=state.plans[0].items.filter(x=>x.kind!=='test');state.plans[0].blocks[todayISO()]=[[1140,1260]];save();render()"); pg.wait_for_timeout(150)
            ev("goView('dash')"); pg.wait_for_timeout(250)

            # ---------- done marks ----------
            first = ev("todayPlan().items.find(x=>x.kind==='topic')")
            ev(f"commit(()=>state.events.push({{id:'done1',date:todayISO(),topic:{first['i']},kind:'review',score:88,from:null,to:null,partial:false,demo:false}}),'x')"); pg.wait_for_timeout(200)
            check(f'{tag}: logging a session for a planned topic marks it done (✓)', ev(f"todayPlan().items.find(x=>x.id==='{first['id']}').done") and '✓' in pg.inner_text(f'#sugg [data-chk="{first["id"]}"]'))
            cid = ev("todayPlan().items.find(x=>x.kind==='custom').id")
            ev(f"document.querySelector('#sugg [data-chk=\"{cid}\"]').click()"); pg.wait_for_timeout(200)
            check(f'{tag}: your own activity is marked done with its circle', ev(f"todayPlan().items.find(x=>x.id==='{cid}').done"))
            check(f'{tag}: dashboard: today\'s plan shows where it comes from', ev("document.getElementById('planMiniMode').textContent") == 'Daily plan' and ev("document.querySelectorAll('#sugg .qrow').length") >= 2)
            ev("goView('plan')"); pg.wait_for_timeout(200)

            # ---------- sync today's plan with the Kanban: you review the moves and press OK ----------
            ev("commit(()=>{state.statuses[22]='Doing';state.events.push({id:'mv22',date:addDays(todayISO(),-3),topic:22,kind:'move',from:'Very Comfortable',to:'Doing',partial:false,demo:false})},'x')"); pg.wait_for_timeout(150)
            planned = ev("[...new Set(todayPlan().items.filter(x=>x.kind==='topic').map(x=>x.i))]")
            before = ev("state.statuses.slice()")
            tap('#kbSync'); pg.wait_for_timeout(200)
            exp_in = [i for i in planned if before[i] != 'Doing']
            exp_out = [i for i in range(len(before)) if before[i] == 'Doing' and i not in planned]
            rows = ev("[...document.querySelectorAll('#kbList .kbrow')].map(r=>r.innerText)")
            check(f'{tag}: Sync with Kanban opens a review of the moves (nothing moved yet)', pg.is_visible('#kbbg') and len(rows) == len(exp_in) + len(exp_out) and ev("state.statuses.slice()") == before, (rows, exp_in, exp_out))
            check(f'{tag}: … a card leaving Doing goes back to the list it came from', any('Very Comfortable' in r for r in rows) if 22 in exp_out else True, rows)
            tap('#kbCancel'); pg.wait_for_timeout(150)
            check(f'{tag}: Cancel changes nothing on the Kanban', ev("state.statuses.slice()") == before and not pg.is_visible('#kbbg'))
            tap('#kbSync'); pg.wait_for_timeout(200)
            n_rows = ev("document.querySelectorAll('#kbList [data-kb]').length")
            if n_rows >= 2:
                tap('#kbList [data-kb="0"]'); pg.wait_for_timeout(60)
            check(f'{tag}: the OK button counts the checked moves', ev("document.getElementById('kbOk').textContent") == f'OK · move {n_rows - (1 if n_rows >= 2 else 0)}')
            tap('#kbOk'); pg.wait_for_timeout(250)
            after = ev("state.statuses.slice()")
            moved = (exp_in + exp_out)[1:] if n_rows >= 2 else exp_in + exp_out
            skipped = (exp_in + exp_out)[:1] if n_rows >= 2 else []
            check(f'{tag}: OK moves only the checked cards (planned → Doing, others out of Doing)', all((after[i] == 'Doing') == (i in exp_in) for i in moved) and all(after[i] == before[i] for i in skipped) and (22 not in moved or after[22] == 'Very Comfortable'), (moved, skipped, [after[i] for i in moved]))
            ev("goView('dash')"); pg.wait_for_timeout(300)
            doing = ev("[...document.querySelectorAll('.lane[data-lane=\"1\"] .task')].map(x=>+x.dataset.topic)")
            check(f'{tag}: the Kanban shows the result in Doing', all((i in doing) == (after[i] == 'Doing') for i in range(len(after))), doing)
            ev("document.querySelector('#toast button').click()"); pg.wait_for_timeout(250)
            check(f'{tag}: one Undo puts every card back', ev("state.statuses.slice()") == before)
            ev("goView('plan')"); pg.wait_for_timeout(200)

            # ---------- wizard: weekly plan, then a daily plan over it ----------
            tap('#pwNew'); pg.wait_for_timeout(150); tap('[data-wtype="weekly"]'); pg.wait_for_timeout(100)
            wk = ev("wizardState().start")
            check(f'{tag}: weekly plan starts on a Monday', ev(f"mondayOf('{wk}')") == wk)
            tap('#wzWkNext'); pg.wait_for_timeout(80); wk = ev("wizardState().start")
            tap('#wzNext'); pg.wait_for_timeout(200)
            if phone:
                check(f'{tag}: phone: one day at a time with a day strip', ev("document.querySelectorAll('#wzGrid .wkcol').length") == 1 and ev("document.querySelectorAll('.wkstrip [data-wzd]').length") == 7)
                tap('.wkstrip [data-wzd="0"]'); pg.wait_for_timeout(80)
                a = pg.locator('#wzGrid .wks[data-s="1170"]'); a.scroll_into_view_if_needed(); a.tap(); pg.locator('#wzGrid .wks[data-s="1245"]').tap()
            elif touch:
                a = pg.locator('#wzGrid .wkcol').nth(0).locator('.wks[data-s="1170"]'); a.scroll_into_view_if_needed(); a.tap(); pg.wait_for_timeout(60)
                pg.locator('#wzGrid .wkcol').nth(1).locator('.wks[data-s="1245"]').tap(); pg.wait_for_timeout(60)
                check(f'{tag}: touch: tapping another day only moves the start there (nothing blocked)', ev("JSON.stringify(wizardState().blocks)") == '{}')
                pg.locator('#wzGrid .wkcol').nth(0).locator('.wks[data-s="1170"]').tap(); pg.wait_for_timeout(60)
                pg.locator('#wzGrid .wkcol').nth(0).locator('.wks[data-s="1245"]').tap()
            else:
                a = pg.locator('#wzGrid .wkcol').nth(0).locator('.wks[data-s="1170"]'); a.scroll_into_view_if_needed(); b1 = a.bounding_box(); b2 = pg.locator('#wzGrid .wkcol').nth(0).locator('.wks[data-s="1245"]').bounding_box()
                nxt = pg.locator('#wzGrid .wkcol').nth(2).bounding_box()
                pg.mouse.move(b1['x'] + 4, b1['y'] + 3); pg.mouse.down(); pg.mouse.move(nxt['x'] + 20, b2['y'] + 3, steps=8); pg.mouse.up(); pg.wait_for_timeout(80)
                check(f'{tag}: dragging that drifts into other days only blocks the day where it started', list(json.loads(ev("JSON.stringify(wizardState().blocks)")).keys()) == [wk], ev("JSON.stringify(wizardState().blocks)"))
            pg.wait_for_timeout(80)
            bl = json.loads(ev("JSON.stringify(wizardState().blocks)"))
            check(f'{tag}: Monday blocked 19:30–21:00', bl.get(wk) == [[1170, 1260]], bl)
            tap('#wzCopy'); pg.wait_for_timeout(80)
            check(f'{tag}: copy the day to the other 6 days', len(json.loads(ev("JSON.stringify(wizardState().blocks)"))) == 7)
            tap('#wzNext'); pg.wait_for_timeout(1200)
            byday = ev("(()=>{const o={};wizardState().items.filter(it=>it.kind==='topic').forEach(it=>{(o[it.date]=o[it.date]||[]).push(it.i)});return o})()")
            check(f'{tag}: every day of the week gets topics', len(byday) == 7, list(byday))
            check(f'{tag}: no topic twice on the same day', all(len(v) == len(set(v)) for v in byday.values()))
            check(f'{tag}: weekly plans can set energy per day', ev("document.querySelectorAll('[data-wzen]').length") == 7)
            tap('#wzNext'); pg.wait_for_timeout(250); tap('#wzNext'); pg.wait_for_timeout(300)
            check(f'{tag}: weekly plan saved and active for next week', ev(f"state.plans.some(p=>p.type==='weekly'&&p.start==='{wk}'&&p.active)") and not pg.is_visible('#wizbg'))
            # week view follows the plans
            tap('#pwNext'); pg.wait_for_timeout(250)
            check(f'{tag}: the week view shows next week\'s plan', ev("document.querySelectorAll('#pwGrid .wki').length") >= (1 if phone else 7))
            tap('#pwRange' if phone else '#pwToday'); pg.wait_for_timeout(150)
            # a daily plan for next Wednesday over the weekly plan → asks to replace only that day
            ev(f"openWizard({{mode:'new',type:'daily',start:addDays('{wk}',2)}})"); pg.wait_for_timeout(150)
            tap('#wzNext'); pg.wait_for_timeout(150)
            a = pg.locator('#wzGrid .wks[data-s="600"]'); a.scroll_into_view_if_needed()
            if touch: a.tap(); pg.locator('#wzGrid .wks[data-s="660"]').tap()
            else: a.click(); pg.locator('#wzGrid .wks[data-s="615"]').click(); pg.locator('#wzGrid .wks[data-s="630"]').click(); pg.locator('#wzGrid .wks[data-s="645"]').click(); pg.locator('#wzGrid .wks[data-s="660"]').click()
            pg.wait_for_timeout(80)
            tap('#wzNext'); pg.wait_for_timeout(500); tap('#wzNext'); pg.wait_for_timeout(250); tap('#wzNext'); pg.wait_for_timeout(250)
            check(f'{tag}: a daily plan over an active weekly plan asks "replace only this day?"', pg.is_visible('#askbg') and 'Replace only' in pg.inner_text('#askText'), pg.inner_text('#askText') if pg.is_visible('#askbg') else '')
            tap('#askNo'); pg.wait_for_timeout(150)
            check(f'{tag}: Cancel keeps you on the review step, nothing saved', pg.is_visible('#wizbg') and ev("state.plans.length") == 2)
            tap('#wzNext'); pg.wait_for_timeout(250); tap('#askYes'); pg.wait_for_timeout(300)
            wed = ev(f"addDays('{wk}',2)")
            check(f'{tag}: … Replace: that day comes from the daily plan, the rest of the week stays weekly', ev(f"activeFor('{wed}').kind") == 'daily' and ev(f"activeFor(addDays('{wk}',3)).kind") == 'weekly' and ev("state.plans.filter(p=>p.active).length") == 3)
            tap('#pwNext'); pg.wait_for_timeout(250)
            if phone: tap('#pwStrip [data-pwd="2"]'); pg.wait_for_timeout(150)
            check(f'{tag}: the week view marks that day "D" (from a daily plan)', ev("document.querySelectorAll('#pwGrid .wkdaily').length") == 1)
            tap('#pwRange' if phone else '#pwToday'); pg.wait_for_timeout(150)

            # ---------- a second weekly plan for the same week → replace the week ----------
            ev(f"openWizard({{mode:'copy',plan:state.plans.find(p=>p.type==='weekly')}})"); pg.wait_for_timeout(200)
            check(f'{tag}: Copy to next week opens the wizard with the blocks one week later', ev("wizardState().start") == ev(f"addDays('{wk}',7)") and len(json.loads(ev("JSON.stringify(wizardState().blocks)"))) == 7)
            ev("wizardState().start=addDays(wizardState().start,-7);Object.keys(wizardState().blocks).forEach(d=>{wizardState().blocks[addDays(d,-7)]=wizardState().blocks[d];delete wizardState().blocks[d]})")
            tap('#wzNext'); pg.wait_for_timeout(1200); tap('#wzNext'); pg.wait_for_timeout(250); tap('#wzNext'); pg.wait_for_timeout(250)
            check(f'{tag}: another weekly plan for an active week asks to replace the week', pg.is_visible('#askbg') and 'Replace the week' in pg.inner_text('#askYes'))
            tap('#askYes'); pg.wait_for_timeout(300)
            check(f'{tag}: … the old weekly plan is turned off, the new one is on', ev(f"state.plans.filter(p=>p.type==='weekly'&&p.start==='{wk}'&&p.active).length") == 1 and ev(f"state.plans.filter(p=>p.type==='weekly'&&p.start==='{wk}').length") == 2)

            # ---------- My plans ----------
            tap('#pwTabs [data-pw="plans"]'); pg.wait_for_timeout(200)
            rows = ev("document.querySelectorAll('#pwList .pwrow').length")
            check(f'{tag}: My plans lists every plan with view / edit / activate / delete', rows == 4 and ev("document.querySelectorAll('#pwList [data-act=\"view\"]').length") == 4 and '(4)' in pg.inner_text('#pwTabs [data-pw="plans"]'), rows)
            off = ev("document.querySelector('#pwList .pwrow:not(.on)').dataset.pid")
            tap(f'#pwList [data-pid="{off}"] [data-act="view"]'); pg.wait_for_timeout(200)
            check(f'{tag}: View opens the plan read-only', pg.is_visible('#wizbg') and ev("wizardState().mode") == 'view' and not pg.is_visible('#wzSaveOff'))
            tap('#wzClose'); pg.wait_for_timeout(150)
            tap(f'#pwList [data-pid="{off}"] [data-act="on"]'); pg.wait_for_timeout(200)
            check(f'{tag}: activating an older weekly plan asks before replacing the active one', pg.is_visible('#askbg'))
            tap('#askNo'); pg.wait_for_timeout(150)
            daily_id = ev("state.plans.find(p=>p.type==='daily'&&p.start===todayISO()).id")
            tap(f'#pwList [data-pid="{daily_id}"] [data-act="off"]'); pg.wait_for_timeout(200)
            check(f'{tag}: Deactivate: today falls back to the suggestion', ev("todayPlan().source") == 'suggested')
            tap(f'#pwList [data-pid="{daily_id}"] [data-act="edit"]'); pg.wait_for_timeout(200)
            check(f'{tag}: Edit opens on the time blocks with the saved blocks', ev("wizardState().step") == 2 and ev("wizardState().mode") == 'edit' and ev("Object.keys(wizardState().blocks).length") == 1)
            tap('#wzClose'); pg.wait_for_timeout(150)
            tap(f'#pwList [data-pid="{daily_id}"] [data-act="del"]'); pg.wait_for_timeout(200)
            check(f'{tag}: Delete removes the plan', ev(f"!state.plans.some(p=>p.id==='{daily_id}')"))
            ev("document.querySelector('#toast button').click()"); pg.wait_for_timeout(200)
            check(f'{tag}: … and Undo brings it back', ev(f"state.plans.some(p=>p.id==='{daily_id}')"))
            check(f'{tag}: plans go into the saved data (backup / sync) and never hold a token', ev("JSON.parse(localStorage.getItem(STORE)).plans.length") == 4 and 'ghp_' not in ev("localStorage.getItem(STORE)"))
            check(f'{tag}: page never wider than the screen', ev('document.documentElement.scrollWidth') == W)
            check(f'{tag}: no browser pop-ups, no JavaScript errors', not errs, errs)
            c.close()

    # ---------- sync merge keeps plans from both copies; a deleted plan stays deleted ----------
    c = b.new_context(viewport={'width': 1440, 'height': 900}); pg = c.new_page()
    pg.goto('file://' + os.path.join(ROOT, 'index.html')); pg.wait_for_timeout(400)
    r = pg.evaluate("""(()=>{const base=JSON.parse(JSON.stringify(state)),P=(id,u)=>({id,type:'daily',start:todayISO(),active:false,blocks:{},items:[],updated:u});
      const a={...base,plans:[P('a',1)],updatedAt:10,deleted:{gone:todayISO()}},b={...base,plans:[P('b',2),P('gone',3)],updatedAt:5};
      return (typeof mergeStates==='function'?mergeStates(a,b):null)})()""")
    if r is not None:
        ids = sorted(x['id'] for x in r['plans'])
        check('sync: merging two copies unites their plans by id and keeps deleted ones out', ids == ['a', 'b'], ids)
    c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} plan tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
