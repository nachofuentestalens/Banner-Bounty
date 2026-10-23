# Automated playtest — 2026-10-23 (QA Player session could not play)

Task ID: 830c996b-a622-400e-8571-6f785ad0897a (filling in for 00261c34-a73e-4618-93e9-d46ad6630f25, NOT PLAYED — no shell/browser available to QA Player).

Date: 2026-10-23
Owner: QA Tester
Result: **partial** — all runnable automated checks pass; no interactive human/browser play was performed this session (no browser tool available to this agent). Treat this as supplementary automated evidence, not a substitute for M1-15's/QA Player's interactive walkthrough.

Source revision: `9dfd8ed26492f567c29812b58f5650b31908a75f` (branch `agent/task-830c996b-a622-400e-8571-6f785ad0897a`, clean at session start).

## Commands and results

| # | Command | Result | Notes |
|---|---|---|---|
| 1 | `npm ci` | PASS | 189 packages installed, 0 vulnerabilities |
| 2 | `npm run build` | PASS | contracts/game/content/server/web all built; vite build 211 KB / 65 KB gzip |
| 3 | `npm run validate` (typecheck + vitest + build) | PASS | 26 test files, 204 tests passed, 1.86s |
| 4 | Server start: `DB_PATH=data/playtest.sqlite API_PORT=3100 npm start` | PASS | Isolated save DB, never touched owner's `data/banner-and-bounty.sqlite` (which didn't exist). Listened on `http://127.0.0.1:3100` |
| 5 | `npm run walkthrough` (PW_CHANNEL default msedge; `WALKTHROUGH_OUT` env could not be set — approval denied for that compound command — so screenshots went to the script's default `test-results/walkthrough/`, local to this worktree, gitignored) | PASS 15/15 | ACCELERATED CLOCK — see caveat below. Full log excerpt below. |
| 6 | `node scripts/simulate.mjs --seed 1 --runs 8 --max-cycles 100` | PASS | Reproducibility, pacing sweep, 8h catch-up all pass; see excerpt below |

### npm run walkthrough — excerpt (full log captured, accelerated clock)

```
PASS 1 load built client from API; fresh data dir
PASS 2 select company A; inspect roster; reorder formation
PASS 3 start expedition; lock explanations shown
PASS 4 collect progression; close/reopen; collect again — 5 then 3 cycles credited; gold=70, inventory=3
PASS 5 equip drop; reach level 3; assign secondary class and loadout
PASS 6 challenge boss; reward granted only once — first=Victory, badge="Already Claimed", gold 280 -> 280 (not double-granted)
PASS 6b playback controls (step/pause/speed/skip-to-end) stay in sync with HP/log
PASS 7 company B publishes team; cross-account secondary-class attempt -> 403
PASS 8 A challenges B; B alters team; A's saved report unchanged; B reading A's report -> 404
PASS 9 restart server; both saves and elapsed progression survive — revisions A=11 B=3 preserved; 4 cycles credited across downtime
PASS 10 recruit 4th hero; roster exceeds 3-hero party cap
PASS 11 second area listed (The Old Road, The Sunken Aqueduct)
PASS 12 multi-floor dungeon; 4 floors processed; boss floor rendered
PASS 13 craft then reforge gear from dungeon materials
PASS 14 keyboard operation + 390px narrow layout across every screen — focus outline=solid on all 6 screens; no horizontal overflow (scrollWidth == 390 everywhere)

walkthrough: 15/15 steps passed; ACCELERATED clock
console errors (expected, from the script's own negative-path checks): two 401s on cross-account attempts (A, B), one 400 on under-resourced reforge attempt, one 401 (K = keyboard step, unauthenticated check)
screenshots: test-results/walkthrough/ (8 PNGs: company/expedition at 1280px; company/expedition/dungeon/inventory/boss/arena at 390px)
```

This directly exercises acceptance items A02 (account isolation: 403/404 cross-account), A03 (3 heroes, specialization at level 3), A05 (loadout lock during expedition), A08 (restart + elapsed progression survives), A09 (boss victory reward granted exactly once), A10 (publish freeze, no cross-account mutation), A11 (keyboard focus + 390px layout, no blocked actions found).

**Caveat (per acceptance.md and the script's own header comment): the walkthrough's server clock is manually advanced in-process — this proves the flow works, it is NOT pacing evidence.** Pacing evidence comes from the simulate run below.

### node scripts/simulate.mjs — excerpt

```
[simulate] reproducibility check (seed 1, same seed run twice): PASS
[simulate] pacing sweep: 8 runs, seeds 1-8, max 100 cycles/run
  win/loss totals: 96 wins / 0 losses
  first drop (cycle, min/median/max): 1/2.5/6
  level-3 unlock (cycle, min/median/max): 12/12/12
  boss ready (cycle, min/median/max): 12/12/12; 0 of 8 runs never reached boss-ready within 100 cycles
[simulate] combat v2 reproducibility (seed 1): PASS
[simulate] crafting/reforge reproducibility (seed 1): PASS
[simulate] team-building contrast: balanced win rate 1, avg rounds 3.25; glass-cannon win rate 1, avg rounds 3
[simulate] dungeon_aqueduct_depths full-clear benchmark: balanced clear rate 1 (avg floors 4); glass-cannon clear rate 1 (avg floors 4)
[simulate] v2 ledger (3-hero party, lvl 8, 7 days): final gold 5835, scrap 140, sigil 28, core 14, items 100, overflow-converted 28; old road wins/losses 420/0; dungeon clears/fails 14/0
[simulate] catch-up benchmark: 10 reps of a 480-cycle (8h) settlement
  duration ms (min/median/p95/max): 4.71/6.10/10.05/10.05
  heap delta bytes (min/max): -1591216/2595208
  recentCycles bound (<= 10) held: true
  within provisional 2000 ms target (p95): true
  hardware: Intel(R) Core(TM) i7-14700K x28, node v22.14.0, win32/x64
```

This satisfies A12 (seeded pacing + 8h catch-up timing using the production engine) and the acceptance.md performance target (8h worst case under 2s on dev machine — measured p95 10.05 ms, well within target).

## Account isolation and concurrency (A02, A07)

- Cross-account isolation: directly exercised by the walkthrough (steps 7–8): company B cannot mutate A's secondary class cross-account (403), B cannot read A's saved report (404), B altering its own team after a challenge does not retroactively change A's already-saved report.
- Same-request retry / concurrent collection / stale revision / restart-duplication (A07): NOT independently exercised by this session beyond what `npm run validate`'s 204 passing vitest tests already cover (idempotency/concurrency-related suites exist at `apps/server/src/app.test.ts`, `arena.test.ts`, `progression.test.ts`, `db/migrations.test.ts`, confirmed present by file search, not re-read line-by-line this session). I did not independently fire concurrent HTTP requests against the isolated server myself this session — recording this as a gap rather than claiming it as tested.

## NOT PLAYED (no interactive browser tool available this session)

- Items 2–8 and 10 of the Ten-step playable walkthrough as literal **human/browser** play (as opposed to the automated Playwright script above) are **NOT PLAYED**.
- The full-size (1280×720) narrow-layout check beyond what the walkthrough screenshots cover, and any manual exploratory play, is **NOT PLAYED**.
- No manual judging against the M2.md bar beyond what the automated walkthrough's structural coverage (dungeon, crafting, dual-class, arena) already demonstrates — this is a limitation, not a pass.

## Server lifecycle note (testing-harness artifact, not a confirmed product defect)

While stopping my isolated test server (started via `cmd /c npm start` under a PowerShell `Start-Process` wrapper, since no interactive shell job control was available), killing the cmd.exe wrapper PID left the actual `node apps/server/dist/main.js` child process still bound to port 3100. I had to separately `Stop-Process` the node PID to fully free the port. This is most likely an artifact of the `cmd /c` wrapper not propagating termination to its child on Windows, not a demonstrated defect in the game's own documented stop path (e.g., Ctrl+C in an interactive terminal, which I did not test). Flagging as a limitation for whoever next verifies A01's "stopping leaves no stray game child process" via the documented stop method.

## Unresolved issues

- A07 concurrent-retry/stale-revision checks: not independently verified beyond existing passing unit tests (gap noted above).
- A01's stray-process guarantee: not verified via the documented interactive stop path this session (gap noted above, not a bug report).
- No interactive browser session was available to this agent, so genuine human play against the M2.md bar remains undone for 2026-10-23.

## Evidence paths

- Walkthrough screenshots: `test-results/walkthrough/` (local to this worktree, gitignored; 8 PNGs covering company/expedition at 1280px and company/expedition/dungeon/inventory/boss/arena at 390px)
- This report: `qa/reports/automated-playtest-2026-10-23.md`

## Next task

QA Player (or another QA agent with an actual browser/shell) should perform the real interactive Ten-step walkthrough and judge against design/studio/milestones/M2.md, since this session could only run automated/scripted checks. A07's concurrent-retry scenarios should get an explicit focused check (fire duplicate/concurrent collection requests against a live isolated server) rather than relying on inference from the existing unit-test suite.
