# API contracts and save invariants (M1-01 freeze)

This document is the frozen contract surface for M1. `packages/contracts` implements these shapes; `apps/server` enforces them; `packages/game` stays pure. Changing a shape here after M1-02/M1-05/M1-07 start requires a recorded decision in this file, not a silent code change.

## Conventions

- All mutating endpoints are `POST` or `PATCH`, accept a body, and return JSON. All endpoints require the dev-session cookie except the public endpoints: `GET /health`, `POST /dev/session/select`, `GET /arena/snapshots`, and `GET /arena/snapshots/:snapshotId`.
- Every response envelope is `{ ok: true, data: T, revision: number }` or `{ ok: false, error: ErrorDTO }`.
- `ErrorDTO = { code: ErrorCode, message: string, correlationId: string, details?: Record<string, unknown> }`.
- `ErrorCode = "validation" | "unauthenticated" | "forbidden" | "not_found" | "conflict" | "active_expedition" | "internal"`.
- `revision` is the account's monotonically increasing state counter (see Revision & idempotency protocol). Every mutating request body includes `expectedRevision: number` and `requestId: string` (UUID v4, client-generated).
- Timestamps in responses are ISO-8601 UTC strings; the server never accepts a client-supplied "now".
- Bounded inputs: strings ≤ 256 chars unless noted, arrays ≤ 64 elements, request bodies ≤ 16 KB. Zod schemas enforce this at the HTTP boundary; violations return `validation`.

## Entities (server-owned; not raw DB rows)

```ts
Account       { accountId, displayName, createdAt }
Session       { sessionId (cookie only, never in JSON body), accountId, createdAt }
Hero          { heroId, accountId, classId, level, xp, specializationId | null, equipment: { weapon, armor, trinket } /* ItemInstanceId | null each */ }
ItemInstance  { itemInstanceId, accountId, definitionId, affixId | null, equippedBy: HeroId | null }
PartyOrder    { accountId, order: [HeroId, HeroId, HeroId] } // exactly 3 distinct owned heroes
Expedition    { accountId, status: "none"|"active", startedAt, checkpointAt, subCycleRemainderMs, frozenLoadout, rulesVersion, rngState, cyclesCompleted }
BossClaim     { accountId, bossId, claimedAt | null } // one-time reward flag
TeamSnapshot  { snapshotId, accountId, publishedAt, rulesVersion, frozenParty, frozenStats } // immutable once created
BattleReport  { reportId, kind: "pve"|"boss"|"arena", participantsSnapshot, seed, rulesVersion, events, result, createdAt }
IdempotencyReceipt { accountId, command, requestId, fingerprint, resultPayload, createdAt }
SchemaVersion { version, appliedAt }
```

Ownership rule: the server resolves `accountId` from the session cookie, never from anything the client sends. For a `HeroId` or `ItemInstanceId` in a request, the server checks it belongs to that session's account before mutating anything; a foreign ID is rejected. A `snapshotId` is the one exception — it may belong to any account, since reading a published snapshot is the explicitly allowed cross-account read (see arena/challenge).

## Public vs account-private data

- **Public** (no session required, served to any loopback caller): `health`, `GET /arena/snapshots` (summary list), and `GET /arena/snapshots/:snapshotId` (one published snapshot's frozen party/stats, for opponent preview before challenging). Neither snapshot endpoint ever returns live inventory, gold, or unpublished heroes — only the data copied into the snapshot at publish time.
- **Session-only** (session cookie required; every value returned must belong to the caller's own `accountId`): hero roster/stats/equipment, inventory, party order, expedition/checkpoint state, gold, boss claim status, battle reports, and the account's own session info (`/dev/session/current`). A `BattleReport` for an arena challenge is session-only to the challenger; the opponent (snapshot owner) does not get a copy or notification in M1 — only the challenger's session can retrieve it via `GET /battle-reports/:reportId`.
- Publishing a snapshot is the one explicit, one-way move from session-only to public: it copies party/stats into a public row. It never makes the live hero/inventory/gold data itself public, and it never reverses (no unpublish in M1).

## Endpoints

Every endpoint below lists its **complete** error set; omit none even when an error is "obvious" (e.g. `unauthenticated` applies to every session-only endpoint and is listed explicitly rather than assumed).

### `GET /health`
- Payload: none. Response: `{ ok: true, data: { status: "ok", schemaVersion } }`. Public.
- Errors: `internal`.

### `POST /dev/session/select`
- Payload: `{ accountSlot: "A" | "B" }` (dev-only; exactly two seeded accounts). Public (pre-auth).
- Response: `{ ok: true, data: { accountId, displayName } }`. Sets HttpOnly SameSite=Strict session cookie scoped to loopback origin.
- Errors: `validation` (unknown slot), `internal`.

### `GET /dev/session/current`
- Payload: none. Session-only.
- Response: `{ ok: true, data: { accountId, displayName } }`.
- Errors: `unauthenticated`, `internal`.

### `POST /dev/session/logout`
- Payload: none. Session-only.
- Response: `{ ok: true, data: {} }`. Clears cookie.
- Errors: `unauthenticated`, `internal`.

### `GET /account/state`
- Payload: none. Session-only; a read never grants rewards and never advances settlement (M1-01 invariant: reads are side-effect free).
- Response: `{ ok: true, data: { heroes, inventory, partyOrder, expedition: { status, checkpointAt, frozenLoadout?, cyclesCompletedSinceStart }, gold, bossClaims, revision } }`. **M1-08 additive fields:** while `status="active"`, `expedition` also includes `startedAt`, `rulesVersion`, `wins`, and `losses`.
- Errors: `unauthenticated`, `internal`.

### `PATCH /party/order`
- Payload: `{ requestId, expectedRevision, order: [HeroId, HeroId, HeroId] }`. Session-only.
- Ownership: all three heroIds must belong to the session account and be distinct. **M1-01 decision: reorder is allowed at any expedition status**, since front position only affects future expedition starts and never mutates the already-`frozenLoadout` of a running expedition (see Worked example 9).
- Response: `{ ok: true, data: { partyOrder }, revision }`.
- Errors: `unauthenticated`, `validation` (wrong count/duplicate), `forbidden` (foreign hero ID), `conflict` (stale `expectedRevision`), `internal`. (`active_expedition` does **not** apply to this endpoint.)

### `POST /equipment/equip`
- Payload: `{ requestId, expectedRevision, heroId, itemInstanceId, slot: "weapon"|"armor"|"trinket" }`. Session-only.
- Ownership: hero and item must belong to account; item must not already be equipped by a different hero; item's definition slot must match `slot`.
- Response: `{ ok: true, data: { hero }, revision }`.
- Errors: `unauthenticated`, `validation` (wrong slot), `forbidden` (foreign hero/item), `not_found` (unknown heroId/itemInstanceId), `active_expedition` (expedition active — checked before `conflict`; see Revision & idempotency protocol), `conflict` (duplicate equip target / stale revision), `internal`.
- **M1-08 decision — precondition order (equip/unequip):** ownership → `active_expedition` → `validation` (wrong slot/level/class) → `conflict` (item equipped by another hero). All run at protocol step 3, so none writes a receipt.

### `POST /equipment/unequip`
- Payload: `{ requestId, expectedRevision, heroId, slot }`. Session-only.
- Ownership/errors mirror equip: `unauthenticated`, `validation`, `forbidden`, `not_found`, `active_expedition`, `conflict`, `internal`.
- **M1-08 decision:** unequipping at a full inventory (100 unequipped item instances already held) returns `validation` with `details.reason="inventory_full"`. The 100-item cap (see Arena, boss, and migration invariants) is an inventory invariant that applies here too — unequip can never create a 101st unequipped item.

### `POST /hero/specialization`
- Payload: `{ requestId, expectedRevision, heroId, specializationId }`. Session-only.
- Ownership: hero belongs to account, hero level ≥ 3, specializationId valid for hero's class.
- Response: `{ ok: true, data: { hero }, revision }`.
- Errors: `unauthenticated`, `validation` (level < 3, wrong class/specialization), `forbidden` (unknown or foreign heroId), `active_expedition`, `conflict`, `internal`. **M1-08 decision:** this endpoint lists no `not_found` — an unknown `heroId` returns `forbidden`, matching `/party/order`'s treatment of unrecognized hero IDs, rather than distinguishing "doesn't exist" from "not yours."

### `POST /expedition/start`
- Payload: `{ requestId, expectedRevision }`. Session-only.
- Ownership: account has no active expedition; party order has exactly 3 distinct owned heroes.
- Transaction: freezes current loadout (hero levels/specs/equipment at start), sets `status="active"`, `startedAt=checkpointAt=serverNow()`, `rulesVersion=currentRulesVersion`, `rngState=seed(accountId, startedAt)`, `subCycleRemainderMs=0`, `cyclesCompleted=0`.
- Response: `{ ok: true, data: { expedition: ExpeditionViewDTO }, revision }`. **M1-08 decision:** the `expedition` view in start/stop responses omits `rngState` and `seed` (a client must not be able to predict drops); this is `ExpeditionViewDTO` in `packages/contracts/src/index.ts`, not the raw `Expedition` entity.
- Errors: `unauthenticated`, `validation` (party incomplete/duplicate), `active_expedition` (one already running), `conflict` (stale revision), `internal`.

### `POST /expedition/settle`
- Payload: `{ requestId, expectedRevision }`. Session-only.
- Ownership: an active expedition must belong to the account. Idempotent explicit settlement (see Offline settlement algorithm and Revision & idempotency protocol for the no-op case). Does not require stopping the expedition.
- Response: `{ ok: true, data: SettlementResultDTO, revision }` where `SettlementResultDTO = { creditedCycles, elapsedMs, discardedMs, rewards: { xp, gold, items }, checkpointAt, outcomes: { wins, losses }, overflow: { convertedCount, convertedGold }, recentCycles: CycleLogEntryDTO[] }`. **M1-08 additive fields (not a breaking change to the original shape):** `outcomes` (cycle win/loss totals), `overflow` (count/gold of drops converted because inventory was at the 100 cap — needed by ui-spec.md's `inventory.overflow`), and `recentCycles` (the most recent cycles, **at most 10 entries**, each a `CycleLogEntryDTO = { cycle, result, rounds, gold, drop, converted }`). Types are in `packages/contracts/src/index.ts`.
- Errors: `unauthenticated`, `validation` (no active expedition to settle — this is a precondition failure on this endpoint, not `active_expedition`, since `active_expedition` is reserved for endpoints that are blocked *by* an active expedition, not ones that require one), `conflict` (stale revision), `internal`.

### `POST /expedition/stop`
- Payload: `{ requestId, expectedRevision }`. Session-only.
- Transaction: settles all eligible complete cycles exactly like `settle`, discards the fractional remainder, sets `status="none"`, unfreezes loadout (equip/spec editable again).
- Response: `{ ok: true, data: { finalSettlement: SettlementResultDTO, expedition: ExpeditionViewDTO }, revision }` — `finalSettlement` carries the same M1-08 additive fields as `settle`'s response, and `expedition` omits `rngState`/`seed` like `start`'s response.
- Errors: `unauthenticated`, `validation` (no active expedition), `conflict`, `internal`.

### `POST /boss/challenge`
- Payload: `{ requestId, expectedRevision }`. Session-only.
- Ownership: account; no entry cost; usable regardless of expedition status (manual challenge is outside expedition — architecture.md).
- Transaction: server generates deterministic seed `seed(accountId, bossId, requestId)`, simulates boss battle via `packages/game`, writes `BattleReport`. If result is a win **and** `BossClaim.claimedAt is null`, atomically set `claimedAt=serverNow()` and grant the one-time reward in the same transaction as the report write; if already claimed, the win still returns a report but grants no reward (`rewardGranted: false`).
- Response: `{ ok: true, data: BossChallengeResultDTO, revision }` where `BossChallengeResultDTO = { report, rewardGranted: boolean, reward: { xp, gold, items, overflowConvertedGold } | null }`. **M1-08 additive field:** `reward` describes what the one-time grant contained, and is `null` when nothing was granted (loss, or already claimed). Type is in `packages/contracts/src/index.ts`.
- Errors: `unauthenticated`, `validation` (malformed request), `conflict` (stale revision), `internal`.

### `POST /arena/publish`
- Payload: `{ requestId, expectedRevision }`. Session-only.
- Ownership: account; uses current hero stats/party/equipment at call time.
- Transaction: creates an immutable `TeamSnapshot` row (never updated after insert); does not alter `partyOrder` or any live hero.
- Response: `{ ok: true, data: { snapshot }, revision }`.
- Errors: `unauthenticated`, `validation` (party incomplete), `conflict`, `internal`.

### `GET /arena/snapshots`
- Payload: query `?excludeMine=true|false`. Public. Returns summaries only (no live stats, no inventory). `excludeMine` is honored only when a session cookie is present; without one it is ignored and all snapshots are returned.
- Response: `{ ok: true, data: { snapshots: SnapshotSummary[] } }`.
- Errors: `internal`.

### `GET /arena/snapshots/:snapshotId`
- Payload: path param. Public — this is the endpoint the prose in "Public vs account-private data" refers to as "fetched by ID for opponent preview." Returns the full frozen party/stats of one published snapshot, never the owner's live data.
- Response: `{ ok: true, data: { snapshot } }`.
- Errors: `not_found` (unknown or never-published snapshotId), `internal`.

### `POST /arena/challenge`
- Payload: `{ requestId, expectedRevision, snapshotId }`. Session-only for the challenger.
- Ownership: challenger is the session account; `snapshotId` must exist and may belong to any account — reading a published snapshot as simulation input is the one cross-account read allowed, and it is read-only.
- Transaction: loads challenger's **current** live party/stats, loads the target `TeamSnapshot` (frozen, read-only), simulates with a fresh server seed, writes a `BattleReport` under the challenger's account only. Never writes to the opponent's account.
- Response: `{ ok: true, data: { report }, revision }`.
- Errors: `unauthenticated`, `not_found` (snapshotId missing), `validation` (challenger party incomplete), `conflict`, `internal`.

### `GET /battle-reports/:reportId`
- Payload: path param. Session-only. Ownership: the report must have been created for the session's own `accountId` (as challenger for arena, or as owner for pve/boss).
- **Decision:** a report that does not exist and a report that belongs to a different account both return `not_found`, with the same message and no `details`. This is the one deliberate departure from using `forbidden` for ownership failures elsewhere in this document: a distinct `forbidden` here would let a client distinguish "exists but isn't yours" from "doesn't exist," which is the ID-enumeration leak architecture.md's "reject cross-account IDs" rule is meant to prevent. Every other endpoint's `forbidden` (e.g. equip/unequip/specialization/party-order) is safe to keep distinct from `not_found` because the referenced hero/item IDs are not independently guessable report-style secrets and the caller already knows its own roster.
- Response: `{ ok: true, data: { report } }`.
- Errors: `unauthenticated`, `not_found`, `internal`.

## Revision & idempotency protocol

- Each account has a single integer `revision`. `GET` requests never read a stale `revision` into a write decision and never change it.
- Every mutating request carries `requestId` (client UUID) and `expectedRevision`.
- **This is the one canonical transaction order for every mutating endpoint; no endpoint-specific section overrides it.**

  1. Begin transaction.
  2. Look up `IdempotencyReceipt` for `(accountId, command, requestId)` — **this lookup always runs first, before any ownership, precondition (including `active_expedition`), or revision check.** A retried request must return its original result even if the account's state has since changed in ways that would newly fail a precondition — the mutation already happened once and is not re-evaluated against new conditions.
     - If found and `fingerprint` (hash of command + normalized payload) matches: commit nothing new, return the stored `resultPayload` with its stored revision. This is the retry path.
     - If found and fingerprint differs: rollback, return `conflict` with current revision and no mutation (reused ID, different data — rejected per architecture).
     - If not found: continue to step 3 (this is a fresh request).
  3. Run the endpoint's ownership and precondition checks (e.g. hero/item belongs to account, `active_expedition` lock, level ≥ 3). A failure here rolls back and returns the specific error (`forbidden`, `active_expedition`, `validation`, `not_found`) **without** touching revision or writing a receipt — a request that never got far enough to be "attempted" is not idempotency-tracked, so a corrected retry with the same `requestId` after fixing the precondition is expected and will reach step 4 normally.
  4. Verify `expectedRevision === currentRevision`. If not equal: rollback, return `conflict` with current revision (stale request) — no receipt written.
  5. Apply the mutation's state changes.
  6. If step 5 changed any persisted field (including `checkpointAt`, rewards, or flags — **not** counting a settlement that credits zero cycles, see below), increment revision by 1. A zero-effect commit leaves revision unchanged.
  7. Insert the `IdempotencyReceipt` row (fingerprint + result payload + the resulting revision, whether bumped or not) in the **same transaction** as the mutation.
  8. Commit. Return the result with the resulting revision.

- **No-op settlement and revision:** `expedition/settle` (and the settlement portion of `expedition/stop`) when `creditedCycles === 0` makes no persisted change — `checkpointAt`, rewards, and `cyclesCompleted` are all unchanged — so step 6 does **not** increment revision. The call still completes steps 1-8: it passes precondition/revision checks normally, "applies" a zero-sized mutation, and writes a receipt recording `creditedCycles: 0` at the unchanged revision. A retry of that same `requestId` returns the identical zero-credit result; a later distinct settle request still compares `expectedRevision` against the same unchanged number, so no revision churn from polling is possible.
- This guarantees: identical retry → identical result with no double-apply and no double-decrement/increment; concurrent requests at the same revision → only one commits, the other sees `conflict` and must refetch state before retrying with the new `expectedRevision`.
- Idempotency receipts are retained for the account's lifetime in M1 (no expiry); this is acceptable at M1 data scale and is noted as a future bound if storage becomes a concern (not an M1 blocker).

## Offline settlement algorithm (frozen)

Inputs at settlement time: `checkpointAt` (last processed instant), `subCycleRemainderMs` (always 0 — see below), `serverNow()`, `rulesVersion`, `frozenLoadout`, `rngState`, cap = 8h = 28,800,000 ms, cycle length = 60,000 ms, max cycles/settlement = 480.

```
elapsedMs = serverNow() - checkpointAt
if elapsedMs < 0: elapsedMs = 0                     // clock rollback clamps to zero, never negative, never credits
cappedMs = min(elapsedMs, 28_800_000)                 // 8-hour cap
discardedMs = elapsedMs - cappedMs                    // time beyond cap is permanently discarded
rawCycles = floor(cappedMs / 60_000)
creditedCycles = min(rawCycles, 480)                  // 480-cycle batch cap
simulate `creditedCycles` whole 60s cycles deterministically using rngState, advancing rngState each cycle
checkpointAt_new = checkpointAt + discardedMs + creditedCycles * 60_000   // M1-08 decision: discardedMs must be re-added so capped/discarded time is never re-credited on a later settle (see worked examples 5/6); this is unchanged whenever discardedMs = 0 (e.g. the 61s remainder case), and is NOT serverNow()
subCycleRemainderMs stays 0 in M1: a cycle is indivisible; partial seconds within an incomplete cycle are simply not yet checkpointed (checkpointAt only advances by whole cycles)
persist checkpointAt_new, rngState, cyclesCompleted += creditedCycles, rewards(xp/gold/items)
commit (same transaction as revision bump + idempotency receipt)
```

Because `checkpointAt` only ever advances by whole-cycle increments, "sub-cycle remainder" in the architecture note reduces, for M1's 60s/no-fractional-cycle rule, to "the elapsed time since the last whole cycle, which is never checkpointed and is recomputed from `serverNow() - checkpointAt` on the next settlement." No separate remainder field is needed; `subCycleRemainderMs` is kept in the schema only to simplify a future sub-60s cycle length without a migration, and stays 0 in M1.

### Worked examples

All examples start from a freshly started expedition with `checkpointAt = T0`.

1. **59 seconds elapsed.** `elapsedMs=59000`. `rawCycles = floor(59000/60000) = 0`. `creditedCycles=0`. `checkpointAt` unchanged at `T0`. No reward. Per the Revision & idempotency protocol's no-op rule: the call still runs the full transaction and writes a receipt recording "0 cycles settled" at the **unchanged** revision (no increment, since nothing persisted actually changed) — that receipt makes a retry of the same `requestId` return the identical zero-credit result.
2. **60 seconds elapsed.** `elapsedMs=60000`. `rawCycles=1`. `creditedCycles=1`. One cycle simulated; `checkpointAt_new = T0+60000`. Rewards for 1 cycle granted.
3. **61 seconds elapsed.** `elapsedMs=61000`. `rawCycles=1` (`floor(61000/60000)=1`). `creditedCycles=1`. `checkpointAt_new = T0+60000`, leaving 1000ms unconsumed — recoverable on the next settlement by computing fresh `elapsedMs` from the new `checkpointAt` and `serverNow()`. Equal to example 2's grant; the extra 1s is never lost, just deferred.
4. **Partitioned settlement equals continuous settlement.** Settle at T0+60s (credits 1 cycle, checkpoint→T0+60s), then settle again at T0+125s: `elapsedMs=65000`, `rawCycles=1`, credits 1 more cycle, checkpoint→T0+120s, 5s unconsumed. Total credited across both calls = 2 cycles. A single settle at T0+125s directly: `elapsedMs=125000`, `rawCycles=2`, `checkpointAt_new=T0+120000`. Same 2 cycles credited either way — this is the partition-invariance guarantee (A06).
5. **8-hour cap.** Expedition left uncollected for 10 hours: `elapsedMs=36,000,000`. `cappedMs=28,800,000`. `discardedMs=7,200,000` (2 hours permanently lost). `rawCycles=480`. `creditedCycles=min(480,480)=480` (cap and per-settlement batch limit coincide at exactly 8h/60s=480 cycles, so one settlement fully consumes the capped window). `checkpointAt_new = T0 + 28,800,000`. The response surfaces `elapsedMs=36,000,000`, `discardedMs=7,200,000`, `creditedCycles=480` for the UI's "elapsed/credited/discarded" summary (first-playable.md requirement).
6. **Repeated cap collection cannot recover discarded time.** Immediately after example 5, call settle again with no further real time passed: `elapsedMs=0` (or whatever tiny real delta occurred), `rawCycles=0`, nothing credited. The discarded 2 hours is gone because `checkpointAt` already advanced past it; it is not stored anywhere for later recovery. If instead the account waits another 10 hours before the first-ever settle (never settling example 5 separately), the same clamp applies once: still only 480 cycles credited for the entire 20-hour absence, not 960 — the cap is per elapsed-window-since-checkpoint, not per wall-clock-hour.
7. **Clock rollback.** Server/system clock briefly reports a time before `checkpointAt` (NTP correction, VM pause). `elapsedMs = serverNow() - checkpointAt < 0` → clamped to 0. `creditedCycles=0`, checkpoint unchanged. No negative reward, no crash. When the clock catches up, the next settle computes elapsed from the true current time vs. the unchanged checkpoint, so no time is double-lost — only genuinely-unprocessed real time is ever credited once the clock stabilizes.
8. **Retry (same requestId).** Client calls `expedition/settle` with `requestId=R1`, it commits (checkpoint advances, revision n→n+1, receipt stored for R1). Network drops the response. Client retries with the same `R1`. Server finds the existing receipt, fingerprint matches (no payload beyond requestId for this endpoint, so always matches), returns the **stored** result (same credited cycles, same revision n+1) without re-settling. A second distinct call with a new `requestId=R2` at the same moment, before R1's effect is known, would see `expectedRevision` the client still holds as `n` (pre-R1) and get `conflict` with current revision `n+1` — forcing a refetch, preventing double-credit from two near-simultaneous distinct settle calls (A07).
9. **Loadout freeze.** While `expedition.status="active"`, a **fresh** `equip`, `unequip`, or `specialization` request returns `active_expedition` at protocol step 3 (precondition check), before the revision check — regardless of whether `expectedRevision` is correct, since the precondition is checked first. A **retried** request with a `requestId` that already succeeded before the expedition started is unaffected by this lock: step 2's receipt lookup matches first and returns the original stored result without re-running step 3, per the canonical order above. `stop` first runs the full settlement transaction (example 2/3 logic) then, in the **same transaction**, flips `status="none"`, after which fresh equip/spec requests succeed normally. Reordering `partyOrder` is not blocked (M1-01 decision above) since it only affects future expedition starts, not the frozen `frozenLoadout` already in use mid-expedition.
10. **Leveling mid-expedition.** Hero `level`/`xp` are not part of `frozenLoadout` and are not locked by an active expedition: settlement rewards (steps 5-6 of the protocol, applied by `expedition/settle`/`stop`) can raise a hero's `xp`/`level` fields, including crossing the level-3 specialization-unlock threshold, while the expedition is still running. What stays frozen is only `equipment` and `specializationId` — a hero that crosses level 3 mid-expedition becomes specialization-*eligible* but the `hero/specialization` call to actually pick one still returns `active_expedition` until the expedition is stopped, exactly like any other loadout-locked endpoint in example 9. `frozenLoadout` fixes *equipment and specialization choice* for the remainder of the current expedition regardless of any later level-up: a level gained mid-run can only unlock a spec choice usable once the expedition is stopped, never an immediate equip/spec change mid-run. **M1-08 decision (resolves this open item): a level-up's other effects (base stat growth feeding into per-cycle combat) do NOT apply to the *same* expedition's remaining cycles.** Expedition combat uses the hero levels frozen at `/expedition/start` for the rest of that run, exactly like equipment/specialization; a level gained mid-run changes combat stats starting with the *next* expedition. Boss challenges and arena fights are outside an expedition and always use live (current) levels immediately, including mid-expedition. This also keeps partitioned settlement identical to continuous settlement (A06), since re-simulating a already-credited cycle at a new level would break that invariant.

### Atomic transaction boundaries

Every example above commits as one SQLite transaction containing: precondition checks, revision check, state mutation (checkpoint/rewards/claim/snapshot — possibly empty for a zero-credit settle), the conditional revision increment (steps 3-6 of the protocol), and the idempotency receipt insert. Partial application (e.g., rewards granted but checkpoint not advanced, or receipt stored but revision inconsistent with whether state actually changed) never happens because the single transaction either commits all of these effects together or none.

Settlement's "bounded computation before commit with revision recheck" (architecture.md) places the up-to-480-cycle simulation entirely **before protocol step 1** ("Begin transaction"): the server reads `checkpointAt`/`frozenLoadout`/`rngState`/`expectedRevision`'s matching snapshot of state outside any transaction, runs the (potentially costly) in-memory simulation against that snapshot, and only then begins the short DB transaction to apply the result. Because the simulation's inputs were read before the transaction started, step 4's revision recheck inside the transaction is also a check that **nothing the simulation read has since changed**: if `expectedRevision !== currentRevision` at that point, the account was mutated between the read and the commit, so the pre-computed simulation result no longer matches live state and the server returns `conflict` without applying it — the client must refetch state and redo the simulation call from scratch, not just retry the commit. This keeps the DB lock window to the apply-and-recheck step, not the simulation itself.

## Arena, boss, and migration invariants

- **Immutable arena snapshots:** `TeamSnapshot` rows are insert-only; no UPDATE path exists in the schema or API. A challenge reads a snapshot by ID at simulation time; later changes to the publishing account's live heroes have no row to affect, since the snapshot copied the data by value at publish time.
- **Boss one-time claim:** `BossClaim.claimedAt` starts `null`; the only writer is `boss/challenge`, which checks-then-sets inside the same transaction as the report write (step described above), so two concurrent challenge requests can each produce a report, but only the one that commits the transaction first (revision-ordered) can observe `claimedAt is null` and grant the reward — the second commits with `rewardGranted:false`. SQLite's single-writer transaction serialization makes this check-then-set race-free.
- **Overflow conversion boundary:** inventory cap is 100 unequipped item instances (first-playable.md). Any reward transaction that would create a new unequipped instance when the account is already at 100, or would push it over 100, instead converts that specific drop to its documented gold value and never creates the instance row. The check and conversion happen inside the same reward-granting transaction as XP/gold/checkpoint updates (no separate pass that could run against a stale count). Equipping an item (reducing unequipped count) never retroactively un-converts a prior drop.
- **Migration/reopen behavior:** `SchemaVersion` table holds the applied migration version; `apps/server` runs pending migrations from an empty DB or an existing one on startup. An `Expedition.rulesVersion` fixed at `expedition/start` is compared against the server's `currentRulesVersion` on every settle/stop call; if they differ, the server returns `validation` with `details.reason="unsupported_rules_version"` and a message directing to the explicit local reset/migration path — no silent reroll of rewards under a different ruleset. Reopening an existing save (restart with no schema change) must reproduce identical `/account/state` output to before restart, since no mutation occurred.
- **Test clock/seed injection:** `packages/game` functions take `now`, `rngSeed`, and `elapsedDuration` as explicit parameters (never read a global clock/RNG) per architecture.md. `apps/server` exposes a clock/RNG abstraction injected at service-construction time; Vitest/Playwright fixtures substitute a controllable clock (for 59/60/61s and rollback cases) and fixed seeds (for deterministic combat/arena/boss outcomes), without any test-only HTTP endpoint or production code branch keyed on `NODE_ENV`. A documented dev-only clock-advance command (first-playable.md) is a separate, explicitly-labeled debug affordance, not the same mechanism as the test harness's injected clock, and must never be reachable as a normal player action.

## Package interface consistency

- `packages/contracts` exports every DTO/enum above plus Zod schemas per endpoint; it imports nothing from `apps/server`, `apps/web`, or `node:sqlite`.
- `packages/game` exports pure functions consuming `{ state, rulesVersion, rngSeed, elapsedDuration }`-shaped arguments and returning a new state + event log; it imports nothing from `packages/contracts` (contracts may reference game's output *types* via a one-way dependency: `contracts -> game` types only, never `game -> contracts`).
- `apps/server` is the only package allowed to import `node:sqlite`, read `Date.now()`, or generate unseeded randomness; it depends on `contracts`, `game`, and `content`.
- `packages/content` exports versioned, validated static data (class/item/enemy definitions, affix tables) consumed by both `game` (rules) and `apps/server` (lookups for responses); it has no dependency on `contracts`, `game`, or `apps/server`.

No circular package dependency exists in this graph: `content` and `contracts`' type-only edge to `game` are the only cross-package imports besides `apps/server`'s aggregation.

## Open items for downstream tasks (not blockers)

- M1-02 supplies the exact combat formulas/stat tables that `packages/game`'s pure functions will implement against the state shapes frozen here; no DTO shape change is anticipated.
- M1-02 supplies the exact XP curve. The mid-expedition level-up stat-timing question is resolved by the M1-08 decision recorded in Worked example 10: expedition combat uses levels frozen at start for the rest of that run; boss/arena use live levels immediately.
- M1-05 must confirm `node:sqlite` supports the transaction pattern described (short transactions, prepared statements, revision recheck before commit) on the pinned Node version; if it cannot, report back here before M1-07 proceeds, since the idempotency/revision protocol assumes standard ACID transactions.
- M1-07 implements session/auth and the ownership checks enumerated per endpoint above; the account-private vs public data split here is the authorization contract it must satisfy.

---

## M2-01 addition: second expedition area (M2 amendment, additive only)

The sections above (through "Open items for downstream tasks") are the frozen M1-01 surface and are **unchanged** by this amendment. Everything below is new for M2: it adds one entity, one account-private field, one Expedition field, and two endpoints. No M1 endpoint payload, response shape, or error set changes.

### New entity

```ts
Area { areaId, name, unlockRequirement: { kind: string, value?: unknown } }
```

`Area` is server-owned reference data, not a per-account row — analogous to `packages/content`'s class/item/enemy definitions, not to `Account`/`Hero`. `unlockRequirement` is an opaque, versioned descriptor; this contract fixes only that the field exists and is evaluated server-side into a boolean `unlocked` per account (see `GET /areas` below). The exact `kind` values (e.g. hero-level threshold, prior boss clear) and the concrete area roster/IDs are **not** fixed here — that is M2-02's content decision, constrained only by this shape.

### Additive fields on existing entities

- **`Account`** gains `selectedAreaId` (the account's currently chosen area for future expedition starts). Every existing M1 account is migrated to the starter area's `areaId` when this field is introduced, so `/account/state` never returns a null/missing `selectedAreaId` for a pre-existing save. The starter area's exact `areaId` constant is assigned by M2-02; this contract only requires that the migration target be unambiguous and resolvable at migration time.
- **`Expedition`** gains `areaId`, frozen at `/expedition/start` exactly like `rulesVersion` (copied from the account's `selectedAreaId` at that instant; later changing `selectedAreaId` does not affect an already-running expedition). `ExpeditionViewDTO` (returned by `start`/`stop`) gains `areaId` as an additive field, following the same additive-field convention already used for M1-08's `wins`/`losses`/`outcomes`/`overflow`/`recentCycles`.

### `GET /account/state` (additive field only)

- Existing response shape is unchanged except: `data` gains `selectedAreaId`. No new error cases. This is the one touch to an M1-01 endpoint, and it is strictly additive — any M1 client reading the existing fields is unaffected.

### `GET /areas` (new endpoint)

- Payload: none. Session-only — unlocked/selected status is per-account, so this follows the session-only rule for account-private data (architecture.md's public/private split), unlike the static, account-agnostic content served by `packages/content`.
- Response: `{ ok: true, data: { areas: AreaSummaryDTO[] } }` where `AreaSummaryDTO = { areaId, name, unlocked: boolean, isSelected: boolean }`. A read never grants rewards or mutates state (same invariant as `/account/state`).
- Errors: `unauthenticated`, `internal`.

### `POST /area/select` (new endpoint)

- Payload: `{ requestId, expectedRevision, areaId }`. Session-only.
- Ownership/precondition, in protocol order (step 3): account has no active expedition (`active_expedition` — switching the selected area mid-run must not desync from the already-frozen `Expedition.areaId`, mirroring the equip/unequip/specialization lock in Worked example 9); `areaId` must reference a known `Area` (`not_found` otherwise, matching the `arena/challenge` treatment of an unknown `snapshotId`); the area must be `unlocked` for this account (`forbidden` otherwise — the area exists but access is denied, the same semantic `forbidden` already carries for valid-but-disallowed references elsewhere in this document).
- Transaction: sets `Account.selectedAreaId = areaId`. Follows the canonical revision/idempotency protocol unchanged (steps 1-8 above); a no-op reselect of the already-selected area still increments revision only if the stored value actually changes (selecting the currently-selected area again is a zero-effect commit under the same no-op rule used for zero-credit settlement).
- Response: `{ ok: true, data: { selectedAreaId }, revision }`.
- Errors: `unauthenticated`, `not_found` (unknown `areaId`), `forbidden` (known but locked `areaId`), `active_expedition` (expedition running), `conflict` (stale `expectedRevision`), `internal`.

### Package boundaries (unchanged)

`Area` definitions live in `packages/content` (static, validated, versioned, no dependency on `contracts`/`game`/`apps/server` — unchanged rule). Per-account `selectedAreaId`/unlock evaluation lives in `apps/server`, consistent with `apps/server` being the only package that reads account state and generates derived per-account views. `packages/contracts` exports `Area`, `AreaSummaryDTO`, and the new endpoints' Zod schemas alongside the existing M1 exports — same import rules as before (no new edges).

### Open question for Systems Designer (M2-02)

Before M2-02 specifies area-2 content, it must pin down: (1) the concrete `areaId` values including the starter area's `areaId` (used for the M1-save migration default above), (2) the `unlockRequirement.kind` values this contract leaves opaque (e.g. a hero-level threshold vs. a specific boss clear) and their exact evaluation rule, and (3) whether area 2 introduces a distinct `bossId` (no contract change needed either way — `BossClaim` is already keyed by `bossId`, so multiple areas each owning a boss is already supported by the existing M1 shape). None of these block this amendment; they are content decisions within the shape fixed here.

---

## M2-25 addition: roster, dual class/skills, formation, crafting, dungeons, battle replay (M2 amendment)

Everything through the M2-01 addition above is **unchanged** by this amendment except where this
section says otherwise. This section formalizes, as frozen contract shapes, the migration plan in
`classes.md` section 9 and the implementation requirements in `gear.md` sections 4-6, per
`design/studio/milestones/M2.md`. It is additive to the package-boundary rules already frozen above:
`packages/contracts` still imports nothing from `apps/server`/`apps/web`; `packages/game` still takes
no dependency on `contracts`; `apps/server` is still the only package touching `node:sqlite`/clock/RNG;
`packages/content` still owns static class/skill/recipe/dungeon definitions.

Two M1 shapes are **replaced**, not extended, because their M1 shape cannot express the new rules
(a fixed 3-tuple party, a single specialization choice). Both have an explicit migration below.

- `Hero.specializationId` is **removed**; replaced by `secondaryClassId` and `skillLoadout`.
- `PartyOrder` (fixed 3-tuple) is **removed**; replaced by `PartyFormation` (5 slots, 1-5 filled).
- `ItemInstance.affixId` is **removed**; replaced by `rarityId` and `affixes` (gear.md section 2).

This is acceptable pre-launch (M1 is not released to real players; `release-verdict.md` accepted the
milestone internally, not a live save base to preserve across a real deployment) and is scoped
narrowly to these three fields — every other M1 entity/endpoint above is untouched.

### New `ErrorCode` value

`ErrorCode` gains `"active_dungeon"`, additive to the M1-01 enum (`"validation" | "unauthenticated" |
"forbidden" | "not_found" | "conflict" | "active_expedition" | "active_dungeon" | "internal"`). Any
client branching only on known M1 codes is unaffected, since it already has a default/`internal`-style
fallback (no client code change is implied by adding an enum member in a closed `switch` without one,
but this document does not audit `apps/web` — that is M2-26/27's implementation concern).

**Progression-activity lock (gear.md section 4: "Only one progression activity — expedition OR
dungeon — may run per account"):** `POST /expedition/start` and `POST /dungeon/start` each check, at
protocol step 3, that *neither* activity is active. If an expedition is active, both return
`active_expedition`; if a dungeon is active, both return `active_dungeon`. The lock is symmetric: an
active expedition blocks starting a dungeon and vice versa.

### Changed entities

```ts
Hero {
  heroId, accountId,
  primaryClassId: string,            // was `classId`; direct rename, same values (classes.md section 9.1)
  secondaryClassId: string | null,   // NEW — null until assigned at level >= 3
  level, xp,
  skillLoadout: {                    // NEW — replaces specializationId
    active: [string, string],        // skillId slot 1, slot 2 (classes.md 4.1 priority order); "" for an unfilled slot
    passive: [string, string],       // skillId slot 1, slot 2; "" for an unfilled slot
  },
  equipment: { weapon, armor, trinket }  // unchanged shape
}

PartyFormation {
  accountId,
  slots: [HeroId | null, HeroId | null, HeroId | null, HeroId | null, HeroId | null],
  // index 0-2 = front row, 3-4 = back row (classes.md section 3); 1-5 non-null distinct owned heroes;
  // nulls only in positions not currently filled — a null is simply "no hero in this slot," not a
  // placeholder actor (classes.md section 3: "no phantom actor, no effect on row-pool computation")
}

ItemInstance {
  itemInstanceId, accountId, definitionId,
  rarityId: "common" | "uncommon" | "rare" | "epic",   // NEW — was absent (rarity didn't exist pre-M2)
  affixes: { affixId: string, value: number }[],        // NEW — replaces affixId; ordered = selection
                                                          // order, stable for reforge (gear.md section 2)
  equippedBy: HeroId | null
}
```

An empty skill-loadout slot (`""`) occurs only for a hero whose class(es) haven't unlocked a second
active/passive yet (classes.md 5.7); it is never a valid `skillId` to submit in `PATCH /hero/loadout`
below, and the engine's action-priority (classes.md 4.1) treats an empty active slot as "not ready."

### New entities

```ts
MaterialBalance { accountId, scrap: number, sigil: number, core: number }
// Account-scoped nonnegative counters (gear.md section 4), returned via /account/state like gold;
// not exposed as a standalone endpoint, same pattern as gold's existing implicit account-state field.

DungeonRun {
  accountId,
  status: "none" | "active",
  dungeonId: string | null,
  startedAt: string | null,
  checkpointAt: string | null,
  currentFloor: number,              // 1-based; the next floor to attempt on settlement
  floorsCleared: number,             // cumulative within this run
  frozenLoadout: unknown | null,     // formation + per-hero primary/secondary/skillLoadout/equipment,
                                      // frozen at /dungeon/start exactly like Expedition.frozenLoadout
                                      // (classes.md 4.2, gear.md section 4: "party/build/gear is frozen
                                      // for the whole run")
  rulesVersion: number | null,
  rngState: string | null,
  outcome: "none" | "cleared" | "failed",  // set when the run ends; "none" while active or unstarted
}
```

`DungeonRun` is deliberately not a repeating-cycle entity like `Expedition`: a dungeon has a fixed,
content-defined floor count (`packages/content`, M2-31) and the run terminates on either clearing the
final (boss) floor or losing any floor (gear.md section 4: "a loss/timeout ends the run with no reward
for that floor" — the whole run, not just that floor, per the content requirement that floors cannot be
retried individually and "no checkpoints for restarting at a cleared floor: a new run begins at floor
1"). Only one `DungeonRun` row per account; starting a new run after one ends overwrites `dungeonId`/
`currentFloor`/`floorsCleared`/`outcome` — the prior run's already-granted floor rewards are not
re-derived from this row (they were credited at settlement time via ordinary gold/XP/material/item
writes) and are not stored as a "run history" beyond the `BattleReport` rows already produced.

### Changed entity: `BattleReport`

```ts
BattleReport {
  reportId, kind: "pve" | "boss" | "arena" | "dungeon_floor" | "dungeon_boss",  // two new kinds, additive
  participantsSnapshot: BattleParticipantsSnapshotDTO,  // was `unknown`; now the typed shape below
  seed, rulesVersion,
  events: BattleEventDTO[],                              // was loosely typed; now the shape below
  result, createdAt
}

BattleParticipantsSnapshotDTO {
  units: BattleUnitDTO[]
}

BattleUnitDTO {
  unitId: string,            // HeroId for a hero; a stable per-battle enemy-instance ID otherwise
  side: "A" | "B",           // "A" = the account's own party in every kind except arena, where it is
                              // always the challenger (contracts.md's existing `arenaSpeedOrderCompare`
                              // tie-break convention, combat.md 8.1)
  kind: "hero" | "enemy",
  name: string,               // hero display name, or the enemy/boss content display name
  classId: string | null,     // hero's primaryClassId; null for an enemy/boss unit
  secondaryClassId: string | null,  // null for an enemy/boss unit or a hero with none assigned
  slotIndex: number,          // 0-4; classes.md 3 / combat.md 8.1's shared slot-index range
  maxHp: number,
}

BattleEventDTO {
  readonly damageBreakdown?: DamageBreakdown,  // additive evidence; 2026-10-22 decision below
  round: number,
  type: string,                 // unchanged M1 field; now also carries skill-specific values
  sourceId: string | null,
  targetId: string | null,      // one event per target for an AoE hit (combat.md 8.6)
  amount: number,                // negative=damage, positive=healing, 0 for non-HP events
  hpAfter: number | null,
  skillId: string | null,                                      // NEW
  crit: boolean,                                                // NEW
  dodged: boolean,                                              // NEW
  statusApplied: { statusId: string, duration: number, stacks?: number } | null,  // NEW
  statusExpired: string | null,                                  // NEW
  death: boolean,                                                // NEW
}

DamageStep {
  readonly kind: string,
  readonly inputs: readonly number[],
  readonly value: number,
}

DamageBreakdown {
  readonly steps: readonly DamageStep[],
  readonly damage: number,
  readonly hpBefore: number,
  readonly hpLoss: number,
}
```

#### Recorded additive decision: damage calculation evidence (2026-10-22)

CTO task `195f2cb0-d2b9-4998-97e7-f1a1860bbc50` records this contract amendment for
Gameplay Programmer task `c5bd2700-b2bc-4995-8741-16f5521c9d7b` before implementation acceptance.
The exact `BattleEventDTO` above gains optional readonly `damageBreakdown?: DamageBreakdown`.
This extends the event metadata described in `combat.md` section 8.6; it does not amend combat rules.

- `steps` records server-evaluated arithmetic in evaluation order. Each `DamageStep` contains a
  `kind` code, the recorded numeric `inputs`, and the evaluated `value`. Record only evaluated
  stages; evidence must not evaluate skipped calculations or consume additional RNG draws.
- `damage` is resolved damage before HP clamping or Vital Surge. `hpBefore` is the target's HP
  immediately before application. `hpLoss` is actual HP loss after clamping/survival effects and
  equals negative event `amount`; `hpBefore - hpLoss` equals event `hpAfter`.
- Direct hits, including dodges, and Burn ticks carry evidence. A dodge records zero damage and
  zero HP loss without inventing skipped base-damage calculations or crit rolls. AoE and sequential
  hits retain independent evidence per target event. Older reports and other events may omit the
  field; missing evidence remains unavailable rather than being reconstructed.
- The UI only formats recorded evidence; it never recalculates combat formulas or derives missing
  evidence from HP changes. Unknown step kinds may use a neutral label with recorded numbers.
- This is an additive report-data change only: no intended balance, RNG consumption, endpoint,
  database migration, or rules-version change. Existing event fields keep their meanings; existing
  report JSON can retain the optional data, and legacy reports remain renderable without backfill.

This is the exact TypeScript shape `combat.md` section 8.6 left to this document. The battle view
(M2-27) can render every acceptance-check-4/5 requirement (name, class, numeric HP, status + duration,
turn-by-turn actor/skill/target/amount, explicit death) from `participantsSnapshot.units` (initial state:
every unit's starting HP equals `maxHp`) plus a forward replay of `events` — no separate "current state"
endpoint or per-round snapshot is needed, since `hpAfter` and `statusApplied`/`statusExpired` make the
full timeline reconstructible from the event list alone, consistent with architecture.md's existing
"UI initializes HP from this snapshot and applies each recorded `hpAfter`" note. A dungeon floor is one
`BattleReport` each (kind `dungeon_floor` for an ordinary floor, `dungeon_boss` for the final floor),
fetched individually via the existing `GET /battle-reports/:reportId` — no new report-retrieval endpoint.

### New endpoints

#### `POST /hero/recruit`
- Payload: `{ requestId, expectedRevision, primaryClassId }`. Session-only.
- Precondition (step 3): `primaryClassId` is one of the 6 base classes (classes.md section 1);
  `ownedHeroCount < 20` (roster cap, classes.md section 8); account gold `>= 150 * ownedHeroCount`
  (reference cost, classes.md section 8 — a placeholder constant Economy Designer may retune in M2-28
  without a contract change, since the formula shape, not the `150`/`20` constants, is what's frozen
  here). Not locked by `active_expedition`/`active_dungeon` — recruiting only adds to the roster, never
  touches a frozen loadout or formation.
- Transaction: debits gold, creates `Hero { primaryClassId, secondaryClassId: null, level: 1, xp: 0,
  skillLoadout: auto-filled per classes.md 5.7, equipment: all-null }`.
- Response: `{ ok: true, data: { hero }, revision }`.
- Errors: `unauthenticated`, `validation` (unknown `primaryClassId`, `details.reason="roster_full"`, or
  `details.reason="insufficient_gold"`), `conflict`, `internal`.

#### `PATCH /party/formation`
- Payload: `{ requestId, expectedRevision, slots: [HeroId|null, HeroId|null, HeroId|null, HeroId|null, HeroId|null] }`. Session-only. **Replaces `PATCH /party/order`**, which is removed (M2+; see entity
  change above). There is no payload-compatible overlap worth preserving under the old path: the old
  3-tuple cannot represent 5 slots or nulls, so reusing the path would silently change its contract
  under the same name, which this document avoids per its own convention of explicit, named changes.
- Ownership: every non-null entry is a distinct heroId belonging to the session account; 1-5 non-null
  entries (classes.md section 3's relaxed minimum, section 11). Allowed at any expedition or dungeon
  status, like M1's `/party/order` (classes.md section 3: formation only affects future
  expedition/dungeon starts, never the already-frozen `frozenLoadout` of a running activity) — so
  `active_expedition`/`active_dungeon` do **not** apply to this endpoint, mirroring the M1-01 decision
  on `/party/order`.
- Response: `{ ok: true, data: { formation: PartyFormation }, revision }`.
- Errors: `unauthenticated`, `validation` (0 or >5 non-null entries, duplicate heroId), `forbidden`
  (a non-null entry is a foreign heroId), `conflict` (stale revision), `internal`.

#### `POST /hero/secondary-class`
- Payload: `{ requestId, expectedRevision, heroId, secondaryClassId }`. Session-only. `secondaryClassId`
  must be one of the 6 base classes and may equal the hero's current `secondaryClassId` (a no-op commit
  under the standard no-op-revision rule) but may never equal the hero's own `primaryClassId` (a hero
  cannot dual-class into itself). **Decision:** this contract does not accept `null` — once assigned, a
  secondary class can be switched to a different class but not cleared, since nothing in `classes.md`
  requires un-assignment and a "has no secondary" state is already reachable (every hero starts there).
- Ownership/precondition (step 3, in order): hero belongs to account (`forbidden` if not, matching
  `/hero/specialization`'s existing unknown-or-foreign-heroId-returns-`forbidden` precedent) → hero
  `level >= 3` (`validation`) → `active_expedition` → `active_dungeon` (classes.md 4.2: same lock timing
  as loadout changes) → `secondaryClassId` valid and distinct from `primaryClassId` (`validation`).
- Transaction: sets `Hero.secondaryClassId`. Does **not** auto-fill `skillLoadout` with the new class's
  skills — the hero's existing loadout slots are left exactly as they were (now drawing from a pool that
  additionally includes the new secondary's unlocked skills, classes.md 5.7) until a separate
  `PATCH /hero/loadout` call changes them. This keeps the two decisions (which secondary class; which
  skills from the resulting pool) independently reversible, matching classes.md section 4's framing of
  loadout choice as the thing that "starts to matter" once a secondary exists, not an automatic side
  effect of assigning one.
- Response: `{ ok: true, data: { hero }, revision }`.
- Errors: `unauthenticated`, `validation` (level < 3, unknown `secondaryClassId`, equals own
  `primaryClassId`), `forbidden` (unknown or foreign `heroId`), `active_expedition`, `active_dungeon`,
  `conflict`, `internal`.

#### `PATCH /hero/loadout`
- Payload: `{ requestId, expectedRevision, heroId, active: [string, string], passive: [string, string] }`.
  Session-only. An entry may be `""` to leave a slot empty (classes.md 5.7); a non-empty entry must be a
  `skillId` currently unlocked for the hero (union of primary's and, if assigned, secondary's unlocked
  skills at the hero's current level, classes.md 5.7) and of the matching kind (`active` entries must be
  active skills, `passive` entries must be passive skills) — Basic Attack is never a valid entry (it is
  never slotted, classes.md section 4).
- Ownership/precondition (step 3): hero belongs to account (`forbidden` if not) → `active_expedition` →
  `active_dungeon` → each non-empty entry is unlocked-and-correct-kind for this hero right now
  (`validation`) → no duplicate non-empty skillId within the same kind-array (`validation`; the same
  skillId may appear once in `active` and does not conflict with appearing conceptually once in
  `passive`, since kinds are disjoint by construction).
- Response: `{ ok: true, data: { hero }, revision }`.
- Errors: `unauthenticated`, `validation` (unlocked/kind/duplicate violations), `forbidden` (unknown or
  foreign `heroId`), `active_expedition`, `active_dungeon`, `conflict`, `internal`.

#### `POST /craft`
- Payload: `{ requestId, expectedRevision, recipeId, definitionId, replacementItemInstanceId? }`.
  Session-only. `recipeId` is one of `craft_uncommon`/`craft_rare`/`craft_epic` (gear.md section 5);
  `definitionId` is one of the 9 base item definitions (`content.md` 2.1); `replacementItemInstanceId`
  is optional and only meaningful when the account is at the 100-item unequipped cap.
- Ownership/precondition (step 3, in order): not locked by neither activity — `active_expedition` →
  `active_dungeon` (gear.md section 5: "craft/reforge require no active progression activity") →
  `recipeId`/`definitionId` known (`validation` if not — these are closed, content-defined sets, so an
  unknown value is a malformed request, not a missing-resource lookup) → account gold/scrap/sigil/core
  balances each `>=` the recipe's cost (`validation`, `details.reason="insufficient_materials"` or
  `"insufficient_gold"`) → bag space: if the account is at 100 unequipped items, `replacementItemInstanceId`
  must be supplied and must reference an owned, currently-unequipped item (`forbidden` if it belongs to
  another account, `validation` with `details.reason="bag_full"` if omitted or not unequipped/owned).
- Transaction: debits gold/materials; if a replacement was required and supplied, deletes that item
  instance (gear.md: "consumed atomically by the craft, yields no refund"); draws definition-is-fixed,
  rarity-is-fixed reward RNG for affix IDs/values only (gear.md section 6: crafts omit the chance and
  definition/rarity draws since both are chosen, not rolled); creates one new `ItemInstance` at the
  chosen `definitionId`/rarity with the rolled `affixes`.
- Response: `{ ok: true, data: { item: ItemInstance, replacementConsumed: ItemInstanceId | null }, revision }`.
- Errors: `unauthenticated`, `validation` (unknown recipe/definition, insufficient gold/materials,
  bag-full-without-replacement, replacement not unequipped), `forbidden` (foreign
  `replacementItemInstanceId`), `active_expedition`, `active_dungeon`, `conflict`, `internal`.

#### `POST /reforge`
- Payload: `{ requestId, expectedRevision, itemInstanceId, affixIndex }`. Session-only. `recipeId` is
  **not** part of the payload — the server derives `reforge_uncommon`/`reforge_rare`/`reforge_epic` from
  the target item's own `rarityId`, so a client can never under-pay by claiming a cheaper recipe than
  the item's actual rarity.
- Ownership/precondition (step 3, in order): item belongs to account (`forbidden` if not) →
  `active_expedition` → `active_dungeon` → item is currently unequipped (`validation`,
  `details.reason="item_equipped"` — gear.md: "reforge requires an owned, unequipped item; unequip
  normally first") → item's `rarityId !== "common"` (`validation` — common items cannot reforge) →
  `affixIndex` is a valid index into the item's current `affixes` array (`validation` if out of range) →
  account gold/scrap/sigil/core balances each `>=` the derived recipe's cost (`validation`,
  `details.reason="insufficient_materials"`/`"insufficient_gold"`).
- Transaction: debits gold/materials; rolls a replacement `(affixId, value)` pair per gear.md section 5's
  exact algorithm (eligible-ID pool excludes IDs already present on other untouched affixes; for the
  current slot's own ID, excludes its current value, dropping the ID entirely if no alternative value
  remains; picks ID uniformly, then value uniformly); replaces `affixes[affixIndex]` in place, preserving
  `itemInstanceId`, `definitionId`, `rarityId`, and every other affix untouched.
- Response: `{ ok: true, data: { item: ItemInstance }, revision }`.
- Errors: `unauthenticated`, `validation` (equipped, common rarity, bad `affixIndex`, insufficient
  gold/materials), `forbidden` (foreign `itemInstanceId`), `not_found` (unknown `itemInstanceId`),
  `active_expedition`, `active_dungeon`, `conflict`, `internal`.

#### `POST /dungeon/start`
- Payload: `{ requestId, expectedRevision, dungeonId }`. Session-only.
- Ownership/precondition (step 3, in order): no active expedition (`active_expedition`) → no active
  dungeon (`active_dungeon`) → `dungeonId` references a known dungeon (`not_found` otherwise, matching
  `area/select`'s precedent for an unknown reference) → the dungeon is unlocked for this account
  (`forbidden` otherwise, same precedent) → `PartyFormation` has 1-5 distinct owned heroes (`validation`
  if empty — a dungeon run, like an expedition, needs at least one hero fielded).
- Transaction: freezes current formation/loadout/equipment into `frozenLoadout`; sets `status="active"`,
  `dungeonId`, `startedAt=checkpointAt=serverNow()`, `currentFloor=1`, `floorsCleared=0`,
  `outcome="none"`, `rulesVersion=currentRulesVersion`, `rngState=seed(accountId, dungeonId, startedAt)`.
- Response: `{ ok: true, data: { dungeonRun: DungeonRunViewDTO }, revision }` — `DungeonRunViewDTO` omits
  `rngState`/`seed` exactly like `ExpeditionViewDTO` omits them (M1-08 precedent).
- Errors: `unauthenticated`, `validation` (empty formation), `not_found` (unknown `dungeonId`),
  `forbidden` (known but locked `dungeonId`), `active_expedition`, `active_dungeon`, `conflict`,
  `internal`.

#### `POST /dungeon/settle`
- Payload: `{ requestId, expectedRevision }`. Session-only.
- Ownership: an active `DungeonRun` must belong to the account (`validation` if none, mirroring
  `expedition/settle`'s precedent — this is a precondition failure on an endpoint that *requires* an
  active run, not an `active_dungeon`-style lock).
- **Dungeon floor settlement algorithm** (specializes the Offline settlement algorithm above: same
  `elapsedMs`/clamp/8-hour-cap math, substituting a 180,000 ms floor length for the 60,000 ms cycle
  length, with one added early-termination rule the expedition algorithm doesn't have):
  1. Compute `elapsedMs`, `cappedMs` (8h cap), `discardedMs` exactly as the expedition algorithm.
  2. `eligibleFloors = floor(cappedMs / 180_000)`, further capped at `(dungeon's total floor count) -
     currentFloor + 1` (a run cannot process floors past its own last floor).
  3. Simulate floors one at a time, in order, starting at `currentFloor`, using `rngState` (advancing it
     each floor) and the dungeon's content-defined enemy roster per floor (`packages/content`, M2-31):
     a. Simulate the floor's battle; write one `BattleReport` (`kind: "dungeon_floor"`, or
        `"dungeon_boss"` if this is the dungeon's final floor).
     b. If the result is a win: credit that floor's XP/gold/materials/item reward (gear.md section 4)
        in the same transaction; increment `floorsCleared` and `currentFloor`; if this was the final
        floor, set `outcome="cleared"`, `status="none"` and **stop** (no further floors processed even
        if more `eligibleFloors` remain — the run is over).
     b. If the result is a loss: grant no reward for that floor; set `outcome="failed"`,
        `status="none"` and **stop** — no further floors in this batch are attempted, matching gear.md
        section 4 ("a loss/timeout ends the run with no reward for that floor" — the run, in context).
  4. `checkpointAt_new = checkpointAt + discardedMs + (floors actually processed) * 180_000` — the same
     "re-add discarded time" rule as the expedition algorithm (Worked example 5/6 above), applied per
     floor instead of per cycle; if the run ended mid-batch (win-final or loss), remaining unconsumed
     `eligibleFloors` time is irrelevant, since there is no "next floor" to credit it to once
     `status="none"`.
  5. Persist all of the above plus the revision bump and idempotency receipt in the single transaction,
     exactly like `expedition/settle`.
- Response: `{ ok: true, data: DungeonSettleResultDTO, revision }` where `DungeonSettleResultDTO = {
  floorResults: { floor: number, reportId: ReportId, result: "win" | "loss", isBoss: boolean, rewards: {
  xp, gold, materials: { scrap, sigil, core }, items } }[], outcome: "in_progress" | "cleared" |
  "failed", elapsedMs, discardedMs, creditedFloors: number, checkpointAt, overflow: { convertedCount,
  convertedGold } }`. `floorResults` is in floor order for this call only (not cumulative across calls),
  mirroring `settle`'s `recentCycles` being this-call-scoped-by-construction.
- Errors: `unauthenticated`, `validation` (no active dungeon run), `conflict` (stale revision),
  `internal`.
- **No-op settlement:** identical rule to expedition settlement — if `eligibleFloors === 0` (less than
  180s elapsed), nothing persists, revision does not increment, and a receipt recording zero floors is
  still written for retry-idempotency, exactly like Worked example 1 above.

#### `POST /dungeon/stop`
- Payload: `{ requestId, expectedRevision }`. Session-only. Voluntary abandon (gear.md section 4: "keeps
  earned floors but discards the current floor's partial time; restart cannot reuse it").
- Transaction: runs the same settlement as `dungeon/settle` first (crediting any fully-eligible floors
  completed in the elapsed window), then, in the same transaction, discards any partial progress toward
  the *next* floor (there is no partial-floor credit to discard beyond what settlement already
  processes — a floor is indivisible, same as an expedition cycle) and sets `status="none"`,
  `outcome="none"` if the run had not already reached `"cleared"`/`"failed"` via the settlement step.
- Response: `{ ok: true, data: { finalSettlement: DungeonSettleResultDTO, dungeonRun: DungeonRunViewDTO }, revision }`.
- Errors: `unauthenticated`, `validation` (no active dungeon run), `conflict`, `internal`.

### `GET /account/state` (additive fields only)

- `data` gains `heroes[*].primaryClassId`/`secondaryClassId`/`skillLoadout` (replacing
  `heroes[*].classId`/`specializationId`), `formation: PartyFormation` (replacing `partyOrder`),
  `materials: { scrap, sigil, core }`, and `dungeon: { status, dungeonId, currentFloor, floorsCleared,
  checkpointAt, outcome }` (mirroring the existing `expedition` block's shape) while `status="active"`
  additionally includes `startedAt`, `rulesVersion`. `ItemInstance` entries in `inventory` gain
  `rarityId`/`affixes` in place of `affixId`. No new error cases; reads remain side-effect-free.

### Migration (frozen procedure, formalizing `classes.md` section 9 and `gear.md` section 6)

Applied once by a `SchemaVersion` bump on server startup, inside one migration transaction per account
row (or one global pass; implementation detail for M2-26), before any new endpoint above is reachable:

1. `Hero.classId` → `Hero.primaryClassId`: value copied unchanged (`class_vanguard`/`class_ranger`/
   `class_arcanist` keep their IDs and stat curves, classes.md section 1).
2. `Hero.secondaryClassId` := `null` for every migrated hero.
3. `Hero.specializationId` is dropped. `Hero.skillLoadout` is derived, not copied: auto-filled with the
   hero's primary class's full currently-unlocked kit per classes.md 5.7 (both actives + both passives
   if `level >= 8`; fewer slots filled below that, in unlock order) — never conditioned on the old
   specialization value, since the new system doesn't fork behavior by which of the 2 old specs was
   picked (classes.md section 9, point 3).
4. `Hero.equipment` copied as-is, unchanged.
5. `PartyOrder.order[0..2]` → `PartyFormation.slots[0..2]` (front row), in the same order; `slots[3..4]
   := null` (back row starts empty). `PartyOrder` row is then dropped.
6. `ItemInstance.affixId` → `ItemInstance.rarityId`/`affixes` per gear.md section 6's exact table: no
   affix → `rarityId: "common"`, `affixes: []`; legacy `power` or `warding` → `rarityId: "uncommon"`,
   `affixes: [{ affixId: <same id>, value: 2 }]`; legacy `vigor` → `rarityId: "uncommon"`,
   `affixes: [{ affixId: "vigor", value: 3 }]`. `equippedBy` copied as-is. Every migrated value is legal
   in its item's slot pool (gear.md section 2) by construction of this mapping.
7. New account-scoped `MaterialBalance` row created at `{ scrap: 0, sigil: 0, core: 0 }` for every
   existing account; gold, XP, `BossClaim`, `TeamSnapshot`, and inventory counts are untouched.
8. `DungeonRun` row created at `{ status: "none", dungeonId: null, outcome: "none", ... }` for every
   existing account; no account starts mid-dungeon.
9. Stored `BattleReport` rows are **not** rewritten: `participantsSnapshot` and `events` on pre-M2-25
   rows may be the old loose `unknown` shape (architecture.md's "legacy text-log fallback"); the battle
   view renders them via that fallback path rather than assuming the new typed shape on every row.
10. `Expedition.rulesVersion`/`frozenLoadout` for any account mid-expedition at migration time are left
    untouched by this migration (an active run keeps its pre-M2-25 frozen loadout shape until it next
    settles/stops); the existing `unsupported_rules_version` guard (Arena/boss/migration invariants
    above) is the mechanism that already prevents settling a stale-rules-version run under new rules.

### Package boundary notes (unchanged rule, new owners)

`packages/content` gains class/skill definitions (classes.md), affix/recipe/dungeon-floor tables
(gear.md), consumed by `packages/game` (combat/crafting rules) and `apps/server` (lookups), with the
same no-dependency-on-`contracts`/`game`/`apps/server` rule already frozen above. No new package is
introduced and no existing import edge changes.

### Open items for downstream tasks (not blockers)

- M2-26 implements the dungeon floor-settlement transaction and the craft/reforge RNG-consumption order
  exactly per gear.md section 6's draw-ordering rule (chance, then definition/rarity/affix IDs/values in
  that order; crafts/reforges skip the draws that don't apply to them).
- M2-31 supplies concrete `dungeonId` values, per-dungeon floor counts/rosters, and the
  `floorCount*180 <= 28800` content validation gear.md section 4 requires; no contract shape here
  depends on the exact count.
- M2-28 may retune the `150 * ownedHeroCount` recruit-cost constant and the craft/reforge gold/material
  costs in gear.md's tables; this contract only fixes the mechanic shape (gold-priced, closed recipe
  set, derived-not-client-supplied reforge recipe), not the numbers.
- M2-27 implements the battle-view rendering of `BattleParticipantsSnapshotDTO`/`BattleEventDTO`; no
  further contract decision is anticipated for playback (pause/step/speed/skip are pure client-side
  replay over an already-fetched `events` array, per `gear.md` section 4: "playback ... is purely
  presentation and cannot advance timers or rewards").

---

## M3-05 addition: variable-duration settlement, deferred skills, races/specializations, respec,
## dungeon catalog, seasons and tournament (M3 amendment)

Date: 2026-10-30. Owner: CTO. Task `9946dd81-92ca-4c88-907d-06ebd2528f25`. Inputs:
`design/game/m3-systems.md` (M3-03 freeze), `design/game/economy/m3.md` (M3-04), the cycle-duration
feasibility report, this document's M1/M2 sections above. Everything through the M2-25 addition is
**unchanged** except where stated. No implementation occurs in this task; `packages/*`/`apps/*` are
untouched. Production remains gated by M3-02's explicit M2 acceptance per the milestone.

### 0. Precedence and the one open economy question this resolves

`economy/m3.md` §2.3 left open whether `nominalDurationMs` carries a wall-clock floor in addition to
`resolvedRounds * msPerRound` ("Scenario A" vs "Scenario B"), and explicitly deferred that decision
to this task. **Decision: no floor (Scenario A).** `m3-systems.md` §3/§12 — the already-frozen,
higher-precedence Systems spec — states the formula as "a deterministic positive integer function of
resolved combat length" with no floor term; adding one here would contradict a frozen Design document
rather than implement it. This is a reversible CTO technical call, not a game-direction question: the
milestone text explicitly assigns it ("CTO resolves partial cycles, persisted RNG, rules version,
bounded work/resume, report retention and migration before code... M3-05 must decide whether a floor
exists"). Consequence, carried forward explicitly rather than hidden: `baseline.md`/`tuning.md`'s
minute-band text (built on a fixed 60s/cycle) will read wrong in wall-clock terms once this ships —
cycle-*count* milestones (12 cycles to level 3, etc.) are unaffected, only their minute conversion is.
**Required follow-up, already anticipated by `economy/m3.md` §10 item 1 and the milestone's M3-10
row:** Economy re-derives the minute-band text from measured `resolvedRounds` distributions once
M3-07 ships the new content, and re-runs the §5 catch-up benchmark against the resulting event volume
(flagged below as a required gate before this contract's `MAX_BATTLES_PER_SETTLEMENT` value is
accepted as final). This is not a blocker to freezing the schema below, since the schema is written to
be correct under either eventual volume.

### 1. New global/account-wide primitives

```ts
ServerClock { highWaterMs: number }   // single global row; never decreases
```

Every command that reads "now" for a persisted timestamp or elapsed-time computation (expedition
settle/stop, dungeon settle/stop, respec cooldown, season/tournament boundary checks) computes
`effectiveNow = max(rawServerNow(), ServerClock.highWaterMs)`, uses `effectiveNow` everywhere M1/M2
used `serverNow()`, and persists `ServerClock.highWaterMs = effectiveNow` in the **same transaction**.
This strengthens, without changing the externally observed behavior of, every existing worked example
in this document's Offline settlement algorithm (clock rollback already clamped `elapsedMs` to zero
per-call; the high-water mark additionally guarantees no persisted computation anywhere in the system
can ever observe time moving backwards across *separate* commands, including commands for different
accounts, which a per-call clamp alone does not guarantee). `apps/server` owns this table exactly like
`SchemaVersion`; `packages/game` still never reads a clock directly.

`MAX_BATTLES_PER_SETTLEMENT = 500` (provisional; replaces `480`, see §4). `480` was derived purely
from `28,800,000 ms / 60,000 ms`; once cycle length is variable there is no fixed derivation, so this
is a named CPU-time safety valve, re-measured the same way `480` originally was (`economy/m3.md` §5):
**before this value is treated as final, M3-07/M3-08 must rerun the catch-up benchmark shape from
`economy/m3.md` §5 against the real M3 settlement loop and confirm p95 settlement latency stays under
2000 ms at 500 battles/call on stated hardware; if it does not, lower this constant — never change a
reward table to compensate (the same non-reward-table-fix rule `tuning.md`/`economy/m3.md` already
apply to balance findings applies here to performance findings).**

`msPerRound` is a versioned numeric constant in `packages/content`, keyed by `rulesVersion` exactly
like combat formulas already are (`architecture.md`'s "stable IDs and validated numeric definitions").
Provisional value for the current rules version: `2000` (ms/round, per `m3-systems.md` §3's explicit
"measurement candidate, not a production constant" — the *value* stays open for Economy/QA tuning via
a future rules-version bump; the *mechanism* (frozen per-expedition at start, read-only thereafter) is
fixed here).

### 2. Changed entities

```ts
Hero {
  // ...existing M2-25 fields unchanged (primaryClassId, secondaryClassId, level, xp, skillLoadout,
  // equipment)...
  raceId: string,                        // NEW — one of race_vesper|race_cairn|race_serein; set once
                                          // at recruitment, immutable thereafter (M3-05/m3-systems.md
                                          // §5: "Race changes are out of scope")
  primarySpecializationId: string | null,  // NEW — replaces the M1 specializationId concept the
                                            // M2-25 migration already dropped; null is the default and
                                            // a fully legal permanent state (m3-systems.md §4)
  lastRespecAt: string | null,           // NEW — null means cooldown-eligible immediately (migration
                                          // default for every existing hero, m3-systems.md §5)
}

Expedition {
  // ...existing fields unchanged (accountId, status, startedAt, checkpointAt, frozenLoadout,
  // rulesVersion, rngState, cyclesCompleted)...
  msPerRound: number,                    // NEW — copied from the content-defined constant at
                                          // `/expedition/start`, frozen for the run exactly like
                                          // rulesVersion/areaId already are; a later rules-version
                                          // bump never changes an in-flight run's pacing mid-run
  pendingBattleReportId: ReportId | null,  // NEW — at most one precomputed-but-uncredited battle per
                                            // expedition; see §4
  battlesCompleted: number,               // NEW — renames/generalizes `cyclesCompleted`; "cycle" is
                                           // retired terminology once cycle length is variable.
                                           // `cyclesCompleted` is dropped, not kept dual-named, since
                                           // M1 is pre-release (same acceptable-break precedent the
                                           // M2-25 addition already used for PartyOrder/affixId).
  lastFeedSequence: number,               // NEW — this account's own high-water completionSequence
                                           // (see §6); redundant with querying BattleReport but kept
                                           // on the row to make eviction a cheap comparison, not a scan
}

BattleReport {
  // ...existing fields unchanged (reportId, kind, participantsSnapshot, seed, rulesVersion, events,
  // result, createdAt)...
  // Additive, and valid ONLY for kind="pve":
  ordinal: number | null,                 // NEW — 1-based, scoped to this battle's `runId`; assigned
                                           // at resolution (precompute) time, not credit time
  runId: string | null,                   // NEW — identifies the expedition run (the `Expedition`
                                           // row's own lifetime is not stable across start/stop/
                                           // restart, so `runId` is a separate UUID assigned at
                                           // `/expedition/start` and frozen into the run like
                                           // `rulesVersion`)
  completionSequence: number | null,      // NEW — account-global monotonic, assigned at resolution
                                           // time; used for feed pagination (§6); never reused, never
                                           // decreases, survives run boundaries
  creditedAt: string | null,              // NEW — null while precomputed-but-uncredited (see §4);
                                           // set exactly once, after which this field and `rewards`
                                           // below never change again
  rewards: { xp, gold, items, overflow: { convertedCount, convertedGold } } | null,  // NEW — null
                                           // until `creditedAt` is set; this is the ONE field group
                                           // this document permits to be written by an UPDATE rather
                                           // than only at INSERT (see §4's "one-time transition" rule)
}
```

**The one-time-update exception, stated precisely:** every other `BattleReport` field (`events`,
`result`, `seed`, `participantsSnapshot`, `ordinal`, `runId`, `completionSequence`) is fixed at INSERT
and never changes, preserving the existing "immutable once created" invariant for combat *outcomes*.
Only `creditedAt`/`rewards` may transition exactly once, from `null` to a set value, in the single
transaction that credits the battle (§4). A second credit attempt on an already-`creditedAt`-set row
is rejected as a no-op (idempotency-receipt path, not a new write) — this is the mechanism that
satisfies `m3-systems.md`'s "precomputation may reveal a planned battle but never grants future
rewards": revealing (`events`/`result` visible) and crediting (`rewards` granted) are deliberately two
separate, independently timed writes to the same immutable-except-this row.

### 3. New entities

```ts
SettlementAggregate {
  aggregateId, accountId, runId,
  fromOrdinal: number, toOrdinal: number,          // battle range this aggregate covers
  fromSequence: number, toSequence: number,        // completionSequence range (feed pagination)
  wins: number, losses: number,
  elapsedMs: number, creditedMs: number, discardedMs: number,
  rewards: { xp, gold, items, overflow },           // sum across the covered battles
  createdAt,
}
// Written once per settlement call that credits >=1 battle while evicting underlying full reports
// out of the 50-report window (see §6); retained latest 20/account by createdAt, oldest evicted on
// the 21st insert. Never updated after insert.

PendingSkillChange {
  accountId, heroId, requestId, acceptedAt,
  boundaryOrdinal: number,        // the ordinal of the first not-yet-rolled battle this will apply to
  active: [string, string], passive: [string, string],
  status: "pending" | "applied" | "discarded",
  appliedAt: string | null,
}
// At most one row per (accountId, heroId) with status="pending" at a time; a new queue request for
// the same hero while one is still pending overwrites it in place (§5) rather than inserting a
// second row. A row transitions to "applied" or "discarded" exactly once and is then immutable
// history (kept for the idempotency-receipt / "already applied" response in §5, not pruned here).

DungeonClearRecord { accountId, dungeonId, clearedAt }
// One row per (accountId, dungeonId) that has ever reached outcome="cleared"; insert-only, written
// in the same transaction as the clearing floor's settlement. This is the "persisted clear fact from
// a server outcome, never inventory inference" m3-systems.md §7 requires for Cinder Archive's unlock.

CompetitionEpoch { epoch: string }
// Single global row, set once on the first competition-surface request after this contract ships
// (lazily, not via a startup migration step that would require a wall-clock read outside a command).
// Never updated again; "epoch never resets on restart" per m3-systems.md §8.

SeasonEntry {
  entryId, accountId: AccountId | null,    // null for a fixture seat
  isFixture: boolean, fixtureId: string | null,   // "fixture_m3_01".."04" when isFixture
  seasonIndex: number,                      // floor((effectiveNow - epoch) / 7d) at entry time
  snapshot: FrozenCompanySnapshotDTO,       // levels/classes/race/specialization/slots/gear/formation/
                                             // derivedStats/rulesVersion, copied by value at entry —
                                             // same by-value-copy pattern as the existing M1
                                             // `TeamSnapshot`, extended with race/specialization/
                                             // skillLoadout fields
  enteredAt, withdrawnAt: string | null,
  optedIntoTournament: boolean,             // always true for a human entry per m3-systems.md §9
                                             // ("entry preview explicitly opts into both"); true for
                                             // every fixture seat too
}
// Insert-only except `withdrawnAt`, which may be set exactly once, only before the season's 24h entry
// lock, by the owning account. After lock, no field on this row ever changes again — this is the
// "immutable entry snapshot" the milestone requires.

SeasonMatch {
  matchId, seasonIndex, entryAId, entryBId, leg: 1 | 2,
  seed: string, resolvedAt: string | null, reportId: ReportId | null,
  result: "A" | "B" | "draw" | null,
}
// Exactly 12 rows per season with >=2 locked entries (4 entries * 3 opponents * 2 legs / 2, i.e. the
// double round robin's 6-matches-per-entry = 24 entry-match slots = 12 matches), created at the 24h
// lock in one transaction with their seeds, `resolvedAt`/`result`/`reportId` all null. A season that
// locks with fewer than 4 distinct entries still fills to 4 via fixtures (m3-systems.md §8), so this
// row count is constant per season regardless of human participation.

SeasonArchive { seasonIndex, standings: SeasonStandingRowDTO[], titleEntryId: string | null, archivedAt }
// SeasonStandingRowDTO = { entryId, points, wins, losses, draws, rank, isFixture }
// Written exactly once per season, the first time any request observes `effectiveNow` past that
// season's end boundary (lazy finalize, §10). Never updated after insert.

TournamentBracket {
  seasonIndex, seatEntryIds: [string, string, string, string],  // ascending stable entryId seed order
  semifinal1MatchId: string, semifinal2MatchId: string, finalMatchId: string | null,
  byeReasons: Record<string, string>,     // seatEntryId -> persisted vacancy reason, only for recovery
  championEntryId: string | null, status: "pending" | "in_progress" | "complete" | "no_champion",
  createdAt,
}
// Reuses `SeasonMatch`'s shape for its three matches (an `isTournament: true` / `round: "semi1" |
// "semi2" | "final"` pair of additive fields on SeasonMatch distinguishes them from the season's own
// round-robin matches; both share the same resolution mechanics in §11).
```

### 4. Variable-duration settlement algorithm (replaces the fixed-60,000ms walk for `kind="pve"`)

This **replaces** the Offline settlement algorithm above for expeditions once an account's
`Expedition.rulesVersion` is the M3 rules version; an expedition still running under a pre-M3
`rulesVersion` keeps using the fixed-60,000ms algorithm verbatim until it next settles/stops under the
existing `unsupported_rules_version` guard logic reinterpreted as "keep the old algorithm for the old
version," not "reject it" (§13 Migration). Dungeon floor settlement (180,000 ms fixed) is **unchanged**
— `m3-systems.md` §3/§7 and `economy/m3.md` §2.1 both keep floors fixed-duration; this section does
not touch `POST /dungeon/settle`/`/dungeon/stop`.

Inputs: `checkpointAt`, `rngState`, `pendingBattleReportId`, `msPerRound` (frozen at start),
`effectiveNow` (§1), 8-hour cap, `MAX_BATTLES_PER_SETTLEMENT = 500` (§1).

```
elapsedMs = effectiveNow - checkpointAt                 // never negative; effectiveNow is monotonic
cappedMs  = min(elapsedMs, 28_800_000)
discardedMs = elapsedMs - cappedMs
windowMs = cappedMs
processedMs = 0
creditedBattles = []
battlesThisCall = 0

loop:
  if battlesThisCall >= MAX_BATTLES_PER_SETTLEMENT: break        // resumable: next settle continues

  if pendingBattleReportId is set:
    battle = that report (already simulated, uncredited)
    if windowMs - processedMs >= battle.nominalDurationMs:
      set battle.creditedAt = effectiveNow, battle.rewards = computed reward (same tables as M1/M2)
      processedMs += battle.nominalDurationMs
      creditedBattles.push(battle); clear pendingBattleReportId; battlesThisCall += 1
      continue
    else:
      break    // not enough window yet; battle stays cached, pending, revealed-not-credited

  else:
    roll a new battle from rngState (combat.md §8, using frozenLoadout as currently in effect —
      see §5 for how a pending skill change updates "currently in effect" before this roll);
      nominalDurationMs = resolvedRounds * msPerRound; advance rngState; insert BattleReport with
      ordinal = last ordinal + 1, runId, completionSequence = account's next global sequence,
      creditedAt = null, rewards = null   // this INSERT happens regardless of whether it will be
                                            // creditable this call — "precomputation may reveal a
                                            // planned battle" (m3-systems.md §3)
    if windowMs - processedMs >= battle.nominalDurationMs:
      set creditedAt/rewards now (same as above); processedMs += duration; creditedBattles.push;
      battlesThisCall += 1; continue
    else:
      set pendingBattleReportId = battle.reportId; break   // cached for a later call

checkpointAt_new = checkpointAt + discardedMs + processedMs    // same "re-add discarded" rule as the
                                                                 // M1 algorithm; processedMs, not the
                                                                 // full windowMs, is what actually
                                                                 // advanced — see worked example W5
persist checkpointAt_new, rngState, pendingBattleReportId, all touched BattleReport rows,
battlesCompleted += len(creditedBattles), rewards, revision bump, idempotency receipt — one transaction
```

**No-op rule, generalized:** if `creditedBattles` is empty AND `pendingBattleReportId` is unchanged
from before the call (either it was already set and still isn't creditable, or none was rolled because
`windowMs=0` and one was already cached), revision does not increment, matching the existing zero-
credit no-op precedent. If a *new* `pendingBattleReportId` was rolled this call even though nothing was
credited, that **does** bump revision (a persisted field changed — the cached battle is now visible)
even though `creditedBattles` is empty; this is the one place this algorithm's no-op rule diverges from
the fixed-duration one, precisely because "reveal" is now a distinct persisted event from "credit."

`SettlementResultDTO` gains (additive, same convention as the existing M1-08 additive fields):
`pendingBattle: { reportId, ordinal, resolvedRounds, nominalDurationMs, result, events, credited: false } | null`
and `creditedBattles: CreditedBattleDTO[]` (replaces `recentCycles`, same 10-entries-per-response cap,
same this-call-scoped semantics, each entry gaining `resolvedRounds`/`nominalDurationMs`). Clients
distinguish pending/in-progress from credited exactly as `m3-systems.md` §3 requires by checking which
field a given `reportId` appears in.

#### Worked examples (connected polling, offline batch and retry yield identical authoritative state)

All examples start from a freshly started M3-rules expedition, `checkpointAt = T0`, `msPerRound=2000`,
fresh `rngState = S0` whose deterministic stream happens to produce battle round counts 5, 8, 6, ... in
order (illustrative fixed sequence, not a claim about actual combat balance).

- **W1 — connected, frequent small polls.**
  1. `settle()` at `T0+0ms`: `elapsedMs=0`. No pending cached: roll battle #1 (5 rounds →
     `nominalDurationMs=10,000`). `windowMs(0) < 10,000` → cache as pending, `creditedBattles=[]`,
     `checkpointAt` stays `T0`. Revision bumps (a pending battle is now visible) even though nothing
     credited.
  2. `settle()` at `T0+6,000ms`: pending battle needs 10,000; `windowMs=6,000 < 10,000` → unchanged,
     same pending battle returned, **no** RNG roll, **no** revision bump (true no-op).
  3. `settle()` at `T0+10,000ms`: `windowMs=10,000 >= 10,000` → credit battle #1,
     `checkpointAt_new = T0+10,000`, `processedMs` so far `=10,000`. Loop continues: roll battle #2
     (8 rounds → `16,000ms`); remaining window this call is `10,000-10,000=0 < 16,000` → cache as new
     pending. Response: `creditedBattles=[#1]`, `pendingBattle=#2 (uncredited)`.

- **W2 — offline, one call at an equivalent elapsed time.** First-ever `settle()` at `T0+26,000ms`
  (nothing precomputed yet): `elapsedMs=26,000`, `windowMs=26,000`. Roll #1 (5r/10,000ms) — fits
  (`26,000>=10,000`) — credit, `processedMs=10,000`. Roll #2 (8r/16,000ms) — fits
  (`26,000-10,000=16,000>=16,000`) — credit, `processedMs=26,000`. Roll #3 (6r/12,000ms) — does not fit
  (`26,000-26,000=0<12,000`) — cache as pending. `checkpointAt_new = T0+26,000`.
  **Result: identical two credited battles, identical rewards, identical checkpoint, identical cached
  pending battle #3** as continuing W1 with a fourth call at `T0+26,000ms` would produce (W1's call 3
  left `rngState` positioned to roll exactly W2's battle #2 next, then battle #3) — this is the
  partition-invariance guarantee (A06's equivalent) restated for variable duration: the walk is a pure
  function of `(checkpointAt, rngState, pendingBattleReportId, windowMs)` regardless of how many calls
  partition the same total elapsed time.

- **W3 — retry.** Client calls `settle()` with `requestId=R1` at `T0+10,000ms` (W1 step 3), it commits.
  Network drops the response; client retries with the same `R1`. Server finds the receipt, returns the
  **stored** result (same credited battle #1, same cached pending #2, same revision) without re-rolling
  battle #2's RNG a second time — unchanged from the existing canonical protocol (§ above), which this
  algorithm does not alter.

- **W4 — 8-hour cap with resumable catch-up (`MAX_BATTLES_PER_SETTLEMENT` reached before the cap).**
  Away 10 hours: `elapsedMs=36,000,000`. `cappedMs=28,800,000`, `discardedMs=7,200,000`. Suppose the
  deterministic stream's battles average `~15,000ms`; the loop credits battles until either
  `processedMs` exhausts `windowMs=28,800,000` (~1,920 battles) or `battlesThisCall` hits `500` first
  — the latter happens first here. `processedMs ≈ 500*15,000=7,500,000`. `checkpointAt_new =
  checkpointAt + 7,200,000 (discarded, applied once) + 7,500,000 (processed) = checkpointAt +
  14,700,000`. The remaining `28,800,000-7,500,000=21,300,000ms` of the **already-capped** window is
  **not** discarded — it is simply not yet processed, and remains fully creditable. A second `settle()`
  call made immediately after (no further real time passing) recomputes `elapsedMs = effectiveNow -
  checkpointAt_new ≈ 36,000,000-14,700,000=21,300,000`, which is now **under** the 8h cap
  (`cappedMs=21,300,000`, `discardedMs=0` this time — the true discard already happened exactly once on
  the first call), and continues crediting another batch of up to 500 battles. Repeating this resumes
  catch-up across as many calls as needed until the originally-capped 28,800,000 ms is fully processed,
  matching `m3-systems.md`'s "work may resume in bounded batches." The one-time `discardedMs=7,200,000`
  (time beyond the 8-hour cap, permanently lost) is identical to what the fixed-duration algorithm would
  have discarded for the same absence — only the *processing*, not the *cap*, is now resumable in
  bounded batches instead of always fitting in one call.

- **W5 — clock rollback.** Identical in effect to the existing worked example 7 above:
  `effectiveNow = max(rawServerNow(), ServerClock.highWaterMs)` never decreases, so a raw clock
  regression (NTP correction, VM pause) produces `elapsedMs <= 0` relative to the high-water mark for
  that call (`windowMs=0`, nothing credited, nothing discarded, no roll beyond an already-cached
  pending battle), and once the raw clock catches back up past the high-water mark, the next call's
  `elapsedMs` is exactly the genuinely-unprocessed real time — no double-loss, no double-credit, and
  (new guarantee over the per-call clamp alone) no *other* command for this or any account can ever
  observe a `serverNow()` earlier than one already persisted via `ServerClock.highWaterMs`.

### 5. Deferred skill-change protocol (G2) — exact transaction steps

Two new endpoints, both session-only, both requiring an active expedition:

#### `POST /hero/loadout/queue`
- Payload: `{ requestId, expectedRevision, heroId, active: [string,string], passive: [string,string] }`.
- Precondition (step 3, in order): ownership (`forbidden` if foreign heroId) → an active expedition
  must exist for the account (`validation`, `details.reason="no_active_expedition"` — mirrors
  `expedition/settle`'s precedent of using `validation` rather than `active_expedition` for an endpoint
  that *requires* the locked state rather than being blocked by it) → **run the full settlement walk
  from §4 first, in this same transaction, using `effectiveNow` at acceptance time T as the cutoff** —
  this is the "settle every eligible battle ending at or before T under the prior build" step
  (`m3-systems.md` §3 item 1); whatever battle ends up cached as `pendingBattleReportId` after this
  walk (if any) was rolled under the pre-change loadout and stays that way → validate each non-empty
  `active`/`passive` entry against the hero's **frozen expedition-start level and class pool**
  (`frozenLoadout`, not the hero's live level/classes — `validation`, `details.reason="not_unlocked"` /
  `"wrong_kind"` / `"duplicate_skill"`), empty slots legal, Basic Attack never a legal entry.
- Transaction (continuing after the walk and validation both pass): `boundaryOrdinal` = the ordinal of
  the next battle that has **not yet been rolled** at this point — i.e. `(last assigned ordinal) + 1`
  if `pendingBattleReportId` is set (that battle is already locked to the old build), or the same value
  if none is set and no battle has been rolled yet this call either (the very next roll, whenever it
  happens, is the boundary). Upsert the account's `(accountId, heroId)` `PendingSkillChange` row
  (overwriting any prior still-`"pending"` row for the same hero — "last committed edit wins per hero")
  with `status="pending"`, the new `active`/`passive`, `boundaryOrdinal`, `acceptedAt=effectiveNow`.
- Response: `{ ok: true, data: { pendingChange: PendingSkillChangeViewDTO, settlement: SettlementResultDTO }, revision }`
  — the settlement portion lets the client see what the walk-first step already credited/cached.
- Errors: `unauthenticated`, `validation` (no active expedition, frozen-level/class lock violation,
  duplicate/Basic-Attack slot), `forbidden` (foreign heroId), `conflict`, `internal`.
- **Applying at the boundary:** in §4's "roll a new battle" branch, immediately before rolling, check
  for any `PendingSkillChange` rows with `status="pending"` and `boundaryOrdinal <= (ordinal about to be
  assigned)`. If any exist, apply them all in this same transaction first: write each affected hero's
  live `skillLoadout`, set `status="applied"`, `appliedAt=effectiveNow`, recompute passive-derived stats
  from the hero's original class/gear/race baselines (never by accumulating modifiers on an already-
  modified effective-stat value — `m3-systems.md` §3 item 4) — only then roll the new battle, which now
  uses the updated `skillLoadout`. This is the exact "apply all heroes' pending selections before the
  next battle's snapshot" requirement.

#### `POST /hero/loadout/cancel-pending`
- Payload: `{ requestId, expectedRevision, heroId }`.
- Precondition: ownership → active expedition exists → **run the §4 walk first**, exactly as above
  (a cancel request can itself cross a boundary if enough time elapsed since it was queued).
- Transaction: if a `PendingSkillChange` row for this hero is still `status="pending"` after the walk,
  set `status="discarded"`; response confirms cancellation. If the walk's boundary-apply step already
  flipped it to `"applied"` before this command reached step 3, this is **not** an error — respond with
  `{ alreadyApplied: true, currentSkillLoadout: hero.skillLoadout }` and make no further change (`m3-
  systems.md` §3: "if already applied return that fact and current build, not a fictitious
  cancellation").
- Response: `{ ok: true, data: { cancelled: boolean, alreadyApplied: boolean, hero }, revision }`.
- Errors: `unauthenticated`, `validation` (no active expedition, no pending change exists for this
  hero), `forbidden`, `conflict`, `internal`.

**On `/expedition/stop`:** run the §4 walk one final time (settling every eligible battle at the stop
instant), then, in the same transaction, discard every remaining `status="pending"` row for this
account's heroes (`status="discarded"`) and list them in the response — matching "discard only
unconsumed pending edits, state which were discarded." Already-`"applied"` rows are untouched (they are
permanent history of a real build change, not pending state). No `PendingSkillChange` row of any status
survives into a later, *different* run's boundary numbering, since `boundaryOrdinal` is scoped to a
`runId` that ends at stop; a fresh `/expedition/start` begins a new `runId` with its own ordinal space.

**Dungeons:** `POST /hero/loadout/queue` and `/cancel-pending` both reject with `active_dungeon` if the
account has an active `DungeonRun`, consistent with "dungeon skill edits are rejected throughout, even
between floors" — a dungeon never has a deferred-edit path, only the immediate `PATCH /hero/loadout`
which itself already rejects under `active_dungeon`.

### 6. Expedition feed, retention and eviction (G1)

#### `GET /expedition/feed`
- Payload: query `?afterSequence=number&limit=number` (limit clamped server-side to `<=10`, default
  10). Session-only. Read-only; never grants rewards, never advances settlement (consistent with the
  existing read-side-effect-free invariant — this endpoint only *reads* `BattleReport`/`Settlement
  Aggregate` rows already written by a prior settlement call; it never triggers one).
- Response: `{ ok: true, data: { entries: FeedEntryDTO[], nextCursor: number | null, oldestAvailableSequence: number, newestAvailableSequence: number, missingRange: { from: number, to: number } | null } }`
  where `FeedEntryDTO` is either a full `{ kind: "battle", reportId, runId, ordinal, completionSequence, result, credited: boolean }`
  or an aggregate summary `{ kind: "aggregate", aggregateId, fromOrdinal, toOrdinal, wins, losses, elapsedMs, creditedMs, discardedMs, rewards }`
  for a range whose individual reports were already evicted by the time this page is read.
  `oldestAvailableSequence`/`newestAvailableSequence` are the min/max `completionSequence` among this
  account's currently retained full `BattleReport` rows. `missingRange` is non-null only when
  `afterSequence` requests data older than `oldestAvailableSequence - 1` and no covering aggregate
  exists either (eviction is always of the oldest sequence first, so this is always a single
  contiguous range, never a gap in the middle).
- Errors: `unauthenticated`, `internal`.

**Retention/eviction rule:** retain the latest 50 full `kind="pve"` `BattleReport` rows per account by
`completionSequence`, across run boundaries. Inserting the 51st (at resolution/precompute time, §4 —
eviction is keyed to *reveal* time, not credit time, so a long-cached pending battle counts towards the
window the instant it is rolled) evicts the oldest by `completionSequence` **and**, in the same
transaction, writes/extends a `SettlementAggregate` row covering whatever battles that eviction has
accumulated since the last aggregate write for this account, so the evicted range is never silently
unaccounted-for. Retain latest 20 `SettlementAggregate` rows/account; the 21st insert evicts the oldest
aggregate (that range becomes genuinely, permanently unavailable — "no promise of every offline fight").
Eviction never touches `rewards`/`creditedAt` already committed to the account's gold/XP/inventory —
those are permanent ledger effects independent of report retention, per `m3-systems.md` §2's "report
eviction does not delete reward receipts or permit settlement replay."

**Cross-account/invalid cursor:** `afterSequence` values are meaningless across accounts (sequences are
per-account); a session's feed request only ever reads its own `accountId`'s rows (same ownership rule
as every other session-only endpoint — no new rule needed, restated here because G1's acceptance check
explicitly tests cross-account cursor rejection). An `afterSequence` beyond `newestAvailableSequence`
simply returns an empty `entries` array with `nextCursor: null`, not an error.

**Client-local state (no new server entity):** the reader cursor `(runId, ordinal, reportId,
eventIndex)` and selected-report/Follow-mode state are persisted by `apps/web` in browser storage keyed
by `accountId`, per `m3-systems.md` §2's "persist ... locally across refresh; server is authoritative
for availability." An account switch clears it (already required by `m3-systems.md` §10's "account
switch clears private cached views/cursors/drafts"). The server holds no per-client cursor row.

### 7. Classes, specializations and races (G4–G5)

No new endpoints: `m3-systems.md` §4's eight-classes/sixteen-specializations roster is served through
the existing codex (`GET /codex`, §8 below) and validated inline by the already-existing `PATCH
/hero/loadout` (primary specialization choice itself uses a new, narrow endpoint since it is a distinct
free action from skill-slot editing):

#### `POST /hero/specialization/primary`
- Payload: `{ requestId, expectedRevision, heroId, primarySpecializationId: string | null }`.
  Session-only. `null` clears it (always legal, has no effect — `m3-systems.md` §4: "null remains legal
  and has no effect").
- Precondition: ownership (`forbidden`) → hero `level >= 3` (`validation`) → no active expedition/
  dungeon (`active_expedition`/`active_dungeon` — a choice here "affects future snapshots only" per
  `m3-systems.md` §4, so it is barred mid-run exactly like equip/secondary-class, not exempted like
  `/party/order`/`/party/formation`) → if non-null, `primarySpecializationId` must be one of the
  hero's **primary** class's two choice IDs (`validation`, `details.reason="wrong_primary_class"` if it
  belongs to a different class's pair).
- Transaction: set `Hero.primarySpecializationId`. No skill-slot change, no cost, no cooldown.
- Response: `{ ok: true, data: { hero }, revision }`.
- Errors: `unauthenticated`, `validation` (level<3, wrong-class specialization ID), `forbidden`,
  `active_expedition`, `active_dungeon`, `conflict`, `internal`.

**Race** is chosen only at `/hero/recruit` time (M2-25's existing endpoint gains a required
`raceId: string` payload field, one of the three M3 IDs, validated the same way `primaryClassId`
already is — `validation` for an unknown ID). No separate race-change endpoint exists; `m3-systems.md`
§5 explicitly puts race changes out of scope, so there is nothing else to specify here.

### 8. Codex, respec and free secondary switching (G6)

#### `GET /codex`
- Payload: none. Session-only (unlock/level-gated display still reads per-account hero state to show
  "locked until level N" accurately, though the underlying class/skill/race data itself is static
  content — this follows the same session-only-because-per-account-view rule already used for `GET
  /areas` and `GET /dungeons`, not a new rule). A read never mutates anything.
- Response: `{ ok: true, data: { rulesVersion, classes: ClassCodexDTO[], races: RaceCodexDTO[] } }`
  where each `ClassCodexDTO` carries the full table `m3-systems.md` §4/§6 requires (curves levels 1-10,
  secondary 25% contribution note, every skill's kind/unlock level/cooldown/targeting/numeric effect/
  condition, both specialization choices' exact effect text) and each `RaceCodexDTO` carries the three
  tradeoffs. "Inspecting a draft secondary does not unlock it" is a client-side copy/state concern (no
  server call changes from inspection); the server has nothing to validate here beyond serving data.
- Errors: `unauthenticated`, `internal`.
- **Rules-version staleness:** every mutating endpoint that consumes codex-sourced choices (secondary-
  class, primary specialization, loadout, respec) already carries `expectedRevision`; if the server's
  `currentRulesVersion` has changed since the client's last `GET /codex` fetch, the client is expected
  to refetch before presenting a stale preview — this document does not add a new error code for that,
  since a genuinely incompatible choice (e.g. a retired skill ID) already falls out as ordinary
  `validation` on the mutating call.

#### `POST /hero/respec-primary/preview`
- Payload: `{ heroId }`. Session-only. Read-only; no `requestId`/`expectedRevision` (nothing is
  committed; the client re-derives correctness from `expectedRevision` on the real confirm call below,
  which is what "changed costs/level require a fresh preview" actually enforces — no separate preview
  token is needed).
- Response: `{ ok: true, data: { heroId, currentPrimaryClassId, currentSecondaryClassId, cost: { gold, scrap, sigil }, cooldownEligible: boolean, nextEligibleAt: string, revision } }`
  using the provisional formula `100*L gold + 5*L scrap + (L>=5 ? 1 : 0) sigil` from `m3-systems.md`
  §6 (subject to Economy amendment before this is treated as final per that document's own note).
- Errors: `unauthenticated`, `forbidden` (foreign heroId), `not_found` (unknown heroId), `internal`.

#### `POST /hero/respec-primary`
- Payload: `{ requestId, expectedRevision, heroId, newPrimaryClassId, newSecondaryClassId? }`.
  Session-only. `newSecondaryClassId` omitted preserves the current secondary if still compatible (not
  equal to `newPrimaryClassId`); if the current secondary **would** equal `newPrimaryClassId`, omitting
  it is rejected (explicit clear via a different value, or explicit same-value confirmation is not
  possible since same-value is the reject case — the client must supply a different class or accept the
  secondary becomes null by passing `newSecondaryClassId: null` explicitly).
- Precondition (step 3, in order): ownership (`forbidden`) → no active expedition (`active_expedition`)
  → no active dungeon (`active_dungeon`) → cooldown eligible, `effectiveNow >= lastRespecAt + 24h` or
  `lastRespecAt` is null (`validation`, `details.reason="cooldown"`, include `nextEligibleAt`) →
  `newPrimaryClassId` known and differs from current primary (`validation`,
  `details.reason="same_primary"` if equal — rejected **without** charge/reset/cooldown, per
  `m3-systems.md` §6) → resulting secondary (explicit or preserved) differs from `newPrimaryClassId`
  (`validation`, `details.reason="secondary_conflict_requires_explicit_choice"`) → account
  gold/scrap/sigil each `>=` the previewed cost (`validation`, `details.reason="insufficient_funds"`).
- Transaction: debit gold/scrap/sigil; set `primaryClassId=newPrimaryClassId`,
  `secondaryClassId` per the rule above; set `primarySpecializationId=null`; reset
  `skillLoadout.active=[newPrimary's Active I, level>=5 ? newPrimary's Active II : ""]`,
  `skillLoadout.passive=[newPrimary's Passive I, level>=8 ? newPrimary's Passive II : ""]`; set
  `lastRespecAt=effectiveNow`; bump revision; write receipt. All in one transaction (atomicity
  requirement from `m3-systems.md` §6: "On confirmed success in one transaction").
- Response: `{ ok: true, data: { hero }, revision }`.
- Errors: `unauthenticated`, `validation` (cooldown, same-primary, secondary conflict, insufficient
  funds, unknown class), `forbidden` (foreign heroId), `active_expedition`, `active_dungeon`,
  `conflict`, `internal`.
- **Idempotency note specific to this endpoint:** per the canonical protocol, step 2's receipt lookup
  runs **before** the cooldown/active-run checks — "identical request retry returns original success
  even if now on cooldown or a run started" (`m3-systems.md` §6) is exactly the existing protocol's
  behavior, not a special case; this document states it here only because this endpoint is the first
  one where the cooldown-after-success scenario is concretely exercised.

#### `POST /hero/secondary-class/preview`
- Payload: `{ heroId, candidateSecondaryClassId }`. Session-only, read-only.
- Response: `{ ok: true, data: { heroId, slotsToClear: { active: [boolean, boolean], passive: [boolean, boolean] }, revision } }`
  — true for each currently-slotted skill that would no longer be in the resulting pool and would
  therefore clear, per `m3-systems.md` §6's "preview exactly which slots clear before confirm."
- Errors: `unauthenticated`, `forbidden`, `not_found` (unknown candidate class), `internal`.
- The real mutation stays the existing M2-25 `POST /hero/secondary-class` endpoint, amended only to
  implement the "preserve valid slotted skills, clear only those no longer in pool, no respec timestamp
  touch, no specialization reset, unchanged-secondary is a no-op receipt" behavior `m3-systems.md` §6
  specifies — no new payload/response/error shape beyond what M2-25 already froze for that endpoint.

### 9. Dungeon catalog and Cinder Archive unlock (G7)

#### `GET /dungeons`
- Payload: none. Session-only (lock status is per-account). Read-only.
- Response: `{ ok: true, data: { dungeons: DungeonCatalogEntryDTO[] } }` where
  `DungeonCatalogEntryDTO = { dungeonId, nameRef, rulesVersion, locked: boolean, lockReason: string | null, clearRequirement: string | null, floors: FloorSummaryDTO[], timingSecondsPerFloor: 180, rewardProfileRef, partyValidation: { minHeroes: 1, maxHeroes: 5 } }`.
  Always lists both dungeons (`dungeon_aqueduct_depths` and `dungeon_cinder_archive`), locked ones
  included, per `m3-systems.md` §7's "catalog always shows both dungeons including locked ones."
- Errors: `unauthenticated`, `internal`.

**`POST /dungeon/start` amendment:** precondition gains, after the existing `dungeonId` known/unlocked
checks, a lookup against `DungeonClearRecord` for `dungeon_cinder_archive`'s unlock
(`clearRequirement`: an existing `DungeonClearRecord{accountId, dungeonId:"dungeon_aqueduct_depths"}`
row) — same `forbidden` error the existing unlocked-but-known check already uses, no new error code.
On any dungeon run reaching `outcome="cleared"`, `/dungeon/settle`'s transaction additionally inserts
the `DungeonClearRecord` row for that `dungeonId` if one does not already exist (idempotent — a second
clear of an already-cleared dungeon does not insert a duplicate, since the unlock fact only needs to
exist once).

**Unknown/stale `dungeonId`:** unchanged from the existing `not_found`/`forbidden` precedent; "reject
and refresh, never fall back to dungeon 1" (`m3-systems.md` §7) is a client behavior, not a new server
rule — the server's existing errors already carry enough information for the client to refetch
`GET /dungeons` instead of guessing.

### 10. Season (G8)

#### `POST /season/enter`
- Payload: `{ requestId, expectedRevision, heroIds: HeroId[] }` (1-5 distinct owned heroes — same
  cardinality rule as `PartyFormation`). Session-only.
- Precondition (step 3): compute `seasonIndex = floor((effectiveNow - CompetitionEpoch.epoch) / 7d)`
  (creating the epoch row on first-ever call, §3) → the account has already cleared Tollkeeper
  (existing `BossClaim`/clear-fact check, same pattern as Cinder Archive's unlock) (`forbidden` if not)
  → still within the season's first 24 hours (`effectiveNow < seasonStart + 24h`) (`validation`,
  `details.reason="entry_window_closed"`, message states next season's open time) → account has no
  existing non-withdrawn `SeasonEntry` for this `seasonIndex` (`validation`,
  `details.reason="already_entered"` — "one entry per local account") → `heroIds` 1-5 distinct owned.
- Transaction: copy the account's **current live** roster/classes/race/specialization/slots/gear/
  formation/derived stats for exactly those `heroIds` into a `FrozenCompanySnapshotDTO`
  (`m3-systems.md` §8: "copies the currently selected live company... live roster, not an active run's
  frozen party" — this is a fresh by-value copy at call time, independent of any `Expedition.
  frozenLoadout` that might separately exist); insert `SeasonEntry{ isFixture:false, optedIntoTournament:true, ... }`.
- Response: `{ ok: true, data: { entry: SeasonEntryViewDTO }, revision }`.
- Errors: `unauthenticated`, `validation` (window closed, already entered, bad hero count/ownership),
  `forbidden` (Tollkeeper not cleared), `conflict`, `internal`.

#### `POST /season/withdraw`
- Payload: `{ requestId, expectedRevision, entryId }`. Session-only; ownership checked.
- Precondition: entry belongs to account (`forbidden`) → still before the 24h lock
  (`validation`, `details.reason="season_locked"` if not — "after lock there is no season withdrawal").
- Transaction: set `withdrawnAt=effectiveNow`. Irreversible (no re-entry this season per
  `m3-systems.md` §8).
- Response: `{ ok: true, data: { entry }, revision }`.
- Errors: `unauthenticated`, `validation` (already locked), `forbidden`, `conflict`, `internal`.

#### `GET /season/:seasonIndex/standings` — **public**, like `GET /arena/snapshots`
- Response: `{ ok: true, data: { seasonIndex, startAt, endAt, status: "entry_open"|"locked"|"in_progress"|"archived", standings: SeasonStandingRowDTO[] | null } }`.
  `standings` is `null` until the season is archived (§ lazy-finalize below) and locked-but-not-yet-
  fully-resolved seasons instead surface a live `inProgressStandings` field computed from currently-
  resolved matches only (additive field, same "show partial/pending distinctly" rule as expedition
  settlement). Public because match results/snapshots become shared-replay data the instant they
  resolve, the same public-after-the-fact rule the existing arena snapshot/report split already
  establishes for M1 — entrants' pre-lock live data is never exposed this way (the snapshot is a
  by-value copy; this endpoint never reads live hero/inventory/gold state).
- Errors: `not_found` (unknown seasonIndex — before the epoch, or past the current season), `internal`.

#### `GET /season/:seasonIndex/matches/:matchId` — **public**
- Response: `{ ok: true, data: { match: SeasonMatchViewDTO, report: BattleReport | null } }` —
  `report` is null until `resolvedAt` is set (§ lazy resolution below); this is the "shared replay"
  surface both participants (and, per the existing public-snapshot precedent, anyone) can read.
- Errors: `not_found` (unknown matchId for that season), `internal`.

#### `GET /season/account-state` — session-only
- Response: `{ ok: true, data: { seasonIndex, entry: SeasonEntryViewDTO | null, remainingEligibleMatches: number, canWithdraw: boolean } }`
  — the private "my status" view distinct from the public standings above.
- Errors: `unauthenticated`, `internal`.

**Lazy season-boundary finalize and match resolution (no background timer):** every one of the five
endpoints above, before doing its own work, runs a shared `ensureSeasonAdvanced(effectiveNow)` step in
the same transaction:
1. If `effectiveNow >= currentSeasonLockDeadline` (24h after that season's start) and this season's
   `SeasonMatch` rows do not yet exist, create all 12 (or fewer if `kind=tournament` needs a separate
   check, §11) in one transaction: fill any of the 4 seats not filled by a non-withdrawn human
   `SeasonEntry` with fixtures `fixture_m3_01`..`04` in ascending ID (`m3-systems.md` §8), pair
   lexicographically by `entryId`, assign one seed per `(pair, leg)` from the server's own RNG (never
   client-supplied), and set `SeasonEntry` rows immutable from this point. A concurrent request
   racing this same check is protected by the same insert-guarded-by-unique-constraint pattern already
   used for `BossClaim`'s check-then-set (SQLite single-writer serialization makes only one commit win;
   the loser's transaction finds the rows already exist on retry and proceeds normally).
2. For any `SeasonMatch` with `resolvedAt=null` whose "inputs" are available (both `entryAId`/
   `entryBId` snapshots exist, which they always do once step 1 ran), resolve it: simulate using the
   match's own fixed stored seed, write the `BattleReport`, set `result`/`reportId`/`resolvedAt`. This
   can run eagerly (resolve every unresolved match the instant its season locks, since nothing about a
   locked snapshot changes before resolution) or lazily per-request — this contract fixes only that
   resolution is idempotent/exactly-once (guarded by `resolvedAt IS NULL` as the commit precondition,
   same pattern as `BossClaim`) and never depends on which request happens to trigger it; a crash
   between simulate and commit simply repeats the same seed/inputs on the next trigger and produces the
   same result (deterministic combat).
3. If `effectiveNow >= currentSeasonEndAt` (7 days after start) and no `SeasonArchive` row exists for
   this `seasonIndex` yet, compute final standings from the now-fully-resolved `SeasonMatch` rows
   (ranking per `m3-systems.md` §8: points desc, wins desc, entryId asc) and insert `SeasonArchive`
   once, guarded the same way. A season with zero entries that has already fully elapsed by the time
   anyone asks is finalized with an empty/fixture-only archive and no further matches created — "a long
   absence skips empty seasons without creating opponents or rewards" is satisfied because step 1 never
   ran for a season nobody ever queried while it was open, and once past its end it goes straight to an
   empty archive instead.

### 11. Tournament (G9)

No separate entry endpoint — `m3-systems.md` §9: "entry preview explicitly opts into both season and
tournament... no separate new lock." The same `ensureSeasonAdvanced` step (§10) additionally, at the
same 24h lock point, creates the `TournamentBracket` row using the **same four locked seats**, seeded
by ascending stable `entryId` (independent of season standings): `semifinal1` = seats 1v4,
`semifinal2` = seats 2v3 (lower seed = team A), both as `SeasonMatch` rows with `isTournament:true,
round:"semi1"|"semi2"`, each with its own server-stored seed, distinct from that pair's season round-
robin seeds. `finalMatchId` is created, seeded but **not resolved**, only once both semifinals have
`resolvedAt` set — requesting the final's report before then returns `{ report: null }` (pending),
"never live-roster simulation," per the existing `GET /season/:seasonIndex/matches/:matchId` shape
(no separate tournament endpoint needed; the same match-read endpoint serves tournament rounds too,
distinguished by `round`/`isTournament` on the response).

**Advancement:** decisive result -> winner advances. Draw/timeout tiebreak, in order: (a) higher
`sum(floor(10000*remainingHP/maxHP)) / originalHeroCount` per side (dead heroes contribute 0,
integer floor at each step); (b) more surviving heroes; (c) lower seed number. The stored `BattleReport`
still records "Combat draw" verbatim; the **advancement reason and compared values** are additive
fields on `SeasonMatchViewDTO` (`advancementReason: "decisive"|"hp_tiebreak"|"survivor_tiebreak"|
"seed_tiebreak"`, `compared: { aHp, bHp, aSurvivors, bSurvivors } | null`) computed at resolution time
from the same report, never rewriting the report itself to claim a kill that did not happen.

**Byes (recovery-only):** a seat's snapshot that fails to deserialize/validate at resolution time
(`m3-systems.md` §9: "operational error, pause bracket rather than fabricate a win") causes that
match's resolution step to **not** set `resolvedAt` and instead set a persisted `byeReasons[seatEntryId]`
string on the `TournamentBracket` row describing the failure; `ensureSeasonAdvanced` skips auto-
resolving that match on future calls (it is not retried blindly — an operator/QA fix is implied, out of
scope here) until the vacancy is explicitly recorded as permanent, at which point the opposing seat
advances with no `BattleReport`/score, exactly per the one/two-vacancy matrix in `m3-systems.md` §9.
Normal (non-recovery) bracket creation always fills all four seats via entries+fixtures, so this path
is unreachable in the ordinary flow and exists only for the explicit recovery case the spec requires to
be "clearly labelled."

**Exactly-once, crash-safe:** every bracket-advancing write is guarded by `resolvedAt IS NULL` (or,
for the bracket's own `championEntryId`, `championEntryId IS NULL`) as its update precondition inside
one transaction — a crash before commit simply leaves the guard unsatisfied-still-true, so a retry (by
any subsequent request, not a specific retried `requestId`, since this is server-triggered background-
style work, not an account command) repeats the identical seed/inputs and produces the identical
result; a crash after commit means the guard is already false and the next trigger reads the existing
result instead of recomputing. No account-command idempotency receipt is needed for this path because
there is no client-supplied `requestId` to key one on — the DB-level guard is the exactly-once
mechanism here, analogous to `BossClaim.claimedAt IS NULL` already being the race-free guard for an
account command rather than a receipt in that case too.

**Reopen after restart:** since every input (`seatEntryIds`, seeds, `resolvedAt`/`result`/`reportId`,
`championEntryId`, `byeReasons`) is persisted and nothing here depends on in-memory state or wall-clock
timers, re-reading `GET /season/:seasonIndex/matches/:matchId` and a (not-yet-specified, but implied by
symmetry) `GET /tournament/:seasonIndex/bracket` after any restart reproduces byte-identical output to
before the restart — satisfying "reopen after restart must show identical bracket/history."

#### `GET /tournament/:seasonIndex/bracket` — **public**, same access rule as season standings
- Response: `{ ok: true, data: { bracket: TournamentBracketViewDTO } }` (seats, seeds, three match
  IDs/results/advancement reasons, `byeReasons`, `championEntryId`, `status`).
- Errors: `not_found` (unknown seasonIndex, or season not yet locked — no bracket exists yet), `internal`.

### 12. Access control and fixture accounts

Fixture entries (`fixture_m3_01`..`04`) are **not** `Account` rows and have no session — they are
`SeasonEntry` rows with `accountId: null, isFixture: true, fixtureId: "fixture_m3_01..04"` and a
server-constructed `FrozenCompanySnapshotDTO` built directly from `m3-systems.md` §8's fixed rosters at
the moment a season locks (not copied from any live account, since none exists). No endpoint in this
document accepts a fixture ID as an `accountId`-shaped input; `POST /dev/session/select`'s two dev
account slots are completely unrelated to and never resolve to a fixture. Every UI-facing surface that
lists an entry (`SeasonEntryViewDTO`, standings rows, bracket seats, match participant labels) carries
`isFixture`/`fixtureId` so "Server fixture" labelling (`m3-systems.md` §8/§9) is driven by server data,
never inferred client-side from a naming convention.

No new `ErrorCode` value is introduced for M3; every new precondition failure above reuses the existing
enum (`validation` | `unauthenticated` | `forbidden` | `not_found` | `conflict` | `active_expedition` |
`active_dungeon` | `internal`) with a `details.reason` string, consistent with this document's existing
convention of using `details.reason` for sub-cases rather than growing the enum per feature.

### 13. Migration (frozen procedure, M3; applied once by a `SchemaVersion` bump, after the M2-25
### migration if both are pending, before any new M3 endpoint is reachable)

1. `ServerClock` row created at `{ highWaterMs: 0 }` if absent (pre-existing deployments with no prior
   `ServerClock` row simply start from 0; the very first command after migration naturally sets it to
   real `serverNow()`, since `effectiveNow = max(rawServerNow(), 0)` on that first call).
2. Every existing `Hero.raceId := "race_vesper"`, `Hero.primarySpecializationId := null`,
   `Hero.lastRespecAt := null` (immediately cooldown-eligible). No currency/build change.
3. `Account`-level `CompetitionEpoch` is **not** created by this migration step; it is created lazily
   by the first competition-surface request (§3/§10), so a save that never touches M3 competition
   never acquires an epoch, and epoch creation always reflects a real `effectiveNow`, never a migration-
   time placeholder.
4. Any `Expedition` row active at migration time keeps its pre-M3 `rulesVersion` and the **old
   fixed-60,000ms algorithm** verbatim through its next settle/stop (§4's opening paragraph); it gains
   no `msPerRound`/`pendingBattleReportId`/`battlesCompleted` fields until it next starts fresh under
   the new `rulesVersion` (`m3-systems.md` §5: "existing active runs continue with their captured old
   rules/builds through stop/completion... the new deferred editor is unavailable on a legacy active
   run"). `POST /hero/loadout/queue` on such an account returns `validation`,
   `details.reason="legacy_run_active"`, with message text owned by Narrative (M3-06).
5. Old `BattleReport` rows (`kind="pve"`, pre-M3) have `ordinal=null`, `runId=null`,
   `completionSequence=null`, `creditedAt` treated as already-set (their reward was already granted
   under the old model), `rewards=null` (not backfilled — same "legacy reports remain renderable
   without backfill" precedent the M2-25 damage-evidence addition already established). They are never
   returned by `GET /expedition/feed` (which only ever queries rows with a non-null
   `completionSequence`); they remain reachable only via the existing `GET /battle-reports/:reportId`
   if a client already holds the ID.
6. `DungeonClearRecord` is backfilled from any already-persisted dungeon-clear signal the pre-M3 schema
   tracked (if `m3-systems.md`/`gear.md`'s existing dungeon completion bookkeeping already recorded a
   clear fact under a different field name, copy it once; if no such signal exists for an account that
   nonetheless cleared the dungeon historically, that account is treated as not-yet-cleared and must
   clear again — this document does not invent a clear fact that was never actually persisted, matching
   `m3-systems.md` §7's "migrate from a retained verifiable clear record if present; otherwise mark
   locked until a new clear, without removing any prior reward").
7. Restart safety: every migration step above is idempotent (guarded by the target field's
   not-yet-set state) and runs inside the same `SchemaVersion`-bumping transaction pattern already
   frozen for M1/M2 migrations — a restart mid-migration either resumes cleanly (unapplied steps still
   see their pre-migration state) or sees the fully-applied version; race applies at most once per hero/
   account, matching `m3-systems.md` §5's "restart during migration must either resume the transaction
   safely or see its complete version, never apply race twice."

### 14. Package boundary notes (unchanged rule, no new edges)

`packages/content` gains the race/specialization/dungeon-catalog/`msPerRound` definitions, consumed by
`packages/game` (combat/race-stat-layer rules) and `apps/server` (lookups), same no-dependency rule
already frozen above. `packages/game`'s pure functions gain no new external inputs beyond what §4
already requires (`msPerRound`, frozen per-run, is passed in alongside `rulesVersion`/`rngSeed` exactly
like every other rules-version-pinned numeric constant already is — it does not become a new kind of
parameter). `apps/server` remains the only package reading `ServerClock`/generating season/tournament
seeds. No circular dependency is introduced.

### 15. Open items for downstream tasks (not blockers)

- `MAX_BATTLES_PER_SETTLEMENT=500` and `msPerRound=2000` are both provisional and explicitly flagged
  for re-benchmarking/re-tuning once M3-07 ships real content (§0, §1) — M3-07/M3-08 implement, M3-10
  re-measures, consistent with the milestone's own sequencing.
- `economy/m3.md`'s minute-band text requires Economy re-derivation once the no-floor decision (§0)
  and real `resolvedRounds` distributions are both available; this document does not edit
  `baseline.md`/`tuning.md`/`economy/m3.md` itself (Economy ownership).
- Narrative (M3-06) owns the exact copy for every new locked/pending/evicted/fixture/bye/tiebreak label
  this document introduces states for; schemas above fix only the state machine, not display text.
- M3-07 implements §4's walk, §5's boundary-apply logic, and §10/§11's lazy-resolution triggers inside
  `apps/server`; none of this requires a background scheduler/timer process, preserving architecture.md's
  "one Node process" invariant — every resolution is triggered by, and runs inside, an ordinary request
  transaction.
