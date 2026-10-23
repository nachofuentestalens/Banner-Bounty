# Dependency/requiredPaths correction — 3 M2-feedback follow-ups — evidence report

Date: 2026-10-23 · Owner: Producer · Task ID `08adcf41-a367-44dc-b87b-19437e61758b`

## Scope

Verify and, where warranted, correct `dependencyIds`/`requiredPaths` on three tasks flagged by
Game Director triage of 2026-10-22 owner feedback (task `7a015776-cebb-4909-b98b-efe2461d8ed6`,
"Triage 5 feedback items"):

1. `c5bd2700-b2bc-4995-8741-16f5521c9d7b` — Add skill hover tooltips + damage breakdown to battle/build UI
2. `f4491607-20b6-413e-b20c-bc0f026479fb` — Spec: mid-expedition deferred skill loadout change (M3 candidate)
3. `9fa4109a-92c5-4c03-85d7-406189c0f218` — Feasibility spec: bind expedition cycle duration to real fight length (M3 candidate)

## Owner resolution (2026-10-22T20:15:28.673Z)

The owner resolved this escalation directly: `c5bd2700` was corrected through the supported API
(not a manual metadata edit), and the two merged specifications (`f4491607`, `9fa4109a`) were
explicitly exempted from retroactive dependency changes. This report records the verified
correct/target state consistent with that resolution. No further dependency edits, task reopenings,
or escalation follow from it.

## Findings

### 1. `c5bd2700` — corrected via the supported API; verified

Live `GET /api/tasks/c5bd2700-b2bc-4995-8741-16f5521c9d7b` confirms:

- `dependencyIds: ["ae4866f3-8c46-4142-bf70-c901d5d57d37"]` — the actual `[M2-27]` implementation
  task ("Wire M2 through the server and browser, including the full battle view"), stage `approved`.
  `ae4866f3`'s evidence report exists at `reports/engineering/M2-27.md` (tracked in this checkout),
  resolving the original triage note's concern that no M2-27 report could be found.
- `requiredPaths` matches exactly the six paths requested in the original triage note.

Both fields were corrected through the dashboard's supported API, per the owner's resolution. No
further action needed.

### 2 & 3. `f4491607` and `9fa4109a` — exempted from retroactive dependency changes; no edit made

Both are `approved`, `dependencyIds: []`. The original triage note proposed adding
`dependencyIds: ["7a015776-cebb-4909-b98b-efe2461d8ed6"]` to both, reasoning that the "M3 candidate
backlog" section of `design/studio/priorities.md` they were pointed at only existed on `7a015776`'s
branch. The owner's 2026-10-22T20:15:28.673Z resolution explicitly exempts these two already-merged
specifications from retroactive dependency changes, so no edit is made here, independent of the
analysis below (which confirms the exemption is also the technically correct outcome, not merely an
administrative one):

- `7a015776` is the originating triage task itself (`in_progress`, not approved, not merged to
  `main`). Making either approved, delivered spec depend on an unapproved, unintegrated task would
  record a backwards and currently false relationship.
- The deliverables are independently verified integrated into `main` via their delivery merge
  records, not via `baseCommit` ancestry: `design/game/m3-mid-expedition-loadout-change.md` (+ its
  report) landed via merge commit `c8ebd205` ("Add M3-candidate spec for mid-expedition deferred
  skill-loadout change"), and `design/studio/reports/cycle-duration-feasibility.md` landed via merge
  commit `8391e560` ("Update design/studio/reports/cycle-duration-feasibility.md"). `git merge-base
  --is-ancestor c8ebd205 HEAD` and `git merge-base --is-ancestor 8391e560 HEAD` both confirm these
  merge commits are ancestors of the current `HEAD`, and both deliverable files exist in this
  worktree.

Conclusion: no `dependencyIds` or `requiredPaths` edit on `f4491607` or `9fa4109a` is correct to
make — both per the owner's explicit exemption and on the merits, since their deliverables are
already integrated via verified merge-commit ancestry independent of `7a015776`.

## Rule for future consumers

Any future task (e.g. an M3-planning task) that consumes these specifications' outputs, or consumes
changes landed through `priorities.md`, must declare the dependency explicitly rather than infer it
from `baseCommit`:

- Depend on each specification's producer task whose outputs it reads (here, the tasks that
  produced `m3-mid-expedition-loadout-change.md` and `cycle-duration-feasibility.md`), with those
  files listed in `requiredPaths`.
- Depend on the producer of `priorities.md` (i.e. the task whose approved change last modified it)
  when consuming priorities changes, with `design/studio/priorities.md` listed in `requiredPaths`.
- A producer task must never list its own outputs as `requiredPaths`/inputs to itself.

## Outcome

`c5bd2700`'s `dependencyIds`/`requiredPaths` were corrected through the supported API and are
verified correct. `f4491607` and `9fa4109a` are exempted from retroactive dependency changes per the
owner's 2026-10-22T20:15:28.673Z resolution and require no edit; their deliverables are confirmed
integrated into `main` via merge-commit ancestry (`c8ebd205`, `8391e560`), independent of the
unmerged `7a015776`. No specification was reopened, no dependency was changed, and no task was
created by this report.
