// Gear rarity/affix/crafting/reward tables (design/game/economy/gear.md
// sections 2-5). All numbers are copied verbatim from gear.md's tables.

import type { EquipmentSlot } from "../index.js";

export type RarityId = "common" | "uncommon" | "rare" | "epic";
export const RARITY_IDS: readonly RarityId[] = ["common", "uncommon", "rare", "epic"];
/** Cumulative-weight order for rarity rolls (gear.md section 6: "C/U/R/E order"). */
export type RollableRarityId = "uncommon" | "rare" | "epic";

export interface RarityDefinition {
  readonly rarityId: RarityId;
  readonly affixCount: number;
  readonly overflowGold: number;
}

export const RARITY_DEFINITIONS: readonly RarityDefinition[] = [
  { rarityId: "common", affixCount: 0, overflowGold: 5 },
  { rarityId: "uncommon", affixCount: 1, overflowGold: 9 },
  { rarityId: "rare", affixCount: 2, overflowGold: 18 },
  { rarityId: "epic", affixCount: 3, overflowGold: 36 },
];

const RARITY_BY_ID = new Map(RARITY_DEFINITIONS.map((r) => [r.rarityId, r] as const));

export function getRarityDefinition(rarityId: string): RarityDefinition {
  const found = RARITY_BY_ID.get(rarityId as RarityId);
  if (!found) throw new Error(`Unknown rarityId: ${rarityId}`);
  return found;
}

export type AffixIdV2 = "affix_of_power" | "affix_of_warding" | "affix_of_vigor" | "affix_of_haste";
export type StatKey = "hp" | "atk" | "def" | "spd";

export interface AffixDefinitionV2 {
  readonly affixId: AffixIdV2;
  readonly display: string;
  readonly stat: StatKey;
}

export const AFFIX_DEFINITIONS_V2: readonly AffixDefinitionV2[] = [
  { affixId: "affix_of_power", display: "of Power", stat: "atk" },
  { affixId: "affix_of_warding", display: "of Warding", stat: "def" },
  { affixId: "affix_of_vigor", display: "of Vigor", stat: "hp" },
  { affixId: "affix_of_haste", display: "of Haste", stat: "spd" },
];

const AFFIX_BY_ID = new Map(AFFIX_DEFINITIONS_V2.map((a) => [a.affixId, a] as const));

export function getAffixDefinitionV2(affixId: string): AffixDefinitionV2 {
  const found = AFFIX_BY_ID.get(affixId as AffixIdV2);
  if (!found) throw new Error(`Unknown affixId (v2): ${affixId}`);
  return found;
}

/** Ordered eligible affix pool per slot (gear.md section 2 — order is selection order, stable for reforging). */
export const SLOT_AFFIX_POOL: Readonly<Record<EquipmentSlot, readonly AffixIdV2[]>> = {
  weapon: ["affix_of_power", "affix_of_warding", "affix_of_vigor"],
  armor: ["affix_of_power", "affix_of_warding", "affix_of_vigor"],
  trinket: ["affix_of_power", "affix_of_warding", "affix_of_vigor", "affix_of_haste"],
};

export type AffixValueRange = readonly [number, number]; // inclusive

type RangeTable = Readonly<Record<EquipmentSlot, Partial<Readonly<Record<AffixIdV2, Readonly<Record<RollableRarityId, AffixValueRange>>>>>>>;

export const AFFIX_VALUE_RANGES: RangeTable = {
  weapon: {
    affix_of_power: { uncommon: [1, 2], rare: [2, 3], epic: [3, 4] },
    affix_of_warding: { uncommon: [1, 2], rare: [2, 3], epic: [2, 4] },
    affix_of_vigor: { uncommon: [3, 6], rare: [6, 9], epic: [9, 12] },
  },
  armor: {
    affix_of_power: { uncommon: [1, 2], rare: [2, 3], epic: [2, 4] },
    affix_of_warding: { uncommon: [1, 2], rare: [2, 3], epic: [3, 4] },
    affix_of_vigor: { uncommon: [3, 6], rare: [6, 10], epic: [10, 14] },
  },
  trinket: {
    affix_of_power: { uncommon: [1, 2], rare: [2, 3], epic: [3, 4] },
    affix_of_warding: { uncommon: [1, 2], rare: [2, 3], epic: [2, 4] },
    affix_of_vigor: { uncommon: [3, 6], rare: [6, 9], epic: [9, 12] },
    affix_of_haste: { uncommon: [1, 1], rare: [1, 2], epic: [1, 2] },
  },
};

export function getAffixValueRange(slot: EquipmentSlot, affixId: AffixIdV2, rarity: RollableRarityId): AffixValueRange {
  const range = AFFIX_VALUE_RANGES[slot][affixId]?.[rarity];
  if (!range) throw new Error(`No value range for ${affixId} in slot ${slot} at rarity ${rarity}`);
  return range;
}

export type RecipeId = "craft_uncommon" | "craft_rare" | "craft_epic" | "reforge_uncommon" | "reforge_rare" | "reforge_epic";

export interface RecipeDefinition {
  readonly recipeId: RecipeId;
  readonly gold: number;
  readonly scrap: number;
  readonly sigil: number;
  readonly core: number;
}

export const RECIPE_DEFINITIONS: readonly RecipeDefinition[] = [
  { recipeId: "craft_uncommon", gold: 100, scrap: 4, sigil: 0, core: 0 },
  { recipeId: "craft_rare", gold: 300, scrap: 12, sigil: 2, core: 0 },
  { recipeId: "craft_epic", gold: 900, scrap: 60, sigil: 12, core: 8 },
  { recipeId: "reforge_uncommon", gold: 50, scrap: 2, sigil: 0, core: 0 },
  { recipeId: "reforge_rare", gold: 100, scrap: 2, sigil: 1, core: 0 },
  { recipeId: "reforge_epic", gold: 200, scrap: 4, sigil: 2, core: 0 },
];

const RECIPE_BY_ID = new Map(RECIPE_DEFINITIONS.map((r) => [r.recipeId, r] as const));

export function getRecipeDefinition(recipeId: string): RecipeDefinition {
  const found = RECIPE_BY_ID.get(recipeId as RecipeId);
  if (!found) throw new Error(`Unknown recipeId: ${recipeId}`);
  return found;
}

export function craftRecipeForRarity(rarity: RollableRarityId): RecipeId {
  return `craft_${rarity}` as RecipeId;
}

export function reforgeRecipeForRarity(rarity: RollableRarityId): RecipeId {
  return `reforge_${rarity}` as RecipeId;
}

export interface MaterialCost {
  readonly scrap: number;
  readonly sigil: number;
  readonly core: number;
}

export interface RewardProfile {
  readonly profileId: string;
  readonly xp: number;
  readonly gold: number;
  readonly itemProbabilityPercent: number;
  /** [common, uncommon, rare, epic] cumulative-order weights, sum 100 (gear.md section 6). */
  readonly rarityWeights: readonly [number, number, number, number];
  readonly materials: MaterialCost;
}

export const REWARD_PROFILES: Readonly<Record<string, RewardProfile>> = {
  reward_area_1: { profileId: "reward_area_1", xp: 4, gold: 10, itemProbabilityPercent: 25, rarityWeights: [60, 35, 5, 0], materials: { scrap: 0, sigil: 0, core: 0 } },
  reward_area_2: { profileId: "reward_area_2", xp: 5, gold: 12, itemProbabilityPercent: 25, rarityWeights: [45, 45, 10, 0], materials: { scrap: 0, sigil: 0, core: 0 } },
  reward_area_3: { profileId: "reward_area_3", xp: 6, gold: 14, itemProbabilityPercent: 25, rarityWeights: [30, 50, 20, 0], materials: { scrap: 0, sigil: 0, core: 0 } },
  dungeon_1_ordinary: { profileId: "dungeon_1_ordinary", xp: 8, gold: 20, itemProbabilityPercent: 25, rarityWeights: [40, 50, 10, 0], materials: { scrap: 2, sigil: 0, core: 0 } },
  dungeon_1_boss: { profileId: "dungeon_1_boss", xp: 16, gold: 40, itemProbabilityPercent: 100, rarityWeights: [0, 70, 28, 2], materials: { scrap: 4, sigil: 2, core: 1 } },
  dungeon_2_ordinary: { profileId: "dungeon_2_ordinary", xp: 10, gold: 25, itemProbabilityPercent: 25, rarityWeights: [20, 55, 25, 0], materials: { scrap: 3, sigil: 0, core: 0 } },
  dungeon_2_boss: { profileId: "dungeon_2_boss", xp: 20, gold: 50, itemProbabilityPercent: 100, rarityWeights: [0, 45, 50, 5], materials: { scrap: 6, sigil: 3, core: 2 } },
};

export function getRewardProfile(profileId: string): RewardProfile {
  const found = REWARD_PROFILES[profileId];
  if (!found) throw new Error(`Unknown reward profileId: ${profileId}`);
  return found;
}

/** boss_tollkeeper's one-time profile and the default for any M2-31 standalone boss first-clear (gear.md section 3). */
export const STANDALONE_BOSS_FIRST_CLEAR_REWARD = {
  xp: 40,
  gold: 150,
} as const;

export const MATERIAL_IDS = ["material_scrap", "material_sigil", "material_core"] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];
