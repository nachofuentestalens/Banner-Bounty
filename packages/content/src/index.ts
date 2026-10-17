// Content tables (M1-02 freeze, design/game/content.md). Stable, validated
// static data consumed by packages/game and apps/server. No dependency on
// contracts, game, or apps/server per architecture.md.

export class ContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentValidationError";
  }
}

export type ClassId = "class_vanguard" | "class_ranger" | "class_arcanist";

export type SpecializationId =
  | "spec_guardian"
  | "spec_berserker"
  | "spec_marksman"
  | "spec_pathfinder"
  | "spec_pyromancer"
  | "spec_warden";

export type EquipmentSlot = "weapon" | "armor" | "trinket";

export interface ClassDefinition {
  readonly classId: ClassId;
  readonly display: string;
  readonly hpBase: number;
  readonly hpGrowth: number;
  readonly atkBase: number;
  readonly atkGrowth: number;
  readonly defBase: number;
  readonly defGrowth: number;
  readonly spd: number;
  readonly specializations: readonly [SpecializationId, SpecializationId];
}

export const CLASS_DEFINITIONS: readonly ClassDefinition[] = [
  {
    classId: "class_vanguard",
    display: "Vanguard",
    hpBase: 40,
    hpGrowth: 5,
    atkBase: 7,
    atkGrowth: 1,
    defBase: 6,
    defGrowth: 1,
    spd: 8,
    specializations: ["spec_guardian", "spec_berserker"],
  },
  {
    classId: "class_ranger",
    display: "Ranger",
    hpBase: 32,
    hpGrowth: 4,
    atkBase: 9,
    atkGrowth: 2,
    defBase: 4,
    defGrowth: 1,
    spd: 12,
    specializations: ["spec_marksman", "spec_pathfinder"],
  },
  {
    classId: "class_arcanist",
    display: "Arcanist",
    hpBase: 28,
    hpGrowth: 4,
    atkBase: 10,
    atkGrowth: 2,
    defBase: 3,
    defGrowth: 1,
    spd: 9,
    specializations: ["spec_pyromancer", "spec_warden"],
  },
];

export interface StarterHero {
  readonly heroTemplateId: string;
  readonly classId: ClassId;
}

export const STARTER_HEROES: readonly StarterHero[] = [
  { heroTemplateId: "hero_starter_vanguard", classId: "class_vanguard" },
  { heroTemplateId: "hero_starter_ranger", classId: "class_ranger" },
  { heroTemplateId: "hero_starter_arcanist", classId: "class_arcanist" },
];

export interface ItemDefinition {
  readonly definitionId: string;
  readonly slot: EquipmentSlot;
  readonly display: string;
  readonly hpBonus: number;
  readonly atkBonus: number;
  readonly defBonus: number;
}

export const ITEM_DEFINITIONS: readonly ItemDefinition[] = [
  { definitionId: "item_weapon_shortsword", slot: "weapon", display: "Shortsword", hpBonus: 0, atkBonus: 3, defBonus: 0 },
  { definitionId: "item_weapon_longspear", slot: "weapon", display: "Longspear", hpBonus: 0, atkBonus: 2, defBonus: 1 },
  { definitionId: "item_weapon_focus", slot: "weapon", display: "Arcane Focus", hpBonus: 0, atkBonus: 4, defBonus: 0 },
  { definitionId: "item_armor_leather", slot: "armor", display: "Leather Vest", hpBonus: 4, atkBonus: 0, defBonus: 1 },
  { definitionId: "item_armor_plate", slot: "armor", display: "Plate Harness", hpBonus: 2, atkBonus: 0, defBonus: 3 },
  { definitionId: "item_armor_robe", slot: "armor", display: "Traveler's Robe", hpBonus: 6, atkBonus: 0, defBonus: 0 },
  { definitionId: "item_trinket_whetstone", slot: "trinket", display: "Whetstone Charm", hpBonus: 0, atkBonus: 2, defBonus: 0 },
  { definitionId: "item_trinket_ironband", slot: "trinket", display: "Iron Band", hpBonus: 0, atkBonus: 0, defBonus: 2 },
  { definitionId: "item_trinket_luckycoin", slot: "trinket", display: "Lucky Coin", hpBonus: 3, atkBonus: 0, defBonus: 0 },
];

export type AffixId = "affix_of_power" | "affix_of_warding" | "affix_of_vigor";

export interface AffixDefinition {
  readonly affixId: AffixId;
  readonly display: string;
  readonly hpBonus: number;
  readonly atkBonus: number;
  readonly defBonus: number;
}

export const AFFIX_DEFINITIONS: readonly AffixDefinition[] = [
  { affixId: "affix_of_power", display: "of Power", hpBonus: 0, atkBonus: 2, defBonus: 0 },
  { affixId: "affix_of_warding", display: "of Warding", hpBonus: 0, atkBonus: 0, defBonus: 2 },
  { affixId: "affix_of_vigor", display: "of Vigor", hpBonus: 3, atkBonus: 0, defBonus: 0 },
];

export interface EnemyDefinition {
  readonly enemyId: string;
  readonly display: string;
  readonly slot: number;
  readonly hp: number;
  readonly atk: number;
  readonly def: number;
  readonly spd: number;
}

export const OLD_ROAD_ENEMIES: readonly EnemyDefinition[] = [
  { enemyId: "enemy_road_brigand", display: "Road Brigand", slot: 0, hp: 50, atk: 9, def: 4, spd: 7 },
  { enemyId: "enemy_road_wolf", display: "Road Wolf", slot: 1, hp: 35, atk: 11, def: 2, spd: 11 },
  { enemyId: "enemy_road_cutpurse", display: "Road Cutpurse", slot: 2, hp: 30, atk: 8, def: 2, spd: 10 },
];

export const TOLLKEEPER: EnemyDefinition = {
  enemyId: "boss_tollkeeper",
  display: "The Tollkeeper",
  slot: 0,
  hp: 220,
  atk: 14,
  def: 8,
  spd: 9,
};

function byId<T, K extends string>(items: readonly T[], keyOf: (item: T) => K): Map<K, T> {
  const map = new Map<K, T>();
  for (const item of items) map.set(keyOf(item), item);
  return map;
}

const CLASS_BY_ID = byId(CLASS_DEFINITIONS, (c) => c.classId);
const ITEM_BY_ID = byId(ITEM_DEFINITIONS, (i) => i.definitionId);
const AFFIX_BY_ID = byId(AFFIX_DEFINITIONS, (a) => a.affixId);
const SPECIALIZATION_CLASS: Map<SpecializationId, ClassId> = new Map();
for (const c of CLASS_DEFINITIONS) {
  for (const specId of c.specializations) SPECIALIZATION_CLASS.set(specId, c.classId);
}

export function getClassDefinition(classId: string): ClassDefinition {
  const found = CLASS_BY_ID.get(classId as ClassId);
  if (!found) throw new ContentValidationError(`Unknown classId: ${classId}`);
  return found;
}

export function getItemDefinition(definitionId: string): ItemDefinition {
  const found = ITEM_BY_ID.get(definitionId);
  if (!found) throw new ContentValidationError(`Unknown item definitionId: ${definitionId}`);
  return found;
}

export function getAffixDefinition(affixId: string): AffixDefinition {
  const found = AFFIX_BY_ID.get(affixId as AffixId);
  if (!found) throw new ContentValidationError(`Unknown affixId: ${affixId}`);
  return found;
}

export function getSpecializationClass(specializationId: string): ClassId {
  const found = SPECIALIZATION_CLASS.get(specializationId as SpecializationId);
  if (!found) throw new ContentValidationError(`Unknown specializationId: ${specializationId}`);
  return found;
}

/** Throws if `specializationId` is not one of `classId`'s two specializations. */
export function assertSpecializationForClass(classId: string, specializationId: string): void {
  const owner = getSpecializationClass(specializationId);
  if (owner !== classId) {
    throw new ContentValidationError(
      `specializationId ${specializationId} does not belong to classId ${classId} (belongs to ${owner})`,
    );
  }
}

/** Unweighted sum of an item instance's own stat bonuses (base + affix), per content.md 2.3. */
export function powerScore(totals: { hpBonus: number; atkBonus: number; defBonus: number }): number {
  return totals.hpBonus + totals.atkBonus + totals.defBonus;
}

/**
 * Structural self-check of the static tables above: unique IDs, slot
 * membership, and class/specialization consistency. Run at module load so a
 * corrupted edit to this file fails fast and loudly instead of surfacing as a
 * confusing downstream combat/reward bug.
 */
export function validateContent(): void {
  const classIds = new Set<string>();
  for (const c of CLASS_DEFINITIONS) {
    if (classIds.has(c.classId)) throw new ContentValidationError(`Duplicate classId: ${c.classId}`);
    classIds.add(c.classId);
    const [a, b] = c.specializations;
    if (a === b) throw new ContentValidationError(`Class ${c.classId} has duplicate specialization IDs`);
  }

  const itemIds = new Set<string>();
  for (const item of ITEM_DEFINITIONS) {
    if (itemIds.has(item.definitionId)) throw new ContentValidationError(`Duplicate item definitionId: ${item.definitionId}`);
    itemIds.add(item.definitionId);
  }
  const slotCounts: Record<EquipmentSlot, number> = { weapon: 0, armor: 0, trinket: 0 };
  for (const item of ITEM_DEFINITIONS) slotCounts[item.slot] += 1;
  for (const slot of ["weapon", "armor", "trinket"] as const) {
    if (slotCounts[slot] !== 3) {
      throw new ContentValidationError(`Expected exactly 3 item definitions for slot ${slot}, found ${slotCounts[slot]}`);
    }
  }

  const affixIds = new Set<string>();
  for (const affix of AFFIX_DEFINITIONS) {
    if (affixIds.has(affix.affixId)) throw new ContentValidationError(`Duplicate affixId: ${affix.affixId}`);
    affixIds.add(affix.affixId);
    const nonZero = [affix.hpBonus, affix.atkBonus, affix.defBonus].filter((v) => v !== 0).length;
    if (nonZero !== 1) {
      throw new ContentValidationError(`Affix ${affix.affixId} must bonus exactly one stat, found ${nonZero}`);
    }
  }

  const enemyIds = new Set<string>();
  const enemySlots = new Set<number>();
  for (const enemy of OLD_ROAD_ENEMIES) {
    if (enemyIds.has(enemy.enemyId)) throw new ContentValidationError(`Duplicate enemyId: ${enemy.enemyId}`);
    enemyIds.add(enemy.enemyId);
    if (enemySlots.has(enemy.slot)) throw new ContentValidationError(`Duplicate enemy slot: ${enemy.slot}`);
    enemySlots.add(enemy.slot);
  }
  if (OLD_ROAD_ENEMIES.length !== 3) throw new ContentValidationError(`Expected exactly 3 Old Road enemies, found ${OLD_ROAD_ENEMIES.length}`);

  const heroClassIds = new Set<string>();
  for (const hero of STARTER_HEROES) {
    getClassDefinition(hero.classId);
    if (heroClassIds.has(hero.classId)) throw new ContentValidationError(`Duplicate starter hero classId: ${hero.classId}`);
    heroClassIds.add(hero.classId);
  }
  if (STARTER_HEROES.length !== 3) throw new ContentValidationError(`Expected exactly 3 starter heroes, found ${STARTER_HEROES.length}`);
}

validateContent();

export const contentPackageVersion = "0.2.0" as const;
