# Banner & Bounty: agent map

Build the first playable milestone described in `design/studio/vision.md`. This repository starts with a delivery plan; the game has not been implemented yet.

## Read only what the task needs

- `design/studio/priorities.md`: milestone gates and execution order.
- `design/studio/roles.md`: ownership and handoff rules for the eight dashboard roles.
- `design/studio/tech-stack.md` and `design/studio/architecture.md`: implementation boundaries.
- `design/game/first-playable.md`: gameplay defaults and scope.
- `design/game/interface.md`: interface direction and graphics extension points.
- `design/qa/acceptance.md`: observable milestone acceptance checks.
- `design/studio/dashboard.md`: actual dashboard capabilities, limitations, and commands.
- `planning/milestone.json`: authoritative task definitions and dependencies; use a single task entry, not the entire backlog, for execution.
- `design/studio/backlog.md`: generated human-readable task briefs.
- `planning/dashboard-state.json`: milestone-ID → dashboard-task mapping, imported with `milestone.json` to set native dependencies; task status lives in the dashboard.

## Work contract

1. Read this map, the assigned task, and its listed inputs. Do not scan the entire repository or dashboard source again.
2. Use the task's owner and file scope. Each task runs in its own dashboard worktree branched from the approved project baseline; never switch branches or edit the live checkout. Do not launch subagents or create duplicate/delegated tasks for the existing backlog.
3. Verify prerequisites before implementation: the dashboard holds a task until its `dependencyIds` are approved and integrated and its `requiredPaths` are committed in the worktree. If a listed input is still missing, stop and report it as blocked; do not author a prerequisite's deliverable yourself.
4. Make routine reversible implementation decisions within the documented scope. Record meaningful decisions in the owning document. Escalate only scope/vision changes, paid services, destructive actions, or genuine contradictions.
5. Game logic is deterministic and independent of UI/database. The server owns time, inventory, rewards, and combat results. Never trust client-reported progression.
6. Read/search narrowly, bound output, and run focused checks. Do not repeat passing broad checks without a relevant change. A required check that cannot run is a limitation, not a pass.
7. No cloud service, paid dependency, public deployment, dashboard source modification, or speculative feature work is required for M1.
8. Each completed task leaves its specified report: changes, acceptance evidence, commands/results, unresolved issues, and next task. Save work in the task worktree; do not claim a successful CLI run proves acceptance. The owner reviews the task and integrates it into the baseline; only then do dependent tasks see its files.
9. At a phase boundary with work left, provide the dashboard's six-field context-handoff JSON. Preserve provider/session context where useful; reassess effort for the actual task. Do not infer prices from model catalog order.
10. Keep architecture notes current when contracts change. Do not edit `design/decisions.md`; AgentDashboard owns that decision log.
11. Submit work to GitHub (`origin` = `https://github.com/nachofuentestalens/Banner-Bounty.git`, shared by every worktree): commit in your task worktree, then `git push -u origin HEAD` to publish your own `agent/task-<id>` branch. Never push to `main`, force-push, or push another task's branch; `main` changes only through the owner's dashboard integration. Never commit secrets, `.env` files, databases, `node_modules/` or build output. If the push is refused or offline, report it as a limitation; the dashboard's end-of-run WIP commit is published by the coordinator.

## Commands available now

`node scripts/dashboard.mjs validate` checks the plan locally. `sync` stages dashboard tasks without running inference. `status` shows readiness. `start M1-01` starts exactly one task after dependency and activity checks. See the dashboard guide before using start or complete.

Game build/test commands are planned in the tech-stack document and do not exist until M1-05. Never report them as already passing.
