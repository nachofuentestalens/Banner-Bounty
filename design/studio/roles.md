# Role ownership and handoffs

Use the project roles below. A role is a responsibility, not a reason to run another model. Each task uses its assigned isolated worktree; provision one seat for each role that has planned work.

| Role | Accountable for | Files / deliverables | M1 tasks |
| --- | --- | --- | --- |
| CTO | Contracts, persistence invariants, technical tradeoffs | `design/studio/architecture.md`, `tech-stack.md`, `contracts.md` | M1-01 |
| Game Director | Scope, priority, integration decisions, final playability verdict | `design/studio/vision.md`, `priorities.md`, release verdict | M1-16 |
| Systems Designer | Combat rules, class interactions, UI/UX behavior | `design/game/combat.md`, `content.md`, `ui-spec.md` | M1-02, M1-09 |
| Narrative Designer | Original concise names, descriptions, help and result copy | `design/game/narrative/copy.md` | M1-03 |
| Economy Designer | Progression/reward math and measured tuning | `design/game/economy/baseline.md`, `tuning.md` | M1-04, M1-13 |
| Tools Engineer | Workspace, launch/build/test commands, simulation tooling | root config, `scripts/`, tooling fixtures | M1-05, M1-12 |
| Gameplay Programmer | Simulation, content encoding, API/storage, UI, integration | `apps/`, `packages/`, implementation tests | M1-06, M1-07, M1-08, M1-10, M1-11, M1-14 |
| QA Tester | Independent acceptance, reproducible bugs, release evidence, hands-on browser playtests | `qa/`, `tests/e2e/`, `design/qa/` | M1-15, M2-29 |
| QA Player | Read-only secondary review of a QA Tester playtest or report | reads only; no deliverables | — |
| UI Designer | Interface review, visual hierarchy, interaction flows, responsive and accessible design | `design/game/ui-refresh.md`, `design/game/reports/ui-review.md` | Owner-feedback follow-up |
| UI Engineer | Browser presentation, interaction implementation and focused UI verification | `apps/web/`, UI tests, implementation report | Owner-feedback follow-up |

### QA Player tool mismatch (resolved 2026-10-22)

QA Player's AgentDashboard seat has read/glob/grep only — no shell, no browser — by design, since it
is a read-only role. The recurring "QA daily playtest" automation was routing hands-on, build-and-play
work to that seat anyway, so every run (e.g. `7549fac0`, 2026-10-21) could only report **NOT PLAYED**:
no build, no server start, no play. That missed run stays recorded as NOT PLAYED; it was not gameplay
evidence and must not be treated as one.

QA Tester already has shell + browser and has produced real play evidence under that toolset (M1-10,
M1-15, M2-07, M2-27 acceptance work); `design/studio/milestones/M2.md` already designates QA Tester,
not QA Player, to verify M2's acceptance checks in the browser (M2-29). Daily hands-on browser
playtests should follow the same routing: **QA Tester**, not QA Player. QA Player's remaining use is a
read-only second opinion on a QA Tester playtest or report (as it already did reviewing 7549fac0), not
running the game itself.

Decided 2026-10-23: the owner chose option (a) — repoint the "QA daily playtest" recurring automation
to QA Tester, not grant QA Player a shell/browser tool. This remains a project setting in AgentDashboard's
own Roles/automation panel, not a repository file or task-graph change, so no code or task-graph edit
implements it; whoever operates that panel still needs to flip the automation's target role to QA Tester.
See the question and answer recorded under `design/decisions.md` (2026-10-22/23, from task
`b9ebc865-c442-4ca0-aec3-17d399fb5510`).

M1's UI implementation belonged to Gameplay Programmer. From the 2026-10-24 owner feedback, UI Designer owns interface design and UI Engineer owns browser presentation and art fallbacks. Systems Designer retains combat/build interaction rules; Gameplay Programmer retains simulation, API/storage and authoritative progression. Security/save-integrity review belongs to CTO and QA. Build/release operations belong to Tools Engineer and Gameplay Programmer.

The two new roles and their review/implementation task IDs are recorded in `planning/ui-improvement.json`. UI Engineer must wait for the design review to be approved and integrated, with its two deliverables committed. Creating a role or task is not completion of the redesign. Existing Codex planning and M2 defect tasks remain their own records; do not duplicate them. No extra role agents should be launched by a task worker.

## Department boundaries

- Leadership: `design/studio/`.
- Engineering: repository-wide default, excluding more specific department-owned folders.
- Design: `design/game/`.
- QA: `qa/`, `tests/e2e/`, `design/qa/`.

Dashboard folder ownership helps Claude permissions and document attribution. Codex uses its workspace sandbox; the role/task scope remains an instruction rather than a universal filesystem lock. The scheduler's one-writer-per-department rule is not protection against overlapping folders in different departments or plain chats. Keep concurrency at one for M1.

## Normal handoff

The assigned role completes the task's deliverables and report. A report lists each acceptance condition with concrete evidence, files changed, commands and outcomes, remaining issues, and the recommended next task. No new task block is needed for work already in the registry. A coordinator reviews the evidence and records acceptance with `node scripts/dashboard.mjs complete ID`; only then can dependent work start through the helper. Native automatic done status is not evidence review.

Do not send routine decisions through multiple management agents. CTO's baseline authorizes ordinary implementation choices within the named stack. Designers own numeric tuning inside the agreed scope. Record genuine cross-role conflicts for the existing owner; use a proposal only for an actual change requiring a decision.

## Unexpected issues

Report a reproducible issue to the coordinator with steps, expected/actual, severity, affected gate and suggested owner. Update an existing task when it already covers the fix. Only create a new task when essential work has no existing home. Department autonomy stays `ask`, preventing accidental recursive task fan-out. A broken build, inability to start or data loss may justify an emergency; ordinary blocked prerequisites do not.

The owner does not need to approve routine reversible fixes. Dashboard proposal acceptance and handoff approval are real inbox workflows for exceptional decisions, not mandatory gates for every file edit. Do not approve or reject unrelated inbox items.
