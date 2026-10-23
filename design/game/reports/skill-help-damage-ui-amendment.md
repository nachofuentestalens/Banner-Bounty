# Skill help and damage UI amendment: evidence report

Date: 2026-10-23. Owner: Systems Designer. Task: `f90d1714-0d5f-4989-8bd5-f0603c0ad872`.

Result: documentation deliverables complete; implementation acceptance is not granted by this report. Only interface.md, ui-spec.md and this report changed. No source, balance, contract, debug-menu or milestone routing changes were made.

## Prerequisite gate and scope

Read repository AGENTS.md, the assigned brief, all six required inputs and design/decisions.md. The dashboard tasks endpoint returned `stage: approved` for `7a015776-cebb-4909-b98b-efe2461d8ed6`, `c5bd2700-b2bc-4995-8741-16f5521c9d7b` and `195f2cb0-d2b9-4998-97e7-f1a1860bbc50`. Delivery returned `integrated: true` with checkpoints `b0f8a23570c5ffc5783fb9df12aa78d21466cdde`, `fe8413d9d6472f4a3eb8aca9b3178cb5d9a6d5c6` and `8b578f87d84bb9aa543170ae0e4c2d7d44d968f2`, respectively. All six required paths exist as committed HEAD objects. Assigned branch `agent/task-f90d1714-0d5f-4989-8bd5-f0603c0ad872` was retained; starting worktree was clean.

Dated amendments preserve preceding text, including the M1-09 freeze. They specify selected and alternative skill inspection, disabled-build help, input/dismissal states, narrow layout, shared battle help, damage-versus-loss semantics, dodge/Burn and legacy fallback, with eight observable checks. Assumptions: alternatives mean the current hero's eligible skill pool, not the deferred full codex; battle help explains recorded actions, not edits to completed fights; class descriptions are general rules, while event evidence proves which calculations occurred. These bounded choices are recorded in ui-spec.md sections A-C.

## Reconciliation with Engineering

Source inspection was limited to SkillLabel.tsx, DamageDetails.tsx, the relevant Company.tsx/BattleView.tsx integrations, tooltip CSS and SkillLabel.test.tsx. This supports design reconciliation, not a new runtime certification.

1. **Confirmed mismatch: hover-only Escape.** SkillLabel handles Escape only on its button's `onKeyDown`. A mouse-enter opens help without focusing the button, so Escape pressed while another control holds focus does not reach that handler. Engineering's general claim of Escape dismissal is therefore narrower than triage intent and SH-03. Its unit test presses Escape only after focusing the trigger. Required behavior: dismiss visible help regardless of opening modality, preserving focus. Existing Gameplay Programmer task `c5bd2700-b2bc-4995-8741-16f5521c9d7b` is the owning implementation route; this report does not silently approve the gap or create a duplicate task.
2. **Coverage limit: long help and all battle routes.** Tooltip CSS uses a 50vh scroll area. Keyboard reachability of overflowed text, repositioning after scroll, hover-without-focus Escape and touch dismissal were not established by the cited report. Engineering exercised a real boss fight at 1280px and 390px, not independent browser checks of expedition/dungeon/arena. Shared components support consistency but do not prove every route passes SH-03 through SH-05. These are open verification gaps, not asserted failures.
3. **Damage contract reconciled.** Engineering's historical blocker entries are superseded by its final integrated-contract verification and the now-present CTO decision. DamageDetails renders recorded stages and separate damage/hpLoss fields with legacy fallback. No owning-document contract amendment remains necessary here. Unknown steps currently show only a neutral label/result; this is permitted, without inferring unknown arithmetic. The phrase "older report" is fallback copy, not an age guarantee.
4. **Skill pool and lock behavior align by inspection.** Company exposes independent help buttons and an eligible-skills disclosure outside disabled selects. Native titles are supplementary. Help for all 30 class skills is reported by Engineering; that test establishes presence, not an independent audit of every numerical transcription. No all-class codex or live cooldown counter is implied.
5. **Existing class-document inconsistency observed.** classes.md section 10 example 4 calls two Burn stacks the cap; normative section 6 says three (four with Shadowflame). This amendment points help to sections 4-6 and does not copy the stale example or alter balance. The inconsistency remains in the historical class document, outside this amendment's requested changes; any later class-document cleanup should preserve the normative rule.

## Acceptance evidence

Every requested documentation topic is present. Runtime status is deliberately separate:

| Check | This run's evidence and remaining limit |
| --- | --- |
| SH-01 selected/alternative help | Spec A defines choices, empty state and non-mutating inspection. Company source agrees structurally. Engineering reports 30-skill presence coverage; numerical correctness across all descriptions was not independently retested. |
| SH-02 locked build | Spec A retains inspection under expedition/dungeon locks. Company source separates help from disabled selects. Both live activity cases remain for QA observation. |
| SH-03 input/accessibility | Spec B defines hover/focus/tap/Escape, association and dismissal. Source identifies the hover-only Escape mismatch above; no full runtime pass claimed. |
| SH-04 layout | Spec B defines both dimensions, wrapping, clipping and reachable overflow. Engineering reports two-width screenshots/browser checks; long-text keyboard scrolling and scroll repositioning remain unverified here. |
| SH-05 shared battle views | Spec C covers each fight kind and both feed/log. Shared BattleView integration inspected; Engineering's real-browser fixture is boss-only. Route-wide independent certification remains open. |
| SH-06 arithmetic/HP loss | Spec C matches CTO meanings and gives overkill/survival examples. Engineering reports deterministic clamp/modifier tests and browser event reconciliation. No test rerun or new gameplay acceptance claimed. |
| SH-07 dodge/Burn/multiple hits | Spec C distinguishes skipped stages, captured ATK and per-event evidence. Engineering reports fixed-seed engine coverage; no independent runtime rerun here. |
| SH-08 unavailable evidence | Spec C defines explicit fallback and neutral unknown-kind behavior. DamageDetails source matches that presentation. Engineering reports legacy tests; no independent browser legacy run here. |

## Commands and results

Commands ran from design/game unless otherwise specified. Reads used bounded `Get-Content`/`rg`; early combined output was truncated, so relevant Engineering-report, class, UI and contract sections were read in smaller ranges. No command was refused.

- `git status --short`: exit 0, clean at start.
- `git branch --show-current`: exit 0, assigned branch above.
- `Get-Content ../../AGENTS.md`, `Get-Content ../studio/dashboard.md`, `Get-Content ../decisions.md`: exit 0; map, native delivery rules and owner decisions read.
- `git ls-files --error-unmatch ../../design/studio/reports/five-feedback-triage.md interface.md ui-spec.md classes.md ../../design/studio/contracts.md ../../reports/engineering/skill-tooltips-damage-breakdown.md`: exit 0, six paths tracked.
- `Invoke-RestMethod 'http://127.0.0.1:5190/api/projects/c6faaeda-b5c2-4d67-b351-1e1dd9f594a7/tasks'`, filtered to the three prerequisite IDs and selecting `id,status,stage`: succeeded, all approved.
- `Invoke-RestMethod 'http://127.0.0.1:5190/api/projects/c6faaeda-b5c2-4d67-b351-1e1dd9f594a7/delivery'`, filtering `.tasks` to those IDs and selecting `id,integrated,checkpoint`: succeeded, all integrated. Read-only calls; no dashboard mutations.
- PowerShell here-string piped to `node`: used `git show b0f8a23570c5ffc5783fb9df12aa78d21466cdde:<path>` for both amended documents, normalized CRLF to LF, and asserted each current file starts with the old text (`old.trimEnd() + '\n'`). Both passed: historical content preserved. Also ran `git cat-file -e HEAD:<path>` for all six required inputs (passed), and asserted SH-01 through SH-08 exist in ui-spec.md (passed). These are document-integrity checks, not gameplay checks.
- `git diff --check`: exit 0 after amendments; only LF-to-CRLF notices. Final report-inclusive whitespace/scope check is recorded below.
- `git diff --stat b0f8a23570c5ffc5783fb9df12aa78d21466cdde`: exit 0; inspected the append-only amendments against the assigned task base. Final scope includes this new report as well.

No install, build, simulation or browser test was needed for these Markdown-only changes. Existing Engineering test results are attributed evidence, not commands executed in this run. This task makes no new claim that the project was launched or independently accepted.

Final verification: `git diff --check` passed; `git diff --numstat b0f8a23570c5ffc5783fb9df12aa78d21466cdde` showed 10 added interface lines and 56 added UI-spec lines, with no deletions. `git status --short` showed only those two modifications and this new report. A Node check of all three files verified no trailing whitespace, local Markdown link targets exist, and changed/untracked paths match exactly these three allowed deliverables. Git diff does not include the untracked report until the dashboard checkpoints it; it was checked directly from disk.

## Unresolved gaps and next task

The UI-spec gap is closed. Hover-only Escape remains an implementation mismatch; keyboard/scroll and route-wide observations remain verification gaps. The stale Burn example is noted above. No other new contract or direction decision is required.

Next: existing M2-30 (`72001eaf-a460-4053-9ca0-4888f1a9f07f`) consumes this report for its verdict/M3 plan and retains these limits. If remediation is scheduled, use the existing Gameplay Programmer tooltip task and existing QA certification flow rather than duplicating backlog tasks. This documentation completion is not approval of those outstanding runtime checks.
