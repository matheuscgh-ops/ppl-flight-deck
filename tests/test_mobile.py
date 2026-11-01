"""Mobile / tablet / desktop layout tests for index.html and demo.html.
Covers: no horizontal scroll, swipeable Kanban lists with dots, the spaced-repetition topic picker
on touch screens, and that desktop hover is unchanged."""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
UA_IPAD = UA_IPHONE.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS')
DEVICES = {
    'iPhone 17': dict(viewport={'width': 402, 'height': 874}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA_IPHONE),
    'iPhone SE': dict(viewport={'width': 320, 'height': 568}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=UA_IPHONE),
    'iPad mini (portrait)': dict(viewport={'width': 744, 'height': 1133}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=UA_IPAD),
    'iPad mini (landscape)': dict(viewport={'width': 1133, 'height': 744}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=UA_IPAD),
}
results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond), str(detail)[:200]))

with sync_playwright() as p:
    b = p.chromium.launch()
    for f in ['index', 'demo']:
        url = 'file://' + os.path.join(ROOT, f + '.html')
        for dev, opts in DEVICES.items():
            c = b.new_context(**opts); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(url); pg.wait_for_timeout(450)
            w = opts['viewport']['width']
            check(f'{f} · {dev}: page is exactly screen-wide (no sideways scroll)', pg.evaluate('document.documentElement.scrollWidth') == w, pg.evaluate('document.documentElement.scrollWidth'))
            check(f'{f} · {dev}: text inputs are 16px (iOS does not auto-zoom)', pg.evaluate("getComputedStyle(document.querySelector('#examDate')).fontSize") == '16px')
            ed = pg.evaluate("(()=>{const i=document.getElementById('examDate').getBoundingClientRect(),c=document.querySelector('.countdown').getBoundingClientRect();return {inside:i.left>=c.left+4&&i.right<=c.right-4,gapL:Math.round(i.left-c.left),gapR:Math.round(c.right-i.right)}})()")
            check(f'{f} · {dev}: exam date field sits inside its card with even margins', ed['inside'] and abs(ed['gapL'] - ed['gapR']) <= 2, ed)
            check(f'{f} · {dev}: all 26 cards rendered', pg.evaluate("document.querySelectorAll('.task').length") == 26)
            if w <= 1099:
                check(f'{f} · {dev}: spaced-repetition topic picker is shown', pg.is_visible('#prevPick'))
            check(f'{f} · {dev}: no JavaScript errors', not errs, errs)
            c.close()

        # ---------- phone behaviour in depth ----------
        c = b.new_context(**DEVICES['iPhone 17']); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(url); pg.wait_for_timeout(450)
        hb = pg.evaluate("(()=>{const b=document.querySelector('.brand').getBoundingClientRect(),f=document.querySelector('.flags').getBoundingClientRect();return {sameRow:Math.abs((f.top+f.bottom)/2-(b.top+b.bottom)/2)<12,right:Math.round(innerWidth-f.right)}})()")
        check(f'{f} · phone: language flags sit top-right, on the title row', hb['sameRow'] and hb['right'] <= 14, hb)
        check(f'{f} · phone: slim header (under 130px tall)', pg.evaluate("document.querySelector('.top').getBoundingClientRect().height") < 130)
        for L in ['en', 'pt', 'ja']:
            pg.click(f'.flag[data-lang="{L}"]'); pg.wait_for_timeout(80)
            tr = pg.evaluate("[...document.querySelectorAll('.tools>button')].filter(b=>b.offsetWidth&&b.scrollWidth>b.clientWidth+1).map(b=>b.textContent)")
            check(f'{f} · phone ({L}): every header button label fits', not tr, tr)
        pg.click('.flag[data-lang="en"]'); pg.wait_for_timeout(80)
        visible = pg.evaluate("[...document.querySelectorAll('.lane')].filter(l=>{const r=l.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1}).length")
        check(f'{f} · phone: Kanban shows one list per screen', visible == 1, visible)
        check(f'{f} · phone: 5 dots under the board', pg.evaluate("document.querySelectorAll('#laneDots button').length") == 5)
        pg.evaluate('goLane(3,false)'); pg.wait_for_timeout(200)
        check(f'{f} · phone: tapping/scrolling to list 4 lights the 4th dot', pg.evaluate("[...document.querySelectorAll('#laneDots button')].findIndex(b=>b.classList.contains('on'))") == 3)
        pg.evaluate("moveCard(state.statuses.indexOf('Very Comfortable'),'Doing')"); pg.wait_for_timeout(200)
        check(f'{f} · phone: moving a card keeps you on the same list', pg.evaluate('laneInView()') == 3)
        check(f'{f} · phone: card shows only name + score (no question count)', not pg.is_visible('.task .tmeta > span:first-child'))
        check(f'{f} · phone: calendar uses circles', pg.evaluate("getComputedStyle(document.querySelector('.day')).borderRadius") == '50%')
        # picker
        check(f'{f} · phone: picker starts on the average curve (the carousel may already have moved on to a plan topic)', pg.evaluate("document.getElementById('prevPick').value") == '' and ('average' in pg.inner_text('#prevTitle') or pg.evaluate("carTopic!=null&&document.getElementById('prevTitle').textContent===TOPICS[carTopic].name")))
        opts = pg.evaluate("[...document.querySelectorAll('#prevPick option')].map(o=>o.textContent)")
        check(f'{f} · phone: picker = average + every tracked topic, most urgent first',
              len(opts) == pg.evaluate('srAll().length') + 1 and opts[1].startswith(pg.evaluate('TOPICS[srAll()[0].i].name')), opts[:3])
        pick = pg.evaluate('srAll().find(m=>m.reps.length).i'); name = pg.evaluate(f'TOPICS[{pick}].name')
        pg.select_option('#prevPick', str(pick)); pg.wait_for_timeout(150)
        check(f'{f} · phone: choosing a topic draws that topic\'s curve', pg.inner_text('#prevTitle') == name and pg.evaluate("document.querySelectorAll('#prevChart path.s-actual').length") == 1)
        pg.reload(); pg.wait_for_timeout(400)
        check(f'{f} · phone: chosen topic is remembered after reopening', pg.inner_text('#prevTitle') == name)
        before = pg.inner_html('#prevChart')
        pg.evaluate(f"state.events.push({{id:uid(),date:todayISO(),topic:{pick},kind:'review',score:95,partial:false,demo:false}});save();render()"); pg.wait_for_timeout(150)
        check(f'{f} · phone: chosen curve updates live after a new session', pg.inner_html('#prevChart') != before)
        row = pg.locator('#sugg .qrow[data-q]').first; s1 = int(row.get_attribute('data-q'))
        row.tap(); pg.wait_for_timeout(200)
        check(f'{f} · phone: tapping a plan item shows its curve in the panel and stays on the dashboard',
              pg.inner_text('#prevTitle') == pg.evaluate(f'TOPICS[{s1}].name') and pg.is_visible('#viewDash'))
        pg.select_option('#prevPick', ''); pg.wait_for_timeout(100)
        check(f'{f} · phone: back to the average', 'average' in pg.inner_text('#prevTitle'))
        pg.tap('#openSR'); pg.wait_for_timeout(300)
        check(f'{f} · phone: "Full analysis" opens every chart in the other tab',
              pg.is_visible('#viewSR') and pg.evaluate("document.querySelectorAll('.srcard').length") == pg.evaluate('srAll().length'))
        pg.click('.tabs button[data-view="dash"]'); pg.click('.flag[data-lang="pt"]'); pg.wait_for_timeout(100)
        check(f'{f} · phone: picker translated (pt)',
              pg.evaluate("document.querySelector('.prevpick .flabel').textContent") == 'Mostrar curva de'
              and pg.evaluate("document.querySelector('#prevPick option').textContent").startswith('Todos'))
        check(f'{f} · phone: no JavaScript errors', not errs, errs)
        c.close()

        # ---------- desktop keeps hover ----------
        c = b.new_context(viewport={'width': 2000, 'height': 1190}); pg = c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(url); pg.wait_for_timeout(400)
        check(f'{f} · desktop: no picker, everything fits on one screen', not pg.is_visible('#prevPick') and pg.evaluate('document.documentElement.scrollHeight') == 1190)
        pg.hover('.task[data-topic="13"]'); pg.wait_for_timeout(150)
        check(f'{f} · desktop: hovering a card shows its curve', pg.inner_text('#prevTitle') == 'Human Factors')
        pg.mouse.move(5, 5); pg.wait_for_timeout(300)
        check(f'{f} · desktop: moving away returns to the average', 'average' in pg.inner_text('#prevTitle'))
        pg.click('#sugg .qrow:not([data-pt]):not([data-wi]) >> nth=0'); pg.wait_for_timeout(200)
        check(f'{f} · desktop: clicking a suggestion opens the analysis tab', pg.is_visible('#viewSR'))
        check(f'{f} · desktop: no JavaScript errors', not errs, errs)
        c.close()
    b.close()

ok = sum(r[1] for r in results)
print(f'\n{ok}/{len(results)} mobile/tablet/desktop tests passed\n')
for n, good, d in results:
    print(('PASS ' if good else 'FAIL ') + n + ('' if good else f'\n      → {d}'))
sys.exit(0 if ok == len(results) else 1)
