import { describe, expect, it } from "vitest";
import { applyXpGain, xpToNext } from "./xp.js";

describe("xpToNext", () => {
  it("matches the frozen curve (baseline.md section 1)", () => {
    expect(xpToNext(1)).toBe(15);
    expect(xpToNext(9)).toBe(135);
  });

  it("returns null at the level-10 cap", () => {
    expect(xpToNext(10)).toBeNull();
  });
});

describe("applyXpGain", () => {
  it("carries remainder XP across a single level-up", () => {
    const result = applyXpGain({ level: 1, xp: 0 }, 20);
    expect(result).toEqual({ level: 2, xp: 5 });
  });

  it("does not level up when XP is short of the threshold", () => {
    const result = applyXpGain({ level: 1, xp: 0 }, 14);
    expect(result).toEqual({ level: 1, xp: 14 });
  });

  it("crosses multiple levels in one transaction (large offline settlement batch)", () => {
    const result = applyXpGain({ level: 1, xp: 0 }, 200);
    // cumulative to level 5 = 150; 200-150=50 into level 5's 75 need
    expect(result).toEqual({ level: 5, xp: 50 });
  });

  it("discards remaining XP once the level-10 cap is reached in this transaction", () => {
    // cumulative to level 10 = 675
    const result = applyXpGain({ level: 9, xp: 130 }, 10); // 140 >= 135 -> level 10, discard the 5 remainder
    expect(result).toEqual({ level: 10, xp: 0 });
  });

  it("discards all further XP once already at the level-10 cap", () => {
    const result = applyXpGain({ level: 10, xp: 0 }, 999);
    expect(result).toEqual({ level: 10, xp: 0 });
  });
});
