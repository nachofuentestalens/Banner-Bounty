# Director daily review — 2026-11-08 (UTC)

Task: `859007a7-268f-4ff8-93fc-e720a97e0dd1`. Author: Game Director, AI playtester.
Build: `3dca4ba40bccacdfcf85d96936600e8982091ca9`, assigned branch
`agent/task-859007a7-268f-4ff8-93fc-e720a97e0dd1`.

**Verdict: PLAYED, bounded. Core loop and the arena-identity fix hold up; equip-comparison
numbers remain missing and cycle pacing has shifted dramatically without an updated economy
read. Full M2 acceptance remains withheld; M3 production sequencing continues under the
existing conditional gate.** This is AI observation and judgment, not human feedback or proof
of enjoyment.

## Current delivery state

The November 6 release verdict (`release-verdict.md`) still governs: M3-02 G0 Economy is a
**conditional pass** permitting M3 production sequencing, not full M2 acceptance. Since
yesterday's review, two things landed on `main`:

- **Arena opponent-identification fix** (commit `b2aad53`, `apps/server/src/services/
  battlePresentation.ts` + `combat2.ts`/`combat3.ts`): arena enemy units now carry a distinct
  `enemyId` separate from the stable-heroId `unitId`, so opponent display names resolve to class
  names instead of raw unit identifiers. I independently reproduced this fix in the browser today
  (see below) — the P2 I logged in yesterday's report (`director-daily-2026-11-07.md`) is closed.
- `reports/engineering/M3-08.md` (server migrations/services for G2-G9: pending loadouts, seasons,
  brackets, respec, fresh/migrated progression evidence) is complete and integrated; its own report
  recommends **M3-09** (accessible browser flows) next. No `reports/engineering/M3-09.md` exists
  yet — M3-09 has not been dispatched/run. Today's browser still only exposes the pre-M3-09
  surface (expedition, boss, inventory, arena, codex); M3's new classes/races/dungeon/
  seasons/tournaments are not browser-reachable yet and must not be advertised as playable.

## Session and evidence

Node 22.14.0, npm 10.9.2, Windows. Built client served locally; headless-mode Edge via
Playwright, driven through hand-written session scripts (not the repo's `scripts/walkthrough.mjs`,
which fails before reaching core-loop steps — see below). Four short sessions ran between
13:01 and 13:35 UTC, each against a fresh temporary SQLite database under `%TEMP%`, injected
clock (`Date.now()` plus manual minute advances), ephemeral localhost ports. The owner's save was
never touched. All servers/browsers were explicitly closed (`STOPPED` printed, exit 0). Scratch
runner scripts and their output (`test-results/director-20261108/`) are local-only; I deleted the
runner scripts from the worktree before finishing so only this report remains as a deliverable.
Screenshots captured: `boss-before.png`, `boss-after.png` (Tollkeeper fight), `arena-A-list.png`,
`arena-A-report2.png` (opponent preview with stat table).

## What I directly played

- Loaded Company A, started the one area's expedition, advanced the clock 5 minutes, collected.
  **Credited 22 cycles for 5 minutes elapsed** (a second run credited 23). All three starter
  heroes were already level 3 after this single collection, with 190 gold and 2 inventory items.
  This is a radically faster cycle rate than M2's fixed ~60-second cycle the walkthrough script
  and `economy/baseline.md`/`tuning.md` still assume — consistent with M3-08's server report
  flagging `msPerRound=2000` as a provisional value "flagged for Economy re-benchmarking once
  real M3 content ships at scale." The old fixed-cycle assumption is gone from the server's
  actual behavior; nothing in today's build communicates the new rate to the player or to QA's
  scripts.
- Stopped the expedition, opened Boss. Fresh save correctly showed "Toll Unpaid." Challenged
  once: a 7-round replay resolved (Tollkeeper at 211/220 HP visible mid-replay, pause/step/speed
  controls present, full combat log with 39 events and a worked damage formula on the visible
  action), and the panel then read "Already Claimed" — a win was recorded and rewarded in a single
  click at level 3, matching the owner's preserved early-boss-readiness decision.
- In a second browser context, published Company B's team from the Arena screen, then opened
  Company A's Arena screen. The opponent entry read **"Vanguard / Ranger / Arcanist — published
  08/11/2026 under ruleset v1"** — no UUIDs anywhere in the arena page text (confirmed by regex
  scan for long hex/UUID-like tokens: zero matches, across two independent sessions). Opening the
  entry showed a labelled "Published Team Snapshot" explainer ("a saved copy… not a live player...
  challenging it won't affect their current game") and a per-hero Class/Level/HP/ATK/DEF table
  before the Challenge button — the pre-fight identification and context the owner needed is now
  present for both the list and the detail view.
- Re-checked `apps/web/src/screens/Inventory.tsx`: the equip-comparison panel still renders
  "Exact stat change isn't shown yet — the server doesn't report computed hero stats in M1." (line
  107, unchanged). This P2 from yesterday's report is still open — the player cannot see a numeric
  stat delta before confirming a gear swap.

## Reproducible issues, separate from taste

| Finding | Reproduction and expected/actual | Severity and evidence |
| --- | --- | --- |
| `npm run walkthrough` fails on cycle-timing assumption, not a product bug | Run `npm run walkthrough` on this build. Step 1-3 pass (the step-2 hero-card locator issue from Nov 7 is fixed). Step 4 asserts `advance(5 minutes)` credits exactly 5 cycles; actual 23. | Verification blocker. The server's cycle rate has moved far off the fixed-60s model the script encodes; QA/Tools Engineer must update the assertion (or assert a bounded range) once the new rate is an intentional, documented value — not revert the fix. |
| Equip comparison still omits numbers | Collect an item, open Inventory → Equip. Expected an actionable ATK/DEF/etc. delta; actual the same static M1-era disabled note as Nov 7. | P2, unresolved, independently reproduced at `apps/web/src/screens/Inventory.tsx:107`. |
| Cycle rate is ~20x faster than the fixed model with no visible communication or updated pacing evidence | Start an expedition, advance 5 minutes of server clock, collect. Expected a rate matching `economy/baseline.md`/`tuning.md`'s fixed-cycle assumption or a documented new one; actual ~22-23 cycles/5 minutes, undocumented in any player-facing copy and unmeasured against M3-04's provisional pacing bands. | Not a P0/P1 (no save loss, no duplicate reward, core loop completes) — flagged as a pacing/economy gap needing Economy Designer measurement before M3-10, not a bug fix. |

No new P0/P1 was found or reproduced today. Arena account isolation was not re-tested (B's
account state was not independently inspected after A's actions); this bounded session cannot
prove its absence.

## Commands and results executed today

| Command | Result |
| --- | --- |
| `node --version`; `npm --version` | v22.14.0; 10.9.2 |
| `npm ci` | Exit 0; 189 packages; same 1 moderate/1 high audit advisories as Nov 7, not investigated |
| `npm run build` | Exit 0; all five workspace builds pass |
| `npm run validate` | Exit 0; 38 test files, 372 tests, build pass |
| `node scripts/simulate.mjs --seed 1 --runs 8 --max-cycles 100` | Exit 0; reproducibility PASS; pacing sweep 96 wins/0 losses; level-3/boss-ready cycle 12/12/12 across 8 runs; catch-up benchmark p95 6.97ms, well under the 2000ms target |
| `npm run walkthrough` | Exit 1 at step 4 (cycle-count assertion, see above); steps 1-3 pass, including the previously-failing hero-card locator |
| Four hand-written Playwright sessions (fresh temp DB each, injected clock) | Exercised above; all explicitly stopped, exit 0 |

The simulation's fixed-cycle pacing numbers (level-3 at cycle 12) are now stale relative to the
browser's observed ~22-23 cycles per 5 minutes — `scripts/simulate.mjs` and the browser server
appear to be measuring different things since M3-08 landed. Economy Designer should confirm
whether `simulate.mjs` still reflects the live server's cycle-length logic before its numbers are
used for any M3 pacing decision.

## Strongest and weakest experience

Strongest: the boss fight and arena preview are both genuinely readable now — worked damage
formulas, HP bars, playback controls, and (as of today) named, statted opponents instead of raw
IDs. The prepare→dispatch→collect→improve loop completes in well under a minute of session time.

Weakest: the game's own pacing model has moved without anyone updating the documents, the
walkthrough, or the equip-comparison copy that describe it. A player today would blow through the
entire M1-era "20-40 minute grind to level 3" expectation in moments, reach the boss almost
immediately, and then hit an equip screen that still apologizes for not showing numbers it
otherwise seems capable of showing (the Boss panel's damage-formula breakdown proves the server
already computes and can surface exact stat arithmetic elsewhere). This is a coherence gap, not a
broken gate: the underlying systems work, but player-facing explanation hasn't caught up to what
the server now does.

## Milestone goals and exit criteria

M3's G0-G10 scope (`milestones/M3.md`) remains the destination; nothing here changes a gate's
required evidence. G3 (fight-length pacing) is visibly in motion server-side ahead of its formal
measurement step (M3-10/M3-04) and ahead of browser exposure (M3-09) — that sequencing is a risk,
not a violation: if M3-09's UI assumes the old fixed-cycle framing anywhere (copy, progress bars,
expected-time text), it will immediately be as stale as the walkthrough script is today.

## Top three next steps

1. **Reconcile the new cycle-length behavior with economy docs, simulation tooling and the
   walkthrough before M3-09 UI work locks in stale assumptions.** Owner: CTO (confirms this is the
   intended G3 timing model, not an unintended side effect of M3-08's server work) and Economy
   Designer (updates `economy/m3.md`'s measurement matrix and `simulate.mjs` to match). Accept
   when: the live server's cycle rate is an explicit, documented value or formula; `simulate.mjs`
   and the browser agree; `scripts/walkthrough.mjs` step 4 asserts against that documented value
   instead of the old fixed-60s figure.
2. **Close the equip-comparison numeric gap.** Owner: Gameplay Programmer, with UI Designer review
   of the comparison copy. Accept when Inventory's equip preview shows an actual before/after
   stat delta (the Boss panel's existing damage-formula rendering shows the server already has the
   data) and QA independently verifies accuracy against at least one upgrade and one downgrade.
3. **Proceed with M3-09 (accessible browser flows) under its existing M3-08/M3-06 prerequisites,**
   explicitly treating step 1's cycle-rate reconciliation as an input so new UI doesn't encode the
   same stale assumption the walkthrough just caught. No change to M3-09's existing scope or
   dependencies is proposed.

## Needed design and staffing

No new design document is needed; this is a reconciliation task between already-approved
specs (`economy/m3.md`, `m3-systems.md`) and what the integrated server now does, not a scope
change. No staffing changes recommended — Gameplay Programmer and Economy Designer already own
the affected areas under the existing M3 task graph; QA Tester should pick up the walkthrough
fix as part of its normal M3-09/M3-11 verification work rather than as a separate task.

## Not claimed

This is not a claim of full M2 or M3 acceptance, not a measured real-time pacing benchmark (all
progression evidence here used an injected/advanced clock), and not independent account-isolation
or accessibility verification. Only this report is a repository deliverable; no source, save, or
live service was changed.
