# Class/skill codex — M3 candidate (not folded into M2)

Date: 2026-10-23 · Owner: Producer · Task ID e6bc8b74-aff8-4130-9950-3f53573a28b4

## Player feedback

Players can pick a secondary class and recruit heroes but have no way to see what each class
does — stats, per-level growth, playstyle, skills/talents — before committing. This echoes the
owner's M1 verdict ("too little to see") and touches M2 acceptance check 2 (build screen for
primary/secondary class and skill choice from a ≥6-class roster), which is close to a blind
choice without a reference view.

## Decision: queue for M3, do not fold into M2

Checked current dashboard task state (`node -e "fetch(.../tasks)..."`, 2026-10-23):

- M2-22 (Systems Designer, class/skill spec) — **approved**.
- M2-23 (gear/crafting spec), M2-24 (copy), M2-25 (contracts), M2-26 (engine), M2-27
  (server/browser incl. battle view), M2-31 (areas/dungeons), M2-28 (tuning) — all **approved**.
- M2-29 (QA independent playtest) — **in_progress**, running against the frozen acceptance
  checks in `design/studio/milestones/M2.md`.
- M2-30 (Game Director verdict + M3 plan) — **in_progress**.

M2-22 and M2-27 are not "in-flight" in the sense of still being worked — they are approved and
frozen, and QA (M2-29) is already mid-playtest against the acceptance checks exactly as specified.
None of M2.md's 12 acceptance checks require a codex/reference view. Reopening M2-22's class/skill
contract or M2-27's UI scope now would:

- Risk invalidating QA's in-progress evidence (M2-29 is testing against the current build).
- Violate the instruction to keep this additive and not reopen M2-22's frozen contracts — in
  practice, review the backlog, and "additive" at the data layer makes this a new UI feature, not
  a pure data read, so it is still new scope arriving after the milestone's spec/implementation
  tasks closed.
- Compete with M2-30, which is already assembling the verdict and M3 plan.

This matches the studio's existing pattern for owner/Director feedback arriving after a task's
spec is frozen: write it up as an M3 candidate for the Director's M3 plan, as already done for
the mid-expedition loadout change (`design/game/reports/m3-mid-expedition-loadout-change.md`),
the cycle-duration feasibility spec (`design/studio/reports/cycle-duration-feasibility.md`), and
the class/secondary-class respec spec (task `1427c61d`, in_review).

## Scope sketch for M3 (not specced here — for the M3 planning task to size)

A read-only codex/reference tab, sourced from existing class/skill data already fixed by M2-22
(`design/game/reports/M2-22.md`, `design/game/classes.md`): per-class base stats, per-level growth
curve, a short playstyle description, and the class's full skill list (active/passive) with
effects — viewable from the hero build screen before committing a primary/secondary pick. No new
game-state, no balance change, no new contracts beyond a read endpoint over already-specified data.
Small enough for one Systems Designer task (copy/organize existing class data into codex form) plus
one Gameplay Programmer/Tools Engineer or UI task (render it), similar in size to the already-
approved "Add skill hover tooltips + damage breakdown to battle/build UI" task
(`c5bd2700-b2bc-4995-8741-16f5521c9d7b`), which solved an adjacent but narrower problem (in-fight
tooltips) and does not cover a pre-commitment class reference view.

## Recommendation

M2-30 (Game Director, in_progress) should include this as an M3 candidate task when it records the
M3 plan. No new dashboard task created by this report — M2-30 already owns M3 planning and this
document gives it the sizing and placement rationale.
