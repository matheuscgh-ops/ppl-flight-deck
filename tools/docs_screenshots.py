"""Screenshots for the user guide, one set per language: docs/img/en, docs/img/pt, docs/img/ja.

Run after a UI change that shows in the guide (needs the built index.html and demo.html):
    python3 build.py && python3 tools/docs_screenshots.py          # all languages
    python3 tools/docs_screenshots.py pt                           # one language
The demo's fictional data is used everywhere except the sync dialog, which only exists in the personal app
(it is shot disconnected, so no token or Gist id can appear).
"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
DEMO = 'file://' + os.path.join(ROOT, 'demo.html'); IDX = 'file://' + os.path.join(ROOT, 'index.html')
LANGS = sys.argv[1:] or ['en', 'pt', 'ja']
OUT = None
def shot(pg, name, sel=None, full=False):
    pg.wait_for_timeout(350)
    path = os.path.join(OUT, name + '.jpg')
    (pg.locator(sel).first if sel else pg).screenshot(path=path, type='jpeg', quality=80, **({} if sel else {'full_page': full}))
def save_el(pg, sel, name):
    pg.locator(sel).screenshot(path=os.path.join(OUT, name + '.jpg'), type='jpeg', quality=80)
def setlang(pg, lang):
    pg.click(f'.flag[data-lang="{lang}"]'); pg.wait_for_timeout(250)
def run(b, lang):
    c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1); pg = c.new_page()
    pg.goto(DEMO); pg.wait_for_timeout(700); ev = pg.evaluate; ev("pplTour.end()"); pg.wait_for_timeout(300); setlang(pg, lang)
    shot(pg, 'dash')
    shot(pg, 'dash-progress', '.progress'); shot(pg, 'dash-board', '.board'); shot(pg, 'dash-cal', '.cal'); shot(pg, 'dash-side', '#srPanel')
    shot(pg, 'dash-top', '.toprow') if pg.locator('.toprow').count() else None
    ev("openModal(18,'review')"); shot(pg, 'log', '#modalbg .modal'); ev("closeModal()")
    ev("document.querySelector('.day[data-date].active, .day[data-date]').click()"); shot(pg, 'day', '#daybg .modal'); pg.keyboard.press('Escape')
    pg.click('#volOpen'); shot(pg, 'volume', '#volbg .modal'); pg.keyboard.press('Escape')
    pg.click('#fcMini'); shot(pg, 'fctop', '#fcTopBg .modal'); pg.keyboard.press('Escape')
    pg.keyboard.press('Control+k'); pg.keyboard.type('wea'); shot(pg, 'palette', '#palbg .pal'); pg.keyboard.press('Escape')
    # plan
    ev("goView('plan')"); pg.wait_for_timeout(300); pg.click('#pwNext'); shot(pg, 'plan-week', '#planWeek')
    pg.click('#pwTabs [data-pw="plans"]'); shot(pg, 'plan-myplans', '#planWeek'); pg.click('#pwTabs [data-pw="week"]'); pg.click('#pwToday')
    pg.click('#kbSync'); shot(pg, 'plan-kbsync', '#kbbg .modal'); pg.click('#kbCancel')
    pg.click('#pwNew'); pg.click('[data-wtype="weekly"]'); pg.click('#wzWkNext'); pg.click('#wzWkNext'); shot(pg, 'wiz-1', '#wizbg .modal')
    pg.click('#wzNext'); pg.wait_for_timeout(200)
    a = pg.locator('#wzGrid .wkcol').nth(0).locator('.wks[data-s="1170"]'); a.scroll_into_view_if_needed(); b1 = a.bounding_box(); b2 = pg.locator('#wzGrid .wkcol').nth(0).locator('.wks[data-s="1245"]').bounding_box()
    pg.mouse.move(b1['x'] + 5, b1['y'] + 3); pg.mouse.down(); pg.mouse.move(b1['x'] + 5, b2['y'] + 3, steps=6); pg.mouse.up(); pg.wait_for_timeout(150)
    pg.click('#wzCopy'); shot(pg, 'wiz-2', '#wizbg .modal')
    pg.click('#wzNext'); pg.wait_for_timeout(1500); shot(pg, 'wiz-3', '#wizbg .modal')
    pg.locator('[data-wact="edit"]').first.click(); shot(pg, 'wiz-3-edit', '#wizbg .wzday >> nth=0'); pg.locator('[data-wact="cancel"]').first.click()
    pg.click('#wzNext'); pg.wait_for_timeout(300); shot(pg, 'wiz-4', '#wizbg .modal')
    pg.click('#wzClose'); pg.wait_for_timeout(200)
    ev("openWizard({mode:'new',type:'daily',start:addDays(mondayOf(todayISO()),9)})"); pg.click('#wzNext')
    for s in (600, 615, 630, 645): pg.locator(f'#wzGrid .wks[data-s="{s}"]').click()
    pg.click('#wzNext'); pg.wait_for_timeout(600); pg.click('#wzNext'); pg.wait_for_timeout(300); pg.click('#wzNext'); pg.wait_for_timeout(300)
    shot(pg, 'ask-replace', '#askbg .modal'); pg.click('#askNo'); pg.click('#wzClose')
    # tests
    ev("goView('tests')"); pg.wait_for_timeout(400); shot(pg, 'tests')
    ev("openPt()"); shot(pg, 'pt-log', '#ptbg .modal'); pg.keyboard.press('Escape')
    # statistics
    ev("goView('sr');setStat('bank')"); pg.wait_for_timeout(600); shot(pg, 'stats-top', '.stattrio'); shot(pg, 'stats-mid', '.statmid')
    pg.click('#heatOpen'); shot(pg, 'heat-history', '#heatbg .modal'); pg.keyboard.press('Escape')
    ev("document.getElementById('srGrid').scrollIntoView()"); shot(pg, 'stats-topics', '#srGrid .srcard >> nth=0')
    ev("setStat('tests')"); pg.wait_for_timeout(500); shot(pg, 'stats-tests', '#statTests')
    # settings
    ev("goView('dash')"); pg.click('#setOpen'); pg.wait_for_timeout(300)
    save_el(pg, '#setbg .modal', 'settings')
    ev("document.querySelector('#setbg .modal').scrollTop=99999"); save_el(pg, '#setbg .modal', 'settings-2')
    c.close()
    # personal app: sync dialog
    c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1); pg = c.new_page(); pg.goto(IDX); pg.wait_for_timeout(500); setlang(pg, lang)
    pg.evaluate("localStorage.removeItem('ppl-flight-deck-sync')"); pg.reload(); pg.wait_for_timeout(500); pg.click('#syncChip'); shot(pg, 'sync', '#syncbg .modal'); c.close()
    # phone
    c = b.new_context(viewport={'width': 402, 'height': 874}, is_mobile=True, has_touch=True, user_agent=UA, device_scale_factor=1.5); pg = c.new_page()
    pg.goto(DEMO); pg.wait_for_timeout(700); pg.evaluate("pplTour.end()"); pg.wait_for_timeout(300); setlang(pg, lang)
    shot(pg, 'phone-dash')
    pg.evaluate("goView('plan')"); pg.wait_for_timeout(300); pg.tap('#pwNext'); shot(pg, 'phone-plan')
    pg.tap('#setOpen'); shot(pg, 'phone-settings')
    c.close()


with sync_playwright() as p:
    b = p.chromium.launch()
    for lang in LANGS:
        OUT = os.path.join(ROOT, 'docs', 'img', lang); os.makedirs(OUT, exist_ok=True)
        run(b, lang)
        print(lang, len(os.listdir(OUT)), 'screenshots')
    b.close()
