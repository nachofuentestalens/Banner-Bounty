// Structural ID metadata duplicated directly from design/game/classes.md and
// design/game/content.md's frozen tables — the 6 base classes, each class's
// skill kit, and which equipment slot each item definition belongs to. These
// are permanent IDs ("IDs here are permanent once referenced"), not computed
// game state, so literal duplication here is the same category of move as
// copy.ts's verbatim copy.md strings.
//
// This file intentionally does NOT duplicate any numeric stat/bonus table,
// XP curve, or stat formula from packages/game or packages/content: per
// design/studio/architecture.md, "apps/web: ... No client-authoritative
// loot, XP, time, stats or victory." Hero/item numeric stats are shown only
// when the server includes them in a response; apps/web never computes them.
import type { EquipmentSlot } from "./types.js";

export const BASE_CLASS_IDS: readonly string[] = ["class_vanguard", "class_cleric", "class_ranger", "class_rogue", "class_arcanist", "class_herald"];

/** content.md section 6.3 (M2-31): the one dungeon shipped in M2, with its unlock boss. No `/dungeons` listing endpoint exists yet — a single permanent ID is safe to duplicate here, same precedent as the item/class ID tables below. */
export const DUNGEON_IDS: readonly { dungeonId: string; unlockBossId: string }[] = [{ dungeonId: "dungeon_aqueduct_depths", unlockBossId: "boss_tollkeeper" }];

export interface SkillSlot {
  readonly skillId: string;
  readonly kind: "basic" | "active" | "passive";
  readonly unlockLevel: number;
}

/** classes.md section 5: one basic + 2 active + 2 passive per class, in unlock order. */
export const CLASS_SKILLS: Record<string, readonly SkillSlot[]> = {
  class_vanguard: [
    { skillId: "strike", kind: "basic", unlockLevel: 1 },
    { skillId: "bulwark_call", kind: "active", unlockLevel: 1 },
    { skillId: "shield_bash", kind: "active", unlockLevel: 5 },
    { skillId: "thick_hide", kind: "passive", unlockLevel: 1 },
    { skillId: "last_stand", kind: "passive", unlockLevel: 8 },
  ],
  class_cleric: [
    { skillId: "smite", kind: "basic", unlockLevel: 1 },
    { skillId: "mending_light", kind: "active", unlockLevel: 1 },
    { skillId: "sanctuary", kind: "active", unlockLevel: 5 },
    { skillId: "devotion", kind: "passive", unlockLevel: 1 },
    { skillId: "vital_surge", kind: "passive", unlockLevel: 8 },
  ],
  class_ranger: [
    { skillId: "quick_shot", kind: "basic", unlockLevel: 1 },
    { skillId: "aimed_shot", kind: "active", unlockLevel: 1 },
    { skillId: "volley", kind: "active", unlockLevel: 5 },
    { skillId: "hunters_focus", kind: "passive", unlockLevel: 1 },
    { skillId: "momentum", kind: "passive", unlockLevel: 8 },
  ],
  class_rogue: [
    { skillId: "puncture", kind: "basic", unlockLevel: 1 },
    { skillId: "backstab", kind: "active", unlockLevel: 1 },
    { skillId: "flurry", kind: "active", unlockLevel: 5 },
    { skillId: "opportunist", kind: "passive", unlockLevel: 1 },
    { skillId: "evasion", kind: "passive", unlockLevel: 8 },
  ],
  class_arcanist: [
    { skillId: "arcane_bolt", kind: "basic", unlockLevel: 1 },
    { skillId: "firebolt", kind: "active", unlockLevel: 1 },
    { skillId: "meteor", kind: "active", unlockLevel: 5 },
    { skillId: "overload", kind: "passive", unlockLevel: 1 },
    { skillId: "arcane_reserve", kind: "passive", unlockLevel: 8 },
  ],
  class_herald: [
    { skillId: "rally_strike", kind: "basic", unlockLevel: 1 },
    { skillId: "war_hymn", kind: "active", unlockLevel: 1 },
    { skillId: "discordant_verse", kind: "active", unlockLevel: 5 },
    { skillId: "encore", kind: "passive", unlockLevel: 1 },
    { skillId: "battle_hymn", kind: "passive", unlockLevel: 8 },
  ],
};

/** The union pool a hero may fill its loadout slots from at its current level: primary's, plus secondary's if assigned. */
export function unlockedSkillPool(primaryClassId: string, secondaryClassId: string | null, level: number, kind: "active" | "passive"): string[] {
  const fromClass = (classId: string) => (CLASS_SKILLS[classId] ?? []).filter((s) => s.kind === kind && s.unlockLevel <= level).map((s) => s.skillId);
  const ids = new Set<string>([...fromClass(primaryClassId), ...(secondaryClassId ? fromClass(secondaryClassId) : [])]);
  return [...ids];
}

const ITEM_SLOT: Record<string, EquipmentSlot> = {
  item_weapon_shortsword: "weapon",
  item_weapon_longspear: "weapon",
  item_weapon_focus: "weapon",
  item_armor_leather: "armor",
  item_armor_plate: "armor",
  item_armor_robe: "armor",
  item_trinket_whetstone: "trinket",
  item_trinket_ironband: "trinket",
  item_trinket_luckycoin: "trinket",
};

export const ITEM_DEFINITION_IDS: readonly string[] = Object.keys(ITEM_SLOT);

/** Falls back to "weapon" for an unrecognized definitionId rather than throwing, since this is UI-only metadata. */
export function itemSlot(definitionId: string): EquipmentSlot {
  return ITEM_SLOT[definitionId] ?? "weapon";
}
