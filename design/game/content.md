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
