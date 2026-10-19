// Reward generation (design/game/economy/baseline.md sections 2-6).

import { AFFIX_DEFINITIONS, ITEM_DEFINITIONS, type AffixId } from "@banner-and-bounty/content";
import { type RngState, belowThreshold, drawUint32, pickUniformIndex } from "./rng.js";

export interface ItemDropRoll {
  readonly definitionId: string;
  readonly affixId: AffixId | null;
}

export interface DropRollResult {
  readonly drop: ItemDropRoll | null;
  readonly nextRngState: RngState;
}

/**
 * Resolves one expedition cycle's drop roll (baseline.md section 4): d0
 * drop-occurs (25%), d1 base definition (1/9 each), d2 affix-occurs (1/3),
 * d3 which affix (1/3 each). d0 is always consumed even on no-drop; later
 * draws are skipped once an earlier branch short-circuits (section 8).
 */
export function rollExpeditionCycleDrop(state: RngState): DropRollResult {
  const d0 = drawUint32(state);
  if (!belowThreshold(d0.value, 1, 4)) {
    return { drop: null, nextRngState: d0.nextState };
  }

  const d1 = drawUint32(d0.nextState);
  const definitionId = ITEM_DEFINITIONS[pickUniformIndex(d1.value, ITEM_DEFINITIONS.length)]!.definitionId;

  const d2 = drawUint32(d1.nextState);
  if (!belowThreshold(d2.value, 1, 3)) {
    return { drop: { definitionId, affixId: null }, nextRngState: d2.nextState };
  }

  const d3 = drawUint32(d2.nextState);
  const affixId = AFFIX_DEFINITIONS[pickUniformIndex(d3.value, AFFIX_DEFINITIONS.length)]!.affixId;
  return { drop: { definitionId, affixId }, nextRngState: d3.nextState };
}

/**
 * Resolves the Tollkeeper's guaranteed first-clear drop (baseline.md
 * section 3): the drop-occurs and affix-occurs branches are forced true, so
 * only the definition (d1) and affix (d3) draws are consumed — there is no
 * chance of "no drop" or "no affix" to roll for, so no d0/d2 draw occurs.
 */
export function rollBossGuaranteedDrop(state: RngState): DropRollResult {
  const d1 = drawUint32(state);
  const definitionId = ITEM_DEFINITIONS[pickUniformIndex(d1.value, ITEM_DEFINITIONS.length)]!.definitionId;

  const d3 = drawUint32(d1.nextState);
  const affixId = AFFIX_DEFINITIONS[pickUniformIndex(d3.value, AFFIX_DEFINITIONS.length)]!.affixId;

  return { drop: { definitionId, affixId }, nextRngState: d3.nextState };
}

/** Gold value a drop converts to when the account's unequipped inventory is full (baseline.md section 6). */
export function overflowGoldValue(hasAffix: boolean): number {
  return hasAffix ? 9 : 5;
}

export const INVENTORY_CAP = 100;

export interface CycleRewardResult {
  readonly xpPerParticipant: number;
  readonly gold: number;
  readonly itemInstance: ItemDropRoll | null;
  /** The rolled drop that was converted to gold because the inventory was full, if any. */
  readonly overflowConverted: ItemDropRoll | null;
  readonly unequippedCountAfter: number;
  readonly nextRngState: RngState;
}

/**
 * Resolves one won Old Road cycle's full reward transaction (baseline.md
 * section 2), including the overflow-conversion check (section 6) against
 * the caller-supplied running unequipped-instance count. The caller (M1-08)
 * is responsible for sourcing `unequippedCountBefore` from the account's
 * real state and for calling this once per cycle, in cycle order, within a
 * multi-cycle settlement batch so the running count advances correctly.
 */
export function resolveExpeditionCycleReward(rngState: RngState, unequippedCountBefore: number): CycleRewardResult {
  const { drop, nextRngState } = rollExpeditionCycleDrop(rngState);

  let gold = 10;
  let itemInstance: ItemDropRoll | null = null;
  let overflowConverted: ItemDropRoll | null = null;
  let unequippedCountAfter = unequippedCountBefore;

  if (drop) {
    if (unequippedCountBefore >= INVENTORY_CAP) {
      gold += overflowGoldValue(drop.affixId !== null);
      overflowConverted = drop;
    } else {
      itemInstance = drop;
      unequippedCountAfter = unequippedCountBefore + 1;
    }
  }

  return { xpPerParticipant: 4, gold, itemInstance, overflowConverted, unequippedCountAfter, nextRngState };
}

export interface BossRewardResult {
  readonly xpPerParticipant: number;
  readonly gold: number;
  readonly itemInstance: ItemDropRoll | null;
  readonly overflowConverted: ItemDropRoll | null;
  readonly unequippedCountAfter: number;
  readonly nextRngState: RngState;
}

/**
 * Resolves the Tollkeeper's one-time first-clear reward (baseline.md
 * section 3). The caller (M1-08) must only invoke this when
 * `BossClaim.claimedAt` is being transitioned from null in the same
 * transaction — this function always grants the full reward and has no
 * notion of "already claimed" (that is server-owned state, not game-pure).
 */
export function resolveBossFirstClearReward(rngState: RngState, unequippedCountBefore: number): BossRewardResult {
  const { drop, nextRngState } = rollBossGuaranteedDrop(rngState);

  let gold = 150;
  let itemInstance: ItemDropRoll | null = drop;
  let overflowConverted: ItemDropRoll | null = null;
  let unequippedCountAfter = unequippedCountBefore;

  if (unequippedCountBefore >= INVENTORY_CAP) {
    gold += overflowGoldValue(true);
    overflowConverted = drop;
    itemInstance = null;
  } else {
    unequippedCountAfter = unequippedCountBefore + 1;
  }

  return { xpPerParticipant: 40, gold, itemInstance, overflowConverted, unequippedCountAfter, nextRngState };
}
