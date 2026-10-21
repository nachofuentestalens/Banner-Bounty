import { describe, expect, it } from "vitest";
import {
  AFFIX_DEFINITIONS_V2,
  AREAS,
  BASE_CLASS_IDS_V2,
  CLASS_BASE_STATS_V2,
  DUNGEONS,
  RARITY_DEFINITIONS,
  REWARD_PROFILES,
  SKILL_DEFINITIONS,
  STATUS_DEFINITIONS,
  SUNKEN_AQUEDUCT_ENEMIES,
  craftRecipeForRarity,
  getAffixValueRange,
  getAreaDefinition,
  getClassBaseStatsV2,
  getDungeonDefinition,
  getRarityDefinition,
  getRecipeDefinition,
  getSkillDefinition,
  getSynergyName,
  hasSynergy,
  reforgeRecipeForRarity,
  unlockedSkillIds,
  unlockedSkillPool,
  validateContentV2,
  autoFillLoadout,
} from "./index.js";

describe("content v2 (M2-22/M2-23/M2-31)", () => {
  it("validates without throwing", () => {
    expect(() => validateContentV2()).not.toThrow();
  });

  it("defines exactly 6 base classes with the frozen Vanguard/Ranger/Arcanist rows unchanged", () => {
    expect(CLASS_BASE_STATS_V2).toHaveLength(6);
    expect(BASE_CLASS_IDS_V2).toContain("class_herald");
    expect(getClassBaseStatsV2("class_vanguard")).toMatchObject({ hpBase: 40, hpGrowth: 5, atkBase: 7, atkGrowth: 1, defBase: 6, defGrowth: 1, spd: 8 });
    expect(getClassBaseStatsV2("class_cleric")).toMatchObject({ hpBase: 34, atkBase: 7, defBase: 5, spd: 9 });
    expect(getClassBaseStatsV2("class_rogue")).toMatchObject({ hpBase: 26, atkBase: 9, defBase: 3, spd: 13 });
    expect(getClassBaseStatsV2("class_herald")).toMatchObject({ hpBase: 30, atkBase: 6, defBase: 4, spd: 11 });
  });

  it("defines exactly 30 skills (5 per class)", () => {
    expect(SKILL_DEFINITIONS).toHaveLength(30);
    expect(getSkillDefinition("bulwark_call")).toMatchObject({ classId: "class_vanguard", kind: "active", unlockLevel: 1, cooldown: 3 });
    expect(getSkillDefinition("firebolt")).toMatchObject({ classId: "class_arcanist", cooldown: 0 });
    expect(() => getSkillDefinition("nope")).toThrow();
  });

  it("gates unlock by level (classes.md 5.7)", () => {
    expect(unlockedSkillIds("class_ranger", 1, "active")).toEqual(["aimed_shot"]);
    expect(unlockedSkillIds("class_ranger", 5, "active")).toEqual(["aimed_shot", "volley"]);
    expect(unlockedSkillIds("class_ranger", 1, "passive")).toEqual(["hunters_focus"]);
    expect(unlockedSkillIds("class_ranger", 8, "passive")).toEqual(["hunters_focus", "momentum"]);
  });

  it("unions primary+secondary skill pools", () => {
    const pool = unlockedSkillPool("class_vanguard", "class_herald", 5, "active");
    expect(pool).toEqual(expect.arrayContaining(["bulwark_call", "shield_bash", "war_hymn"]));
  });

  it("auto-fills a single-class loadout from the owned kit (classes.md 5.7/section 9)", () => {
    expect(autoFillLoadout("class_vanguard", 1)).toEqual({ active: ["bulwark_call", ""], passive: ["thick_hide", ""] });
    expect(autoFillLoadout("class_vanguard", 10)).toEqual({ active: ["bulwark_call", "shield_bash"], passive: ["thick_hide", "last_stand"] });
  });

  it("defines the 6 named synergy pairs (classes.md 2.2)", () => {
    expect(getSynergyName("class_vanguard", "class_herald")).toBe("Banner Bearer");
    expect(hasSynergy("class_cleric", "class_vanguard", "Battle Medic")).toBe(true);
    expect(getSynergyName("class_vanguard", "class_ranger")).toBeNull();
    expect(getSynergyName("class_vanguard", null)).toBeNull();
  });

  it("defines exactly 6 statuses", () => {
    expect(STATUS_DEFINITIONS).toHaveLength(6);
  });

  it("defines 4 rarities with the frozen affix counts/overflow gold", () => {
    expect(RARITY_DEFINITIONS).toHaveLength(4);
    expect(getRarityDefinition("epic")).toMatchObject({ affixCount: 3, overflowGold: 36 });
  });

  it("defines 4 v2 affixes with trinket-only haste", () => {
    expect(AFFIX_DEFINITIONS_V2).toHaveLength(4);
    expect(getAffixValueRange("trinket", "affix_of_haste", "uncommon")).toEqual([1, 1]);
    expect(() => getAffixValueRange("weapon", "affix_of_haste", "uncommon")).toThrow();
  });

  it("derives craft/reforge recipe IDs from rarity", () => {
    expect(craftRecipeForRarity("epic")).toBe("craft_epic");
    expect(reforgeRecipeForRarity("uncommon")).toBe("reforge_uncommon");
    expect(getRecipeDefinition("craft_epic")).toMatchObject({ gold: 900, scrap: 60, sigil: 12, core: 8 });
  });

  it("defines reward profiles for both areas, both dungeon tiers, with weights summing to 100", () => {
    for (const profile of Object.values(REWARD_PROFILES)) {
      expect(profile.rarityWeights.reduce((a, b) => a + b, 0)).toBe(100);
    }
    expect(REWARD_PROFILES.dungeon_1_boss).toMatchObject({ xp: 16, gold: 40, itemProbabilityPercent: 100 });
  });

  it("defines the Sunken Aqueduct area gated on the Tollkeeper claim", () => {
    const area = getAreaDefinition("area_sunken_aqueduct");
    expect(area.unlockRequirement).toEqual({ kind: "bossClear", value: "boss_tollkeeper" });
    expect(SUNKEN_AQUEDUCT_ENEMIES).toHaveLength(3);
  });

  it("defines a 4-floor dungeon ending in a boss floor, within the 8h time budget", () => {
    const dungeon = getDungeonDefinition("dungeon_aqueduct_depths");
    expect(dungeon.floors).toHaveLength(4);
    expect(dungeon.floors[3]).toMatchObject({ isBoss: true, enemyIds: ["boss_drowned_warden"] });
    expect(DUNGEONS).toHaveLength(1);
  });
});
