import { describe, it, expect } from "vitest";
import {
  CLASSES_V3, DUNGEONS_V3, SPECIALIZATIONS_V3, RACES_V3, SKILLS_V3,
  autoFillLoadoutV3, getDungeonV3, validateContentV3, validateLoadoutV3, validateSpecializationV3,
} from "./index.js";
import { CLASS_BASE_STATS_V2 } from "../v2/classes.js";
import { DUNGEONS, AREAS } from "../v2/encounters.js";

describe("M3 versioned content", () => {
  it("validates exact bounded content while preserving M2 catalogs", () => {
    expect(() => validateContentV3()).not.toThrow();
    expect(CLASSES_V3).toHaveLength(8);
    expect(SKILLS_V3).toHaveLength(40);
    expect(SPECIALIZATIONS_V3).toHaveLength(16);
    expect(RACES_V3).toHaveLength(3);
    expect(DUNGEONS_V3).toHaveLength(2);
    expect(CLASS_BASE_STATS_V2).toHaveLength(6);
    expect(DUNGEONS).toHaveLength(1);
    expect(AREAS.map(a => a.areaId)).toEqual(["area_old_road", "area_sunken_aqueduct"]);
    expect(CLASSES_V3.slice(0, 6)).toEqual(CLASS_BASE_STATS_V2);
  });
  it("keeps exactly four 180-second Archive floors, sparse slots, clear unlock and existing rewards", () => {
    const dungeon = getDungeonV3("dungeon_cinder_archive");
    expect(dungeon.unlockRequirement).toEqual({ kind: "dungeonClear", value: "dungeon_aqueduct_depths" });
    expect(dungeon.floorDurationMs).toBe(180000);
    expect(dungeon.floors.map(f => f.enemies.map(e => e.slotIndex))).toEqual([[0, 3], [0, 3, 4], [0, 1, 4], [0, 3]]);
    expect(dungeon.floors.map(f => f.rewardProfileId)).toEqual(["dungeon_2_ordinary", "dungeon_2_ordinary", "dungeon_2_ordinary", "dungeon_2_boss"]);
    expect(() => getDungeonV3("stale_id")).toThrow();
  });
  it.each(CLASSES_V3)("validates $classId kits at 1/3/5/8/10 and each own specialization", c => {
    for (const level of [1, 3, 5, 8, 10]) {
      const loadout = autoFillLoadoutV3(c.classId, level);
      expect(() => validateLoadoutV3(c.classId, null, level, loadout)).not.toThrow();
      expect(loadout.active.filter(Boolean)).toHaveLength(level >= 5 ? 2 : 1);
      expect(loadout.passive.filter(Boolean)).toHaveLength(level >= 8 ? 2 : 1);
      for (const spec of SPECIALIZATIONS_V3.filter(s => s.classId === c.classId)) {
        const validate = () => validateSpecializationV3(c.classId, level, spec.specializationId);
        if (level < 3) expect(validate).toThrow(); else expect(validate).not.toThrow();
      }
    }
  });
  it("rejects locked, basic, duplicate, unknown, wrong-kind and wrong-class slots atomically", () => {
    const good = autoFillLoadoutV3("class_warder", 3);
    for (const active of [["skill_warder_repair", ""], ["skill_warder_tap", ""], ["skill_warder_brace", "skill_warder_brace"], ["unknown", ""], ["skill_warder_rooted", ""], ["firebolt", ""]] as const) {
      expect(() => validateLoadoutV3("class_warder", null, 3, { ...good, active })).toThrow();
    }
    expect(() => validateLoadoutV3("class_warder", "class_warder", 3, good)).toThrow();
    expect(() => validateLoadoutV3("class_warder", "class_cleric", 1, good)).toThrow();
    expect(() => validateSpecializationV3("class_warder", 5, "m3spec_cleric_triage")).toThrow();
    expect(() => validateSpecializationV3("class_warder", 5, "spec_vanguard_bastion")).toThrow();
    expect(() => validateLoadoutV3("class_warder", "class_cleric", 5, { active: ["skill_warder_repair", "mending_light"], passive: ["skill_warder_rooted", "devotion"] })).not.toThrow();
  });
});
