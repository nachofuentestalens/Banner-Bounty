# M3 candidate: mid-expedition deferred skill-loadout change

> **M3-03 precedence (2026-10-30):** This candidate is now reconciled by [m3-systems.md](m3-systems.md) section 3 (M3-03). Its persisted cyclesCompleted boundary and live-level eligibility argument below are superseded: settle overdue eligible history at accepted command time under the old build; preserve the partial battle; validate against frozen run level; apply at the next eligible boundary. Dungeon builds stay frozen. Applied selections persist; unconsumed pending selections are explicitly discarded on stop. Candidate schema is not the M3 API contract.

Owner feedback (2026-10-22), captured by this task (Game Director task `f4491607-20b6-413e-b20c-
bc0f026479fb`). **Status: specification only — not scheduled, not implemented.** This is explicitly
sequenced after M2-25's contract surface and M2-26's engine land and stabilize, and must not be
built inside the in-flight M2-26/M2-27 work. It does not amend `classes.md` section 4.2,
`contracts.md`'s M1/M2 `active_expedition` lock, `combat.md`, or `packages/contracts`/`packages/game`
— those stay frozen as-is until an M3 task actually schedules this change and a CTO/Gameplay
Programmer pair amends contracts and engine. This document gives whoever picks that task up an
implementable shape to start from, not a decision that it ships as written.

**Note on sourcing:** the task description points to a "M3 candidate backlog" section in
`design/studio/priorities.md`. As committed in this worktree, `priorities.md` has no such section
(it ends at the M2 delivery order). This spec proceeds directly from the owner feedback text, which
is self-contained; the missing cross-reference is flagged here as an unresolved documentation gap,
not a blocker for writing the spec itself.

## 1. Scope

**In scope:** while a hero's account has an **expedition** `status="active"` (`contracts.md`
`Expedition` entity), the player may submit a new **skill loadout** (the 2 active-skill-slot + 2
passive-skill-slot assignment from `classes.md` section 4, drawn from the hero's already-fixed
primary+secondary pool) for a hero currently in that expedition's party. The change does not apply
to the in-progress cycle; it takes effect starting the next cycle simulated after it commits.

**Out of scope (unchanged from classes.md 4.2 / contracts.md Worked example 9):**
- Primary/secondary class (re)assignment.
- Equipment (`equip`/`unequip`).
- Formation/`partyOrder` is already unlocked at any time (M1-01 decision) and needs no change here.
- Dungeon runs (`DungeonRun` is a fixed-length, non-repeating multi-floor run per `contracts.md`'s
  M2-25 addition, not an open-ended cycle loop — "next fight" is a less useful boundary there, and a
  whole dungeon run is short enough that build-time loadout is a reasonable limit). Boss challenges
  and arena fights already use the hero's **live** loadout at challenge time (`classes.md` 4.2), so
  they have no staleness problem to begin with and need no "pending" concept.
- A future task may extend this to dungeons; this spec does not design that extension.

## 2. Why "next fight" is not "next wall-clock battle"

Expedition combat is **not** simulated as it happens. Per `contracts.md`'s settlement algorithm, a
cycle (60s) is only materialized into events when `expedition/settle` or `expedition/stop` runs,
which can batch up to 480 unsimulated cycles in one call using the `rngState` and `frozenLoadout`
snapshot taken at the last checkpoint. So "the next fight" cannot mean "whenever the client happens
to poll next" — it must mean a specific **cycle index**, fixed at the moment the change commits, so
that the exact same change produces the exact same result no matter when (or how many times) it is
later replayed from the event log. This preserves M2.md's determinism requirement (same seed/log →
same replay).

## 3. Data shape (illustrative — the actual schema is M3's CTO/contracts task to cut)

Add a per-hero pending-change map to the running `Expedition` (and, by the same shape, a running
dungeon run if a future task extends this there), alongside the existing `frozenLoadout`:

```
Expedition.pendingLoadoutChanges: {
  [heroId]: {
    effectiveFromCycleIndex: number,   // = Expedition.cyclesCompleted at the instant this commits
    activeSkillIds: [string, string],
    passiveSkillIds: [string, string],
    requestedAt: timestamp
  }
}
```

- `effectiveFromCycleIndex` is set to the **persisted** `cyclesCompleted` value at commit time — the
  index of the next cycle that has not yet been simulated. It is never recomputed from wall-clock
  time later.
- The request goes through the same ownership/precondition/idempotency/revision protocol as every
  other mutation (`contracts.md` Revision & idempotency protocol): `requestId`, `expectedRevision`,
  ownership check (hero belongs to account, is in the active expedition's party), validation that
  both skill IDs are in the hero's **current** unlocked pool (primary ∪ secondary at the hero's
  current level — see 3.1 on why no re-check is needed later).
- A second pending-change request for the same hero before the first is consumed simply **overwrites**
  the stored record. Its `effectiveFromCycleIndex` recomputes to the same value as the first request's,
  because `cyclesCompleted` only advances on a `settle`/`stop` call — if no settlement happened between
  the two requests, the boundary cycle hasn't moved, so this is a plain "latest request wins," not a
  second deferred step.
- This record is **per hero**, not per expedition: different heroes in the same party can each have
  their own independent pending change with their own boundary.

### 3.1 Why commit-time validation is sufficient

A hero's unlocked skill pool only **grows** with level (`classes.md` 4/5.7: each class's "II" active
unlocks at level 5, "II" passive at level 8; nothing ever re-locks). Mid-expedition leveling already
does not change *combat* stats for the rest of that run (`contracts.md` Worked example 10: frozen
levels govern the remaining cycles), so the hero's effective unlocked pool for simulation purposes is
also frozen at `frozenLoadout`'s own snapshot level. A skill ID valid against the hero's pool at
commit time stays valid at consumption time; no re-validation is needed when the boundary cycle is
actually simulated.

## 4. Applying a pending change during simulation

At `expedition/settle` (or the settlement portion of `stop`), the server already walks cycles one at
a time from the current `cyclesCompleted` to the target count, using `frozenLoadout` and advancing
`rngState` (`contracts.md`'s settlement algorithm). Extend that walk:

1. For each hero with an entry in `pendingLoadoutChanges`: for any cycle index `>= effectiveFromCycleIndex`,
   simulate that hero using the pending record's `activeSkillIds`/`passiveSkillIds` instead of
   `frozenLoadout`'s stored values for that hero. Cycles with index `< effectiveFromCycleIndex` keep
   using the old, already-frozen values — this is the "not retroactive" guarantee.
2. Once the walk reaches or passes `effectiveFromCycleIndex` for a given hero, the pending record is
   **consumed**: merge its `activeSkillIds`/`passiveSkillIds` into that hero's entry inside
   `frozenLoadout` itself (so it is simply the hero's current frozen loadout from that point on) and
   delete the `pendingLoadoutChanges[heroId]` entry, in the same transaction that commits the
   settlement.
3. If the settlement's target cycle count never reaches `effectiveFromCycleIndex` (e.g. a settle call
   that credits 0 cycles, or credits cycles that all fall before the boundary — not possible today
   since `effectiveFromCycleIndex` is always `<=` the pre-call `cyclesCompleted` plus the batch about
   to run, but kept as an explicit case for a future non-monotonic batching scheme), the pending
   record simply stays pending, unconsumed, for the next settle call. No partial-application state is
   introduced.

This keeps the per-cycle simulation a pure function of `(frozenLoadout snapshot, pendingLoadoutChanges
snapshot, rngState, cycle count)` exactly like today's `(frozenLoadout, rngState, cycle count)` — a
replay of the same stored inputs always produces the same event log.

## 5. Hero death and expedition end before the next fight

- **Battle-local death:** `first-playable.md` already establishes no permanent death — every cycle's
  battle starts at full HP, win or lose. A hero "dying" in the cycle immediately before the pending
  change's boundary has no special handling: that cycle already used the old loadout (correctly, per
  the not-retroactive rule), and the hero simply fights again next cycle with full HP, picking up the
  new loadout exactly as scheduled once the boundary cycle is reached. There is no roster-removal or
  permadeath case to handle for an expedition.
- **Expedition ends (`stop`) before the boundary cycle is ever simulated:** `stop` runs the full
  settlement (crediting whatever cycles are actually owed) and then, in the same transaction, flips
  `status="none"`. Two cases:
  - If that settlement's cycle walk reaches the boundary, the pending change is consumed exactly as
    in section 4 before the expedition closes — the player sees it take effect in the final
    settlement's cycle log.
  - If it does not (e.g. the expedition is stopped moments after the change was requested, crediting
    zero or only pre-boundary cycles), the **unconsumed `pendingLoadoutChanges[heroId]` entry is
    discarded** when `status` flips to `"none"`. This needs no special-case UI or "resume pending
    change" affordance: once `status="none"`, skill-loadout edits are already unlocked and immediate
    (same as equip/spec today), so the player just sets the loadout they want directly. A pending
    record surviving into a stopped (or not-yet-started) expedition would be a stale, confusing
    concept with no behavior of its own — dropping it is strictly simpler and loses nothing the player
    can't redo in one click.
- **A fresh `expedition/start` after a stop never inherits a leftover pending record** — `start`
  already freezes a brand-new `frozenLoadout` snapshot from current (immediately-editable) state; the
  prior expedition's `pendingLoadoutChanges` map is gone with that expedition's row/lifecycle, not
  copied forward.

## 6. Precondition change needed (illustrative, for whoever cuts the M3 contract)

Today, `hero/specialization`-equivalent-for-skills and the `active_expedition` lock treat any
loadout-shaped mutation as hard-rejected while an expedition runs (`contracts.md` Worked example 9).
This feature needs a **narrower carve-out**: a skill-loadout-only mutation (2 active + 2 passive slot
IDs, hero's primary/secondary unchanged) while `status="active"` should **succeed** but write to
`pendingLoadoutChanges` instead of mutating `frozenLoadout` directly; every other loadout-shaped
mutation (equip, unequip, primary/secondary class assignment) keeps returning `active_expedition`
exactly as today. This is the one behavioral contract change this spec identifies for M3's CTO task —
not cut here, since this task does not touch `packages/contracts`.

## 7. UI affordance

Extends `ui-spec.md`'s existing shared-component and copy-key conventions; does not modify the M1-09
freeze (additive only, inert until M3 implements it).

- **Hero card (roster/party screens) and the skill-loadout editor:** while `status="active"` and the
  hero has an entry in `pendingLoadoutChanges`, show a `LoadoutPendingBadge` next to the hero's name,
  using the same visual slot as `RewardStateBadge` (`ui-spec.md` line 121) — a small inline badge, not
  a modal. Copy keys (new, following `ui-spec.md`'s "Copy additions" table style):
  - `loadout.pending.badge` (label) — short badge text, e.g. "Loadout change pending".
  - `loadout.pending.detail` (desc) — explains timing, e.g. "Takes effect at this hero's next fight,
    not retroactively and not mid-fight."
- **Skill-loadout editor, while an expedition is active:** the Save control's behavior and label
  change from the normal immediate-apply case:
  - Normal (`status="none"`): existing `action.equip`-style immediate apply, per `ui-spec.md`
    conventions — unchanged.
  - Active expedition: Save commits a pending change instead; label uses a distinct copy key
    (`action.save_pending_loadout`, e.g. "Save (applies next fight)") so the player is never told the
    change is already live when it is not. On success, show `loadout.pending.detail` inline (not just
    a toast) so it's visible on return visits to the screen, not just at submit time.
  - A **Cancel pending change** control appears whenever a pending record exists, reverting to the
    currently-frozen loadout with no server-side effect beyond deleting the pending record (same
    precondition/idempotency protocol as any other mutation). Copy key: `action.cancel_pending_loadout`.
- **Disabled-state copy parity:** equipment/specialization controls keep using the existing
  `disabled.equip_locked_expedition` / `disabled.spec_locked_expedition` keys (`ui-spec.md` lines 38-
  39) unchanged — this feature does not touch those controls or their copy, only the skill-loadout
  slots.
- **No change to expedition polling/mutation-lifecycle conventions** (`ui-spec.md`'s global
  conventions section): the pending-change mutation uses the same `requestId`/`expectedRevision`/
  disable-while-in-flight pattern as every other mutation.

## 8. Acceptance shape for whoever schedules this as a real M3 task

(Not run here — no code changes accompany this spec.)

1. Start an expedition with a party including hero H; let at least one cycle settle with H's original
   loadout; submit a new skill loadout for H while `status="active"`; confirm the response succeeds
   and the UI shows `LoadoutPendingBadge`.
2. Settle again; confirm the settlement's per-cycle log shows H using the **old** loadout for every
   cycle index below the recorded boundary and the **new** loadout from the boundary cycle onward (not
   retroactively rewriting already-committed cycles, not applying mid-cycle).
3. Replay the same `BattleReport`/cycle log twice from stored state; confirm bit-identical results
   (determinism preserved).
4. Submit a pending change, then `stop` the expedition before any further settle call reaches the
   boundary; confirm the pending record is gone and the hero's loadout is immediately, freely editable
   post-stop with no leftover "pending" UI state.
5. Confirm equip/unequip/primary-secondary-class requests still return `active_expedition` unchanged
   while an expedition is active (no regression to the existing hard lock).

## 9. Unresolved issues

- `design/studio/priorities.md` does not yet have the "M3 candidate backlog" section the task
  description references; this spec was written directly from the owner feedback text instead. The
  Producer/Game Director should add that section (or correct the reference) when actually scheduling
  this as a numbered M3 task.
- Dungeon-run extension (see section 1) is explicitly left undesigned.
- The exact contract/schema change in section 6 is illustrative, not authoritative — M3's CTO task
  must cut the real `packages/contracts` shape and reconcile it with whatever M2-25/M2-26 have landed
  by the time M3 starts.
