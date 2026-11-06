# Current release verdict: G0 Economy conditional pass; M3 sequencing permitted

Date: 2026-11-06 · Owner: Game Director · Re-disposition task `9b78d00a-504d-4b20-8b9e-bc1e51545679`

**M3-02 G0 Economy: CONDITIONAL PASS. Fresh-versus-migrated save progression is explicitly
accepted as a deferral to M3-08 server work, not a blocker to starting M3 production and not a
verified pass. Full M2 acceptance remains withheld.**

The [M3-02 appended review](reports/M3-02.md#update-2026-11-06-g0-economy-re-disposition-from-the-completed-rerun)
supersedes the earlier Economy FAIL and stale-evidence hold. It reviews both November 6 updates
in [M2-28](../game/reports/M2-28.md) and the
[ledger-spend/offline report](../../reports/engineering/ledger-spend-offline.md).
Spending, offline partition simulation and guaranteed-material failure recovery now pass within
the pure-engine harness's scope. Existing fixed-level matrix, overflow, material constraints
and level-3 team-building contrast evidence remain bounded; no universal class-balance or
fresh/migrated progression pass is claimed.

M3-08 already owns server migrations/services, so it must supply the missing isolated SQLite
fresh/legacy progression evidence with real migrations, controlled time/RNG, preservation checks
and reopen/retry behavior in `reports/engineering/M3-08.md`. Starting gold and mocked migrations
cannot satisfy this obligation. M3-11 independently verifies it; M3-12 cannot claim full
progression acceptance without it. The report states the exact exit evidence and reason for deferral.

The other G0 dispositions and M3 plan-review PASS are unchanged. G0 is conditionally satisfied
for production sequencing. Existing P2 enemy/opponent identification and literal solo-improvement
gaps remain recorded and unwaived; this decision does not certify full M2 acceptance or enjoyment.

**M3-07 may proceed under this verdict after integration and normal prerequisite checks.**
However, its live required path `design/studio/reports/M3-02-accepted.md` is absent from this
baseline: the existing gate/Producer workflow must reconcile that marker hold before execution.
Its `in_progress` stage alone does not establish readiness. **M3-08 may proceed after its
M3-07/M3-05 prerequisites, carrying the explicit server-evidence obligation; M3-09 may proceed
after its M3-08/M3-06 prerequisites.** All native dependencies and committed-input requirements
still apply. No task was started or dependency bypassed by this review.

### Marker-hold reconciliation (2026-11-06, Producer, task `2cf2e5db-6c44-47a7-8a2a-6e7c796fc74e`)

As of this update, no task exists that authors `design/studio/reports/M3-02-accepted.md`.
The two tasks this gate rests on are already approved and distinct, not duplicated by anything
below: original M3-02 review `5dc6371a-c0a0-4393-9404-4497720246f4` and the G0 Economy
re-disposition `9b78d00a-504d-4b20-8b9e-bc1e51545679`. This Producer task dispatches a new
Game Director task to author the missing marker, depending on both approved tasks above so it
cannot start before they are integrated and cannot duplicate their review. This is
tracked by the Game Director task "Author M3-02-accepted.md acceptance marker for M3-07's
required path", dispatched by Producer task `2cf2e5db-6c44-47a7-8a2a-6e7c796fc74e` on
2026-11-06.

Historical verdicts below are preserved; the current G0 Economy disposition above controls the
production gate. Full M2 acceptance is not granted by this update.

---
# Prior recovery verdict: M2 acceptance rejected; M3 production held

Date: 2026-11-06. Game Director recovery task `750646bf-b613-4ff5-93eb-f33545a3f0d2`; gate owner remains M3-02 `5dc6371a-c0a0-4393-9404-4497720246f4`.

**G0 does not pass.** The [current M3-02 reassessment](reports/M3-02.md) supersedes the earlier claim that no new Economy evidence exists. Updated Economy checkpoint `7a70613683083f65fc24ea93cde5507e99fe9305` is committed in this baseline. Fixed-level income, overflow, gold-only legacy comparison and level-3 dungeon contrast have bounded supporting evidence.

Full acceptance remains withheld: fresh/migrated evolving progression, actual purchases, insufficient-material recovery and offline partitions are unmeasured; broad build balance is unverified. QA retains failed opponent identification, unmet solo expedition improvement and missing `/areas.name`; numeric affix comparison is not established. The reassessment explicitly routes these through existing harness, M2 implementation/design, Economy and QA closure tasks. No failed criterion is silently waived and no duplicate task is authorized.

The M3 execution-plan review remains PASS. Its gate requires full M2 acceptance, not approval of an incomplete report. M3-02 must remain open and M3-07 onward held until an affirmative verdict is reviewed and integrated. The dashboard refuses to resume merged M3-02; this is an unresolved delivery restriction. M3-07 now additionally requires the absent committed `design/studio/reports/M3-02-accepted.md`. Create that record only for an affirmative, evidence-backed Director verdict and integrate its reviewed changes before resuming existing M3-07. M1's historical acceptance remains unchanged; no new playtest, build-health or enjoyment claim is made.

The verdict below, from the prior Director review (M2-30, 2026-10-29), is preserved as the
record of what was already fixed and resolved since. It is not superseded in substance, only
extended by the evidence above.


Archive note: This earlier recovery assessment is superseded by the current G0 Economy conditional-pass disposition above. Its observations are preserved as historical evidence, not reinstated as current holds.

---
# Prior release verdict: M2 acceptance withheld

Date: 2026-10-29 · Owner: Game Director · Task M2-30

**REJECT full M2 acceptance on baseline `1cd836668a18f66e6ad5c3e34b0383b690f6b774`.**
M2 adds watchable combat, dual-class builds, crafting and a multi-floor dungeon, but formation
rows and status durations fail the frozen replay checks. Existing P2 fixes remain unverified;
checks 8–10/12 also have evidence gaps. No new P0/P1 was established by this document review,
and no claim that the build is P0/P1-free or enjoyable is made.

The [M2-30 report](reports/M2-30.md) records all twelve checks, exact attributed commands,
the later positive level-3 dungeon contrast evidence and the remaining pacing limits. Existing
F01/F02 tasks must integrate before the requested QA closure pass. Director reviews that report
and the remaining M2-28 evidence disposition before changing this verdict. Task approval alone
is not milestone acceptance.

[M3 scope](milestones/M3.md) authorizes specification and Producer planning now; production
feature implementation waits for M2 closure and plan review. It covers reliable fight access,
deferred loadouts, measured fight-length pacing, eight classes with specializations, three races,
a second dungeon, and local asynchronous team arena seasons/tournaments. No feature is claimed
implemented by this plan.

The following M1 verdict is preserved as a dated historical decision; it is not M2 certification.
Its playtest/process observations describe October 19. Subsequent owner dissatisfaction and the
recorded level-3 boss decision are reflected in vision.md, decisions.md and the M2/M3 plans.

---
# M1 release verdict: accepted

Date: 2026-10-19 · Owner: Game Director · Task M1-16

## Verdict: ACCEPT

The first-playable milestone is accepted. All 13 acceptance checks (A01-A13) from
`design/qa/acceptance.md` have run-and-observed evidence, independently re-verified by QA in
`qa/reports/M1-15.md` on top of engineering's own release-candidate walkthrough
(`reports/engineering/M1-14.md`). No P0 (data loss, reward duplication, account-isolation
break) or P1 (broken acceptance gate) defect is open. The three bugs found during M1-15 were in
QA's own test scripts, caught and fixed before being reported — not product defects.

This is a verdict on **working functionality**, not on whether the game is fun. See "What the
owner should judge" below.

## How to launch and play it yourself (no technical background needed)

1. Open a terminal in the project folder.
2. Run `npm ci` once, then `npm run build`.
3. Run `npm start` (or the command printed by `npm run build` if different — check
   `README.md`'s "Run locally" section if `npm start` isn't defined).
4. Open `http://127.0.0.1:<port shown in the terminal>` in your browser (Chrome or Edge).
5. Play through this short script:
   - Create/open your company. You start with three heroes: Vanguard, Ranger, Arcanist.
   - Go to **Expedition**, send your party on the bounty, and wait (or come back later — progress
     continues while you're away, up to a cap).
   - Open **Inventory** to equip whatever dropped.
   - Once a hero hits level 3, pick a specialization (two choices per class) on the **Company**
     screen.
   - Challenge the **Boss** once your party is level 3+. Read the battle log — it's deterministic,
     so the same party/gear always produces the same outcome.
   - Optional: open a second browser (or a private window) as a second local account, and use the
     **Arena** screen to publish and challenge a team snapshot asynchronously.
6. To stop, close the terminal (Ctrl+C) or close the browser tab — your progress is saved locally
   and will still be there if you restart the server later.

No cloud account, payment, or install beyond Node.js is required.

## What the owner should judge

A working build does not prove the loop is enjoyable. QA and engineering can only confirm the
mechanics behave as specified — they cannot certify fun. When you play, judge:

- Does choosing a party and specialization feel like a real decision, or arbitrary?
- Is the combat log readable enough to understand *why* you won or lost?
- Does returning after an offline wait feel rewarding, or did you not notice a difference?
- Is the boss fight a satisfying goal, or does it feel too easy/too soon (see limitation below)?

## Known limitations (not blockers)

- **Boss combat margin is thin.** Simulation evidence (`design/game/economy/tuning.md`) shows the
  Tollkeeper is winnable the instant a hero reaches level 3, but in the fully unequipped/
  unspecialized case 2 of 3 heroes died in the trace. This is a combat-balance signal, not a
  broken gate — flagged for the owner's judgment, not fixed here, since fixing it risks breaking
  the already-on-target specialization-unlock pacing (see tuning.md's reasoning).
- Boss-loss recovery, the 100-item inventory-overflow boundary, malformed-request handling, and
  non-Windows/non-Chromium platforms were not independently exercised this round (listed in full
  in `qa/reports/M1-15.md`'s "Unresolved issues"). None showed a defect — they are untested, not
  failing.
- No accessibility contrast-ratio or screen-reader testing has been done at any point in M1.
- A process gap, not a product one: the owner's "boss readiness stays at level 3" answer
  (`design/game/economy/tuning.md`) was given twice in conversation but never landed as a
  `design/decisions.md` entry. It does not block this verdict since the owner's answer is
  unambiguous and unchallenged, but the owner may want to ask AgentDashboard why confirmed answers
  aren't reaching the decision log.

## Not claimed

This verdict does not claim commercial readiness, visual polish, or player enjoyment. It is not
player feedback — no player other than QA/engineering's own scripted walkthroughs has touched this
build. "Accepted" means the first-playable loop specified in `design/studio/vision.md` is actually
implemented, runs locally without a paid dependency, and holds up under the attack/concurrency/
restart checks QA ran against it.
