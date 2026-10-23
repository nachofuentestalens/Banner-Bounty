# AgentDashboard operating guide

This setup uses the live local API at `http://127.0.0.1:5190` for project `c6faaeda-b5c2-4d67-b351-1e1dd9f594a7` (Banner & Bounty). It changes project-owned role/task records only, never AgentDashboard source or its SQLite database directly.

## Configured features

- Existing departments and eight roles have milestone-specific briefs and small context-document lists.
- Each required role has one seat available; all tasks are staged idle, without inference runs.
- Real role-assigned tasks have priorities, effort suited to scope, 1,000,000 reported-token / 80-tool-call checkpoints and automatic use of a valid phase handoff.
- Task instructions are stored using the dashboard's manual compact-handoff endpoint. Open Context & usage to inspect them. The complete briefs also appear in `backlog.md`.
- Documents under `design/` appear in the native document browser. File edits are visible on refresh; git history appears only once those files are committed.
- Department folders describe ownership. QA additionally owns `design/qa/` and `tests/e2e/`.
- Existing provider/model choices are preserved. Role/task effort is low for bounded copy/review and medium for design or implementation; every run still reassesses actual complexity. No exact price ranking is assumed.
- QA Player is read-only (read/glob/grep, no shell/browser) and cannot build, start or play the game; routing daily hands-on browser playtests to it reliably produces NOT PLAYED. Hands-on browser playtests (daily and milestone acceptance) route to QA Tester instead — see `design/studio/roles.md`. The owner decided 2026-10-23 to repoint the recurring "QA daily playtest" automation to QA Tester (option a); that repoint is an AgentDashboard Roles/automation panel setting, not a repository or task-graph change, so it still needs to be applied in that panel.
- Existing global concurrency remains one; all departments remain `ask`. No role task starts merely because its record or seat exists.

## Dependencies: native delivery flow (primary)

The dashboard now runs each task in an isolated worktree branched from an approved project baseline, and holds tasks on native `dependencyIds` (prerequisite tasks approved and integrated into the baseline) and `requiredPaths` (inputs committed in the task's checkout). Priority only orders tasks that are already ready. Agents see only committed baseline files: uncommitted files in the live checkout are invisible to them, which is what blocked the first M1-04/M1-06 runs.

Setup and use (Delivery view / `/api/projects/:id/delivery`):

1. **Baseline:** snapshot the project files (including `planning/milestone.json` and `planning/dashboard-state.json`) and approve the preview. Existing task worktrees are merged up to the new baseline automatically before their next run.
2. **Import plan:** prepare and approve the plan preview. It reads both planning files from the baseline commit and sets each task's `dependencyIds` from `dependsOn` and `requiredPaths` from `AGENTS.md` + `inputs` + prerequisite deliverables. Previously finished tasks move to `needs_review`, interrupted ones back to `backlog`.
3. **Review/integrate:** approve each finished task and integrate its checkpoint into the baseline; only integrated work unlocks dependants.
4. **Enable delivery:** starts ready backlog tasks one at a time (global concurrency one).

After editing `milestone.json` dependencies or adding tasks, run `validate`/`sync` from the live checkout, commit both planning files into the baseline, and import the plan again.

## GitHub remote

`origin` is `https://github.com/nachofuentestalens/Banner-Bounty.git`, authenticated through Git Credential Manager on this machine. The remote lives in the shared repository config, so every task worktree sees it. Agents push only their own `agent/task-<id>` branch (`git push -u origin HEAD`). The dashboard's end-of-run WIP commits happen after the agent stops, so the coordinator republishes task branches with `git push origin "refs/heads/agent/*:refs/heads/agent/*"`. After the owner integrates work in the live checkout, they push `main` from there. Nothing is force-pushed.

## Legacy local helper

`scripts/dashboard.mjs` predates native dependencies. It still validates the registry offline and syncs role/task records, but it only works from the live checkout (it checks the project's `repoPath`). Its `status`/`start`/`complete` review markers are separate from the dashboard's native review; prefer the native flow above.

```powershell
node scripts/dashboard.mjs validate
node scripts/dashboard.mjs sync
node scripts/dashboard.mjs status
node scripts/dashboard.mjs start M1-01
```

`validate` is offline: checks IDs, ownership, dependencies/cycles, input/output paths, acceptance and report scopes, then refreshes the generated backlog. `sync` is idempotent: maps roles, updates their briefs/context, provisions missing idle seats, creates missing tasks without messages, and seeds briefs only for tasks with no runs/messages. It will not replace an active task's context or reset usage. Existing task/provider settings are preserved on subsequent syncs.

`start ID` checks that dependencies are done and have reviewed reports, that the task is idle and has no previous runs, that its role has an available seat, and that no other project task is running/queued/waiting. It then sends one bounded task prompt. It does not monitor, chain successors or spend model calls polling. Resume an incomplete existing task in the dashboard rather than starting it again with this command.

When the owner asks a coordinating plain chat to launch a task, that chat can use `start ID --coordinator TASK_ID` with its own dashboard task ID. The exemption accepts only an existing plain chat in this project, never another role worker. The coordinator must stop editing and yield immediately after dispatch; it is not permission to work in parallel.

After inspecting the deliverables and acceptance evidence, the coordinator may run:

```powershell
node scripts/dashboard.mjs complete M1-01
```

`complete` requires an existing report, all specified deliverables, reviewed done prerequisites, and a latest successful work run. It records a coordinator review in the local mapping and marks the task done; it cannot judge truth of evidence. The coordinator must actually review the report and unresolved issues first. For failures, reopen/retain the task, give it a focused follow-up, and recheck only affected behavior. The report is not a substitute for QA.

The native runner automatically marks a successful role run done when it has no open question or phase handoff. Therefore native done alone never unlocks this helper's dependencies. `complete` records the report hash and task update timestamp; changed reports or later task updates invalidate that review. `status` distinguishes REVIEW (native done) from ACCEPTED (evidence reviewed). Code changes outside a task's report cannot automatically invalidate every downstream acceptance: the coordinator must reopen affected tasks explicitly.

## Use other features when they solve a real problem

- **Compute:** inspect active/queued runs and accumulated usage after each gate; pause a role if needed. Do not use Force to bypass an unresolved dependency, budget or emergency.
- **Context & usage:** use a six-field phase handoff for long work; prefer manual summaries already written by the agent to paying for an extra summarization run. Automatic compaction only applies to later messages and does not run the next phase by itself.
- **Inbox/proposals/questions:** use for genuine scope or ownership decisions. Existing defaults authorize normal work. Do not turn each implementation choice into an inbox approval.
- **Feedback/triage:** record real playtest findings after M1-14; triage grouped issues to an existing owner/task. Triage can start a model run, so do not use it for empty demonstration data.
- **Emergency:** only build/startup failure or data loss that must freeze other work. Fix it and clear/close the emergency before resuming.
- **History:** preserve transcripts, useful reports and git history. Do not delete failed evidence to make the board look complete.

## Limits and recovery

Reported-token/tool allowances are approximate execution checkpoints, not billing caps. Dollar cost is not reported by Codex and cannot cap its subscription use. Plain chats can bypass scheduler controls; avoid running parallel plain chats against this checkout. Saved Claude roles remain Claude until the owner changes them; this setup has not run provider authentication checks or paid test calls.

If the API is offline, documents/tasks remain in the repository; rerun sync after the dashboard is available. Mappings are written after each created task so retries do not normally duplicate records; titles containing `[M1-XX]` provide recovery if a response is lost. No messages are resent automatically. A local dispatch lock prevents two copies of the helper launching simultaneously; a stale lock reports its path for deliberate recovery after checking no helper is running.

The plan helper uses no credentials, no external network endpoint, no database bypass, and no changes to unrelated projects or global settings. Do not put private provider settings or transcripts in the repository.
