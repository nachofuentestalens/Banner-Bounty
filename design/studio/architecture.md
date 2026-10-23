# Architecture and invariants

One Node process owns authoritative state in a local SQLite database. The browser sends intentions, receives validated state, and presents it. M1-01 freezes concrete DTOs and transaction boundaries before feature implementation.

## Boundaries

`web -> HTTP API -> application services -> game rules + repository -> SQLite`.

- `packages/game`: pure functions; explicit state, rules version, RNG seed and elapsed duration. No `Date.now()`, network, database, UI, or unseeded randomness inside simulation.
- `packages/content`: stable IDs and validated numeric definitions; optional asset IDs. Combat logs contain event codes and parameters, not React markup.
- `packages/contracts`: request/response/error schemas; do not expose internal database rows as API contracts.
- `apps/server`: injects clock/RNG sources, authenticates account, checks ownership and state versions, applies atomic changes.
- `apps/web`: accessible presentation; countdowns are estimates. No client-authoritative loot, XP, time, stats or victory.

## Storage and commands

Minimum entities: accounts/sessions, heroes, inventory/equipment, party configuration, expedition/checkpoint, immutable published team snapshots, battle reports, idempotency receipts, schema version. One active expedition per account; one item may be equipped by at most one hero. Reject cross-account IDs.

Every mutating command carries a unique request ID and expected state revision. Scope idempotency to account + command + ID; store request fingerprint and original result in the same transaction as the mutation. An identical retry returns its original result; a reused ID with different data is rejected. A stale distinct request returns a conflict and current revision. Do not expose partial XP/loot/checkpoint updates.

Use migrations from an empty database and test reopening an existing save. Prefer short transactions with prepared statements; bounded computation occurs before commit with revision recheck. No network-shared database file. Backup/reset commands must target explicitly named development/test data and never delete arbitrary paths.

## Idle progression policy

Persist expedition start/checkpoint time, accumulated sub-cycle remainder, frozen party loadout, rules/content version and RNG state. Calculate whole 60-second expedition cycles using server time; clamp negative elapsed time to zero and total unprocessed elapsed time to 8 hours. Persist the new checkpoint and consume capped-away time so repeated collection cannot recover discarded progress. Carry an ordinary sub-cycle remainder only within the eligible window. The design must supply worked 59s/60s/61s, cap, clock rollback, and repeated-request examples in M1-01/M1-02.

Maximum 480 cycles per settlement. Bound each battle by 100 rounds and retained log size; simulate in a bounded batch. Measure catch-up cost in M1-12; avoid an unbounded server event-loop stall. Equip/reorder/spec changes are refused during an active expedition; stopping settles eligible complete cycles then discards the fractional remainder, making the loadout editable. UI states this rule. Simulation must not depend on whether the browser was open.

M1 uses catch-up after server downtime as well as browser absence. Existing expeditions retain the rules version they started with; during development, unsupported versions fail clearly and offer an explicit local reset/migration rather than silently rerolling rewards.

## Local sessions and asynchronous battle

Seed two local accounts. A dev-only account selector establishes an opaque server session in an HttpOnly SameSite cookie. Each browser context has a separate session. This is a local test convenience, not public authentication; bind loopback by default. Document deliberate LAN configuration separately and disable the dev selector for any public deployment (outside M1).

Publishing creates an immutable versioned team snapshot. A challenger chooses a published opponent; the server simulates the current challenger's team against that snapshot, persists seed/version/outcome, and returns a replayable report. Later opponent gear changes cannot alter the old report. M1 arena has no item/currency rewards, ranking, opponent depletion, or matchmaking. Requests never write into the opponent's live account.

## API surface to specify in M1-01

Health, local session selection/current session/logout, account state, party order, equip/unequip, choose specialization, expedition start/settle/stop, boss challenge, publish/list team snapshots, asynchronous challenge, battle report retrieval. Mutations are POST/PATCH and validated. State reads do not grant rewards; explicit settlement is idempotent. Client may settle on reconnect before showing the new state.

Return consistent errors: validation, unauthenticated, forbidden/not-owned, not-found, conflict, active-expedition and internal failure. Log a correlation ID, not session secrets. Enforce bounded strings/arrays/payload sizes and same-origin mutation handling. Test unauthorized requests and retries, not just happy paths.

## Graphics extension

Content stores optional portrait/icon/background IDs; UI uses a fallback when absent. Add visuals in the presentation layer without moving simulation or reward logic into animation callbacks. Text-only mode stays complete.

Combat replay metadata: new boss/arena reports add `participantsSnapshot.units` (id, team A/B, role/content ID, maxHp), frozen from the actual combat inputs and persisted in the existing snapshot JSON. No database migration is needed; old reports retain their text-log fallback. The UI initializes HP from this snapshot and applies each recorded `hpAfter`, then uses authoritative `finalHp` at completion. It never re-simulates combat or awards rewards.

Damage evidence (2026-10-22 additive contract decision in `contracts.md`): the server-side pure combat simulation records optional readonly `BattleEventDTO.damageBreakdown`, including evaluated arithmetic steps, resolved damage, prior HP and actual HP loss. Direct hits (including dodges) and Burn ticks carry evidence; older reports and other events may omit it. The UI only formats recorded operands/results and preserves an unavailable-evidence fallback. Recording evidence changes neither combat/RNG behavior nor endpoints, migrations or rules versions.

Expedition batches retain only their latest battle and combat inputs. Settlement responses optionally add `latestBattleReport`, with the same presentation shape, for the last credited cycle. It is returned in the existing idempotency receipt, not inserted into the battle-report table; its descriptive ID is not a report-retrieval URL. No-cycle settlements omit it. The 480-cycle cap, RNG consumption, rewards and checkpoint semantics are unchanged.
