# Classes, dual-class, skills, formation and roster (M2-22 freeze)

> **M3-03 precedence (2026-10-30):** For M3, [m3-systems.md](m3-systems.md) sections 3-6 govern eight classes, sixteen primary specializations, three races, deferred skill edits, paid primary respec and free secondary switching. Existing six kits/curves remain unless explicitly amended there. M3 specializations are a new primary-only layer, not restored M1 actions. Historical M2 rules below remain traceable; the M3 freeze takes precedence for new M3 play.

This document is the frozen class/skill/formation/roster surface for M2's combat v2. It builds on
`combat.md`'s M1-02 freeze (kept intact above its own M2-22 addition) and on `content.md`. All math
is integer; every division is a floor (truncating) integer division unless stated otherwise, matching
the convention `combat.md` already established. Changing a number or rule here once `packages/game`
implements it (M2-26+) requires a recorded decision in this file.

M1's two-choice specialization system (`spec_guardian`/`spec_berserker`/.../`spec_warden`) is
**retired and replaced** by the skill-loadout system below. The three starter classes keep their
`classId`s and M1 base stat curves (no stat-table changes — this bounds migration risk and keeps
M1 saves trivially portable, see section 9); only their *actions* are reworked from "one of two
automatic specializations" into "a kit of 5 skills, 2 of which are player-chosen into a loadout."

## 1. Role taxonomy and the 6 base classes

| classId | Display | Role | HP base/growth | ATK base/growth | DEF base/growth | SPD (fixed) |
| --- | --- | --- | --- | --- | --- | --- |
| `class_vanguard` | Vanguard | Tank | 40 / +5 | 7 / +1 | 6 / +1 | 8 |
| `class_ranger` | Ranger | Physical damage | 32 / +4 | 9 / +2 | 4 / +1 | 12 |
| `class_arcanist` | Arcanist | Magic damage | 28 / +4 | 10 / +2 | 3 / +1 | 9 |
| `class_cleric` | Cleric | Healer | 34 / +4 | 7 / +1 | 5 / +1 | 9 |
| `class_rogue` | Rogue | Physical damage | 26 / +3 | 9 / +2 | 3 / +1 | 13 |
| `class_herald` | Herald | Support | 30 / +4 | 6 / +1 | 4 / +1 | 11 |

`statAtLevel(classId, level) = base + growth * (level - 1)`, levels 1-10 (level cap is unchanged from
M1; raising it is an Economy Designer decision for M2-28, out of this task's scope). Vanguard/Ranger/
Arcanist rows are copied verbatim from `combat.md` 1.1 — no stat change, satisfying "keep the existing
3 classes" while still reworking their behavior (section 5).

Role coverage: Vanguard=Tank, Cleric=Healer, Ranger+Rogue=Physical damage (two distinct flavors —
execute/AoE vs. crit/backline), Arcanist=Magic damage, Herald=Support. This satisfies M2.md's "≥6
base classes spanning tank, healer, physical damage, magic damage, and support" with exactly 6.

## 2. Dual-class system

Every hero has exactly one **primary class** (fixed at creation/recruitment, section 9) and at most one
**secondary class** (`secondaryClassId | null`), selectable once the hero reaches **level 3** (same
threshold M1 used for specialization — reused deliberately to keep the unlock-gate pattern familiar and
the migration mapping trivial, section 10). Below level 3, or with no secondary chosen yet, a hero uses
only its primary class's kit (section 5) and the plain `dualClassBase` formula below degenerates to
`primaryLeveled` since `secondaryLeveled` terms are all zero.

### 2.1 Effective stat computation order (supersedes `combat.md` 1.2 for M2+; per battle, computed once
at battle start from live/frozen stats exactly as M1 did — only the leveled-stat step changes)

1. `primaryLeveled = statAtLevel(primaryClassId, level)` per stat.
2. `secondaryLeveled = statAtLevel(secondaryClassId, level)` per stat, or `0` for every stat if
   `secondaryClassId == null`.
3. `dualClassBase = primaryLeveled + floor(secondaryLeveled / 4)` per stat (secondary class contributes
   a flat 25% layer of its own curve — never a penalty, since `secondaryLeveled` is always ≥0 and this
   term is always added, never subtracted).
4. `equipped = dualClassBase + sum of equipped items' flat bonus for that stat` (`content.md` 2.1,
   unchanged — gear mechanics are M2-23's scope, not touched here).
5. `withPassives`: apply the hero's two equipped passive skills' **battle-start-fixed** modifiers only
   (section 5 marks each passive as either battle-start-fixed or dynamically-rechecked; only the former
   apply here) — first sum all flat (+N) modifiers and add them, then sum all percentage (±N%)
   modifiers and apply once: `stat = floor(statWithFlats * (100 + netPercent) / 100)`, where `netPercent`
   is clamped to `[-80, +∞)` (a stat is never reduced below 20% of its pre-percentage value by any
   combination of modifiers — this clamp also covers in-battle debuffs in step 6, applied the same way).
6. `effective = withPassives`. Fixed for the whole battle except where a skill/passive explicitly
   re-reads current HP or current battle state (Vanguard's Last Stand, Ranger's Momentum, Arcanist's
   Arcane Reserve — section 5 marks each) — these never mutate the stored `effective` baseline; they
   are read-time adjustments applied fresh wherever the formula that uses them is evaluated.
7. **In-battle buffs/debuffs** (Fortify/Weaken/Haste, section 6) are never baked into `effective`. Any
   formula that reads a stat affected by an active status combines `effective`'s value for that stat
   with the net percentage/flat of all currently-active statuses touching it, using the same clamp as
   step 5, recomputed fresh every time (never cached across rounds).

### 2.2 Named synergy pairs

Dual-classing is always useful (step 3 above always adds a stat layer and unlocks the secondary's skill
pool, section 5.7), but the following ordered `(primary, secondary)` pairs get one additional, specific,
documented bonus layered on top of the generic rule. Unlisted pairs are fully valid and still grant the
generic stat layer + skill pool access; they simply have no named bonus.

| Primary → Secondary | Name | Bonus |
| --- | --- | --- |
| `class_vanguard` → `class_herald` | Banner Bearer | Bulwark Call's Taunt duration is 3 rounds instead of 2. |
| `class_cleric` → `class_vanguard` | Battle Medic | Mending Light also grants its heal target `status_fortify` (+30% DEF, 1 round). |
| `class_arcanist` → `class_rogue` | Shadowflame | `status_burn` applied by this hero caps at 4 stacks instead of 3. |
| `class_ranger` → `class_herald` | Marching Fire | Volley's AoE-attenuated ATK uses 8/10 instead of 7/10. |
| `class_rogue` → `class_arcanist` | Hexblade | Backstab also applies 1 `status_burn` stack (duration 2) to its target if the hit lands (not on dodge). |
| `class_herald` → `class_cleric` | Choir | War Hymn's `status_haste` also grants +5% dodge chance to every affected ally for the status's duration. |

## 3. Formation, party and rows

A party has up to **5 formation slots**, indices 0-4. Slot **0-2 are the front row**; slot **3-4 are the
back row** (fixed by index, like M1's 3-slot `PartyOrder` extended by 2). A party may field **1 to 5**
distinct owned heroes (M1 required exactly 3; M2 relaxes the minimum so a thin roster is never unplayable,
while 5 is the hard cap per M2.md). Unfilled slots are simply absent — no phantom actor, no effect on
row-pool computation.

**Row-protection rule** (governs every *offensive* action, hero or opposing side, targeting the
opposing side): if any opposing front-row (slot 0-2) member is alive, the valid target pool is "living
front-row members of that side" only; back row is unreachable. Once the front row is fully defeated, the
valid pool becomes "living back-row members." A skill explicitly flagged **ignores row protection**
(section 5 marks each; e.g. Arcanist's Meteor, Rogue's Backstab) instead selects from the *full* living
set on that side regardless of row. Row-protection never applies to ally-targeting actions (heals/buffs
always see the whole living party, matching `combat.md` 3.1's existing ally-targeting rule).

Reordering a party's formation (assigning which owned hero occupies which of the 5 slots) is allowed at
any time outside the loadout-lock timing in section 9 — this is a natural extension of M1's
`PATCH /party/order`, now covering 5 slots instead of 3; the exact endpoint/DTO shape is M2-25's
contract decision, not fixed here.

## 4. Skill loadout

Each hero has exactly **2 active skill slots and 2 passive skill slots**. Each slot holds any unlocked
skill of the matching kind (active slot → active skill only, passive slot → passive skill only) from
either the primary or the secondary class's kit (the pool is the **union** of both classes' unlocked
skills at the hero's current level; a hero may fill both active slots from the same class and ignore the
other class's actives entirely, or mix — no "one from each" requirement). A single-class hero (no
secondary yet, or secondary below level 3) simply has a pool equal to its own class's 2 actives + 2
passives, so for a single-class hero the loadout has no real choice (it is auto-filled with its whole
kit) — choice only emerges once a secondary class is assigned, which is deliberate: dual-classing is
where loadout decisions start to matter.

**Basic Attack is always available, free, and never occupies a slot** — every class's Basic Attack
(section 5) is the automatic fallback.

### 4.1 Action priority (fully automatic — no player scripting, per M1's existing invariant)

On an actor's turn: use **loadout slot 1's skill** if it is off cooldown (section 6) and has at least
one legal target under its own targeting rule (including row protection); else use **loadout slot 2's
skill** under the same test; else use **Basic Attack** (always legal, never on cooldown). This makes
the *order* in which a hero's two active skills are slotted a real tactical decision (whichever is
listed first gets priority whenever both happen to be ready).

### 4.2 Switching

Loadout and secondary-class assignment are free and unlimited outside an active expedition, exactly
like M1's specialization-switch rule (`contracts.md`'s `active_expedition` lock applies the same way):
a fresh change request while an expedition is running is rejected; a change takes effect for the next
battle simulated after it commits (boss/arena use live loadout at challenge time; expedition cycles use
the `frozenLoadout` captured at `/expedition/start`, unchanged timing semantics from M1).

## 5. Class kits

Every class has exactly 5 skills: 1 Basic Attack (free, always available), 2 Active (loadout-eligible),
2 Passive (loadout-eligible). Unlock levels: Basic Attack and each class's "I" active/passive unlock at
**level 1**; each class's "II" active unlocks at **level 5**; each class's "II" passive unlocks at
**level 8**. These thresholds apply identically whether the class is a hero's primary or secondary.

Shared notation: `ATK`/`DEF`/`SPD` mean the actor's current *effective* stat including active
buffs/debuffs (section 2.1 step 7) at the moment the formula is evaluated; `targetDEF` is the target's
own such DEF. `basic(ATK, targetDEF) = max(1, ATK - floor(targetDEF / 2))` is the shared base-damage
formula (unchanged from `combat.md` 3.2). Every damaging hit resolves through the crit/dodge pipeline in
`combat.md`'s M2-22 addition before applying to HP.

### 5.1 Vanguard (Tank)

| Skill | Kind | Unlock | CD | Targeting | Effect |
| --- | --- | --- | --- | --- | --- |
| Strike | Basic | 1 | — | Default enemy targeting (row-respecting, lowest HP) | `basic(ATK, targetDEF)` damage. |
| Bulwark Call | Active | 1 | 3 | Self | No damage. Applies `status_taunt` (self) for 2 rounds (3 with Banner Bearer) and `status_fortify` (self, +30% DEF) for 2 rounds. |
| Shield Bash | Active | 5 | 2 | Default enemy targeting (row-respecting, lowest HP) | `max(1, floor(ATK*12/10) - floor(targetDEF/2))` damage; applies `status_weaken` (-30% ATK, 2 rounds) to the target. |
| Thick Hide | Passive | 1 | — | Self, battle-start-fixed | Effective DEF +15% (step 2.1.5 percentage layer). |
| Last Stand | Passive | 8 | — | Self, dynamically rechecked | Whenever this Vanguard would take damage while its current `hpPercent < 30`, that damage is reduced 20% (`floor(damage*80/100)`) before applying. Rechecked at every hit, not a one-time snapshot. |

### 5.2 Cleric (Healer)

| Skill | Kind | Unlock | CD | Targeting | Effect |
| --- | --- | --- | --- | --- | --- |
| Smite | Basic | 1 | — | Default enemy targeting (row-respecting, lowest HP) | `basic(ATK, targetDEF)` damage. |
| Mending Light | Active | 1 | 2 | Lowest-HP%-living ally (ties by lowest slot index; self-eligible) | Heal `floor(ATK*4/5)`, clamped to max HP. (+Battle Medic synergy: also `status_fortify` +30% DEF, 1 round, on the target.) |
| Sanctuary | Active | 5 | 4 | All living allies (AoE, ignores row — ally-targeting is never row-gated) | No direct heal. Applies `status_regen` (heal 10% max HP, floor, per round) for 3 rounds to every living ally. |
| Devotion | Passive | 1 | — | Self, dynamically rechecked | If Mending Light's target's `hpPercent < 50` at the moment of casting, that heal is `floor(heal*6/5)` instead. |
| Vital Surge | Passive | 8 | — | Self, one-time per battle | The first time this Cleric's HP would be clamped to 0, it is instead clamped to 1 and this passive is consumed for the rest of the battle (logged explicitly in the event, section 6 of `combat.md`'s addition). |

### 5.3 Ranger (Physical damage)

| Skill | Kind | Unlock | CD | Targeting | Effect |
| --- | --- | --- | --- | --- | --- |
| Quick Shot | Basic | 1 | — | Default enemy targeting (row-respecting, lowest HP) | `basic(ATK, targetDEF)` damage. |
| Aimed Shot | Active | 1 | 2 | Among row-respecting valid enemies at `hpPercent <= 30`, lowest HP (tie by slot index); else falls back to default targeting | `basic(ATK, targetDEF)`, then `floor(damage*3/2)` **only** if an execute-threshold target was found (fallback shot gets no bonus). |
| Volley | Active | 5 | 3 | Up to 2 lowest-HP row-respecting valid enemies (1 if only 1 exists) | Per target: `attenuatedATK = floor(ATK*7/10)` (8/10 with Marching Fire synergy); `max(1, attenuatedATK - floor(targetDEF/2))` damage, independent crit/dodge roll per target. |
| Hunter's Focus | Passive | 1 | — | Self, battle-start-fixed | +15% crit chance (flat add to the base rate in `combat.md`'s addition). |
| Momentum | Passive | 8 | — | Self, dynamically rechecked every round | +1 effective SPD per currently-dead opposing-side unit, capped at +5; recomputed at the start of every round's speed-order step (section 1 of `combat.md`'s addition), not battle-start-fixed. |

### 5.4 Rogue (Physical damage)

| Skill | Kind | Unlock | CD | Targeting | Effect |
| --- | --- | --- | --- | --- | --- |
| Puncture | Basic | 1 | — | Default enemy targeting (row-respecting, lowest HP) | `basic(ATK, targetDEF)` damage. |
| Backstab | Active | 1 | 2 | The opposing side's highest-slot-index living member if one exists (**ignores row protection**); else falls back to default targeting | `basic(ATK, targetDEF)` damage, **guaranteed critical** (no dodge/crit roll — always applies the crit multiplier from `combat.md`'s addition). (+Hexblade synergy: also applies 1 `status_burn` stack, duration 2, if the hit lands.) |
| Flurry | Active | 5 | 3 | Default enemy targeting (row-respecting, lowest HP), resolved once | Two sequential `basic(ATK, targetDEF)` hits on the same target, each with its own independent crit/dodge roll. |
| Opportunist | Passive | 1 | — | Self, dynamically rechecked | +20% damage (`floor(damage*6/5)`) on any of this Rogue's own hits (Basic Attack, Backstab, Flurry) against a target whose `hpPercent < 50` at the moment of the hit. |
| Evasion | Passive | 8 | — | Self, battle-start-fixed | +15% dodge chance (flat add) when this Rogue is the target of an offensive action. |

### 5.5 Arcanist (Magic damage)

| Skill | Kind | Unlock | CD | Targeting | Effect |
| --- | --- | --- | --- | --- | --- |
| Arcane Bolt | Basic | 1 | — | Default enemy targeting (row-respecting, lowest HP) | `basic(ATK, targetDEF)` damage. |
| Firebolt | Active | 1 | 0 | Default enemy targeting (row-respecting, lowest HP) | `basic(ATK, targetDEF)` damage; applies/refreshes `status_burn` per section 6's stacking rule. |
| Meteor | Active | 5 | 4 | All living opposing-side units (AoE, **ignores row protection**) | Per target: `attenuatedATK = floor(ATK*8/10)`; `max(1, attenuatedATK - floor(targetDEF/2))` damage, independent crit/dodge roll per target; applies 1 `status_burn` stack (duration 2) to each target not already at its stack cap. |
| Overload | Passive | 1 | — | Self, dynamically rechecked | Firebolt's direct-hit damage (not Burn ticks) is `floor(damage*11/10)` instead. |
| Arcane Reserve | Passive | 8 | — | Self, dynamically rechecked | +10% effective ATK (percentage layer, applied at formula-evaluation time, not battle-start-fixed) while at least one opposing-side unit currently holds an active `status_burn`. |

### 5.6 Herald (Support)

| Skill | Kind | Unlock | CD | Targeting | Effect |
| --- | --- | --- | --- | --- | --- |
| Rally Strike | Basic | 1 | — | Default enemy targeting (row-respecting, lowest HP) | `basic(ATK, targetDEF)` damage. |
| War Hymn | Active | 1 | 3 | All living allies (AoE, never row-gated) | No damage. Applies `status_haste` (+3 SPD flat) for 3 rounds to every living ally. (+Choir synergy: also +5% dodge chance to each affected ally for the same duration.) |
| Discordant Verse | Active | 5 | 3 | Default enemy targeting (row-respecting, lowest HP) | No damage. Applies `status_weaken` (-30% ATK, 2 rounds) to the target. |
| Encore | Passive | 1 | — | Self, applied at skill-resolution time | Whenever one of this Herald's own equipped active skills is used and its cooldown would be set, reduce that cooldown by 1 (minimum 0) immediately. |
| Battle Hymn | Passive | 8 | — | Self, dynamically rechecked | While this Herald itself currently holds an active `status_haste`, its own damaging actions (Basic Attack) deal +10% damage. |

### 5.7 Skill pool access recap

A hero's loadout pool at any moment = (primary class's skills unlocked at the hero's current level) ∪
(secondary class's skills unlocked at the hero's current level, or ∅ if no secondary assigned). The 2
active + 2 passive slots are filled from that pool; unfilled slots (e.g. a level-1 hero only has 1
unlocked active and 1 unlocked passive available per class) are simply empty until a skill unlocks to
fill them — an empty active slot is treated as "not ready" for priority purposes (section 4.1 falls
through to the next slot or Basic Attack).

## 6. Status effects reference

Generalizes `combat.md`'s M1 Burn-only model. Every status has a stable `statusId`, a kind, a numeric
effect, a duration in rounds, and a stacking rule. Durations decrement once per round (round-structure
step 4 in `combat.md`'s M2-22 addition) and the status is removed at 0 remaining, exactly like M1's Burn.

| statusId | Kind | Effect | Duration (rounds) | Stacking |
| --- | --- | --- | --- | --- |
| `status_burn` | DoT | `stacks * floor(tickATK/3)` damage per round (tick step) | 2, refreshed on reapply below cap | Up to 3 stacks (4 with Shadowflame synergy); reapplying below cap adds a stack and resets duration to 2; reapplying at cap still deals the triggering hit's direct damage but does not add a stack or reset duration (unchanged rule from M1's Burn, same cap-reapply behavior). `tickATK` is the applying caster's effective ATK at the moment of that application, stored and never re-read later (M1's existing rule). |
| `status_weaken` | Debuff | -30% ATK (percentage layer, step 2.1.7) | 2, refreshed on reapply | No stacking; reapplying while active only refreshes duration to 2, magnitude never compounds. |
| `status_fortify` | Buff | +30% DEF (percentage layer) | 2 (or 1 for Battle Medic's heal side-effect instance) | No stacking; refresh on reapply. |
| `status_haste` | Buff | +3 SPD flat | 3, refreshed on reapply | No stacking; refresh on reapply. Takes effect starting the *next* round's speed-order sort (section 1 of `combat.md`'s addition recomputes dynamic SPD fresh every round before sorting) — never retroactively reorders the round it was granted in. |
| `status_regen` | HoT | Heal `floor(maxHP*10/100)` per round (tick step, processed after all Burn ticks in the same step) | 3, refreshed on reapply | No stacking; refresh on reapply. |
| `status_taunt` | Control | Forces the opposing side's *single-target* offensive actions (basic attacks and single-target active skills) to target the taunter, overriding row protection, HP%, and position targeting entirely. Never affects AoE target selection (Meteor/Volley/Sanctuary/War Hymn are unaffected by an active taunt). | 2 (3 with Banner Bearer synergy) | Not stackable. Each side tracks at most one active taunt pointer; applying a new taunt from that side overwrites the previous one (most-recent-wins), rather than queuing or stacking. |

## 7. Crit, dodge and RNG — see `combat.md`

The dice-roll pipeline (base rates, per-class passive modifiers already listed inline in section 5
above, caps, and the exact deterministic PRNG consumption order) is specified once, in `combat.md`'s
M2-22 addition, since it is a combat-engine-wide mechanic shared by every class and every enemy, not a
per-class rule.

## 8. Roster and recruitment

- **Roster cap:** an account may own at most **20** heroes (strictly larger than the 5-hero party cap,
  satisfying M2.md's acceptance check 1).
- **Recruitment:** a gold-priced action, no RNG/gacha — the player picks any of the 6 base classes
  (section 1) for the new hero's **primary** class; the hero starts at level 1, `secondaryClassId = null`,
  unequipped, with its loadout auto-filled per section 5.7 (no choice yet, since there is no secondary).
  Reference cost: `recruitCost = 150 * ownedHeroCount` gold, where `ownedHeroCount` is the count
  *before* this recruit (so a fresh M1-migrated account with 3 starters pays 450 gold for its 4th hero,
  600 for its 5th, ... up to the 20-hero cap). **This cost constant is a placeholder default, explicitly
  left open for Economy Designer retuning in M2-28**; the mechanic itself (gold-priced, player-chosen
  primary class, no RNG, 20-hero cap) is the frozen part of this spec.
- **Secondary-class assignment** on any owned hero (starter, migrated, or recruited) is **free**, gated
  only by the level-3 threshold and the same expedition-lock timing as loadout changes (section 4.2) —
  no gold cost, reusing M1's free-specialization-switch precedent deliberately so this is not a second
  monetization surface.
- Recruiting a new hero and assigning/removing a party formation slot are independent actions: a
  recruited hero joins the roster, not automatically the active party; placing it into one of the 5
  formation slots (section 3) is a separate, free action.

## 9. Migration plan from M1 saves

M1's `Hero = { heroId, accountId, classId, level, xp, specializationId | null, equipment }` and
`PartyOrder = { accountId, order: [HeroId, HeroId, HeroId] }` migrate as follows. This is a plan for
M2-25 (contracts) and M2-26 (engine/content) to formalize into exact schema/migration code; it is not
itself a contract change (this document does not touch `contracts.md`).

1. **`classId` → `primaryClassId`**: direct copy, no remapping needed — `class_vanguard`/`class_ranger`/
   `class_arcanist` are unchanged IDs with unchanged base stat curves (section 1).
2. **`secondaryClassId`**: every migrated hero starts at `null`. No automatic secondary assignment —
   the player chooses later, exactly like a freshly recruited hero (section 8). A hero with no
   secondary is not broken or invalid; it simply plays as primary-only (section 2, section 5.7) until a
   secondary is chosen.
3. **`specializationId` is dropped** (the field no longer exists; M1's 2-choice spec system is retired).
   No behavioral default needs to be derived from its old value, because the new system does not fork
   behavior by "which of 2 specs was picked" — a migrated hero's skill loadout (section 4) auto-fills
   with its primary class's full unlocked kit per section 5.7 (at level ≥8 that is both actives + both
   passives; below that, whatever has unlocked so far), which is a strict superset of what either old
   specialization offered. No player action is required for a migrated hero to be immediately playable
   under the new rules.
4. **`equipment`**: unchanged, copied as-is (gear mechanics untouched by this task).
5. **`PartyOrder.order[0..2]` → formation slots 0-2** (front row): the three M1 party members land in
   the front row in their existing order; back row (slots 3-4) starts empty. This is the intuitive
   default (an existing 3-hero party was never "back row" under M1's single-row model) and requires the
   player to make no immediate decision to keep playing.
6. **Roster**: the account's existing owned heroes (3 starters in the common case, well under the new
   20-hero cap) become the initial roster; no new heroes are granted or lost by migration.
7. **`BattleReport.events`**: the M2-22 event schema (`combat.md`'s addition) is a strict superset of
   M1's `{round, type, sourceId, targetId, amount, hpAfter}` — every M1 field is kept with the same
   meaning, and the new fields (`skillId`, `crit`, `dodged`, `statusApplied`, `statusExpired`, `death`)
   are additive. Old stored `BattleReport` rows remain valid and renderable without a data migration,
   consistent with the additive-field convention `contracts.md` already uses throughout (M1-08's
   `wins`/`losses`, M2-01's `selectedAreaId`, etc.) and with the "legacy text-log fallback" the M2-21
   battle-replay UI already implements for reports lacking newer metadata.
8. **Gold/inventory/`BossClaim`/`TeamSnapshot`**: untouched by this task; no migration needed.

## 10. Worked examples

1. **Dual-class stat layering.** A level-5 Vanguard primary / Cleric secondary, unequipped:
   `primaryLeveled` (Vanguard L5) = HP60/ATK11/DEF10/SPD8. `secondaryLeveled` (Cleric L5) =
   HP50/ATK11/DEF9/SPD9. `dualClassBase = primaryLeveled + floor(secondaryLeveled/4)` =
   HP `60+floor(50/4)=60+12=72`, ATK `11+floor(11/4)=11+2=13`, DEF `10+floor(9/4)=10+2=12`,
   SPD `8+floor(9/4)=8+2=10`. Thick Hide (Vanguard Passive I, if slotted) then adds +15% DEF on top:
   `floor(12*115/100)=13`.
2. **Loadout priority.** A Ranger has Volley (CD3) in slot 1 and Aimed Shot (CD2) in slot 2. Round 1:
   both off cooldown (fresh battle) → Volley fires (slot 1 wins), CD set to 3. Round 2: Volley on CD
   (2 remaining after this round's decrement), Aimed Shot off CD → Aimed Shot fires. Round 3: Volley at
   1 remaining, Aimed Shot back on CD(2 after use)... the engine always re-checks both slots fresh each
   turn per section 4.1; whichever is ready wins by slot order, falling to Quick Shot only if both are
   on cooldown.
3. **Row protection vs. a row-ignoring boss.** A 5-hero party: Cleric and Arcanist in back row (slots
   3-4), Vanguard/Ranger/Rogue in front row (slots 0-2). Against ordinary Old Road enemies (which
   respect row protection, `content.md`'s addition), the back-row Cleric/Arcanist are never selected by
   any enemy's default single-target targeting while any front-row member lives. Against the Tollkeeper
   (which ignores row protection unless taunted, `content.md`'s addition), the same back-row heroes are
   directly targetable by Toll Strike/Toll Smash — unless the party's Vanguard has an active
   `status_taunt`, which forces every Tollkeeper single-target hit onto the Vanguard regardless of row,
   restoring the back row's safety for that fight specifically.
4. **Status refresh vs. stacking.** An Arcanist Firebolts a target with 0 Burn: 1 stack, duration 2,
   `tickATK` stored. Next time this Arcanist's Firebolt lands on the same (still-Burning) target before
   the stack expires: 2 stacks, duration reset to 2, `tickATK` updated to this cast's current ATK (both
   stacks now tick at the new value — matches M1 Burn's existing "resets duration, both stacks share the
   latest applying cast's ATK" rule). A third Firebolt while still at 2 stacks (cap): direct damage still
   lands, but the stack count stays at 2 and duration is **not** reset — it keeps counting down from
   whatever the second cast set it to.
5. **Taunt overwrite.** Two heroes (e.g. a Vanguard and, in arena, an opposing Vanguard with a
   Banner-Bearer dual class) could in principle both try to hold "the" taunt on their own side — this
   cannot collide, since each *side* tracks one taunt pointer and a side only ever has one taunter
   acting at a time in speed order; if a side's existing taunter re-casts Bulwark Call (its own cooldown
   permitting), the new cast simply overwrites its own prior taunt entry with a fresh 2(or 3)-round
   duration — no cross-hero conflict is possible within one side's single pointer.

## 11. Assumptions and decisions (recorded per `AGENTS.md` rule 4)

- Level cap stays 1-10 (M1 baseline); raising it is Economy Designer scope (M2-28), not reopened here.
- Party minimum relaxed from M1's "exactly 3" to "1-5 distinct owned heroes," since a hard 5-hero
  minimum would make early recruitment economy nonsensical and nothing in M2.md requires exactly 5.
- Threat is modeled as a binary per-side Taunt pointer, not a running numeric threat score, to keep
  targeting fully deterministic and bounded while still satisfying M2.md's acceptance check 8
  ("a taunt/high-threat unit draws enemy single-target attacks").
- Recruitment is gold-priced and class-chosen (no RNG identity roll), preserving the no-pay-to-win,
  player-agency-first posture `vision.md`/`first-playable.md` already established for M1; RNG is scoped
  to combat crit/dodge only (`combat.md`'s addition), never to economy/recruitment outcomes.
- Full new-area/dungeon *content* design (beyond the Old Road/Tollkeeper rework in `content.md`'s
  addition, used here only as the reference implementation of combat v2) is out of this task's bounded
  scope — flagged as an open item in `reports/M2-22.md` for the Producer to assign, not resolved here
  and not a new task created by this document.
