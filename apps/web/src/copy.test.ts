import { describe, expect, it } from "vitest";
import { composeItemName } from "./copy.js";

describe("composeItemName (copy.md implementation note)", () => {
  it("returns the base name with no affix", () => {
    expect(composeItemName("item_weapon_shortsword", null)).toBe("Shortsword");
  });

  it("appends the affix name as a suffix", () => {
    expect(composeItemName("item_weapon_shortsword", "affix_of_power")).toBe("Shortsword of Power");
  });
});
