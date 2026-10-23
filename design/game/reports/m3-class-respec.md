# Spec: class/secondary-class respec at level-scaled cost (M3 candidate) — evidence report

Date: 2026-10-23 · Owner: Systems Designer · Task ID 1427c61d-83e2-4d18-84c8-19e178ce53ff

## What changed

Added one new document: `design/game/m3-class-respec.md`. No other file was touched —
`classes.md`, `contracts.md`, `combat.md`, `economy/gear.md`, `ui-spec.md`, `packages/game`,
`packages/contracts`, and `packages/content` are all unchanged, per the task's explicit instruction
not to modify the M2-22 freeze, any M2 contract, or active M2 implementation. This is a
specification-only deliverable, following the structure and sourcing discipline of the existing M3
candidate `design/game/m3-mid-expedition-loadout-change.md`.

The spec covers, as requested:

1. **What can be changed.** Section 1 establishes the actual gap from reading `classes.md` directly:
   primary class has no change mechanism today (fixed at creation/recruitment); secondary class
   already has a free, unlimited switch outside an active expedition (`classes.md` 4.2). The new
   mechanic is scoped to primary-class change, with an option to bundle a (still-free) secondary
   change into the same request — covering "primary, secondary, or both" as the task asked, without
   adding cost/friction to the secondary path that already works.
2. **Cost formula (section 3).** `goldCost(L) = 100*L`, `scrapCost(L) = 5*L`, `sigilCost(L) = 1 if L>=5
   else 0`, for hero level `L` (1-10, cap unchanged per `classes.md`/`gear.md`). Worked examples given
   at L1/L5/L10, cross-checked against `gear.md`'s recruitment cost and per-cycle/weekly income figures
   so the price lands above a single recruit but within roughly a day's expedition income.
3. **Skill loadout reset (section 4).** A committed respec always fully clears and auto-refills all 4
   loadout slots from the new primary+secondary kit, reusing `classes.md`'s existing "auto-filled with
   its whole kit" convention rather than attempting an ambiguous partial carryover.
4. **Cooldown/frequency limit (section 5).** A flat 24 real-world-hour per-hero cooldown
   (`lastClassRespecAt`), independent of and in addition to the existing `active_expedition` lock; no
   lifetime cap or cost escalation by respec count, on the reasoning that the cost + cooldown pair
   already bounds the behavior the owner would want bounded.
5. An illustrative new-mutation contract shape (section 7) and additive UI affordance (section 8),
   both explicitly marked as not authoritative/not a freeze amendment, matching the sibling spec's
   pattern for CTO/contracts and UI work that is not part of this task.
6. An explicit "what already exists" section (1) and "why these choices" section (6) so a future
   reader does not mistake this for the only way to read the player feedback.

## Why these choices

- **Scoped to primary-class change only, not re-costing the existing free secondary switch.** The
  player feedback says class change is "unclear/unavailable" — reading `classes.md` shows secondary
  change is actually available and free today; the real gap is primary. Adding a cost to something
  that already works for free would be a regression the feedback never asked for.
- **Level-scaled cost, not flat**, because a higher-level hero has more invested kit/time to discard;
  scaling the price with level matches how costly the decision is to reverse, and reuses the existing
  "II skill unlocks at level 5/8" thresholds (`classes.md` 5) as the natural step point for the sigil
  requirement rather than an arbitrary number.
- **Full loadout reset over partial carryover**, to avoid a loadout that is valid-looking but secretly
  references a class the hero no longer has — the reset is free to re-fix (one extra click), so no
  currency cost compounds the inconvenience.
- **Wall-clock cooldown instead of an escalating/capped respec count**, as the simplest single guard
  against rapid flip-flopping; the spec's section 5/6 explicitly says this is the reversible default
  and how to add escalation later if play data shows it's needed — not a claim that it's definitely
  sufficient forever.

## Acceptance check: evidence

| Check | Command/evidence | Result |
| --- | --- | --- |
| Task scope respected (no `classes.md`/contract/M2 engine edits) | `git status --porcelain` and `git diff --stat` against task base `42c644340fd04043b48a9b606e0d251dadd0cfe0` | Only `design/game/m3-class-respec.md` (new) and this report are added; `classes.md`, `contracts.md`, `combat.md`, `economy/gear.md`, `ui-spec.md`, `packages/*` untouched. |
| Spec addresses all four owner asks (what can change, cost formula with exact numbers, loadout-reset rule, cooldown/frequency) | Manual read-through of `m3-class-respec.md` sections 1-2 (scope), 3 (cost), 4 (reset), 5 (cooldown) | Present; see "What changed" above for the mapping. |
| Cost numbers grounded against existing economy figures, not invented in isolation | Cross-referenced against `economy/gear.md`'s recruitment cost (`150*ownedHeroCount`), material IDs (`material_scrap`/`material_sigil`/`material_core`), and per-cycle/weekly gold+material income figures already frozen in that document | Reasoned comparison documented in spec section 3; not run through `scripts/simulate.mjs` (no economy simulation was performed — that is Economy Designer scope, flagged in Unresolved issues). |
| No contradiction with the frozen M2-22 surface | Re-read `classes.md` sections 2, 4, 4.2, 9 before writing the spec; spec section 1 explicitly states and preserves the existing free secondary-switch behavior rather than overriding it | Confirmed by direct comparison; no edit made to `classes.md`. |
| No duplicate/competing M3 backlog task created, no active M2 task touched | Only this report's own content; no `task` block requesting engine/contract work was issued for this spec | Confirmed — see "Next task" below. |

No command produces a pass/fail for a pure design document beyond the git-diff scope check above;
there is no build/test surface for this task (nothing in `packages/*` changed). Stated honestly
rather than claimed as a verified runtime pass.

## Unresolved issues

1. `classes.md` 4.2 does not specify loadout-slot handling when only the secondary class changes via
   the existing free path (a pre-existing gap, not introduced by this spec) — flagged in the spec's
   own section 10 for the owner to decide if it ever surfaces as a bug report; out of this task's
   authority to resolve since it would require amending the frozen `classes.md`.
2. The illustrative contract/schema shape (spec section 7) is not authoritative — it needs to be
   re-cut by M3's CTO task against whatever M2-25/M2-26/M2-28 contract and engine surface has actually
   landed by the time M3 starts.
3. Cost numbers (spec section 3) are a reasoned proposal, not a simulated/tuned figure — no economy
   simulation (`scripts/simulate.mjs` or equivalent) was run for this task. A future Economy Designer
   tuning task, analogous to M1-13/M2-28, would be the natural place to validate or adjust them against
   real play data.
4. Whether a lifetime respec cap or escalating cost is ever needed is explicitly left open (spec
   section 5/6) pending real play data.

## Next task

This is a specification deliverable with no immediate dependent task to launch now — the task
explicitly scoped this to a spec-only deliverable and asked not to touch active M2 task files or
implementation. The natural next step, when the owner is ready to schedule this as a real M3 task, is
a CTO contracts task (amend `contracts.md`/`packages/contracts` for the new respec mutation per this
spec's section 7) followed by a Gameplay Programmer engine task (`packages/game` validation/commit
logic per sections 3-5) and a UI/copy task (per section 8) — not started here, and no task block is
being sent for it per the instruction not to create duplicate backlog work.
