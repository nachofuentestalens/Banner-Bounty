# Server-computed effective stats — prerequisite report

Task: `e4dc20cd-2287-4423-8328-ddef955cce47`
Date: 2026-10-18
Status: Blocked before implementation.

## Changes

Added this evidence report only. No server or web files changed.

## Prerequisite evidence

The task requires reading the effectiveStats proposal after owner acceptance (or its merged contract). The committed `design/studio/contracts.md` still defines Hero without effectiveStats and contains no occurrence of effectiveStats. Its opening paragraph requires a recorded decision for contract shape changes. `design/decisions.md` contains no approval of this extension. Approval outside this worktree has not been verified; the accepted contract must be integrated before implementation proceeds.

## Commands and results

- `git status --short`: exit 0, initially clean worktree.
- `Get-Content AGENTS.md; Get-Content design/studio/architecture.md; Get-Content design/studio/tech-stack.md; Get-Content design/decisions.md`: exit 0; read ownership rules, architecture and decision log.
- `rg -n 'effectiveStats|Hero|equipment/equip|specialization' design/studio/contracts.md`: exit 0 for existing Hero/endpoint matches; no effectiveStats match.
- `Get-Content design/studio/contracts.md -TotalCount 94`: exit 0; confirmed existing Hero and account/equipment/specialization response contracts.
- `git log -1 --format="%h %s" -- design/studio/contracts.md`: exit 0; latest contract commit `fa64faf WIP: End of agent run`.
- `git ls-files --error-unmatch design/studio/contracts.md`: exit 0; contract is tracked.
- Read `apps/server/src/services/partyLoadout.ts`, first 100 lines of `arenaService.ts`, and `apps/server/package.json`; located buildAccountState via bounded search. Existing arena publishing uses computePartyEffectiveStats with toFrozenMembers, which is relevant to the requested party Pathfinder bonus coverage.

## Acceptance status

- Account state exposes server-computed effectiveStats: not implemented or verified.
- Equip, unequip and specialization responses expose effectiveStats: not implemented or verified.
- Gear, specialization and party Pathfinder numeric coverage: not implemented or run.
- Derived stats remain read-only and unpersisted: not verified for the proposed extension.
- Do not modify apps/web: satisfied; no web edits in this run.

No build, runtime or test checks run because implementation is blocked. No command was refused.

## Unresolved issue and next task

Owner must accept and integrate the existing contract proposal into this task's execution baseline. Do not create a duplicate prerequisite task. Resume this same task afterward: implement shared server-side stat decoration, cover all four responses and meaningful numeric/idempotency invariants, run focused tests and build checks, and update this report. UI consumption remains a separate follow-up outside this task's scope.
