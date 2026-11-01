"""Build the two published files from the sources in src/.

    index.html  personal app (your data, cloud sync)
    demo.html   fictional data, sync off, guided tour

Both are single, self-contained HTML files (GitHub Pages serves them as they are). The sources are split by concern:

    src/index.html        page markup with two placeholders: @@CSS@@ and @@JS@@
    src/styles/*.css      styles, concatenated in the order of STYLES (order matters for the cascade)
    src/i18n/             translations (en / pt / ja)
    src/js/               the app: core, data, model, ui, views, sync, selftest, boot — order of SCRIPTS
    src/demo/             demo-only data (state.js) and the guided tour (tour.html)

The demo differs from the personal app in: BUILD.demo = true (own storage key, sync off), its data module
(demo/state.js instead of your history) and a few markup changes (title, DEMO tag, Tour button, tour script).
Every markup replacement must match exactly once.

Usage: python3 build.py
"""
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')

STYLES = [
    '00-base.css', '01-header.css', '02-progress.css', '03-center-calendar.css', '04-board.css', '05-modal.css',
    '06-top-row-and-fit.css', '07-tabs-and-sr-panel.css', '08-statistics.css', '09-small-widgets.css',
    '10-responsive-mid.css', '11-streak.css', '12-phone.css', '13-tablet.css', '14-phone-header.css', '15-volume.css',
    '16-exam-date.css', '17-forecast.css', '18-plan.css', '19-heatmap-hover-carousel.css', '20-practice-tests.css',
    '21-statistics-layout.css', '22-plans.css', '23-settings.css',
]

# load order matters: config and helpers first, the boot sequence last
SCRIPTS = [
    'js/core/module.js',   # expose(): how modules publish shared state
    'js/core/config.js',
    'i18n/translations.js',
    'js/core/util.js',
    'js/ui/modal.js',   # shared dialog wiring and tooltip placement
    '@@DATA@@',   # js/data/personal.js (your history) or demo/state.js (fictional) — see DATA
    'js/core/state.js',
    'js/views/dashboard.js',
    'js/model/spaced-repetition.js',
    'js/model/forecast.js',
    'js/model/practice-tests.js',
    'js/views/forecast.js',
    'js/model/plan.js',
    'js/model/schedule.js',
    'js/views/plan.js',
    'js/ui/charts.js',
    'js/views/preview-carousel.js',
    'js/views/statistics.js',
    'js/views/stats-carousel.js',
    'js/ui/navigation.js',
    'js/ui/palette.js',
    'js/ui/dialogs.js',
    'js/views/volume.js',
    'js/views/practice-tests.js',
    'js/views/heatmap.js',
    'js/views/histogram-calibration.js',
    'js/views/plan-week.js',
    'js/views/plan-wizard.js',
    'js/ui/chart-hover.js',
    'js/ui/header-controls.js',
    'js/ui/settings.js',
    'js/selftest.js',
    'js/sync/gist.js',
    'js/boot.js',
]


DATA = {False: 'js/data/personal.js', True: 'demo/state.js'}


def read(*parts):
    with open(os.path.join(SRC, *parts), encoding='utf-8') as f:
        return f.read()


def build_script(demo):
    header = "'use strict';\nconst BUILD=Object.freeze({demo:%s});" % ('true' if demo else 'false')
    return '\n'.join([header] + [read(DATA[demo] if name == '@@DATA@@' else name) for name in SCRIPTS])


def build_page(demo=False):
    page = read('index.html')
    css = '\n'.join(read('styles', name) for name in STYLES)
    js = build_script(demo)
    for marker, content in (('@@CSS@@', css), ('@@JS@@', js)):
        if page.count(marker) != 1:
            raise SystemExit(f'build: {marker} must appear exactly once in src/index.html')
        page = page.replace(marker, content)
    return page if not demo else apply_demo_markup(page)


def build_personal():
    return build_page(demo=False)


def demo_markup():
    """HTML-only differences of the demo (the JavaScript differences come from BUILD.demo and the data module)."""
    demo_tour = read('demo', 'tour.html')
    return [
        ('<title>PPL Flight Deck</title>', '<title>PPL Flight Deck — Demo</title>'),
        ('</style>', '.demotag{font-style:normal;font-size:.45em;vertical-align:middle;letter-spacing:.08em;color:#ffd08a;background:#3d2b14;border:1px solid #6b4a1c;border-radius:6px;padding:2px 7px;margin-left:6px}\n#syncChip{display:none!important}\n</style>'),
        ('<div class="brand">PPL <span>/</span> FLIGHT DECK</div>', '<div class="brand">PPL <span>/</span> FLIGHT DECK <em class="demotag">DEMO</em></div>'),
        ('<span id="tourSlot"></span>', '<button id="tourBtn" type="button">? Tour</button>'),
        ('</body>', demo_tour + '</body>'),
    ]


def build_demo(_unused=None):
    return build_page(demo=True)


def apply_demo_markup(page):
    for old, new in demo_markup():
        n = page.count(old)
        if n != 1:
            raise SystemExit(f'build: expected 1 match, found {n}: {old[:70]}')
        page = page.replace(old, new)
    return page


if __name__ == '__main__':
    personal = build_personal()
    with open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(personal)
    with open(os.path.join(ROOT, 'demo.html'), 'w', encoding='utf-8') as f:
        f.write(build_demo())
    print('built index.html and demo.html from src/')
