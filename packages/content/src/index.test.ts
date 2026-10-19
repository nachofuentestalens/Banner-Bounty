import { describe, expect, it } from "vitest";
import {
  AFFIX_DEFINITIONS,
  CLASS_DEFINITIONS,
  ContentValidationError,
  ITEM_DEFINITIONS,
  OLD_ROAD_ENEMIES,
  STARTER_HEROES,
  TOLLKEEPER,
  assertSpecializationForClass,
  contentPackageVersion,
  getAffixDefinition,
  getClassDefinition,
  getItemDefinition,
  getSpecializationClass,
  powerScore,
  validateContent,
} from "./index.js";

describe("content package", () => {
  it("exports a version marker", () => {
    expect(contentPackageVersion).toBe("0.2.0");
  });

  it("validates the frozen tables without throwing", () => {
    expect(() => validateContent()).not.toThrow();
  });

  it("defines exactly 3 classes, 9 items, 3 affixes, 3 enemies, 1 boss, 3 starter heroes", () => {
    expect(CLASS_DEFINITIONS).toHaveLength(3);
    expect(ITEM_DEFINITIONS).toHaveLength(9);
    expect(AFFIX_DEFINITIONS).toHaveLength(3);
    expect(OLD_ROAD_ENEMIES).toHaveLength(3);
    expect(TOLLKEEPER.enemyId).toBe("boss_tollkeeper");
    expect(STARTER_HEROES).toHaveLength(3);
  });

  it("matches the frozen Vanguard stat row (combat.md 1.1)", () => {
    const vanguard = getClassDefinition("class_vanguard");
    expect(vanguard).toMatchObject({ hpBase: 40, hpGrowth: 5, atkBase: 7, atkGrowth: 1, defBase: 6, defGrowth: 1, spd: 8 });
  });

  it("matches the frozen item/affix bonus rows (content.md 2.1/2.2)", () => {
    expect(getItemDefinition("item_weapon_shortsword")).toMatchObject({ slot: "weapon", atkBonus: 3 });
    expect(getItemDefinition("item_armor_robe")).toMatchObject({ slot: "armor", hpBonus: 6 });
    expect(getAffixDefinition("affix_of_vigor")).toMatchObject({ hpBonus: 3, atkBonus: 0, defBonus: 0 });
  });

  it("computes powerScore as the unweighted bonus sum (content.md 2.3)", () => {
    expect(powerScore({ hpBonus: 4, atkBonus: 0, defBonus: 1 })).toBe(5);
  });

  it("maps each specialization to its owning class", () => {
    expect(getSpecializationClass("spec_guardian")).toBe("class_vanguard");
    expect(getSpecializationClass("spec_pathfinder")).toBe("class_ranger");
    expect(getSpecializationClass("spec_warden")).toBe("class_arcanist");
    expect(() => assertSpecializationForClass("class_vanguard", "spec_marksman")).toThrow(ContentValidationError);
    expect(() => assertSpecializationForClass("class_ranger", "spec_marksman")).not.toThrow();
  });

  it("fails clearly on unknown content references", () => {
    expect(() => getClassDefinition("class_bogus")).toThrow(/Unknown classId: class_bogus/);
    expect(() => getItemDefinition("item_bogus")).toThrow(/Unknown item definitionId: item_bogus/);
    expect(() => getAffixDefinition("affix_bogus")).toThrow(/Unknown affixId: affix_bogus/);
    expect(() => getSpecializationClass("spec_bogus")).toThrow(/Unknown specializationId: spec_bogus/);
  });
});
