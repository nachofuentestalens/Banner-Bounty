import { describe, expect, it } from "vitest";
import { effectiveStatsFor } from "./stats.js";
import type { Hero, ItemInstance } from "./types.js";

function hero(overrides: Partial<Hero> = {}): Hero {
  return {
    heroId: "h1",
    accountId: "a1",
    classId: "class_vanguard",
    level: 1,
    xp: 0,
    specializationId: null,
    equipment: { weapon: null, armor: null, trinket: null },
    ...overrides,
  };
}

describe("effectiveStatsFor (display-only, delegates to packages/game)", () => {
  it("matches the level-1 Vanguard base stats with no gear", () => {
    const h = hero();
    const stats = effectiveStatsFor(h, [h], []);
    expect(stats).toEqual({ maxHp: 40, atk: 7, def: 6, spd: 8 });
  });

  it("adds equipped item bonuses by looking the item up in inventory", () => {
    const item: ItemInstance = { itemInstanceId: "i1", accountId: "a1", definitionId: "item_weapon_shortsword", affixId: null, equippedBy: "h1" };
    const h = hero({ equipment: { weapon: "i1", armor: null, trinket: null } });
    const stats = effectiveStatsFor(h, [h], [item]);
    expect(stats.atk).toBe(10); // 7 base + 3 shortsword
  });
});
