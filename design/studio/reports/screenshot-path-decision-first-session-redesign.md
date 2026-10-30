# Canonical path for first-session-redesign walkthrough screenshots — decision

Date: 2026-10-30 · Owner: Producer · Task 354e1444-6769-486e-ad52-af691a7a2d6a

## Question raised

Gameplay Programmer task `a72314da-eb3e-4405-bf61-a8421ee9dbe7` was instructed to save walkthrough
screenshots under `qa/artifacts/first-session-redesign/`. That path is outside the Gameplay
Programmer's write scope — confirmed by a live `mkdir` test in that task's worktree, which returned
"blocked by a deny rule" (`design/studio/reports/ui-improvement.md`, "Browser walkthrough evidence"
section). The ten screenshots (`1280-<step>.png` / `390-<step>.png`) were committed instead under
`reports/engineering/first-session-redesign-evidence/` on branch
`agent/task-a72314da-eb3e-4405-bf61-a8421ee9dbe7`, with the conflict documented in that task's report.

## Decision: `reports/engineering/first-session-redesign-evidence/` is the correct, permanent location

No file move or QA-owned copy task is needed. This is not a workaround; it follows the project's
own existing layout decision:

- `design/studio/tech-stack.md` ("Planned layout") already fixes the split: `qa/` is "QA reports
  and release evidence"; `reports/engineering/` is "implementation task evidence."
- `design/studio/roles.md` ("Department boundaries") assigns `qa/`, `tests/e2e/`, `design/qa/` to
  QA, and the repo-wide default (including `reports/engineering/`) to Engineering.
- These screenshots are a Gameplay Programmer (Engineering) implementation task's own walkthrough
  evidence, not a QA Tester's independent acceptance/playtest evidence. They belong with the rest
  of that task's committed evidence (`reports/engineering/M1-05.md`, `M1-11.md`, `M2-27.md`, and
  this task's own pre-existing `fs-*` screenshots already in the same directory), not in QA's
  release-evidence tree.

`qa/artifacts/first-session-redesign/` in the original task prompt was simply the wrong path for
Engineering-produced walkthrough evidence; it was never a deliberate owner decision to relocate it.

## How to apply going forward

Future task prompts asking an Engineering role (Gameplay Programmer, Tools Engineer, UI Engineer)
for walkthrough screenshots or implementation evidence should specify
`reports/engineering/<task-or-feature>-evidence/`, not `qa/artifacts/`. Reserve `qa/artifacts/` (or
`qa/`) for QA Tester/QA Player deliverables: independent acceptance checks, release verification,
and hands-on playtests.

No repository files moved. No new task created; the existing committed location already satisfies
the requirement.
