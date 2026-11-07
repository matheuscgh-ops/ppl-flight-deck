"""Errors tab (error analysis): every note by topic and date, today's session on top, search and topic filter, add and
delete with Undo, and the import from a spreadsheet (Topic · Date · Notes, a multi-line cell → one note per line,
loose topic names, no duplicates). Notes never change the statistics. Desktop, laptop, iPad mini and iPhone —
personal and demo."""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEV = [('desktop', dict(viewport={'width': 2000, 'height': 1190})),
       ('laptop', dict(viewport={'width': 1440, 'height': 900})),
       ('iPad mini', dict(viewport={'width': 744, 'height': 1133}, is_mobile=True, has_touch=True, user_agent=UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'))),
       ('phone', dict(viewport={'width': 360, 'height': 780}, is_mobile=True, has_touch=True, user_agent=UA))]
results = []
def check(n, c, d=''): results.append((n, bool(c), str(d)[:240]))

# what Google Sheets puts on the clipboard: tabs between cells, a multi-line cell in quotes ("" for a quote)
PASTE = ('Topic\tDate\tNotes\n'
         'Weather\t11/2/2026\t"Ceiling = lowest BKN or OVC layer\n\nFog: radiation = ground cooling\nPIREP UUA = ""urgent"""\n'
         'airspace\t2026-11-03\tClass B needs a clearance\n'
         'Nonsense topic\t11/2/2026\tskipped\n')
SETUP = """(()=>{const T=todayISO();state.notes=[{id:'n0',topic:14,date:T,text:'Class B needs a clearance'}];
  state.plans=[{id:'pE',type:'daily',name:'',start:T,active:true,blocks:{[T]:[[1140,1260]]},
    items:[{id:'i1',date:T,start:1140,min:40,kind:'topic',i:14,n:30,reason:'weak'}]}];save();render();goView('errors')})()"""
STATS = "JSON.stringify([forecast().mu, blended().mu, counts(), state.scores, state.events.length, TOPICS.map((_,i)=>srModel(i).R)])"

with sync_playwright() as p:
    b = getattr(p, os.environ.get("PPL_BROWSER", "chromium")).launch()
    for f in os.environ.get('PPL_FILES', 'index demo').split():
        for mode, opts in DEV:
            tag = f'{f} · {mode}'; touch = mode in ('phone', 'iPad mini'); W = opts['viewport']['width']
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: errs.append('browser dialog: ' + d.message) or d.dismiss())
            pg.goto('file://' + os.path.join(ROOT, f + '.html')); pg.wait_for_timeout(500)
            ev = pg.evaluate; tap = pg.tap if touch else pg.click
            ev("window.pplTour&&pplTour.end()")
            if f == 'demo':
                check(f'{tag}: the demo comes with example error notes on several topics', ev("state.notes.length") >= 12 and ev("new Set(state.notes.map(n=>n.topic)).size") >= 5)
                ev("state.notes=[];save()"); pg.reload(); pg.wait_for_timeout(400); ev("window.pplTour&&pplTour.end()")
                check(f'{tag}: a demo saved before the Errors tab gets the example notes too', ev("state.notes.length") >= 12)
            ev(SETUP); pg.wait_for_timeout(200)
            stats0 = ev(STATS)
            check(f'{tag}: the Errors tab opens the error analysis', pg.is_visible('#viewErrors') and pg.is_visible('.errhead') and ev("location.hash") == '#errors')
            check(f'{tag}: tabs and page fit the screen', ev('document.documentElement.scrollWidth') <= W and ev("[...document.querySelectorAll('.tabs button')].every(b=>b.getBoundingClientRect().right<=innerWidth)"))
            check(f'{tag}: a topic in today\'s plan with notes is under "Review before today\'s session"', 'National Airspace System' in pg.inner_text('#errToday'))
            # import
            tap('#errImport'); pg.wait_for_timeout(150)
            pg.fill('#impIn', PASTE); pg.wait_for_timeout(150)
            prev = pg.inner_text('#impPrev')
            check(f'{tag}: import preview: "Weather" → Weather Information, header skipped, unknown topic flagged', 'Weather Information' in prev and 'Nonsense topic' in prev and 'Topic' not in prev.split('\n')[0], prev)
            check(f'{tag}: a multi-line cell becomes one note per line (blank lines ignored), quotes kept', ev("readImport(document.getElementById('impIn').value).notes.filter(n=>n.topic===18).map(n=>n.text).join('|')") == 'Ceiling = lowest BKN or OVC layer|Fog: radiation = ground cooling|PIREP UUA = "urgent"')
            check(f'{tag}: a note already in the app is not imported twice', ev("readImport(document.getElementById('impIn').value).notes.length") == 3 and '3' in pg.inner_text('#impOk'))
            check(f'{tag}: dates M/D/YYYY and YYYY-MM-DD are read', ev("readImport(document.getElementById('impIn').value).notes.every(n=>n.date==='2026-11-02')"))
            tap('#impOk'); pg.wait_for_timeout(250)
            check(f'{tag}: Import adds the notes, grouped by topic and date', ev("state.notes.length") == 4 and 'Weather Information' in pg.inner_text('#errList') and 'Ceiling = lowest BKN' in pg.inner_text('#errList'))
            ev("document.querySelector('#toast button').click()"); pg.wait_for_timeout(200)
            check(f'{tag}: one Undo removes the whole import', ev("state.notes.length") == 1)
            ev("(()=>{state.notes.push(...readImport(%r).notes);save();render()})()" % PASTE); pg.wait_for_timeout(150)
            # search and filter
            pg.fill('#errQ', 'fog'); pg.wait_for_timeout(150)
            check(f'{tag}: search keeps only matching notes and highlights the word', pg.locator('#viewErrors li').count() == 1 and pg.locator('#viewErrors mark').count() == 1)
            pg.fill('#errQ', ''); pg.select_option('#errTopic', '14'); pg.wait_for_timeout(150)
            check(f'{tag}: the topic menu shows one topic', 'Weather' not in pg.inner_text('#errList') + pg.inner_text('#errToday') and 'Class B' in pg.inner_text('#viewErrors'))
            pg.select_option('#errTopic', ''); pg.wait_for_timeout(100)
            # add from the page: one note per line
            tap('#errAdd'); pg.wait_for_timeout(120)
            # no topic is chosen for you: Save without one keeps the text and asks for the topic
            check(f'{tag}: "+ Add note" starts with no topic chosen', ev("document.getElementById('errNewTopic').value") == '')
            n0 = ev("state.notes.length"); pg.fill('#errNewText', 'Fog: radiation fog forms on clear calm nights')
            tap('#errNewSave'); pg.wait_for_timeout(200)
            check(f'{tag}: Save without a topic saves nothing, keeps the text and marks the topic menu', ev("state.notes.length") == n0 and ev("document.getElementById('errNewText').value").startswith('Fog') and ev("document.getElementById('errNewTopic').classList.contains('need')"))
            pg.select_option('#errNewTopic', '13'); pg.fill('#errNewText', 'Hypoxia: oxygen above 12,500 ft\nSpatial disorientation in IMC')
            tap('#errNewSave'); pg.wait_for_timeout(200)
            check(f'{tag}: "+ Add note" adds one note per line to the chosen topic', ev("state.notes.filter(n=>n.topic===13).length") == 2 and 'Human Factors' in pg.inner_text('#errList'))
            # with the topic menu on a topic, the form starts on that topic
            pg.select_option('#errTopic', '18'); pg.wait_for_timeout(100); tap('#errAdd'); pg.wait_for_timeout(120)
            check(f'{tag}: with a topic filtered, "+ Add note" starts on that topic', ev("document.getElementById('errNewTopic').value") == '18')
            tap('#errNewCancel'); pg.wait_for_timeout(100); pg.select_option('#errTopic', ''); pg.wait_for_timeout(100)
            # edit a note: its text (several lines, longer than 500 characters) and its topic
            eid = ev("state.notes.find(n=>n.topic===13).id")
            ev(f"document.querySelector('[data-eedit=\"{eid}\"]').scrollIntoView({{block:'center'}})"); pg.wait_for_timeout(100)
            tap(f'[data-eedit="{eid}"]'); pg.wait_for_timeout(150)
            check(f'{tag}: ✎ opens the note in an editor with its text and topic', ev("!!document.querySelector('#viewErrors li.editing textarea')") and ev("document.querySelector('#viewErrors li.editing select').value") == '13')
            long = 'Line one about hypoxia' + '\n' + 'x' * 700
            pg.fill('#viewErrors li.editing textarea', long); pg.select_option('#viewErrors li.editing select', '18')
            tap('#viewErrors li.editing [data-esave]'); pg.wait_for_timeout(200)
            nn = ev(f"state.notes.find(n=>n.id==='{eid}')")
            check(f'{tag}: Save keeps the whole text (several lines, over 500 characters) and moves it to the new topic', nn['topic'] == 18 and len(nn['text']) == len(long) and '\n' in nn['text'], (nn['topic'], len(nn['text'])))
            check(f'{tag}: a long note survives a reload and a backup round trip (not cut at 500)', ev(f"normalize(JSON.parse(JSON.stringify(state))).notes.find(n=>n.id==='{eid}').text.length") == len(long))
            check(f'{tag}: the edited note shows under its new topic', 'Line one about hypoxia' in ev("document.querySelector('[data-etopic=\"18\"]').innerText"))
            ev("document.querySelector('#toast button').click()"); pg.wait_for_timeout(200)
            check(f'{tag}: Undo puts the note back as it was', ev(f"state.notes.find(n=>n.id==='{eid}').topic") == 13 and 'x' * 50 not in ev(f"state.notes.find(n=>n.id==='{eid}').text"))
            tap(f'[data-eedit="{eid}"]'); pg.wait_for_timeout(150)
            pg.fill('#viewErrors li.editing textarea', 'changed?'); pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
            check(f'{tag}: Escape cancels the edit', ev(f"state.notes.find(n=>n.id==='{eid}').text") != 'changed?' and not ev("document.querySelector('#viewErrors li.editing')"))
            tap(f'[data-eedit="{eid}"]'); pg.wait_for_timeout(150)
            pg.fill('#viewErrors li.editing textarea', 'Hypoxia: oxygen above 12,500 ft (edited)'); pg.keyboard.press('Control+Enter'); pg.wait_for_timeout(200)
            check(f'{tag}: Ctrl/⌘ + Enter saves the edit', ev(f"state.notes.find(n=>n.id==='{eid}').text") == 'Hypoxia: oxygen above 12,500 ft (edited)')
            pg.fill('#viewErrors li.editing textarea', '') if ev("!!document.querySelector('#viewErrors li.editing')") else None
            # delete with undo
            nid = ev("state.notes.find(n=>n.topic===13).id")
            ev(f"document.querySelector('[data-edel=\"{nid}\"]').scrollIntoView({{block:'center'}})"); pg.wait_for_timeout(100)
            tap(f'[data-edel="{nid}"]'); pg.wait_for_timeout(200)
            check(f'{tag}: × deletes a note (remembered for sync)', ev(f"!state.notes.some(n=>n.id==='{nid}')") and ev(f"!!state.deleted['{nid}']"))
            ev("document.querySelector('#toast button').click()"); pg.wait_for_timeout(200)
            check(f'{tag}: Undo brings it back', ev(f"state.notes.some(n=>n.id==='{nid}')"))
            check(f'{tag}: notes never change the statistics', ev(STATS) == stats0)
            check(f'{tag}: notes survive a reload', (pg.reload(), pg.wait_for_timeout(500), ev("state.notes.length"))[2] == 6 and pg.is_visible('#viewErrors'))
            check(f'{tag}: no script errors or browser pop-ups', not errs, errs)
            c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} errors tab tests passed\n')
for n, g, d in results: print(('PASS ' if g else 'FAIL ') + n + ('' if g else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
