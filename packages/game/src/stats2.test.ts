import { describe, expect, it } from "vitest";
import { computeBattleStartStats, computeDualClassBase, statAtLevel2 } from "./stats2.js";

describe("stats2 (dual-class effective stats, classes.md section 2.1)", () => {
  it("matches the frozen Vanguard/Ranger/Arcanist leveled rows unchanged from M1", () => {
    expect(statAtLevel2("class_vanguard", 5)).toEqual({ hp: 60, atk: 11, def: 10, spd: 8 });
  });

  it("matches classes.md worked example 10.1: level-5 Vanguard/Cleric dual-class base", () => {
    const base = computeDualClassBase("class_vanguard", "class_cleric", 5);
    // primaryLeveled (Vanguard L5) = HP60/ATK11/DEF10/SPD8; secondaryLeveled (Cleric L5) = HP50/ATK11/DEF9/SPD9
    expect(base).toEqual({ hp: 60 + Math.floor(50 / 4), atk: 11 + Math.floor(11 / 4), def: 10 + Math.floor(9 / 4), spd: 8 + Math.floor(9 / 4) });
    expect(base).toEqual({ hp: 72, atk: 13, def: 12, spd: 10 });
  });

  it("degenerates to primaryLeveled with no secondary class", () => {
    expect(computeDualClassBase("class_vanguard", null, 5)).toEqual(statAtLevel2("class_vanguard", 5));
  });

  it("applies equipment bonuses (base + affixes) and Thick Hide's battle-start +15% DEF (gear.md worked example)", () => {
    const stats = computeBattleStartStats({
      primaryClassId: "class_vanguard",
      secondaryClassId: "class_cleric",
      level: 5,
      equipment: {
        weapon: null,
        armor: { definitionId: "item_armor_plate", affixes: [{ affixId: "affix_of_warding", value: 3 }, { affixId: "affix_of_vigor", value: 8 }] },
        trinket: null,
      },
      hasThickHide: true,
    });
    // base HP72/ATK13/DEF12/SPD10 (example above) + Plate Harness (HP2/DEF3) + warding+3/vigor+8
    // -> HP 72+2+8=82, ATK 13, DEF 12+3+3=18, then Thick Hide floor(18*115/100)=20
    expect(stats).toEqual({ maxHp: 82, atk: 13, def: 20, spd: 10 });
  });
});
