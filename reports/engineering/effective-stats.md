# Server-computed effective stats — evidence report

Task: `e4dc20cd-2287-4423-8328-ddef955cce47`
Date: 2026-10-18
Status: Implemented.

## Prerequisite resolution

The task's committed `design/studio/contracts.md`/`design/decisions.md` in this worktree still lacked the `effectiveStats` extension (confirmed again this run: no match for `effectiveStats` in either file, and `design/decisions.md` has only 23 lines, two unrelated M1-04/M1-06 entries). The owner's "Accepted" answer to this task's prerequisite question pointed at an approval that had landed on `main` but not into this task's branch:

- `git log --oneline HEAD..main` shows `main` has commits `10db903` ("Update design/studio/contracts.md (proposal by Gameplay Programmer)") and `36d0e78` ("Record decision: Add server-computed effectiveStats to account/state and equip responses"), both authored 2026-10-18, after this task's branch point.
- `git diff HEAD main -- design/studio/contracts.md` and `-- design/decisions.md` show these commits are purely additive (no deletions) on top of this worktree's existing contract text, adding exactly the `effectiveStats: { maxHp, atk, def, spd }` field to `GET /account/state`'s `heroes` entries and to the `hero` object in `/equipment/equip`, `/equipment/unequip`, and `/hero/specialization`, computed via `packages/game`'s `computeHeroEffectiveStats` (combat.md 1.2), read-only/never persisted, plus a `Package interface consistency` clause making `apps/web`'s non-dependency on `contracts`/`game`/`content` explicit.
- A full `main` merge was not safe/appropriate: `git diff --stat HEAD main` shows ~14,700 lines of *deletions* going HEAD→main (this task's branch carries the full scaffold that `main` lacks), so `main` is not an ancestor-compatible integration target here. The accepted proposal's exact text was read directly from the two commits above instead, which is sufficient to confirm acceptance and the exact shape, without writing to `design/studio/contracts.md` or `design/decisions.md` (outside this task's write scope).

## Changes (apps/server only)

- `apps/server/src/services/partyLoadout.ts`: added `computeEffectiveStatsByHero(db, accountId, heroes)` and `attachEffectiveStats(db, accountId, hero)`, built on the existing `toFrozenMembers`/`computeHeroEffectiveStats`/`partyHasPathfinder` helpers already used by `arenaService.ts`/`bossService.ts`/`expeditionService.ts`. The party Pathfinder SPD bonus (combat.md 3.5: "the whole living party") is applied only to heroes who are currently one of the account's 3 party-order members; a benched hero's own stats never include it, even if the benched hero is itself Pathfinder-specialized.
- `apps/server/src/services/accountStateService.ts`: `buildAccountState` now attaches `effectiveStats` to every entry in `heroes` via `computeEffectiveStatsByHero`.
- `apps/server/src/services/equipmentService.ts`: `equip`, `unequip`, and `chooseSpecialization` now return `hero` wrapped with `attachEffectiveStats` (including their unchanged/no-op early-return paths, so idempotent replays and no-op mutations carry the same field). `HeroResult.hero` type updated to `Hero & { effectiveStats: EffectiveStats }`.
- `apps/server/src/app.test.ts`: fixed three pre-existing hand-built hero fixtures using the invalid raw `classId: "vanguard"` instead of the content package's actual ID `"class_vanguard"` (content.md/packages/content only define `class_vanguard`/`class_ranger`/`class_arcanist`). This bug was latent — `buildAccountState` never looked up `classId` before — and surfaced as a hard 500 once `GET /account/state` started calling `computeHeroEffectiveStats` (which does `getClassDefinition(classId)`) for every owned hero.
- `apps/server/src/progression.test.ts`: added `describe("server-computed effectiveStats (M1-10 contract decision)")` with two tests:
  - Asserts exact `effectiveStats` values through a level-1 baseline, after equipping `item_weapon_shortsword` (+3 ATK, no HP/DEF per content.md), after leveling to 3 and taking `spec_guardian` (+2 DEF per combat.md 1.2, stacked on leveled growth) via both the `/equipment/equip`/`/hero/specialization` response `hero.effectiveStats` and `GET /account/state`, and after unequipping (gear bonus drops, spec/level bonus persists).
  - Asserts the party Pathfinder SPD bonus: promoting the in-party Ranger to level 3 + `spec_pathfinder` adds +2 SPD to all three party members (Vanguard 8→10, Ranger 12→14, Arcanist 9→11) in both the specialization response and `GET /account/state`, while a 4th, owned-but-benched Ranger seeded directly via `HeroRepository.insertForFixture` with `specializationId: "spec_pathfinder"` at level 3 keeps its own base SPD (12) throughout — confirming the bonus is party-membership-gated, not just specialization-gated.

## Commands and results

- `npm install` (repo root, this worktree had no `node_modules`): exit 0, 186 packages added.
- `npm run build --workspace=packages/contracts --workspace=packages/game --workspace=packages/content --workspace=apps/server`: exit 0, all four `tsc --build` steps clean.
- `npx tsc --build apps/server/tsconfig.json` (after the service/test edits): exit 0, no errors.
- `npx vitest run --root apps/server`: first run (before the `app.test.ts` classId fix) — 1 failed / 47 passed, failure `TypeError: Cannot read properties of undefined (reading 'partyOrder')` in `app.test.ts`'s idempotency-conflict test, root-caused to the `ContentValidationError: Unknown classId: vanguard` thrown by the new `computeHeroEffectiveStats` call chain. After fixing the three `classId: "vanguard"` → `"class_vanguard"` fixtures: 50 passed / 50 (4 files), including the two new effectiveStats tests.

No command was refused.

## Acceptance status

- Account state exposes server-computed effectiveStats: done, verified by test (`progression.test.ts`, base/gear/spec/party-bonus cases).
- Equip, unequip and specialization responses expose effectiveStats: done, verified by test (same block, plus the pre-existing A05 equip/unequip test suite still passing unchanged).
- Gear, specialization and party Pathfinder numeric coverage: done — exact numeric assertions for shortsword (+3 ATK), Guardian (+2 DEF), and the Pathfinder party-wide +2 SPD (including the benched-hero exclusion case).
- Derived stats remain read-only and unpersisted: satisfied by construction — `effectiveStats` is computed per response from `toFrozenMembers`/`computeHeroEffectiveStats` at build time in `accountStateService.ts`/`partyLoadout.ts`; nothing writes it to the `heroes` table, and `HeroRepository` gained no new columns or setters.
- Do not modify apps/web: satisfied; no `apps/web` files touched this run.

## Unresolved issues

- `design/studio/contracts.md` and `design/decisions.md` in this task's branch still do not literally contain the `effectiveStats` text that exists on `main` (commits `10db903`/`36d0e78`) — those files are outside this task's write scope (Leadership-owned/`design/decisions.md`), so they were read from `main`'s commits rather than edited here. Whoever next merges or rebases this branch should confirm those two files end up carrying the `main` version so the frozen contract and this implementation stay in sync; no code or test in this report depends on that merge, since the exact field shape was already confirmed from `main`'s commits.
- This worktree had no installed dependencies at task start (`npm install` was required before any build/typecheck/test command would run); noting this in case other parallel-task worktrees hit the same cold-start state.

## Next task

None required by this task. A follow-up UI task (M1-10 continuation or similar) can now have `apps/web`'s Company/Inventory screens consume `effectiveStats` from `GET /account/state` and the equip/unequip/specialization responses instead of showing raw fields only.
