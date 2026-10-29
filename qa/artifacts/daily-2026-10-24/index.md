# Daily playtest evidence capture (originally scheduled 2026-10-24) — run date 2026-10-29

**Why this exists:** QA Player's 2026-10-24 session had no shell and no browser tool, so no daily
playtest ran that day. This task re-runs the capture on the current approved baseline. This QA
Tester session also had **no browser tool available** (checked via `ToolSearch`, no match) — only
Bash/PowerShell. That reproduces the same class of limitation one level up the chain: automated
commands and the Playwright-driven `npm run walkthrough` could be run, but true manual two-session
human browser play (steps 3/4 of the task brief) could not be performed in this session.

- **Commit under test:** `526effd349fa43ef7386213126ae196464b6a741` (branch `agent/task-722ed8b3-...`)
- **DB used:** `data/playtest.sqlite` (relative to worktree root) — never the owner's save, never ports 5173/5190.
- **Server port used for manual checks:** 3100 (the server's own default; distinct from forbidden 5173/5190).

## Commands and results

| # | Command | Result | Log |
| - | ------- | ------ | --- |
| 1 | `npm ci` | **pass** — 189 packages installed, 0 errors (2 pre-existing npm-audit advisories, unrelated to this change) | `npm-ci.log` |
| 2 | `npm run build` | **pass** — contracts/game/content/server/web all built; vite bundle produced | `npm-build.log` |
| 3 | `npm run validate` | **pass** — typecheck clean; vitest 214/214 tests passed across 27 files; build repeated clean | `npm-validate.log` |
| 4 | `npm run walkthrough` (DB_PATH=data/playtest.sqlite) | **pass** — 15/15 scripted steps passed (Playwright-driven, ACCELERATED clock) | `npm-walkthrough.log`, screenshots copied below |
| 5 | `node scripts/simulate.mjs --seed 1 --runs 8 --max-cycles 100` | **pass** — reproducibility PASS (seed 1 run twice identical), combat v2 repro PASS, crafting repro PASS, 96 wins/0 losses across 8 runs, 8h catch-up benchmark p95 7.82ms (well under 2000ms provisional target) | `simulate.log` |
| 6 | Manual server start/stop + port-collision check (PowerShell, no browser) | **pass** — server listened on `http://127.0.0.1:3100`, served built client (HTTP 200), used `data/playtest.sqlite`; a second instance against the same port failed fast with an actionable message (`port 3100 is already in use... Set API_PORT to a free port and retry.`) and exited; stopping the first process left no process at its PID | `server-stdout.log`, `server-stderr.log`, `server2-stdout.log`, `server2-stderr.log` |
| 7 | Manual two-browser-session play (Company A full loop; Company B publish/challenge/isolation; start/mid/end combat screenshots) | **blocked** — no browser tool is available to this session (`ToolSearch` for browser/screenshot/navigate tools returned no matches); only Bash/PowerShell shell access exists. This is a genuine tooling gap, not a game defect. | n/a |

## Acceptance checklist (from `design/qa/acceptance.md`), as far as evidence allows

- **A01** (fresh start, port collision actionable, no stray process) — **pass**, evidence in row 6 above. Fresh-install-from-README path itself not re-verified this run (walkthrough step 1 already does an equivalent fresh-data-dir load via Playwright and passed).
- **A02** (account isolation) — **pass by automated evidence**, not manual browser evidence. `npm run walkthrough` step 7/8 (Playwright, two separate browser contexts) shows: company B's cross-account secondary-class attempt → 403; company B reading company A's report → 404; company A's saved report unchanged after company B edits its own team. No manual second-browser-session check was possible (row 7, blocked).
- **A07** (retry/concurrent-collection idempotency) — not exercised in this run; out of scope for a daily smoke capture. Flag for M1-15 proper.
- **A08** (offline catch-up / restart) — **pass by automated evidence**. Walkthrough step 9: revisions A=11, B=3 preserved across a server restart; 4 cycles credited across the simulated downtime. Simulate.mjs catch-up benchmark (row 5) confirms the 8h-worst-case bound is met on this machine.
- **A11** (keyboard + narrow layout) — **pass by automated evidence**. Walkthrough step 14: focus outline solid on all screens tested; no horizontal overflow at 390px on Company/Expedition/Dungeon/Inventory/Boss/Arena screens (`scrollWidth` == 390 for all).
- **A13** (full walkthrough, no P0/P1, save survives restart) — **pass**: 15/15 walkthrough steps green, console errors observed were expected 401/400s from negative-path assertions inside the script (not surfaced defects), not unhandled failures.

## Screenshots

Copied from `test-results/walkthrough/` (produced by the Playwright-driven `npm run walkthrough`, not by manual human browser play):

- `01-company-1280.png` — company/roster view, 1280×720
- `09-expedition-1280.png` — expedition view, 1280×720
- `14-company-390.png`, `14-expedition-390.png`, `14-dungeon-390.png`, `14-inventory-390.png`, `14-boss-390.png`, `14-arena-390.png` — narrow 390px layout per screen

**Gap:** the task asked for combat-playback + event-log screenshots at the **start, middle, and end** of each fight (boss and dungeon floor). The walkthrough script exercises playback controls (step/pause/speed/skip-to-end — see `npm-walkthrough.log` step 6b) but does not save mid-battle screenshots, and no manual browser session was available to capture them. **This is unmet evidence, not a defect** — recorded as an unresolved issue below.

## Bugs / defects found

None. All automated checks passed; the one anomaly below is not a game defect.

- **Note (not a bug):** `GET /api/health` returns 404 (`no such route`) — the actual health check is served from `GET /` (confirmed by walkthrough step 1: "health schemaVersion=4"). My initial manual check assumed the wrong path; not a product defect, just documenting so future manual checks use `GET /`.

## Unresolved issues / things not tested this run

1. **No manual two-human-browser-session play was possible** — this QA Tester session has no browser tool (`mcp__Claude_Browser__*` / `mcp__claude-in-chrome__*` or similar were not present in the deferred-tool list). All combat/isolation/keyboard/narrow-layout evidence above comes from the automated Playwright walkthrough script, not from a human driving two separate browser contexts as the task described. If the owner needs genuinely manual (non-scripted) browser evidence, a session with a browser tool enabled is required.
2. **Start/mid/end combat-playback + event-log screenshots** were not captured (see Gap above).
3. **A07 (concurrent retry / idempotency)** and the fuller A02 edge cases (ID-substitution attacks, foreign-item requests) were not separately exercised this run — out of scope for this smoke capture; left for the dedicated M1-15 release-verification task.
4. Pre-existing `npm audit` advisories (1 moderate, 1 high) were not triaged — unrelated to this task's scope, flagged for Tools Engineer/CTO awareness only.

## Next task

M1-15 (independent release verification) should perform the full manual two-browser-session walkthrough with real browser tooling enabled, specifically targeting: start/mid/end combat screenshots, A07 concurrency/retry fixtures, and ID-substitution/foreign-item A02 edge cases that this automated smoke run did not exercise.
