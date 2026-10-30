# Dependency correction: 3 M3-candidate tasks — evidence report

Date: 2026-10-23 · Owner: Producer · Task ID `53719103-4dfc-4494-8fd9-88d8ea4ecb68`

## Scope

Correct `dependencyIds`/`requiredPaths` on three existing, already-`approved`/merged tasks flagged
by Game Director review:

1. `222017b3-c9bf-464f-8d52-398ffaefd299` — Add local debug menu for level/XP/gold
2. `1427c61d-83e2-4d18-84c8-19e178ce53ff` — Spec: class/secondary-class respec at level-scaled cost (M3 candidate)
3. `e6bc8b74-aff8-4130-9950-3f53573a28b4` — Class/skill codex — M3 candidate

## Verified current state

Live `GET` on the project tasks list confirms all three are `stage: approved`, `git: merged`, and
**all have `dependencyIds: []` and `requiredPaths: []`** today — the reviewer's flag is correct.

None of the three exist in `planning/milestone.json` (which only ever registered `M1-01`..`M1-16`)
or in `planning/dashboard-state.json`'s `tasks` map (same M1-only scope). They were created as
ad-hoc dashboard task blocks by the Game Director, outside the native `milestone.json` → `validate`
→ `sync` → `import plan` delivery flow described in `design/studio/dashboard.md`. Editing
`milestone.json` therefore has no effect on these three records: there is nothing in that file or
its mapping for `import plan` to match them against, and fabricating `M1`-style entries for them
would not be read by the importer (no `dashboard-state.json` mapping exists to link a new
`milestone.json` entry back to these UUIDs) and risks corrupting the M1-only registry for no effect.

## Capability gap (confirmed, consistent with prior precedent)

This matches the capability gap already recorded in
`design/studio/reports/dependency-correction-m2-feedback-followups.md`: no script or documented
route available to this agent supports editing `dependencyIds`/`requiredPaths` on an
already-created task. `scripts/dashboard.mjs`'s only `PATCH /api/tasks/:id` call sends execution
settings (`tokenBudget`/`toolBudget`/`autoCompact`), never dependency metadata. My own operating
instructions permit only the one documented read-only task-list fetch; I did not attempt any write
call. The prior report's resolution for `c5bd2700` shows the owner can apply this correction directly
through the dashboard's supported API — that is the mechanism available for this correction too.

## Target values (verified against the committed baseline; apply via the supported API)

### 1. `222017b3` — Add local debug menu for level/XP/gold

- `dependencyIds`: `["9f0dccab-1c69-4df9-88e8-7a1977a7e126", "ae4866f3-8c46-4142-bf70-c901d5d57d37"]`
  (`[M2-26]` engine implementation, `[M2-27]` server/browser wiring — the only two M2 implementation
  tasks the debug menu's own evidence report reads from/toggles).
- `requiredPaths`: `["packages/game/src/xp.ts", "packages/game/src/expedition2.ts",
  "apps/server/src/mutation.ts", "apps/server/src/repositories/heroRepository.ts",
  "apps/server/src/repositories/accountRepository.ts", "apps/server/src/services/equipmentService.ts",
  "apps/server/src/services/heroService.ts", "apps/server/src/services/dungeonService.ts",
  "apps/server/src/services/bossService.ts"]`.
- All 9 paths confirmed present in this checkout. `M2-28`/`M2-29` deliberately excluded: the debug
  menu's report cites them only as testing context, not as a read/depend relationship, and `M2-29`
  (`a867fc75-35b7-4c84-aeec-c83e9510d66f`) is still `in_progress` — unsafe to depend on.

### 2. `1427c61d` — Spec: class/secondary-class respec (M3 candidate)

- `dependencyIds`: `["6ef9c4fa-eccb-4037-b71d-9f6d076e8e48", "59b18bb7-c08d-4ac2-8d26-5d4d1f3af241"]`
  (`[M2-22]` "Specify combat v2, class roster, dual classes, skills and formation"; `[M2-23]`
  "Specify gear rarity, affixes, crafting, reforging and dungeon rewards" — resolved from the live
  dashboard task list by title/owner/date match, since `design/game/reports/M2-23.md` carries no
  Task ID line. Both `approved`.)
- `requiredPaths`: `["design/game/classes.md", "design/game/economy/gear.md",
  "design/game/economy/baseline.md", "design/game/economy/tuning.md"]` — all four committed,
  M2-dated 2026-10-23, confirmed present.

### 3. `e6bc8b74` — Class/skill codex — M3 candidate

- `dependencyIds`: `["6ef9c4fa-eccb-4037-b71d-9f6d076e8e48"]` (`[M2-22]`, the frozen class/skill data
  this report is built on).
- `requiredPaths`: `["design/game/reports/M2-22.md", "design/game/classes.md",
  "design/studio/milestones/M2.md", "design/game/reports/m3-mid-expedition-loadout-change.md",
  "design/studio/reports/cycle-duration-feasibility.md", "design/game/reports/m3-class-respec.md"]`
  — exactly the docs `design/studio/reports/class-skill-codex-m3-candidate.md` cites and reads, all
  confirmed present.

## Running-task check (2026-10-23, this session)

`M2-29` (`a867fc75-35b7-4c84-aeec-c83e9510d66f`, independent M2 playtest) and `M2-30`
(`72001eaf-a460-4053-9ca0-4888f1a9f07f`, M2 verdict/M3 plan) are both `in_progress`. Neither of the
three corrected tasks is made a prerequisite of either, and no dependency added here points at an
unapproved or unintegrated task. None of the three tasks are added as a prerequisite of any M2
acceptance check; all three remain M3 candidates.

## Outcome

Verified and recorded the exact target `dependencyIds`/`requiredPaths` for all three flagged tasks,
including resolving `M2-23`'s task ID from the live dashboard (`59b18bb7-c08d-4ac2-8d26-5d4d1f3af241`).
No edit was made to `planning/milestone.json` (it does not govern these ad-hoc tasks and editing it
would not reach them). No PATCH was attempted by this agent, consistent with the confirmed capability
gap. Applying the three corrections above requires the owner's action through the dashboard's
supported API, as was done previously for `c5bd2700`.
