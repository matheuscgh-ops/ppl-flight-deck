# PPL Flight Deck — notes for Claude Code

Study tracker for the FAA Private Pilot knowledge test. Two single-file apps are built from `src/`:
`index.html` (personal data, optional GitHub Gist sync) and `demo.html` (fictional data, sync off, guided tour).

## Rules
- Code, comments, tests and internal files in English. Portuguese and Japanese exist only as app translations
  (`src/i18n/translations.js`); every new label needs en, pt and ja.
- Never edit `index.html` or `demo.html` by hand: edit `src/`, then run `python3 build.py`.
- The GitHub token must never go into backups, Save HTML, the Gist, commits or logs.
- The demo must never touch personal data (it has its own storage key).
- No browser pop-ups (`alert`/`confirm`/`prompt`): use the in-page `ask()` dialog and toasts.
- Each JS file is one module (IIFE) with a small public API; shared state goes through `expose()`.
- Plan before large changes, and ask before anything that can't be undone.

## Commands
```bash
python3 build.py                                  # build index.html and demo.html
cd tests && python3 run_all.py                    # all suites, desktop/laptop/iPad mini/iPhone, both files
python3 tests/test_plans.py                       # one suite
npx prettier --config .prettierrc.json --write "src/js/**/*.js" src/i18n/translations.js "src/styles/*.css"
```
Test setup (once, macOS): `python3 -m venv .venv && source .venv/bin/activate && pip install playwright && python -m playwright install chromium` (activate `.venv` before running tests).
The built-in unit tests run in the page: `selfTest()` (or open the app with `#selftest`).

## Before every commit
1. `python3 build.py` (tests/test_build.py fails if the built files are out of date).
2. Run the suites touched by the change, and `tests/test_audit.py` for any UI change.
3. Commit `src/`, `tests/`, `build.py`, `README.md`, `index.html`, `demo.html` together.

## Layout
- `src/index.html` markup (placeholders `@@CSS@@`, `@@JS@@`); `src/styles/` CSS in the order listed in `build.py`.
- `src/js/core` config, helpers, state · `src/js/model` spaced repetition, forecast, practice tests, plan, schedule
- `src/js/views` dashboard, plan (week view, wizard), statistics, heat map, volume, carousels
- `src/js/ui` charts, hover, dialogs/modal, navigation, header, settings · `src/js/sync` Gist sync
- `src/demo` demo data and tour · `tests/` Playwright suites + `run_all.py`

## Publishing
GitHub Pages serves `main` / root: https://matheuscgh-ops.github.io/ppl-flight-deck/ (demo: `/demo.html`).
