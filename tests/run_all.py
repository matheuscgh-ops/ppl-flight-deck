"""Runs every test suite for PPL Flight Deck and prints one summary.

Setup (once):   pip install playwright && python -m playwright install chromium
Run:            python tests/run_all.py
"""
import os, re, subprocess, sys, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.dirname(os.path.abspath(__file__))
summary = []

# 1) unit tests built into each HTML file (selfTest)
with sync_playwright() as p:
    b = p.chromium.launch()
    for f in ['index.html', 'demo.html']:
        pg = b.new_page(); pg.goto('file://' + os.path.join(ROOT, f)); pg.wait_for_timeout(400)
        r = pg.evaluate('selfTest()'); fails = [x for x in r if not x['pass']]
        summary.append((f'Unit tests ({f})', len(r) - len(fails), len(r)))
        for x in fails: print(f'FAIL [unit {f}] {x["group"]}: {x["name"]} → {x["detail"]}')
    b.close()

# 2) end-to-end, sync, isolation and mobile suites
suites = [('End-to-end (index.html)', ['test_e2e.py', os.path.join(ROOT, 'index.html')]),
          ('Sync with GitHub Gist, mocked (index.html)', ['test_sync.py', os.path.join(ROOT, 'index.html')]),
          ('Demo ↔ personal isolation', ['test_isolation.py']),
          ('Mobile, tablet & desktop layouts', ['test_mobile.py']),
          ('Calendar, streak & day summary', ['test_calendar.py']),
          ('Study volume chart', ['test_volume.py']),
          ('Spaced-repetition intervals', ['test_srrange.py']),
          ('Exam forecast & daily plan', ['test_forecast_plan.py']),
          ('Practice tests', ['test_practice_tests.py']),
          ('Spaced repetition everywhere', ['test_sr_consistency.py']),
          ('Chart hover (mouse and touch)', ['test_hover.py']),
          ('Dashboard preview carousel', ['test_carousel.py']),
          ('Statistics layout, heat map, needs-recall carousel', ['test_heatmap.py']),
          ('Saved plans, wizard & Kanban sync', ['test_plans.py']),
          ('Settings', ['test_settings.py']),
          ('Demo guided tour', ['test_tour.py']),
          ('Whole-app audit (text, layout, same numbers everywhere)', ['test_audit.py']),
          ('Build (single source)', ['test_build.py'])]
for title, args in suites:
    out = subprocess.run([sys.executable, os.path.join(HERE, args[0]), *args[1:]], capture_output=True, text=True, cwd=ROOT).stdout
    m = re.search(r'(\d+)/(\d+) [^\n]*passed', out)
    summary.append((title, int(m.group(1)) if m else 0, int(m.group(2)) if m else 1))
    for line in out.splitlines():
        if line.startswith('FAIL') or line.strip().startswith('→'): print(line)

print('\n' + '=' * 60)
total_ok = sum(s[1] for s in summary); total = sum(s[2] for s in summary)
for t, ok, n in summary: print(f'{"✅" if ok == n else "❌"} {t}: {ok}/{n}')
print('=' * 60 + f'\nTOTAL: {total_ok}/{total} passed')
sys.exit(0 if total_ok == total else 1)
