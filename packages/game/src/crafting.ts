// Gear rolls, crafting and reforging (design/game/economy/gear.md sections
// 2, 5, 6). Pure: callers (apps/server) supply the live unequipped-item
// count and persisted RNG state; nothing here touches storage or a clock.

import {
  type AffixIdV2,
  type EquipmentSlot,
  type RarityId,
  type RewardProfile,
  type RollableRarityId,
  ITEM_DEFINITIONS,
  SLOT_AFFIX_POOL,
  getAffixValueRange,
  getItemDefinition,
  getRarityDefinition,
} from "@banner-and-bounty/content";
import { type RngState, drawUniformInt } from "./rng.js";

export interface AffixRoll {
  readonly affixId: AffixIdV2;
  readonly value: number;
}

export interface ItemRoll {
  readonly definitionId: string;
  readonly rarityId: RarityId;
  readonly affixes: readonly AffixRoll[];
}

/** gear.md section 2: pick `count` distinct affix IDs from `slot`'s ordered pool, uniformly without replacement — output order is selection order (stable for reforge). */
function rollAffixIds(state: RngState, slot: EquipmentSlot, count: number): { ids: AffixIdV2[]; nextState: RngState } {
  let pool = [...SLOT_AFFIX_POOL[slot]];
  let current = state;
  const ids: AffixIdV2[] = [];
  for (let i = 0; i < count; i++) {
    const draw = drawUniformInt(current, pool.length);
    ids.push(pool[draw.value]!);
    pool = pool.filter((_, idx) => idx !== draw.value);
    current = draw.nextState;
  }
  return { ids, nextState: current };
}

function rollAffixValue(state: RngState, slot: EquipmentSlot, affixId: AffixIdV2, rarity: RollableRarityId): { value: number; nextState: RngState } {
  const [lo, hi] = getAffixValueRange(slot, affixId, rarity);
  const draw = drawUniformInt(state, hi - lo + 1);
  return { value: lo + draw.value, nextState: draw.nextState };
}

/** Rolls `rarityDef.affixCount` distinct affixes (IDs + values) for `slot` at `rarity`. Common (count 0) draws nothing. */
function rollAffixSet(state: RngState, slot: EquipmentSlot, rarity: RarityId): { affixes: AffixRoll[]; nextState: RngState } {
  const rarityDef = getRarityDefinition(rarity);
  if (rarityDef.affixCount === 0) return { affixes: [], nextState: state };
  const rollable = rarity as RollableRarityId;
  const idsResult = rollAffixIds(state, slot, rarityDef.affixCount);
  let current = idsResult.nextState;
  const affixes: AffixRoll[] = [];
  for (const affixId of idsResult.ids) {
    const valueResult = rollAffixValue(current, slot, affixId, rollable);
    affixes.push({ affixId, value: valueResult.value });
    current = valueResult.nextState;
  }
  return { affixes, nextState: current };
}

function rollDefinitionId(state: RngState): { definitionId: string; nextState: RngState } {
  const draw = drawUniformInt(state, ITEM_DEFINITIONS.length);
  return { definitionId: ITEM_DEFINITIONS[draw.value]!.definitionId, nextState: draw.nextState };
}

/** gear.md section 6: rarity rolls use cumulative C/U/R/E weights (sum 100), in that order. */
function rollRarity(state: RngState, weights: RewardProfile["rarityWeights"]): { rarityId: RarityId; nextState: RngState } {
  const draw = drawUniformInt(state, 100);
  const [c, u, r] = weights;
  let rarityId: RarityId;
  if (draw.value < c) rarityId = "common";
  else if (draw.value < c + u) rarityId = "uncommon";
  else if (draw.value < c + u + r) rarityId = "rare";
  else rarityId = "epic";
  return { rarityId, nextState: draw.nextState };
}

export const INVENTORY_CAP_V2 = 100;

export interface AreaOrDungeonRewardResult {
  readonly xp: number;
  readonly gold: number;
  readonly materials: { readonly scrap: number; readonly sigil: number; readonly core: number };
  readonly itemInstance: ItemRoll | null;
  readonly overflowConverted: ItemRoll | null;
  readonly unequippedCountAfter: number;
  readonly nextRngState: RngState;
}

/**
 * gear.md sections 3/4/6: one won area cycle or dungeon floor's full reward.
 * Draw order: drop chance (skipped if itemProbabilityPercent is 100,
 * "guaranteed drops omit chance"), then definition, then rarity, then affix
 * IDs/values in that order (skipped entirely if the roll is common).
 */
export function resolveAreaOrDungeonReward(rngState: RngState, profile: RewardProfile, unequippedCountBefore: number): AreaOrDungeonRewardResult {
  let current = rngState;
  let dropped = profile.itemProbabilityPercent >= 100;
  if (!dropped) {
    const chanceDraw = drawUniformInt(current, 100);
    current = chanceDraw.nextState;
    dropped = chanceDraw.value < profile.itemProbabilityPercent;
  }

  if (!dropped) {
    return {
      xp: profile.xp,
      gold: profile.gold,
      materials: profile.materials,
      itemInstance: null,
      overflowConverted: null,
      unequippedCountAfter: unequippedCountBefore,
      nextRngState: current,
    };
  }

  const defResult = rollDefinitionId(current);
  current = defResult.nextState;
  const rarityResult = rollRarity(current, profile.rarityWeights);
  current = rarityResult.nextState;
  const slot = getItemDefinition(defResult.definitionId).slot;
  const affixResult = rollAffixSet(current, slot, rarityResult.rarityId);
  current = affixResult.nextState;

  const drop: ItemRoll = { definitionId: defResult.definitionId, rarityId: rarityResult.rarityId, affixes: affixResult.affixes };

  if (unequippedCountBefore >= INVENTORY_CAP_V2) {
    return {
      xp: profile.xp,
      gold: profile.gold + getRarityDefinition(rarityResult.rarityId).overflowGold,
      materials: profile.materials,
      itemInstance: null,
      overflowConverted: drop,
      unequippedCountAfter: unequippedCountBefore,
      nextRngState: current,
    };
  }

  return {
    xp: profile.xp,
    gold: profile.gold,
    materials: profile.materials,
    itemInstance: drop,
    overflowConverted: null,
    unequippedCountAfter: unequippedCountBefore + 1,
    nextRngState: current,
  };
}

export interface StandaloneBossRewardResult {
  readonly xp: number;
  readonly gold: number;
  readonly itemInstance: ItemRoll | null;
  readonly overflowConverted: ItemRoll | null;
  readonly unequippedCountAfter: number;
  readonly nextRngState: RngState;
}

/**
 * gear.md section 3: a standalone boss's one-time first-clear reward (150
 * gold, 40 XP, one guaranteed uncommon item) — the chance and rarity draws
 * are both omitted (forced "dropped" at a forced rarity), only definition
 * and affix IDs/values roll.
 */
export function resolveStandaloneBossReward(rngState: RngState, xp: number, gold: number, unequippedCountBefore: number): StandaloneBossRewardResult {
  const defResult = rollDefinitionId(rngState);
  const slot = getItemDefinition(defResult.definitionId).slot;
  const affixResult = rollAffixSet(defResult.nextState, slot, "uncommon");
  const drop: ItemRoll = { definitionId: defResult.definitionId, rarityId: "uncommon", affixes: affixResult.affixes };

  if (unequippedCountBefore >= INVENTORY_CAP_V2) {
    return {
      xp,
      gold: gold + getRarityDefinition("uncommon").overflowGold,
      itemInstance: null,
      overflowConverted: drop,
      unequippedCountAfter: unequippedCountBefore,
      nextRngState: affixResult.nextState,
    };
  }
  return {
    xp,
    gold,
    itemInstance: drop,
    overflowConverted: null,
    unequippedCountAfter: unequippedCountBefore + 1,
    nextRngState: affixResult.nextState,
  };
}

/**
 * gear.md section 5: crafting a chosen definition at a chosen rarity.
 * Definition and rarity are both chosen by the request, not rolled — only
 * affix IDs/values draw.
 */
export function resolveCraft(rngState: RngState, definitionId: string, rarity: RollableRarityId): { item: ItemRoll; nextRngState: RngState } {
  const slot = getItemDefinition(definitionId).slot;
  const affixResult = rollAffixSet(rngState, slot, rarity);
  return { item: { definitionId, rarityId: rarity, affixes: affixResult.affixes }, nextRngState: affixResult.nextState };
}

export interface ReforgeInputAffix {
  readonly affixId: AffixIdV2;
  readonly value: number;
}

/**
 * gear.md section 5's exact reforge algorithm: the eligible ID pool for the
 * item's slot excludes IDs already present on other (untouched) affixes;
 * for the targeted slot's own current ID, its current value is excluded
 * from its own range (dropping the ID entirely if no alternative value
 * remains); pick an eligible ID uniformly, then a remaining value uniformly.
 */
export function resolveReforge(
  rngState: RngState,
  slot: EquipmentSlot,
  rarity: RollableRarityId,
  affixes: readonly ReforgeInputAffix[],
  affixIndex: number,
): { affixes: AffixRoll[]; nextRngState: RngState } {
  const current = affixes[affixIndex];
  if (!current) throw new Error(`reforge: affixIndex ${affixIndex} out of range`);
  const untouchedIds = new Set(affixes.filter((_, i) => i !== affixIndex).map((a) => a.affixId));

  const candidates: { id: AffixIdV2; values: number[] }[] = [];
  for (const id of SLOT_AFFIX_POOL[slot]) {
    if (untouchedIds.has(id)) continue;
    const [lo, hi] = getAffixValueRange(slot, id, rarity);
    const values: number[] = [];
    for (let v = lo; v <= hi; v++) if (id !== current.affixId || v !== current.value) values.push(v);
    if (values.length > 0) candidates.push({ id, values });
  }
  if (candidates.length === 0) throw new Error(`reforge: no eligible replacement for slot ${slot} affix ${current.affixId}`);

  const idDraw = drawUniformInt(rngState, candidates.length);
  const chosen = candidates[idDraw.value]!;
  const valueDraw = drawUniformInt(idDraw.nextState, chosen.values.length);
  const replacement: AffixRoll = { affixId: chosen.id, value: chosen.values[valueDraw.value]! };

  const nextAffixes = affixes.map((a, i) => (i === affixIndex ? replacement : a));
  return { affixes: nextAffixes, nextRngState: valueDraw.nextState };
}
