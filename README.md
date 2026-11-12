# PPL Progress ✈️

A study tracker for the **FAA Private Pilot (PPL) Knowledge Test**. It is a single HTML file that runs entirely in the browser: no install, no server, no account.

**Live app:** https://matheuscgh-ops.github.io/ppl-flight-deck/
**Demo with fictional data and a guided tour:** https://matheuscgh-ops.github.io/ppl-flight-deck/demo.html  
**User guide (English, Português, 日本語):** https://matheuscgh-ops.github.io/ppl-flight-deck/docs/

The app follows the 28 topics of the Sporty's question bank (1,125 questions). It turns your study history into a plan and an exam forecast, with a target of **85%** on the 60-question test (passing is 70%).

---

## How it is meant to be used

| | When | What it does |
|---|---|---|
| **Dashboard (Kanban)** | Every day — it drives your decisions | One card per topic. Drag cards from *To Do* → *Doing* → *Not Comfortable* / *Very Comfortable* / *To Review*, and tap a card to log a session and its score. |
| **Plan** | Planning your day or week ahead | A week view of your saved plans and **My plans** (create, view, edit, activate / deactivate, copy to next week, delete). New plans take 4 steps: type (daily / weekly) → **time blocks** (click and drag in 15-minute steps; tap a start and an end on touch; Undo / Redo) → **topics** placed by your statistics (editable, plus your own activities such as *Simulator*) → review and save. **⇄ Sync with Kanban** proposes moving today's topics to *Doing* and applies only the moves you approve. Today's list comes from the active daily plan, else the active weekly plan, else the suggestion (topics ordered by **test questions at risk per minute**, sized to your time and energy, each with what to do and why). |
| **Practice tests** | After each FAA practice test (always 60 questions) | Log the score, see the trend line, the date you reach 85% and the next suggested test. |
| **Statistics** | When you want to analyse | *Question bank*: forecast model, where you lose questions, a *needs recall* carousel, today's heat map (click for its history), study volume and a spaced-repetition curve per topic. *Practice tests*: trend, histogram, test-based forecast and model accuracy. |

One statistics engine feeds every screen, so the dashboard, the plan and the statistics always show the same numbers.

## The math (short version)

- **Evidence → mastery → confidence → retention, kept apart:** each result is a score with its sample (27/30; a bare % keeps an unknown sample, never invented) and a kind of attempt (first try 1 · repeat of the same questions 0.3 · after seeing the answers 0). Mastery `m = (Σ w·n·p + 4·p̄) / (Σ w·n + 4)`, a per-session exponential average (each later session keeps 15% of an earlier one's weight) pulled toward your overall level `p̄`; confidence = effective questions (2/2 ≠ 40/40). The forecast's recall uses time ÷ c, c fitted to your own sessions; no interval goes past 30% of the days left to the exam; in a week, an ACS area below half its fair share gets its best topic in.
- **Memory (spaced repetition):** estimated recall `R(t) = 1 / (1 + t / 9S)`. A review is the day's **first** attempt (never the best score). Stability grows after ≥ 70%, **stays** at 60–69% and shrinks below 60%, moved in proportion to the sample (`min(1, n/15)`); under 8 questions is evidence but not a review.
- **Chance of a right answer per topic:** `mastery × R + 1/3 × (1 − R)`. When you forget a topic you fall back to guessing among 3 options, not to zero.
- **Share of the test:** the official share of each ACS area (PSI PAR bulletin, checked 2026-11-11), split inside the area by bank size (an approximation, marked as estimated); the 9% of areas with no Sporty's topic is scored with the average. Used once, in the forecast and in the plan.
- **Exam forecast:** the question-bank model blended with your last 3 practice tests (newer tests weigh more, half-life 10 days). An imported test counts once: the model part leaves out its topic results.
- **Chance to pass / reach 85%:** a beta-binomial over 60 questions, so the uncertainty of the estimate is included.
- **Trend:** least-squares line over practice-test scores (R² is shown as a tooltip). After the last test the projection slows down instead of running to 100%.
- **One policy for every plan** (daily list, calendar, week, Refresh): risk = `60 × share × (1 − p on exam day)` — questions likely missed, not a score gain — × the part of the session the topic needs × timing (1.2 due · 1.25 left undone · 0.8 new in the final stretch). Each day the two topics idle longest (14+ days or never studied) are lifted to the day's median value (coverage). Densest value per minute first, cut to fit; your time is a hard limit.
- **Energy** changes the format, not the value or the time: low ≤ 20 q, easiest first, guided examples, no test; medium ≤ 40 q, most valuable first; high ≤ 40 q, hardest first — the same in the daily list and the calendar. Minutes per question = (answer + review of misses) × your pace, one factor for both.
- **Week:** projected sessions repeat your current mastery (no 70% floor) and never become evidence.
- **Each suggestion explains itself:** the activity (new questions, concept review, guided examples, recall without notes, fluency, short diagnostic) and the main reasons, with the evidence behind them.
- **AI-analysed practice tests:** import a JSON (schema v1, full result or misses only) from ChatGPT or another AI; preview, validation, duplicates refused, atomic apply, Undo. The app copies a ready-made prompt with its real topics. Examples in `docs/examples/`.
- **Filling time blocks:** each continuous block is filled by value per minute (then the leftover time goes to part of the next topic). Following Cal Newport's deep work, a block holds at most one topic per ~45 minutes; the order follows your energy. Each topic is followed right away by the **error review** of its own misses, like the question bank shows a category's misses when you finish it. The block's review time is sized by the misses expected in it (questions × (1 − p) × difficulty × review minutes per miss; at least 10 min, at most a quarter of the block, none when fewer than 3 misses are expected) and split among its topics in proportion to their expected misses, in 5-minute steps. The least valuable topics are trimmed first to keep the reviews in the same block; only when a practice test or a topic that cannot shrink fills the block does the review open the next block, as one item. In the wizard you drag topics to reorder them (grip ⠿ on touch screens; a topic moves with its review) and click a card to edit it. 20+ free minutes get one more topic, and no topic chunk is shorter than 10 minutes.

The *How it is calculated* sections in the app list every formula.

## Features

- **Ready for the exam?:** a bar under the countdown (one segment per check) opens a checklist: practice tests at your goal, chance to pass ≥ 90%, every topic studied, none below 70%, reviews up to date. It also shows the exam phase and **how right the forecast has been** (the forecast the day before each practice test vs. your score: average miss and Brier score). It only reads your data.
- **Phone dashboard (Strava style):** a streak card (weeks in a row, and days) beside the countdown, the volume chart across the whole width, and *Training log* (this week and last week as dots) and *Spaced repetition* (average recall, reviews due) cards that open the full calendar and the curve preview in a maximized card. The Kanban stays; larger screens are unchanged.
- **Next-up bar and focus mode:** on phones a bar at the bottom of the Dashboard and Plan tabs shows the next item of today's plan (its circle ticks it). Tapping it, or ▶ next to *Today's plan* on a computer, opens **focus mode**: one item, a stopwatch against the planned minutes (pause/resume, kept across a reload or a locked phone, screen kept awake), and *Finished → log score* through the usual dialog.
- **Final stretch:** in the last 21 days the plan changes on its own: weak = below your goal, new material gets less room, a practice test at least every 3 days (every 2 in the last 10), 5 more minutes of error notes from 45-minute sessions; no new material in the last 7 days; the day before and the exam day are light (no test, short reviews, 90 minutes at most).
- **Your pace and a dynamic Refresh:** ticking a topic block (or finishing it in focus mode) notes how long it took; plan times follow your real speed per topic (recall topics start quicker than chart and calculation ones). *Refresh plan* moves blocks you finished early before now and fills the rest of today, brings back topic blocks left undone in the last 7 days ("moved"), and never re-plans a topic ticked today. Settings › Your pace shows and resets it.
- **Score from right answers:** a Kanban card in today's plan shows the questions planned for it ("30/158 q"); tap its score and type how many you got right (27 → 90%), or switch to the percentage. The log dialog has *Right answers ___ of 30* too.
- **Kanban drag and drop like Trello:** the other cards slide aside and a card lands exactly where you drop it, in another list or a new place in the same one. The order is saved, goes into the backup and syncs; one Undo reverts a drop (mouse, or press and hold on touch).
- **Error-notes review:** a plan session of an hour or more opens with 10 minutes (15 from two hours) to read earlier error notes in the Errors tab; shorter sessions go straight to the topics.
- **Errors tab (error analysis):** every error note by topic and date, the topics of today's session on top, search and topic filter, add (one note per line) and delete with undo, and **Import from spreadsheet** (paste Topic · Date · Notes rows from Google Sheets or Excel; one note per line, loose topic names, no duplicates).
- **Error notebook:** 📝 on an error review opens the topic's notes; write what you got wrong and it comes back with the topic in today's plan, the plan wizard and its log. Saved, backed up and synced.
- **Adaptive plan:** sessions are sized like the question bank (up to 40 questions; a big topic is never cut under 20), and a review by your last score (15 / 20 / 25 / 40 questions after ≥ 85 / 75 / 70 / below, a bit more the more you forgot). **↻ Refresh plan** re-plans the days ahead with your latest results, keeping what is done or yours (one Undo reverts it). Plan blocks have check circles, a topic and its error review are one block, and the Plan tab has **Week | Day** views with one-line titles that never overlap.
- **Done today:** a Trello-style tick on every Kanban card (shown on hover, always on touch); it clears itself the next day.
- **Your own cards:** "+ Add a card" at the end of a list adds a task of your own ("Review the theory", "Radio calls"). Click to rename or delete. They never count in the statistics. Your own activities in today's plan become cards in Doing on *Sync with Kanban*; cards made on the Kanban stay off the plan.
- Calendar with study streak, activity per day and practice tests.
- Charts with hover: a dashed crosshair to both axes, a dot on each line and the values. On practice tests the cursor snaps to each test. Tap and drag on phones.
- Range selectors (3D → All) on every chart, with a separate one for all the small topic charts.
- **Heat map by topic:** one tile per topic for today, coloured cold → hot by the **chance of a right answer** (`mastery × recall + 1/3 × (1 − recall)`, the same number the forecast uses), coldest first. Click the card for the history (days, weeks or months, with interval filters and hover details).
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
demo-next.html          same as demo.html (the old link of the design preview; generated)
build.py                builds both files and the user guide from src/
docs/                   user guide (generated): index.html (English), pt.html, ja.html; screenshots in docs/img/<lang>/
src/index.html          page markup (placeholders @@CSS@@ and @@JS@@)
src/styles/             CSS, one file per component, concatenated in order
src/i18n/               translations (English, Português, 日本語)
src/js/core/            config, helpers, state and saving
src/js/data/            your study history (personal app only)
src/js/model/           spaced repetition, forecast, practice tests, plan, policy (what to study), exam import
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
python3 build.py        # writes index.html, demo.html, demo-next.html and docs/
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

To run a suite in WebKit (the engine of Safari on iPhone) instead of Chromium: `PPL_BROWSER=webkit python3 tests/test_board_order.py` (after `playwright install webkit`).

**Continuous integration:** `.github/workflows/tests.yml` runs every suite in Chromium on each pull request and push to `main` (one job per suite, in parallel), and the touch and layout suites in WebKit. The WebKit jobs are report-only for now: they show their result on the pull request without blocking the merge.

The suites cover the built-in unit tests (formulas checked against independent calculations and scipy), end to end, sync with a mocked GitHub API, demo/personal isolation, layouts, calendar, volume, spaced repetition everywhere, forecast and plan, practice tests, chart hover, the Statistics layout and heat map, the carousels, saved plans and the Kanban sync, exam phases and the readiness checklist, the next-up bar and focus mode, the phone dashboard cards, your pace and the dynamic refresh, the study day, planner v2 (evidence, ACS shares, energy and time, AI test import), Settings, the guided tour, the user guide and its links, and the build itself.

## Publishing on GitHub Pages

1. Push `index.html` and `demo.html` (plus `src/`, `build.py`, `tests/`, `.prettierrc.json` and this README) to the `main` branch of `ppl-flight-deck`.
2. In **Settings → Pages**, choose *Deploy from a branch* → `main` / `(root)`.
3. After about a minute the app is live at https://matheuscgh-ops.github.io/ppl-flight-deck/ and the demo at https://matheuscgh-ops.github.io/ppl-flight-deck/demo.html.

## Disclaimer

This is a personal study tool. It is not affiliated with the FAA or Sporty's, and its forecasts are estimates, not guarantees.
