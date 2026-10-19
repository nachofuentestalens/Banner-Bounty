# M1 acceptance and evidence

Each task owns focused checks; M1-15 performs independent release verification once the integrated build exists. These checks are planned, not yet executed.

| ID | Observable acceptance | Primary task(s) |
| --- | --- | --- |
| A01 | Fresh install using documented prerequisites starts the game locally without a cloud account; port collision is actionable and stopping leaves no stray game child process | M1-05, M1-14, M1-15 |
| A02 | Two browser contexts select different local accounts; neither can read private reports or mutate heroes/items of the other by changing IDs | M1-07, M1-15 |
| A03 | Three distinct heroes form an ordered party; each of three classes has two visibly different specialization choices at level 3 | M1-02, M1-06, M1-10 |
| A04 | Same seed, inputs and rules version yield identical combat events/result; dead actors cannot act; ties and timeout follow the specification | M1-06 |
| A05 | Equip/unequip updates effective stats; wrong-slot, duplicate equip and foreign-item requests fail; active expedition blocks loadout/spec changes | M1-08, M1-10 |
| A06 | Whole-cycle progress is equal for continuous and partitioned settlement under the cap; 59/60/61 seconds, zero/negative elapsed, 8-hour cap and repeated cap collection behave as documented | M1-08 |
| A07 | Same request retry, two concurrent collections, stale revisions and restart after a successful transaction cannot duplicate or partially grant rewards | M1-07, M1-08 |
| A08 | Browser absence and server restart produce intended catch-up; seed, loadout and remainder survive save/reopen; unsupported rules versions are handled explicitly | M1-08, M1-15 |
| A09 | Boss loss is recoverable; first victory reward is atomic and only granted once; victory/report is visible | M1-08, M1-10 |
| A10 | Publishing freezes a team; challenges need no online opponent; later opponent edits cannot alter saved reports; arena grants no M1 currency or items | M1-11, M1-10 |
| A11 | All core actions work by keyboard, have visible focus and useful labels; 1280x720 and 390px layouts have no blocked actions; empty/error/reconnect states are usable | M1-10, M1-15 |
| A12 | Seeded simulations report pacing distributions and eight-hour catch-up timing; tuning is evidence-based and uses the production engine | M1-12, M1-13 |
| A13 | Full walkthrough completes without P0/P1 defects; save survives a normal shutdown/restart | M1-14, M1-15, M1-16 |

## Deterministic and integration fixtures

Use injected clocks, fixed seeds, temporary isolated databases and separate browser contexts. Include both winning and losing expeditions, maximum inventory overflow, a disabled action attempted directly via API, invalid request payload, signed-out action, request ID reused with different payload, stale state, simultaneous different commands and replay access by the wrong account. Do not rely solely on DOM snapshots or tests that duplicate the implementation formula.

Check the 8-hour worst case against a provisional target of under 2 seconds on the recorded development machine, with bounded memory/logs and no perceptible freeze for another request. Record measured numbers and runtime/hardware context. If missed, fix the bounded processing strategy or document a justified revised target with CTO review; do not claim performance based on a tiny fixture.

## Ten-step playable walkthrough

1. Follow README from a fresh test data directory; load the game.
2. Select company A; inspect all three heroes and reorder the party.
3. Start an expedition; verify lock explanations for gear/spec actions.
4. Collect progression; close/reopen the browser and collect again.
5. Stop, equip a drop, compare stats, reach level 3 and choose specializations.
6. Challenge the boss; inspect loss or victory and verify one-time reward behavior.
7. Select company B in another browser context; publish its team.
8. Challenge B from A, then alter B and confirm the original report remains unchanged.
9. Restart the server; confirm both saves and expected elapsed progression.
10. Repeat essential actions by keyboard and inspect the narrow layout.

Development clock controls may accelerate steps in automated tests; clearly identify accelerated evidence. Game Director's pacing verdict uses recorded unaccelerated or simulation-equivalent elapsed time, never an assertion that a cheated run proves pacing.

## Evidence format

Each report: task ID, date, result (`pass`, `partial`, `blocked` or `fail`), source revision or changed-file description, acceptance checklist, exact commands/results, meaningful observations, unresolved issues and next task. QA's final report includes screenshots or explicit browser observations at both viewport sizes, fixture seeds, database/restart evidence, and defect severity. Never invent tests, screenshots or player feedback.

Dashboard feedback is for actual playtest findings. Add source, reproduction, expected/actual, frequency and impact; group duplicates before triage. Do not prepopulate invented feedback to demonstrate the feature.
