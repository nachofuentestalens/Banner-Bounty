import { describe, expect, it } from "vitest";
import { composeItemName } from "./copy.js";

describe("composeItemName (copy.md implementation note)", () => {
  it("returns the base name with no affixes", () => {
    expect(composeItemName("item_weapon_shortsword", [])).toBe("Shortsword");
  });

  it("appends the affix name as a suffix", () => {
    expect(composeItemName("item_weapon_shortsword", [{ affixId: "affix_of_power", value: 2 }])).toBe("Shortsword of Power");
  });

  it("appends every rolled affix in order for a multi-affix item", () => {
    expect(
      composeItemName("item_weapon_shortsword", [
        { affixId: "affix_of_power", value: 2 },
        { affixId: "affix_of_vigor", value: 6 },
      ]),
    ).toBe("Shortsword of Power of Vigor");
  });
});
