// Effective stat computation (design/game/combat.md section 1).

import {
  type ClassId,
  type SpecializationId,
  getClassDefinition,
  getItemDefinition,
  getAffixDefinition,
} from "@banner-and-bounty/content";

export interface EquippedItemInput {
  readonly definitionId: string;
  readonly affixId: string | null;
}

export interface HeroLoadoutInput {
  readonly classId: ClassId;
  readonly level: number; // 1-10
  readonly specializationId: SpecializationId | null;
  readonly equipment: {
    readonly weapon: EquippedItemInput | null;
    readonly armor: EquippedItemInput | null;
    readonly trinket: EquippedItemInput | null;
  };
}

export interface LeveledStats {
  readonly hp: number;
  readonly atk: number;
  readonly def: number;
  readonly spd: number;
}

export interface EffectiveStats {
  readonly maxHp: number;
  readonly atk: number;
  readonly def: number;
  readonly spd: number;
}

export function statAtLevel(classId: ClassId, level: number): LeveledStats {
  const def = getClassDefinition(classId);
  const l = level - 1;
  return {
    hp: def.hpBase + def.hpGrowth * l,
    atk: def.atkBase + def.atkGrowth * l,
    def: def.defBase + def.defGrowth * l,
    spd: def.spd,
  };
}

/**
 * A hero below level 3 always uses its class default action (combat.md
 * 3.3), regardless of any `specializationId` value present on the record —
 * server/content should never set one below level 3, but this gate makes
 * the pure function defensive against a stale/invalid input rather than
 * silently applying a spec that shouldn't be active yet.
 */
export function effectiveSpecialization(hero: Pick<HeroLoadoutInput, "level" | "specializationId">): SpecializationId | null {
  return hero.level >= 3 ? hero.specializationId : null;
}

function itemBonus(item: EquippedItemInput | null): { hp: number; atk: number; def: number } {
  if (!item) return { hp: 0, atk: 0, def: 0 };
  const base = getItemDefinition(item.definitionId);
  let hp = base.hpBonus;
  let atk = base.atkBonus;
  let def = base.defBonus;
  if (item.affixId) {
    const affix = getAffixDefinition(item.affixId);
    hp += affix.hpBonus;
    atk += affix.atkBonus;
    def += affix.defBonus;
  }
  return { hp, atk, def };
}

/** True if any hero in the party is a level-3+ Pathfinder (combat.md 3.5). */
export function partyHasPathfinder(heroes: readonly HeroLoadoutInput[]): boolean {
  return heroes.some((h) => effectiveSpecialization(h) === "spec_pathfinder");
}

/**
 * Computes one hero's fixed-for-the-battle effective stats per combat.md
 * 1.2: leveled stats + equipped item bonuses (base + affix), then the
 * hero's own specialization modifier (Guardian/Berserker), then the whole
 * party's Pathfinder SPD bonus if applicable.
 */
export function computeHeroEffectiveStats(hero: HeroLoadoutInput, hasPathfinder: boolean): EffectiveStats {
  const leveled = statAtLevel(hero.classId, hero.level);
  const equipped = [hero.equipment.weapon, hero.equipment.armor, hero.equipment.trinket]
    .map(itemBonus)
    .reduce((a, b) => ({ hp: a.hp + b.hp, atk: a.atk + b.atk, def: a.def + b.def }), { hp: 0, atk: 0, def: 0 });

  let maxHp = leveled.hp + equipped.hp;
  let atk = leveled.atk + equipped.atk;
  let def = leveled.def + equipped.def;
  let spd = leveled.spd;

  const spec = effectiveSpecialization(hero);
  if (spec === "spec_guardian") {
    def = def + 2;
  } else if (spec === "spec_berserker") {
    atk = Math.floor((atk * 7) / 5);
    def = Math.floor((def * 4) / 5);
  }

  if (hasPathfinder) spd = spd + 2;

  return { maxHp, atk, def, spd };
}

/** Convenience wrapper applying the party-wide Pathfinder bonus consistently across all 3 heroes. */
export function computePartyEffectiveStats(heroes: readonly HeroLoadoutInput[]): EffectiveStats[] {
  const hasPathfinder = partyHasPathfinder(heroes);
  return heroes.map((h) => computeHeroEffectiveStats(h, hasPathfinder));
}
