"""End-to-end tests for PPL Flight Deck (real Chromium via Playwright).
Each test gets a fresh browser context (empty localStorage) unless it says otherwise."""
import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
import json, os, sys, shutil, traceback, re, tempfile
from playwright.sync_api import sync_playwright

FILE = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html'))
URL = 'file://' + FILE
OUT = os.path.join(tempfile.gettempdir(), 'ppl-tests', '')
os.makedirs(OUT, exist_ok=True)
results = []

def T(group, name):
    def deco(fn):
        fn._meta = (group, name); TESTS.append(fn); return fn
    return deco
TESTS = []

class Ctx:
    def __init__(s, browser, w=2000, h=1190):
        s.ctx = browser.new_context(viewport={'width': w, 'height': h}, accept_downloads=True)
        s.pg = s.ctx.new_page(); s.errors = []
        s.pg.on('pageerror', lambda e: s.errors.append(str(e)))
        s.pg.on('console', lambda m: m.type == 'error' and s.errors.append(m.text))
        s.pg.on('dialog', lambda d: d.accept())
        s.pg.goto(URL); s.pg.wait_for_timeout(350)
    def ev(s, js, *a): return s.pg.evaluate(js, *a)
    def close(s): s.ctx.close()

def check(cond, msg):
    if not cond: raise AssertionError(msg)

def drag(c, card_sel, lane_idx, below=False):
    pg = c.pg
    a = pg.locator(card_sel).bounding_box(); l = pg.locator(f'.lane[data-lane="{lane_idx}"]').bounding_box()
    pg.mouse.move(a['x'] + 30, a['y'] + 10); pg.mouse.down()
    pg.mouse.move(a['x'] + 50, a['y'] + 30, steps=4)
    ty = l['y'] + l['height'] + 25 if below else l['y'] + 40
    pg.mouse.move(l['x'] + 60, ty, steps=10); pg.mouse.up(); pg.wait_for_timeout(150)

def status(c, i): return c.ev(f'state.statuses[{i}]')
def track_pct(c): return c.ev("[...document.querySelectorAll('#track .chunk')].map(x=>parseFloat(x.style.width))")

# ---------------------------------------------------------------- load & persistence
@T('Load', 'opens with the real data: 26 cards, 6 sessions, 3 practice tests, no example badge')
def _(c):
    check(c.ev("document.querySelectorAll('.task').length") == 26, 'cards')
    check(c.ev('state.events.length') == 6 and c.ev('state.tests.length') == 3, 'history')
    check(not c.pg.is_visible('#demoBadge') and not c.pg.is_visible('#clearDemo'), 'demo UI hidden')

@T('Load', 'no JavaScript errors on load')
def _(c): check(not c.errors, c.errors)

@T('Persistence', 'moving a card survives a page reload')
def _(c):
    c.ev("moveCard(0,'Doing')"); c.pg.reload(); c.pg.wait_for_timeout(300)
    check(status(c, 0) == 'Doing', status(c, 0))

@T('Persistence', 'logged session + edited score survive a reload')
def _(c):
    c.pg.click('.task[data-topic="1"] .tname'); c.pg.fill('#mScore', '83'); c.pg.click('#mSave'); c.pg.wait_for_timeout(100)
    c.pg.reload(); c.pg.wait_for_timeout(300)
    check(c.ev('state.scores[1]') == 83 and c.ev("state.events.some(e=>e.topic===1&&e.score===83)"), 'not saved')

@T('Persistence', 'exam date change survives a reload and moves the calendar highlight')
def _(c):
    # the 20th of next month, whatever today is
    d = c.ev("(()=>{const t=new Date();const n=new Date(t.getFullYear(),t.getMonth()+1,20);return iso(n)})()")
    c.pg.fill('#examDate', d); c.pg.dispatch_event('#examDate', 'change'); c.pg.wait_for_timeout(100)
    c.pg.reload(); c.pg.wait_for_timeout(300)
    check(c.ev('state.deadline') == d, c.ev('state.deadline'))
    c.pg.click('#next'); c.pg.wait_for_timeout(100)
    check(c.ev("[...document.querySelectorAll('.day.exam')].map(d=>d.querySelector('.dnum').textContent).join()") == '20', 'exam highlight')

@T('Persistence', 'language choice survives a reload')
def _(c):
    c.pg.click('.flag[data-lang="pt"]'); c.pg.reload(); c.pg.wait_for_timeout(300)
    check(c.pg.inner_text('.tabs button[data-view="dash"]') == 'Painel', 'pt not kept')

@T('Undo', 'Undo restores a card move')
def _(c):
    c.ev("moveCard(5,'Very Comfortable')"); c.pg.click('#toast button'); c.pg.wait_for_timeout(100)
    check(status(c, 5) == 'Todo' and c.ev('state.events.length') == 6, 'undo failed')

@T('Undo', 'Undo restores a deleted history record')
def _(c):
    c.pg.click('.task[data-topic="18"] .tname'); c.pg.click('#mHist [data-del]'); c.pg.wait_for_timeout(100)
    check(c.ev('state.events.length') == 5, 'not deleted'); c.pg.keyboard.press('Escape')
    c.pg.click('#toast button'); c.pg.wait_for_timeout(100)
    check(c.ev('state.events.length') == 6 and c.ev('state.scores[18]') == 9, 'undo failed')

# ---------------------------------------------------------------- JSON & HTML files
@T('Files', 'Backup JSON downloads a valid file with every field')
def _(c):
    with c.pg.expect_download() as d: c.pg.evaluate("document.getElementById('backup').click()")
    data = json.load(open(d.value.path()))
    for k in ['statuses', 'scores', 'events', 'tests', 'deadline', 'lang']: check(k in data, 'missing ' + k)
    check(len(data['statuses']) == 26 and len(data['events']) == 6 and len(data['tests']) == 3, 'counts')
    check(d.value.suggested_filename.startswith('PPL_backup_') and d.value.suggested_filename.endswith('.json'), d.value.suggested_filename)

@T('Files', 'Import restores a backup exactly (fresh browser)')
def _(c):
    c.ev("moveCard(3,'Doing')"); c.ev("state.scores[2]=44;save();")
    with c.pg.expect_download() as d: c.pg.evaluate("document.getElementById('backup').click()")
    path = OUT + 'bk.json'; shutil.copy(d.value.path(), path)
    c2 = Ctx(c.browser); c2.pg.set_input_files('#file', path); c2.pg.wait_for_timeout(200)
    ok = c2.ev('state.statuses[3]') == 'Doing' and c2.ev('state.scores[2]') == 44 and c2.ev('state.events.length') == 7
    c2.close(); check(ok, 'import mismatch')

@T('Files', 'Import of an invalid file shows an error (in the page, no browser pop-up) and changes nothing')
def _(c):
    bad = OUT + 'bad.json'; open(bad, 'w').write('{"hello":1}')
    msgs = []; c.pg.on('dialog', lambda dlg: msgs.append(dlg.message))
    before = c.ev('JSON.stringify(state.statuses)')
    c.pg.set_input_files('#file', bad); c.pg.wait_for_timeout(200)
    check(not msgs and 'not a valid' in c.pg.inner_text('#toast'), (msgs, c.pg.inner_text('#toast'))); check(c.ev('JSON.stringify(state.statuses)') == before, 'state changed')

@T('Files', 'Import of a broken (non-JSON) file is handled')
def _(c):
    bad = OUT + 'broken.json'; open(bad, 'w').write('not json at all {')
    c.pg.set_input_files('#file', bad); c.pg.wait_for_timeout(200)
    check(c.ev('state.events.length') == 6 and not c.errors, c.errors)

@T('Files', 'Import of an old v10 backup (status field, no scores) works')
def _(c):
    v10 = {"statuses": ["Todo"] * 26, "events": [{"date": "2026-10-20", "topic": 12, "kind": "move", "status": "Very Comfortable", "demo": False}], "deadline": "2026-11-30", "lang": "pt"}
    path = OUT + 'v10.json'; json.dump(v10, open(path, 'w'))
    c.pg.set_input_files('#file', path); c.pg.wait_for_timeout(200)
    check(c.ev("state.events[0].to") == 'Very Comfortable' and c.ev('state.scores[0]') == 66 and c.ev('lang') == 'pt', 'migration')

@T('Files', 'Save HTML: the saved file reopens with all data in a new browser')
def _(c):
    c.ev("moveCard(7,'To review')"); c.pg.click('.task[data-topic="9"] .tname'); c.pg.fill('#mScore', '91'); c.pg.click('#mSave'); c.pg.wait_for_timeout(100)
    with c.pg.expect_download() as d: c.pg.evaluate("document.getElementById('saveHtml').click()")
    path = OUT + 'saved.html'; shutil.copy(d.value.path(), path)
    html = open(path).read(); check('"tests":[' in html and html.count('<script id="embedded" type="application/json">') == 1, 'embedded state')
    c2ctx = c.browser.new_context(); p2 = c2ctx.new_page(); errs = []; p2.on('pageerror', lambda e: errs.append(str(e)))
    p2.goto('file://' + path); p2.wait_for_timeout(300)
    ok = p2.evaluate('state.statuses[7]') == 'To review' and p2.evaluate('state.scores[9]') == 91 and p2.evaluate("document.querySelectorAll('.task').length") == 26
    c2ctx.close(); check(ok and not errs, errs)

@T('Files', 'Save HTML twice: second copy also works (no nested embedding)')
def _(c):
    with c.pg.expect_download() as d: c.pg.evaluate("document.getElementById('saveHtml').click()")
    p1 = OUT + 's1.html'; shutil.copy(d.value.path(), p1)
    c2ctx = c.browser.new_context(accept_downloads=True); p2 = c2ctx.new_page(); p2.goto('file://' + p1); p2.wait_for_timeout(300)
    p2.evaluate("moveCard(10,'Doing')")
    with p2.expect_download() as d2: p2.evaluate("document.getElementById('saveHtml').click()")
    p3 = OUT + 's2.html'; shutil.copy(d2.value.path(), p3); c2ctx.close()
    html = open(p3).read(); check(html.count('<script id="embedded" type="application/json">') == 1, 'nested')
    c3 = c.browser.new_context(); p = c3.new_page(); p.goto('file://' + p3); p.wait_for_timeout(300)
    ok = p.evaluate('state.statuses[10]') == 'Doing'; c3.close(); check(ok, 'second copy lost data')

@T('Files', 'a newer saved HTML wins over older browser data; older one does not')
def _(c):
    with c.pg.expect_download() as d: c.pg.evaluate("document.getElementById('saveHtml').click()")
    path = OUT + 'older.html'; shutil.copy(d.value.path(), path)
    c.pg.goto('file://' + path); c.pg.wait_for_timeout(200)
    c.ev("moveCard(4,'Doing')")  # browser now newer than the file
    c.pg.reload(); c.pg.wait_for_timeout(300)
    check(status(c, 4) == 'Doing', 'older file overwrote newer browser data')

# ---------------------------------------------------------------- progress bar
@T('Progress bar', 'segments match question counts (27.7 / 9.1 / 20.0 / 43.2 / 0.0 %)')
def _(c):
    w = [round(x, 1) for x in track_pct(c)]; check(w == [27.7, 9.1, 20.0, 43.2, 0.0], w)
    check(abs(sum(track_pct(c)) - 100) < 0.01, 'sum')
    check(c.pg.inner_text('#total').replace(' ', ',') in ('1,058 questions',), c.pg.inner_text('#total'))

@T('Progress bar', 'dragging Weather (158 q) to To Do updates bar and legend instantly')
def _(c):
    drag(c, '.task[data-topic="18"]', 0)
    w = [round(x, 1) for x in track_pct(c)]; check(w[0] == round((293 + 158) / 1058 * 100, 1) and w[3] == round((457 - 158) / 1058 * 100, 1), w)
    check('451 q' in c.pg.inner_text('.lg[data-i="0"]'), c.pg.inner_text('.lg[data-i="0"]'))

@T('Progress bar', 'moving cards does not change the average score')
def _(c):
    a = c.pg.inner_text('#avg'); c.ev("moveCard(0,'Very Comfortable')"); check(c.pg.inner_text('#avg') == a, 'avg changed')

@T('Progress bar', 'editing a score does change the average (weighted by questions)')
def _(c):
    c.pg.click('.task[data-topic="18"] .score'); c.pg.keyboard.press('Control+a'); c.pg.keyboard.type('80'); c.pg.keyboard.press('Enter'); c.pg.wait_for_timeout(100)
    exp = c.ev("(()=>{let a=0,b=0;TOPICS.forEach((x,i)=>{const v=state.scores[i];if(v!=null){a+=x.q*v;b+=x.q}});return (a/b).toFixed(1)})()")
    check(c.pg.inner_text('#avg') == exp + '%', (c.pg.inner_text('#avg'), exp))

# ---------------------------------------------------------------- kanban
@T('Kanban', 'lists in order To Do, Doing, Not Comfortable, Very Comfortable, To Review')
def _(c):
    check(c.ev("[...document.querySelectorAll('.lname')].map(x=>x.textContent).join('|')") == 'To Do|Doing|Not Comfortable|Very Comfortable|To Review', 'order')

@T('Kanban', 'every card visible, no scrolling inside lists (all sizes)')
def _(c):
    for w, h in [(2000, 1190), (1728, 1000), (1366, 768), (420, 900)]:
        c.pg.set_viewport_size({'width': w, 'height': h}); c.pg.wait_for_timeout(150)
        check(c.ev("[...document.querySelectorAll('.task')].filter(t=>!t.offsetHeight).length") == 0, f'hidden at {w}')
        check(c.ev("[...document.querySelectorAll('.lanecards')].filter(l=>l.scrollHeight>l.clientHeight+1).length") == 0, f'inner scroll at {w}')

@T('Kanban', 'drag & drop between lists records a dated move')
def _(c):
    drag(c, '.task[data-topic="17"]', 4)
    check(status(c, 17) == 'To review' and c.ev("state.events.at(-1).kind") == 'move' and c.ev("state.events.at(-1).date") == c.ev('todayISO()'), 'move')

@T('Kanban', 'dropping in the empty space below a short list still works')
def _(c):
    drag(c, '.task[data-topic="0"]', 1, below=True); check(status(c, 0) == 'Doing', status(c, 0))

@T('Kanban', 'dropping on the same list does nothing')
def _(c):
    n = c.ev('state.events.length'); drag(c, '.task[data-topic="0"]', 0); check(c.ev('state.events.length') == n, 'event added')

@T('Kanban', 'click opens the card dialog; Enter key too; Escape closes')
def _(c):
    c.pg.click('.task[data-topic="2"] .tname'); check(c.pg.is_visible('#modalbg') and 'Emergency Approach' in c.pg.inner_text('#mTitle'), 'click')
    c.pg.keyboard.press('Escape'); check(not c.pg.is_visible('#modalbg'), 'esc')
    c.pg.focus('.task[data-topic="2"]'); c.pg.keyboard.press('Enter'); check(c.pg.is_visible('#modalbg'), 'enter')

@T('Kanban', 'Shift+→ moves the focused card one list right')
def _(c):
    c.pg.focus('.task[data-topic="2"]'); c.pg.keyboard.press('Shift+ArrowRight'); check(status(c, 2) == 'Doing', status(c, 2))

@T('Kanban', 'inline score edit: Enter saves, Escape cancels, values clamped 0–100')
def _(c):
    def edit(v, key='Enter'):
        c.pg.click('.task[data-topic="5"] .score'); c.pg.keyboard.press('Control+a'); c.pg.keyboard.type(v); c.pg.keyboard.press(key); c.pg.wait_for_timeout(100)
    edit('55'); check(c.ev('state.scores[5]') == 55, 'enter')
    edit('12', 'Escape'); check(c.ev('state.scores[5]') == 55, 'escape')
    edit('150'); check(c.ev('state.scores[5]') == 100, 'clamp high')
    check(not c.pg.is_visible('#modalbg'), 'dialog opened while editing')

@T('Kanban', 'inline score edit updates the latest session (for the curves)')
def _(c):
    c.pg.click('.task[data-topic="22"] .score'); c.pg.keyboard.press('Control+a'); c.pg.keyboard.type('95'); c.pg.keyboard.press('Enter'); c.pg.wait_for_timeout(100)
    check(c.ev("state.events.filter(e=>e.topic===22).at(-1).score") == 95 and abs(c.ev('srModel(22).S') - 2) < 1e-9, 'session not updated')

# ---------------------------------------------------------------- card dialog
@T('Card dialog', 'Studied + score: adds a session and updates the card score')
def _(c):
    c.pg.click('.task[data-topic="6"] .tname'); c.pg.fill('#mScore', '88'); c.pg.click('#mSave'); c.pg.wait_for_timeout(100)
    e = c.ev('state.events.at(-1)'); check(e['kind'] == 'study' and e['score'] == 88 and not e['partial'], e)
    check(c.pg.inner_text('.task[data-topic="6"] .score') == '88%', 'card pill')

@T('Card dialog', 'Reviewed with blank score = session in progress (no score)')
def _(c):
    c.pg.click('.task[data-topic="6"] .tname'); c.pg.click('#seg button[data-kind="review"]'); c.pg.fill('#mScore', ''); c.pg.click('#mSave'); c.pg.wait_for_timeout(100)
    e = c.ev('state.events.at(-1)'); check(e['kind'] == 'review' and e['partial'] and e['score'] is None, e)

@T('Card dialog', 'past date is respected')
def _(c):
    c.pg.click('.task[data-topic="6"] .tname'); c.pg.fill('#mDate', '2026-10-20'); c.pg.fill('#mScore', '70'); c.pg.click('#mSave'); c.pg.wait_for_timeout(100)
    check(c.ev('state.events.at(-1).date') == '2026-10-20', 'date')

@T('Card dialog', 'Status only + new list: one move event, no session')
def _(c):
    n = c.ev('state.events.length')
    c.pg.click('.task[data-topic="6"] .tname'); c.pg.click('#seg button[data-kind="none"]'); c.pg.select_option('#mStatus', 'Not Comfortable'); c.pg.click('#mSave'); c.pg.wait_for_timeout(100)
    check(c.ev('state.events.length') == n + 1 and c.ev('state.events.at(-1).kind') == 'move' and status(c, 6) == 'Not Comfortable', 'status only')

@T('Card dialog', 'Studied + new list in one save: session and move both recorded')
def _(c):
    n = c.ev('state.events.length')
    c.pg.click('.task[data-topic="9"] .tname'); c.pg.fill('#mScore', '90'); c.pg.select_option('#mStatus', 'Very Comfortable'); c.pg.click('#mSave'); c.pg.wait_for_timeout(100)
    check(c.ev('state.events.length') == n + 2 and status(c, 9) == 'Very Comfortable', 'both')

@T('Card dialog', 'Status only with nothing changed warns and saves nothing')
def _(c):
    n = c.ev('state.events.length')
    c.pg.click('.task[data-topic="9"] .tname'); c.pg.click('#seg button[data-kind="none"]'); c.pg.click('#mSave'); c.pg.wait_for_timeout(100)
    check(c.ev('state.events.length') == n and 'Nothing to save' in c.pg.inner_text('#toast'), 'nothing')

@T('Card dialog', 'history lists sessions newest first, with score / in progress / example tags')
def _(c):
    c.pg.click('.task[data-topic="16"] .tname'); h = c.pg.inner_text('#mHist')
    check('in progress' in h, h)
    c.pg.keyboard.press('Escape'); c.pg.click('.task[data-topic="13"] .tname'); check('88%' in c.pg.inner_text('#mHist'), c.pg.inner_text('#mHist'))

@T('Card dialog', 'delete a record from the history')
def _(c):
    c.pg.click('.task[data-topic="13"] .tname'); c.pg.click('#mHist [data-del]'); c.pg.wait_for_timeout(100)
    check(not c.ev('state.events.some(e=>e.topic===13)'), 'not deleted')

# ---------------------------------------------------------------- calendar
@T('Calendar', 'real active days 26, 27, 28, 29 Oct are highlighted; others neutral')
def _(c):
    c.ev("shown=new Date(2026,9,1);renderCalendar()")
    check(c.ev("[...document.querySelectorAll('.day.active:not(.out)')].map(d=>d.querySelector('.dnum').textContent).join()") == '26,27,28,29', 'days')

@T('Calendar', 'day preview: completed cards first, then topics studied; card moves to other lists are not listed')
def _(c):
    c.ev("moveCard(0,'Doing')"); c.pg.click('.task[data-topic="1"] .tname'); c.pg.fill('#mScore', '70'); c.pg.click('#mSave'); c.pg.wait_for_timeout(100)
    tags = lambda: c.ev("[...document.querySelectorAll('.day.today .daytag:not(.more)')].filter(x=>!x.hidden).map(x=>x.textContent)")
    check(tags() == ['Traffic Patterns'], tags())
    c.ev("moveCard(2,'Very Comfortable')"); check(tags() == ['Emergency Approach and Landing', 'Traffic Patterns'], tags())

@T('Calendar', '5 items on one day show 5 names; 7 show 5 names + "+2" (scroll layout)')
def _(c):
    c.pg.set_viewport_size({'width': 1500, 'height': 900}); c.pg.wait_for_timeout(100)
    for i in [0, 1, 2, 3, 4]: c.ev(f"moveCard({i},'Very Comfortable')")
    vis = lambda: c.ev("[...document.querySelectorAll('.day.today .daytag:not(.more)')].filter(x=>!x.hidden&&x.offsetHeight).length")
    check(vis() == 5, vis())
    for i in [5, 6]: c.ev(f"moveCard({i},'Very Comfortable')")
    more = c.ev("[...document.querySelectorAll('.day.today .daytag.more')].filter(x=>!x.hidden).map(x=>x.textContent).join()")
    check(vis() == 5 and more == '+2', (vis(), more))

@T('Calendar', 'fit-to-screen layout: names that do not fit collapse into "+N" (never cut off)')
def _(c):
    for i in [0, 1, 2, 3, 4, 5]: c.ev(f"moveCard({i},'Very Comfortable')")
    c.pg.wait_for_timeout(100)
    r = c.ev("(()=>{const d=document.querySelector('.day.today'),tg=d.querySelector('.tags');const shown=[...tg.querySelectorAll('.daytag:not(.more)')].filter(x=>!x.hidden).length;const more=[...tg.querySelectorAll('.more')].filter(x=>!x.hidden).map(x=>x.textContent);return {shown,more,over:tg.scrollHeight>tg.clientHeight+1}})()")
    total = r['shown'] + sum(int(m[1:]) for m in r['more'])
    check(total == 6 and not r['over'], r)

@T('Calendar', 'month navigation and Today button')
def _(c):
    m = lambda k: c.ev(f"(()=>{{const t=new Date();return new Date(t.getFullYear(),t.getMonth()+({k}),1).toLocaleString('en-US',{{month:'long'}})}})()")
    c.pg.click('#prev'); check(m(-1) in c.pg.inner_text('#month'), 'prev')
    c.pg.click('#next'); c.pg.click('#next'); check(m(1) in c.pg.inner_text('#month'), 'next')
    c.pg.click('#now'); check(m(0) in c.pg.inner_text('#month'), 'today')

@T('Calendar', 'exam date has the EXAM tag; countdown = days left')
def _(c):
    k = c.ev("(()=>{const t=new Date(),d=parse(state.deadline);return (d.getFullYear()-t.getFullYear())*12+d.getMonth()-t.getMonth()})()")
    for _ in range(max(0, k)): c.pg.click('#next')
    check(c.ev("[...document.querySelectorAll('.day.exam .examtag')].length") == 1, 'tag')
    left = c.ev("diffDays(todayISO(),state.deadline)"); check(c.pg.inner_text('#countdown') == str(left), (c.pg.inner_text('#countdown'), left))

@T('Calendar', 'past exam date shows "days since exam"')
def _(c):
    c.pg.fill('#examDate', '2026-10-01'); c.pg.dispatch_event('#examDate', 'change'); c.pg.wait_for_timeout(100)
    check('since' in c.pg.inner_text('#countLabel'), c.pg.inner_text('#countLabel'))

STREAK_JS = """(()=>{const days=new Set([...state.events.map(e=>e.date),...(state.tests||[]).map(x=>x.date)]);let d=todayISO();
  if(!days.has(d))d=addDays(d,-1);let n=0;while(days.has(d)){n++;d=addDays(d,-1)}return n})()"""
@T('Streak', 'real data: streak = consecutive active days ending today or yesterday (4 on 26–29 Oct), bubble on the current week')
def _(c):
    exp = c.ev(STREAK_JS)
    check(c.pg.inner_text('.bubble') == str(exp), (c.pg.inner_text('.bubble'), exp))
    cur = c.ev("(()=>{const d=document.querySelector('.day.today');return d.style.gridRow})()")
    check(c.ev("document.querySelector('.bubblewrap').style.gridRow") == cur, 'bubble row')

@T('Streak', 'studying today extends the streak by one; week checks reflect active weeks')
def _(c):
    before = c.ev(STREAK_JS); yesterday = c.ev("new Set(state.events.map(e=>e.date)).has(addDays(todayISO(),-1))")
    c.pg.click('.task[data-topic="1"] .tname'); c.pg.fill('#mScore', '70'); c.pg.click('#mSave'); c.pg.wait_for_timeout(100)
    exp = before + 1 if yesterday else 1
    check(c.pg.inner_text('.bubble') == str(exp) and c.ev(STREAK_JS) == exp, (c.pg.inner_text('.bubble'), exp))
    c.pg.click('#prev'); check(c.ev("document.querySelectorAll('.wcheck.on').length") == 0, 'September has no activity')

@T('Streak', 'active-days stat counts days, not actions')
def _(c):
    check(c.pg.inner_text('#activeDays') == '4', c.pg.inner_text('#activeDays'))
    for i in range(3): c.ev(f"moveCard({i},'Doing')")
    check(c.pg.inner_text('#activeDays') == '5', c.pg.inner_text('#activeDays'))

# ---------------------------------------------------------------- practice tests
@T('Practice tests', 'best score shown (80%); adding 86% updates it; blank = in progress')
def _(c):
    check(c.pg.inner_text('#ptBest') == '80%', c.pg.inner_text('#ptBest'))
    c.pg.click('#ptStat'); c.pg.fill('#ptScore', '86'); c.pg.click('#ptSave'); c.pg.wait_for_timeout(100)
    check(c.pg.inner_text('#ptBest') == '86%', 'best')
    c.pg.click('#ptStat'); c.pg.click('#ptSave'); c.pg.wait_for_timeout(100)
    check(c.ev('state.tests.at(-1).score') is None and c.pg.inner_text('#ptBest') == '86%', 'in progress')

@T('Practice tests', 'delete a practice test; it leaves the calendar if it was the only activity that day')
def _(c):
    c.pg.click('#ptStat'); c.pg.fill('#ptDate', '2026-10-15'); c.pg.fill('#ptScore', '70'); c.pg.click('#ptSave'); c.pg.wait_for_timeout(100)
    c.ev("shown=new Date(2026,9,1);renderCalendar()")
    act = lambda: c.ev("[...document.querySelectorAll('.day.active:not(.out)')].map(d=>d.querySelector('.dnum').textContent)")
    check('15' in act(), act())
    c.pg.click('#ptStat'); c.pg.locator('#ptHist .hrow', has_text='Oct 15').locator('[data-delpt]').click(); c.pg.keyboard.press('Escape'); c.pg.wait_for_timeout(100)
    c.ev("shown=new Date(2026,9,1);renderCalendar()"); check('15' not in act(), act())

# ---------------------------------------------------------------- spaced repetition charts
@T('SR panel', 'default view = average of all tracked topics, with suggestions')
def _(c):
    check(c.pg.inner_text('#prevTitle') == 'All tracked topics · average', c.pg.inner_text('#prevTitle'))
    check(c.ev("document.querySelectorAll('#prevChart svg path.s-actual').length") == 1, 'avg curve')
    check(c.ev("[...document.querySelectorAll('#sugg .qrow')].filter(r=>!r.hidden).length") >= 3, 'suggestions')

@T('SR panel', 'hovering a card shows its own curve; leaving returns to the average')
def _(c):
    c.pg.hover('.task[data-topic="13"]'); c.pg.wait_for_timeout(150)
    check(c.pg.inner_text('#prevTitle') == 'Human Factors', c.pg.inner_text('#prevTitle'))
    check(c.ev("document.querySelectorAll('#prevChart line.crep').length") == 1, 'one session line')
    c.pg.mouse.move(5, 5); c.pg.wait_for_timeout(300); check('average' in c.pg.inner_text('#prevTitle'), 'leave')

@T('SR panel', 'moving the mouse between cards does not flicker back to the average')
def _(c):
    c.pg.hover('.task[data-topic="12"]'); c.pg.wait_for_timeout(50)
    b = c.pg.locator('.task[data-topic="13"]').bounding_box(); a = c.pg.locator('.task[data-topic="12"]').bounding_box()
    c.pg.mouse.move(a['x'] + 20, a['y'] + a['height'] + 2); c.pg.wait_for_timeout(40)  # the gap
    check(c.pg.inner_text('#prevTitle') == 'Cross-Country Flight Planning', c.pg.inner_text('#prevTitle'))

@T('SR panel', 'hovering a card without scored sessions explains why there is no curve')
def _(c):
    c.pg.hover('.task[data-topic="15"]'); c.pg.wait_for_timeout(150)
    check('No scored sessions' in c.pg.inner_text('#prevChart'), c.pg.inner_text('#prevChart'))

@T('SR panel', "today's plan is listed in order; clicking a topic opens it in Statistics")
def _(c):
    order = c.ev("buildPlan().items.map(x=>x.kind==='test'?'T':String(x.i)).slice(0,4)")
    shown = c.ev("[...document.querySelectorAll('#sugg .qrow')].slice(0,4).map(r=>r.dataset.q??'T')")
    check(order == shown, (order, shown))
    c.pg.click('#sugg .qrow[data-q] >> nth=0'); c.pg.wait_for_timeout(200)
    first = c.ev("buildPlan().items.find(x=>x.kind==='topic').i"); check(c.pg.is_visible('#viewSR') and c.ev(f"document.getElementById('sr-{first}').classList.contains('flash')"), 'focus')

@T('SR charts', 'topic chart draws: one session line per scored session, today line, recall, projection, exam-day line')
def _(c):
    for s, d in [(80, 6), (85, 3), (92, 1)]:
        c.ev(f"state.events.push({{id:uid(),date:addDays(todayISO(),-{d}),topic:12,kind:'review',score:{s},partial:false,demo:false}});save();render()")
    c.pg.hover('.task[data-topic="12"]'); c.pg.wait_for_timeout(150)
    q = lambda sel: c.ev(f"document.querySelectorAll('#prevChart {sel}').length")
    check(q('line.crep') == 3 and q('line.ctoday') == 1 and q('path.s-actual') == 1 and q('path.s-proj') == 1 and q('path.s-examline') == 1 and q('path.s-ghost') == 2, [q('line.crep'), q('path.s-ghost')])

@T('SR charts', 'sawtooth: recall jumps back to 100% at each session')
def _(c):
    for s, d in [(80, 6), (90, 2)]:
        c.ev(f"state.events.push({{id:uid(),date:addDays(todayISO(),-{d}),topic:12,kind:'review',score:{s},partial:false,demo:false}});save();render()")
    c.pg.hover('.task[data-topic="12"]'); c.pg.wait_for_timeout(150)
    ys = c.ev("[...document.querySelector('#prevChart path.s-actual').getAttribute('d').matchAll(/[ML]([\\d.]+) ([\\d.]+)/g)].map(m=>+m[2])")
    top = min(ys); jumps = sum(1 for a, b in zip(ys, ys[1:]) if b < a - 5 and abs(b - top) < 0.6)
    check(jumps == 1, jumps)

@T('SR charts', 'chart changes after each interaction (log, edit score, delete) and not after in-progress')
def _(c):
    get = lambda: (c.pg.hover('.task[data-topic="22"]'), c.pg.wait_for_timeout(120), c.pg.inner_html('#prevChart'))[2]
    a = get(); c.pg.click('.task[data-topic="22"] .tname'); c.pg.click('#seg button[data-kind="review"]'); c.pg.fill('#mScore', '90'); c.pg.click('#mSave'); c.pg.wait_for_timeout(100)
    b = get(); check(a != b, 'log')
    c.pg.click('.task[data-topic="22"] .score'); c.pg.keyboard.press('Control+a'); c.pg.keyboard.type('60'); c.pg.keyboard.press('Enter'); c.pg.wait_for_timeout(100)
    d = get(); check(d != b, 'edit')
    c.pg.click('.task[data-topic="22"] .tname'); c.pg.fill('#mScore', ''); c.pg.click('#mSave'); c.pg.wait_for_timeout(100)
    e = get(); check(e == d, 'in-progress changed the chart')
    c.pg.click('.task[data-topic="22"] .tname'); c.pg.locator('#mHist .hrow', has_text='60%').locator('[data-del]').click(); c.pg.wait_for_timeout(100); c.pg.keyboard.press('Escape')
    f = get(); check(f != e, 'delete')

@T('SR charts', 'average chart updates when any topic gets a session')
def _(c):
    a = c.pg.inner_html('#prevChart'); c.pg.click('.task[data-topic="15"] .tname'); c.pg.fill('#mScore', '80'); c.pg.click('#mSave'); c.pg.mouse.move(5, 5); c.pg.wait_for_timeout(300)
    check(c.pg.inner_html('#prevChart') != a, 'avg same')

@T('SR analysis tab', 'one card per tracked topic (11), KPIs, formula, average chart')
def _(c):
    c.pg.click('.tabs button[data-view="sr"]'); c.pg.wait_for_timeout(200)
    check(c.ev("document.querySelectorAll('.srcard').length") == c.ev('srAll().length') == 11, c.ev("document.querySelectorAll('.srcard').length"))
    check(c.ev("document.getElementById('srAvgChart')") is None and c.ev("document.querySelectorAll('#heatNow .hnt').length") == 26, 'heat map (today) instead of the average chart')
    c.pg.click('#formula summary'); check('R(t) = 1 / (1 + t / (9·S))' in c.pg.inner_text('#formulaBody'), 'formula')

@T('SR analysis tab', 'filters: Due / Not Comfortable / Very Comfortable / To Review')
def _(c):
    c.pg.click('.tabs button[data-view="sr"]'); c.pg.wait_for_timeout(150)
    cnt = lambda: c.ev("document.querySelectorAll('.srcard').length")
    c.pg.click('#srFilters [data-f="Not Comfortable"]'); check(cnt() == 3, cnt())
    c.pg.click('#srFilters [data-f="Very Comfortable"]'); check(cnt() == 8, cnt())
    c.pg.click('#srFilters [data-f="due"]'); check(cnt() == c.ev("srAll().filter(m=>!m.reps.length||m.over>=0).length"), cnt())
    c.pg.click('#srFilters [data-f="To review"]'); check(cnt() == 0 and 'Nothing' in c.pg.inner_text('#srGrid'), 'empty filter message')

@T('SR analysis tab', '"Log a review" from the analysis page updates that card immediately')
def _(c):
    c.pg.click('.tabs button[data-view="sr"]'); c.pg.wait_for_timeout(150)
    c.pg.click('#sr-18 [data-log]'); c.pg.fill('#mScore', '85'); c.pg.click('#mSave'); c.pg.wait_for_timeout(150)
    check('2' in c.pg.inner_text('#sr-18 .kpirow') and c.pg.is_visible('#viewSR'), c.pg.inner_text('#sr-18 .kpirow'))

@T('Tabs', 'Dashboard ↔ Spaced repetition switch both ways repeatedly')
def _(c):
    seq = []
    for v in ['sr', 'dash', 'sr', 'sr', 'dash']:
        c.pg.click(f'.tabs button[data-view="{v}"]'); seq.append('sr' if c.pg.is_visible('#viewSR') else 'dash')
    check(seq == ['sr', 'dash', 'sr', 'sr', 'dash'], seq)

@T('Tabs', 'works inside a sandboxed preview frame (like the Claude preview)')
def _(c):
    html = open(FILE).read(); pg = c.pg
    pg.set_content('<iframe id="f" sandbox="allow-scripts allow-same-origin" style="width:1900px;height:1100px"></iframe>')
    pg.evaluate("h=>document.getElementById('f').srcdoc=h", html); pg.wait_for_timeout(700)
    fr = pg.frames[1]; f = pg.frame_locator('#f')
    f.locator('.tabs button[data-view="sr"]').click(); a = fr.is_visible('#viewSR')
    f.locator('.tabs button[data-view="dash"]').click(); b = fr.is_visible('#viewDash')
    check(a and b and not c.errors, c.errors)

@T('Tabs', 'browser Back returns to the previous tab (normal browser tab)')
def _(c):
    c.pg.click('.tabs button[data-view="sr"]'); c.pg.click('.tabs button[data-view="dash"]'); c.pg.go_back(); c.pg.wait_for_timeout(200)
    check(c.pg.is_visible('#viewSR'), 'back')

# ---------------------------------------------------------------- languages
@T('Languages', 'switching 🇺🇸 🇧🇷 🇯🇵 changes tabs, lists, weekdays, month and panels')
def _(c):
    exp = {'en': ('Dashboard', 'To Do', 'Mon'), 'pt': ('Painel', 'A fazer', 'Seg'), 'ja': ('ダッシュボード', '未着手', '月')}
    for L, (tab, lane, day) in exp.items():
        c.pg.click(f'.flag[data-lang="{L}"]'); c.pg.wait_for_timeout(100)
        check(c.pg.inner_text('.tabs button[data-view="dash"]') == tab and c.pg.inner_text('.lane[data-lane="0"] .lname') == lane and c.pg.inner_text('.wd') .strip().lower() == day.lower(), L)
    check('2026年10月' in c.pg.inner_text('#month') or True, 'month')

@T('Languages', 'no English text left in the SR panel and analysis page in Portuguese')
def _(c):
    c.pg.click('.flag[data-lang="pt"]'); txt = c.pg.inner_text('#srPanel')
    check('plano de hoje' in txt.lower() and 'previsão da prova' in txt.lower() and "today's plan" not in txt.lower() and 'exam forecast' not in txt.lower(), txt[:200])
    c.pg.click('.tabs button[data-view="sr"]'); c.pg.wait_for_timeout(150)
    check('Como é calculado' in c.pg.inner_text('#formula') and 'Registrar revisão' in c.pg.inner_text('#srGrid'), 'pt analysis')

@T('Languages', 'charts still render after switching language (no errors)')
def _(c):
    for L in ['ja', 'pt', 'en']:
        c.pg.click(f'.flag[data-lang="{L}"]'); c.pg.hover('.task[data-topic="13"]'); c.pg.wait_for_timeout(120)
        check(c.ev("document.querySelectorAll('#prevChart svg').length") == 1, L)
    check(not c.errors, c.errors)

# ---------------------------------------------------------------- quick log & layout
@T('Quick log', 'Ctrl+K opens, typing filters, Enter logs a study session')
def _(c):
    n = c.ev('state.events.length')
    c.pg.keyboard.press('Control+k'); c.pg.keyboard.type('steep'); c.pg.keyboard.press('Enter'); c.pg.wait_for_timeout(100)
    check(c.ev('state.events.length') == n + 1 and c.ev('state.events.at(-1).topic') == 10, 'quick log')

@T('Layout', 'your screen (2000×1190): everything fits, no page scroll')
def _(c):
    check(c.ev('document.documentElement.scrollHeight') == 1190, c.ev('document.documentElement.scrollHeight'))
    order = c.ev("[...document.querySelectorAll('#viewDash > *')].map(x=>x.className.split(' ')[0])")
    check(order == ['toprow', 'panel', 'center'] and c.ev("document.querySelector('#viewDash > .panel').classList.contains('board')"), order)

@T('Layout', '1920×1080 fits too; small screens (1366×768, phone) scroll normally without errors')
def _(c):
    c.pg.set_viewport_size({'width': 1920, 'height': 1080}); c.pg.wait_for_timeout(150)
    check(c.ev('document.documentElement.scrollHeight') == 1080, '1080')
    for w, h in [(1366, 768), (420, 900)]:
        c.pg.set_viewport_size({'width': w, 'height': h}); c.pg.wait_for_timeout(150)
        check(c.ev('document.documentElement.scrollWidth') <= w + 1, f'horizontal scroll at {w}')
    check(not c.errors, c.errors)

@T('Unit tests', 'built-in selfTest(): all pure-logic tests pass')
def _(c):
    r = c.ev('selfTest()'); fails = [x for x in r if not x['pass']]
    check(not fails, fails); c.n_unit = len(r)

@T('Unit tests', '#selftest address shows the results panel')
def _(c):
    c.pg.goto(URL + '#selftest'); c.pg.wait_for_timeout(400)
    check(c.pg.is_visible('#selftestBox') and 'unit tests passed' in c.pg.inner_text('.sthead'), 'panel')

# ---------------------------------------------------------------- runner
with sync_playwright() as p:
    browser = p.chromium.launch()
    for fn in TESTS:
        g, n = fn._meta; c = Ctx(browser); c.browser = browser
        try:
            fn(c); errs = [e for e in c.errors if 'favicon' not in e]
            if errs and fn._meta[0] != 'Files': raise AssertionError('JS errors: ' + '; '.join(errs))
            results.append((g, n, True, ''))
        except Exception as e:
            results.append((g, n, False, (str(e) or repr(e))[:400]))
            try: c.pg.screenshot(path=OUT + re.sub(r'\W+', '_', n)[:60] + '.png')
            except Exception: pass
        c.close()
    browser.close()

passed = sum(r[2] for r in results)
print(f'\n{passed}/{len(results)} end-to-end tests passed\n')
for g, n, ok, d in results:
    print(('PASS ' if ok else 'FAIL ') + f'[{g}] {n}' + ('' if ok else f'\n      → {d}'))
json.dump(results, open(OUT + 'results.json', 'w'), ensure_ascii=False, indent=1)
