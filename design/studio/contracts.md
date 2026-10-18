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
- Response: `{ ok: true, data: { heroes, inventory, partyOrder, expedition: { status, checkpointAt, frozenLoadout?, cyclesCompletedSinceStart }, gold, bossClaims, revision } }`. **M1-08 additive fields:** while `status="active"`, `expedition` also includes `startedAt`, `rulesVersion`, `wins`, and `losses`. **M1-10 additive field (proposed):** each entry in `heroes` additionally includes `effectiveStats: { maxHp, atk, def, spd }`, computed server-side via `packages/game`'s existing `computeHeroEffectiveStats` (combat.md 1.2: level + equipped gear + specialization + party Pathfinder bonus) at response-build time — never persisted, never accepted from the client, read-only like the rest of this endpoint. This closes the gap `design/game/ui-spec.md`'s Company/Inventory screens depend on ("effective stats ... display only, no recompute in UI"): apps/web must display these numbers, not derive them, and this field is the server-supplied source that makes that possible without apps/web importing `packages/game`/`packages/content` (see "Package interface consistency" below, now explicit that apps/web depends on neither).
- Errors: `unauthenticated`, `internal`.

### `PATCH /party/order`
- Payload: `{ requestId, expectedRevision, order: [HeroId, HeroId, HeroId] }`. Session-only.
- Ownership: all three heroIds must belong to the session account and be distinct. **M1-01 decision: reorder is allowed at any expedition status**, since front position only affects future expedition starts and never mutates the already-`frozenLoadout` of a running expedition (see Worked example 9).
- Response: `{ ok: true, data: { partyOrder }, revision }`.
- Errors: `unauthenticated`, `validation` (wrong count/duplicate), `forbidden` (foreign hero ID), `conflict` (stale `expectedRevision`), `internal`. (`active_expedition` does **not** apply to this endpoint.)

### `POST /equipment/equip`
- Payload: `{ requestId, expectedRevision, heroId, itemInstanceId, slot: "weapon"|"armor"|"trinket" }`. Session-only.
- Ownership: hero and item must belong to account; item must not already be equipped by a different hero; item's definition slot must match `slot`.
- Response: `{ ok: true, data: { hero }, revision }`. **M1-10 decision:** this `hero` also carries the same additive `effectiveStats` field as `/account/state`, recomputed post-equip, so the UI can refresh a single hero's displayed stats from this response without a full refetch.
- Errors: `unauthenticated`, `validation` (wrong slot), `forbidden` (foreign hero/item), `not_found` (unknown heroId/itemInstanceId), `active_expedition` (expedition active — checked before `conflict`; see Revision & idempotency protocol), `conflict` (duplicate equip target / stale revision), `internal`.
- **M1-08 decision — precondition order (equip/unequip):** ownership → `active_expedition` → `validation` (wrong slot/level/class) → `conflict` (item equipped by another hero). All run at protocol step 3, so none writes a receipt.

### `POST /equipment/unequip`
- Payload: `{ requestId, expectedRevision, heroId, slot }`. Session-only.
- Ownership/errors mirror equip: `unauthenticated`, `validation`, `forbidden`, `not_found`, `active_expedition`, `conflict`, `internal`. **M1-10 decision:** `hero` in the response also carries `effectiveStats`, same as equip.
- **M1-08 decision:** unequipping at a full inventory (100 unequipped item instances already held) returns `validation` with `details.reason="inventory_full"`. The 100-item cap (see Arena, boss, and migration invariants) is an inventory invariant that applies here too — unequip can never create a 101st unequipped item.

### `POST /hero/specialization`
- Payload: `{ requestId, expectedRevision, heroId, specializationId }`. Session-only.
- Ownership: hero belongs to account, hero level ≥ 3, specializationId valid for hero's class.
- Response: `{ ok: true, data: { hero }, revision }`. **M1-10 decision:** `hero` also carries `effectiveStats`, same as equip/unequip.
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
- **M1-10 decision (makes an implicit rule explicit after a review finding):** `apps/web` depends on none of `contracts`, `game`, or `content` — it imports only the DTO shapes it needs as hand-written local types and reads server-computed values (including the `effectiveStats` field proposed above) rather than recomputing anything. `apps/web`'s only legitimate package-graph edge in this document's terms is the HTTP boundary to `apps/server`, never a direct source dependency on the engine/content packages.

No circular package dependency exists in this graph: `content` and `contracts`' type-only edge to `game` are the only cross-package imports besides `apps/server`'s aggregation.

## Open items for downstream tasks (not blockers)

- M1-02 supplies the exact combat formulas/stat tables that `packages/game`'s pure functions will implement against the state shapes frozen here; no DTO shape change is anticipated.
- M1-02 supplies the exact XP curve. The mid-expedition level-up stat-timing question is resolved by the M1-08 decision recorded in Worked example 10: expedition combat uses levels frozen at start for the rest of that run; boss/arena use live levels immediately.
- M1-05 must confirm `node:sqlite` supports the transaction pattern described (short transactions, prepared statements, revision recheck before commit) on the pinned Node version; if it cannot, report back here before M1-07 proceeds, since the idempotency/revision protocol assumes standard ACID transactions.
- M1-07 implements session/auth and the ownership checks enumerated per endpoint above; the account-private vs public data split here is the authorization contract it must satisfy.
- **M1-10 proposal (pending CTO review):** add `effectiveStats`/`xpToNext` server-computed fields to `GET /account/state` and the equip/unequip/specialization responses so `apps/web` can display real hero stats without importing `packages/game`/`packages/content` (see `GET /account/state` and `Package interface consistency` above). Until accepted and implemented by an `apps/server`-scoped task, `apps/web`'s Company/Inventory screens show raw hero fields only (level/xp/class/spec/gear names), with an inline note that stat deltas aren't available yet.
