// Player-facing copy, verbatim from design/game/narrative/copy.md plus the
// additions design/game/ui-spec.md's "Copy additions needed" table asks
// M1-10 to implement (copy.md itself is Narrative Designer's file; these
// keys are the frozen spec's literal text, kept here since apps/web is this
// task's write scope). Do not alter the text without a design decision.
export const COPY = {
  class_vanguard: { name: "Vanguard", desc: "Front-line fighter who soaks hits and keeps the party standing." },
  class_vanguard_spec_guardian: { name: "Guardian", desc: "Guards the lowest-HP% ally each round, taking half their incoming damage." },
  class_vanguard_spec_berserker: { name: "Berserker", desc: "Trades defense for attack, and strikes even harder under half HP." },
  class_ranger: { name: "Ranger", desc: "Fast striker who closes out weakened foes." },
  class_ranger_spec_marksman: { name: "Marksman", desc: "Deals bonus damage to any enemy below 30% HP." },
  class_ranger_spec_pathfinder: { name: "Pathfinder", desc: "Grants the entire party extra speed for the battle." },
  class_arcanist: { name: "Arcanist", desc: "Ranged attacker with the highest raw power." },
  class_arcanist_spec_pyromancer: { name: "Pyromancer", desc: "Burns its target, dealing extra damage each round the burn lasts." },
  class_arcanist_spec_warden: { name: "Warden", desc: "Mends the lowest-HP% ally every turn instead of attacking." },

  hero_starter_vanguard: { name: "Vanguard Recruit", desc: "Your company's first shield. Unspecialized until level 3." },
  hero_starter_ranger: { name: "Ranger Recruit", desc: "Your company's first scout. Unspecialized until level 3." },
  hero_starter_arcanist: { name: "Arcanist Recruit", desc: "Your company's first spellhand. Unspecialized until level 3." },

  item_weapon_shortsword: { name: "Shortsword", desc: "A balanced blade. Raises attack." },
  item_weapon_longspear: { name: "Longspear", desc: "Reach and a little steel. Raises attack and defense." },
  item_weapon_focus: { name: "Arcane Focus", desc: "Channels force into the next strike. Raises attack most." },
  item_armor_leather: { name: "Leather Vest", desc: "Light protection that barely slows you down. Raises HP and defense." },
  item_armor_plate: { name: "Plate Harness", desc: "Heavy guard built to take the hits. Raises defense and HP." },
  item_armor_robe: { name: "Traveler's Robe", desc: "Thin cloth, generous padding underneath. Raises HP most." },
  item_trinket_whetstone: { name: "Whetstone Charm", desc: "Keeps an edge sharp. Raises attack." },
  item_trinket_ironband: { name: "Iron Band", desc: "A plain ring, oddly sturdy. Raises defense." },
  item_trinket_luckycoin: { name: "Lucky Coin", desc: "Worn smooth by nervous thumbs. Raises HP." },

  affix_of_power: { name: "of Power", desc: "Adds attack." },
  affix_of_warding: { name: "of Warding", desc: "Adds defense." },
  affix_of_vigor: { name: "of Vigor", desc: "Adds HP." },
  affix_of_haste: { name: "of Haste", desc: "Adds speed." },

  area_old_road: { name: "The Old Road", desc: "A short expedition: three foes guarding the road, run on a timer." },
  enemy_road_brigand: { name: "Road Brigand", desc: "Slow, heavy, and hard to put down." },
  enemy_road_wolf: { name: "Road Wolf", desc: "Fast and vicious, but thin-skinned." },
  enemy_road_cutpurse: { name: "Road Cutpurse", desc: "Quick hands, quick feet, no real armor." },

  boss_tollkeeper: {
    name: "The Tollkeeper",
    desc: "A single, heavily armored foe. Every third round it targets your weakest hero instead of the front line.",
  },
  boss_tollkeeper_reward_claimed: { name: "Toll Paid", desc: "First victory reward collected. Future wins are recorded but pay nothing further." },

  onboarding_local_build: {
    title: "Local Development Build",
    body: "This company lives on your own machine. Nothing here is public, and progress stays in this browser's local server until you choose to reset it.",
  },
  onboarding_first_expedition: {
    title: "Send Out Your Company",
    body: "Pick a party order, then start the Old Road. Your heroes fight automatically on a timer — check back to see the result and collect rewards.",
  },
  expedition_offline_cap: {
    title: "Time Away Capped",
    body: "Progress while you were away is capped at a set amount. Anything beyond the cap waits for your next check-in — nothing is lost, just paused.",
  },
  expedition_loadout_locked: {
    title: "Loadout Locked",
    body: "This hero is out on expedition. Gear and specialization are frozen until the expedition stops, so the fight stays consistent from start to finish.",
  },
  inventory_overflow: {
    title: "Inventory Full",
    body: "Your inventory is full. Equip, drop, or convert an item before claiming a new one — nothing claimed is lost while you decide.",
  },
  boss_reward_pending: { title: "Toll Unpaid", desc: "Defeat the Tollkeeper once to claim its one-time reward." },
  boss_reward_already_claimed: {
    title: "Already Claimed",
    desc: "You've already collected this boss's one-time reward. This fight will still record a result, just no further reward.",
  },
  arena_snapshot: {
    title: "Published Team Snapshot",
    body: "This is a saved copy of an opponent's company from when they published it, not a live player. Challenging it won't affect their current game.",
  },
  arena_no_opponent: {
    title: "No Opponents Yet",
    desc: "No published teams are available to challenge right now. Publish your own company so others have someone to face.",
  },

  state_loading: { label: "Loading…" },
  state_empty_inventory: { label: "No items yet", desc: "Items you find or buy will show up here." },
  state_offline: { title: "Reconnecting", desc: "Lost touch with the server. Retrying — your last confirmed state is still safe." },
  state_action_rejected: { title: "Action Rejected", desc: "The server didn't accept that action; your company state hasn't changed." },
  state_server_error: { title: "Something Went Wrong", desc: "The server hit an error handling that request. Nothing was changed — try again." },
  state_action_pending: { label: "Working…" },
  state_conflict: { desc: "Your company changed elsewhere — refreshing before you try again." },

  nav_company: "Company",
  nav_expedition: "Expedition",
  nav_inventory: "Inventory",
  nav_boss: "Boss",
  nav_arena: "Arena",

  action_confirm_logout: "Switch Account",
  action_retry: "Retry Now",
  action_start_expedition: "Start Expedition",
  action_stop_expedition: "Stop and Collect",
  action_collect: "Collect Rewards",
  action_equip: "Equip",
  action_unequip: "Unequip",
  action_publish_snapshot: "Publish Team",
  action_challenge: "Challenge",

  disabled_spec_locked_level: "Reach level 3 to choose a specialization.",
  disabled_spec_locked_expedition: "Specialization is frozen while this hero is on expedition.",
  disabled_equip_locked_expedition: "Gear is frozen while this hero is on expedition.",
  disabled_party_incomplete: "Choose exactly 3 heroes before starting an expedition or publishing.",
  disabled_item_wrong_slot: "This item doesn't fit that slot.",

  // M2-24 additions (design/game/narrative/copy.md section 8). The 3 new
  // classes; the 3 M1 classes keep their section-1 entries above unchanged.
  class_cleric: { name: "Cleric", desc: "Keeps the party standing with steady heals and a timely ward." },
  class_rogue: { name: "Rogue", desc: "Slips past the front line to cut down whoever is exposed." },
  class_herald: { name: "Herald", desc: "Chants the company into a faster, steadier rhythm." },

  // Skills (section 8.2), keyed by bare engine skillId (see skillCopy below for the skill_<class>_<slug> binding convention copy.md proposed).
  strike: { name: "Strike", desc: "A plain, disciplined cut — no flourish, just steel." },
  bulwark_call: { name: "Bulwark Call", desc: "Plants a shield wall, drawing every enemy strike and bracing against the hits." },
  shield_bash: { name: "Shield Bash", desc: "Slams a foe with the shield's edge, rattling their guard and their swing." },
  thick_hide: { name: "Thick Hide", desc: "Years of taking hits have left this Vanguard harder to hurt." },
  last_stand: { name: "Last Stand", desc: "Refuses to go down easy once the fight turns desperate." },
  smite: { name: "Smite", desc: "A sharp strike backed by conviction rather than muscle." },
  mending_light: { name: "Mending Light", desc: "Closes a wound on whichever ally needs it most right now." },
  sanctuary: { name: "Sanctuary", desc: "Wraps the whole company in a ward that knits wounds over time." },
  devotion: { name: "Devotion", desc: "Answers the gravest wounds with the strongest healing." },
  vital_surge: { name: "Vital Surge", desc: "A last reserve of faith that refuses to let this Cleric fall, once per fight." },
  quick_shot: { name: "Quick Shot", desc: "A fast, practiced loose from the bow." },
  aimed_shot: { name: "Aimed Shot", desc: "A steadied shot aimed to finish whoever is already on the brink." },
  volley: { name: "Volley", desc: "Looses several arrows at once, spreading damage across the enemy line." },
  hunters_focus: { name: "Hunter's Focus", desc: "A trained eye that finds the gap in an enemy's guard more often than most." },
  momentum: { name: "Momentum", desc: "Moves faster and faster as the enemy line thins out." },
  puncture: { name: "Puncture", desc: "A quick stab aimed at the gaps in armor." },
  backstab: { name: "Backstab", desc: "Slips behind the enemy line for a strike no guard can stop." },
  flurry: { name: "Flurry", desc: "Two fast cuts before the target can even brace for the first." },
  opportunist: { name: "Opportunist", desc: "Presses harder the moment a target is already reeling." },
  evasion: { name: "Evasion", desc: "Rarely where the enemy's blade expects to find them." },
  arcane_bolt: { name: "Arcane Bolt", desc: "A compact bolt of raw force." },
  firebolt: { name: "Firebolt", desc: "A searing bolt that leaves the target burning after it lands." },
  meteor: { name: "Meteor", desc: "Calls down fire across the entire enemy line at once." },
  overload: { name: "Overload", desc: "Pushes extra force into every Firebolt cast." },
  arcane_reserve: { name: "Arcane Reserve", desc: "Draws extra power from flames already burning on the enemy." },
  rally_strike: { name: "Rally Strike", desc: "A strike thrown to keep morale up as much as deal damage." },
  war_hymn: { name: "War Hymn", desc: "A marching hymn that quickens the whole company's step." },
  discordant_verse: { name: "Discordant Verse", desc: "A jarring verse that saps an enemy's strength to swing true." },
  encore: { name: "Encore", desc: "Keeps the song going, bringing this Herald's own calls back around sooner." },
  battle_hymn: { name: "Battle Hymn", desc: "Fights harder in step with the hymn's own quickened rhythm." },

  status_burn: { name: "Burning", desc: "Takes damage each round until it fades." },
  status_weaken: { name: "Weakened", desc: "Deals less damage until it fades." },
  status_fortify: { name: "Fortified", desc: "Takes less damage until it fades." },
  status_haste: { name: "Hastened", desc: "Acts faster until it fades." },
  status_regen: { name: "Warded", desc: "Heals each round until it fades." },
  status_taunt: { name: "Taunting", desc: "Draws single-target attacks away from the rest of the company." },

  area_sunken_aqueduct: { name: "The Sunken Aqueduct", desc: "A flooded channel under the old road, left to rot. Opens once the Tollkeeper stops collecting." },
  enemy_aqueduct_drowned: { name: "Drowned Warden-Thrall", desc: "Bound to guard the water long after drowning in it." },
  enemy_aqueduct_current: { name: "Riptide Current", desc: "A living pull of water that drags down whoever it reaches." },
  enemy_aqueduct_husk: { name: "Aqueduct Husk", desc: "Hollowed out by the damp, but still swinging." },

  dungeon_aqueduct_depths: { name: "Sunken Aqueduct Depths", desc: "A four-floor descent beneath the aqueduct, ending in its warden. Clear a floor to move to the next." },
  enemy_depths_broodling: { name: "Depths Broodling", desc: "Hatched in the dark, and quick to swarm anything that enters." },

  boss_drowned_warden: {
    name: "The Drowned Warden",
    desc: "A towering, waterlogged guardian. Strikes the weak, then the whole line, on a steady cycle.",
  },

  nav_roster: "Roster",
  nav_dungeon: "Dungeon",
  nav_crafting: "Crafting",

  action_recruit: "Recruit",
  action_assign_secondary: "Assign",
  action_save_loadout: "Save loadout",
  action_save_formation: "Save formation",
  action_select_area: "Select",
  action_start_dungeon: "Enter dungeon",
  action_settle_dungeon: "Check progress",
  action_stop_dungeon: "Stop and collect",
  action_craft: "Craft",
  action_reforge: "Reforge",
} as const;

type NameDesc = { name: string; desc: string };

const CLASS_COPY: Record<string, NameDesc> = {
  class_vanguard: COPY.class_vanguard,
  class_ranger: COPY.class_ranger,
  class_arcanist: COPY.class_arcanist,
  class_cleric: COPY.class_cleric,
  class_rogue: COPY.class_rogue,
  class_herald: COPY.class_herald,
};

export function classCopy(classId: string): NameDesc {
  return CLASS_COPY[classId] ?? { name: classId, desc: "" };
}

const SKILL_COPY: Record<string, NameDesc> = {
  strike: COPY.strike, bulwark_call: COPY.bulwark_call, shield_bash: COPY.shield_bash, thick_hide: COPY.thick_hide, last_stand: COPY.last_stand,
  smite: COPY.smite, mending_light: COPY.mending_light, sanctuary: COPY.sanctuary, devotion: COPY.devotion, vital_surge: COPY.vital_surge,
  quick_shot: COPY.quick_shot, aimed_shot: COPY.aimed_shot, volley: COPY.volley, hunters_focus: COPY.hunters_focus, momentum: COPY.momentum,
  puncture: COPY.puncture, backstab: COPY.backstab, flurry: COPY.flurry, opportunist: COPY.opportunist, evasion: COPY.evasion,
  arcane_bolt: COPY.arcane_bolt, firebolt: COPY.firebolt, meteor: COPY.meteor, overload: COPY.overload, arcane_reserve: COPY.arcane_reserve,
  rally_strike: COPY.rally_strike, war_hymn: COPY.war_hymn, discordant_verse: COPY.discordant_verse, encore: COPY.encore, battle_hymn: COPY.battle_hymn,
};

/** copy.md section 8.2's skillId copy binding — the engine's bare skillId (e.g. "strike") is the lookup key. */
export function skillCopy(skillId: string): NameDesc {
  return SKILL_COPY[skillId] ?? { name: skillId, desc: "" };
}

const STATUS_COPY: Record<string, NameDesc> = {
  status_burn: COPY.status_burn,
  status_weaken: COPY.status_weaken,
  status_fortify: COPY.status_fortify,
  status_haste: COPY.status_haste,
  status_regen: COPY.status_regen,
  status_taunt: COPY.status_taunt,
};

export function statusCopy(statusId: string): NameDesc {
  return STATUS_COPY[statusId] ?? { name: statusId, desc: "" };
}

const ENEMY_COPY: Record<string, NameDesc> = {
  enemy_road_brigand: COPY.enemy_road_brigand,
  enemy_road_wolf: COPY.enemy_road_wolf,
  enemy_road_cutpurse: COPY.enemy_road_cutpurse,
  boss_tollkeeper: COPY.boss_tollkeeper,
  enemy_aqueduct_drowned: COPY.enemy_aqueduct_drowned,
  enemy_aqueduct_current: COPY.enemy_aqueduct_current,
  enemy_aqueduct_husk: COPY.enemy_aqueduct_husk,
  enemy_depths_broodling: COPY.enemy_depths_broodling,
  boss_drowned_warden: COPY.boss_drowned_warden,
};

/** Falls back to the raw enemyId (stripped of combat2.ts's `#slotIndex` suffix) for an unrecognized ID. */
export function enemyCopy(enemyId: string): NameDesc {
  const base = enemyId.split("#")[0]!;
  return ENEMY_COPY[base] ?? { name: base, desc: "" };
}

const AREA_COPY: Record<string, NameDesc> = {
  area_old_road: COPY.area_old_road,
  area_sunken_aqueduct: COPY.area_sunken_aqueduct,
};

export function areaCopy(areaId: string): NameDesc {
  return AREA_COPY[areaId] ?? { name: areaId, desc: "" };
}

const DUNGEON_COPY: Record<string, NameDesc> = {
  dungeon_aqueduct_depths: COPY.dungeon_aqueduct_depths,
};

export function dungeonCopy(dungeonId: string): NameDesc {
  return DUNGEON_COPY[dungeonId] ?? { name: dungeonId, desc: "" };
}

const RARITY_LABEL: Record<string, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic" };
export function rarityLabel(rarityId: string): string {
  return RARITY_LABEL[rarityId] ?? rarityId;
}

const ITEM_COPY: Record<string, NameDesc> = {
  item_weapon_shortsword: COPY.item_weapon_shortsword,
  item_weapon_longspear: COPY.item_weapon_longspear,
  item_weapon_focus: COPY.item_weapon_focus,
  item_armor_leather: COPY.item_armor_leather,
  item_armor_plate: COPY.item_armor_plate,
  item_armor_robe: COPY.item_armor_robe,
  item_trinket_whetstone: COPY.item_trinket_whetstone,
  item_trinket_ironband: COPY.item_trinket_ironband,
  item_trinket_luckycoin: COPY.item_trinket_luckycoin,
};

export function itemCopy(definitionId: string): NameDesc {
  return ITEM_COPY[definitionId] ?? { name: definitionId, desc: "" };
}

const AFFIX_COPY: Record<string, NameDesc> = {
  affix_of_power: COPY.affix_of_power,
  affix_of_warding: COPY.affix_of_warding,
  affix_of_vigor: COPY.affix_of_vigor,
  affix_of_haste: COPY.affix_of_haste,
};

export function affixCopy(affixId: string): NameDesc {
  return AFFIX_COPY[affixId] ?? { name: affixId, desc: "" };
}

/** copy.md implementation note: "{base item name} {affix name}", extended for M2's multi-affix items: every rolled affix's name is appended in rolled order. */
export function composeItemName(definitionId: string, affixes: readonly { affixId: string; value?: number }[]): string {
  const base = itemCopy(definitionId).name;
  if (affixes.length === 0) return base;
  return `${base} ${affixes.map((a) => affixCopy(a.affixId).name).join(" ")}`;
}
