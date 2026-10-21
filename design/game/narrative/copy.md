# Player-facing copy (M1-03 freeze)

All text below is original, written for Banner & Bounty. None of it is copied from Idle Adventure or any other reference game. Keys match `content.md` IDs exactly so implementers can bind UI strings without inventing new identifiers. "Short label" fits a narrow card/button (~24 chars); "short description" fits a compact stat-table row or tooltip (~110 chars); "body" is the longest allowed string (~220 chars) and is only used for onboarding/result copy, never for item/enemy rows.

No entry below introduces a mechanic, stat, or system beyond what `combat.md`/`content.md`/`first-playable.md` already define.

## 1. Classes and specializations

| key | Display (label) | Description (short) |
| --- | --- | --- |
| `class_vanguard.name` | Vanguard | Front-line fighter who soaks hits and keeps the party standing. |
| `class_vanguard.spec_guardian.name` | Guardian | Shields the weakest ally and shrugs off extra damage. |
| `class_vanguard.spec_guardian.desc` | — | Guards the lowest-HP% ally each round, taking half their incoming damage. |
| `class_vanguard.spec_berserker.name` | Berserker | Hits harder as the fight gets dangerous. |
| `class_vanguard.spec_berserker.desc` | — | Trades defense for attack, and strikes even harder under half HP. |
| `class_ranger.name` | Ranger | Fast striker who closes out weakened foes. |
| `class_ranger.spec_marksman.name` | Marksman | Finishes enemies who are nearly down. |
| `class_ranger.spec_marksman.desc` | — | Deals bonus damage to any enemy below 30% HP. |
| `class_ranger.spec_pathfinder.name` | Pathfinder | Keeps the whole company moving first. |
| `class_ranger.spec_pathfinder.desc` | — | Grants the entire party extra speed for the battle. |
| `class_arcanist.name` | Arcanist | Ranged attacker with the highest raw power. |
| `class_arcanist.spec_pyromancer.name` | Pyromancer | Sets foes alight for damage over time. |
| `class_arcanist.spec_pyromancer.desc` | — | Burns its target, dealing extra damage each round the burn lasts. |
| `class_arcanist.spec_warden.name` | Warden | Keeps the party healed instead of attacking. |
| `class_arcanist.spec_warden.desc` | — | Mends the lowest-HP% ally every turn instead of attacking. |

Starter hero copy (one card per `hero_starter_*` ID; no unique names in M1 — each is identified by class until the player names or levels it):

| key | label | desc |
| --- | --- | --- |
| `hero_starter_vanguard.name` | Vanguard Recruit | Your company's first shield. Unspecialized until level 3. |
| `hero_starter_ranger.name` | Ranger Recruit | Your company's first scout. Unspecialized until level 3. |
| `hero_starter_arcanist.name` | Arcanist Recruit | Your company's first spellhand. Unspecialized until level 3. |

## 2. Items

| definitionId | label | desc |
| --- | --- | --- |
| `item_weapon_shortsword.name` | Shortsword | A balanced blade. Raises attack. |
| `item_weapon_longspear.name` | Longspear | Reach and a little steel. Raises attack and defense. |
| `item_weapon_focus.name` | Arcane Focus | Channels force into the next strike. Raises attack most. |
| `item_armor_leather.name` | Leather Vest | Light protection that barely slows you down. Raises HP and defense. |
| `item_armor_plate.name` | Plate Harness | Heavy guard built to take the hits. Raises defense and HP. |
| `item_armor_robe.name` | Traveler's Robe | Thin cloth, generous padding underneath. Raises HP most. |
| `item_trinket_whetstone.name` | Whetstone Charm | Keeps an edge sharp. Raises attack. |
| `item_trinket_ironband.name` | Iron Band | A plain ring, oddly sturdy. Raises defense. |
| `item_trinket_luckycoin.name` | Lucky Coin | Worn smooth by nervous thumbs. Raises HP. |

Affix display is a suffix appended to the base item name (e.g., "Shortsword of Power"):

| affixId | label | desc |
| --- | --- | --- |
| `affix_of_power.name` | of Power | Adds attack. |
| `affix_of_warding.name` | of Warding | Adds defense. |
| `affix_of_vigor.name` | of Vigor | Adds HP. |

## 3. Old Road enemies and area

| key | label | desc |
| --- | --- | --- |
| `area_old_road.name` | The Old Road | A trade route gone quiet. Small trouble, steady pay. |
| `area_old_road.desc` | — | A short expedition: three foes guarding the road, run on a timer. |
| `enemy_road_brigand.name` | Road Brigand | Slow, heavy, and hard to put down. |
| `enemy_road_wolf.name` | Road Wolf | Fast and vicious, but thin-skinned. |
| `enemy_road_cutpurse.name` | Road Cutpurse | Quick hands, quick feet, no real armor. |

## 4. Boss

| key | label | desc |
| --- | --- | --- |
| `boss_tollkeeper.name` | The Tollkeeper | Guards the road's end. Punishes whoever falls behind. |
| `boss_tollkeeper.desc` | — | A single, heavily armored foe. Every third round it targets your weakest hero instead of the front line. |
| `boss_tollkeeper.reward_claimed.name` | Toll Paid | — |
| `boss_tollkeeper.reward_claimed.desc` | — | First victory reward collected. Future wins are recorded but pay nothing further. |

## 5. Onboarding and key interface states

Keys below are implementation-ready string IDs for `interface.md`'s screens; "body" length is used only where noted.

| key | type | text |
| --- | --- | --- |
| `onboarding.local_build.title` | label | Local Development Build |
| `onboarding.local_build.body` | body | This company lives on your own machine. Nothing here is public, and progress stays in this browser's local server until you choose to reset it. |
| `onboarding.first_expedition.title` | label | Send Out Your Company |
| `onboarding.first_expedition.body` | body | Pick a party order, then start the Old Road. Your heroes fight automatically on a timer — check back to see the result and collect rewards. |
| `expedition.offline_cap.title` | label | Time Away Capped |
| `expedition.offline_cap.body` | body | Progress while you were away is capped at a set amount. Anything beyond the cap waits for your next check-in — nothing is lost, just paused. |
| `expedition.loadout_locked.title` | label | Loadout Locked |
| `expedition.loadout_locked.body` | body | This hero is out on expedition. Gear and specialization are frozen until the expedition stops, so the fight stays consistent from start to finish. |
| `inventory.overflow.title` | label | Inventory Full |
| `inventory.overflow.body` | body | Your inventory is full. Equip, drop, or convert an item before claiming a new one — nothing claimed is lost while you decide. |
| `boss.reward.pending.title` | label | Toll Unpaid |
| `boss.reward.pending.desc` | — | Defeat the Tollkeeper once to claim its one-time reward. |
| `boss.reward.already_claimed.title` | label | Already Claimed |
| `boss.reward.already_claimed.desc` | — | You've already collected this boss's one-time reward. This fight will still record a result, just no further reward. |
| `arena.snapshot.title` | label | Published Team Snapshot |
| `arena.snapshot.body` | body | This is a saved copy of an opponent's company from when they published it, not a live player. Challenging it won't affect their current game. |
| `arena.no_opponent.title` | label | No Opponents Yet |
| `arena.no_opponent.desc` | — | No published teams are available to challenge right now. Publish your own company so others have someone to face. |
| `state.loading.label` | label | Loading… |
| `state.empty_inventory.label` | label | No items yet |
| `state.empty_inventory.desc` | — | Items you find or buy will show up here. |
| `state.offline.title` | label | Reconnecting |
| `state.offline.desc` | — | Lost touch with the server. Retrying — your last confirmed state is still safe. |
| `state.action_rejected.title` | label | Action Rejected |
| `state.action_rejected.desc` | — | The server didn't accept that action; your company state hasn't changed. |
| `state.server_error.title` | label | Something Went Wrong |
| `state.server_error.desc` | — | The server hit an error handling that request. Nothing was changed — try again. |
| `state.action_pending.label` | label | Working… |

## Implementation notes

- Every `name` key is a short label; every `desc`/`body` key is the longer form. No key is left dangling: every `classId`, `specializationId`, `definitionId`, `affixId`, `enemyId`, and `bossId` from `content.md` has a matching `.name` entry above, and the one area and one boss encounter in M1 each have a `.desc`.
- Affix names are suffixes, not standalone items — the UI composes `"{base item name} {affix name}"` (e.g., `item_weapon_shortsword.name` + `affix_of_power.name` → "Shortsword of Power"), per `content.md` 2.2's "an item instance... carries an optional affixId."
- No lore here implies a mechanic not already frozen in `combat.md`/`content.md` (e.g., Tollkeeper's description names only the existing every-3rd-round rule, not a new ability).

**Section 1's `spec_*` rows are superseded, not deleted** — `content.md` 5.1 retires `specializationId`
as a concept for M2 (`classes.md` section 9). They stay above only as a historical record for anyone
reading an M1-era `BattleReport`; no M2 surface reads or displays them. Section 8 below is the M2-24
replacement surface: class copy for all 6 classes, skill copy for the kits in `classes.md` 5, and the
new-content copy `content.md` 6.5 flagged as missing.

---

## 8. M2-24 additions: class/skill copy, combat feed verbs, second area, dungeon, and bosses

Fulfils `design/studio/milestones/M2.md`'s M2-24 scope ("original copy for new classes, skills, and
dungeons") against the IDs `classes.md` (M2-22 freeze) and `content.md` section 6 (M2-31) fix. All text
below is original, written for Banner & Bounty, matching the existing style: short label (~24 chars),
short description (~110 chars), body (~220 chars, onboarding/result copy only). No entry restates a
mechanic, number, or rule beyond what `classes.md`/`combat.md`'s M2-22 addition/`content.md` section 6
already define — descriptions name *what a skill or enemy does in flavor terms*, never a number that
could drift from the frozen tables.

### 8.1 Classes (3 new; the 3 M1 classes keep their section 1 `class_*.name`/short description as-is —
unchanged by the specialization retirement, since those lines never named a specialization)

| key | Display (label) | Description (short) |
| --- | --- | --- |
| `class_cleric.name` | Cleric | Keeps the party standing with steady heals and a timely ward. |
| `class_rogue.name` | Rogue | Slips past the front line to cut down whoever is exposed. |
| `class_herald.name` | Herald | Chants the company into a faster, steadier rhythm. |

### 8.2 Skills

No stable `skillId` string exists yet in `classes.md`/`content.md`/`contracts.md` — only each skill's
display name and mechanical row. This document assumes the convention `skill_<class>_<slug>` (e.g.
`skill_vanguard_bulwark_call`) so copy keys are ready to bind; confirming or renaming this scheme is
M2-25's contract decision (flagged in section 9 below), not a blocker to writing the text itself. Every
class's Basic Attack keeps its `classes.md` 5.x "Skill" column name as its label; descriptions are
flavor only, since the numeric effect is already frozen in `classes.md`.

| key | label | desc |
| --- | --- | --- |
| `skill_vanguard_strike.name` | Strike | A plain, disciplined cut — no flourish, just steel. |
| `skill_vanguard_bulwark_call.name` | Bulwark Call | — |
| `skill_vanguard_bulwark_call.desc` | — | Plants a shield wall, drawing every enemy strike and bracing against the hits. |
| `skill_vanguard_shield_bash.name` | Shield Bash | — |
| `skill_vanguard_shield_bash.desc` | — | Slams a foe with the shield's edge, rattling their guard and their swing. |
| `skill_vanguard_thick_hide.name` | Thick Hide | — |
| `skill_vanguard_thick_hide.desc` | — | Years of taking hits have left this Vanguard harder to hurt. |
| `skill_vanguard_last_stand.name` | Last Stand | — |
| `skill_vanguard_last_stand.desc` | — | Refuses to go down easy once the fight turns desperate. |
| `skill_cleric_smite.name` | Smite | A sharp strike backed by conviction rather than muscle. |
| `skill_cleric_mending_light.name` | Mending Light | — |
| `skill_cleric_mending_light.desc` | — | Closes a wound on whichever ally needs it most right now. |
| `skill_cleric_sanctuary.name` | Sanctuary | — |
| `skill_cleric_sanctuary.desc` | — | Wraps the whole company in a ward that knits wounds over time. |
| `skill_cleric_devotion.name` | Devotion | — |
| `skill_cleric_devotion.desc` | — | Answers the gravest wounds with the strongest healing. |
| `skill_cleric_vital_surge.name` | Vital Surge | — |
| `skill_cleric_vital_surge.desc` | — | A last reserve of faith that refuses to let this Cleric fall, once per fight. |
| `skill_ranger_quick_shot.name` | Quick Shot | A fast, practiced loose from the bow. |
| `skill_ranger_aimed_shot.name` | Aimed Shot | — |
| `skill_ranger_aimed_shot.desc` | — | A steadied shot aimed to finish whoever is already on the brink. |
| `skill_ranger_volley.name` | Volley | — |
| `skill_ranger_volley.desc` | — | Looses several arrows at once, spreading damage across the enemy line. |
| `skill_ranger_hunters_focus.name` | Hunter's Focus | — |
| `skill_ranger_hunters_focus.desc` | — | A trained eye that finds the gap in an enemy's guard more often than most. |
| `skill_ranger_momentum.name` | Momentum | — |
| `skill_ranger_momentum.desc` | — | Moves faster and faster as the enemy line thins out. |
| `skill_rogue_puncture.name` | Puncture | A quick stab aimed at the gaps in armor. |
| `skill_rogue_backstab.name` | Backstab | — |
| `skill_rogue_backstab.desc` | — | Slips behind the enemy line for a strike no guard can stop. |
| `skill_rogue_flurry.name` | Flurry | — |
| `skill_rogue_flurry.desc` | — | Two fast cuts before the target can even brace for the first. |
| `skill_rogue_opportunist.name` | Opportunist | — |
| `skill_rogue_opportunist.desc` | — | Presses harder the moment a target is already reeling. |
| `skill_rogue_evasion.name` | Evasion | — |
| `skill_rogue_evasion.desc` | — | Rarely where the enemy's blade expects to find them. |
| `skill_arcanist_arcane_bolt.name` | Arcane Bolt | A compact bolt of raw force. |
| `skill_arcanist_firebolt.name` | Firebolt | — |
| `skill_arcanist_firebolt.desc` | — | A searing bolt that leaves the target burning after it lands. |
| `skill_arcanist_meteor.name` | Meteor | — |
| `skill_arcanist_meteor.desc` | — | Calls down fire across the entire enemy line at once. |
| `skill_arcanist_overload.name` | Overload | — |
| `skill_arcanist_overload.desc` | — | Pushes extra force into every Firebolt cast. |
| `skill_arcanist_arcane_reserve.name` | Arcane Reserve | — |
| `skill_arcanist_arcane_reserve.desc` | — | Draws extra power from flames already burning on the enemy. |
| `skill_herald_rally_strike.name` | Rally Strike | A strike thrown to keep morale up as much as deal damage. |
| `skill_herald_war_hymn.name` | War Hymn | — |
| `skill_herald_war_hymn.desc` | — | A marching hymn that quickens the whole company's step. |
| `skill_herald_discordant_verse.name` | Discordant Verse | — |
| `skill_herald_discordant_verse.desc` | — | A jarring verse that saps an enemy's strength to swing true. |
| `skill_herald_encore.name` | Encore | — |
| `skill_herald_encore.desc` | — | Keeps the song going, bringing this Herald's own calls back around sooner. |
| `skill_herald_battle_hymn.name` | Battle Hymn | — |
| `skill_herald_battle_hymn.desc` | — | Fights harder in step with the hymn's own quickened rhythm. |

### 8.3 Combat feed verbs (for the M2-27 turn-by-turn feed, `design/studio/milestones/M2.md` scope item 1)

Short present-tense verbs/phrases the battle feed composes with actor/target/skill names and numbers
(e.g. "{actor} uses {skill} on {target} for {amount}."). These are phrase fragments, not full sentences
with their own key per event — exact feed sentence assembly is M2-27's UI implementation, not fixed here.

| key | text |
| --- | --- |
| `feed.verb.basic_attack` | strikes |
| `feed.verb.skill_damage` | uses {skill} on |
| `feed.verb.skill_aoe` | uses {skill} on the enemy line |
| `feed.verb.heal` | mends |
| `feed.verb.heal_aoe` | wards the whole party with |
| `feed.verb.buff` | rallies |
| `feed.verb.debuff` | saps |
| `feed.verb.taunt` | plants a shield wall and draws every eye |
| `feed.verb.crit` | — a solid hit! |
| `feed.verb.dodge` | — dodged! |
| `feed.verb.death` | falls. |
| `feed.verb.status_applied` | ({status} applied) |
| `feed.verb.status_expired` | ({status} fades) |
| `status_burn.name` | Burning |
| `status_weaken.name` | Weakened |
| `status_fortify.name` | Fortified |
| `status_haste.name` | Hastened |
| `status_regen.name` | Warded |
| `status_taunt.name` | Taunting |

### 8.4 The Sunken Aqueduct (second expedition area, `content.md` 6.1-6.2)

| key | label | desc |
| --- | --- | --- |
| `area_sunken_aqueduct.name` | The Sunken Aqueduct | A flooded channel under the old road, left to rot. |
| `area_sunken_aqueduct.desc` | — | An expedition through half-drowned tunnels. Opens once the Tollkeeper stops collecting. |
| `enemy_aqueduct_drowned.name` | Drowned Warden-Thrall | Bound to guard the water long after drowning in it. |
| `enemy_aqueduct_current.name` | Riptide Current | A living pull of water that drags down whoever it reaches. |
| `enemy_aqueduct_husk.name` | Aqueduct Husk | Hollowed out by the damp, but still swinging. |

### 8.5 Sunken Aqueduct Depths (multi-floor dungeon, `content.md` 6.3)

| key | label | desc |
| --- | --- | --- |
| `dungeon_aqueduct_depths.name` | Sunken Aqueduct Depths | Four floors down, where the flooding runs deepest. |
| `dungeon_aqueduct_depths.desc` | — | A four-floor descent beneath the aqueduct, ending in its warden. Clear a floor to move to the next. |
| `enemy_depths_broodling.name` | Depths Broodling | Hatched in the dark, and quick to swarm anything that enters. |

### 8.6 Boss: The Drowned Warden (`content.md` 6.4)

| key | label | desc |
| --- | --- | --- |
| `boss_drowned_warden.name` | The Drowned Warden | Once kept the aqueduct's locks. Now it keeps anyone from leaving. |
| `boss_drowned_warden.desc` | — | A towering, waterlogged guardian. Strikes the weak, then the whole line, on a steady cycle. |
| `boss_drowned_warden.intro` | body | The locks groan open on their own. Something vast rises out of the flooded dark — the Warden never left its post. |

## 9. Assumptions and open items (recorded per `AGENTS.md` rule 4)

- No stable `skillId` string scheme exists yet anywhere in the frozen surface (`classes.md`,
  `content.md`, `contracts.md` only type the field as `string`/`string | null`). Section 8.2 adopts
  `skill_<class>_<slug>` (lowercase, underscored skill name) as a working convention so copy keys exist
  and can bind without inventing new mechanics; M2-25 (contracts) should confirm or formally fix this
  string scheme when it specifies the skill/loadout DTO shape. If M2-25 picks a different scheme, only
  the key prefixes in section 8.2 need renaming — the label/desc text itself does not change.
- Section 8.3's combat-feed verb fragments are phrase-level building blocks, not one key per possible
  feed sentence — M2-27 (battle view implementation) composes the exact sentence from actor/target/
  skill names, these verbs, and the numeric amount; this document does not fix that assembly format,
  consistent with `design/studio/milestones/M2.md` leaving the exact UI composition to M2-27.
- `status_*.name` entries in 8.3 give each status a short display label for the battle view's
  buff/debuff icons/text (`design/studio/milestones/M2.md` scope item 1's "active status effects");
  no `status_*.desc` is added because the exact magnitude/duration is already frozen in `classes.md`
  section 6 and showing it as live numeric UI (e.g. "+30% DEF, 1 round left") is M2-27's rendering
  concern, not new copy text.
- Synergy-pair bonuses (`classes.md` 2.2: Banner Bearer, Battle Medic, Shadowflame, Marching Fire,
  Hexblade, Choir) are not given separate copy keys here — they modify an existing named skill's
  numbers (e.g. Bulwark Call's taunt duration) rather than adding a new displayed skill, so the base
  skill's label/desc in 8.2 already covers what the player sees; no UI surface needs a standalone
  "Banner Bearer" string per `classes.md`/`ui-spec.md`.
- `reward_area_3`/`reward_dungeon_2` (`gear.md` 3-4) and a third expedition area are unbound per
  `content.md` 6.5 — no copy is written for content that does not yet have IDs; this is not an omission,
  it is nothing existing yet to key copy to.
- Enemy/boss *behavior* descriptions above name only mechanics already frozen in `content.md` section 6
  (e.g. the Drowned Warden's "strikes the weak, then the whole line, on a steady cycle" names Crushing
  Current → Tidal Surge's cadence, not a new ability) and the Riptide Current/Aqueduct Husk/Broodling
  entries name only role and theme, consistent with this document's existing "no lore implies an
  unfrozen mechanic" rule (M1-03 implementation notes, carried forward).
