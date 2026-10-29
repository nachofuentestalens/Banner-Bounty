# Three-feedback correction handoff: verified owner exemption

Date: 2026-10-29. Owner: Game Director. Task: `14e8578f-ce7a-4838-addd-81fb2bd972b9`.

## Disposition

Complete for review under the later explicit owner resolution, not as an applied metadata correction. All three live records still have empty dependencyIds and requiredPaths. No PATCH, task creation, restart, review approval, or scope change was performed.

The current task's correction request was posted at 2026-10-23T11:21:39.004Z. Subsequently, on correction task `53719103-4dfc-4494-8fd9-88d8ea4ecb68`, owner message `19491599-c01c-4566-90dc-3dd93d6b25e1` at **2026-10-23T12:45:20.176Z** states:

> No metadata change is needed. All three tasks (222017b3, 1427c61d, e6bc8b74) are already approved and merged; dependencyIds/requiredPaths only gate when unstarted work may be scheduled, and the dashboard deliberately refuses edits to an approved task's prerequisites. Your report in design/studio/reports/dependency-correction-m3-candidates.md is the record. If any of these are reopened later for M3 work, apply the recorded targets before restarting them. This task is closed by the owner.

This resolution is preserved in the live task transcript, not design/decisions.md. I treat this later, specifically scoped owner decision as superseding the earlier demand to mutate these approved records. I did not attempt a prohibited edit to reproduce the refusal. The Producer's earlier claim of a general API capability gap is not independently established by this review and is not the reason for leaving metadata unchanged.

## Existing Producer work

- `53719103-4dfc-4494-8fd9-88d8ea4ecb68` is now **closed / idle**. Read its transcript and committed report using `git show a5875352d5fcfc2be75e93b42a37eea5b421d941:design/studio/reports/dependency-correction-m3-candidates.md`. Its workspace has no approvedCommit or mergeCommit; do not claim that report was integrated. The future-reopening targets are reproduced below to preserve them in this task's deliverable without editing the Producer's report.
- `08adcf41-a367-44dc-b87b-19437e61758b` is now **approved / idle**, integrated at `caadba311c556c36ef9b555d40e7f6a44aa7fbe7`. Its report concerns three DIFFERENT tasks: skill help, deferred loadout, and cycle duration. Its exemptions are not substituted for this task's specific owner resolution. No duplicate correction work or messages were dispatched.

## Exact resulting live state

Re-read via `Invoke-RestMethod http://127.0.0.1:5190/api/tasks/<id>` on 2026-10-29:

```json
[
  {"id":"222017b3-c9bf-464f-8d52-398ffaefd299","stage":"approved","dependencyIds":[],"requiredPaths":[]},
  {"id":"1427c61d-83e2-4d18-84c8-19e178ce53ff","stage":"approved","dependencyIds":[],"requiredPaths":[]},
  {"id":"e6bc8b74-aff8-4130-9950-3f53573a28b4","stage":"approved","dependencyIds":[],"requiredPaths":[]}
]
```

These are observed arrays, not the targets below. No corrections were applied.

## Recorded targets, only if reopened before restart

```json
[
  {
    "id":"222017b3-c9bf-464f-8d52-398ffaefd299",
    "dependencyIds":["9f0dccab-1c69-4df9-88e8-7a1977a7e126","ae4866f3-8c46-4142-bf70-c901d5d57d37"],
    "requiredPaths":["packages/game/src/xp.ts","packages/game/src/expedition2.ts","apps/server/src/mutation.ts","apps/server/src/repositories/heroRepository.ts","apps/server/src/repositories/accountRepository.ts","apps/server/src/services/equipmentService.ts","apps/server/src/services/heroService.ts","apps/server/src/services/dungeonService.ts","apps/server/src/services/bossService.ts"]
  },
  {
    "id":"1427c61d-83e2-4d18-84c8-19e178ce53ff",
    "dependencyIds":["6ef9c4fa-eccb-4037-b71d-9f6d076e8e48","59b18bb7-c08d-4ac2-8d26-5d4d1f3af241"],
    "requiredPaths":["design/game/classes.md","design/game/economy/gear.md","design/game/economy/baseline.md","design/game/economy/tuning.md"]
  },
  {
    "id":"e6bc8b74-aff8-4130-9950-3f53573a28b4",
    "dependencyIds":["6ef9c4fa-eccb-4037-b71d-9f6d076e8e48"],
    "requiredPaths":["design/game/reports/M2-22.md","design/game/classes.md","design/studio/milestones/M2.md","design/game/reports/m3-mid-expedition-loadout-change.md","design/studio/reports/cycle-duration-feasibility.md","design/game/reports/m3-class-respec.md"]
  }
]
```

## Approval and integration evidence

`GET /api/projects/c6faaeda-b5c2-4d67-b351-1e1dd9f594a7/delivery` reports approved baseline `526effd349fa43ef7386213126ae196464b6a741`, approvedAt `2026-10-29T13:22:31.581Z`. `git -C ../.. rev-parse HEAD` returns that same commit. Branch remains `agent/task-14e8578f-ce7a-4838-addd-81fb2bd972b9`.

Each record below was read live; each stage was approved. For every listed merge commit, `git -C ../.. merge-base --is-ancestor <mergeCommit> HEAD` returned **0**. Approval alone was not used as proof of integration.

| Record | Task ID | Verified merge commit |
| --- | --- | --- |
| M2-22 | 6ef9c4fa-eccb-4037-b71d-9f6d076e8e48 | 4f7147eb44565c66735a0771f9b69b440744ba48 |
| M2-23 | 59b18bb7-c08d-4ac2-8d26-5d4d1f3af241 | 229ed8087919fb59feb6ccd56ef087ee918ec6ca |
| M2-26 | 9f0dccab-1c69-4df9-88e8-7a1977a7e126 | 947e9d50e411d62c4dee20c72a1bc3c633f9e8f3 |
| M2-27 | ae4866f3-8c46-4142-bf70-c901d5d57d37 | 9e740ffcc216b5a3f68b694a0d989d7debb860e9 |
| Debug menu | 222017b3-c9bf-464f-8d52-398ffaefd299 | f4d8d4b903d1bcdc3c73052d07f4ee9c24308961 |
| Respec spec | 1427c61d-83e2-4d18-84c8-19e178ce53ff | 9dfd8ed26492f567c29812b58f5650b31908a75f |
| Codex routing | e6bc8b74-aff8-4130-9950-3f53573a28b4 | f84aa7aa3b23e7466669af9068a1a74e39050f69 |
| Deferred-loadout spec | f4491607-20b6-413e-b20c-bc0f026479fb | c8ebd205253517c4b0b6f132b396e08512a5a423 |
| Cycle-duration spec | 9fa4109a-92c5-4c03-85d7-406189c0f218 | 8391e5604797d22bb6b9222e8e76db36b72c18e7 |
| Separate Producer correction | 08adcf41-a367-44dc-b87b-19437e61758b | caadba311c556c36ef9b555d40e7f6a44aa7fbe7 |

For all **18 distinct paths** in the recorded targets, `git -C ../.. rev-parse HEAD:<path>` returned a blob hash with exit **0**. Thus the inputs are committed in the actual approved baseline, not merely present as local files. There are 19 entries across the three arrays because classes.md appears twice. M2-23's live title is `[M2-23] Specify gear rarity, affixes, crafting, reforging and dungeon rewards`, confirming the supplied UUID and approved/integrated state.

## Scope, limitations and next step

M2 acceptance and its dependency graph are unchanged. The debug menu is delivered local development tooling; respec and codex remain M3 candidates, not new M2 acceptance requirements. No implementation, design freeze, or acceptance verdict was altered. No runtime tests were needed or run for this documentation-only verification, and no playtest or game-build success is claimed.

Initial read of design/studio/AGENTS.md failed because that path does not exist; the repository-root AGENTS.md was then read successfully. No command was refused. The three original scheduling arrays remain empty by owner exemption; this does not establish that their original scheduling was correct. Future reopening must apply the recorded targets and recheck readiness before restart.

Next: agent review of this resulting-state evidence and the later owner exemption. No additional task is needed. Review/integration remains the dashboard's responsibility; this report does not self-approve.
