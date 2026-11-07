import { describe, expect, it } from "vitest";
import { CLASSES_V3, RACES_V3 } from "@banner-and-bounty/content";
import { buildCodexClassEntryV3, buildCodexV3, skillsForClassV3, specializationsForClassV3, statCurveV3, SECONDARY_CONTRIBUTION_PERCENT_V3 } from "./codex3.js";

describe("buildCodexV3", () => {
  it("lists exactly the eight frozen classes with a 25% secondary contribution", () => {
    const codex = buildCodexV3();
    expect(codex.secondaryContributionPercent).toBe(25);
    expect(SECONDARY_CONTRIBUTION_PERCENT_V3).toBe(25);
    expect(codex.classes.map((c) => c.classId).sort()).toEqual(CLASSES_V3.map((c) => c.classId).sort());
  });

  it("lists exactly the three race tradeoffs unchanged", () => {
    const codex = buildCodexV3();
    expect(codex.races).toBe(RACES_V3);
    expect(codex.races).toHaveLength(3);
  });

  it("gives every class exactly 5 skills (1 basic + 2 active + 2 passive), including locked ones with their unlock level", () => {
    for (const c of CLASSES_V3) {
      const entry = buildCodexClassEntryV3(c.classId);
      expect(entry.skills).toHaveLength(5);
      expect(entry.skills.filter((s) => s.kind === "basic")).toHaveLength(1);
      expect(entry.skills.filter((s) => s.kind === "active")).toHaveLength(2);
      expect(entry.skills.filter((s) => s.kind === "passive")).toHaveLength(2);
      // Level-8 passive stays listed (locked, not hidden) even though a level-1 build can't equip it.
      expect(entry.skills.some((s) => s.unlockLevel === 8)).toBe(true);
    }
  });

  it("orders each class's skills basic, then active (ascending unlock level), then passive (ascending unlock level)", () => {
    const warder = skillsForClassV3("class_warder");
    expect(warder.map((s) => s.skillId)).toEqual([
      "skill_warder_tap",
      "skill_warder_brace",
      "skill_warder_repair",
      "skill_warder_rooted",
      "skill_warder_aftercare",
    ]);
  });

  it("gives every class exactly 2 specializations, each referencing a real active skill of that class", () => {
    for (const c of CLASSES_V3) {
      const specs = specializationsForClassV3(c.classId);
      expect(specs).toHaveLength(2);
      const activeSkillIds = skillsForClassV3(c.classId).filter((s) => s.kind === "active").map((s) => s.skillId);
      for (const spec of specs) expect(activeSkillIds).toContain(spec.skillId);
    }
  });

  it("computes a 10-entry stat curve per class matching the frozen base/growth formula", () => {
    const curve = statCurveV3("class_warder");
    expect(curve).toHaveLength(10);
    expect(curve[0]).toEqual({ level: 1, hp: 38, atk: 6, def: 6, spd: 7 });
    expect(curve[9]).toEqual({ level: 10, hp: 83, atk: 15, def: 15, spd: 7 }); // 38+5*9, 6+1*9, 6+1*9
  });

  it("rejects an unknown class id", () => {
    expect(() => buildCodexClassEntryV3("class_nonexistent" as never)).toThrow();
  });
});
