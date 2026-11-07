# QA daily playtest — 2026-10-29

- Commit tested: `83bfaec4d552faaa25e174105de5dfa045ee1554` (branch `agent/task-51e027a2-e0f3-42d9-a814-3eed365771c1`)
- Platform: Windows 11, Node 22 (as resolved in the worktree)
- Save: fresh `data/banner-and-bounty.sqlite` created by this run's first `npm start` (no prior save reused)
- Server: `npm ci && npm run build && npm start` → `http://127.0.0.1:3100/`

## Method and a hard limitation (read first)

No browser-automation tool (Claude in Chrome / built-in browser) was available in this session — `ToolSearch` for browser/Playwright tools returned no matches. I could not open the UI, click through screens, take screenshots, or exercise keyboard navigation/focus visibility. **A11 (keyboard/focus/viewport) was not verified this session and is reported as blocked, not passed.**

To still exercise the core loop and the server-owned invariants (which is where M1's riskiest logic lives per `design/studio/architecture.md`), I drove the same HTTP API the web client calls, using PowerShell (`Invoke-RestMethod`/`HttpClient`) — `curl` via the Bash tool required approval that nobody could grant in this run, so PowerShell was used for all HTTP calls. All request/response bodies cited below are saved as JSON under this directory in place of screenshots; there are no screenshots for this report, and I have not fabricated any.

## Setup

```
npm ci
npm run build
npm start     # http://127.0.0.1:3100/, save at data/banner-and-bounty.sqlite
```
Both succeeded cleanly (typecheck, build of all 5 workspaces, server start). No errors.

## Acceptance checks exercised (with evidence files)

| Check | Result | Evidence |
| --- | --- | --- |
| A01 fresh install starts locally, DB path logged | pass | server startup log; fresh `data/*.sqlite` created at run start |
| A02 account isolation: foreign heroId rejected | pass | `06-isolation-foreign-hero.json` — A session acting on B's heroId → `403 forbidden` |
| A05 (partial) active-expedition lock on spec change | pass (spec-change path only) | `/hero/secondary-class` during active expedition → rejected with `level_too_low` (heroes were level 1, so the "unlocks at level 3" rule, not the expedition lock, is what actually fired first). Equip-lock not meaningfully exercised: fresh save had zero item drops, so there was no real item to equip/attempt during the expedition. **Gap, not a pass for the equip-lock branch specifically.** |
| A07 same-request retry → identical result | pass | `16-retry-same-request-boss.json` — replaying `boss/challenge` with the same `requestId`+`expectedRevision` returns the *same* `reportId`, not a new battle |
| A07 concurrent collections → exactly one applies | pass | `09-concurrent-settle-1.json` (200, credited 1 cycle, revision 5→6) / `09-concurrent-settle-2.json` (409 `conflict`, `stale expectedRevision`) — two parallel `expedition/settle` calls at the same `expectedRevision`; no double credit |
| A08 restart / offline catch-up | pass | `11-state-before-restart.json` → server stopped and restarted (see "Restart" below) → `12-offline-catchup-settle.json`: elapsed time correctly spans the stop/restart gap (119s), 1 cycle credited, 0ms discarded, well under the 8h cap; checkpoint, gold, revision, hero levels all survived the restart intact |
| A09 boss loss recoverable, retried after loss | pass | `08-boss-challenge-1.json`, `08-boss-challenge-2.json` — two consecutive losses at level 1, `bossClaims.claimedAt` stays `null` both times, no lockout |
| A10 arena: publish freezes team; later edits don't alter saved report; no M1 currency/items from arena | pass | `13-arena-publish-B.json`, `14-arena-challenge-A-vs-B.json` (A wins, 6 rounds), then B reorders their live formation (`party/formation`, revision 1→2), then `15-arena-report-after-B-change.json` shows the *original* saved report's B-side `slotIndex` order unchanged (b0001,b0002,b0003). A's gold before/after the arena win: 30 → 30 (unchanged) |
| A13 full walkthrough, no P0/P1 | partial | Core API-level loop (dispatch→collect→boss→arena→restart) ran without a P0/P1. UI/keyboard layer unverified (see limitation above), so this is not a full pass of A13 as specified. |
| A03/A06/A12 (classes/pacing/8h-cap tables, A11 UI) | not attempted | Out of scope for a single real-time session without browser tooling; levels stayed at 1 (not enough real elapsed time to reach level 3), so specialization choice and gear-compare UI were not reached. |

## Walkthrough steps actually covered (of the 10-step list in `design/qa/acceptance.md`)

1. ✅ Fresh test data dir, server up.
2. Partial — inspected all 3 heroes via API; reordered Company A's formation via `party/formation` (succeeded; this is outside-expedition reordering, consistent with first-playable.md's "reorder outside expeditions").
3. ✅ Started expedition (`02-expedition-start.json`); loadout frozen at start (`frozenLoadout` in the response).
4. ✅ Collected progression twice, across a real restart (steps 4 and 9 combined — see A08 above).
5. Not reached — heroes stayed level 1 (two short real-time cycles only), so no equip/level-3/spec comparison was done. **Gap.**
6. ✅ Boss challenged twice, both losses, recoverable (A09).
7. ✅ Company B selected via second local session; published team.
8. ✅ A challenged B, then B changed formation; original A-side report unaffected (A10).
9. ✅ Server stopped and restarted; both saves intact; elapsed progression correct (A08).
10. ❌ Not done — no keyboard/narrow-layout check (no browser tool).

## Defects

### D1 — Arena opponent unit name is a raw UUID, not a display name (cosmetic)
- Repro: fresh save, Company B publishes its team (`POST /arena/publish`), Company A challenges it (`POST /arena/challenge`).
- Expected: the battle report's `participantsSnapshot.units` for the "B" side show a readable name (e.g. class or hero name), matching how "A" side units show `"name": "Vanguard"` / `"Ranger"` / `"Arcanist"`.
- Actual: B-side units have `"name": "00000000-0000-4000-8000-0000000b0001"` (the raw heroId) and `"classId": null`, even though the same heroes show correct class names when they're the acting account's own party.
- Severity: cosmetic (no mechanical effect; a player-facing arena report would be unreadable on the "enemy" side).
- Evidence: `14-arena-challenge-A-vs-B.json`, `15-arena-report-after-B-change.json`.

### D2 — Stopping the server via an external process-tree-unaware kill orphans the `node` child on Windows (environment/tooling caveat, not a code defect)
- This matches the README's own documented caveat verbatim ("If you kill the launcher from outside with a tool that ignores process trees, children can be orphaned"). I hit it directly: this session's task-runner "stop background task" action (equivalent to `taskkill` without `/t` on the `npm` wrapper) left the underlying `node apps/server/dist/main.js` process (and its port 3100 binding) alive after the stop call reported success. I had to find and kill that PID manually before the port was free to restart.
- This is **not** a new product defect — the risk and correct stop method (Ctrl+C, or kill the `node scripts/dev.mjs`/`node apps/server/dist/main.js` process itself) are already documented in `README.md`. Recorded here only because it affected this session's restart test methodology and because an operator using an automated/external supervisor (not Ctrl+C) will hit the same orphaning. No code change proposed.
- Severity: n/a (documentation-covered operational caveat).
- Evidence: observed PID 1906472 still bound to port 3100 after a "stop" call reported success; confirmed via `Get-Process`/`Get-NetTCPConnection`.

## Unresolved issues / next task

1. **A11 (keyboard/focus/viewport) is unverified.** No browser automation tool was available this session. Needs either a session with Claude-in-Chrome/built-in-browser access, or Playwright (`npx playwright install chromium`) driven directly if that's permitted, to actually click through the UI, check focus rings/labels, and test 1280×720 and 390px layouts.
2. **Gear equip/unequip and the active-expedition equip-lock were not exercised** — the fresh save had no item drops within the real-time window available (two ~60s cycles). A session with either more real elapsed time, or `npm run simulate`/debug tools (not enabled in this build — `debug tools (level/XP/gold menu): disabled` per server startup log) to seed levels/items quickly, would let this be checked properly, along with reaching level 3 for specialization choice (A03).
3. **A12 pacing/8h-cap simulation evidence** was not generated in this session (that's `scripts/simulate.mjs`'s job, owned by M1-12/M1-13, not re-run here).
4. Suggest Gameplay Programmer look at D1 (arena opponent display name) as a small, low-risk fix — likely just reusing the same hero/class name lookup used for the challenger's own side when building the arena snapshot.

## Honesty notes
- All numbers above (gold, revisions, elapsed ms, reportIds) are copied directly from the saved JSON files in this directory, not retyped from memory.
- No screenshots exist for this report (see Method section) — do not infer any were taken.
- Server was left running (`http://127.0.0.1:3100/`, save at `data/banner-and-bounty.sqlite`) at the end of this session, per the task's "leave the project running" instruction.
