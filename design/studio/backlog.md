# First-playable task briefs

Generated from `planning/milestone.json` by `node scripts/dashboard.mjs validate`. Edit the registry, not this file. All tasks begin staged; live status is in AgentDashboard.

## M1-01: Freeze API contracts and save invariants

Owner: **CTO** | priority 9 | effort medium | prerequisites: none

Specify implementation-ready request/response/error DTOs, entities, state revision/idempotency protocol, and offline settlement algorithm. Decide concrete local-session and rules-version handling without implementing game code.

Inputs: `design/studio/architecture.md`, `design/studio/tech-stack.md`, `design/game/first-playable.md`, `design/qa/acceptance.md`

Deliverables: `design/studio/contracts.md`, `design/studio/reports/M1-01.md`

Acceptance:

- Each planned endpoint has method, payload, response, ownership checks and error cases; public versus account-private data is explicit.
- Give worked 59/60/61-second, partitioned settlement, 8-hour cap, clock-rollback, retry and loadout-freeze examples with atomic transaction boundaries.
- Define immutable arena snapshots, boss one-time claim, overflow conversion boundary, migration/reopen behavior and test clock/seed injection.
- Record consistent package interfaces and no unresolved contract blocker for M1-02/M1-05/M1-07.

## M1-02: Specify combat, classes and bounded content

Owner: **Systems Designer** | priority 9 | effort medium | prerequisites: M1-01

Freeze exact combat formulas, action priorities, class/spec mechanics and stable content IDs. Use three classes, six specs, three normal enemies, one boss and at least nine base items/three affixes.

Inputs: `design/game/first-playable.md`, `design/studio/contracts.md`

Deliverables: `design/game/combat.md`, `design/game/content.md`, `design/game/reports/M1-02.md`

Acceptance:

- Specify integer math, targeting/ties, speed order, cooldowns/status durations/stacking, healing, death, victory and timeout with worked examples.
- Each specialization changes an observable outcome; define automatic ability behavior and unlock/switch rules.
- Content tables include IDs, stats, slot restrictions, enemy compositions and boss behavior, with no runtime-ambiguous placeholders.
- Align battle/reset/loadout rules with M1-01; leave reward values to the economy table rather than duplicating competing numbers.

## M1-03: Write original player-facing copy

Owner: **Narrative Designer** | priority 6 | effort low | prerequisites: M1-02

Deliver a compact keyed copy table for heroes/classes/specs/items/enemies/area/boss, onboarding and key result/error states. Keep names and flavor original.

Inputs: `design/studio/vision.md`, `design/game/content.md`, `design/game/interface.md`

Deliverables: `design/game/narrative/copy.md`, `design/game/reports/M1-03.md`

Acceptance:

- Every M1 content ID has a concise display name and useful description; no copied Idle Adventure text.
- Include local-build explanation, first expedition guidance, offline cap, loadout lock, inventory overflow, boss reward and arena snapshot explanations.
- Specify lengths suitable for narrow UI (short labels, short descriptions) and avoid lore that introduces extra mechanics.
- Provide implementation-ready keys and no dangling content references.

## M1-04: Define progression and reward baseline

Owner: **Economy Designer** | priority 8 | effort medium | prerequisites: M1-02

Set exact levels 1-10 XP requirements, reward/drop/affix probabilities, boss first-clear reward, inventory overflow conversion and expected pacing. No shops or crafting.

Inputs: `design/game/first-playable.md`, `design/game/combat.md`, `design/game/content.md`, `design/studio/contracts.md`

Deliverables: `design/game/economy/baseline.md`, `design/game/reports/M1-04.md`

Acceptance:

- Tables/formulas have explicit units, probabilities summing correctly, rounding, caps and losses; XP per hero and level-up stat growth are unambiguous.
- Show expected ordinary elapsed time to first gear, level 3 and boss readiness; label estimates pending simulation.
- Specify the 100-unequipped-item limit and deterministic overflow behavior without deleting equipped gear.
- Specify non-exploitable one-time boss reward and zero arena rewards; match offline cycle/cap semantics.

## M1-05: Scaffold local workspace and verification commands

Owner: **Tools Engineer** | priority 9 | effort medium | prerequisites: M1-01

Create the npm TypeScript workspace, tested runtime/dependency versions, minimal React shell/Fastify health route, lint-free typecheck/test/build setup and a reliable Windows local launcher. Preserve existing planning scripts/documents.

Inputs: `design/studio/tech-stack.md`, `design/studio/architecture.md`, `design/studio/contracts.md`

Deliverables: `package.json`, `package-lock.json`, `.node-version`, `apps/web/package.json`, `apps/server/package.json`, `packages/game/package.json`, `packages/contracts/package.json`, `packages/content/package.json`, `reports/engineering/M1-05.md`

Acceptance:

- Document tested Node/npm versions and compatible dependencies; npm ci, typecheck, minimal tests and build pass.
- npm run dev starts UI/API on 5174/3100 with configurable ports; health and browser shell work without cloud services.
- Port conflict and shutdown behavior are exercised; no hidden external service or global package-manager requirement.
- README accurately distinguishes working commands from later ones; game state remains server-owned in the skeleton.

## M1-06: Implement deterministic combat and content validation

Owner: **Gameplay Programmer** | priority 8 | effort medium | prerequisites: M1-02, M1-04, M1-05

Encode validated content and implement pure seeded combat, effective stats, XP/level helpers and reward generation using the frozen rules. Keep clock/storage/UI out of the engine.

Inputs: `design/game/combat.md`, `design/game/content.md`, `design/game/economy/baseline.md`, `design/studio/contracts.md`

Deliverables: `packages/game/src`, `packages/content/src`, `reports/engineering/M1-06.md`

Acceptance:

- Same inputs/seed/version yield identical outputs; tests cover targeting ties, dead actors, healing/status behavior and 100-round timeout.
- Three classes and six specs are encoded and each spec has a behavior test; invalid content and references fail clearly.
- Item instance/affix generation and XP helpers match economy tables with deterministic rounding and bounded results.
- Logs have structured events and bounded retention; no Date.now, database/browser imports or unseeded randomness inside rules.

## M1-07: Implement SQLite saves and isolated local sessions

Owner: **Gameplay Programmer** | priority 8 | effort medium | prerequisites: M1-01, M1-05

Implement migrations/repositories, seed two local accounts, opaque cookie sessions, ownership enforcement, state revisions and transactional idempotency infrastructure.

Inputs: `design/studio/contracts.md`, `design/studio/architecture.md`, `design/qa/acceptance.md`

Deliverables: `apps/server/src`, `packages/contracts/src`, `reports/engineering/M1-07.md`

Acceptance:

- Fresh database and save reopen/migration pass using isolated fixtures; test data never replaces real saves.
- Local account selection/current session/logout work in two independent sessions; private cross-account access/mutation is rejected.
- Same-request retries return stored results, changed-payload reuse and stale revisions fail, concurrent mutations remain atomic.
- Loopback default, validated payload limits, session cookie handling and consistent API error contract are verified.

## M1-08: Implement expedition, gear and offline progression

Owner: **Gameplay Programmer** | priority 8 | effort medium | prerequisites: M1-06, M1-07

Wire party/equipment/spec actions, expedition start/settle/stop, capped offline rewards, XP/loot/overflow and boss first-clear reward through authoritative atomic services.

Inputs: `design/studio/contracts.md`, `design/game/combat.md`, `design/game/economy/baseline.md`, `design/qa/acceptance.md`

Deliverables: `apps/server/src`, `reports/engineering/M1-08.md`

Acceptance:

- 59/60/61-second, partitioned, negative elapsed, 8-hour cap and repeated-cap fixtures match the contract; downtime/reopen preserves state/seed/remainder.
- Repeated and concurrent settlement cannot duplicate rewards; inventory and checkpoint commit together.
- Party ownership/distinctness, wrong-slot/double equip and active-expedition loadout/spec lock are enforced server-side.
- Boss first-win reward is atomic and cannot be farmed; overflow conversion is correct; bounded catch-up and logs are implemented.

## M1-09: Specify interface flows and accessible states

Owner: **Systems Designer** | priority 6 | effort low | prerequisites: M1-02, M1-03

Produce an implementation-ready compact screen/state map and component inventory for the first-playable loop. Use text/CSS fallbacks; no separate asset generation.

Inputs: `design/game/interface.md`, `design/game/narrative/copy.md`, `design/studio/contracts.md`

Deliverables: `design/game/ui-spec.md`, `design/game/reports/M1-09.md`

Acceptance:

- Every screen/action maps to real contract endpoints and copy keys, including result/retry/conflict states.
- Keyboard/focus behavior, desktop/narrow layout and disabled-action explanations are specified.
- Gear comparison, specialization choice, credited/discarded offline time and snapshot version are understandable without developer jargon.
- No new game system or mandatory art dependency is introduced.

## M1-10: Build the playable browser interface

Owner: **Gameplay Programmer** | priority 7 | effort medium | prerequisites: M1-08, M1-09, M1-11

Implement all M1 screens against real endpoints: local session, party/spec/gear, expedition/log/rewards, boss and asynchronous arena. Make the complete loop usable with text and CSS.

Inputs: `design/game/ui-spec.md`, `design/game/narrative/copy.md`, `design/studio/contracts.md`, `design/qa/acceptance.md`

Deliverables: `apps/web/src`, `reports/engineering/M1-10.md`

Acceptance:

- A browser can complete the main loop with real persisted server state; no hard-coded success, fake reward or disconnected placeholder buttons.
- Required loading/empty/error/reconnect/conflict states work; repeated submission is handled without losing context.
- Keyboard actions/focus and 1280x720/390px layouts are inspected; contrast and accessible labels are checked.
- Optional portraits/icons have usable fallbacks; combat presentation never controls authoritative outcomes.

## M1-11: Implement immutable asynchronous arena battles

Owner: **Gameplay Programmer** | priority 8 | effort medium | prerequisites: M1-06, M1-07

Add publish/list snapshot, challenge and private battle-report endpoints. Simulate with production combat against an immutable opponent team and persist reproducible reports.

Inputs: `design/studio/contracts.md`, `design/studio/architecture.md`, `design/game/combat.md`

Deliverables: `apps/server/src`, `reports/engineering/M1-11.md`

Acceptance:

- Two local accounts publish and challenge without the defender being online; only intended public snapshot fields are exposed.
- Changing defender gear/spec later cannot alter a stored snapshot or report; save/restart preserves reports.
- Request retries are idempotent and foreign private report retrieval is rejected; opponent live state is never modified.
- Reports include seed/rules/snapshot versions and outcome; timeout is draw and no arena rewards/ranking are introduced.

## M1-12: Add seeded pacing and catch-up benchmarks

Owner: **Tools Engineer** | priority 7 | effort medium | prerequisites: M1-08

Provide npm run simulate with explicit seeds/runs using the production engine, and a repeatable eight-hour settlement benchmark. Avoid duplicating combat/progression formulas.

Inputs: `design/game/economy/baseline.md`, `design/qa/acceptance.md`

Deliverables: `scripts/simulate.mjs`, `reports/engineering/M1-12.md`

Acceptance:

- Fixed seed reproduces results; multiple seeds and specialization choices report distributions for gear, level 3 and boss readiness.
- Results include assumptions, simulated elapsed time, win/loss counts and version/seed identifiers.
- Eight-hour catch-up measures time/memory/log bound and responsiveness on recorded hardware/runtime; target from QA plan is assessed honestly.
- Command has bounded output, supports saving machine-readable results, and never mutates a real player database.

## M1-13: Tune first-session pacing from simulation evidence

Owner: **Economy Designer** | priority 7 | effort medium | prerequisites: M1-04, M1-12

Inspect measured baseline and prescribe minimal numeric changes with expected effects. Keep changes inside the same content budget and send exact table deltas to M1-14.

Inputs: `design/game/economy/baseline.md`, `reports/engineering/M1-12.md`

Deliverables: `design/game/economy/tuning.md`, `design/game/reports/M1-13.md`

Acceptance:

- Evidence covers multiple fixed seeds and builds; pacing targets versus observed distribution are explicit.
- Recommend exact before/after values or justify no change; avoid speculative new systems to fix tuning.
- Explain effects on offline rewards, loss streaks, boss readiness and viable specializations.
- Define a focused rerun for M1-14 to verify the applied changes without repeating unrelated checks.

## M1-14: Integrate, harden and prepare the local release candidate

Owner: **Gameplay Programmer** | priority 7 | effort medium | prerequisites: M1-10, M1-13

Apply reviewed tuning, resolve integration defects, serve the built client locally and document the complete launch/save/test workflow. Produce a release candidate for independent QA.

Inputs: `design/game/economy/tuning.md`, `design/qa/acceptance.md`, `design/studio/tech-stack.md`

Deliverables: `README.md`, `reports/engineering/M1-14.md`

Acceptance:

- Applied tuning matches design and focused simulation rerun measures the intended effect; no hidden mechanical changes.
- Fresh npm ci, validate and full browser walkthrough pass or failures are fixed; built client is served locally by the API.
- README covers prerequisites, commands, ports, data location, backup/reset safeguards, two-account testing and local-only auth limitations.
- Record reproducible build/test evidence and remaining defects; no P0/P1 issue is knowingly passed to release as acceptable.

## M1-15: Independently verify first-playable acceptance

Owner: **QA Tester** | priority 7 | effort medium | prerequisites: M1-14

Exercise A01-A13 independently against the integrated game, add focused end-to-end regression coverage and provide release evidence. File concrete defects to existing task owners; do not silently fix gameplay code.

Inputs: `design/qa/acceptance.md`, `reports/engineering/M1-14.md`, `design/studio/contracts.md`

Deliverables: `qa/reports/M1-15.md`, `tests/e2e`

Acceptance:

- Each A01-A13 has pass/fail/blocked and concrete evidence; no invented or unrun test is marked pass.
- Two browser contexts, retry/concurrency/ownership attacks, restart/cap behavior and one-time boss rewards are verified.
- Keyboard and both viewport sizes are inspected with screenshots or explicit observations; empty/error/reconnect flows are included.
- Report contains reproducible defects/severity and a clear release recommendation; P0/P1 defects keep this task incomplete.

## M1-16: Review playability and accept the first milestone

Owner: **Game Director** | priority 5 | effort low | prerequisites: M1-15

Review QA, pacing and the actual local game against the owner promise. Write the concise milestone verdict and owner playtest instructions; distinguish working functionality from subjective enjoyment.

Inputs: `qa/reports/M1-15.md`, `design/game/economy/tuning.md`, `design/studio/vision.md`

Deliverables: `design/studio/release-verdict.md`, `design/studio/reports/M1-16.md`

Acceptance:

- Verdict references A01-A13 and actual QA/pacing evidence, with no unresolved P0/P1 issue treated as accepted.
- Owner can launch and follow a short playtest without reading technical documents.
- State what is implemented, known limitations and any focused P2 follow-up; do not fabricate player feedback or claim commercial readiness.
- If rejected, identify the existing task(s) to reopen and the precise failed gate; if accepted, mark the milestone verdict complete.

