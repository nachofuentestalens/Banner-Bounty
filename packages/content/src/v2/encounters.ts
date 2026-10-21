// M2-31 content: the Sunken Aqueduct area and the Sunken Aqueduct Depths
// dungeon (design/game/content.md section 6). Stats only — behavior (which
// enemy/boss does what on which round) is implemented in
// packages/game/src/combat2.ts, keyed by these same enemyId/bossId strings,
// matching the M1 content/combat division of labor.

import type { EnemyDefinition } from "../index.js";

export type UnlockRequirement = { readonly kind: "none" } | { readonly kind: "bossClear"; readonly value: string };

export interface AreaDefinition {
  readonly areaId: string;
  readonly unlockRequirement: UnlockRequirement;
  readonly rewardProfileId: string;
}

export const AREAS: readonly AreaDefinition[] = [
  { areaId: "area_old_road", unlockRequirement: { kind: "none" }, rewardProfileId: "reward_area_1" },
  { areaId: "area_sunken_aqueduct", unlockRequirement: { kind: "bossClear", value: "boss_tollkeeper" }, rewardProfileId: "reward_area_2" },
];

export function getAreaDefinition(areaId: string): AreaDefinition {
  const found = AREAS.find((a) => a.areaId === areaId);
  if (!found) throw new Error(`Unknown areaId: ${areaId}`);
  return found;
}

export const SUNKEN_AQUEDUCT_ENEMIES: readonly EnemyDefinition[] = [
  { enemyId: "enemy_aqueduct_drowned", display: "Drowned Warden-Thrall", slot: 0, hp: 65, atk: 12, def: 6, spd: 9 },
  { enemyId: "enemy_aqueduct_current", display: "Riptide Current", slot: 1, hp: 48, atk: 13, def: 4, spd: 13 },
  { enemyId: "enemy_aqueduct_husk", display: "Aqueduct Husk", slot: 2, hp: 40, atk: 9, def: 4, spd: 10 },
];

export const DEPTHS_BROODLING_STATS = { enemyId: "enemy_depths_broodling", display: "Depths Broodling", hp: 55, atk: 14, def: 5, spd: 11 } as const;

export const DROWNED_WARDEN: EnemyDefinition = { enemyId: "boss_drowned_warden", display: "The Drowned Warden", slot: 0, hp: 300, atk: 16, def: 9, spd: 10 };

export interface DungeonFloorDefinition {
  readonly floor: number; // 1-based
  readonly enemyIds: readonly string[]; // slot = array index
  readonly rewardProfileId: string;
  readonly isBoss: boolean;
}

export interface DungeonDefinition {
  readonly dungeonId: string;
  readonly unlockRequirement: UnlockRequirement;
  readonly floors: readonly DungeonFloorDefinition[];
}

export const DUNGEONS: readonly DungeonDefinition[] = [
  {
    dungeonId: "dungeon_aqueduct_depths",
    unlockRequirement: { kind: "bossClear", value: "boss_tollkeeper" },
    floors: [
      { floor: 1, enemyIds: ["enemy_aqueduct_husk", "enemy_aqueduct_husk"], rewardProfileId: "dungeon_1_ordinary", isBoss: false },
      { floor: 2, enemyIds: ["enemy_aqueduct_drowned", "enemy_aqueduct_husk"], rewardProfileId: "dungeon_1_ordinary", isBoss: false },
      { floor: 3, enemyIds: ["enemy_depths_broodling", "enemy_depths_broodling"], rewardProfileId: "dungeon_1_ordinary", isBoss: false },
      { floor: 4, enemyIds: ["boss_drowned_warden"], rewardProfileId: "dungeon_1_boss", isBoss: true },
    ],
  },
];

export function getDungeonDefinition(dungeonId: string): DungeonDefinition {
  const found = DUNGEONS.find((d) => d.dungeonId === dungeonId);
  if (!found) throw new Error(`Unknown dungeonId: ${dungeonId}`);
  return found;
}

export const DUNGEON_FLOOR_LENGTH_MS = 180_000;
export const OFFLINE_CAP_MS_V2 = 28_800_000;

export function validateDungeonTimeBudget(dungeon: DungeonDefinition): void {
  const totalMs = dungeon.floors.length * DUNGEON_FLOOR_LENGTH_MS;
  if (totalMs > OFFLINE_CAP_MS_V2) {
    throw new Error(`Dungeon ${dungeon.dungeonId} floorCount*180s (${totalMs}ms) exceeds the 8h offline cap`);
  }
}
