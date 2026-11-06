# Delivery stall investigation — 2026-11-06

Task: 58d40622-078f-483d-8d77-d229a9a2d456. Status: partial; the Baseline queue wait is not cleared.

## Findings and acceptance evidence

- Required first command `node scripts/recover-delivery.mjs` exited 0: no stale checkpoints and no SKIP entries. Integration of approved QA task 51e027a2-e0f3-42d9-a814-3eed365771c1 returned HTTP 409 because this project's agent is running. Exit 0 is not successful integration.
- GET `/api/projects/c6faaeda-b5c2-4d67-b351-1e1dd9f594a7/delivery` reports baseline **c3313494584e430cf99ecbeebda621a05ce4cc7e**. `git ls-tree c331349 design/studio/reports/M3-02-accepted.md` confirms committed blob f7b69ddd55a0a398d9a6f29aeb482857cf511a3d. Marker presence: PASS, predates this run.
- `git show --stat 0c83ada` identifies the existing merge of b05313b and 4f4c271. `git diff b05313b 4f4c271 -- design/studio/release-verdict.md` is empty. The suspected duplicate-marker conflict is not the remaining problem.
- GET `/api/tasks/750646bf-b613-4ff5-93eb-f33545a3f0d2` identifies the actual queued Baseline wait. Its checkpoint is 726672b53a801c96237fcab5d061008fd264f619, approvedCommit is null, and workspace.error is null. Its queued run records conflicting release-verdict blobs: ancestor 402711b469f67727b4b0890e4c9ffed56803db8e; task 8d016240972e48d3ddbbfcb0099000900dc908b8; baseline 1a9d41001dbc84e7333a80618e90742b645a9d37. M3-02.md auto-merges according to that diagnostic.
- `git diff 726672b c331349 -- design/studio/release-verdict.md` confirms an older rejected/held verdict overlaps the newer conditional-pass introduction. This is distinct from the two marker commits. No evidence establishes a dashboard defect.
- Read-only status checks of the live checkout and preserved 750646bf and 51e027a2 task checkouts returned clean. Initial plain `git -C ... status --short` calls were refused for dubious ownership; command-local `-c safe.directory=<exact checkout>` allowed inspection without changing global configuration.
- GET task details for all six queued tasks: one Baseline wait (750646bf), two M3-07 approval waits (M3-08 and M3-12), two M3-09 approval waits (M3-10 and M3-11), one M3-08 approval wait (M3-09). No approvals bypassed. Queue-clear acceptance: NOT PASSED.

## Reviewable resolution and limits

`delivery-stall-release-verdict-candidate.md` beside this report is a proposed complete merged document, not an applied change to the authoritative document. It retains the current conditional-pass introduction and single marker section, archives the entire earlier recovery introduction with an explicit supersession note, and preserves the existing M2/M1 historical suffix. Node assertions comparing the candidate with Git blobs c331349 and 726672b passed for each of those preservation properties and absence of conflict markers.

The actual conflicting branch belongs to existing Game Director task 750646bf. This task may write only its own isolated worktree; editing or merging that other checkout would violate the explicit task restriction. Its checkpoint is also unapproved and in progress, so it is not eligible for the integrate API (confirmed by read-only inspection of delivery.ts). Merely adding a candidate in this branch cannot fix that branch's ancestry. No branches were switched, histories rewritten, worktrees deleted, or dashboard files edited.

`git merge-tree --write-tree c331349 main` could not run: object creation in the shared live repository was denied by filesystem permissions. No merge result is claimed. GET `/api/runs` returned 404; per-task runs provided the queue evidence instead. No game build/test was needed or claimed for these report-only changes.

## Detached recovery and next step

Started the explicitly requested bounded detached helper using hidden `Start-Process` with Node arguments `scripts/recover-delivery.mjs --wait`, PID 866144. It retries already-approved integration through the documented API for up to 45 minutes, preserving normal approval guards. Logs are outside the repository at `%TEMP%/banner-bounty-58d40622-recovery.stdout.log` and `.stderr.log`; no live-written log will be committed. This finite recovery helper is intentionally handed off, not a game server. Its success remains unverified while this run holds the agent lock. The QA task also reports unsuccessful/missing GitHub checks; those must not be bypassed.

Continue existing task 750646bf in its own authorized worktree with the candidate, resolving its baseline update and retaining both historical accounts. Checkpoint/review through normal delivery; do not duplicate that task. Then inspect the detached helper logs and current delivery/queue APIs. Record the resulting baseline commit and verify no queued run retains a Baseline wait. Other M3 step approvals remain separate triage. No new baseline commit resulted from this run.

## Continuation verification

The subsequent continuation again ran `node scripts/recover-delivery.mjs` first: no stale checkpoints or SKIP entries; the same approved QA integration returned agent-lock HTTP 409. The detached helper PID 866144 remained alive, with only those 409 retries in its log and no stderr output. No second helper was launched.

Fresh delivery and per-task API reads confirmed baseline c3313494584e430cf99ecbeebda621a05ce4cc7e, the same release-verdict conflict for 750646bf, and the same five dependency waits. `git ls-tree` again confirmed the acceptance marker. No integration success or queue clearance is claimed.

The continuation asks to apply changes in task 750646bf but explicitly retains the restriction to task 58d40622's isolated worktree. Those instructions cannot both be satisfied here, and the filesystem grants writes only to this task's checkout. The prepared candidate is ready for the existing task's authorized recovery context. Re-running this task under unchanged restrictions cannot apply it; route the continuation to the existing task rather than creating a duplicate task or repeatedly resuming this one. The helper only considers approved checkpoints, so it cannot resolve 750646bf's unapproved conflicting checkpoint.

## Routing attempt: dashboard lifecycle blocks handoff

On the next explicit routing request, recovery again reported no stale checkpoints and active-project HTTP 409 for the unrelated approved QA integration. Read-only inspection of the documented task routes confirmed `/compact` saves handoff instructions but requires an idle task; task PATCH does not expose a handoff field.

Attempted to stop only blocked queued run 499e0c47-2272-4e9a-9f6a-5f50b235fb28, save a recovery handoff preserving the prior handoff, and retry the same task. Initial PowerShell POSTs without JSON content type returned Unsupported Media Type; the compact request returned the queued-task HTTP 409. Retried with explicit JSON bodies and sequential fail-fast requests: POST `/api/runs/499e0c47-2272-4e9a-9f6a-5f50b235fb28/stop` returned `{ "ok": true }`, but the following POST `/api/tasks/750646bf-b613-4ff5-93eb-f33545a3f0d2/compact` returned HTTP 409, `An agent is already working on this task. Wait for it or stop it first.` The sequence stopped there; no successful explicit retry or handoff save occurred.

Readback confirms the original queued run is stopped and a replacement run 61024cf0-47b5-442a-bf66-bd55789a6d67 is queued on the same task with the identical Baseline conflict. The dashboard requeued the task before handoff editing became available. This is concrete evidence of a recovery lifecycle limitation: stop does not provide a stable idle window for the supported handoff endpoint. No global scheduling settings, task prerequisites, approval states or dashboard source were changed. No duplicate task was created.

Routing is NOT complete. Dashboard administration must provide a supported stable idle/recovery context for existing task 750646bf, or an authorized conflict-resolution facility before its agent starts. Repeating stop/compact under unchanged conditions is not a resolution. The reconciliation artifact remains ready; all original acceptance checks remain incomplete except marker presence and candidate preservation.
