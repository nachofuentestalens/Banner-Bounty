import { DUNGEONS, DUNGEON_FLOOR_LENGTH_MS, type UnlockRequirement } from "../v2/encounters.js";

export interface EnemyPlacementV3 { readonly enemyId: string; readonly slotIndex: number }
export interface DungeonDefinitionV3 {
  readonly dungeonId: string;
  readonly unlockRequirement: UnlockRequirement | { readonly kind: "dungeonClear"; readonly value: string };
  readonly floorDurationMs: number;
  readonly floors: readonly {
    readonly floor: number;
    readonly enemies: readonly EnemyPlacementV3[];
    readonly rewardProfileId: string;
    readonly isBoss: boolean;
  }[];
}
export const ARCHIVE_ENEMIES_V3 = [
  { enemyId: "enemy_archive_binder", display: "Archive Binder", hp: 85, atk: 13, def: 10, spd: 8 },
  { enemyId: "enemy_archive_spark", display: "Archive Spark", hp: 52, atk: 14, def: 4, spd: 12 },
  { enemyId: "boss_archive_custodian", display: "The Custodian", hp: 360, atk: 18, def: 10, spd: 9 },
] as const;
const binder = (slotIndex: number): EnemyPlacementV3 => ({ enemyId: "enemy_archive_binder", slotIndex });
const spark = (slotIndex: number): EnemyPlacementV3 => ({ enemyId: "enemy_archive_spark", slotIndex });
export const DUNGEONS_V3: readonly DungeonDefinitionV3[] = [
  ...DUNGEONS.map(d => ({ ...d, floorDurationMs: DUNGEON_FLOOR_LENGTH_MS,
    floors: d.floors.map(({ enemyIds, ...f }) => ({ ...f, enemies: enemyIds.map((enemyId, slotIndex) => ({ enemyId, slotIndex })) })),
  })),
  {
    dungeonId: "dungeon_cinder_archive",
    unlockRequirement: { kind: "dungeonClear", value: "dungeon_aqueduct_depths" },
    floorDurationMs: DUNGEON_FLOOR_LENGTH_MS,
    floors: [
      { floor: 1, enemies: [binder(0), spark(3)], rewardProfileId: "dungeon_2_ordinary", isBoss: false },
      { floor: 2, enemies: [binder(0), spark(3), spark(4)], rewardProfileId: "dungeon_2_ordinary", isBoss: false },
      { floor: 3, enemies: [binder(0), binder(1), spark(4)], rewardProfileId: "dungeon_2_ordinary", isBoss: false },
      { floor: 4, enemies: [{ enemyId: "boss_archive_custodian", slotIndex: 0 }, spark(3)], rewardProfileId: "dungeon_2_boss", isBoss: true },
    ],
  },
];
export function getDungeonV3(id: string): DungeonDefinitionV3 {
  const value = DUNGEONS_V3.find(d => d.dungeonId === id);
  if (!value) throw new Error(`Unknown M3 dungeon: ${id}`);
  return value;
}
