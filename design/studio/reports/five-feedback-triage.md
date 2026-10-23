# Five player-feedback items: triage and review correction

Date: 2026-10-23. Owner: Game Director. Task: `7a015776-cebb-4909-b98b-efe2461d8ed6`.

## Decision and grouping

This is triage, not implementation or a milestone acceptance verdict. Item wording below is
paraphrased from the five findings supplied in the review; no additional playtest feedback is
invented. The vision promises understandable combat and consequential builds without constant
clicking. Preserve deterministic server authority, offline progression and the frozen M2 gates.

There are three work groups, not five duplicate implementation requests: build flexibility (1),
combat explanation (2 and 5), and fight availability/pacing (3 and 4). Items within each pair are
related, not interchangeable; each keeps its own acceptance target.

| Item | Vision fit and priority | Disposition / owner | Observable target for subsequent verification |
| --- | --- | --- | --- |
| 1. Change skills during an expedition | Meaningful builds with less stop/start friction; 8 for M3 planning | Retain Systems Designer spec task `f4491607-20b6-413e-b20c-bc0f026479fb`; implementation deferred to M3 contracts and Engineering | Change applies at the recorded next-fight boundary, never rewrites a started fight; pending state survives restart; stop/cancel clears it; equipment/class locks remain enforced. |
| 2. Hover skill explanations | Readable decisions; 7 | Group with 5 under existing Gameplay Programmer task `c5bd2700-b2bc-4995-8741-16f5521c9d7b`; request Systems Designer UI amendment only | Inspect selected and alternative skills in build and battle views by hover, keyboard focus and tap; effects/cooldowns match the frozen class data; Escape dismisses; narrow layout remains readable. |
| 3. Always-watchable fight | Directly serves the watchable-combat promise; 8 for M3 planning | Retain CTO feasibility task `9fa4109a-92c5-4c03-85d7-406189c0f218`; separate delivery requirement under existing M2-30 planning | A connected player can access successive fights without losing one to a polling gap; pause/reconnect behavior and bounded retention are specified and tested; replay cannot duplicate rewards. No claim that every historical offline fight must be retained. |
| 4. Cycle length follows actual fight duration | Reduces unexplained waiting; 7 after contracts/economy evidence | Same feasibility task as 3, but separate authoritative timing work; defer implementation to M3 | Specify deterministic nominal duration, settle only elapsed eligible battles, retain partial time and the eight-hour cap; identical elapsed time/seed yields consistent connected/offline rewards; measure minutes-to-progression and catch-up cost. Playback speed never changes rewards. |
| 5. Explain damage calculation | Makes build consequences understandable; 7 | Same Engineering task as 2; existing CTO contract amendments cover damage evidence; Design UI amendment remains | Display server-recorded arithmetic and actual HP loss, including dodge/Burn where supported; distinguish damage from overkill; legacy reports explicitly lack evidence rather than fabricate calculations. |

## Existing routing and deferred work

Read-only dashboard lookup on 2026-10-23 returned approved stages for the three existing tasks
above, damage-contract tasks `195f2cb0-d2b9-4998-97e7-f1a1860bbc50` and
`37d33fd5-b435-4538-9fe9-cd7b3da86041`, and the separate debug task
`222017b3-c9bf-464f-8d52-398ffaefd299`. Existing M2-30
`72001eaf-a460-4053-9ca0-4888f1a9f07f` is in progress and owns the verdict/M3 plan.
These are observed workflow stages, not fresh gameplay acceptance evidence.

- **1 is not implemented by this task:** its committed Design spec is an M3 candidate; CTO must
  reconcile the pending-change contract with the integrated baseline before Engineering work.
- **3 is not closed by replay controls:** the feasibility report identifies latest-battle-only
  delivery as a separate gap. M2's requirement to inspect a fight still applies now; continuous
  access across successive live cycles is an M3 delivery requirement, not a waived M2 defect.
- **4 is not implemented by this task:** fixed-duration settlement assumptions affect economy,
  offline caps and simulation tooling. CTO and Economy Designer must resolve authoritative
  elapsed-time accounting before Engineering. The feasibility report's nominal-duration proposal
  and statements that advancement remains unchanged require reconciliation in the real contract;
  a faster replay alone cannot satisfy this item.
- **2 and 5 are not reimplemented:** the committed Engineering report describes implementation
  and focused tests. Independent M2 certification remains with QA/M2-30. The missing UI contract
  documentation is the single new gap-fix task emitted with this report.
- **Debug level/XP/gold menu:** unrelated to all five items; excluded from this triage's scope and
  acceptance. Its separate approved task does not retroactively authorize it as triage work.
- **Full class codex:** adjacent to item 2, not a duplicate tooltip request. Existing Producer
  report `class-skill-codex-m3-candidate.md` already routes it to M2-30; no new task here.

M2-30 should sequence M3 specification/contracts, economy measurement, Engineering, then QA using
the existing candidate reports. It must assign actual prerequisite IDs and committed inputs before
scheduling implementation. No duplicate milestone tasks or new engineering authorization are issued.

## Review findings resolved within this task's ownership

The requested base comparison (`caadba311c556c36ef9b555d40e7f6a44aa7fbe7`) initially showed only
`design/studio/priorities.md` changed. It did not contain the app.ts, Company.tsx or contracts.md
changes cited by the review. This run does not claim to have reverted PR #35, independently audited
its history, or approved its features. No Engineering source was edited. Existing implementation
and contract reports are evidence of separately owned work, not this triage's deliverables.

`interface.md` requires no hover-only essential information. `ui-spec.md` still lacks the skill-help
and damage-evidence behavior described by Engineering. Per current hands-off instructions, route
that amendment to Systems Designer with a task block, rather than editing Design files or emitting
a proposal for another department. Preserve the historical M1 freeze and add a dated amendment.

## Verification and limitations

Earlier attempt's checks, retained from its saved report (commands ran from design/studio):

- `git status --short`: initially clean.
- `git diff --stat caadba311c556c36ef9b555d40e7f6a44aa7fbe7` and
  `git diff caadba311c556c36ef9b555d40e7f6a44aa7fbe7 --name-only`: initially only priorities.md.
- `Invoke-RestMethod 'http://127.0.0.1:5190/api/projects/c6faaeda-b5c2-4d67-b351-1e1dd9f594a7/tasks'`
  with title/ID filtering: existing routes and stages above; no existing UI-amendment task found.
- `git ls-files --error-unmatch ../game/m3-mid-expedition-loadout-change.md reports/cycle-duration-feasibility.md ../game/interface.md ../game/ui-spec.md contracts.md`:
  exit 0; all inputs tracked. Engineering evidence report is also tracked.
- Initial `Get-Content AGENTS.md` failed at studio level; repository-root AGENTS.md was then read.
  No approval refusal occurred.
- Final verification was interrupted; the resumed run records it below.

No build, simulation or browser tests run: this changes only Leadership documentation and task
routing. Prior Engineering test results are attributed evidence, not rerun or independent passes.
No playability verdict or claim that all five features are delivered is made.

Next: Systems Designer adds the bounded UI amendment and reports any mismatch; existing M2-30
consumes this disposition for its verdict/M3 plan. Triage is complete; downstream delivery remains.

## Resumed review verification (2026-10-23)

- `git status --short`: exit 0, clean at resume; the triage artifact was already saved.
- `git diff --stat caadba311c556c36ef9b555d40e7f6a44aa7fbe7` and the scoped full diff:
  only priorities.md and this report differ from the requested task base. No app/server/web or
  contracts source changes are part of this comparison. The earlier attempt's one-file observation
  above describes its starting point, not this resumed run.
- Read-only dashboard GET, filtered to the named task IDs and tooltip/damage/UI-amendment titles:
  the seven delivered tasks remain approved; M2-30 remains in_progress (queued).
  No matching Design UI-amendment task was found. An initial unfiltered formatting attempt produced
  truncated output; the bounded ID/title lookup was used for the routing decision.
- `git ls-files --error-unmatch` for this report, interface.md, ui-spec.md, classes.md, contracts.md
  and reports/engineering/skill-tooltips-damage-breakdown.md: exit 0, all tracked.
- `git diff --check caadba311c556c36ef9b555d40e7f6a44aa7fbe7`: exit 0, no whitespace errors.

Dispatch exactly one gap fix to Systems Designer: add a dated skill-help/damage-explanation
amendment to design/game/interface.md and design/game/ui-spec.md, preserving the historical freeze.
Prerequisites are this triage task, Engineering task c5bd2700-b2bc-4995-8741-16f5521c9d7b and
contract task 195f2cb0-d2b9-4998-97e7-f1a1860bbc50. Require their approved, integrated inputs before
starting. Record accessible interactions, locked-build inspection, damage/HP-loss semantics,
legacy fallback and observable checks; report discrepancies without silently authorizing behavior
or editing Engineering source. Report path: design/game/reports/skill-help-damage-ui-amendment.md.
The final reply emits the executable task block; its creation/integration is not claimed here.
