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
```

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
