# PPL Progress ✈️

A study tracker for the **FAA Private Pilot (PPL) Knowledge Test**. It is a single HTML file that runs entirely in the browser: no install, no server, no account.

**Live app:** https://matheuscgh-ops.github.io/ppl-flight-deck/
**Demo with fictional data and a guided tour:** https://matheuscgh-ops.github.io/ppl-flight-deck/demo.html  
**User guide (English, Português, 日本語):** https://matheuscgh-ops.github.io/ppl-flight-deck/docs/

The app follows the 26 topics of the Sporty's question bank (1,058 questions). It turns your study history into a plan and an exam forecast, with a target of **85%** on the 60-question test (passing is 70%).

---

## How it is meant to be used

| | When | What it does |
|---|---|---|
| **Dashboard (Kanban)** | Every day — it drives your decisions | One card per topic. Drag cards from *To Do* → *Doing* → *Not Comfortable* / *Very Comfortable* / *To Review*, and tap a card to log a session and its score. |
| **Plan** | Planning your day or week ahead | A week view of your saved plans and **My plans** (create, view, edit, activate / deactivate, copy to next week, delete). New plans take 4 steps: type (daily / weekly) → **time blocks** (click and drag in 15-minute steps; tap a start and an end on touch; Undo / Redo) → **topics** placed by your statistics (editable, plus your own activities such as *Simulator*) → review and save. **⇄ Sync with Kanban** proposes moving today's topics to *Doing* and applies only the moves you approve. Today's list comes from the active daily plan, else the active weekly plan, else the suggestion (topics ordered by **exam-day questions at stake per minute**, sized to your time and energy). |
| **Practice tests** | After each FAA practice test (always 60 questions) | Log the score, see the trend line, the date you reach 85% and the next suggested test. |
| **Statistics** | When you want to analyse | *Question bank*: forecast model, where you lose questions, a *needs recall* carousel, today's heat map (click for its history), study volume and a spaced-repetition curve per topic. *Practice tests*: trend, histogram, test-based forecast and model accuracy. |

One statistics engine feeds every screen, so the dashboard, the plan and the statistics always show the same numbers.

## The math (short version)

- **Memory (spaced repetition):** recall `R(t) = 1 / (1 + t / 9S)`. Stability `S` grows after good sessions (score ≥ 70%), grows a little at 60–69% and shrinks below 60%.
- **Chance of a right answer per topic:** `score × R + 1/3 × (1 − R)`. When you forget a topic you fall back to guessing among 3 options, not to zero.
- **Question-bank model:** questions weighted like the bank (`q_i / 1,058`).
- **Exam forecast:** the question-bank model blended with your last 3 practice tests. Newer tests weigh more (half-life of 10 days).
- **Chance to pass / reach 85%:** a beta-binomial over 60 questions, so the uncertainty of the estimate is included.
- **Trend:** least-squares line over practice-test scores (R² is shown as a tooltip). After the last test the projection slows down instead of running to 100%.
- **Plan order:** `(1 − p on exam day) × urgency ÷ minutes per question`. Topics you missed in a plan during the last 7 days get a 25% boost.
- **Filling time blocks:** each continuous block is a knapsack (most exam-day questions protected within its minutes, then the leftover time goes to part of the next topic). Following Cal Newport's deep work, a block holds at most one topic per ~45 minutes, and the hardest or longest-unreviewed topic goes first while you are fresh. A weekly plan fills the days in order and assumes the earlier days were done, so a topic reviewed on Monday is not due again on Tuesday. Each topic is followed right away by the **error review** of its own misses, like the question bank shows a category's misses when you finish it. The block's review time is sized by the misses expected in it (questions × (1 − p) × difficulty × review minutes per miss; at least 10 min, at most a quarter of the block, none when fewer than 3 misses are expected) and split among its topics in proportion to their expected misses, in 5-minute steps. The topics are trimmed, easiest first, to keep the reviews in the same block; only when a practice test or a topic that cannot shrink fills the block does the review open the next block, as one item. In the wizard you drag topics to reorder them (grip ⠿ on touch screens; a topic moves with its review) and click a card to edit it. 20+ free minutes get one more topic, and no topic chunk is shorter than 10 minutes.

The *How it is calculated* sections in the app list every formula.

## Features

- **Kanban drag and drop like Trello:** the other cards slide aside and a card lands exactly where you drop it, in another list or a new place in the same one. The order is saved, goes into the backup and syncs; one Undo reverts a drop (mouse, or press and hold on touch).
- **Your own cards:** "+ Add a card" at the end of a list adds a task of your own ("Review the theory", "Radio calls"). Click to rename or delete. They never count in the statistics. Your own activities in today's plan become cards in Doing on *Sync with Kanban*; cards made on the Kanban stay off the plan.
- Calendar with study streak, activity per day and practice tests.
- Charts with hover: a dashed crosshair to both axes, a dot on each line and the values. On practice tests the cursor snaps to each test. Tap and drag on phones.
- Range selectors (3D → All) on every chart, with a separate one for all the small topic charts.
- **Heat map by topic:** one tile per topic for today, coloured cold → hot by the **chance of a right answer** (`score × recall + 1/3 × (1 − recall)`, the same number the forecast uses), coldest first. Click the card for the history (days, weeks or months, with interval filters and hover details).
- **Plans and weekly review:** planned vs done for the week, missed blocks marked, and a nudge from Friday on to plan next week. A daily plan over an active weekly plan asks before replacing that day; a second weekly plan for the same week asks before replacing the week.
- **Carousels:** every 3 s the dashboard preview and the *Needs recall* card on Statistics move through the topics left in today's plan (most urgent first). They pause on hover.
- **Study volume** is always open on Statistics, and in a dialog from the dashboard.
- All percentage charts use the same full 0–100% scale.
- Practice tests count as 60 questions in the weekly volume.
- English, Português and 日本語.
- Layouts for desktop (one-screen dashboard), laptop, iPad and phone.
- **Settings (⚙ in the header):** exam date and language; goal score (80 / 85 / 90 %, followed by every goal line, chance and label); review threshold (when a topic falls due); practice-test half-life and the idle days that bring a test forward; the suggested daily plan (minutes slider, questions per hour, review minutes, test cadence, default energy); plan grid start hour and deep-work minutes per topic; default chart intervals; carousels and heat-map numbers on/off; sync; Backup / Import / Save HTML / Clear examples / Reset everything (asks first, can be undone); the demo tour. Every setting syncs and goes into the backup; the defaults are the original behaviour.
- **User guide:** the book button in the header opens the guide in the app's language (English by default, Portuguese and Japanese), with screenshots in each language and a chapter on the science behind the numbers (formulas, papers, Cal Newport's principles). The tour's last step links to it too.
- **Your data stays in your browser** (localStorage). Backup JSON / Import / Save HTML (in Settings) keep a copy.
- **Optional sync** between devices through a *private* GitHub Gist. Copies are merged by item and deletions are remembered. The token stays in your browser only: it never goes into backups, Save HTML or the Gist.
- The **demo** is fully isolated from the personal app (separate storage, sync off) and has a guided tour.

## Repository layout

```
index.html              personal app (generated, publish this)
demo.html               demo with fictional data and a guided tour (generated, publish this)
build.py                builds both files and the user guide from src/
docs/                   user guide (generated): index.html (English), pt.html, ja.html; screenshots in docs/img/<lang>/
src/index.html          page markup (placeholders @@CSS@@ and @@JS@@)
src/styles/             CSS, one file per component, concatenated in order
src/i18n/               translations (English, Português, 日本語)
src/js/core/            config, helpers, state and saving
src/js/data/            your study history (personal app only)
src/js/model/           spaced repetition, forecast, practice tests, plan
src/js/views/           dashboard, plan, statistics, heat map, volume, carousels …
src/js/ui/              charts, hover, dialogs (shared modal wiring), navigation, header, settings
src/js/sync/            GitHub Gist sync
src/demo/               fictional data and the guided tour (demo only)
src/docs/               user guide source: template.html + en.html, pt.html, ja.html
tools/                  docs_screenshots.py: retakes the guide's screenshots in every language
tests/                  Playwright suites + run_all.py
```

Each JavaScript file is one module (an IIFE) that keeps its internals private and returns a small public API.

## Development

Edit the files in `src/`, then rebuild:

```bash
python3 build.py        # writes index.html, demo.html and docs/
```

After a UI change that shows in the user guide, retake its screenshots (all languages, or one: `pt`):

```bash
python3 tools/docs_screenshots.py
```

Run the tests. They need Python 3, Playwright and Chromium (`pip install playwright && playwright install chromium`):

```bash
cd tests
python3 run_all.py      # every suite on desktop, laptop, iPad mini and iPhone sizes
```

The suites cover the built-in unit tests (formulas checked against independent calculations and scipy), end to end, sync with a mocked GitHub API, demo/personal isolation, layouts, calendar, volume, spaced repetition everywhere, forecast and plan, practice tests, chart hover, the Statistics layout and heat map, the carousels, saved plans and the Kanban sync, Settings, the guided tour, the user guide and its links, and the build itself.

## Publishing on GitHub Pages

1. Push `index.html` and `demo.html` (plus `src/`, `build.py`, `tests/`, `.prettierrc.json` and this README) to the `main` branch of `ppl-flight-deck`.
2. In **Settings → Pages**, choose *Deploy from a branch* → `main` / `(root)`.
3. After about a minute the app is live at https://matheuscgh-ops.github.io/ppl-flight-deck/ and the demo at https://matheuscgh-ops.github.io/ppl-flight-deck/demo.html.

## Disclaimer

This is a personal study tool. It is not affiliated with the FAA or Sporty's, and its forecasts are estimates, not guarantees.
