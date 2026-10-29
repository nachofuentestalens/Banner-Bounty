# UI review input hold investigation

Date: 2026-10-29. Repair task: `b3b40e87-28d0-4369-a024-17ccc9a1083d`.
Target: `f5910ec9-59da-44cd-97fc-0448643177d0` (Review current UI and specify an engaging first-session redesign).

## Finding and disposition

The required input is an existing committed deliverable awaiting integration, not erroneous metadata. Preserve the task and its requiredPaths. No prerequisite file was manufactured, no duplicate task created, and no dashboard state changed.

Read-only inspection of commit `bdd4aaa0b202e464d7ec605b9ba2703d4b3a0d64` found both `planning/ui-improvement.json` and `design/studio/reports/owner-feedback-2026-10-24.md`. The JSON contains this exact UI task ID, brief, acceptance checks and required paths. The report explicitly says the two paths hold review until the originating branch integrates because native dependencies reject plain owner-chat IDs. This supersedes the earlier assumption that the file never existed.

Existing source task: `bbdb7310-43e6-419f-ac1c-e0e03af25109` (Owner feedback on Banner & Bounty). Its current task-list handoff identifies PR #55 and records unfinished Codex, expedition pacing and authoritative live-fight work. Its report says not to mark that work complete merely to trigger merging. PR status and CI were not independently queried in this investigation; those details are attributed to the source task.

## Evidence and readiness

- Allowed project tasks GET succeeded. Target remains queued, priority 8, with no dependencyIds and six requiredPaths. Its latest brief requests a read-only first-session review and a redesign proposal. Its older handoff explicitly says to wait for owner-feedback integration.
- `git -C ../.. ls-tree -r --name-only HEAD -- <six inputs and planning>` confirmed AGENTS.md, interface.md, ui-spec.md and App.tsx are committed here. Neither the planning JSON nor the owner-feedback report is committed in this checkout. Readiness therefore remains BLOCKED on two intended inputs, even if only the first appears in the scheduler message.
- `git show bdd4aaa0b202e464d7ec605b9ba2703d4b3a0d64:<path>` succeeded for both missing files and established their original intent. They were read from existing Git objects, not copied into this worktree.
- Narrow search of planning, design/studio and scripts found no ui-improvement.json references in the current checkout (rg exit 1 means no matches). That absence alone did not establish absence on the originating branch.
- Initial AGENTS.md read from design/studio failed because it is at repository root; the root file was subsequently read successfully. No permission-refused command occurred.
- No build or gameplay tests are relevant to this documentation-only investigation; no playtest claim is made.

## Required next action and limits

Continue the existing source task `bbdb7310-43e6-419f-ac1c-e0e03af25109` through its normal authorized workflow. After its actual work is complete and reviewed, integrate its deliverables through dashboard delivery and recheck all six required inputs in the UI task's execution baseline before allowing normal scheduling. Do not force execution, merge an unfinished task, or delete either required path to bypass the gate.

No dashboard metadata correction is warranted by the evidence. This Producer role permits only the project tasks GET and state changes through documented reply blocks; no existing-task metadata mutation block is provided. No other endpoint was called. F02 review and provider reserves were left untouched.

Repair remains unfinished pending source integration and subsequent readiness verification. No new task is needed. Assumption: the source report's explicit integration requirement remains in force; the newer UI review prompt does not explicitly revoke it.
