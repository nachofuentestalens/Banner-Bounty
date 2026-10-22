# M2-29 supplement: playtest evidence capture (QA Player could not execute)

Date: 2026-10-22 · Owner: QA Tester · Task ID 13c2c764-daa0-4f4d-bce9-69ff4e8dbf3a

**Result: partial.** All scripted/automated checks pass with evidence. Two items are explicit
limitations of this environment, not of the game: no browser/computer-use tool is available to
this agent, so steps requiring live manual browser interaction (fresh two-context Company A/B
session with hand-driven screenshots beyond the automated walkthrough) were done via direct HTTP
calls instead of a real browser, and one acceptance item (tactical-decision contrast at low
`--max-cycles`) only has weak simulation evidence, not a definitive pass/fail.

## Source revision

Task required input commit `8391e56`. The worktree's actual HEAD at task start was `4206c44`
(two commits newer, both further QA e2e fixture work — `8da4f32`, `4206c44`). Per the task's own
allowance ("or the current main if it is newer, and record which one you used"), all evidence
below is against **4206c44697d9a97172a621977b8ffdaac8bdb5e4**.

## 1. Install / build / validate

```
npm ci            -> added 189 packages, 0 vulnerabilities
npm run build     -> all 5 workspaces built clean (contracts, game, content, server, web)
npm run validate  -> typecheck: clean
                     test: 23 files / 198 tests passed, 1.24s
                     build: clean (same as above)
```
Pass, no failures, no skipped suites.

## 2. Walkthrough (`npm run walkthrough`)

Uses its own isolated temp DB and in-process injected clock (accelerated evidence, clearly
labelled by the script itself) — never touches a real save.

**15/15 steps passed.** Full console output captured; key results:
- Step 2: roster/formation reorder persisted.
- Step 4: offline-catch-up style settle (close/reopen) credited 5 then 3 cycles correctly.
- Step 5: equip, level to 3, dual-class assignment (Vanguard/Cleric) all persisted.
- Step 6/6b: boss battle view showed 4 unit panels; reward claimed once ("Already Claimed" on
  retry); playback step/pause/speed/skip-to-end stayed in sync with HP/log (30s step, the longest
  step — skip-to-end driving a full replay).
- Step 7/8: Company B published; A's cross-account secondary-class attempt → 403; A challenged B,
  B altered its team afterward, A's saved report was unchanged, and B reading A's report → 404.
- Step 9: server restart — revisions A=11, B=3 preserved; 4 cycles credited across the simulated
  downtime.
- Step 10: roster grew 3→4 heroes (fielded stayed 3 in this run — the script recruits one extra
  hero but does not itself field a 5th; see note under M2 feature check below).
- Step 11/12: two areas listed (Old Road, Sunken Aqueduct); 4-floor dungeon cleared with boss
  floor 4 battle view rendered.
- Step 13: crafted an uncommon trinket with 1 affix from dungeon materials; a follow-up reforge
  attempt got a 400 (documented as "validation expected if under-resourced" by the script itself
  — not evidence of a working reforge, only that recruiting/crafting materials gate it correctly).
- Step 14: focus outline solid; all 6 screens render at exactly 390px scrollWidth (no horizontal
  overflow) at the narrow breakpoint.
- Console errors logged during the run were all expected negative-path probes (401/400 from
  cross-account/invalid attempts), not unexpected failures.

Screenshots (gitignored, local only — `test-results/walkthrough/`):
`01-company-1280.png`, `09-expedition-1280.png`, `14-{arena,boss,company,dungeon,expedition,inventory}-390.png`.
Only 8 screenshots are produced by this script (not one per step); it does not capture the boss
replay or the 1280px views of every screen — see unresolved issues.

## 3. Seeded simulation (`node scripts/simulate.mjs --seed 1 --runs 8 --max-cycles 100`)

```
reproducibility check (seed 1 twice): PASS
pacing sweep (8 runs): 96 wins / 0 losses
  first drop cycle min/median/max: 1/2.5/6
  level-3 unlock cycle: 12/12/12
  boss ready cycle: 12/12/12 (0/8 runs never reached it within 100 cycles)
combat v2 reproducibility (seed 1): PASS
crafting/reforge reproducibility (seed 1): PASS
team-building contrast (8 runs, Old Road v2): balanced win rate 1, avg rounds 3.25;
  glass-cannon win rate 1, avg rounds 3
dungeon_aqueduct_depths full-clear benchmark (8 runs, level-8 party): clear rate 1, avg floors 4
8h catch-up (10 reps of 480-cycle settlement):
  duration ms min/median/p95/max: 4.13/5.54/6.82/6.82  -> well under the 2000ms provisional target
  heap delta bytes: -1,394,632 .. 1,262,832 (bounded)
  recentCycles bound (<=10) held: true
  hardware: Intel Core i7-14700K x28, node v22.14.0, win32/x64
```
8h catch-up is a clear **pass** against the provisional <2s target (p95 6.82ms, ~300x margin).

**Observation, not a defect:** the team-building contrast run shows both the balanced and
glass-cannon builds winning 100% of the time (avg rounds 3.25 vs 3 — a small gap). M2 acceptance
check 7 wants build choice to visibly change the *outcome* (clear/fail) or a clearly different
turns-to-clear, not just a marginal rounds difference. This specific harness run doesn't
demonstrate that contrast strongly; it may need a harder encounter or more adversarial "bad
build" (no healer/no tank) to show a real pass/fail split. Flagging for Economy Designer
(M2-28 pacing/balance tuning) rather than filing as a QA defect, since `simulate.mjs` is their
tuning tool, not independent proof either way.

## 4. Manual server checks (replacing the browser session the QA Player couldn't run)

No browser or computer-use tool is available to this QA agent in this session (checked the
deferred-tool list; only `mcp__claude_ai_Claude_Docs__*` tools were offered). Browser-driven
Company A/B screenshots beyond what `scripts/walkthrough.mjs` already produces (section 2) could
not be captured this run. Instead, account isolation, concurrency and feature presence were
verified directly against the HTTP API with isolated sessions, which exercises the same
server-authoritative code paths the browser would use and is explicit, reproducible evidence.

Server started via `apps/server/dist/main.js` with `API_PORT=3101` and `DB_PATH=test-results/playtest.sqlite`
(scratch, gitignored, never the owner's save — see note below on a stray process).

### 4a. Account isolation (A02)
Two sessions selected via `/dev/session/select` (A and B). With B's session cookie:
- `POST /equipment/equip` targeting A's heroId → `403 forbidden: "heroId ... does not belong to this account"`
- `POST /hero/secondary-class` targeting A's heroId → same 403 forbidden
- `PATCH /party/formation` placing A's heroId into B's formation → same 403 forbidden
- From the walkthrough (section 2, step 7/8): B's cross-account secondary-class attempt → 403;
  B reading A's saved battle report by ID → 404.

**Pass.** No cross-account mutation or read succeeded; errors are explicit (403/404), not silent
no-ops or 500s.

### 4b. Concurrent retry / idempotent settlement (A07)
Script `tests/e2e/m2-29-concurrency-check.mjs` (added this run, kept under `tests/e2e/`): starts
an expedition, then fires two concurrent `POST /expedition/settle` requests sharing one
`requestId`, then a third delayed retry of the same `requestId`.
```
r1 status 200 revision 2, creditedCycles 0 (not enough wall-clock time had elapsed yet)
r2 status 200 revision 2, creditedCycles 0 (identical body to r1 — deduped, not double-settled)
final gold 10, revision 2, cyclesCompleted 1
r3 (late retry, same requestId) -> 200, identical result, gold still 10, revision still 2
```
**Pass.** Concurrent and later-retried requests sharing a `requestId` return the cached result
instead of re-applying the mutation; gold/revision did not move on the duplicate calls.

### 4c. M2 feature presence (per `design/studio/milestones/M2.md`)
- **≥6 classes, dual-class:** present. `packages/content/src/v2/classes.ts` defines 6 base
  classes (Vanguard/tank, Ranger/physical, Arcanist/magic, Cleric/healer, Rogue/physical,
  Herald/support) plus 6 named synergy pairs. Walkthrough step 5 exercised dual-classing live.
- **Party of 5 / formation:** the contract and engine support it — `/account/state` returns a
  5-slot formation array (`slots: [id, id, id, null, null]` in this fresh save), and
  `packages/game/src/party2.ts` documents slotIndex 0-4 with front row 0-2 / back row 3-4. Neither
  this run's walkthrough nor my manual checks actually filled slots 4 and 5 with recruited heroes
  and ran a 5-hero fight — that specific scenario (acceptance checks 1 and 3 together) remains
  unverified end-to-end this run.
- **Roster > party cap:** confirmed (walkthrough step 10: roster 3→4 against a 20-hero
  `ROSTER_CAP`; a 5-hero fielded party would still leave headroom).
- **Battle view / turn feed / playback controls:** confirmed present and in sync (walkthrough
  steps 6/6b, 12).
- **Gear rarity/affixes, crafting:** confirmed present (walkthrough step 5 equip, step 13 craft).
  Reforge got a 400 in this run (documented by the script as expected under-resourcing) — reforge
  succeeding end-to-end was not demonstrated this run.
- **Multiple areas / multi-floor dungeon with boss:** confirmed (2 areas listed; 4-floor dungeon
  cleared with a boss-floor fight rendered in the full battle view).
- **Cooldowns/buffs/taunt enforcement, crit/dodge:** visible in the raw battle event log (e.g.
  the concurrency-check script's incidental battle report included `aimed_shot`/`enemy_strike`
  events with hpAfter/crit/dodged fields) but not independently exercised against a specific
  "skill on cooldown rejected" or "taunt draws fire" assertion this run.

## Unresolved issues / limitations (not filed as defects — environment and scope limits)

1. No browser or computer-use tool was available to this agent this run, so true two-browser-
   context manual screenshots (beyond the 8 produced by `scripts/walkthrough.mjs`) were not
   captured. HTTP-level checks (4a/4b) substitute for the account-isolation and concurrency intent
   of the manual walkthrough but are not a substitute for visually confirming the battle view,
   gear screens, etc. in a live rendered browser.
2. Party-of-5 with 5 heroes actually fielded, and cooldown/taunt enforcement under a built
   scenario, were not independently exercised this run (see 4c) — existing automated/unit test
   coverage for these (per `npm run validate`'s 198 passing tests) was not re-derived here.
3. Team-building contrast evidence from `simulate.mjs` is weak for this specific run (both builds
   at 100% win rate) — flagged to Economy Designer, not filed as a QA defect.
4. **Operational note, no data was lost:** one of my own blocked/retried shell commands caused a
   stray `node apps/server/dist/main.js` to briefly run with zero env vars (default port 3100,
   default `DB_PATH` resolving to this worktree's own `data/banner-and-bounty.sqlite`). That file
   is this task's own isolated worktree copy (created fresh at the time of this run, confirmed via
   its timestamp), not the owner's live checkout — so no real save was at risk. The stray process
   was killed before any gameplay request reached it. Recorded here for traceability since the
   task explicitly calls out never touching the owner's save.
5. Windows PowerShell 5.1's `Invoke-WebRequest -Headers @{Cookie=...}` silently drops a manually
   set `Cookie` header (restricted header in classic .NET `HttpWebRequest`); only `-WebSession`
   (same-process) or Node's `fetch` carried the session cookie correctly. This is a tooling quirk
   of this environment, not a server defect — confirmed by the same cookie working immediately
   via Node `fetch` against the same server.

## Commands run (for repro)

```
npm ci
npm run build
npm run validate
npm run walkthrough
node scripts/simulate.mjs --seed 1 --runs 8 --max-cycles 100
# server: API_PORT=3101 DB_PATH=test-results/playtest.sqlite node apps/server/dist/main.js
node tests/e2e/m2-29-concurrency-check.mjs   # BASE_URL=http://127.0.0.1:3101 (default)
```

## Next task

Hand back to M2-29 (QA Tester, full independent playtest against the M2 acceptance checklist) to
redo sections 4a-4c with an actual browser/computer-use tool once one is available to this role,
specifically: fielding a real 5-hero party across front/back rows in a live fight, and a direct
cooldown-rejection / taunt-draws-fire assertion. M2-28 (Economy Designer) should look at the
team-building contrast numbers in section 3 before relying on `simulate.mjs` as tuning evidence.
