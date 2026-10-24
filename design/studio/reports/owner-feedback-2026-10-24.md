# Owner feedback: Codex, pacing, live fights and UI

Task: `bbdb7310-43e6-419f-ac1c-e0e03af25109`. Base: `1cd836668a18f66e6ad5c3e34b0383b690f6b774`.
Status: **partial — role/task setup complete; game implementation outstanding**.

## Completed phase

- Created UI Designer in Design and UI Engineer in Engineering through the local project API, each with a role brief, relevant context documents and one seat. Exact IDs and task briefs are in `planning/ui-improvement.json`.
- Created UI review/specification task `f5910ec9-59da-44cd-97fc-0448643177d0` and UI implementation task `79d1a3c4-0e94-44a2-a344-c8194857e768`. Saved six-field handoffs with concrete scope and acceptance criteria. Engineering depends on the design task and its two committed deliverables.
- The review covers current desktop/mobile gameplay, first decision/action/reward timings, navigation, visual hierarchy, accessible states, Codex discovery and live-combat presentation. The implementation requires focused tests and real browser evidence; source inspection cannot pass the playtest requirement.
- Updated role ownership and priorities to reflect the owner's renewed request. The historical M3 deferral is not treated as resolution.
- Found existing Codex planning and cycle feasibility records; created no duplicate task for either.

## Verification and operational findings

- Local API GET of project studio/tasks confirmed no existing UI Designer/UI Engineer roles before creation. POST responses and subsequent GETs verified both roles/seats and task IDs. GET task detail verified saved handoff equality and the implementation dependency/required paths.
- The live scheduler automatically started the review before its handoff was attached. Stopped run `6617c7df-0027-4f2d-93ce-997e07104cb4` using `POST /api/runs/:id/stop`; GET confirmed run `stopped` and task `idle`. No review was accepted. No worker was intentionally dispatched and no global setting changed.
- Native task dependencies reject plain owner-chat IDs. The review therefore uses committed required paths (`planning/ui-improvement.json` and this report) to hold until this branch is integrated. UI implementation retains its native role-task dependency. The historical helper's claim that task creation never launches inference is no longer reliable; documented this in `dashboard.md`.
- Browser inventory through `cua.getState()` returned no browsers/apps. No visual or hands-on game acceptance is claimed. Game build/tests were not run in this documentation/setup phase because runtime code is unchanged.
- Final PowerShell assertions against project studio and both task-detail endpoints passed: both role names/briefs/two context documents/seat IDs matched; both tasks were idle, correctly assigned, with dependency and required-path arrays exactly matching `planning/ui-improvement.json` and nonempty six-field handoffs. `git diff --check` passed (only LF-to-CRLF notices). Inspected `git diff --stat 1cd836668a18f66e6ad5c3e34b0383b690f6b774` and `git status --short`; this phase changes only three studio notes and adds this report plus the planning record.

## Outstanding work / next phase

### GitHub delivery follow-up

The owner authorized handling GitHub publication/integration. AgentDashboard had already published checkpoint `14e9a1c` as draft PR https://github.com/nachofuentestalens/Banner-Bounty/pull/55. GitHub reported it open, unmerged and mergeable, with zero check runs/statuses; the dashboard correctly refused to merge without successful checks. Added `.github/workflows/validate.yml` for pull requests and pushes to main, using the repository's pinned Node version on Windows, read-only repository permissions, a timeout and cancellation of superseded runs. It runs the existing plan tests plus full game validation; no check gate is bypassed.

Local verification on Node 22.14.0: `npm ci --no-audit --no-fund` passed; `node --test scripts/dashboard.test.mjs` passed all 7 tests; `npm run validate` passed typechecking, all 213 tests in 27 files and production build. These checks establish automated validation, not gameplay acceptance. GitHub must run the workflow against the published commit before merge eligibility is established. The original gameplay requests remain unfinished and this task must not be marked complete merely to trigger auto-merge.

1. Implement a Codex tab from shared class/skill content. Relevant files: `apps/web/src/App.tsx`, `components/NavBar.tsx`, `copy.ts`, `skillMechanics.ts`, `packages/content/src/v2/classes.ts`, `skills.ts`. Show all six classes, base stats, growth and skills regardless of roster/level/activity lock. Avoid another independent stat table. Reconcile the existing Codex planning record with the delivered result; do not mark it done without review.
2. Design and implement shorter expedition pacing plus immediate viewing of the actual current authoritative fight. Read the existing feasibility report, current expedition service, pure progression code and contracts before changing anything. Preserve offline determinism, idempotent rewards, restart/reconnect behavior and old-save handling. Do not substitute replay after a wait for live viewing. Measure pacing and catch-up costs; verify rewards cannot be accelerated by client playback or repeated requests.
3. Test relevant gameplay/server/UI paths, build/typecheck, and obtain real desktop/mobile evidence when a browser is available. Continue updating this report with results and limitations.
4. After this branch integrates, the UI review and dependent UI implementation tasks execute against the updated baseline. Engagement remains an observable playtest question; no claim of improved fun is supported by this setup phase alone.

No game code, cycle length, combat delivery, rewards or balance changed during this phase. No branch switch, merge, live-checkout edit, dashboard-source edit or acceptance approval was performed.
