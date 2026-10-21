import { getRewardProfile } from "@banner-and-bounty/content";
import { describe, expect, it } from "vitest";
import { createRngState } from "./rng.js";
import {
  INVENTORY_CAP_V2,
  resolveAreaOrDungeonReward,
  resolveCraft,
  resolveReforge,
  resolveStandaloneBossReward,
} from "./crafting.js";

describe("crafting (gear.md sections 2/5/6)", () => {
  it("is deterministic: same seed -> identical roll", () => {
    const profile = getRewardProfile("dungeon_1_boss"); // itemProbabilityPercent 100, guaranteed drop
    const a = resolveAreaOrDungeonReward(createRngState(5), profile, 0);
    const b = resolveAreaOrDungeonReward(createRngState(5), profile, 0);
    expect(a).toEqual(b);
  });

  it("guaranteed-drop profiles (itemProbabilityPercent 100) always produce an item, never roll common for a 0-weight tier", () => {
    const profile = getRewardProfile("dungeon_1_boss"); // weights [0,70,28,2]
    for (let seed = 1; seed <= 50; seed++) {
      const result = resolveAreaOrDungeonReward(createRngState(seed), profile, 0);
      expect(result.itemInstance).not.toBeNull();
      expect(result.itemInstance!.rarityId).not.toBe("common");
    }
  });

  it("rolls no item at all across many seeds for a profile with itemProbabilityPercent 0 (sanity on the chance gate)", () => {
    // reward_area_1 has 25%, so over 200 seeds we expect roughly a quarter to drop and the rest not to.
    const profile = getRewardProfile("reward_area_1");
    let dropped = 0;
    for (let seed = 1; seed <= 400; seed++) {
      if (resolveAreaOrDungeonReward(createRngState(seed), profile, 0).itemInstance !== null) dropped++;
    }
    expect(dropped).toBeGreaterThan(50);
    expect(dropped).toBeLessThan(150);
  });

  it("converts a drop to gold once the account is at the inventory cap, using the rolled rarity's overflow value", () => {
    const profile = getRewardProfile("dungeon_1_boss");
    const result = resolveAreaOrDungeonReward(createRngState(5), profile, INVENTORY_CAP_V2);
    expect(result.itemInstance).toBeNull();
    expect(result.overflowConverted).not.toBeNull();
    expect(result.unequippedCountAfter).toBe(INVENTORY_CAP_V2);
    expect(result.gold).toBeGreaterThan(profile.gold);
  });

  it("standalone boss reward always grants exactly one guaranteed uncommon item", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const result = resolveStandaloneBossReward(createRngState(seed), 40, 150, 0);
      expect(result.itemInstance).not.toBeNull();
      expect(result.itemInstance!.rarityId).toBe("uncommon");
      expect(result.itemInstance!.affixes).toHaveLength(1);
      expect(result.gold).toBe(150);
      expect(result.xp).toBe(40);
    }
  });

  it("craft produces the chosen definition/rarity with the rarity's affix count, no definition/rarity RNG consumed", () => {
    const result = resolveCraft(createRngState(1), "item_weapon_focus", "rare");
    expect(result.item.definitionId).toBe("item_weapon_focus");
    expect(result.item.rarityId).toBe("rare");
    expect(result.item.affixes).toHaveLength(2);
    const ids = result.item.affixes.map((a) => a.affixId);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate affix IDs on one item
  });

  it("reforge replaces only the selected affix, preserves the others, and never reproduces the old (id, value) pair", () => {
    const affixes = [
      { affixId: "affix_of_power" as const, value: 2 },
      { affixId: "affix_of_warding" as const, value: 3 },
    ];
    for (let seed = 1; seed <= 30; seed++) {
      const result = resolveReforge(createRngState(seed), "weapon", "rare", affixes, 0);
      expect(result.affixes[1]).toEqual(affixes[1]); // untouched affix preserved exactly
      const replaced = result.affixes[0]!;
      expect(replaced.affixId === "affix_of_power" ? replaced.value !== 2 : true).toBe(true);
    }
  });

  it("reforge on a trinket's sole non-range affix (haste uncommon, only value 1) must change the affix ID, not the value", () => {
    const affixes = [{ affixId: "affix_of_haste" as const, value: 1 }];
    const result = resolveReforge(createRngState(7), "trinket", "uncommon", affixes, 0);
    expect(result.affixes[0]!.affixId).not.toBe("affix_of_haste");
  });

  it("reforge on an epic item with all IDs occupied retains the same ID and rerolls only the value", () => {
    const affixes = [
      { affixId: "affix_of_power" as const, value: 3 },
      { affixId: "affix_of_warding" as const, value: 3 },
      { affixId: "affix_of_vigor" as const, value: 10 },
    ];
    const result = resolveReforge(createRngState(3), "weapon", "epic", affixes, 2); // reforging the vigor slot
    expect(result.affixes[2]!.affixId).toBe("affix_of_vigor");
    expect(result.affixes[2]!.value).not.toBe(10);
    expect(result.affixes[0]).toEqual(affixes[0]);
    expect(result.affixes[1]).toEqual(affixes[1]);
  });
});
