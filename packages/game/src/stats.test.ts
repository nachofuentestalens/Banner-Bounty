import { describe, expect, it } from "vitest";
import {
  computeHeroEffectiveStats,
  computePartyEffectiveStats,
  effectiveSpecialization,
  partyHasPathfinder,
  statAtLevel,
  type HeroLoadoutInput,
} from "./stats.js";

const emptyEquipment = { weapon: null, armor: null, trinket: null };

describe("statAtLevel", () => {
  it("matches the worked example: level-5 Vanguard (combat.md 1.1)", () => {
    expect(statAtLevel("class_vanguard", 5)).toEqual({ hp: 60, atk: 11, def: 10, spd: 8 });
  });

  it("SPD never grows with level", () => {
    expect(statAtLevel("class_ranger", 1).spd).toBe(12);
    expect(statAtLevel("class_ranger", 10).spd).toBe(12);
  });
});

describe("effectiveSpecialization", () => {
  it("is null below level 3 regardless of the stored specializationId", () => {
    expect(effectiveSpecialization({ level: 2, specializationId: "spec_berserker" })).toBeNull();
  });

  it("passes through at level 3+", () => {
    expect(effectiveSpecialization({ level: 3, specializationId: "spec_berserker" })).toBe("spec_berserker");
  });
});

describe("computeHeroEffectiveStats", () => {
  function hero(overrides: Partial<HeroLoadoutInput> = {}): HeroLoadoutInput {
    return { classId: "class_vanguard", level: 1, specializationId: null, equipment: emptyEquipment, ...overrides };
  }

  it("sums equipped base + affix bonuses onto leveled stats (content.md 2.1/2.2)", () => {
    const stats = computeHeroEffectiveStats(
      hero({
        equipment: {
          weapon: { definitionId: "item_weapon_longspear", affixId: "affix_of_power" }, // +2 atk, +1 def, +2 atk
          armor: null,
          trinket: null,
        },
      }),
      false,
    );
    // base: hp40 atk7 def6 spd8; longspear +2atk+1def; affix_of_power +2atk
    expect(stats).toEqual({ maxHp: 40, atk: 11, def: 7, spd: 8 });
  });

  it("applies the Guardian +2 DEF modifier once at battle start (combat.md 3.4)", () => {
    const stats = computeHeroEffectiveStats(hero({ level: 3, specializationId: "spec_guardian" }), false);
    expect(stats.def).toBe(10); // level-3 Vanguard DEF=8, +2 Guardian
  });

  it("matches the worked Berserker example (combat.md worked example 10)", () => {
    const stats = computeHeroEffectiveStats(hero({ level: 1, specializationId: "spec_berserker" }), false);
    // level<3 so spec is gated off -> unmodified; re-run at level 3 for the real case
    expect(stats).toEqual({ maxHp: 40, atk: 7, def: 6, spd: 8 });
    const level3 = computeHeroEffectiveStats(hero({ level: 3, specializationId: "spec_berserker" }), false);
    // level-3 Vanguard: atk=9, def=8 -> floor(9*7/5)=12, floor(8*4/5)=6
    expect(level3).toEqual({ maxHp: 50, atk: 12, def: 6, spd: 8 });
  });

  it("applies the party-wide Pathfinder +2 SPD bonus", () => {
    const stats = computeHeroEffectiveStats(hero(), true);
    expect(stats.spd).toBe(10);
  });
});

describe("partyHasPathfinder / computePartyEffectiveStats", () => {
  it("detects a level-3+ Pathfinder anywhere in the party and applies the bonus to all 3", () => {
    const party: HeroLoadoutInput[] = [
      { classId: "class_vanguard", level: 1, specializationId: null, equipment: emptyEquipment },
      { classId: "class_ranger", level: 3, specializationId: "spec_pathfinder", equipment: emptyEquipment },
      { classId: "class_arcanist", level: 1, specializationId: null, equipment: emptyEquipment },
    ];
    expect(partyHasPathfinder(party)).toBe(true);
    const stats = computePartyEffectiveStats(party);
    expect(stats[0]!.spd).toBe(10); // vanguard 8+2
    expect(stats[2]!.spd).toBe(11); // arcanist 9+2
  });

  it("does not apply the bonus for a sub-level-3 Pathfinder pick", () => {
    const party: HeroLoadoutInput[] = [
      { classId: "class_vanguard", level: 1, specializationId: null, equipment: emptyEquipment },
      { classId: "class_ranger", level: 2, specializationId: "spec_pathfinder", equipment: emptyEquipment },
      { classId: "class_arcanist", level: 1, specializationId: null, equipment: emptyEquipment },
    ];
    expect(partyHasPathfinder(party)).toBe(false);
  });
});
