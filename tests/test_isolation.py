"""Personal (index.html) and demo (demo.html) served from the SAME origin, like GitHub Pages."""
import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
import json, os, threading, http.server, functools, socketserver
from playwright.sync_api import sync_playwright
class Q(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**k):super().__init__(*a,directory=ROOT,**k)
    def log_message(self,*a):pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',8765),Q);threading.Thread(target=srv.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:8765/';res=[]
def check(n,c,d=''):res.append((n,bool(c),str(d)[:200]))
gh=[]
with sync_playwright() as p:
    b=p.chromium.launch();ctx=b.new_context(viewport={'width':2000,'height':1190})
    ctx.route('https://api.github.com/**',lambda r:(gh.append(r.request.url),r.fulfill(status=200,body='{"login":"x"}',headers={'Access-Control-Allow-Origin':'*'}))[1])
    pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    # personal app: connect a fake token and make a change
    pg.goto(BASE+'index.html');pg.wait_for_timeout(400)
    pg.evaluate("localStorage.setItem('ppl-flight-deck-sync',JSON.stringify({token:'ghp_SECRET',gistId:'g1',login:'me'}))")
    pg.evaluate("moveCard(0,'Doing')");pg.wait_for_timeout(200)
    personal=pg.evaluate("localStorage.getItem('ppl-flight-deck-v13')")
    n_gh=len(gh)
    # open the demo in the same browser (same origin)
    pg.goto(BASE+'demo.html');pg.wait_for_timeout(600)
    check('demo loads its own example data (DEMO badge, >200 events)',pg.is_visible('.demotag') and pg.evaluate('state.events.length')>200)
    check('demo shows no sync button',not pg.is_visible('#syncChip'))
    check('demo does not read your sync token',pg.evaluate('JSON.stringify(sync)')=='{}')
    pg.evaluate("moveCard(3,'Very Comfortable');moveCard(4,'Doing')");pg.wait_for_timeout(1500)
    pg.click('#setOpen');pg.wait_for_timeout(150);pg.click('#clearDemo');pg.wait_for_timeout(150);pg.click('#askYes');pg.wait_for_timeout(200);pg.click('#setClose')
    check('demo made ZERO requests to GitHub',len(gh)==n_gh,gh[n_gh:])
    check('demo saves only to its own storage key',pg.evaluate("localStorage.getItem('ppl-flight-deck-demo')") is not None)
    check('your personal data is byte-for-byte untouched after using the demo',pg.evaluate("localStorage.getItem('ppl-flight-deck-v13')")==personal)
    check('your sync token is untouched',json.loads(pg.evaluate("localStorage.getItem('ppl-flight-deck-sync')"))['token']=='ghp_SECRET')
    with pg.expect_download() as d: pg.evaluate("document.getElementById('backup').click()")
    check('demo backup never contains your token',  'ghp_SECRET' not in open(d.value.path()).read())
    with pg.expect_download() as d: pg.evaluate("document.getElementById('saveHtml').click()")
    check('demo Save HTML never contains your token or your data','ghp_SECRET' not in open(d.value.path()).read())
    # back to personal
    pg.goto(BASE+'index.html');pg.wait_for_timeout(400)
    check('personal app still shows YOUR data (card moved to Doing, 6 real sessions + 1 move)',pg.evaluate('state.statuses[0]')=='Doing' and pg.evaluate('state.events.length')==7 and not pg.is_visible('.demotag'))
    check('personal app has no example badge',not pg.is_visible('#demoBadge'))
    # demo opened fresh by a stranger
    c2=b.new_context();p2=c2.new_page();p2.goto(BASE+'demo.html');p2.wait_for_timeout(500)
    check('a stranger opening demo.html gets the full demo',p2.evaluate('state.events.length')>200 and p2.inner_text('.bubble')=='11')
    p2.goto(BASE+'index.html');p2.wait_for_timeout(400)
    check('a stranger opening index.html sees "Sync off" and only the built-in starting point',p2.evaluate('state.events.length')==6 and 'off' in p2.inner_text('#syncChip').lower())
    check('no JS errors',not errs,errs)
    b.close()
srv.shutdown()
print(f"\n{sum(r[1] for r in res)}/{len(res)} isolation tests passed\n");[print(('PASS ' if r[1] else 'FAIL ')+r[0]+('' if r[1] else '  → '+r[2])) for r in res]
