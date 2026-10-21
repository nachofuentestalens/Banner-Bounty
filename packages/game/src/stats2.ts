// Dual-class effective stat computation (design/game/classes.md section 2.1,
// steps 1-5 — the battle-start-fixed portion; steps 6-7, the dynamically
// rechecked passives and in-battle buff/debuff layer, are combat-state
// dependent and live in combat2.ts instead).

import { type AffixIdV2, type ClassId, getAffixDefinitionV2, getClassBaseStatsV2, getItemDefinition } from "@banner-and-bounty/content";

export interface LeveledStatsV2 {
  readonly hp: number;
  readonly atk: number;
  readonly def: number;
  readonly spd: number;
}

export interface EffectiveStatsV2 {
  readonly maxHp: number;
  readonly atk: number;
  readonly def: number;
  readonly spd: number;
}

export function statAtLevel2(classId: string, level: number): LeveledStatsV2 {
  const def = getClassBaseStats(classId);
  const l = level - 1;
  return {
    hp: def.hpBase + def.hpGrowth * l,
    atk: def.atkBase + def.atkGrowth * l,
    def: def.defBase + def.defGrowth * l,
    spd: def.spd,
  };
}

function getClassBaseStats(classId: string) {
  return getClassBaseStatsV2(classId);
}

/**
 * classes.md 2.1 steps 1-3: dualClassBase = primaryLeveled + floor(secondaryLeveled/4),
 * or just primaryLeveled if no secondary is assigned.
 */
export function computeDualClassBase(primaryClassId: ClassId, secondaryClassId: ClassId | null, level: number): LeveledStatsV2 {
  const primary = statAtLevel2(primaryClassId, level);
  if (!secondaryClassId) return primary;
  const secondary = statAtLevel2(secondaryClassId, level);
  return {
    hp: primary.hp + Math.floor(secondary.hp / 4),
    atk: primary.atk + Math.floor(secondary.atk / 4),
    def: primary.def + Math.floor(secondary.def / 4),
    spd: primary.spd + Math.floor(secondary.spd / 4),
  };
}

export interface AffixInstanceV2 {
  readonly affixId: AffixIdV2;
  readonly value: number;
}

export interface EquippedItemInputV2 {
  readonly definitionId: string;
  readonly affixes: readonly AffixInstanceV2[];
}

export interface EquipmentV2 {
  readonly weapon: EquippedItemInputV2 | null;
  readonly armor: EquippedItemInputV2 | null;
  readonly trinket: EquippedItemInputV2 | null;
}

function itemBonus(item: EquippedItemInputV2 | null): { hp: number; atk: number; def: number; spd: number } {
  const totals = { hp: 0, atk: 0, def: 0, spd: 0 };
  if (!item) return totals;
  const base = getItemDefinition(item.definitionId);
  totals.hp += base.hpBonus;
  totals.atk += base.atkBonus;
  totals.def += base.defBonus;
  for (const affix of item.affixes) {
    const def = getAffixDefinitionV2(affix.affixId);
    totals[def.stat] += affix.value;
  }
  return totals;
}

/** classes.md 2.1 step 4: sum of equipped items' flat bonus for that stat (base + every rolled affix). */
export function computeEquippedBonus(equipment: EquipmentV2): { hp: number; atk: number; def: number; spd: number } {
  return [equipment.weapon, equipment.armor, equipment.trinket].map(itemBonus).reduce(
    (a, b) => ({ hp: a.hp + b.hp, atk: a.atk + b.atk, def: a.def + b.def, spd: a.spd + b.spd }),
    { hp: 0, atk: 0, def: 0, spd: 0 },
  );
}

export interface HeroBuildInputV2 {
  readonly primaryClassId: ClassId;
  readonly secondaryClassId: ClassId | null;
  readonly level: number;
  readonly equipment: EquipmentV2;
  /** Thick Hide is the only battle-start-fixed passive that modifies a core stat (classes.md 5.1); everything else is dynamically rechecked and applied in combat2.ts. */
  readonly hasThickHide: boolean;
}

/**
 * classes.md 2.1 steps 1-5: dual-class base + equipped bonuses + Thick Hide's
 * battle-start-fixed +15% DEF layer. This is the fixed-for-the-battle
 * baseline every actor starts from; combat2.ts layers dynamic
 * passives/statuses (steps 6-7) on top at formula-evaluation time.
 */
export function computeBattleStartStats(input: HeroBuildInputV2): EffectiveStatsV2 {
  const base = computeDualClassBase(input.primaryClassId, input.secondaryClassId, input.level);
  const equipped = computeEquippedBonus(input.equipment);

  const maxHp = base.hp + equipped.hp;
  const atk = base.atk + equipped.atk;
  let def = base.def + equipped.def;
  const spd = base.spd + equipped.spd;

  if (input.hasThickHide) def = Math.floor((def * 115) / 100);

  return { maxHp, atk, def, spd };
}

/** classes.md 2.1 step 5/7's shared clamp: a stat is never reduced below 20% of its pre-percentage value. */
export function applyPercentModifier(value: number, netPercent: number): number {
  const clamped = Math.max(-80, netPercent);
  return Math.floor((value * (100 + clamped)) / 100);
}
