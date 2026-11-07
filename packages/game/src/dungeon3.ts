// M3 dungeon floor-batch simulation (design/game/m3-systems.md section 7;
// design/studio/contracts.md's dungeon settlement algorithm, unchanged
// fixed-180,000ms-per-floor timing). Pure, isolated from the legacy
// `dungeon.ts`/`combat2.ts` executor, same separation principle as
// `combat3.ts` ("assess each rules version separately").

import { getDungeonV3, type EnemyPlacementV3 } from "@banner-and-bounty/content";
import { computeBattleStartStatsV3 } from "./builds3.js";
import { type BattleResultV2 } from "./combat2.js";
import { simulateBattleV3, type HeroCombatantInputV3 } from "./combat3.js";
import { buildEnemyCombatantsV3, toHeroCombatantsV3 } from "./encounters3.js";

export const DUNGEON_FLOOR_LENGTH_MS_V3 = 180_000;

/** Derives a per-floor combat seed from one run seed (own implementation decision, see dungeon.ts's combatSeedForFloor). */
function combatSeedForFloorV3(baseSeed: number, floor: number): number {
  let x = (baseSeed + floor * 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

export interface DungeonFloorOutcomeV3 {
  readonly floor: number;
  readonly isBoss: boolean;
  readonly result: "win" | "loss";
  readonly battle: BattleResultV2;
}

export interface DungeonRunResultV3 {
  readonly outcome: "cleared" | "failed";
  readonly floorsCleared: number;
  readonly floorResults: readonly DungeonFloorOutcomeV3[];
  /** remainingHp/maxHp per hero, from the last floor attempted, in original party order (m3-systems.md section 9's normalization convention). */
  readonly finalHeroHpRatios: readonly number[];
}

/**
 * Runs a full dungeon attempt floor 1..N, stopping on the first loss or on
 * the boss floor's clear — same stop condition as the legacy
 * `simulateDungeonFloorBatch`, generalized to any `dungeonId` whose floors
 * use `EnemyPlacementV3` (both migrated M1/M2 dungeons and Cinder Archive).
 * Every floor starts at full HP (m3-systems.md section 7).
 */
export function simulateDungeonRunV3(dungeonId: string, party: readonly HeroCombatantInputV3[], runSeed: number): DungeonRunResultV3 {
  const dungeon = getDungeonV3(dungeonId);
  const heroes = toHeroCombatantsV3(party);
  const maxHpByHeroId = new Map(party.map((hero) => [hero.id, computeBattleStartStatsV3(hero).maxHp]));
  const floorResults: DungeonFloorOutcomeV3[] = [];
  let floorsCleared = 0;
  let finalHeroHpRatios: readonly number[] = party.map(() => 1);

  for (const floorDef of dungeon.floors) {
    const enemies = buildEnemyCombatantsV3(floorDef.enemies as readonly EnemyPlacementV3[]);
    const battle = simulateBattleV3(heroes, enemies, floorDef.isBoss ? "boss" : "pve", combatSeedForFloorV3(runSeed, floorDef.floor));
    finalHeroHpRatios = party.map((hero) => Math.max(0, battle.finalHp[hero.id] ?? 0) / maxHpByHeroId.get(hero.id)!);

    if (battle.result !== "win") {
      floorResults.push({ floor: floorDef.floor, isBoss: floorDef.isBoss, result: "loss", battle });
      return { outcome: "failed", floorsCleared, floorResults, finalHeroHpRatios };
    }

    floorResults.push({ floor: floorDef.floor, isBoss: floorDef.isBoss, result: "win", battle });
    floorsCleared += 1;
    if (floorDef.isBoss) return { outcome: "cleared", floorsCleared, floorResults, finalHeroHpRatios };
  }

  return { outcome: "failed", floorsCleared, floorResults, finalHeroHpRatios };
}
