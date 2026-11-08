# Automated evidence run — 2026-11-08

> Note: the task requested this report at `reports/qa/2026-11-08/automated-evidence.md`. That path is outside this role's permitted write scope (`qa/`, `tests/e2e/`, `design/qa/`); the write was refused by the permission system. Filed here instead at `qa/2026-11-08/automated-evidence.md`.

Commit under test: `3dca4ba40bccacdfcf85d96936600e8982091ca9` (matches repo HEAD at run start; no newer main was available in this worktree).
Node: v22.14.0 (confirmed). DB isolation: `npm run save:backup` reported no existing save in this worktree (`data/banner-and-bounty.sqlite` absent); walkthrough/simulate were additionally run with `$env:DB_PATH="data/playtest.sqlite"` to avoid touching any owner save.

This is an automated evidence run, **not a playtest** — no human/manual play occurred.

## Command results

| Command | Result |
|---|---|
| `npm run save:backup` | PASS (no-op: no save file present) |
| `npm ci` | PASS — 189 packages installed, 0 errors (2 pre-existing audit advisories, unrelated to this change) |
| `npm run build` | PASS — contracts/game/content/server/web all built; web bundle 248.13 kB (gzip 75.21 kB) |
| `npm run validate` | PASS — typecheck clean; `vitest run` 38 files / 372 tests passed; build re-run clean |
| `npm run walkthrough` | **FAIL** — step 4 of 4 failed (see defect below); process exited 1 with uncaught `AssertionError` |
| `node scripts/simulate.mjs --seed 1 --runs 8 --max-cycles 100` | PASS — all sub-checks green (see pacing/catch-up figures below) |

## Walkthrough detail

Steps 1-3 passed:
1. `load built client from API; fresh data dir` — GET / 200, health schemaVersion=5
2. `select company A; inspect roster; reorder formation` — 3 starters, formation swap persisted
3. `start expedition; lock explanations shown` — lock note rendered on both Expedition and Company views

Step 4 failed: `collect progression; close/reopen the browser page; collect again`.

Console error observed during the run: `A: Failed to load resource: the server responded with a status of 401 (Unauthorized)` (logged before the assertion failure; not yet attributed to a specific request — flagged as a secondary signal, not confirmed as the root cause).

Screenshot captured before failure: `test-results/walkthrough/01-company-1280.png` (step 2 only; step 4 never reached its screenshot call because the assertion threw first).

## Defect: expedition cycle crediting overshoots requested advance

- **Steps to reproduce**: Run `npm run walkthrough` (fresh DB). After starting an expedition (step 3), the script advances the fake clock by exactly 5 minutes (`advance(5)`), navigates to Expedition, and clicks "Collect Rewards," comparing `expedition.cyclesCompletedSinceStart` before/after the POST to `/expedition/settle`.
- **Expected**: delta of 5 cycles credited (1 cycle per simulated minute, per the walkthrough's existing passing baseline and design cycle cadence).
- **Actual**: delta of 23 cycles credited — a ~4.6x overshoot.
- **Severity**: High. This is the core progression-crediting path (`/expedition/settle`) under exactly the condition M1-15 is meant to verify (restart/reopen + progression accrual); a 4.6x overshoot would materially distort pacing, rewards, and the economy tuning already locked in `design/game/economy/tuning.md` and `design/game/economy/m3.md`. Not yet isolated to a specific server file/line — flagging for Engineering triage rather than guessing at root cause.
- **Evidence**: raw walkthrough output above; `AssertionError [ERR_ASSERTION]: expected 5 cycles credited, got 23` at `scripts/walkthrough.mjs:149`.

This failure blocks verification of the remainder of step 4 (browser close/reopen session survival, offline re-collect) because the script aborted before reaching those assertions — that portion of M1-15's restart/catch-up check is **unverified**, not passing.

## Simulation (pacing + offline catch-up)

```
reproducibility check (seed 1, same seed run twice): PASS
pacing sweep: 8 runs, seeds 1-8, max 100 cycles/run
  win/loss totals: 96 wins / 0 losses
  first drop (cycle, min/median/max): 1/2.5/6
  level-3 unlock (cycle, min/median/max): 12/12/12
  boss ready (cycle, min/median/max): 12/12/12; 0 of 8 runs never reached boss-ready within 100 cycles
combat v2 reproducibility (seed 1): PASS
crafting/reforge reproducibility (seed 1): PASS
team-building contrast (8 runs, Old Road v2, level 5): balanced win rate 1, avg rounds 3.25; glass-cannon win rate 1, avg rounds 3
dungeon_aqueduct_depths full-clear benchmark (8 runs, level 8): balanced clear rate 1 (avg floors 4); glass-cannon clear rate 1 (avg floors 4)
v2 ledger: 3-hero party, level 8, 7 days (up to 60 Old Road cycles/day + 2 dungeon attempts/day), starting gold 0
  daily time budget: 84 online + 0 offline minutes
  final balances: gold 5835, scrap 140, sigil 28, core 14, items 100, overflow-converted 28
  old road wins/losses: 420/0; dungeon clears/fails: 14/0
```

**8h offline catch-up benchmark** (10 reps of a 480-cycle settlement):
- duration ms (min/median/p95/max): 3.98 / 5.19 / 6.90 / 6.90
- heap delta bytes (min/max): -1,726,016 / 3,211,400
- `recentCycles` bound (<= 10) held: true
- within provisional 2000 ms target (p95): true
- hardware: Intel Core i7-14700K x28, Node v22.14.0, win32/x64

This simulate.mjs offline-catch-up figure (480 cycles settled in single-digit ms, bounded recentCycles) is independent of the walkthrough's live-clock crediting path and shows no overshoot — the discrepancy above is specific to the `/expedition/settle` live-session path exercised by the walkthrough, not the batch catch-up path exercised by simulate.mjs. This split result is itself notable: it means offline catch-up math and live incremental crediting may be on divergent code paths, one of which is miscounting.

## Unresolved issues / limitations

1. **Walkthrough step 4 defect (above)** — blocks full restart/offline-catch-up UI verification; filed as a High-severity defect, not yet triaged by Engineering.
2. **401 console error** observed during the walkthrough run — not yet isolated to a request/endpoint; may or may not be related to the crediting defect. Flagged, not confirmed.
3. **Account isolation and concurrent-retry checks** (per M1-15 acceptance scope) were not exercised by this automated run — the fixed command list given for this task (`npm ci; build; validate; walkthrough; simulate.mjs`) does not include a multi-account or concurrent-retry scenario script. This remains unverified by this report; not claimed as passing.
4. No newer `main` was available in this worktree than commit 3dca4ba, so evidence is against that commit only.
5. **Report location**: written to `qa/2026-11-08/automated-evidence.md` instead of the requested `reports/qa/2026-11-08/automated-evidence.md` because the latter is outside this role's permitted write paths.

## Next task

File the walkthrough step-4 defect to Engineering for triage (expedition cycle crediting overshoot, 5 requested → 23 credited) and re-run `npm run walkthrough` once fixed to complete the restart/offline-catch-up UI verification. Do not mark M1-15 acceptance passed until that defect is resolved and re-verified.
