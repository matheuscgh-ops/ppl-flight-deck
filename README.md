# PPL Flight Deck ✈️

A study tracker for the **FAA Private Pilot (PPL) Knowledge Test**. It is a single HTML file that runs entirely in the browser: no install, no server, no account.

**Live app:** https://matheuscgh-ops.github.io/ppl-flight-deck/
**Demo with fictional data and a guided tour:** https://matheuscgh-ops.github.io/ppl-flight-deck/demo.html

The app follows the 26 topics of the Sporty's question bank (1,058 questions). It turns your study history into a plan and an exam forecast, with a target of **85%** on the 60-question test (passing is 70%).

---

## How it is meant to be used

| | When | What it does |
|---|---|---|
| **Dashboard (Kanban)** | Every day — it drives your decisions | One card per topic. Drag cards from *To Do* → *Doing* → *Not Comfortable* / *Very Comfortable* / *To Review*, and tap a card to log a session and its score. |
| **Plan** | When you don't want to decide | Today's list, built from your statistics: topics ordered by **exam-day questions at stake per minute**, sized to your available time and energy (low / medium / high), plus a practice test every N days. |
| **Practice tests** | After each FAA practice test (always 60 questions) | Log the score, see the trend line, the date you reach 85% and the next suggested test. |
| **Statistics** | When you want to analyse | *Question bank*: forecast model, where you lose questions, a spaced-repetition curve per topic. *Practice tests*: trend, histogram, test-based forecast and model accuracy. |

One statistics engine feeds every screen, so the dashboard, the plan and the statistics always show the same numbers.

## The math (short version)

- **Memory (spaced repetition):** recall `R(t) = 1 / (1 + t / 9S)`. Stability `S` grows after good sessions (score ≥ 70%), grows a little at 60–69% and shrinks below 60%.
- **Chance of a right answer per topic:** `score × R + 1/3 × (1 − R)`. When you forget a topic you fall back to guessing among 3 options, not to zero.
- **Question-bank model:** questions weighted like the bank (`q_i / 1,058`).
- **Exam forecast:** the question-bank model blended with your last 3 practice tests. Newer tests weigh more (half-life of 10 days).
- **Chance to pass / reach 85%:** a beta-binomial over 60 questions, so the uncertainty of the estimate is included.
- **Trend:** least-squares line over practice-test scores (R² is shown as a tooltip). After the last test the projection slows down instead of running to 100%.
- **Plan order:** `(1 − p on exam day) × urgency ÷ minutes per question`.

The *How it is calculated* sections in the app list every formula.

## Features

- Kanban with drag and drop (mouse and touch) and an undo after every change.
- Calendar with study streak, activity per day and practice tests.
- Charts with hover: a dashed crosshair to both axes, a dot on each line and the values. On practice tests the cursor snaps to each test. Tap and drag on phones.
- Range selectors (3D → All) on every chart, with a separate one for all the small topic charts.
- Practice tests count as 60 questions in the weekly volume.
- English, Português and 日本語.
- Layouts for desktop (one-screen dashboard), laptop, iPad and phone.
- **Your data stays in your browser** (localStorage). Backup JSON / Import / Save HTML keep a copy.
- **Optional sync** between devices through a *private* GitHub Gist. Copies are merged by item and deletions are remembered. The token stays in your browser only: it never goes into backups, Save HTML or the Gist.
- The **demo** is fully isolated from the personal app (separate storage, sync off) and has a guided tour.

## Repository layout

```
index.html          personal app (generated, publish this)
demo.html           demo with fictional data and a guided tour (generated, publish this)
src/app.html        ← the single source: edit this
src/demo_state.js   fictional demo data
src/demo_tour.html  guided tour (demo only)
build.py            builds index.html and demo.html from src/
tests/              Playwright test suites + run_all.py
```

## Development

Edit `src/app.html`, then rebuild:

```bash
python3 build.py        # writes index.html and demo.html
```

Run the tests. They need Python 3, Playwright and Chromium (`pip install playwright && playwright install chromium`):

```bash
cd tests
python3 run_all.py      # every suite on desktop, laptop, iPad mini and iPhone sizes
```

The suites cover the built-in unit tests (formulas checked against independent calculations and scipy), end to end, sync with a mocked GitHub API, demo/personal isolation, layouts, calendar, volume, spaced repetition everywhere, forecast and plan, practice tests, chart hover, the guided tour and the build itself.

## Publishing on GitHub Pages

1. Push `index.html` and `demo.html` (plus `src/`, `build.py`, `tests/` and this README) to the `main` branch of `ppl-flight-deck`.
2. In **Settings → Pages**, choose *Deploy from a branch* → `main` / `(root)`.
3. After about a minute the app is live at https://matheuscgh-ops.github.io/ppl-flight-deck/ and the demo at https://matheuscgh-ops.github.io/ppl-flight-deck/demo.html.

## Disclaimer

This is a personal study tool. It is not affiliated with the FAA or Sporty's, and its forecasts are estimates, not guarantees.
