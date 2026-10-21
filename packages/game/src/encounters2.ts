// Content-ID -> stats lookup for combat v2 enemy/boss encounters, spanning
// every table content.md's M2-22/M2-31 additions define (Old Road reworked,
// Tollkeeper reworked, Sunken Aqueduct, the Depths dungeon). Behavior for
// each of these enemyId/bossId values is implemented in combat2.ts's
// enemy-AI switch; this module only turns a content enemyId list into
// CombatantInputV2[], the same role toHeroCombatantsV2 plays for heroes.

import { DEPTHS_BROODLING_STATS, DROWNED_WARDEN, OLD_ROAD_ENEMIES, SUNKEN_AQUEDUCT_ENEMIES, TOLLKEEPER, type EnemyDefinition } from "@banner-and-bounty/content";
import type { CombatantInputV2 } from "./combat2.js";

interface StatsOnly {
  readonly maxHp: number;
  readonly atk: number;
  readonly def: number;
  readonly spd: number;
}

function toStats(def: EnemyDefinition): StatsOnly {
  return { maxHp: def.hp, atk: def.atk, def: def.def, spd: def.spd };
}

const ENEMY_STATS: Record<string, StatsOnly> = {};
for (const def of [...OLD_ROAD_ENEMIES, TOLLKEEPER, ...SUNKEN_AQUEDUCT_ENEMIES, DROWNED_WARDEN]) {
  ENEMY_STATS[def.enemyId] = toStats(def);
}
ENEMY_STATS[DEPTHS_BROODLING_STATS.enemyId] = {
  maxHp: DEPTHS_BROODLING_STATS.hp,
  atk: DEPTHS_BROODLING_STATS.atk,
  def: DEPTHS_BROODLING_STATS.def,
  spd: DEPTHS_BROODLING_STATS.spd,
};

/** Builds one opposing-side combatant per `enemyIds` entry, slot index = array position (content.md's floor/encounter tables list enemies in slot order). */
export function buildEnemyCombatants(enemyIds: readonly string[]): CombatantInputV2[] {
  return enemyIds.map((enemyId, slotIndex) => {
    const stats = ENEMY_STATS[enemyId];
    if (!stats) throw new Error(`encounters2: no v2 stats registered for enemyId ${enemyId}`);
    return {
      kind: "enemy" as const,
      id: `${enemyId}#${slotIndex}`,
      slotIndex,
      enemyId,
      stats,
      isBoss: enemyId.startsWith("boss_"),
    };
  });
}
