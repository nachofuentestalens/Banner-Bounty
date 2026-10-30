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

---

## 10. M3-06 additions: M3 classes, races, dungeon, codex, respec and competition copy

Fulfils `design/studio/milestones/M3.md`'s M3-06 scope against `design/game/m3-systems.md` (M3-03
freeze) and `design/game/economy/m3.md` (M3-04 provisional targets). All text below is original,
written for Banner & Bounty, matching this document's existing style: short label (~24 chars), short
description (~110 chars), body (~220 chars, onboarding/result/confirmation copy only). No entry
restates a number that `m3-systems.md`/`economy/m3.md` mark as provisional or tunable (e.g. respec
gold/scrap/sigil cost, cooldown hours, specialization thresholds/target counts) — those render from
server-supplied values via `{placeholder}` tokens. The one exception is the **180-second floor
timing**, which `m3-systems.md` §3/§7 freezes as a production constant rather than a tunable, and
which the milestone explicitly requires copy to communicate.

### 10.1 New classes (`m3-systems.md` §4)

| key | label | desc |
| --- | --- | --- |
| `class_warder.name` | Warder | Defensive support who braces allies and mends what the front line takes. |
| `class_weaver.name` | Weaver | Control-minded striker who saps an enemy's edge before cutting it down. |

### 10.2 New class skills

| key | label | desc |
| --- | --- | --- |
| `skill_warder_tap.name` | Shieldtap | A short, disciplined knock with the shield's rim — enough to keep the line honest. |
| `skill_warder_brace.name` | Brace | — |
| `skill_warder_brace.desc` | — | Steps between whoever's hurting worst and the next hit, bracing their guard. |
| `skill_warder_repair.name` | Repair | — |
| `skill_warder_repair.desc` | — | Patches up whichever ally needs it most, full health or not. |
| `skill_warder_rooted.name` | Rooted Stance | — |
| `skill_warder_rooted.desc` | — | Plants firm at the front of the line, harder to move the longer this Warder holds it. |
| `skill_warder_aftercare.name` | Aftercare | — |
| `skill_warder_aftercare.desc` | — | Leaves a lingering comfort on whoever Repair just patched up. |
| `skill_weaver_thread.name` | Threadcast | — |
| `skill_weaver_thread.desc` | — | A thin filament of force, flicked out to find a weak point. |
| `skill_weaver_snare.name` | Snare | — |
| `skill_weaver_snare.desc` | — | A binding strike that saps the target's own strength along with the hit. |
| `skill_weaver_unravel.name` | Unravel | — |
| `skill_weaver_unravel.desc` | — | Strips a braced enemy's shielding bare before the strike lands. |
| `skill_weaver_tension.name` | Tension | — |
| `skill_weaver_tension.desc` | — | Pulls a little harder on a target already caught sapped and weakened. |
| `skill_weaver_slip.name` | Slip | — |
| `skill_weaver_slip.desc` | — | A practiced sidestep, honed since the first thread was cast. |

### 10.3 Primary specializations — all eight classes, two choices each (`m3-systems.md` §4)

One optional primary specialization per hero; choosing, clearing, or switching is free outside active
runs. Without its named skill slotted, a specialization has no effect — the codex (10.6) warns rather
than auto-equipping.

| key | label | desc |
| --- | --- | --- |
| `m3spec_vanguard_sentinel.name` | Sentinel | — |
| `m3spec_vanguard_sentinel.desc` | — | Bulwark Call also shields the ally who needs it most, not just this Vanguard. |
| `m3spec_vanguard_breaker.name` | Breaker | — |
| `m3spec_vanguard_breaker.desc` | — | Shield Bash punches straight through row cover, though a taunting target still comes first. |
| `m3spec_ranger_tracker.name` | Tracker | — |
| `m3spec_ranger_tracker.desc` | — | Aimed Shot finishes wounded enemies earlier than usual. |
| `m3spec_ranger_scatter.name` | Scatter | — |
| `m3spec_ranger_scatter.desc` | — | Volley's spread reaches further across the enemy line. |
| `m3spec_arcanist_ember.name` | Ember | — |
| `m3spec_arcanist_ember.desc` | — | Firebolt turns from the weakest enemy to the strongest, burning whoever can take it. |
| `m3spec_arcanist_quench.name` | Quench | — |
| `m3spec_arcanist_quench.desc` | — | Meteor's fire snuffs out every struck enemy's hastened step before the damage falls. |
| `m3spec_cleric_triage.name` | Triage | — |
| `m3spec_cleric_triage.desc` | — | Mending Light heals hardest on whoever is closest to falling, then still calls on Devotion if slotted. |
| `m3spec_cleric_shelter.name` | Shelter | — |
| `m3spec_cleric_shelter.desc` | — | Sanctuary's ward now braces every living ally's guard as well as their wounds. |
| `m3spec_rogue_duelist.name` | Duelist | — |
| `m3spec_rogue_duelist.desc` | — | Backstab turns from the frontline target to whichever enemy swings hardest, wherever they stand. |
| `m3spec_rogue_pursuer.name` | Pursuer | — |
| `m3spec_rogue_pursuer.desc` | — | If Flurry's first cut drops its target, the second cut finds someone else instead of going to waste. |
| `m3spec_herald_cadence.name` | Cadence | — |
| `m3spec_herald_cadence.desc` | — | War Hymn clears the company's saps before it quickens their step. |
| `m3spec_herald_dissonance.name` | Dissonance | — |
| `m3spec_herald_dissonance.desc` | — | Discordant Verse turns from the frontline target to whichever enemy swings hardest, wherever they stand. |
| `m3spec_warder_anchor.name` | Anchor | — |
| `m3spec_warder_anchor.desc` | — | Brace's shield now draws every eye as well, holding the fight on this Warder's chosen ally. |
| `m3spec_warder_mender.name` | Mender | — |
| `m3spec_warder_mender.desc` | — | Repair reaches two of the company's neediest at once, for a gentler mend each. |
| `m3spec_weaver_fray.name` | Fray | — |
| `m3spec_weaver_fray.desc` | — | A landed Snare now saps its target's step along with its guard. |
| `m3spec_weaver_sever.name` | Sever | — |
| `m3spec_weaver_sever.desc` | — | Unravel reaches first for whichever braced enemy swings hardest, before falling back to its usual mark. |

### 10.4 Races and comparison/migration copy (`m3-systems.md` §5)

Race is chosen once at recruitment and never changes afterward; no race restricts any class, gear, or
content.

| key | label | desc |
| --- | --- | --- |
| `race_vesper.name` | Vesperkin | Hardier blood, but their strikes land a touch softer. |
| `race_cairn.name` | Cairnfolk | Built like old stone — tougher to move, slower to get there. |
| `race_serein.name` | Serein | Quick on their feet, thinner for it. |

| key | type | text |
| --- | --- | --- |
| `race.compare.title` | label | Compare Races |
| `race.compare.body` | body | Every recruit picks one race for good. Each trades one strength for one weakness — review all three before you confirm. |
| `race.no_default.desc` | — | No race is chosen for you — pick one explicitly before recruiting. |
| `race.migration_notice.title` | label | Assigned: Vesperkin |
| `race.migration_notice.body` | body | Heroes recruited before races existed are set to Vesperkin by default. Nothing else about their build, level, or gear changed. |

### 10.5 Cinder Archive — second dungeon, enemies, boss, floors (`m3-systems.md` §7)

| key | label | desc |
| --- | --- | --- |
| `dungeon_cinder_archive.name` | Cinder Archive | Four floors of records and ash, held by something that still keeps the catalog. |
| `dungeon_cinder_archive.desc` | — | A four-floor descent through a ruined archive, ending in its keeper. Opens once Sunken Aqueduct Depths is cleared. |
| `dungeon_cinder_archive.locked.desc` | — | Clear Sunken Aqueduct Depths first to unlock the Cinder Archive. |
| `enemy_archive_binder.name` | Archive Binder | Bound tight in old leather, it still enforces whatever order it was left to keep. |
| `enemy_archive_spark.name` | Archive Spark | A quick flare of old magic, drawn straight to whoever's hurt worst. |
| `boss_archive_custodian.name` | The Custodian | What's left of the archive's keeper, still sweeping the floor clean of anyone who doesn't belong. |
| `boss_archive_custodian.desc` | — | A towering, methodical guardian. Cycles between bracing itself, singling out the weak, and striking the whole line at once. |
| `boss_archive_custodian.intro` | body | Dust stirs along the shelves. Something old and precise steps out from between them — the Archive never stopped being kept. |
| `floor_cinder_archive_1.desc` | — | A binder and a spark guard the entrance, same as any ordinary record room. |
| `floor_cinder_archive_2.desc` | — | The binder holds the door while two sparks circle the room. |
| `floor_cinder_archive_3.desc` | — | Two binders stand together, with one spark still darting between them. |
| `floor_cinder_archive_4.desc` | — | The Custodian itself, with one spark still keeping watch. |

| key | type | text |
| --- | --- | --- |
| `dungeon.floor_timing.desc` | — | Each floor takes 180 seconds to resolve, whatever happens in it. A full four-floor clear takes up to 12 minutes. |
| `dungeon.loadout_frozen.title` | label | Loadout Locked for This Run |
| `dungeon.loadout_frozen.body` | body | Stats, race, specialization, skills, gear, and formation are frozen the moment this dungeon starts. Finish or abandon this run before changing any of them. |
| `dungeon.between_floors_locked.desc` | — | No loadout changes between floors — this run keeps the build it started with. |
| `dungeon.abandon_confirm.title` | label | Abandon This Run? |
| `dungeon.abandon_confirm.body` | body | Floors you've already cleared keep their rewards. Anything in progress on this floor is lost, and there's no refund for stopping early. |
| `dungeon.retry.desc` | — | Starting again begins at floor 1 with a fresh run — nothing carries over from the last attempt. |
| `dungeon.catalog_stale.desc` | — | This dungeon's listing changed since you opened it. Refreshing before you start. |

### 10.6 Codex — read-only build reference (`m3-systems.md` §6)

| key | type | text |
| --- | --- | --- |
| `codex.title` | label | Company Codex |
| `codex.body` | body | Every class, race, and specialization choice — stats, skills, and tradeoffs — before you commit to one. Looking something up here changes nothing about your build. |
| `codex.inspect.label` | label | Inspect |
| `codex.inspect.hint` | — | Press Enter or Space, or tap, to open this. Nothing shown here is equipped until you confirm elsewhere. |
| `codex.locked_skill.desc` | — | Unlocks at level {level}. Shown here so you know what's coming, not as something to equip yet. |
| `codex.secondary_preview.desc` | — | Looking at a class you haven't chosen as secondary doesn't unlock it — recruit or switch into it first. |
| `codex.return_draft_preserved.desc` | — | Your unsaved pick is still here when you come back from the codex. |
| `codex.stale_catalog.desc` | — | The codex updated since you opened it. Refreshing before you continue. |

### 10.7 Deferred loadout — pending, applied, superseded, discarded (`m3-systems.md` §3)

| key | type | text |
| --- | --- | --- |
| `loadout.pending.label` | label | Pending |
| `loadout.pending.desc` | — | Queued for your next eligible fight. The fight already in progress still uses the old build. |
| `loadout.applied.label` | label | Applied |
| `loadout.applied.desc` | — | This selection is now live and governs every fight from here on, until you change it again. |
| `loadout.superseded.label` | label | Replaced |
| `loadout.superseded.desc` | — | A later change took its place before this one ever took effect. |
| `loadout.discarded.label` | label | Discarded |
| `loadout.discarded.desc` | — | This queued change never applied and was cleared when the run stopped. |
| `loadout.frozen_level.title` | label | Frozen at Level {level} |
| `loadout.frozen_level.body` | body | This expedition started at level {level}, so only skills already unlocked then are selectable. A skill from a later level needs a new expedition. |
| `loadout.cancel_pending.label` | label | Cancel Pending Change |
| `loadout.cancel_already_applied.desc` | — | Too late — this change already applied. Nothing was cancelled. |
| `loadout.save_confirm.label` | label | Save for Next Eligible Fight |
| `loadout.legacy_run_locked.desc` | — | This run started under the old rules. Finish it before queuing a new skill loadout. |
| `loadout.dungeon_locked.desc` | — | Dungeon runs never accept loadout changes, even between floors. |
| `loadout.invalid_slot.desc` | — | That skill doesn't belong in this slot, isn't unlocked yet, or is already slotted elsewhere. Nothing was saved. |

### 10.8 Respec — primary class and free secondary switching (`m3-systems.md` §6)

| key | type | text |
| --- | --- | --- |
| `respec.title` | label | Respec Primary Class |
| `respec.preview.body` | body | Changing primary class clears your current specialization and resets your four skill slots to the new class's basics. Secondary class, level, race, and gear are unchanged. |
| `respec.cost.label` | label | Cost |
| `respec.cooldown.desc` | — | One respec per hero on a daily cooldown. The clock starts the moment this one confirms. |
| `respec.next_eligible.desc` | — | Next respec available {timestamp}. |
| `respec.confirm.label` | label | Confirm Respec |
| `respec.cancel.label` | label | Cancel |
| `respec.blocked_active_run.desc` | — | Respec is unavailable while an expedition or dungeon is running. Stop or finish it first. |
| `respec.insufficient_funds.desc` | — | Not enough resources for this respec. Nothing was spent. |
| `respec.cooldown_active.desc` | — | This hero respecced recently. Try again after {timestamp}. |
| `respec.same_primary_rejected.desc` | — | That's already this hero's primary class — pick a different one to respec. |
| `respec.stale_preview.desc` | — | Costs changed since you opened this. Review the new preview before confirming. |
| `respec.success.desc` | — | Respec complete. Pick new active and passive skills whenever you're ready. |
| `respec.secondary_free.label` | label | Free; No Cooldown |
| `respec.secondary_free.body` | body | Switching only your secondary class costs nothing and has no cooldown. Slotted skills stay put unless the new pool drops them. |
| `respec.secondary_confirm.label` | label | Confirm Secondary Switch |
| `respec.secondary_noop.desc` | — | This is already your secondary class — nothing to change. |

### 10.9 Season — entry, fixtures, standings, titles (`m3-systems.md` §8)

| key | type | text |
| --- | --- | --- |
| `competition.disclosure.title` | label | Local Prototype Season |
| `competition.disclosure.body` | body | This season runs entirely on your own machine. Open seats fill with labelled server fixtures, never other players — there's no online matchmaking here. |
| `competition.entry_window.desc` | — | Entry closes 24 hours after this season opened: {deadline}. |
| `competition.entry_confirm.label` | label | Confirm Entry |
| `competition.entry_confirm.body` | body | Entering locks your company exactly as it stands right now — levels, class, race, gear, and formation. Later changes to your roster never reach this snapshot. |
| `competition.entry_closed.title` | label | Entry Closed |
| `competition.entry_closed.desc` | — | This season's entry window has passed. Next season opens {date}. |
| `competition.withdraw_confirm.title` | label | Withdraw From This Season? |
| `competition.withdraw_confirm.body` | body | Withdrawing before lock leaves this season with no matches and no rank. This can't be undone, and there's no re-entering later. |
| `competition.locked.title` | label | Snapshot Locked |
| `competition.locked.desc` | — | This company is locked in for the season and tournament. Matches resolve automatically — there's nothing left to confirm. |
| `competition.fixture.label` | label | Server Fixture |
| `competition.fixture.desc` | — | A company built by the server to fill an open seat, not a real player. Standings and matches against it are real, but no one is behind it. |
| `competition.fixture_only.title` | label | Fixture-Only Demonstration |
| `competition.fixture_only.desc` | — | No local accounts entered this season. Every seat is a labelled server fixture — this is a demonstration bracket, not a contest. |
| `competition.standings.title` | label | Season Standings |
| `competition.standings.points_label` | label | Points |
| `competition.standings.tiebreak.desc` | — | Ties break by wins, then by entry ID — never by a hidden stat. |
| `competition.recognition_only.desc` | — | Standings and brackets award a title only — no gold, items, materials, or lasting stat changes come from competing. |
| `competition.season_title.label` | label | Season Champion |
| `competition.match_draw.desc` | — | Combat draw. The match still has a winner, decided by surviving strength, not a rewritten kill. |
| `competition.no_rank.desc` | — | No matches played this season — no rank to show. |
| `competition.archive.label` | label | View Archived Season |
| `competition.archive.desc` | — | This season has ended. Standings and results are preserved; individual fight replays aren't guaranteed. |
| `competition.new_season.desc` | — | A new season has started. Enter again within its first 24 hours — nothing carries over automatically. |

### 10.10 Tournament — bracket, byes, draws, titles (`m3-systems.md` §9)

| key | type | text |
| --- | --- | --- |
| `tournament.disclosure.body` | body | One four-seat bracket per season, using the same locked company as your season entry. No separate entry, and no team changes once it locks. |
| `tournament.bracket.title` | label | Tournament Bracket |
| `tournament.seed.desc` | — | Seeded by entry ID, not season standings — seat order decides who faces whom. |
| `tournament.bye.label` | label | Bye |
| `tournament.bye.desc` | — | This seat couldn't field a usable company. Its opponent advances without a match — no reward beyond moving forward. |
| `tournament.vacant_seat.desc` | — | This seat is vacant for this bracket while recovery is in progress. No match was played here. |
| `tournament.no_champion.desc` | — | No match was played in this bracket — there's no champion to crown. |
| `tournament.champion.label` | label | Tournament Champion |
| `tournament.champion.bye_only.desc` | — | Advancing on byes alone doesn't earn the champion's title — a played final does. |
| `tournament.withdraw_unavailable.desc` | — | Snapshot locked; matches finish automatically. |
| `tournament.history_restored.desc` | — | Bracket and results are unchanged from before — reopening never alters a finished match. |

### 10.11 Reports, eviction, and offline summaries (`m3-systems.md` §2)

| key | type | text |
| --- | --- | --- |
| `feed.eviction.title` | label | Fight No Longer Retained |
| `feed.eviction.body` | body | This report aged out of the retained window. Pick an open ordinal below, or jump back to the latest fight. |
| `feed.eviction.open_oldest.label` | label | Open Oldest Available |
| `feed.eviction.return_latest.label` | label | Return to Latest |
| `feed.retention_warning.desc` | — | Unread fights are piling up. Catch up soon or the oldest will leave the retained window. |
| `feed.missing_range.desc` | — | Fights {from}–{to} are no longer retained. Everything after is still here. |
| `feed.offline_summary.title` | label | While You Were Away |
| `feed.offline_summary.body` | body | A settlement summary for the time you were offline: wins, losses, elapsed and credited time, and what was actually granted. Fight-by-fight reports beyond the retained window aren't replayable. |
| `feed.summary_retention.desc` | — | The most recent 20 settlement summaries are kept; older ones are no longer available. |
| `feed.account_switch.desc` | — | Switched accounts — this feed now shows only the signed-in company's own fights. |
| `feed.reconnect_restored.desc` | — | Reconnected. Picking up right where you left off. |
| `feed.follow_on.label` | label | Follow Latest |
| `feed.follow_off.desc` | — | Follow is off while you're viewing history — new fights won't steal your place. |

### 10.12 Cross-cutting accessible and error states

| key | type | text |
| --- | --- | --- |
| `a11y.hover_hint.desc` | — | Press Enter or Space, or tap, to see this explanation — it isn't hidden behind hover alone. |
| `a11y.reduced_motion.desc` | — | Battle animation is off and playback starts paused. Turn this off in settings to resume normal playback. |
| `a11y.focus_restore.desc` | — | Closing this returns focus to whatever opened it. |
| `state.validation_rejected.desc` | — | That selection isn't valid right now — check the highlighted slot and try again. |
| `state.conflict_stale.desc` | — | This changed on the server since you loaded it. Refreshing the preview before you continue. |

### 10.13 Coverage table (acceptance evidence)

| Required surface (milestone/M3-06 scope) | Copy keys |
| --- | --- |
| Two added classes (Warder, Weaver) | 10.1, 10.2 |
| All eight classes' specialization choices (16) | 10.3 |
| Three races and their tradeoffs | 10.4 |
| One new four-floor dungeon and final boss | 10.5 |
| Codex/build comparisons | 10.6, `race.compare.*` (10.4) |
| Pending/applied loadouts | 10.7 |
| Respec cost/reset/cooldown | 10.8 |
| Season standings | 10.9 |
| Tournament states | 10.10 |
| Keyboard/tap equivalents for hover explanations | `codex.inspect.hint` (10.6), `a11y.hover_hint.desc` (10.12) |
| Report eviction/offline summaries | 10.11 |
| Recognition-only competition rewards (no currency/item promise) | `competition.recognition_only.desc`, `competition.season_title.label`, `tournament.champion.label` |
| Immutable competition entries | `competition.entry_confirm.body`, `competition.locked.*`, `competition.withdraw_confirm.*` |
| Clearly labelled server fixture opponents | `competition.fixture.*`, `competition.fixture_only.*` |
| Frozen dungeon loadouts and 180-second floor timing | `dungeon.floor_timing.desc`, `dungeon.loadout_frozen.*`, `dungeon.between_floors_locked.desc` |
| Locked/empty/error/confirmation text per flow | present throughout 10.5-10.12 (e.g. `dungeon_cinder_archive.locked.desc`, `competition.no_rank.desc`, `respec.insufficient_funds.desc`, `*_confirm.*` pairs) |
| Stale exactly-three-heroes copy | Verified: no instance of a fixed three-hero-company claim exists in this document (`grep -i "three.hero\|exactly three\|party of three" design/game/narrative/copy.md` returns no matches). The only "three hero" line in the repository is `design/game/interface.md:8` ("Company: three hero cards..."), which is UI Designer-owned, outside this document and this task's write scope; flagged in the evidence report for that owner, not edited here. |

### 10.14 Assumptions and open items (M3-06)

- Respec gold/scrap/sigil cost and the 24-hour cooldown are provisional per `economy/m3.md` §7/
  `m3-systems.md` §6 and may be amended before M3-05 freezes contracts. Copy above never states
  these numbers directly; it renders them from server-supplied values via `{cost}`/`{timestamp}`-style
  placeholders so no copy text needs to change if the formula is amended.
- The G3 duration model (combat-length-only vs. a retained floor, `economy/m3.md` §2.3) is explicitly
  undecided. No copy here states an expedition nominal duration in minutes/seconds; only the frozen
  180-second **dungeon** floor timing (a production constant, not a duration-model candidate) is
  named, per the milestone's explicit instruction to communicate it.
- Specialization descriptions (10.3) name effects in flavor terms only and omit exact thresholds/
  target counts (e.g. Ranger Tracker's execute-threshold change, Ranger Scatter's extra target),
  consistent with this document's existing rule that descriptions never restate a number that could
  drift from the frozen mechanical table in `m3-systems.md` §4.
- No skill/specialization/race/dungeon copy key above introduces an ID not already present in
  `m3-systems.md`; no new mechanic, stat, or reward is implied beyond what that document and
  `economy/m3.md` already freeze.
- `competition.season_title.label`/`tournament.champion.label` are generic title labels; the exact
  display composition (e.g. whether a season number is interpolated, such as "Season 3 Champion")
  is UI assembly, not fixed here, matching this document's existing precedent (section 8.3's note on
  M2-27 owning exact feed-sentence assembly).
- This section does not duplicate or restate 8.3's combat-feed verbs, status names, or synergy-copy
  rules; those remain unchanged and already cover M3 combat (`m3-systems.md` §1 reuses combat.md §8
  and the existing status set, adding no new status type).

## 11. Assumptions and open items (M1-03/M2-24, recorded per `AGENTS.md` rule 4)

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
