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

## M3-05 addition: variable-duration settlement, deferred builds, seasons/tournament

Full schemas, endpoints, worked examples and migration live in `contracts.md`'s "M3-05 addition"
section; this note records the invariants an implementer must preserve and why. No implementation
occurs in this task; production stays gated by M3-02's explicit M2 acceptance.

**Fixed-cycle time is retired for expeditions, not for dungeons.** `nominalDurationMs(battle) =
resolvedRounds(battle) * msPerRound`, with no wall-clock floor (the no-floor call is a recorded CTO
decision, not a Design change — see contracts.md §0). Dungeon floors keep the existing fixed
180,000 ms per floor unchanged; nothing about dungeon settlement moves. The `480`-cycle batch cap,
which was only ever a derived constant (`28,800,000 / 60,000`), is replaced by a named CPU-time safety
valve (`MAX_BATTLES_PER_SETTLEMENT`, provisional 500) that bounds work per settlement call instead of
assuming a fixed event size; this preserves "bounded computation before commit with revision recheck"
exactly, it just bounds by count-of-variable-length-events rather than by a derived constant.

**Reveal and credit are two separate, independently timed events on the same row.** A battle is
simulated and its full event log persisted the instant the settlement walk reaches it, whether or not
enough real elapsed time has accrued to actually grant its reward. This is the one narrow exception to
"battle reports are immutable once created": `creditedAt`/`rewards` transition exactly once, later,
from `null` to set, in a separate transaction from the insert. Nothing else on the row — combat
outcome, seed, events — ever changes after insert. This is what makes "watch the next fight live"
possible without decoupling the authoritative economy clock from real elapsed time: the same instant,
deterministic simulation runs whether a client is connected or the account is offline for hours: only
when its reward is *granted* differs, never how it was *computed*. Precomputing a battle never shortens
elapsed time, grants a reward early, or lets polling cadence influence advancement — every settlement
call is a pure function of persisted state (`checkpointAt`, `rngState`, the one cached pending battle,
and the capped elapsed window since last checkpoint), so splitting one long elapsed window across many
small calls or one big catch-up call produces byte-identical credited battles, rewards and final
checkpoint (see contracts.md's worked examples W1/W2).

**A monotonic server-clock high-water mark backs every time-stamped command**, strengthening the
existing per-call rollback clamp into a cross-command guarantee: no persisted write anywhere in the
system can ever observe time moving backwards, even across an OS clock correction. `apps/server` is
still the only package that reads a clock; `packages/game` still takes `now` as an explicit parameter.

**Deferred skill-loadout edits settle old history before changing anything.** A mid-expedition
active/passive-slot change command first runs the full settlement walk up to its own accepted time
(crediting/caching exactly as an ordinary settle would), so any battle already simulated under the old
build stays locked to it; only a battle not yet simulated at all picks up the new build, applied in the
same transaction immediately before that battle is rolled. No background process watches for
boundaries — the boundary-apply check runs inline, inside the settlement walk itself, the next time a
new battle needs to be rolled.

**Seasons and tournaments resolve lazily, inside ordinary request transactions, never via a timer.**
Season/tournament advancement (locking entries into fixtures/matches, resolving a match, archiving a
season, advancing a bracket) is triggered by whichever request happens to arrive after the relevant
deadline, guarded by the same check-then-set-in-one-transaction pattern already used for `BossClaim`'s
one-time grant (a `resolvedAt IS NULL`/`championEntryId IS NULL` precondition on the commit). This
keeps "one Node process owns authoritative state" intact: no new scheduler, no new concurrency model,
and a crash before commit simply repeats the same stored seed/inputs on the next trigger.

**Fixture accounts are not accounts.** `fixture_m3_01`..`04` are server-constructed competition-entry
rows with no session, no login path and no live inventory; they can never be selected via the dev
session selector and never resolve as a request's `accountId`. Every entry/standings/bracket view
carries an explicit `isFixture` flag so labelling is server-driven, never inferred from an ID pattern.
