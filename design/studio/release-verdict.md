# Current release verdict: M2 acceptance withheld

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
