import type { BattleEventDTO, BattleResultDTO, BattleUnitDTO } from "@banner-and-bounty/contracts";
import {
  DEPTHS_BROODLING_STATS,
  DROWNED_WARDEN,
  OLD_ROAD_ENEMIES,
  SUNKEN_AQUEDUCT_ENEMIES,
  TOLLKEEPER,
  getClassBaseStatsV2,
  getClassV3,
} from "@banner-and-bounty/content";
import type { BattleEventV2, BattleResultV2, BattleUnitSummaryV2 } from "@banner-and-bounty/game";

const ENEMY_DISPLAY: Record<string, string> = {};
for (const def of [...OLD_ROAD_ENEMIES, TOLLKEEPER, ...SUNKEN_AQUEDUCT_ENEMIES, DROWNED_WARDEN]) {
  ENEMY_DISPLAY[def.enemyId] = def.display;
}
ENEMY_DISPLAY[DEPTHS_BROODLING_STATS.enemyId] = DEPTHS_BROODLING_STATS.display;

/**
 * Heroes have no per-instance display name in this game (copy.md only names
 * classes/templates) — same precedent M1's BattleResultPanel already used
 * (`label(unit.role)` on the classId). A unit's `name` is its primary class's
 * display name for a hero, or the content display name for an enemy/boss
 * using `unit.enemyId` (not `unit.unitId`, which for arena opponents is a
 * stable heroId with no enemy encoding — see arenaService.ts's
 * `snapshotToCombatants`), stripping the `#slotIndex` suffix encounters2.ts
 * appends to make dungeon enemy IDs unique within a battle.
 */
function unitDisplayName(unit: BattleUnitSummaryV2): string {
  if (unit.kind === "hero") {
    // M3-05 addition: season/tournament combatants may carry a class outside
    // the original six (class_warder/class_weaver); fall back to the wider
    // V3 roster rather than throwing on an otherwise-valid new class.
    try {
      return getClassBaseStatsV2(unit.classId!).display;
    } catch {
      return getClassV3(unit.classId!).display;
    }
  }
  const enemyId = (unit.enemyId ?? unit.unitId).split("#")[0]!;
  const arenaClassId = enemyId.startsWith("arena_") ? enemyId.slice("arena_".length) : null;
  if (arenaClassId) {
    try {
      return getClassBaseStatsV2(arenaClassId).display;
    } catch {
      return getClassV3(arenaClassId).display;
    }
  }
  return ENEMY_DISPLAY[enemyId] ?? enemyId;
}

export function toBattleUnitDTOs(units: readonly BattleUnitSummaryV2[]): BattleUnitDTO[] {
  return units.map((unit) => ({
    unitId: unit.unitId,
    side: unit.side,
    kind: unit.kind,
    name: unitDisplayName(unit),
    classId: unit.classId,
    secondaryClassId: unit.secondaryClassId,
    slotIndex: unit.slotIndex,
    maxHp: unit.maxHp,
  }));
}

export function toBattleEventDTOs(events: readonly BattleEventV2[]): BattleEventDTO[] {
  return events.map((e) => ({ ...e }));
}

export function toBattleResultDTO(battle: Pick<BattleResultV2, "result" | "rounds" | "finalHp">): BattleResultDTO {
  return { outcome: battle.result, rounds: battle.rounds, finalHp: { ...battle.finalHp } };
}

/** Full presentation triple (units/events/result) for one simulated battle, ready to embed in a BattleReport. */
export function presentBattle(battle: BattleResultV2) {
  return {
    participantsSnapshot: { units: toBattleUnitDTOs(battle.units) },
    events: toBattleEventDTOs(battle.events),
    result: toBattleResultDTO(battle),
  };
}
