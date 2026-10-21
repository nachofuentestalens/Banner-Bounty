// Multi-floor dungeon run simulation (design/studio/contracts.md's
// `/dungeon/settle` floor-settlement algorithm; design/game/economy/gear.md
// section 4). Pure: the caller (apps/server) supplies checkpoint/now
// instants, the frozen party, and the persisted reward rngState.

import { getDungeonDefinition, getRewardProfile } from "@banner-and-bounty/content";
import { type BattleResultV2, simulateBattleV2 } from "./combat2.js";
import { type ItemRoll, resolveAreaOrDungeonReward } from "./crafting.js";
import { buildEnemyCombatants } from "./encounters2.js";
import { type PartyMemberInputV2, toHeroCombatantsV2 } from "./party2.js";
import { type RngState } from "./rng.js";

export const DUNGEON_FLOOR_LENGTH_MS = 180_000;
export const DUNGEON_OFFLINE_CAP_MS = 28_800_000;

export interface DungeonSettlementWindow {
  readonly elapsedMs: number;
  readonly cappedMs: number;
  readonly discardedMs: number;
  readonly eligibleFloors: number;
}

/**
 * contracts.md `/dungeon/settle` steps 1-2: same elapsed/cap/discard math as
 * the expedition algorithm, with a 180s floor length instead of a 60s cycle
 * length, further capped at the run's own remaining floor count (a run
 * cannot process floors past its last floor).
 */
export function computeDungeonSettlementWindow(checkpointMs: number, nowMs: number, floorsRemaining: number): DungeonSettlementWindow {
  const elapsedMs = Math.max(0, nowMs - checkpointMs);
  const cappedMs = Math.min(elapsedMs, DUNGEON_OFFLINE_CAP_MS);
  const discardedMs = elapsedMs - cappedMs;
  const eligibleFloors = Math.min(Math.floor(cappedMs / DUNGEON_FLOOR_LENGTH_MS), floorsRemaining);
  return { elapsedMs, cappedMs, discardedMs, eligibleFloors };
}

/**
 * Derives each floor's independent combat rngSeed (crit/dodge stream, kept
 * separate from the reward rngState per gear.md section 1 — "combat RNG and
 * reward RNG are separate streams") from the run's single persisted
 * `combatSeedBase` plus the floor number, so each floor replays identically
 * on its own without needing a second persisted/chained RNG field. This is
 * a packages/game implementation decision: contracts.md fixes `DungeonRun`'s
 * one `rngState` field for the reward stream only and leaves per-floor
 * combat seeding to this package.
 */
function combatSeedForFloor(baseSeed: number, floor: number): number {
  let x = (baseSeed + floor * 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

export interface DungeonFloorOutcome {
  readonly floor: number;
  readonly isBoss: boolean;
  readonly result: "win" | "loss";
  readonly battle: BattleResultV2;
  readonly rewards: {
    readonly xp: number;
    readonly gold: number;
    readonly materials: { readonly scrap: number; readonly sigil: number; readonly core: number };
    readonly item: ItemRoll | null;
    readonly overflowConverted: ItemRoll | null;
  } | null; // null on a loss (gear.md section 4: "no reward for that floor")
}

export interface DungeonFloorBatchInput {
  readonly dungeonId: string;
  readonly frozenParty: readonly PartyMemberInputV2[];
  readonly currentFloor: number; // 1-based, the next floor to attempt
  readonly combatSeedBase: number;
  readonly rngState: RngState;
  readonly unequippedCount: number;
  readonly eligibleFloors: number;
}

export interface DungeonFloorBatchResult {
  readonly floorResults: readonly DungeonFloorOutcome[];
  readonly outcome: "in_progress" | "cleared" | "failed";
  readonly floorsProcessed: number;
  readonly currentFloorAfter: number;
  readonly floorsClearedDelta: number;
  readonly rngState: RngState;
  readonly unequippedCount: number;
}

/**
 * contracts.md `/dungeon/settle` steps 3-3b: simulate floors one at a time
 * starting at `currentFloor`, crediting each win's reward and advancing;
 * stop immediately on the final (boss) floor's clear or on any loss — no
 * further floors in this batch are attempted either way, even if more
 * `eligibleFloors` remain.
 */
export function simulateDungeonFloorBatch(input: DungeonFloorBatchInput): DungeonFloorBatchResult {
  const dungeon = getDungeonDefinition(input.dungeonId);
  const heroes = toHeroCombatantsV2(input.frozenParty);

  const floorResults: DungeonFloorOutcome[] = [];
  let outcome: "in_progress" | "cleared" | "failed" = "in_progress";
  let floor = input.currentFloor;
  let rngState = input.rngState;
  let unequippedCount = input.unequippedCount;
  let floorsProcessed = 0;
  let floorsClearedDelta = 0;

  for (let i = 0; i < input.eligibleFloors; i++) {
    const floorDef = dungeon.floors.find((f) => f.floor === floor);
    if (!floorDef) break; // run already exhausted its own floor count

    const enemies = buildEnemyCombatants(floorDef.enemyIds);
    const battle = simulateBattleV2(heroes, enemies, floorDef.isBoss ? "boss" : "pve", combatSeedForFloor(input.combatSeedBase, floor));
    floorsProcessed += 1;

    if (battle.result !== "win") {
      floorResults.push({ floor, isBoss: floorDef.isBoss, result: "loss", battle, rewards: null });
      outcome = "failed";
      break;
    }

    const profile = getRewardProfile(floorDef.rewardProfileId);
    const reward = resolveAreaOrDungeonReward(rngState, profile, unequippedCount);
    rngState = reward.nextRngState;
    unequippedCount = reward.unequippedCountAfter;
    floorResults.push({
      floor,
      isBoss: floorDef.isBoss,
      result: "win",
      battle,
      rewards: { xp: reward.xp, gold: reward.gold, materials: reward.materials, item: reward.itemInstance, overflowConverted: reward.overflowConverted },
    });
    floorsClearedDelta += 1;
    floor += 1;

    if (floorDef.isBoss) {
      outcome = "cleared";
      break;
    }
  }

  return { floorResults, outcome, floorsProcessed, currentFloorAfter: floor, floorsClearedDelta, rngState, unequippedCount };
}
