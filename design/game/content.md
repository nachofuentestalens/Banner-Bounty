# Content tables (M1-02 freeze)

Stable content IDs, stats, slot restrictions, enemy compositions and boss behavior for `packages/content`. IDs here are permanent once referenced by `ItemInstance.definitionId`/`affixId` or a `BattleReport`; renaming requires a recorded decision. All stat bonuses are flat integers consumed by `combat.md` 1.2. No drop rates, prices, or gold values are specified here — those are the economy table's responsibility (M1-04); this document only defines *what* exists, not how often or for how much.

## 1. Classes and specializations (IDs)

| classId | Display | specializationId A | specializationId B |
| --- | --- | --- | --- |
| `class_vanguard` | Vanguard | `spec_guardian` | `spec_berserker` |
| `class_ranger` | Ranger | `spec_marksman` | `spec_pathfinder` |
| `class_arcanist` | Arcanist | `spec_pyromancer` | `spec_warden` |

Starter heroes (one per class, owned from account creation, no recruitment currency — `first-playable.md`): `hero_starter_vanguard`, `hero_starter_ranger`, `hero_starter_arcanist`, each `classId` as above, `level=1`, `specializationId=null`, all slots empty.

## 2. Items

Three slots (`weapon`, `armor`, `trinket`); an item's `slot` on its definition is fixed and an `ItemInstance` can only be equipped into that slot (`contracts.md` `/equipment/equip` validation: "item's definition slot must match `slot`"). Nine base definitions (3 per slot), all common (no inherent affix); an `ItemInstance` additionally carries an optional `affixId` which layers a flat bonus on top of the base definition's bonus. "Uncommon" in `first-playable.md` means an instance with a non-null `affixId`; "common" means `affixId = null`. Rarity is therefore a property of the instance (whether it rolled an affix), not of the definition.

### 2.1 Base item definitions

| definitionId | Slot | Display | HP bonus | ATK bonus | DEF bonus |
| --- | --- | --- | --- | --- | --- |
| `item_weapon_shortsword` | weapon | Shortsword | 0 | 3 | 0 |
| `item_weapon_longspear` | weapon | Longspear | 0 | 2 | 1 |
| `item_weapon_focus` | weapon | Arcane Focus | 0 | 4 | 0 |
| `item_armor_leather` | armor | Leather Vest | 4 | 0 | 1 |
| `item_armor_plate` | armor | Plate Harness | 2 | 0 | 3 |
| `item_armor_robe` | armor | Traveler's Robe | 6 | 0 | 0 |
| `item_trinket_whetstone` | trinket | Whetstone Charm | 0 | 2 | 0 |
| `item_trinket_ironband` | trinket | Iron Band | 0 | 0 | 2 |
| `item_trinket_luckycoin` | trinket | Lucky Coin | 3 | 0 | 0 |

No class restriction beyond slot in M1 — any hero can equip any item of the matching slot (`first-playable.md` lists only "three equipment slots per hero" and "explicit slot restrictions," which this table satisfies via `slot` alone; a class-gating system is out of M1-02 scope).

### 2.2 Affixes

| affixId | Display | Bonus |
| --- | --- | --- |
| `affix_of_power` | of Power | ATK +2 |
| `affix_of_warding` | of Warding | DEF +2 |
| `affix_of_vigor` | of Vigor | HP +3 |

An `ItemInstance`'s total contribution to a hero's effective stats (`combat.md` 1.2.2) is `base definition's bonus for that stat + (affix's bonus for that stat, if the instance has one and the affix targets that stat, else 0)`. An affix only ever adds to one stat; it never subtracts or modifies a different stat.

### 2.3 Stat comparison (for UI sort/compare, `interface.md` note on clear choices)

Define `powerScore(instance) = HP_total + ATK_total + DEF_total` (unweighted sum of the instance's own bonuses, base + affix). Default inventory/equipment-swap sort order: `powerScore` descending; ties broken by rarity (an instance with a non-null `affixId` ranks above a common instance of equal `powerScore`); remaining ties broken by `itemInstanceId` ascending (stable, since instance IDs are assigned in creation order and never reused). This is a display/sort convenience only — it does not feed into `combat.md`'s formulas, which always use the per-stat totals directly.

## 3. Old Road enemies

Exactly 3 normal enemy definitions. Every Old Road expedition cycle uses the identical fixed composition below (deterministic — `first-playable.md` requires deterministic selection per cycle; M1 satisfies this trivially by never varying the composition, rather than rolling among alternatives). A difficulty-tier or randomized-composition system is explicitly out of scope for M1-02.

| enemyId | Display | Slot | HP | ATK | DEF | SPD |
| --- | --- | --- | --- | --- | --- | --- |
| `enemy_road_brigand` | Road Brigand | 0 | 50 | 9 | 4 | 7 |
| `enemy_road_wolf` | Road Wolf | 1 | 35 | 11 | 2 | 11 |
| `enemy_road_cutpurse` | Road Cutpurse | 2 | 30 | 8 | 2 | 10 |

All three act using the generic enemy default action: target per `combat.md` 3.1 (lowest living party position), damage `max(1, ATK - floor(targetDEF/2))`. No enemy has a specialization-equivalent override; behavioral variety among normal enemies in M1 comes only from their stat spread (brigand = bulky, wolf = fast glass cannon, cutpurse = fast and fragile), not from distinct abilities.

## 4. Boss: the Tollkeeper

| bossId | Display | Slot | HP | ATK | DEF | SPD |
| --- | --- | --- | --- | --- | --- | --- |
| `boss_tollkeeper` | The Tollkeeper | 0 | 220 | 14 | 8 | 9 |

Solo encounter (one actor, slot 0) vs. the challenger's full 3-hero party. Manual challenge outside an expedition (`first-playable.md`), no entry cost, deterministic server seed `seed(accountId, bossId, requestId)` per `contracts.md` (unused by any combat formula per `combat.md` section 7 — reserved for future content, not consumed by M1's deterministic rules).

**Boss behavior** (automatic, evaluated every round the Tollkeeper acts, in its speed-order turn like any other actor):

- If the current round number is a multiple of 3 (round 3, 6, 9, ...): **Toll Smash** — target the living hero with the lowest HP% (`combat.md` 3.1's ally-targeting percentage rule, applied here to the opposing party), damage `floor(max(1, ATK - floor(targetDEF/2)) * 3 / 2)` (+50% over a normal hit).
- Otherwise: **Toll Strike** — target the living hero in the lowest party position (standard enemy targeting, `combat.md` 3.1), damage `max(1, ATK - floor(targetDEF/2))`.

This gives the Tollkeeper a deterministic, telegraphable pattern (every 3rd round it punishes whoever is weakest instead of just hitting the front line) without any RNG or player-visible "choice," consistent with "no player scripting" and the fully deterministic combat model.

First victory grants the one-time reward (amount: economy table, M1-04) via the atomic `BossClaim` flag already specified in `contracts.md`; later victories produce a `BattleReport` only, no reward (`rewardGranted: false`).

---

## 5. M2-22 additions: dual-class system, new classes, and combat v2 content

Sections 1-4 above are the unchanged M1-02 freeze. This section amends them for M2's combat v2
(`combat.md` section 8, `classes.md`). The owner's M1 playtest verdict ("extremely boring") and
`design/studio/milestones/M2.md` are the reason for this amendment.

### 5.1 Classes and specializations table (section 1) — superseded

Section 1's `classId`/`specializationId` table is **superseded**: `specializationId` no longer exists
as a concept (`classes.md` section 9, migration point 3). The current class roster, stats, and skill
kits are the authoritative source in `classes.md` sections 1 and 5. The three `classId`s
(`class_vanguard`/`class_ranger`/`class_arcanist`) and the three starter heroes
(`hero_starter_vanguard`/`hero_starter_ranger`/`hero_starter_arcanist`) are unchanged IDs. Three new
`classId`s are added: `class_cleric`, `class_rogue`, `class_herald` (no starter hero of these — they
are only available via recruitment, `classes.md` section 8).

### 5.2 Reworked Old Road enemies (demonstrate combat v2 depth on existing content)

All three keep their section 3 stats (HP/ATK/DEF/SPD) unchanged. Behavior is extended:

| enemyId | New behavior |
| --- | --- |
| `enemy_road_brigand` | Every round where `round % 4 == 0`: **Crushing Blow** — targets the lowest-position living hero in the row-respecting valid pool (`combat.md` 8.2); damage `floor(basic(ATK,targetDEF)*3/2)`; applies `status_weaken` (-30% ATK, 2 rounds) to the target. All other rounds: unchanged basic attack (lowest party position, row-respecting pool). |
| `enemy_road_wolf` | On odd rounds: targets the lowest-*current-HP* living hero in the row-respecting valid pool instead of lowest position (demonstrates HP-seeking AI variety). Even rounds: unchanged (lowest position). Damage formula unchanged (`basic(ATK,targetDEF)`), no status applied. |
| `enemy_road_cutpurse` | Unchanged from section 3 — kept as the plain baseline enemy for contrast. |

None of the three ignore row protection — a back-row hero is safe from all Old Road trash while any
front-row hero lives, giving formation a concrete payoff against this content (M2.md acceptance check
7).

### 5.3 Reworked Tollkeeper boss

Stats (section 4) unchanged: HP220/ATK14/DEF8/SPD9, solo slot 0. Behavior amendment:

- **Row protection**: the Tollkeeper **ignores row protection** for both Toll Strike and Toll Smash — it
  always considers the full living party, not just the front row.
- **Taunt**: if the challenging party has an active `status_taunt` (`combat.md` 8.2), the Tollkeeper's
  single-target action targets the taunter instead, exactly like any other opposing-side enemy — this
  is the intended counterplay to the boss's row-ignoring behavior (a Vanguard's Bulwark Call protects
  the back row specifically against this fight).
- **Toll Smash** (round is a multiple of 3, unchanged trigger): target = lowest HP% among the full
  living party (or the taunter, if taunted) per the amended targeting rule; damage
  `floor(basic(ATK,targetDEF)*3/2)` (unchanged); **new**: also applies `status_weaken` (-30% ATK, 2
  rounds) to its target.
- **Toll Strike** (all other rounds, unchanged trigger): target = lowest party position among the full
  living party (or the taunter, if taunted); damage `basic(ATK,targetDEF)` (unchanged formula).

First-clear reward and `BossClaim` semantics (section 4, `contracts.md`) are unchanged by this
amendment — only the Tollkeeper's targeting/damage behavior changes.

### 5.4 Roster cap and recruit cost (authoritative numbers; mechanic described in `classes.md` 8)

- Roster cap: **20** owned heroes per account.
- Recruit cost: `150 * ownedHeroCount` gold (placeholder default, open for Economy Designer retuning in
  M2-28 — see `classes.md` section 11).

### 5.5 Scope note: additional areas/dungeons

This section's enemy rework (5.2-5.3) is the reference implementation of combat v2 against the
*existing* Old Road content only. Designing additional expedition areas' and dungeons' enemy rosters
beyond Old Road (M2.md scope item 6) is **not** undertaken here — it is out of this task's bounded
scope (`AGENTS.md`: "keep scope fixed... bounded content") and is flagged as an open item in
`reports/M2-22.md` for the Producer to assign an owner, not resolved or delegated by this document.
Section 6 below (M2-31) is that owner.

---

## 6. M2-31 additions: second expedition area and a multi-floor dungeon with a boss

Fulfils `design/studio/milestones/M2.md` scope item 6 and acceptance check 11. Builds on
`contracts.md`'s M2-01 `Area { areaId, name, unlockRequirement: { kind, value? } }` amendment and on
`economy/gear.md`'s `reward_area_2`/`reward_dungeon_1` profiles (which already fix XP/gold/material/
item numbers for this content — this section only binds those profiles to concrete encounters, per
`gear.md`'s own statement that "M2-31 owns encounter IDs, unlocks, floor counts, enemy rosters and
bosses"). Section 5 (Old Road/Tollkeeper) is unchanged by this section; nothing below renames or
retunes it. All enemy/boss behavior below is built only from the existing combat v2 engine rules
(`combat.md` section 8) and the existing status vocabulary (`classes.md` section 6, `status_burn` /
`status_weaken` / `status_fortify` / `status_haste` / `status_regen` / `status_taunt`) — this section
adds no new status, skill, class, or gear rule.

### 6.1 Areas (binds `contracts.md`'s `Area` entity)

| areaId | Display | unlockRequirement | Reward profile (`gear.md` 3) |
| --- | --- | --- | --- |
| `area_old_road` | The Old Road | none (starter area; migration default for `Account.selectedAreaId`, per `reports/M2-01.md`'s open question 1) | `reward_area_1` |
| `area_sunken_aqueduct` | The Sunken Aqueduct | `{ kind: "bossClear", value: "boss_tollkeeper" }` — unlocked the instant the account's `BossClaim` for `boss_tollkeeper` exists (first clear or later; the claim record itself is the gate, not specifically the reward grant) | `reward_area_2` |

This resolves `reports/M2-01.md`'s open questions for M2-02 (superseded by this task): `area_old_road`
is the starter `areaId`; `unlockRequirement.kind = "bossClear"` is the one new kind this document
defines, evaluated as "does `BossClaim(accountId, value)` exist" — a boolean, already-tracked fact, no
new server state. `reward_area_3` (`gear.md` 3) stays unused — per `gear.md`, "an unused profile does
not require another area" — and is available for a future area beyond M2's bounded scope.

Gating area 2 behind the Tollkeeper clear (rather than a raw hero-level threshold) reuses an existing
deterministic account fact, keeps the gate diegetic (clear the road's toll boss, the road beyond opens),
and lines up with `economy/baseline.md`'s simulation finding that Tollkeeper readiness is pinned to
hero level 3 — so area 2 content below is tuned for parties a little past that point (level ~4-6,
partially geared from Old Road/Tollkeeper drops), not from level 1.

### 6.2 Sunken Aqueduct enemies (normal encounter, `reward_area_2`)

Exactly 3 normal enemy definitions, fixed composition (same deterministic-selection convention as
section 3 — no randomized composition). Slot indices use the 0-4 range from `combat.md` 8.1; this
composition only uses slots 0-2.

| enemyId | Display | Slot | HP | ATK | DEF | SPD |
| --- | --- | --- | --- | --- | --- | --- |
| `enemy_aqueduct_drowned` | Drowned Warden-Thrall | 0 | 65 | 12 | 6 | 9 |
| `enemy_aqueduct_current` | Riptide Current | 1 | 48 | 13 | 4 | 13 |
| `enemy_aqueduct_husk` | Aqueduct Husk | 2 | 40 | 9 | 4 | 10 |

**Behavior** (content-defined, per `combat.md` 8.1 step 2 — "or the content-defined behavior for
enemies"):

- `enemy_aqueduct_drowned`: default action targets per the row-respecting pool (`combat.md` 8.2),
  lowest current HP, damage `basic(ATK, targetDEF)`. On every round where `round % 3 == 0`: instead
  applies `status_weaken` (-30% ATK, 2 rounds, `classes.md` 6) to the lowest-HP%-living hero in the
  row-respecting pool (tie by slot index), **no direct damage that round** — a telegraphed debuff
  round, same cadence convention as the Old Road brigand's Crushing Blow (5.2) but applied as a pure
  debuff rather than a damage spike, so its pressure is about eroding sustained damage output over a
  longer fight, not a single burst.
- `enemy_aqueduct_current`: **ignores row protection** for its single-target action every round (the
  only normal-tier enemy to do so — Old Road has none; this is the area's one "learn the taunt
  counterplay before you need it for the dungeon boss" enemy). Target: lowest current HP among the
  *full* living opposing side (tie by slot index), or the taunter if the party has an active
  `status_taunt` (`combat.md` 8.2's taunt-overrides-everything rule applies automatically — no special
  case needed here). Damage: `basic(ATK, targetDEF)`, no status applied.
- `enemy_aqueduct_husk`: unchanged plain baseline (identical role to the Old Road cutpurse) — default
  action only, row-respecting pool, lowest current HP, `basic(ATK, targetDEF)` damage, no behavior
  override. Kept as the area's contrast enemy so a player can isolate what `drowned`/`current` add.

**Team-building payoff** (M2.md acceptance check 7): a party with no front-row tank/taunt lets
`enemy_aqueduct_current` snipe its squishiest back-row hero (a Cleric or Arcanist) every single round
from turn one, which a row-respecting-only encounter (Old Road) never does. A Vanguard with Bulwark
Call's `status_taunt` absorbs this entirely (the current's row-ignoring target selection is overridden
by the taunt rule); a party without one takes sustained unmitigated backline damage on top of the
drowned's periodic weaken, materially lengthening or losing the fight. This is measurable the same way
M2.md check 7 specifies: run the encounter with/without a taunter and compare turns-to-clear or HP
remaining.

### 6.3 Sunken Aqueduct Depths (multi-floor dungeon, `reward_dungeon_1` — introductory profile)

`dungeonId`: `dungeon_aqueduct_depths`. 4 ordered floors (floors 1-3 ordinary, floor 4 final boss);
`floorCount*180 = 720` seconds, well inside `gear.md`'s `28800`-second cap. Same content-level unlock
rule as `area_sunken_aqueduct` (6.1): `{ kind: "bossClear", value: "boss_tollkeeper" }` — entering the
dungeon requires the same Tollkeeper clear as the area it is thematically set beneath; the exact
`Dungeon` entity/endpoint shape that carries this rule is M2-25's contract decision, not fixed here
(mirrors how `contracts.md`'s `Area.unlockRequirement` left its own evaluation rule open for this
document to fill in). Every floor starts at full HP with fresh battle-local effects and uses the run's
frozen party/build/gear, per `gear.md` section 4; a loss/timeout ends the run with no reward for that
floor and restarts at floor 1 on the next attempt.

| Floor | Composition | Reward row (`gear.md` 4) |
| --- | --- | --- |
| 1 | `enemy_aqueduct_husk` (slot 0), `enemy_aqueduct_husk` (slot 1) | dungeon 1 ordinary |
| 2 | `enemy_aqueduct_drowned` (slot 0), `enemy_aqueduct_husk` (slot 1) | dungeon 1 ordinary |
| 3 | `enemy_depths_broodling` (slot 0), `enemy_depths_broodling` (slot 1) | dungeon 1 ordinary |
| 4 | `boss_drowned_warden` (slot 0, solo) | dungeon 1 final boss |

**Floor 3 enemy** (new, dungeon-only — not used in the area-2 expedition):

| enemyId | Display | Slot | HP | ATK | DEF | SPD |
| --- | --- | --- | --- | --- | --- | --- |
| `enemy_depths_broodling` | Depths Broodling | 0 or 1 (two copies) | 55 | 14 | 5 | 11 |

Behavior: default action is row-respecting lowest-current-HP targeting, `basic(ATK, targetDEF)`
damage. On every round where `round % 3 == 1` (rounds 1, 4, 7, ...): **Brood Surge** — same target
rule, damage `floor(basic(ATK, targetDEF) * 3 / 2)` (+50%). With two Broodlings sharing this cadence,
round 1 of the floor opens with a double burst against whichever single front-row hero is lowest-HP,
testing whether the party has either enough front-line DEF/HP (Vanguard's Thick Hide/Last Stand) or
enough burst healing (Cleric's Mending Light/Devotion) to absorb an opening spike — a glass-cannon
party that dumped every hero into pure ATK and skipped a healer is noticeably more likely to lose a
hero on floor 3's first round than a party that fielded a tank or healer, directly demonstrating
"good team building over raw stat totals" (`design/studio/milestones/M2.md` scope item 6).

### 6.4 Boss: The Drowned Warden (`boss_drowned_warden`, dungeon floor 4)

| bossId | Display | Slot | HP | ATK | DEF | SPD |
| --- | --- | --- | --- | --- | --- | --- |
| `boss_drowned_warden` | The Drowned Warden | 0 | 300 | 16 | 9 | 10 |

Solo encounter (one actor, slot 0) vs. the challenger's full living party (1-5 heroes, `classes.md`
section 3). Always **ignores row protection** for every action below, like the Tollkeeper (`content.md`
5.3); `combat.md` 8.2's taunt-overrides-everything rule applies automatically to its single-target
actions if the party has an active `status_taunt` (no special-case restatement needed — this is the
shared engine rule, reused here exactly as the Tollkeeper reuses it).

**Behavior** (evaluated every round in its speed-order turn, a 4-round telegraphed cycle — harder than
the Tollkeeper's 3-round cycle, consistent with this being later-game content):

- `round % 4 == 2`: **Crushing Current** (single-target) — target = lowest HP% among the full living
  party (or the taunter, if taunted), tie by slot index. Damage `floor(basic(ATK, targetDEF) * 3 / 2)`
  (+50%, same formula shape as the Tollkeeper's Toll Smash), and additionally applies `status_weaken`
  (-30% ATK, 2 rounds) to its target.
- `round % 4 == 0`: **Tidal Surge** (AoE, ignores row — AoE target selection is never affected by taunt
  per `combat.md` 8.2/`classes.md` 6's `status_taunt` definition) — all living heroes, each independently
  resolved per `combat.md` 8.3's per-target crit/dodge pipeline. Per target: `attenuatedATK =
  floor(ATK * 7 / 10)`, damage `max(1, attenuatedATK - floor(targetDEF/2))`, and applies `status_weaken`
  (-30% ATK, 2 rounds, refreshing if already active) to each target hit.
- All other rounds (`round % 4 == 1` or `round % 4 == 3`): **Warden's Grasp** (single-target, basic
  attack-equivalent) — target = lowest party position among the full living party (or the taunter),
  damage `basic(ATK, targetDEF)`.

This gives a deterministic, telegraphable pattern (Grasp, Smash, Grasp, Surge, repeat) with no RNG in
action selection, matching the Tollkeeper's design precedent and `first-playable.md`'s "no player
scripting" invariant. Reward: the dungeon's floor-4 "dungeon 1 final boss" row (`gear.md` 4) — 16 XP per
participant, 40 gold, 4 scrap, 2 sigil, 1 core, guaranteed item at conditional rarity weights
0/70/28/2 — re-earned on every successful full clear, per `gear.md`'s "every successful run can earn
these rows again" rule. This is **not** a `BossClaim`-gated one-time reward like the Tollkeeper; per
`gear.md` section 3, "dungeon final bosses instead use section 4 [reward row]: they must not also grant
standalone-boss rewards or consume the Tollkeeper claim" — so `boss_drowned_warden` never touches
`BossClaim` and has no separate first-clear bonus.

**Team-building payoff** (M2.md acceptance checks 7 and 11): because the boss ignores row protection
unconditionally, a party with no taunter exposes its lowest-HP%/lowest-position hero (frequently a
squishy backline Cleric or Arcanist) to both Crushing Current's execute-style target selection and
Warden's Grasp's position-based targeting every single non-Surge round; Tidal Surge then adds
unavoidable AoE chip damage and weaken stacking across the whole party regardless of formation. A
well-built team (Vanguard taunting via Bulwark Call to eat the single-target hits, Cleric sustaining
through Sanctuary/Mending Light against the periodic AoE) clears this comfortably within the 100-round
cap; a poorly-built team of equal average power (e.g. 5 pure-damage heroes, no tank, no healer) takes
unmitigated single-target execute damage onto whichever hero is weakest each cycle and accumulating
weaken stacks eroding its own damage output, making a loss or a timeout materially more likely — the
same directional contrast the Tollkeeper already demonstrates, raised one tier.

### 6.5 Assumptions and open items (recorded per `AGENTS.md` rule 4)

- `unlockRequirement.kind = "bossClear"` is a new kind this document defines to fill `contracts.md`'s
  deliberately-left-opaque `Area.unlockRequirement` shape; it requires no new contract field (evaluates
  against the existing `BossClaim(accountId, bossId)` fact) — flagged for M2-25 to confirm when it
  formalizes the areas/dungeons contract surface, not expected to need a shape change.
- A `Dungeon` entity/endpoint (list, select, start/advance-floor, abandon) does not yet exist in
  `contracts.md` — this document fixes the *content* (floors, enemies, boss, reward-profile binding)
  that such an entity must carry, per `gear.md`'s explicit division of labor ("M2-31 owns encounter
  IDs... this document supplies reusable reward profiles, not additional encounters"); the actual
  entity/DTO shape is M2-25's decision.
- `reward_area_3` and `reward_dungeon_2` (`gear.md` 3-4) are intentionally left unbound — one new area
  and one new dungeon satisfy M2.md scope item 6 and acceptance check 11's "at least" wording; a third
  area or second dungeon is additional content beyond this task's bounded scope, available for a future
  task without any further contract or economy change.
- Narrative copy for `area_sunken_aqueduct`, its three enemies, `dungeon_aqueduct_depths`, the floor-3
  broodling, and `boss_drowned_warden` does not exist yet in `narrative/copy.md` (M1-03 freeze lists
  only the Old Road/Tollkeeper keys) — M2-24 (already `in_progress` per `design/studio/milestones/M2.md`'s
  sequencing-gap note) must add these `enemyId`/`bossId`/area `.name`/`.desc` keys, since this document
  only fixes IDs and stats, not display copy, matching `content.md`'s existing division of labor with
  `narrative/copy.md`.
