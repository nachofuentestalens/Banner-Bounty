# Role ownership and handoffs

Use the existing eight AgentDashboard roles. A role is a responsibility, not a reason to run another model. Keep one active task in this shared checkout; provision one idle seat for each role that has planned work.

| Role | Accountable for | Files / deliverables | M1 tasks |
| --- | --- | --- | --- |
| CTO | Contracts, persistence invariants, technical tradeoffs | `design/studio/architecture.md`, `tech-stack.md`, `contracts.md` | M1-01 |
| Game Director | Scope, priority, integration decisions, final playability verdict | `design/studio/vision.md`, `priorities.md`, release verdict | M1-16 |
| Systems Designer | Combat rules, class interactions, UI/UX behavior | `design/game/combat.md`, `content.md`, `ui-spec.md` | M1-02, M1-09 |
| Narrative Designer | Original concise names, descriptions, help and result copy | `design/game/narrative/copy.md` | M1-03 |
| Economy Designer | Progression/reward math and measured tuning | `design/game/economy/baseline.md`, `tuning.md` | M1-04, M1-13 |
| Tools Engineer | Workspace, launch/build/test commands, simulation tooling | root config, `scripts/`, tooling fixtures | M1-05, M1-12 |
| Gameplay Programmer | Simulation, content encoding, API/storage, UI, integration | `apps/`, `packages/`, implementation tests | M1-06, M1-07, M1-08, M1-10, M1-11, M1-14 |
| QA Tester | Independent acceptance, reproducible bugs, release evidence | `qa/`, `tests/e2e/`, `design/qa/` | M1-15 |

UI engineering, art fallbacks and server engineering belong to Gameplay Programmer for this slice; Systems Designer supplies the interface specification. Security/save-integrity review belongs to CTO and QA. Build/release operations belong to Tools Engineer and Gameplay Programmer. No separate marketing, finance, HR or art-production agent is needed before there is a playable game.

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
