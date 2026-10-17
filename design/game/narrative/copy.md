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
