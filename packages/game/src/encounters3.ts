import { ARCHIVE_ENEMIES_V3, type EnemyPlacementV3 } from "@banner-and-bounty/content";
import { buildEnemyCombatants } from "./encounters2.js";
import type { CombatantInputV3, HeroCombatantInputV3 } from "./combat3.js";

/** Explicit slots preserve the Archive's protected backline and gaps. */
export function buildEnemyCombatantsV3(placements: readonly EnemyPlacementV3[]): CombatantInputV3[] {
  return placements.map(({ enemyId, slotIndex }) => {
    const archive = ARCHIVE_ENEMIES_V3.find(e => e.enemyId === enemyId);
    if (archive) return { kind: "enemy", id: `${enemyId}#${slotIndex}`, enemyId, slotIndex,
      stats: { maxHp: archive.hp, atk: archive.atk, def: archive.def, spd: archive.spd }, isBoss: enemyId.startsWith("boss_") };
    const legacy = buildEnemyCombatants([enemyId])[0]!;
    if (legacy.kind !== "enemy") throw new Error("Expected enemy content");
    return { ...legacy, id: `${enemyId}#${slotIndex}`, slotIndex };
  });
}

export function toHeroCombatantsV3(party: readonly HeroCombatantInputV3[]): CombatantInputV3[] {
  return party.map(h => ({ ...h, kind: "hero" }));
}
