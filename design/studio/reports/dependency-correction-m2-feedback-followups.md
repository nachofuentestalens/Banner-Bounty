# Dependency/requiredPaths correction — 3 M2-feedback follow-ups — evidence report

Date: 2026-10-23 · Owner: Producer · Task ID `08adcf41-a367-44dc-b87b-19437e61758b`

## Scope

Verify and, where a supported mechanism exists, correct `dependencyIds`/`requiredPaths` on three
tasks flagged by Game Director triage of 2026-10-22 owner feedback (task
`7a015776-cebb-4909-b98b-efe2461d8ed6`, "Triage 5 feedback items"):

1. `c5bd2700-b2bc-4995-8741-16f5521c9d7b` — Add skill hover tooltips + damage breakdown to battle/build UI
2. `f4491607-20b6-413e-b20c-bc0f026479fb` — Spec: mid-expedition deferred skill loadout change (M3 candidate)
3. `9fa4109a-92c5-4c03-85d7-406189c0f218` — Feasibility spec: bind expedition cycle duration to real fight length (M3 candidate)

## Capability gap (confirmed)

`GET /api/tasks/:id` works for read-only verification. `scripts/dashboard.mjs` (lines 186-191) is
the only code path that calls `PATCH /api/tasks/:id`, and it only ever sends `tokenBudget`,
`toolBudget`, `autoCompact` (execution settings). No script or documented route supports editing a
task's `dependencyIds` or `requiredPaths` after creation. There is no supported mechanism to edit
either field on an existing task; this report records the verified correct/target state instead of
issuing an unverified PATCH.

## Findings

### 1. `c5bd2700` — already correct, left unchanged

Live `GET` confirms `dependencyIds: ["ae4866f3-8c46-4142-bf70-c901d5d57d37"]` (the actual `[M2-27]`
implementation task — "Wire M2 through the server and browser, including the full battle view",
stage `approved`) and `requiredPaths` exactly matching the six paths requested in the original
triage note. `ae4866f3`'s evidence report exists at `reports/engineering/M2-27.md` (tracked in this
checkout), resolving the original note's concern that no M2-27 report could be found. No action
taken, per instruction to leave this task unchanged.

### 2 & 3. `f4491607` and `9fa4109a` — no dependency change warranted

Both are `approved`, `dependencyIds: []`. The original triage note proposed adding
`dependencyIds: ["7a015776-cebb-4909-b98b-efe2461d8ed6"]` to both, reasoning that the "M3 candidate
backlog" section of `design/studio/priorities.md` they were pointed at only existed on `7a015776`'s
branch.

That premise no longer holds, and the proposed fix is wrong regardless:

- `7a015776` is **not** a delivery prerequisite for either task — it is the originating triage
  request's own task (also still `in_progress`, not approved, and its branch is not merged to
  `main`: its own `baseCommit` `71ae95f` is not an ancestor of `HEAD`). Making an approved,
  delivered task depend on an unapproved, unintegrated task would record a backwards and currently
  false relationship, and both tasks are `approved` — editing their dependencies would mean
  reopening already-accepted work, which this task was told not to do.
- The actual deliverables are independently verified merged to `main` already: commit `c10e21c`
  ("Correct merged M3 specification references", on `7a015776`'s own branch, not merged) confirms
  `design/game/m3-mid-expedition-loadout-change.md` (+ its report) landed via integrated commit
  `c8ebd20`, and `design/studio/reports/cycle-duration-feasibility.md` landed via commit `8391e56`.
  `git merge-base --is-ancestor` confirms both `c8ebd20` and `8391e56` are ancestors of `HEAD`, and
  both files exist in this worktree. Each task's own `requiredPaths`/deliverable path is therefore
  already a committed input with no missing prerequisite.
- `f4491607`'s and `9fa4109a`'s `baseCommit` (`9e740ff`) is itself an ancestor of `HEAD`, so their
  own execution baseline is integrated.

Conclusion: no `dependencyIds` or `requiredPaths` edit on `f4491607` or `9fa4109a` is correct to
make, now or retroactively — the original triage note's concern applies only to a **future** task
that would read the (still unmerged) "M3 candidate backlog" section of `priorities.md` as a
committed input, not to these two already-delivered specs. If such a future M3-planning task is
created, it should depend on `7a015776` reaching `approved`/merged (not on these two), and should
list the two reports' exact paths (`design/game/m3-mid-expedition-loadout-change.md` +
`design/game/reports/m3-mid-expedition-loadout-change.md`; `design/studio/reports/cycle-duration-feasibility.md`)
as `requiredPaths`, which are already committed on `main` independent of `7a015776`.

## Outcome

No repository-tracked task metadata needed correction beyond what was already in place. No PATCH
was issued. This report is the verified correction payload for escalation: if dependency/requiredPaths
editing on existing tasks is ever needed, the dashboard would need a new PATCH-supporting route —
none exists today.
