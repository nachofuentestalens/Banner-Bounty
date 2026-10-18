// Structural ID metadata duplicated directly from design/game/content.md's
// frozen tables — which class owns which two specializations, and which
// equipment slot each item definition belongs to. These are permanent IDs
// ("IDs here are permanent once referenced", content.md), not computed game
// state, so literal duplication here is the same category of move as
// copy.ts's verbatim copy.md strings.
//
// This file intentionally does NOT duplicate any numeric stat/bonus table,
// XP curve, or stat formula from packages/game or packages/content: per
// design/studio/architecture.md, "apps/web: ... No client-authoritative
// loot, XP, time, stats or victory." Hero/item numeric stats are shown only
// when the server includes them in a response; apps/web never computes them.
import type { EquipmentSlot } from "./types.js";

export const CLASS_SPECIALIZATIONS: Record<string, readonly [string, string]> = {
  class_vanguard: ["spec_guardian", "spec_berserker"],
  class_ranger: ["spec_marksman", "spec_pathfinder"],
  class_arcanist: ["spec_pyromancer", "spec_warden"],
};

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

/** Falls back to "weapon" for an unrecognized definitionId rather than throwing, since this is UI-only metadata. */
export function itemSlot(definitionId: string): EquipmentSlot {
  return ITEM_SLOT[definitionId] ?? "weapon";
}
