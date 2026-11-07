"""Build the two published files from the sources in src/.

    index.html      personal app (your data, cloud sync)
    demo.html       fictional data, sync off, guided tour
    demo-next.html  the same as demo.html (kept so the link from the design preview keeps working)

Both apps get the design layer (src/next/, see NEXT_STYLES below) on top of src/styles/.

Both are single, self-contained HTML files (GitHub Pages serves them as they are). The sources are split by concern:

    src/index.html        page markup with two placeholders: @@CSS@@ and @@JS@@
    src/styles/*.css      styles, concatenated in the order of STYLES (order matters for the cascade)
    src/i18n/             translations (en / pt / ja)
    src/js/               the app: core, data, model, ui, views, sync, selftest, boot — order of SCRIPTS
    src/demo/             demo-only data (state.js) and the guided tour (tour.html)
    src/docs/             the user guide: template.html + one content file per language (en, pt, ja), built into
                          docs/index.html (English, the default), docs/pt.html and docs/ja.html; screenshots in docs/img/

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
    '21-statistics-layout.css', '22-plans.css', '23-settings.css', '24-readiness.css', '25-focus.css', '26-phone-dash.css',
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
    'js/views/notes.js',   # error notebook (after the dialogs it opens from)
    'js/views/readiness.js',   # "Ready for the exam?" (meter in the countdown card and its dialog)
    'js/views/focus.js',   # next-up bar (phones) and focus mode
    'js/views/phone-dash.js',   # phones: streak, training log and spaced-repetition cards (Strava style)
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


def build_page(demo=False, next_design=False):
    page = read('index.html')
    css = '\n'.join(read('styles', name) for name in STYLES)
    js = build_script(demo)
    if next_design:
        css = next_css(css) + '\n' + next_font() + '\n' + '\n'.join(read('next', name) for name in NEXT_STYLES)
        js = next_js(js) + '\n' + read('next', 'layout.js')
    for marker, content in (('@@CSS@@', css), ('@@JS@@', js)):
        if page.count(marker) != 1:
            raise SystemExit(f'build: {marker} must appear exactly once in src/index.html')
        page = page.replace(marker, content)
    if demo:
        page = apply_demo_markup(page)
    if next_design:
        page = apply_markup(page, NEXT_MARKUP)
    return page


def build_personal():
    return build_page(demo=False, next_design=True)


def demo_markup():
    """HTML-only differences of the demo (the JavaScript differences come from BUILD.demo and the data module)."""
    demo_tour = read('demo', 'tour.html')
    return [
        ('<title>PPL Progress</title>', '<title>PPL Progress — Demo</title>'),
        ('</style>', '.demotag{font-style:normal;font-size:.45em;vertical-align:middle;letter-spacing:.08em;color:#ffd08a;background:#3d2b14;border:1px solid #6b4a1c;border-radius:6px;padding:2px 7px;margin-left:6px}\n#syncChip{display:none!important}\n</style>'),
        ('<div class="brand">PPL <span>/</span> PROGRESS</div>', '<div class="brand">PPL <span>/</span> PROGRESS <em class="demotag">DEMO</em></div>'),
        ('<span id="tourSlot"></span>', '<button id="tourBtn" type="button">? Tour</button>'),
        ('</body>', demo_tour + '</body>'),
    ]


def build_demo(_unused=None):
    return build_page(demo=True, next_design=True)


def apply_demo_markup(page):
    return apply_markup(page, demo_markup())


def apply_markup(page, pairs):
    for old, new in pairs:
        n = page.count(old)
        if n != 1:
            raise SystemExit(f'build: expected 1 match, found {n}: {old[:70]}')
        page = page.replace(old, new)
    return page


# the design layer (both apps): the markup and code stay the same, the layer restyles them. Nothing here changes behaviour:
# next_css/next_js map the palette (and type weights) of the existing styles, src/next/*.css restyles the components,
# src/next/layout.js moves a few elements (the next-up bar into the header, so desktops get it too).
NEXT_STYLES = ['tokens.css', 'base.css', 'chrome.css', 'board.css', 'views.css', 'dialogs.css', 'phone.css']


def next_font():
    """Atkinson Hyperlegible Next (variable weight, Latin subset, SIL Open Font License: src/next/fonts/OFL.txt) embedded in
    the page, so the apps work offline and never call a font server"""
    import base64
    with open(os.path.join(SRC, 'next', 'fonts', 'atkinson-hyperlegible-next-latin-wght-normal.woff2'), 'rb') as f:
        data = base64.b64encode(f.read()).decode()
    return ("@font-face{font-family:'Atkinson Hyperlegible Next';font-style:normal;font-display:swap;font-weight:200 800;"
            f"src:url(data:font/woff2;base64,{data}) format('woff2');"
            "unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,"
            "U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}")


def _hsl(h):
    import colorsys
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    hh, l, ss = colorsys.rgb_to_hls(r, g, b)
    return hh, ss, l


def next_color(m):
    """The new palette, as a function of the old one: neutrals turn to a cool slate with the near-blacks lifted (less
    contrast to tire the eyes), saturated colours keep their hue (their meaning) but lose some intensity."""
    import colorsys
    raw = m.group(0)[1:]
    if len(raw) == 3:
        raw = ''.join(c * 2 for c in raw)
    rgb, alpha = raw[:6].lower(), raw[6:]
    if rgb in NEXT_SWAP:
        return NEXT_SWAP[rgb] + alpha
    h, sat, l = _hsl(rgb)
    if sat < 0.2 or (max(l, 1 - l) > 0.9 and sat < 0.5):
        h, sat = 215 / 360, (0.16 if l < 0.5 else 0.12)
        if l < 0.3:
            l = 0.05 + l * 0.9
        elif l > 0.9:
            l = 0.91 + (l - 0.9) * 0.4
    else:
        sat *= 0.8
        if l > 0.72:
            l = 0.72 + (l - 0.72) * 0.7
    r, g, b = colorsys.hls_to_rgb(h, l, sat)
    return '#%02x%02x%02x%s' % (round(r * 255), round(g * 255), round(b * 255), alpha)


# a few colours set by hand: the calendar's active days are a soft white tile with dark text (instead of mint)
NEXT_SWAP = {'e2f8eb': '#e8edf2', '7fd8aa': '#c3cdd8', '0b3321': '#142131', '138a52': '#1e8a5a'}


WEIGHTS = {'900': '760', '850': '700', '800': '660', '750': '620', '700': '600', '650': '560', '600': '520', '500': '450'}


def next_css(css):
    import re
    css = re.sub(r'#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b', next_color, css)
    css = re.sub(r'(font-weight:\s*)(\d{3})', lambda m: m.group(1) + WEIGHTS.get(m.group(2), m.group(2)), css)
    css = re.sub(r'(font:\s*)(\d{3})', lambda m: m.group(1) + WEIGHTS.get(m.group(2), m.group(2)), css)
    css = css.replace('text-transform: uppercase', 'text-transform: none')
    css = re.sub(r'letter-spacing:\s*0\.0[4-9]em', 'letter-spacing: 0', css)
    return css


def next_js(js):
    """the colours the code draws with (lists, charts) follow the same palette; only 6/8-digit hex strings in quotes or
    template strings are colours here (ids are words, and #fff-style ones are left alone)"""
    import re
    js = re.sub(r"(?<=['\"`(,:\s])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})\b", next_color, js)
    # fixed rgb() colours (heat-map ends)
    def rgb(m):
        hx = next_color(re.match('.*', '#%02x%02x%02x' % tuple(int(v) for v in m.groups())))
        return 'rgb(%d,%d,%d)' % tuple(int(hx[i:i + 2], 16) for i in (1, 3, 5))
    js = re.sub(r'rgb\((\d{1,3}),(\d{1,3}),(\d{1,3})\)', rgb, js)
    # the heat map's colour stops ([value, [r, g, b]])
    a = js.index('HEAT_STOPS = [')
    b = js.index('];', a)
    stops = re.sub(r'\[(\d{1,3}), (\d{1,3}), (\d{1,3})\]', lambda m: '[%s]' % ', '.join(rgb(m)[4:-1].split(',')), js[a:b])
    return js[:a] + stops + js[b:]
NEXT_MARKUP = [
    ('<html lang="en">', '<html lang="en" class="nx">'),
    # the logo: a navigation arrow (half outlined, half filled), on a light tile so it reads on any tab strip
    ('<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 64 64\'%3E%3Ccircle cx=\'32\' cy=\'32\' r=\'31\' fill=\'%23000\'/%3E%3Cpath d=\'M32 14 L50 46 H14 Z\' fill=\'%23fff\'/%3E%3C/svg%3E">',
     '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 64 64\'%3E%3Crect width=\'64\' height=\'64\' rx=\'14\' fill=\'%23eef1f6\'/%3E%3Csvg x=\'9\' y=\'9\' width=\'46\' height=\'46\' viewBox=\'100 40 920 945\'%3E%3Cpath fill=\'%2321365c\' fill-rule=\'evenodd\' d=\'M560 48 1015 980 560 812 105 980ZM558 205 558 742 240 858Z\'/%3E%3C/svg%3E%3C/svg%3E">'),
    ('<meta name="viewport" content="width=device-width, initial-scale=1">',
     '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
     '<meta name="theme-color" content="#12171e">'),
]


def build_next():
    """demo-next.html was the preview of the design; it is now the demo itself"""
    return build_demo()


# user guide: English is the default page (index.html), each other language has its own page
DOCS = [('en', 'index.html', 'en', 'PPL Progress — User guide', 'English'),
        ('pt', 'pt.html', 'pt-BR', 'PPL Progress — Manual de uso', 'Português'),
        ('ja', 'ja.html', 'ja', 'PPL Progress — ユーザーガイド', '日本語')]


def build_docs():
    """Returns {file name in docs/: page} for every language of the user guide."""
    template = read('docs', 'template.html')
    pages = {}
    for code, name, html_lang, title, _label in DOCS:
        langs = '<div class="langs" role="group" aria-label="Language">' + ''.join(
            f'<a href="{n}" hreflang="{h}"' + (' aria-current="page"' if c == code else '') + f'>{lb}</a>'
            for c, n, h, _t, lb in DOCS) + '</div>'
        content = read('docs', code + '.html')
        if content.count('@@LANGS@@') != 1:
            raise SystemExit(f'build: @@LANGS@@ must appear exactly once in src/docs/{code}.html')
        page = template
        for marker, value in (('@@FILE@@', code), ('@@HTMLLANG@@', html_lang), ('@@TITLE@@', title),
                              ('@@CONTENT@@', content.replace('@@LANGS@@', langs).replace('src="img/', f'src="img/{code}/'))):
            if marker not in page:
                raise SystemExit(f'build: {marker} missing from src/docs/template.html')
            page = page.replace(marker, value)
        pages[name] = page
    return pages


if __name__ == '__main__':
    personal = build_personal()
    with open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(personal)
    with open(os.path.join(ROOT, 'demo.html'), 'w', encoding='utf-8') as f:
        f.write(build_demo())
    with open(os.path.join(ROOT, 'demo-next.html'), 'w', encoding='utf-8') as f:
        f.write(build_next())
    os.makedirs(os.path.join(ROOT, 'docs'), exist_ok=True)
    for name, page in build_docs().items():
        with open(os.path.join(ROOT, 'docs', name), 'w', encoding='utf-8') as f:
            f.write(page)
    print('built index.html, demo.html, demo-next.html and docs/ (en, pt, ja) from src/')
