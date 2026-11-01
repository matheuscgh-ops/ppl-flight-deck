"""Sync tests: a fake GitHub API (in memory) shared by several 'devices' (browser contexts)."""
import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
import json, sys, shutil, os, tempfile
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

FILE = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html'))
URL = 'file://' + FILE
OUT = os.path.join(tempfile.gettempdir(), 'ppl-tests', '')
os.makedirs(OUT, exist_ok=True)
GOOD = 'ghp_good'
gists = {}; calls = []; net = {'down': False}
CORS = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS'}

def api(route):
    req = route.request; u = urlparse(req.url); path = u.path
    if req.method == 'OPTIONS': return route.fulfill(status=204, headers=CORS)
    if net['down']: return route.abort('internetdisconnected')
    calls.append((req.method, path))
    if req.headers.get('authorization') != 'Bearer ' + GOOD:
        return route.fulfill(status=401, headers=CORS, body='{"message":"Bad credentials"}')
    J = lambda o, st=200: route.fulfill(status=st, headers={**CORS, 'Content-Type': 'application/json'}, body=json.dumps(o))
    if path == '/user': return J({'login': 'matheus'})
    if path == '/gists' and req.method == 'GET': return J([{'id': k, 'files': {f: {} for f in v['files']}} for k, v in gists.items()])
    if path == '/gists' and req.method == 'POST':
        b = json.loads(req.post_data); gid = 'g%d' % (len(gists) + 1)
        gists[gid] = {'public': b['public'], 'files': {k: v['content'] for k, v in b['files'].items()}}
        return J({'id': gid}, 201)
    gid = path.split('/')[-1]
    if gid not in gists: return J({'message': 'Not Found'}, 404)
    if req.method == 'GET': return J({'id': gid, 'files': {k: {'content': c, 'truncated': False} for k, c in gists[gid]['files'].items()}})
    if req.method == 'PATCH':
        b = json.loads(req.post_data)
        for k, v in b['files'].items(): gists[gid]['files'][k] = v['content']
        return J({'id': gid})
    return J({}, 400)

results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond), str(detail)[:300]))

def device(browser, w=2000, h=1190):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, accept_downloads=True)
    ctx.route('https://api.github.com/**', api)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto(URL); pg.wait_for_timeout(300); return ctx, pg, errs

def connect(pg, token=GOOD):
    pg.click('#syncChip'); pg.fill('#syncToken', token); pg.click('#syncConnect'); pg.wait_for_timeout(400)

def remote(): return json.loads(list(gists.values())[0]['files']['ppl-flight-deck.json']) if gists else None

with sync_playwright() as p:
    b = p.chromium.launch()
    A, a, ea = device(b)
    check('sync is off by default; no request is made to GitHub', a.inner_text('#syncChip') == 'Sync off' and not calls, calls)

    connect(a, 'ghp_wrong')
    check('wrong token: clear message, device stays disconnected, nothing stored', 'invalid' in a.inner_text('#syncMsg') and a.evaluate("localStorage.getItem('ppl-flight-deck-sync')") is None and not gists, a.inner_text('#syncMsg'))

    a.fill('#syncToken', ''); a.click('#syncConnect'); a.wait_for_timeout(100)
    check('empty token: asks to paste it first', 'Paste' in a.inner_text('#syncMsg'))

    a.fill('#syncToken', GOOD); a.click('#syncConnect'); a.wait_for_timeout(400)
    g = list(gists.values())[0] if gists else {}
    check('first device: creates ONE private Gist with the full progress', len(gists) == 1 and g.get('public') is False and len(remote()['events']) == 6, gists.keys())
    check('dialog shows connected as @matheus and the chip says Synced', '@matheus' in a.inner_text('#syncWho') and a.inner_text('#syncChip') == 'Synced', a.inner_text('#syncChip'))
    a.keyboard.press('Escape')

    a.evaluate("moveCard(0,'Doing')"); a.wait_for_timeout(1500)
    check('a change on device A reaches the Gist about a second later', remote()['statuses'][0] == 'Doing')

    a.click('.task[data-topic="1"] .tname'); a.fill('#mScore', '81'); a.click('#mSave'); a.wait_for_timeout(1500)
    check('logged session + score are synced', remote()['scores'][1] == 81 and any(e['topic'] == 1 and e.get('score') == 81 for e in remote()['events']))

    n = len([c for c in calls if c[0] == 'PATCH'])
    for i in [2, 3, 4]: a.evaluate(f"moveCard({i},'Doing')")
    a.wait_for_timeout(1600)
    check('rapid changes are batched (one upload, not one per click)', len([c for c in calls if c[0] == 'PATCH']) - n == 1 and remote()['statuses'][4] == 'Doing')

    # ---- device B (the phone) ----
    B, bp, eb = device(b, 420, 900)
    check('phone before connecting has only the built-in data', bp.evaluate('state.statuses[0]') == 'Todo')
    connect(bp)
    check('phone connects with the same token → finds the SAME Gist (no duplicate) and loads A\'s progress',
          len(gists) == 1 and bp.evaluate('state.statuses[0]') == 'Doing' and bp.evaluate('state.scores[1]') == 81)
    bp.keyboard.press('Escape')
    check('phone UI re-rendered with the synced data (card is in Doing)', bp.evaluate("document.querySelector('.task[data-topic=\"0\"]').closest('.lane').dataset.lane") == '1')

    bp.evaluate("moveCard(5,'Very Comfortable')"); bp.wait_for_timeout(1500)
    a.evaluate("lastPull=0"); a.dispatch_event('body', 'focus'); a.evaluate("window.dispatchEvent(new Event('focus'))"); a.wait_for_timeout(500)
    check('change on the phone appears on the computer when you come back to it', a.evaluate('state.statuses[5]') == 'Very Comfortable')
    check('calendar/progress on A updated too (Very Comfortable count)', '476 q' in a.inner_text('.lg[data-i="3"]'), a.inner_text('.lg[data-i="3"]'))

    a.reload(); a.wait_for_timeout(600)
    check('after closing/reopening the computer browser, data and sync are still there', a.evaluate('state.statuses[5]') == 'Very Comfortable' and a.inner_text('#syncChip') == 'Synced')

    # ---- offline ----
    net['down'] = True
    a.evaluate("moveCard(6,'Doing')"); a.wait_for_timeout(1500)
    check('offline: change is kept locally and the chip says Offline', a.evaluate('state.statuses[6]') == 'Doing' and 'Offline' in a.inner_text('#syncChip') and remote()['statuses'][6] != 'Doing', a.inner_text('#syncChip'))
    net['down'] = False
    a.evaluate("window.dispatchEvent(new Event('online'))"); a.wait_for_timeout(700)
    check('back online: the pending change is uploaded automatically', remote()['statuses'][6] == 'Doing' and a.inner_text('#syncChip') == 'Synced')

    # ---- conflict: newest wins ----
    bp.evaluate("moveCard(7,'Doing')"); bp.wait_for_timeout(1500)           # phone newer
    a.evaluate("lastPull=0;window.dispatchEvent(new Event('focus'))"); a.wait_for_timeout(500)
    check('newest copy wins: computer adopts the phone\'s newer edit', a.evaluate('state.statuses[7]') == 'Doing')

    # local newer than cloud at open (edited offline, then reopened)
    net['down'] = True; a.evaluate("moveCard(8,'Doing')"); a.wait_for_timeout(1200); net['down'] = False
    a.reload(); a.wait_for_timeout(700)
    check('reopening with an unsent newer local change uploads it instead of losing it', remote()['statuses'][8] == 'Doing' and a.evaluate('state.statuses[8]') == 'Doing')

    # undo syncs
    a.evaluate("moveCard(9,'Doing')"); a.wait_for_timeout(200); a.click('#toast button'); a.wait_for_timeout(1500)
    check('Undo is synced too', remote()['statuses'][9] == 'Todo')

    # ---- merge: both devices edit offline, nothing is lost, a deletion stays deleted ----
    bp.evaluate("lastPull=0;window.dispatchEvent(new Event('focus'))"); bp.wait_for_timeout(600)
    gone = a.evaluate("state.events.find(e=>e.topic===1&&e.score===81).id")
    net['down'] = True
    a.evaluate("commit(()=>{state.events.push({id:'fromA',date:todayISO(),topic:12,kind:'study',score:77,from:null,to:null,partial:false,demo:false})},'x')"); a.wait_for_timeout(300)
    bp.evaluate("commit(()=>{state.events.push({id:'fromB',date:todayISO(),topic:13,kind:'study',score:66,from:null,to:null,partial:false,demo:false})},'x')"); bp.wait_for_timeout(300)
    bp.evaluate(f"commit(()=>{{state.events=state.events.filter(e=>e.id!=='{gone}')}},'x')"); bp.wait_for_timeout(1300)
    net['down'] = False
    a.evaluate("window.dispatchEvent(new Event('online'))"); a.wait_for_timeout(900)
    bp.evaluate("lastPull=0;window.dispatchEvent(new Event('focus'))"); bp.wait_for_timeout(900)
    a.evaluate("lastPull=0;window.dispatchEvent(new Event('focus'))"); a.wait_for_timeout(900)
    ids = lambda pg: set(pg.evaluate("state.events.map(e=>e.id)"))
    check('offline edits on BOTH devices are merged: computer and phone keep both new sessions', {'fromA', 'fromB'} <= ids(a) and {'fromA', 'fromB'} <= ids(bp), (sorted(ids(a))[-3:], sorted(ids(bp))[-3:]))
    check('merged copy is in the Gist', {'fromA', 'fromB'} <= {e['id'] for e in remote()['events']})
    check('a session deleted on the phone does not come back from the computer', gone not in ids(a) and gone not in ids(bp) and gone not in {e['id'] for e in remote()['events']})
    check('the deletion is remembered in the synced copy (tombstone)', gone in remote().get('deleted', {}))
    # plan of the day is shared
    a.evaluate("setEnergy('high')"); a.wait_for_timeout(1500)
    bp.evaluate("lastPull=0;window.dispatchEvent(new Event('focus'))"); bp.wait_for_timeout(700)
    check('energy mode chosen on the computer shows on the phone', bp.evaluate('energyMode') == 'high' and remote()['plan']['energy'] == 'high')
    bp.evaluate("setManualTest(true)"); bp.wait_for_timeout(1500)
    a.evaluate("lastPull=0;window.dispatchEvent(new Event('focus'))"); a.wait_for_timeout(700)
    check('a practice test added to today\'s plan on the phone shows on the computer', a.evaluate("buildPlan(null,null,energyMode).items.some(x=>x.reason==='testManual')"))
    a.evaluate("setManualTest(false);setEnergy('medium')"); a.wait_for_timeout(1500)

    # ---- saved plans sync between devices (created, edited offline on both, deleted) ----
    P = "({id:'%s',type:'daily',start:todayISO(),active:%s,name:'%s',blocks:{[todayISO()]:[[1140,1200]]},items:[{id:'%s_i',date:todayISO(),start:1140,min:30,kind:'custom',i:null,n:0,label:'Simulator',reason:'custom'}],updated:Date.now()})"
    a.evaluate("commit(()=>{state.plans=(state.plans||[]).concat([%s])},'x')" % (P % ('planA', 'true', 'From computer', 'planA'))); a.wait_for_timeout(1500)
    bp.evaluate("lastPull=0;window.dispatchEvent(new Event('focus'))"); bp.wait_for_timeout(800)
    check('a plan created on the computer appears on the phone (and drives today there)', bp.evaluate("state.plans.some(p=>p.id==='planA')&&todayPlan().source==='daily'") and any(x['id'] == 'planA' for x in remote().get('plans', [])))
    net['down'] = True
    a.evaluate("commit(()=>{state.plans=state.plans.concat([%s])},'x')" % (P % ('planA2', 'false', 'Offline A', 'planA2'))); a.wait_for_timeout(300)
    bp.evaluate("commit(()=>{state.plans=state.plans.concat([%s]);state.plans.find(p=>p.id==='planA').items[0].check=true},'x')" % (P % ('planB', 'false', 'Offline B', 'planB'))); bp.wait_for_timeout(1300)
    net['down'] = False
    a.evaluate("window.dispatchEvent(new Event('online'))"); a.wait_for_timeout(900)
    bp.evaluate("lastPull=0;window.dispatchEvent(new Event('focus'))"); bp.wait_for_timeout(900)
    a.evaluate("lastPull=0;window.dispatchEvent(new Event('focus'))"); a.wait_for_timeout(900)
    pids = lambda pg: set(pg.evaluate("state.plans.map(p=>p.id)"))
    check('plans made offline on BOTH devices are merged everywhere', {'planA', 'planA2', 'planB'} <= pids(a) and {'planA', 'planA2', 'planB'} <= pids(bp) and {'planA', 'planA2', 'planB'} <= {x['id'] for x in remote()['plans']}, (pids(a), pids(bp)))
    bp.evaluate("commit(()=>{state.plans=state.plans.filter(p=>p.id!=='planA2')},'x')"); bp.wait_for_timeout(1500)
    a.evaluate("lastPull=0;window.dispatchEvent(new Event('focus'))"); a.wait_for_timeout(900)
    check('a plan deleted on the phone is deleted on the computer and stays deleted', 'planA2' not in pids(a) and 'planA2' in remote().get('deleted', {}))
    a.evaluate("commit(()=>{state.plans=state.plans.filter(p=>!['planA','planB'].includes(p.id))},'x')"); a.wait_for_timeout(1500)

    # ---- secrets never leave the browser ----
    with a.expect_download() as d: a.evaluate("document.getElementById('backup').click()")
    bk = open(d.value.path()).read()
    with a.expect_download() as d2: a.evaluate("document.getElementById('saveHtml').click()")
    html = open(d2.value.path()).read()
    check('token is NOT in the Backup JSON', GOOD not in bk and 'ppl-flight-deck-sync' not in bk)
    check('token is NOT in the Save HTML file', GOOD not in html)
    check('token is NOT in the synced Gist content', GOOD not in json.dumps(remote()))

    # ---- language ----
    a.click('.flag[data-lang="pt"]'); a.wait_for_timeout(100)
    check('chip and dialog translated (pt)', a.inner_text('#syncChip') in ('Sincronizado', 'Sincronizando…'), a.inner_text('#syncChip'))
    a.click('#syncChip'); check('dialog in Portuguese', 'Desconectar este aparelho' in a.inner_text('#syncbg'))
    a.click('#syncNow'); a.wait_for_timeout(400)
    check('"Sync now" works', a.inner_text('#syncState') == 'Sincronizado', a.inner_text('#syncState'))

    # ---- token revoked / gist deleted ----
    GOOD_OLD = GOOD; GOOD = 'ghp_rotated'
    a.click('#syncClose'); a.evaluate("moveCard(10,'Doing')"); a.wait_for_timeout(1500)
    check('revoked/expired token: chip warns, local data kept', 'inválido' in a.inner_text('#syncChip') and a.evaluate('state.statuses[10]') == 'Doing', a.inner_text('#syncChip'))
    GOOD = GOOD_OLD

    # ---- disconnect ----
    a.click('#syncChip'); a.click('#syncOff'); a.wait_for_timeout(200)
    check('disconnect: token removed from this browser, data stays, chip off',
          a.evaluate("localStorage.getItem('ppl-flight-deck-sync')") is None and a.evaluate('state.statuses[10]') == 'Doing' and 'Sem sync' in a.inner_text('#syncChip'))
    k = len(calls); a.evaluate("moveCard(11,'Doing')"); a.wait_for_timeout(1500)
    check('after disconnect no more requests are made', len(calls) == k)

    # ---- sandboxed preview (Claude) still loads fine ----
    pg = A.new_page(); er = []; pg.on('pageerror', lambda e: er.append(str(e)))
    pg.set_content('<iframe id="f" sandbox="allow-scripts allow-same-origin" style="width:1800px;height:1000px"></iframe>')
    pg.evaluate("h=>document.getElementById('f').srcdoc=h", open(FILE).read()); pg.wait_for_timeout(700)
    check('app still loads in a sandboxed preview frame', not er and pg.frames[1].is_visible('#syncChip'), er)

    check('no JavaScript errors on either device', not ea and not eb, ea + eb)
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} sync tests passed\n')
for n, good, d in results: print(('PASS ' if good else 'FAIL ') + n + ('' if good else f'\n      → {d}'))
