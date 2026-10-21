// Combat-v2 expedition cycle batching (contracts.md's Offline settlement
// algorithm, M2-25 addition's note that expedition/settle keeps the M1
// algorithm's window math unchanged). Mirrors dungeon.ts's per-unit batch
// loop structure, but an expedition repeats the same area roster indefinitely
// instead of advancing through content-defined floors.

import { getAreaDefinition, getRewardProfile } from "@banner-and-bounty/content";
import { type BattleResultV2, simulateBattleV2 } from "./combat2.js";
import { type ItemRoll, resolveAreaOrDungeonReward } from "./crafting.js";
import { buildEnemyCombatants } from "./encounters2.js";
import { type PartyMemberInputV2, toHeroCombatantsV2 } from "./party2.js";
import { applyXpGain, type LevelState } from "./xp.js";
import { type RngState } from "./rng.js";

export const CYCLE_LENGTH_MS_V2 = 60_000;
export const OFFLINE_CAP_MS_V2 = 28_800_000;
export const MAX_CYCLES_PER_SETTLEMENT_V2 = 480;
export const RECENT_CYCLE_LOG_LIMIT_V2 = 10;

export interface SettlementWindowV2 {
  readonly elapsedMs: number;
  readonly cappedMs: number;
  readonly discardedMs: number;
  readonly creditedCycles: number;
  readonly nextCheckpointMs: number;
}

/** Identical window math to the M1 algorithm (expedition.ts); unchanged by combat v2. */
export function computeSettlementWindowV2(checkpointMs: number, nowMs: number): SettlementWindowV2 {
  const elapsedMs = Math.max(0, nowMs - checkpointMs);
  const cappedMs = Math.min(elapsedMs, OFFLINE_CAP_MS_V2);
  const discardedMs = elapsedMs - cappedMs;
  const creditedCycles = Math.min(Math.floor(cappedMs / CYCLE_LENGTH_MS_V2), MAX_CYCLES_PER_SETTLEMENT_V2);
  const nextCheckpointMs = checkpointMs + discardedMs + creditedCycles * CYCLE_LENGTH_MS_V2;
  return { elapsedMs, cappedMs, discardedMs, creditedCycles, nextCheckpointMs };
}

/** Derives each cycle's independent combat rngSeed, same separation rationale as dungeon.ts's combatSeedForFloor. */
function combatSeedForCycle(baseSeed: number, cycleIndex: number): number {
  let x = (baseSeed + cycleIndex * 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0xc2b2ae35) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

export interface CycleLogEntryV2 {
  readonly cycle: number;
  readonly result: "win" | "loss" | "draw";
  readonly rounds: number;
  readonly gold: number;
  readonly drop: ItemRoll | null;
  readonly converted: boolean;
}

export interface CycleBatchInputV2 {
  readonly areaId: string;
  readonly enemyIds: readonly string[];
  readonly frozenParty: readonly PartyMemberInputV2[];
  readonly liveLevels: Readonly<Record<string, LevelState>>;
  readonly combatSeedBase: number;
  readonly rngState: RngState;
  readonly unequippedCount: number;
  readonly cyclesCompletedBefore: number;
  readonly cycles: number;
}

export interface CycleBatchResultV2 {
  readonly latestBattle: BattleResultV2 | null;
  readonly wins: number;
  readonly losses: number;
  readonly xpPerParticipant: number;
  readonly gold: number;
  readonly materials: { readonly scrap: number; readonly sigil: number; readonly core: number };
  readonly items: readonly ItemRoll[];
  readonly overflowConvertedCount: number;
  readonly overflowConvertedGold: number;
  readonly liveLevels: Readonly<Record<string, LevelState>>;
  readonly rngState: RngState;
  readonly unequippedCount: number;
  readonly recentCycles: readonly CycleLogEntryV2[];
}

/** Simulates `cycles` whole area cycles against the area's reward profile, in order. A lost cycle grants no reward and draws no reward RNG. */
export function simulateExpeditionCyclesV2(input: CycleBatchInputV2): CycleBatchResultV2 {
  const area = getAreaDefinition(input.areaId);
  const profile = getRewardProfile(area.rewardProfileId);
  const heroes = toHeroCombatantsV2(input.frozenParty);
  const levels: Record<string, LevelState> = { ...input.liveLevels };

  let wins = 0;
  let losses = 0;
  let xpPerParticipant = 0;
  let gold = 0;
  let materials = { scrap: 0, sigil: 0, core: 0 };
  let overflowConvertedCount = 0;
  let overflowConvertedGold = 0;
  let rngState = input.rngState;
  let unequippedCount = input.unequippedCount;
  const items: ItemRoll[] = [];
  const recentCycles: CycleLogEntryV2[] = [];
  let latestBattle: BattleResultV2 | null = null;

  for (let i = 0; i < input.cycles; i++) {
    const enemies = buildEnemyCombatants(input.enemyIds);
    const battle = simulateBattleV2(heroes, enemies, "pve", combatSeedForCycle(input.combatSeedBase, input.cyclesCompletedBefore + i));
    latestBattle = battle;
    const cycle = input.cyclesCompletedBefore + i + 1;
    let entry: CycleLogEntryV2;

    if (battle.result === "win") {
      wins += 1;
      const reward = resolveAreaOrDungeonReward(rngState, profile, unequippedCount);
      rngState = reward.nextRngState;
      xpPerParticipant += reward.xp;
      for (const hero of input.frozenParty) {
        levels[hero.heroId] = applyXpGain(levels[hero.heroId]!, reward.xp);
      }
      gold += reward.gold;
      materials = { scrap: materials.scrap + reward.materials.scrap, sigil: materials.sigil + reward.materials.sigil, core: materials.core + reward.materials.core };
      if (reward.itemInstance) items.push(reward.itemInstance);
      if (reward.overflowConverted) {
        overflowConvertedCount += 1;
        overflowConvertedGold += reward.gold - profile.gold;
      }
      unequippedCount = reward.unequippedCountAfter;
      entry = { cycle, result: "win", rounds: battle.rounds, gold: reward.gold, drop: reward.itemInstance ?? reward.overflowConverted, converted: reward.overflowConverted !== null };
    } else {
      losses += 1;
      entry = { cycle, result: battle.result, rounds: battle.rounds, gold: 0, drop: null, converted: false };
    }

    recentCycles.push(entry);
    if (recentCycles.length > RECENT_CYCLE_LOG_LIMIT_V2) recentCycles.shift();
  }

  return {
    latestBattle,
    wins,
    losses,
    xpPerParticipant,
    gold,
    materials,
    items,
    overflowConvertedCount,
    overflowConvertedGold,
    liveLevels: levels,
    rngState,
    unequippedCount,
    recentCycles,
  };
}
