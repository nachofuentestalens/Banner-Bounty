// Offline expedition settlement (design/studio/contracts.md "Offline
// settlement algorithm"; design/game/economy/baseline.md sections 2, 6).
// Pure: the caller supplies checkpoint/now instants, the frozen party, live
// hero levels, the persisted rngState and the current unequipped count.

import { OLD_ROAD_ENEMIES, type ClassId, type SpecializationId } from "@banner-and-bounty/content";
import { type BattleResultKind, type EnemyCombatantInput, type HeroCombatantInput, simulateBattle } from "./combat.js";
import { type RngState } from "./rng.js";
import { type ItemDropRoll, overflowGoldValue, resolveExpeditionCycleReward } from "./rewards.js";
import { type HeroLoadoutInput, computePartyEffectiveStats, effectiveSpecialization } from "./stats.js";
import { type LevelState, applyXpGain } from "./xp.js";

export const CYCLE_LENGTH_MS = 60_000;
export const OFFLINE_CAP_MS = 28_800_000;
export const MAX_CYCLES_PER_SETTLEMENT = 480;
/** Bounded per-settlement log: totals cover every cycle, entries only the most recent ones. */
export const RECENT_CYCLE_LOG_LIMIT = 10;

export interface SettlementWindow {
  readonly elapsedMs: number;
  readonly cappedMs: number;
  readonly discardedMs: number;
  readonly creditedCycles: number;
  readonly nextCheckpointMs: number;
}

/**
 * contracts.md offline algorithm. Negative elapsed (clock rollback) clamps
 * to zero. Time beyond the 8-hour cap is discarded from the *oldest* end of
 * the window, so the checkpoint skips it: `checkpoint + discarded +
 * credited * 60s`. This is what makes worked examples 5/6 hold (a second
 * settle right after a capped one sees elapsed 0, never the discarded 2h);
 * when nothing is discarded it reduces to the formula line
 * `checkpoint + credited * 60s`, keeping the sub-cycle remainder for later.
 */
export function computeSettlementWindow(checkpointMs: number, nowMs: number): SettlementWindow {
  const elapsedMs = Math.max(0, nowMs - checkpointMs);
  const cappedMs = Math.min(elapsedMs, OFFLINE_CAP_MS);
  const discardedMs = elapsedMs - cappedMs;
  const creditedCycles = Math.min(Math.floor(cappedMs / CYCLE_LENGTH_MS), MAX_CYCLES_PER_SETTLEMENT);
  const nextCheckpointMs = checkpointMs + discardedMs + creditedCycles * CYCLE_LENGTH_MS;
  return { elapsedMs, cappedMs, discardedMs, creditedCycles, nextCheckpointMs };
}

/** One hero of a party in front-to-back order, with the gear that feeds combat. */
export interface PartyMemberInput extends HeroLoadoutInput {
  readonly heroId: string;
}

export function toHeroCombatants(party: readonly PartyMemberInput[]): HeroCombatantInput[] {
  const stats = computePartyEffectiveStats(party);
  return party.map((hero, position) => ({
    id: hero.heroId,
    side: "hero" as const,
    position,
    classId: hero.classId as ClassId,
    specializationId: effectiveSpecialization(hero) as SpecializationId | null,
    stats: stats[position]!,
  }));
}

export function oldRoadEnemyCombatants(): EnemyCombatantInput[] {
  return OLD_ROAD_ENEMIES.map((enemy) => ({
    id: enemy.enemyId,
    side: "enemy" as const,
    slot: enemy.slot,
    stats: { maxHp: enemy.hp, atk: enemy.atk, def: enemy.def, spd: enemy.spd },
  }));
}

export interface CycleLogEntry {
  /** 1-based index within the whole expedition (cyclesCompleted before + i). */
  readonly cycle: number;
  readonly result: BattleResultKind;
  readonly rounds: number;
  readonly gold: number;
  readonly drop: ItemDropRoll | null;
  readonly converted: boolean;
}

export interface CycleBatchInput {
  /** Frozen at expedition start; levels/equipment/spec here feed combat. */
  readonly frozenParty: readonly PartyMemberInput[];
  /** Live level/xp per participant heroId; rewards are written here, not to the frozen party. */
  readonly liveLevels: Readonly<Record<string, LevelState>>;
  readonly rngState: RngState;
  readonly unequippedCount: number;
  readonly cyclesCompletedBefore: number;
  readonly cycles: number;
}

export interface CycleBatchResult {
  readonly wins: number;
  readonly losses: number;
  /** XP granted to each participant (pre-cap); identical for all three. */
  readonly xpPerParticipant: number;
  /** Includes overflow-conversion gold. */
  readonly gold: number;
  /** Drops that become new unequipped instances, in cycle order. */
  readonly items: readonly ItemDropRoll[];
  readonly overflowConvertedCount: number;
  readonly overflowConvertedGold: number;
  readonly liveLevels: Readonly<Record<string, LevelState>>;
  readonly rngState: RngState;
  readonly unequippedCount: number;
  readonly recentCycles: readonly CycleLogEntry[];
}

/**
 * Simulates `cycles` whole Old Road cycles in order (baseline.md 6: each
 * drop is resolved against the running unequipped count before the next).
 * A lost cycle is consumed with no reward and no RNG draw (baseline.md 2/4).
 */
export function simulateExpeditionCycles(input: CycleBatchInput): CycleBatchResult {
  const heroes = toHeroCombatants(input.frozenParty);
  const enemies = oldRoadEnemyCombatants();
  const levels: Record<string, LevelState> = { ...input.liveLevels };

  let wins = 0;
  let losses = 0;
  let xpPerParticipant = 0;
  let gold = 0;
  let overflowConvertedCount = 0;
  let overflowConvertedGold = 0;
  let rngState = input.rngState;
  let unequippedCount = input.unequippedCount;
  const items: ItemDropRoll[] = [];
  const recentCycles: CycleLogEntry[] = [];

  for (let i = 0; i < input.cycles; i++) {
    const battle = simulateBattle(heroes, enemies, "pve");
    const cycle = input.cyclesCompletedBefore + i + 1;
    let entry: CycleLogEntry;

    if (battle.result === "win") {
      wins += 1;
      const reward = resolveExpeditionCycleReward(rngState, unequippedCount);
      rngState = reward.nextRngState;
      xpPerParticipant += reward.xpPerParticipant;
      for (const hero of input.frozenParty) {
        levels[hero.heroId] = applyXpGain(levels[hero.heroId]!, reward.xpPerParticipant);
      }
      gold += reward.gold;
      if (reward.itemInstance) items.push(reward.itemInstance);
      if (reward.overflowConverted) {
        overflowConvertedCount += 1;
        overflowConvertedGold += overflowGoldValue(reward.overflowConverted.affixId !== null);
      }
      unequippedCount = reward.unequippedCountAfter;
      entry = {
        cycle,
        result: "win",
        rounds: battle.rounds,
        gold: reward.gold,
        drop: reward.itemInstance ?? reward.overflowConverted,
        converted: reward.overflowConverted !== null,
      };
    } else {
      losses += 1;
      entry = { cycle, result: battle.result, rounds: battle.rounds, gold: 0, drop: null, converted: false };
    }

    recentCycles.push(entry);
    if (recentCycles.length > RECENT_CYCLE_LOG_LIMIT) recentCycles.shift();
  }

  return {
    wins,
    losses,
    xpPerParticipant,
    gold,
    items,
    overflowConvertedCount,
    overflowConvertedGold,
    liveLevels: levels,
    rngState,
    unequippedCount,
    recentCycles,
  };
}
