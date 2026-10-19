# M1 delivery order

The task registry in `planning/milestone.json` is authoritative for dependency edges and acceptance criteria. Dashboard statuses track execution. Everything begins staged; planning completion is not game completion.

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
