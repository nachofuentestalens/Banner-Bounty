# M1 delivery order (complete — M1 accepted, see `design/studio/release-verdict.md`)

The task registry in `planning/milestone.json` is authoritative for dependency edges and acceptance criteria. Dashboard statuses track execution. Everything begins staged; planning completion is not game completion.

M1 is accepted and closed; the gates and policy below are the historical record of how it shipped. Current priority is M2 — see `design/studio/milestones/M2.md` for scope and `## M2 delivery order` below for the task graph.

## Gates

| Gate | Tasks | Exit evidence |
| --- | --- | --- |
| G1: executable specification | M1-01 through M1-04, M1-09 | Contracts, combat/content, reward tables, copy and UI states have no blocking gaps |
| G2: local foundation | M1-05, M1-07 | One-command local startup, migrations, two isolated sessions, restart-safe state |
| G3: authoritative game loop | M1-06, M1-08, M1-11 | Combat/progression invariants, offline cap and arena snapshots verified |
| G4: playable interface and tuning | M1-10, M1-12, M1-13, M1-14 | Real client loop, measured progression, integrated commands and release candidate |
| G5: first playable accepted | M1-15, M1-16 | Independent acceptance report and playability verdict |

Tasks are not required to run in numeric order: use dependency readiness, then priority. Example efficient serial order: 01, 02, 04, 05, 06, 07, 08, 11, 03, 09, 10, 12, 13, 14, 15, 16. Copy/UI tasks may move earlier without blocking engineering. There is no unattended chaining in this setup.

## Priority policy

9: foundations/contracts that unblock implementation. 8: core gameplay and data integrity. 7: required UI, simulation and integration. 6: necessary supporting copy/specification. 5: final playability review. Actual regressions may increase priority; do not mark all tasks emergency. Dependencies always take precedence over priority.

## Completion policy

- A task run ending successfully means the agent stopped normally; it does not mean the task passed.
- Dashboard may automatically mark a role task done after a successful run. Coordinator verifies the report and acceptance evidence, then runs the helper's `complete` command to record review. Dependent work requires native done, the report and a current review marker.
- No milestone acceptance with P0/P1 defects: startup failure, save loss/corruption, cross-account mutation, duplicate reward, inaccessible core action or missing required loop.
- P2 polish defects can be documented with impact and a future fix; no speculative feature backlog is needed for M1.
- If a failed gate changes an upstream contract, reopen the affected task and re-evaluate dependents. Do not conceal invalidated evidence with a green status.

Keep work serial until a future milestone establishes isolated worktrees and independent file ownership. Adding seats does not imply extra concurrency or additional running processes.

## M2 delivery order

M2 replaces the earlier "second area + boss rebalance" plan with the owner-directed depth
milestone in `design/studio/milestones/M2.md`: watchable combat (full battle view, playback
controls), combat v2 (cooldowns, buffs/debuffs, taunt/threat, AoE, crit/dodge, formation), a
≥6-class dual-class roster with skill loadouts, gear rarity/affixes/crafting, and multi-area,
multi-floor dungeon content. M2-01 (area-2 contract amendment), M2-07 (gap tests) and M2-08
(contrast audit) from the earlier plan are integrated and stay valid; they are not redone.

Tasks M2-21 through M2-30 carry the milestone (see the task table in
`design/studio/milestones/M2.md`). The Producer's milestone plan is authoritative for the exact
dependency graph and priority numbers for these tasks; this document does not duplicate that
graph. General ordering intent: specification tasks (M2-22 combat/class/skill/formation spec,
M2-23 gear/crafting spec, M2-24 copy, M2-25 contracts) before implementation (M2-26 engine/content,
M2-27 server/browser including the battle view), before tuning (M2-28) and independent QA (M2-29),
before the milestone verdict (M2-30). M2-21 (land prior combat-replay work) is a prerequisite for
M2-22 and M2-26 so the new combat spec and engine build on the current baseline, not a stale one.

Completion policy for M2 follows the same rules as M1 above: no acceptance with a P0/P1 defect, a
successful run is not the same as a passing review, and invalidated evidence must not be concealed
behind a green status. A P0/P1 defect specific to M2 also includes: a battle view that cannot show
what happened in a fight, or combat state that desyncs from a playback control (pause/step/speed/
skip).

## M3 candidate backlog (from 2026-10-22 owner feedback triage)

Not scoped into M2; tracked here so M2-30's verdict/M3 plan picks them up. Two owner-reported gaps
go deeper than UI polish and would rework pacing fundamentals the M1-04/M1-13 freezes and M2-22's
"no real-time input" decision rely on:

- **Cycle duration tied to actual fight length, watched close to real time.** Today a cycle is a
  fixed ~1-minute abstract time unit (`economy/baseline.md`, `economy/tuning.md`) decoupled from
  how long a fight actually takes to resolve, and nothing guarantees a fight is on-screen while it
  runs. Binding cycle length to fight length touches the offline-progress cap math, the
  reward-per-cycle tuning tables, and the simulation tooling that all assume a fixed cycle unit —
  this is an architecture/economy rework, not a battle-view tweak, and should be spec'd against a
  post-M2 baseline, not patched into the in-flight M2-26/M2-27 implementation. Feasibility spec
  delivered (CTO, task `9fa4109a-92c5-4c03-85d7-406189c0f218`):
  [design/studio/reports/cycle-duration-feasibility.md](../../design/studio/reports/cycle-duration-feasibility.md),
  merged on `main` (commit `8391e56`).
- **Mid-expedition skill loadout changes (effective next fight, not immediately).** Not in M2's
  scope (`milestones/M2.md` scope item 3 is build-time loadout only). Needs a contract amendment
  (how/where the deferred change is recorded against a running, deterministic expedition) before
  any engine work, so it should follow M2-25/M2-26, not run alongside them. Spec delivered
  (Systems Designer, task `f4491607-20b6-413e-b20c-bc0f026479fb`):
  [design/game/m3-mid-expedition-loadout-change.md](../../design/game/m3-mid-expedition-loadout-change.md)
  and [design/game/reports/m3-mid-expedition-loadout-change.md](../../design/game/reports/m3-mid-expedition-loadout-change.md),
  merged on `main` (original commit `d240ee4`; integrated commit `c8ebd20`).

Both specs and the Systems Designer's report are merged on `main`. The commit hashes above are
confirmed in this branch's git history, and both task IDs match the corresponding report headers.

Both remain real owner priorities, not rejected. The complete five-item disposition, including
watchability as a separate acceptance concern, is in
[the feedback triage report](reports/five-feedback-triage.md).

### Five-feedback follow-through

Keep existing M2 acceptance gates intact. Skill help and damage explanations support readable,
consequential build choices; their existing Engineering task is approved, but the corresponding
Design-owned interface/UI specification amendment is still needed (priority 7). Do not repeat the
implementation or treat its approval as independent milestone QA.

For M3 planning, prioritize reliable access to fights and deferred next-fight skill changes at 8,
then variable fight-length cycle pacing at 7, subject to contracts and measured economy evidence.
Watchability and cycle duration share a feasibility study but are distinct requirements: a visible
replay does not prove real-time advancement, and shorter cycles do not guarantee accessible fights.
The existing M2-30 verdict/M3 planning task owns scheduling; these are planning recommendations,
not newly authorized implementation tasks. See the triage report for owners, prerequisites and
observable acceptance targets. The unrelated debug menu is outside this five-item scope.
