# M3 candidate: class/secondary-class respec at level-scaled cost

Player feedback captured by this task (Game Director task `1427c61d-83e2-4d18-84c8-19e178ce53ff`):
it is currently unclear/unavailable how a hero's primary/secondary class, chosen once via the M2-22
build/recruitment flow, can later be changed. **Status: specification only — not scheduled, not
implemented.** This does not amend `classes.md` sections 2/4/9 (the M2-22 freeze), `contracts.md`,
`combat.md`, `economy/gear.md`, `packages/contracts`, or `packages/game` — those stay frozen as-is
until an M3 task actually schedules this change and a CTO/Gameplay Programmer pair amends contracts
and engine. This document gives whoever picks that task up an implementable shape to start from, not
a decision that it ships as written.

## 1. What already exists today (`classes.md`, unchanged by this spec)

- **Primary class**: fixed permanently at creation/recruitment (`classes.md` 2, "fixed at
  creation/recruitment, section 9"). There is **no existing mechanism, free or paid, to change it.**
  This is the capability the player feedback is actually asking for.
- **Secondary class**: selectable once a hero reaches level 3; "free and unlimited outside an active
  expedition" (`classes.md` 4.2) — the player is **not** blocked here; they may already reassign a
  hero's secondary class at no cost any time the hero's account has no active expedition. This spec
  does not touch that existing free path.
- **Skill loadout**: 2 active + 2 passive slots drawn from the union of primary+secondary unlocked
  skills at the hero's level (`classes.md` 4); also free/unlimited outside an active expedition.

So the real gap is narrower than "class change is unavailable": only **primary class change** has no
path at all today. This spec's new, paid mechanic is scoped to that gap, with an option to bundle a
(still-free) secondary change into the same request for convenience.

## 2. Scope

**In scope — a new paid mutation, "class respec":**
- Changes a hero's **primary class** to any of the 6 base classes (`classes.md` 1), optionally
  **together with** a new secondary class (or clearing it to `null`) in the same request.
- Available any time the hero's account has no active expedition (same lock as every other
  loadout-shaped mutation, `contracts.md`'s `active_expedition` check) — consistent with section 1's
  existing rules, not a new restriction.
- Costs gold + a material, scaling with the hero's current level (section 3).
- Resets the hero's skill loadout (section 4).
- Subject to a per-hero cooldown (section 5).

**Out of scope:**
- **Secondary-only change with no primary change**: already free and immediate per `classes.md` 4.2;
  this spec does not add a cost to that existing path, and does not require routing it through the new
  mutation. A player who only wants a new secondary class keeps using today's free switch.
- Equipment, formation/`partyOrder`, dungeon runs, boss/arena challenges — unaffected, same as the
  sibling M3 spec `m3-mid-expedition-loadout-change.md` section 1's exclusions for the same reasons
  (those surfaces either have no staleness problem or are out of this feedback's scope).
  `m3-mid-expedition-loadout-change.md`'s in-expedition pending-change mechanic is unrelated: this
  respec never runs during an active expedition at all, so there is no "takes effect next fight"
  question here — the change is immediate once committed, exactly like today's free secondary switch.

## 3. Cost formula

Let `L` = the hero's current level (1-10, `classes.md` 26 / `gear.md` 16 — level cap unchanged).

```
goldCost(L)    = 100 * L
scrapCost(L)   = 5 * L
sigilCost(L)   = 1 if L >= 5, else 0
```

- Materials are `material_scrap` and `material_sigil` (`economy/gear.md` section on material IDs);
  no `material_core` requirement — cores are reserved for epic crafts per `gear.md`, and a respec is
  not a gear-tier action.
- The sigil requirement at `L >= 5` lines up with the level at which a class's second ("II") active
  skill unlocks (`classes.md` 5: "level 5... level 8") — past that point the hero has a materially
  larger kit invested in the old primary class, so the cost step reflects a bigger reset, not an
  arbitrary threshold.
- **One flat cost regardless of whether the request changes primary only or primary+secondary
  together.** Bundling a secondary change into the same request is a convenience, not a second
  purchase — the secondary slot's own switch was already free before this spec existed (section 1),
  so there is nothing to charge extra for.
- Worked examples: level 1 hero respec = 100 gold, 5 scrap, 0 sigils. Level 5 hero = 500 gold, 25
  scrap, 1 sigil. Level 10 (cap) hero = 1000 gold, 50 scrap, 1 sigil.
- For scale: recruitment costs `150 * ownedHeroCount` gold (`classes.md` section 8, reused by
  `gear.md` line 21); a single Advanced-profile expedition cycle nets roughly 25-50 gold and 2-4 scrap
  per `gear.md`'s per-cycle formulas. A level-10 respec (1000 gold, 50 scrap, 1 sigil) is deliberately
  priced above one new recruit's worth of gold — this is a considered reallocation of an existing
  hero, not a casual toggle — while staying affordable within roughly a day's expedition income per
  `gear.md`'s weekly-balance worked examples (section "Five heroes" and the day/week income figures),
  so a player is never permanently locked out of fixing an early mis-pick.
- **Insufficient gold or materials**: the request is rejected before any state changes (same
  all-or-nothing validation pattern as a crafting request in `gear.md`) — no partial charge, no partial
  class change.

## 4. Skill loadout reset

Changing a hero's primary class can invalidate skills currently sitting in that hero's loadout slots
(the old primary's skills may not exist in the new primary+secondary union, `classes.md` 4). Rather
than attempt a partial remap (which could silently leave some slots filled and others not, depending on
overlap with the kept secondary), this spec fixes one rule:

- **A committed class respec always clears and auto-refills all 4 loadout slots** from scratch, using
  the same auto-fill rule `classes.md` already uses for a freshly recruited hero and for a hero that
  has not yet chosen a secondary (`classes.md` 4, 5.7: "auto-filled with its whole kit" when there is
  no real choice yet) — concretely, fill with the new primary's 2 actives + 2 passives unlocked at the
  hero's current level, leaving the 2 secondary-class slots (if any secondary skill would also be
  unlocked) for the player to assign afterward exactly as they would for any dual-classed hero today.
  This is a **full reset**, not a best-effort carryover, so the result is always a valid, unambiguous
  loadout with no leftover reference to the old primary's skills.
- This reset applies even if the request only adds/changes the secondary and leaves the primary
  unchanged *as part of a combined request* — but note that path is redundant with the already-free
  secondary-only switch (section 1), which this spec does not change the behavior of. If the owner
  later wants the free secondary-only switch to also force a full reset (today `classes.md` 4.2 does
  not specify loadout handling on a secondary switch), that is a one-line amendment to `classes.md`
  4.2 itself, not something this spec can set unilaterally since 4.2 is part of the frozen surface.
- The player is **not** charged again to re-pick a sensible loadout after a respec; picking a loadout
  is the existing free action it always was.

## 5. Cooldown / frequency limit

- A hero that has just undergone a class respec may not respec again for **24 real-world hours**
  (wall-clock, not cycle-count — this is a player-pacing guard, not a simulation-determinism concern,
  unlike the cycle-index boundary in `m3-mid-expedition-loadout-change.md` section 2; nothing about
  this mutation is replayed through expedition settlement).
- Tracked as a single `lastClassRespecAt` timestamp per hero, checked at request time: reject with a
  dedicated error (illustrative code `respec_on_cooldown`, section 7) if `now - lastClassRespecAt < 24h`;
  on success, set it to the commit time.
- No cap on lifetime respec count and no cost escalation by respec count — only by level (section 3).
  This keeps the mechanic simple and reversible: if the owner later wants repeated respecs on the same
  hero to cost more (e.g. to discourage server-side min-maxing against specific content), that is an
  additive multiplier on top of section 3's formula, not a redesign of this spec.
- The cooldown is independent of, and in addition to, the existing `active_expedition` lock (section
  2) — both must be clear for a respec to succeed.

## 6. Why these choices

- **Scoped to primary-class change, not "any class change,"** because that is the only capability the
  player feedback actually identifies as missing (section 1) — the existing free secondary switch
  already works and this spec should not add friction to something that isn't broken.
- **Level-scaled, not flat, cost** because a higher-level hero represents more invested play time and a
  bigger kit being discarded; a flat cost would make respec trivially cheap for the heroes where it
  matters most (deep into the level-10 kit) and comparatively expensive for a level-1 hero where the
  "mistake" is cheapest to have made in the first place — scaling the other way around matches how
  costly the decision actually is to reverse.
- **Full loadout reset instead of partial carryover** (section 4) to avoid an ambiguous, partially-valid
  intermediate state; the reset is free to re-fix, so this costs the player one extra click, not
  currency.
- **A wall-clock cooldown, not a per-respec cost escalation,** as the simplest guard against rapid
  flip-flopping (e.g. respec-to-counter-content-then-respec-back within the same session); escalation
  was considered but rejected for v1 as an unnecessary complication the owner did not ask for — see
  section 5's note on how to add it later if needed.
- **No cap on lifetime respec count.** The level-scaled cost plus 24h cooldown already bound how often
  and how cheaply a hero can respec; a separate lifetime cap would be a second, redundant throttle for a
  problem the first throttle already solves.

## 7. Precondition / contract shape (illustrative — the actual schema is M3's CTO/contracts task to cut)

A new mutation, e.g. `POST /hero/:heroId/respec`, going through the same ownership/precondition/
idempotency/revision protocol as every other mutation (`contracts.md` Revision & idempotency
protocol): `requestId`, `expectedRevision`, ownership check (hero belongs to account), body
`{ newPrimaryClassId, newSecondaryClassId | null | undefined }` (`undefined` = leave secondary
unchanged).

Validation order (all-or-nothing, matching section 3's no-partial-charge rule):
1. `active_expedition` check (reject if the hero's account has an active expedition, section 2).
2. `respec_on_cooldown` check (reject if `now - lastClassRespecAt < 24h`, section 5).
3. `newPrimaryClassId` is one of the 6 valid `classId`s (`classes.md` 1); if `newSecondaryClassId` is
   provided and non-null, it is also one of the 6 and the hero's level is `>= 3` (`classes.md` 2 — the
   existing secondary-unlock gate, unchanged).
4. Sufficient gold/scrap/sigil per section 3's formula at the hero's current level; reject with
   `insufficient_funds` (or a more specific `insufficient_materials`) otherwise.
5. Commit: deduct currency/materials, set `primaryClassId`/`secondaryClassId`, reset the loadout
   (section 4), set `lastClassRespecAt = now`, bump `expectedRevision` — one transaction.

This mutation is new (there is no analogous M1/M2 endpoint to extend), so it introduces no precondition
carve-out on any *existing* mutation, unlike the sibling spec's section 6.

## 8. UI affordance

Extends `ui-spec.md`'s existing shared-component and copy-key conventions; does not modify the M1-09
freeze (additive only, inert until M3 implements it). Also extends `classes.md`'s terminology (primary/
secondary class, not M1's retired "specialization") rather than `ui-spec.md`'s stale M1-era
`spec_locked_*` copy keys, since M2-22 already retired specialization in favor of classes.

- **Hero card / hero detail screen:** a new **"Respec class"** action button next to the existing
  class/secondary-class display. Disabled states, each with its own copy key (following `ui-spec.md`'s
  `disabled.*` table convention):
  - `disabled.respec_locked_expedition` — "Class respec is unavailable while this hero is on
    expedition." (reuses the same condition as `disabled.spec_locked_expedition` conceptually, but
    under the new key since `classes.md`'s terminology has moved on from "specialization.")
  - `disabled.respec_on_cooldown` — "This hero can respec again in {hoursRemaining}h." (dynamic copy,
    following the same pattern as other countdown-style disabled copy already in `ui-spec.md`.)
  - `disabled.respec_insufficient_funds` — "Not enough gold/materials for this respec." (shown with the
    exact missing amounts, following `gear.md`'s crafting-UI convention of showing short-fall rather
    than just a flat refusal.)
- **Respec confirmation screen:** shows the hero's current primary/secondary, a class picker for the
  new primary (and optionally new secondary, gated the same way the existing secondary picker already
  is on level `>= 3`), the exact gold/scrap/sigil cost for this hero's current level (section 3,
  computed client-side for display only — the server is authoritative and re-validates), and an
  explicit warning copy key `respec.loadout_reset_warning` — "Changing this hero's class will reset
  their skill loadout. You'll need to re-pick skills afterward." — shown before the player confirms,
  not just after.
- **Post-respec:** on success, route the player directly to the skill-loadout editor for that hero
  (since section 4 guarantees the loadout needs re-picking), rather than leaving them on a card that
  looks finished but has a stale-looking auto-filled kit.
- **No change to the existing free secondary-only switch's UI** (section 1) — that control keeps
  working exactly as it does today; this spec only adds the new "Respec class" button alongside it.

## 9. Acceptance shape for whoever schedules this as a real M3 task

(Not run here — no code changes accompany this spec.)

1. Respec a level-1 hero's primary class with sufficient funds; confirm exactly 100 gold + 5 scrap + 0
   sigils are deducted, the hero's `primaryClassId` changes, and all 4 loadout slots are filled from the
   new kit (section 4), not left referencing the old primary's skills.
2. Respec a level-5+ hero; confirm the 1-sigil requirement is enforced (reject with insufficient
   materials if the account has 0 sigils, even with enough gold/scrap).
3. Attempt a second respec on the same hero within 24h of the first; confirm `respec_on_cooldown`
   rejection with no currency/material deduction.
4. Attempt a respec while the hero's account has an active expedition; confirm `active_expedition`
   rejection, matching the existing lock's behavior for every other loadout-shaped mutation.
5. Confirm the existing free secondary-only switch (`classes.md` 4.2) is unaffected: no cost, no
   cooldown, still blocked only by `active_expedition`, exactly as before this spec.
6. Confirm a combined primary+secondary respec request is charged once (section 3's flat-regardless-
   of-bundling rule), not twice.

## 10. Unresolved issues

- `classes.md` 4.2 does not specify loadout-slot handling when only the secondary class changes via
  the existing free path; this spec deliberately leaves that gap as-is (section 4) rather than
  resolving it, since doing so would require amending the frozen `classes.md`, out of this task's
  authority. Flagged for the owner to decide if it ever causes a stale-skill-reference bug report.
  Note: the owner feedback that created this task did not mention the free secondary path at all — it
  is pre-existing scope, not something this task was asked to touch.
- The exact contract/schema shape in section 7 is illustrative, not authoritative — M3's CTO task must
  cut the real `packages/contracts` mutation and reconcile it with whatever M2-25/M2-26/M2-28 contract
  and engine surface has actually landed by the time M3 starts.
- Cost numbers (section 3) are this spec's proposal, not a simulated/tuned figure — no economy
  simulation was run for this task (that is Economy Designer scope, e.g. a future M3 tuning task
  analogous to M1-13/M2-28). The worked-example comparison against recruitment/income figures in
  section 3 is a reasoned estimate, not simulation evidence.
- Whether a lifetime respec cap or escalating cost is ever needed (section 5/6) is left for the owner
  to revisit after real play data exists; this spec's default is deliberately the simpler, more
  reversible option.
