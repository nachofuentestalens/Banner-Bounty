// Display-only effective stat computation. Reuses packages/game's pure
// combat.md formula (ui-spec.md 2: "exact formula from combat.md, display
// only, no recompute in UI" — meaning the UI never re-derives a battle
// *outcome*; computing the same frozen stat formula for a read-only display
// is the intended use of that shared pure function, not a reimplementation).
import { computeHeroEffectiveStats, type EffectiveStats, type HeroLoadoutInput } from "@banner-and-bounty/game";
import type { ClassId, SpecializationId } from "@banner-and-bounty/content";
import type { Hero, ItemInstance } from "./types.js";

function resolveEquipped(itemInstanceId: string | null, inventory: ItemInstance[]) {
  if (!itemInstanceId) return null;
  const item = inventory.find((i) => i.itemInstanceId === itemInstanceId);
  if (!item) return null;
  return { definitionId: item.definitionId, affixId: item.affixId };
}

function toLoadout(hero: Hero, inventory: ItemInstance[]): HeroLoadoutInput {
  return {
    classId: hero.classId as ClassId,
    level: hero.level,
    specializationId: hero.specializationId as SpecializationId | null,
    equipment: {
      weapon: resolveEquipped(hero.equipment.weapon, inventory),
      armor: resolveEquipped(hero.equipment.armor, inventory),
      trinket: resolveEquipped(hero.equipment.trinket, inventory),
    },
  };
}

export function heroHasPathfinder(heroes: Hero[]): boolean {
  return heroes.some((h) => h.level >= 3 && h.specializationId === "spec_pathfinder");
}

export function effectiveStatsFor(hero: Hero, allHeroes: Hero[], inventory: ItemInstance[]): EffectiveStats {
  return computeHeroEffectiveStats(toLoadout(hero, inventory), heroHasPathfinder(allHeroes));
}
