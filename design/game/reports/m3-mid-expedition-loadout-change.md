# Spec: mid-expedition deferred skill loadout change (M3 candidate) — evidence report

Date: 2026-10-22 · Owner: Systems Designer · Task ID f4491607-20b6-413e-b20c-bc0f026479fb

## What changed

Added one new document: `design/game/m3-mid-expedition-loadout-change.md`. No other file was
touched — `combat.md`, `classes.md`, `contracts.md`, `ui-spec.md`, `packages/game`,
`packages/content`, and `packages/contracts` are all unchanged, per the task's explicit instruction
not to implement or amend those surfaces now. This is a specification-only deliverable for a task
the owner has sequenced after M2-25's contracts and M2-26's engine land and stabilize.

The spec covers, as requested:

1. **How a pending change is recorded against a running, deterministic, server-authoritative
   expedition.** A per-hero `pendingLoadoutChanges` map on the `Expedition` entity, each entry
   storing an `effectiveFromCycleIndex` fixed at commit time (= the persisted `cyclesCompleted` at
   that instant, i.e. the first not-yet-simulated cycle) plus the two active-skill and two
   passive-skill IDs requested. Section 2 explains why the boundary must be a stored cycle index, not
   a wall-clock moment: expedition cycles are simulated lazily, in batches of up to 480, at
   `settle`/`stop` time (`contracts.md`'s settlement algorithm) — "next fight" has no stable meaning
   otherwise. Section 4 extends that existing per-cycle walk so cycles below the boundary keep the old
   loadout and cycles at/above it use the new one, then consumes (merges) the pending record into
   `frozenLoadout` once the walk passes the boundary, in the same settlement transaction. This keeps
   simulation a pure function of stored inputs, so seed/log replay stays bit-identical (M2.md's
   determinism requirement).
2. **Hero death and expedition-end handling before the next fight** (section 5). Battle-local death
   needs no special case (no permadeath in this game per `first-playable.md`; the hero just fights
   again next cycle). An expedition `stop` before the boundary cycle is ever simulated discards the
   unconsumed pending record — once `status="none"`, loadout edits are already immediate and free, so
   a surviving "pending" record would be a stale, behaviorless concept.
3. **UI affordance for "change pending, takes effect next fight"** (section 7): a `LoadoutPendingBadge`
   on the hero card/editor (reusing `ui-spec.md`'s existing badge pattern), a distinct Save label and
   inline explanatory copy while an expedition is active, and a Cancel-pending control — all additive
   to the M1-09 UI-spec freeze, inert until M3 implements it.
4. A narrowly scoped precondition carve-out for M3's contracts task (section 6): skill-loadout-only
   mutations succeed-but-defer while `active_expedition`; equip/unequip/class-reassignment keep the
   existing hard `active_expedition` rejection unchanged.
5. An explicit out-of-scope list (section 1): primary/secondary class, equipment, dungeons, and
   boss/arena (which already use live loadout and have no staleness problem).

## Why these choices

- **Scope held to "skill loadout" only**, matching the owner's literal wording ("change a roster
  hero's skill loadout"). Broadening to equipment or class reassignment would reopen questions
  (stat recalculation mid-run, synergy changes) the owner didn't ask about and that the current
  frozen `contracts.md`/`classes.md` rules already handle conservatively (hard-locked until stop) —
  no reason to disturb that for a scope the owner didn't request.
- **Cycle-index boundary, not a timestamp or "next poll"**, because expedition combat is deferred/
  batched, not simulated live (`contracts.md`'s settlement algorithm, `architecture.md`'s determinism
  invariant). A wall-clock boundary would let a single large batched settlement straddle the change
  in a way that depends on *when* the server happens to run the batch, breaking the "same seed/log →
  same replay" guarantee M2.md states as a hard requirement.
- **Discard-on-stop rather than carry-forward.** A pending change that could survive a stop/start
  boundary would need its own validation-at-a-later-time story (hero's unlocked pool, party
  membership, etc. could all differ by then) for a case the owner never described wanting (resuming a
  half-finished edit across expeditions). Since post-stop editing is already free and immediate,
  dropping the pending record is strictly simpler and costs the player nothing beyond re-clicking
  Save once, so this is the reversible, low-risk default — if the owner later wants carry-forward,
  that is a one-line removal of section 5's discard rule, not a redesign.

## Acceptance check: evidence

| Check | Command/evidence | Result |
| --- | --- | --- |
| Task scope respected (no engine/contract/M2-26/M2-27 edits) | `git status` / `git diff --stat` against task base `9e740ffcc216b5a3f68b694a0d989d7debb860e9` | Only the two new files under `design/game/` are added; `packages/*`, `contracts.md`, `combat.md`, `classes.md`, `ui-spec.md` untouched. |
| Spec addresses all three owner asks (recording, death/end handling, UI affordance) | Manual read-through of `m3-mid-expedition-loadout-change.md` sections 3-5 (recording), 5 (death/end), 7 (UI) | Present; see "What changed" above for the mapping. |
| Determinism preserved (seed/log replay) | Design argument in section 2 and 4 of the spec (no code to execute yet — this is a specification task, not an implementation task) | Reasoned, not executed; no test harness exists for an unimplemented feature. |
| No duplicate/competing M3 backlog task created | Only the task block below (a continuation note to the Producer, not a new implementation task) is sent | No `task` block requesting engine/contract work was issued. |

No command produces a pass/fail for a pure design document beyond the git-diff scope check above;
there is no build/test surface for this task (nothing in `packages/*` changed). This is stated
honestly rather than claimed as a verified runtime pass.

## Unresolved issues

1. `design/studio/priorities.md` does not currently have the "M3 candidate backlog" section the
   task description points to. The spec was written directly from the owner feedback text, which is
   self-contained; see the spec document's own "Note on sourcing." The Producer should add that
   section (or correct the reference) when this is actually scheduled as a numbered M3 task.
2. Dungeon-run extension is explicitly out of scope and undesigned (spec section 1).
3. The illustrative contract/schema shape in spec section 3/6 is not authoritative — it needs to be
   re-cut by M3's CTO task against whatever M2-25/M2-26 contract and engine surface has actually
   landed by the time M3 starts (M2-22 is still only `needs_review`, not approved, as of the M2.md
   sequencing-gap note — this spec does not assume anything about M2-22/M2-25/M2-26's final shape
   beyond what is already committed in this worktree).

## Next task

This is a specification deliverable with no immediate dependent task to launch now — the owner
explicitly asked this not be scheduled or started as engine/contract work yet. The natural next step,
when the owner is ready to schedule M3, is a CTO contracts task (amend `contracts.md`/
`packages/contracts` for `pendingLoadoutChanges` per this spec's section 3/6) followed by a Gameplay
Programmer engine task (`packages/game` settlement-walk change per section 4) and a server/UI task
(per section 7) — not started here.
