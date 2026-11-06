# PPL Progress — notes for Claude Code

Study tracker for the FAA Private Pilot knowledge test. Two single-file apps are built from `src/`:
`index.html` (personal data, optional GitHub Gist sync) and `demo.html` (fictional data, sync off, guided tour),
plus `demo-next.html`: the demo with the new design (a palette map in `build.py` + the layer in `src/next/`, classes under `.nx`).

## Rules
- Code, comments, tests and internal files in English. Portuguese and Japanese exist only as app translations
  (`src/i18n/translations.js`); every new label needs en, pt and ja.
- Never edit `index.html`, `demo.html` or `demo-next.html` by hand: edit `src/`, then run `python3 build.py`.
- The GitHub token must never go into backups, Save HTML, the Gist, commits or logs.
- The demo must never touch personal data (it has its own storage key).
- No browser pop-ups (`alert`/`confirm`/`prompt`): use the in-page `ask()` dialog and toasts.
- Each JS file is one module (IIFE) with a small public API; shared state goes through `expose()`.
- Plan before large changes, and ask before anything that can't be undone.

## Commands
```bash
python3 build.py                                  # build index.html, demo.html and docs/ (user guide)
python3 tools/docs_screenshots.py                 # retake the guide's screenshots (en, pt, ja) after a UI change
cd tests && python3 run_all.py                    # all suites, desktop/laptop/iPad mini/iPhone, both files
python3 tests/test_plans.py                       # one suite
PPL_BROWSER=webkit python3 tests/test_mobile.py   # one suite in WebKit (Safari engine); CI runs these on every PR
PPL_FILES=demo-next python3 tests/test_mobile.py   # a suite against the new design (default: index demo)
npx prettier --config .prettierrc.json --write "src/js/**/*.js" src/i18n/translations.js "src/styles/*.css"
```
Test setup (once, macOS): `python3 -m venv .venv && source .venv/bin/activate && pip install playwright && python -m playwright install chromium` (activate `.venv` before running tests).
The built-in unit tests run in the page: `selfTest()` (or open the app with `#selftest`).

## Before every commit
1. `python3 build.py` (tests/test_build.py fails if the built files are out of date).
2. Run the suites touched by the change, and `tests/test_audit.py` for any UI change.
3. Commit `src/`, `tests/`, `tools/`, `build.py`, `README.md`, `index.html`, `demo.html`, `demo-next.html` and `docs/` together.

## Layout
- `src/index.html` markup (placeholders `@@CSS@@`, `@@JS@@`); `src/styles/` CSS in the order listed in `build.py`.
- `src/js/core` config, helpers, state · `src/js/model` spaced repetition, forecast, practice tests, plan, schedule
- `src/js/views` dashboard, plan (week view, wizard), statistics, heat map, volume, carousels
- `src/js/ui` charts, hover, dialogs/modal, navigation, header, settings · `src/js/sync` Gist sync
- `src/demo` demo data and tour · `tests/` Playwright suites + `run_all.py`
- `.github/workflows/tests.yml` CI: every suite in Chromium + touch/layout suites in WebKit (report-only)
- `src/docs` user guide (template + en/pt/ja content, same section ids) → built into `docs/`; screenshots in `docs/img/<lang>/`.
  A change to a workflow or the math also updates the guide in all three languages.

## Publishing
GitHub Pages serves `main` / root: https://matheuscgh-ops.github.io/ppl-flight-deck/ (demo: `/demo.html`, guide: `/docs/`).
