# Obsolete recovery continuation reconciliation

Date: 2026-11-07. Owner: Game Director.
Task: `f156da76-5790-4545-a6c4-80fbafa25a31`.
Task base: `b294d17d2ffc82af3d607f1f64a4e3b740ea433b`.

## Disposition and changes

The old recovery task `750646bf-b613-4ff5-93eb-f33545a3f0d2` no longer has a valid
instruction to reopen merged M3-02 or hold M3-07. Reviewed the committed M3-02 report,
acceptance marker and release verdict, plus live task/workspace records. Marker task
`5b919139-a70e-445d-b9d8-223b34657cdf` is approved with approved/merge commit
`c3313494584e430cf99ecbeebda621a05ce4cc7e`; M3-07 is approved with approved/merge
commit `068311115de90798d1e9b91eebe6bc778f0cf2f9`.

Updated the release verdict's stale marker hold and priorities' current gate. Historical
verdicts and the M3-02 report are retained. Conditional acceptance permits production
sequencing only: fresh/legacy SQLite progression remains M3-08's evidence obligation,
with real migrations, controlled clock/RNG, preservation and reopen/retry checks;
M3-11 independently verifies it and M3-12 cannot grant full progression acceptance without
it. Check 4 identification and check 12 literal solo improvement remain open P2s.
Bounded balance evidence, withheld full M2 acceptance and absence of an enjoyment verdict
are unchanged. No new gameplay evidence or playtest is claimed.

## Commands and observed results

- `node scripts/recover-delivery.mjs`: exit 0; no stale approved checkpoints.
  Unrelated QA task `51e027a2-e0f3-42d9-a814-3eed365771c1` integration returned HTTP 409:
  wait for running agents/checkpoint operations before changing the baseline. No SKIP.
- `git ls-files --error-unmatch design/studio/reports/M3-02-accepted.md design/studio/reports/M3-02.md design/studio/release-verdict.md`:
  exit 0. All required inputs are tracked in this clean starting baseline.
- `GET /api/tasks/:id` for this task, obsolete recovery, marker and M3-07 succeeded.
  Old recovery was queued with its stale handoff; marker and M3-07 were approved/integrated.
  Project task-list GET showed M3-08 `needs_review`, `idle`; no change was made to it.
- `PATCH /api/tasks/f156da76-5790-4545-a6c4-80fbafa25a31` with the requested dependency
  and three required paths was refused: `Stop the task before changing prerequisites.`
  Read-back confirms this running task still has empty arrays. This is an application
  restriction, not shell permission denial. Prerequisite evidence was verified manually.
- After reviewing the superseding dispositions, `POST /api/runs/61024cf0-47b5-442a-bf66-bd55789a6d67/stop`
  with JSON `{}` succeeded. GET read-back: run `stopped`, old task `idle`.
  Initial invocation without JSON content type returned `Unsupported Media Type`; corrected.
- On the now-idle old recovery task, PATCH succeeded and read-back verified
  `dependencyIds: ["5b919139-a70e-445d-b9d8-223b34657cdf"]` and
  `requiredPaths: ["design/studio/reports/M3-02-accepted.md", "design/studio/reports/M3-02.md", "design/studio/release-verdict.md"]`.
- `POST /api/tasks/750646bf-b613-4ff5-93eb-f33545a3f0d2/compact` replaced the stale
  continuation with the reviewed supersession, no-restart instruction and retained deferrals.
  GET read-back verified that handoff. No messages or new inference runs were dispatched.
- A narrow wildcard search failed because PowerShell passed an unsupported path glob to rg;
  no conclusions rely on that search.

## Limits and next action

The obsolete continuation is stopped and corrected, but its task record remains
`in_progress`/`idle`. This is not a claim of formal archive, conflict repair, approval or
integration of its draft. The task brief reports a baseline content conflict in
`design/studio/release-verdict.md`; supported stop/PATCH/compact controls do not reconcile
that checkout, and `dashboard.md` documents no conflict-resolution or history-preserving
retirement endpoint. No dashboard source/database edits, reset, merge, checkout removal,
or attempt to reopen merged M3-02 was made. Both worktrees and history are preserved.

Review and integrate this task's reconciled documents normally. Dashboard administration
must formally retire the old task without publishing its superseded REJECT if idle/stopped
status is insufficient; that operation cannot be completed through the documented controls.
If this task's own dependency metadata must be persisted, apply the same requested arrays
after its run stops. Do not restart this task merely to retry an active-task PATCH.
Leave M3-08's existing CTO review queued for usage clearance and follow the existing graph;
no duplicated milestone or recovery task is needed.

Documentation-only work: no build, simulation, game server or watcher was needed or started.
Assigned branch retained. Only studio files changed; no game runtime claim is made.

Final verification: `git diff --check` exited 0 (line-ending notices only). Inspected
`git diff b294d17d2ffc82af3d607f1f64a4e3b740ea433b -- design/studio/release-verdict.md design/studio/priorities.md`
and `git status --short`: the two reconciled documents plus this new report are the complete
task change; no earlier task-branch changes existed. All conditional-evidence paragraphs and
historical M2/M1 verdicts remain intact. No source/build tests were warranted by these edits.
