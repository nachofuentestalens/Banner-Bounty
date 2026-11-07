import { describe, it, expect } from "vitest";
import { CLASSES_V3, RACES_V3, autoFillLoadoutV3 } from "@banner-and-bounty/content";
import { computeBattleStartStatsV3, previewPrimaryRespecV3, previewSecondarySwitchV3, respecCostV3, statAtLevelV3, type HeroBuildV3 } from "./builds3.js";

const warder: HeroBuildV3 = {
  primaryClassId: "class_warder", secondaryClassId: "class_vanguard", primarySpecializationId: "m3spec_warder_anchor",
  raceId: "race_cairn", level: 5, slotIndex: 0, equipment: { weapon: null, armor: null, trinket: null },
  skillLoadout: { active: ["skill_warder_brace", "bulwark_call"], passive: ["skill_warder_rooted", "thick_hide"] },
};

describe("M3 build arithmetic and pure edit previews", () => {
  it("sums race/Rooted/Thick Hide percentages before rounding and re-evaluates formation from base", () => {
    // L5 Warder 58/10/10/7 + floor(Vanguard 60/11/10/8 / 4) = 73/12/12/9.
    // DEF floor(12 * (100+10+10+15)/100) = 16, SPD 9-1 = 8.
    const saved = structuredClone(warder);
    expect(computeBattleStartStatsV3(warder)).toEqual({ maxHp: 73, atk: 12, def: 16, spd: 8 });
    expect(computeBattleStartStatsV3({ ...warder, slotIndex: 3 })).toEqual({ maxHp: 73, atk: 12, def: 15, spd: 8 });
    expect(computeBattleStartStatsV3(warder).def).toBe(16);
    expect(warder).toEqual(saved);
  });
  it("applies race once after gear and floors each stat", () => {
    const build = { ...warder, raceId: "race_vesper" as const, equipment: { ...warder.equipment,
      armor: { definitionId: "item_armor_plate", affixes: [{ affixId: "affix_of_warding" as const, value: 3 }] } } };
    // HP (73+2)*1.05; ATK 12*.95; DEF (12+3+3)*(1+.1+.15).
    expect(computeBattleStartStatsV3(build)).toEqual({ maxHp: 78, atk: 11, def: 22, spd: 9 });
    expect(computeBattleStartStatsV3({ ...build, raceId: "race_serein" })).toEqual({ maxHp: 71, atk: 12, def: 22, spd: 10 });
  });
  it("supports every race/class at all unlock levels without race locks", () => {
    for (const c of CLASSES_V3) for (const race of RACES_V3) for (const level of [1, 3, 5, 8, 10]) {
      const stats = computeBattleStartStatsV3({ ...warder, primaryClassId: c.classId, secondaryClassId: null,
        primarySpecializationId: null, raceId: race.raceId, level, skillLoadout: autoFillLoadoutV3(c.classId, level) });
      expect(stats.maxHp).toBeGreaterThanOrEqual(1);
      expect(stats.atk).toBeGreaterThanOrEqual(1);
      expect(stats.def).toBeGreaterThanOrEqual(0);
      expect(stats.spd).toBeGreaterThanOrEqual(1);
      expect(Object.values(stats).every(Number.isInteger)).toBe(true);
    }
    expect(statAtLevelV3("class_weaver", 10)).toEqual({ hp: 65, atk: 27, def: 12, spd: 10 });
  });
  it.each([[1, 100, 5, 0], [5, 500, 25, 1], [10, 1000, 50, 1]])("previews level %i respec with exact cost and primary defaults", (level, gold, scrap, sigil) => {
    const build = { ...warder, level, secondaryClassId: null, primarySpecializationId: null, skillLoadout: autoFillLoadoutV3("class_warder", level), xp: 123, lastRespecAt: null };
    const saved = structuredClone(build);
    const preview = previewPrimaryRespecV3(build, "class_weaver");
    expect(preview.cost).toEqual({ gold, scrap, sigil });
    expect(preview.cooldownMs).toBe(86400000);
    expect(preview.build.skillLoadout).toEqual(autoFillLoadoutV3("class_weaver", level));
    expect(preview.build.primarySpecializationId).toBeNull();
    expect(preview.build).toMatchObject({ level, xp: 123, raceId: build.raceId, equipment: build.equipment, lastRespecAt: null });
    expect(build).toEqual(saved);
  });
  it("rejects same primary and preserved secondary conflicts without changing inputs", () => {
    expect(() => previewPrimaryRespecV3(warder, "class_warder")).toThrow();
    expect(() => previewPrimaryRespecV3(warder, "class_vanguard")).toThrow();
    expect(previewPrimaryRespecV3(warder, "class_vanguard", null).build.secondaryClassId).toBeNull();
    expect(() => respecCostV3(0)).toThrow();
  });
  it("free secondary edit clears only unavailable slots, preserving specialization and cooldown", () => {
    const saved = { ...warder, lastRespecAt: 1000 };
    const changed = previewSecondarySwitchV3(saved, "class_cleric");
    expect(changed.skillLoadout).toEqual({ active: ["skill_warder_brace", ""], passive: ["skill_warder_rooted", ""] });
    expect(changed.primarySpecializationId).toBe(saved.primarySpecializationId);
    expect(changed.lastRespecAt).toBe(1000);
    expect(previewSecondarySwitchV3(saved, saved.secondaryClassId)).toEqual(saved);
    expect(saved.skillLoadout.active[1]).toBe("bulwark_call");
  });
});
