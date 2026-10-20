import type { EnemyCombatantInput, HeroCombatantInput } from "@banner-and-bounty/game";

/** Frozen presentation metadata, kept with the report so later gear changes cannot affect a replay. */
export function replayUnits(heroes: readonly HeroCombatantInput[], opponents: readonly (HeroCombatantInput | EnemyCombatantInput)[]) {
  return [...heroes.map((unit) => ({ id: unit.id, team: "A", role: unit.classId, maxHp: unit.stats.maxHp })),
    ...opponents.map((unit) => ({ id: unit.id, team: "B", role: unit.side === "hero" ? unit.classId : unit.id, maxHp: unit.stats.maxHp }))];
}
