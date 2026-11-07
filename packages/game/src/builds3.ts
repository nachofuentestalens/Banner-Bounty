import {
  type ClassIdV3, type RaceIdV3, type SkillLoadoutV3, M3_RULES,
  autoFillLoadoutV3, assertLevelV3, getClassV3, getRaceV3, getSkillV3,
  validateClassesV3, validateLoadoutV3, validateSpecializationV3,
} from "@banner-and-bounty/content";
import { applyPercentModifier, computeEquippedBonus, type EquipmentV2, type EffectiveStatsV2, type LeveledStatsV2 } from "./stats2.js";

export interface HeroBuildV3 {
  readonly primaryClassId: ClassIdV3;
  readonly secondaryClassId: ClassIdV3 | null;
  readonly primarySpecializationId: string | null;
  readonly raceId: RaceIdV3;
  readonly level: number;
  readonly slotIndex: number;
  readonly equipment: EquipmentV2;
  readonly skillLoadout: SkillLoadoutV3;
}

export function validateHeroBuildV3(build: HeroBuildV3): void {
  validateLoadoutV3(build.primaryClassId, build.secondaryClassId, build.level, build.skillLoadout);
  validateSpecializationV3(build.primaryClassId, build.level, build.primarySpecializationId);
  getRaceV3(build.raceId);
  if (!Number.isInteger(build.slotIndex) || build.slotIndex < 0 || build.slotIndex > 4) throw new Error("Invalid M3 formation slot");
}
export function statAtLevelV3(id: ClassIdV3, level: number): LeveledStatsV2 {
  assertLevelV3(level);
  const c = getClassV3(id);
  return { hp: c.hpBase + c.hpGrowth * (level - 1), atk: c.atkBase + c.atkGrowth * (level - 1), def: c.defBase + c.defGrowth * (level - 1), spd: c.spd };
}
export function computeBattleStartStatsV3(build: HeroBuildV3): EffectiveStatsV2 {
  validateHeroBuildV3(build);
  const primary = statAtLevelV3(build.primaryClassId, build.level);
  const secondary = build.secondaryClassId ? statAtLevelV3(build.secondaryClassId, build.level) : { hp: 0, atk: 0, def: 0, spd: 0 };
  const gear = computeEquippedBonus(build.equipment);
  const race = getRaceV3(build.raceId);
  const has = (skill: string) => build.skillLoadout.passive.includes(skill);
  const base = (stat: keyof LeveledStatsV2) => primary[stat] + Math.floor(secondary[stat] / 4) + gear[stat];
  // One summed percentage layer after flats, never sequentially rounded modifiers.
  const defensePercent = race.defPercent + (has("thick_hide") ? 15 : 0) + (has("skill_warder_rooted") && build.slotIndex <= 2 ? 10 : 0);
  return {
    maxHp: Math.max(1, applyPercentModifier(base("hp"), race.hpPercent)),
    atk: Math.max(1, applyPercentModifier(base("atk"), race.atkPercent)),
    def: Math.max(0, applyPercentModifier(base("def"), defensePercent)),
    spd: Math.max(1, base("spd") + race.spdFlat),
  };
}

export function respecCostV3(level: number): { gold: number; scrap: number; sigil: number } {
  assertLevelV3(level);
  return { gold: 100 * level, scrap: 5 * level, sigil: level >= 5 ? 1 : 0 };
}

/** Pure preview only. Ownership, active-run locks, debit and idempotency belong to M3-08. */
export function previewPrimaryRespecV3<T extends HeroBuildV3>(build: T, primary: ClassIdV3, secondary?: ClassIdV3 | null): {
  build: T; cost: ReturnType<typeof respecCostV3>; cooldownMs: number;
} {
  if (primary === build.primaryClassId) throw new Error("Same primary: use free secondary switching");
  const nextSecondary = secondary === undefined ? build.secondaryClassId : secondary;
  validateClassesV3(primary, nextSecondary, build.level);
  const next = { ...build, primaryClassId: primary, secondaryClassId: nextSecondary, primarySpecializationId: null, skillLoadout: autoFillLoadoutV3(primary, build.level) };
  validateHeroBuildV3(next);
  return { build: next, cost: respecCostV3(build.level), cooldownMs: M3_RULES.respecCooldownMs };
}

/** Preserve each valid slot's position; never refill, reset specialization or set a timestamp. */
export function previewSecondarySwitchV3<T extends HeroBuildV3>(build: T, secondary: ClassIdV3 | null): T {
  if (build.level < 3) throw new Error("Secondary switching requires level 3");
  validateClassesV3(build.primaryClassId, secondary, build.level);
  const keep = (id: string): string => {
    if (!id) return "";
    const skill = getSkillV3(id);
    return skill.classId === build.primaryClassId || skill.classId === secondary ? id : "";
  };
  const next = { ...build, secondaryClassId: secondary, skillLoadout: {
    active: [keep(build.skillLoadout.active[0]), keep(build.skillLoadout.active[1])] as const,
    passive: [keep(build.skillLoadout.passive[0]), keep(build.skillLoadout.passive[1])] as const,
  } };
  validateHeroBuildV3(next);
  return next;
}
