# Interactive playtest 2026-10-30 (QA Player blocked: no shell/browser) — evidence report

Task: bd1dcbdc-870e-446c-89e3-c4afb6d21db7. Date: 2026-10-30. Owner: QA Tester.
Source revision: `7b4cec2525f4fb6b42d56644998e58e83fa1793f` (task base commit; working tree clean, no repository-file changes made).
Result: **partial — label matters, see "What I could not test"**.

## Session note: no human/manual play performed

My tool access in this session has no browser-automation tool (no Claude-in-Chrome, no built-in
browser, no computer-use) enabled or available. I could not personally click through the UI in a
browser like a human tester. **Any statement below about UI behavior comes from automated
Playwright-driven scripts in `tests/e2e/` and `scripts/walkthrough.mjs` that this repository
already owns, run fresh against this build, not from my own interactive play.** Per the task's
own instruction ("You are an AI tester: do not present your judgment as human feedback"), I am
flagging this explicitly rather than writing the report as if I had played manually. Where the
task asked me to "play the build myself," that specific framing is **NOT PLAYED** — I instead ran
the project's existing scripted interactive-equivalent coverage, which already drives a real
server + real Playwright browser contexts for both companies, and report its concrete results.

## Setup

- `node --version` → v22.14.0 (matches requirement).
- `npm ci` → 189 packages installed, 0 errors (2 pre-existing audit advisories, unrelated to this task).
- `npm run build` → all 5 workspaces build clean.
- `npm run save:backup` → "no save at .../data/banner-and-bounty.sqlite; nothing to back up" (fresh worktree, nothing to protect). All subsequent runs use the scripts' own isolated temp-DB servers (`tests/e2e/lib/server.mjs`, `scripts/walkthrough.mjs`), never the default `data/` path, so no owner save was touched.

## Commands and results

### `npm run validate` (typecheck + unit tests + build)
27 test files, 215 tests, all passed. Typecheck and build clean.

### `npm run walkthrough` (scripted 10-step playable walkthrough, Playwright, ACCELERATED clock)
15/15 steps passed, covering: company A roster inspect/reorder, expedition start with lock
explanations, collect + close/reopen + collect again, equip a drop, level to 3, dual-class +
loadout, boss challenge with full battle view (4 unit panels) and one-time-reward enforcement,
playback step/skip-to-end sync, company B publish in a separate browser context, cross-account
403/404 isolation, A challenges B and B's post-challenge edit does not alter A's saved report,
server restart with both saves + 4 credited offline cycles, roster > party cap, second area
selection, 4-floor dungeon clear with boss floor battle view, craft + reforge, and keyboard +
390px layout across all 6 screens (Company/Expedition/Dungeon/Inventory/Boss/Arena).
Console errors logged were expected 401/400s from deliberate unauthorized/invalid probes inside
the script, not unhandled failures.
Screenshots: `test-results/walkthrough/*.png` (1280px company/expedition views, 390px views of
all 6 screens). Reviewed `09-expedition-1280.png` (readable gear/affix cards) and
`14-boss-390.png` (narrow-layout boss screen, visible focus outline) directly — both render
correctly with no overflow or clipped text.

### `node scripts/simulate.mjs --seed 1 --runs 8 --max-cycles 100` (pacing + 8h catch-up, production engine)
- Reproducibility (same seed twice): PASS.
- 8-run pacing sweep: 96/96 wins, first drop median cycle 2.5, level-3 unlock and boss-ready both at cycle 12 across all 8 runs.
- Combat v2 and crafting/reforge reproducibility: PASS.
- Team-building contrast (balanced vs. glass-cannon, Old Road v2, level 5): **both builds won 8/8 with win rate 1.0**; avg rounds 3.25 vs 3 — a small rounds difference but no clear/fail differentiation at this tuning. This is an **observation for Economy Designer**, not a defect I can score pass/fail on (acceptance check 7 asks for *a* measurable difference in the predicted direction; rounds-to-clear did move in the expected direction, but win-rate saturation at this level/area makes the contrast weak).
- Dungeon full-clear benchmark: both builds 8/8 clears, 4 floors avg.
- 7-day v2 ledger: 420/420 Old Road wins, 14/14 dungeon clears, no losses — consistent with the above saturation observation.
- **8-hour catch-up benchmark** (10 reps of a 480-cycle/8h settlement): duration min/median/p95/max = 3.97/5.03/7.20/7.20 ms, well under the 2000ms provisional target; `recentCycles` bound (≤10) held; hardware: Intel i7-14700K, node v22.14.0, win32/x64.

### `tests/e2e/api-attacks.mjs` (API-level account isolation, retries, offline edge cases — isolated temp DB)
19/19 checks passed, including:
- **Account isolation**: foreign heroId equip → 403; cross-account report read → 404 (no existence leak); unauthenticated request → 401; foreign heroIds in formation reorder → 403.
- **Concurrent/retry safety**: identical-requestId retry returns identical result at the same revision (no double credit); reused requestId with a different payload → 409, no mutation; two concurrent settle calls at the same revision → exactly one commits, the other 409.
- **Offline catch-up edge cases**: 59s → 0 cycles; 60s → exactly 1; 61s → 1 cycle + 1000ms correctly deferred and recovered later; partitioned settlement (two 125s-equivalent slices) equals continuous settlement; 10h offline → 480-cycle (8h) cap applied, excess discarded, repeat collection grants nothing more; negative elapsed (clock rollback) clamps to 0 without crashing.
- **Restart**: rebuilding the server in-process against the same DB file reproduces an identical `/account/state`.
- Also: wrong-slot equip rejected (400), equip/spec blocked during active expedition (409 `active_expedition`), party reorder allowed during active expedition (per M1-01 decision), stale `rulesVersion` on settle → 400 `unsupported_rules_version`.

### `tests/e2e/m2-identical-retries.mjs` (8 simultaneous identical retries, isolated temp DB)
PASS: identical results across all 8 concurrent retries, exactly one revision bump, 3 cycles credited once; a late retry after that is a no-op; a genuinely new command still credits the new cycle.

### `tests/e2e/restart-unaccelerated.mjs` (real system clock, no sped-up time, isolated temp DB/port)
5/5 checks passed: fresh server starts and serves `/health`; port collision produces an actionable
message and exits non-zero (A01); a real ~65s wall-clock expedition, abrupt process kill, then
restart on the same DB/port recovers and credits 1 real-time cycle with no data loss (A08.2/A08.3,
A13).

### `tests/e2e/browser-ui.mjs` (real Playwright browser, two contexts, keyboard-only + 390px)
9/9 checks passed: keyboard-only navigation with visible focus reaches and operates
Expedition/Inventory/Boss; one-time boss reward shown once even on a double keyboard-driven
challenge; company B publishes in a separate browser context and company A challenges it via the
UI, B cannot read A's report by ID (404); all 5 screens render at 390px with no horizontal
overflow (screenshots in `test-results/qa-ui/`); a stale-revision mutation from a second tab
surfaces an "Action Rejected" conflict toast and self-heals; stopping the server shows a reconnect
banner, and restarting recovers without a page reload.

### Prior open defects re-checked against this commit
`qa/reports/M2-29.md` recorded two open P2s as of commit `a295d39` (2026-10-29): formation
front/back rows not visually distinguished in battle view (F01), and a status-duration badge
off-by-one vs. the feed text (F02). Source inspection at this commit's `7b4cec2`:
- **F02 (status duration): now fixed.** `apps/web/src/components/BattleView.tsx:154` computes
  `Math.max(0, s.duration - (currentRound - s.appliedRound))` instead of the old unconditional
  `s.duration - 1`.
- **F01 (formation rows): now fixed.** `BattleView.tsx:191-218` splits units into `frontRow`/`backRow`
  by `slotIndex`, renders them in separate `battle-row row-front`/`row-back` containers with
  `aria-label` and a "Front row"/"Back row" text label.
I did not independently re-run a fresh visual repro for these (no browser tool), but the source
change directly addresses both previously-documented reproductions, and the full walkthrough/
browser-ui/battle-related scripts above exercised the same battle view end-to-end without
surfacing a new instance of either symptom.

## Scenario coverage vs. the task's four scenarios

1. **Company A first-time player** (inspect heroes, party order, equip, expedition, collect, level
   to 3 + specialization, boss challenge, combat-log clarity): covered by `npm run walkthrough`
   steps 2–6 — all passed. Combat log clarity: the feed states actor, skill, target(s), exact
   damage/healing, and death notices (verified by walkthrough step 6/6b and prior M2-29 feed audit
   of 148 events); I judge this **adequate** to explain why a fight was won/lost, based on script
   output and the one battle screenshot reviewed, not on reading every line of a live fight myself.
2. **Returning player offline catch-up**: covered by `api-attacks.mjs` A06.1–A06.4/A08 (59/60/61s,
   partitioned vs continuous, 8h cap, negative elapsed) and `simulate.mjs`'s 10-rep 8h benchmark
   (p95 7.2ms, well under the 2000ms target). Real-time (unaccelerated) catch-up also covered by
   `restart-unaccelerated.mjs`.
3. **Company B arena + account isolation**: covered by `api-attacks.mjs` A02 checks and
   `browser-ui.mjs`'s real two-browser-context publish/challenge/404 check.
4. **M2 bar** (watchable fights with playback, skills/cooldowns, ≥6 classes, dual-classing, party
   of 5, gear rarity/affixes/crafting, multiple areas/dungeons): walkthrough step 12 exercised a
   4-floor dungeon with a boss floor using the full battle view; step 11 confirmed 2 areas; step 5
   confirmed dual-classing persisted; step 13 confirmed craft+reforge. I did not re-verify the full
   M2-29 twelve-point acceptance ledger line-by-line in this session (that was already done in
   `qa/reports/M2-29.md`); I instead re-ran the regression surface and confirmed its two open
   defects are now fixed in source.

## What I could not test

- **No manual/human-equivalent browser play.** All UI evidence above is from the repository's own
  Playwright scripts, not from me operating a browser. I did not independently discover any new UI
  issue a human free-clicking through the app might find (e.g., unexpected layout at intermediate
  viewport sizes, copy clarity, general "feel").
- Did not take my own screenshots; reused/read the scripts' generated screenshots.
- Did not re-run the full M2-29 twelve-check acceptance ledger from scratch (time-bounded); relied
  on the existing report plus a targeted regression of its two open defects and this task's four
  named focus areas (isolation, concurrency, offline catch-up, restart, keyboard).
- Team-building tactical contrast at level 5 Old Road is saturated (both builds win 8/8); a
  genuinely differentiating encounter (harder content or lower level) was not run — Economy
  Designer owns pacing/tuning, not QA.

## Unresolved issues

None found as P0/P1. No new defects identified this session; the two previously-open P2s (F01,
F02) are fixed in source and not retested visually by me (no browser tool) — recommend the next
agent with browser access do a quick visual confirmation screenshot of both before closing them in
`qa/reports/M2-29.md`.

## Next task

A browser-capable agent (QA Tester or QA Player with working browser tools) should take fresh
screenshots confirming F01/F02 visually, since this session could only confirm the source fix, not
re-render it. No other action required; build is green, `npm run validate` passes, and the
isolation/concurrency/offline-catchup/restart/keyboard regression surface this task asked for all
passed.
