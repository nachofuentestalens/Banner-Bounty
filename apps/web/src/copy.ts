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
} as const;

type NameDesc = { name: string; desc: string };

const SPEC_COPY: Record<string, NameDesc> = {
  spec_guardian: COPY.class_vanguard_spec_guardian,
  spec_berserker: COPY.class_vanguard_spec_berserker,
  spec_marksman: COPY.class_ranger_spec_marksman,
  spec_pathfinder: COPY.class_ranger_spec_pathfinder,
  spec_pyromancer: COPY.class_arcanist_spec_pyromancer,
  spec_warden: COPY.class_arcanist_spec_warden,
};

export function specializationCopy(specializationId: string): NameDesc {
  return SPEC_COPY[specializationId] ?? { name: specializationId, desc: "" };
}

const CLASS_COPY: Record<string, NameDesc> = {
  class_vanguard: COPY.class_vanguard,
  class_ranger: COPY.class_ranger,
  class_arcanist: COPY.class_arcanist,
};

export function classCopy(classId: string): NameDesc {
  return CLASS_COPY[classId] ?? { name: classId, desc: "" };
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
};

export function affixCopy(affixId: string): NameDesc {
  return AFFIX_COPY[affixId] ?? { name: affixId, desc: "" };
}

/** copy.md implementation note: "{base item name} {affix name}", e.g. "Shortsword of Power". */
export function composeItemName(definitionId: string, affixId: string | null): string {
  const base = itemCopy(definitionId).name;
  if (!affixId) return base;
  return `${base} ${affixCopy(affixId).name}`;
}
