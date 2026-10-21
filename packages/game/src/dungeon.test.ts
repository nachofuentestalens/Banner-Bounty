import { describe, expect, it } from "vitest";
import { createRngState } from "./rng.js";
import { DUNGEON_FLOOR_LENGTH_MS, computeDungeonSettlementWindow, simulateDungeonFloorBatch } from "./dungeon.js";
import type { PartyMemberInputV2 } from "./party2.js";

function strongParty(): PartyMemberInputV2[] {
  return [
    { heroId: "tank", slotIndex: 0, primaryClassId: "class_vanguard", secondaryClassId: "class_herald", level: 10, equipment: { weapon: null, armor: null, trinket: null }, skillLoadout: { active: ["bulwark_call", "shield_bash"], passive: ["thick_hide", "last_stand"] } },
    { heroId: "cleric", slotIndex: 1, primaryClassId: "class_cleric", secondaryClassId: "class_vanguard", level: 10, equipment: { weapon: null, armor: null, trinket: null }, skillLoadout: { active: ["mending_light", "sanctuary"], passive: ["devotion", "vital_surge"] } },
    { heroId: "rogue", slotIndex: 2, primaryClassId: "class_rogue", secondaryClassId: null, level: 10, equipment: { weapon: null, armor: null, trinket: null }, skillLoadout: { active: ["backstab", "flurry"], passive: ["opportunist", "evasion"] } },
  ];
}

function weakParty(): PartyMemberInputV2[] {
  return [{ heroId: "solo", slotIndex: 0, primaryClassId: "class_arcanist", secondaryClassId: null, level: 1, equipment: { weapon: null, armor: null, trinket: null }, skillLoadout: { active: ["firebolt", ""], passive: ["overload", ""] } }];
}

describe("dungeon (contracts.md /dungeon/settle algorithm, gear.md section 4)", () => {
  it("computeDungeonSettlementWindow caps eligibleFloors at the run's remaining floor count even when more elapsed time is available", () => {
    const window = computeDungeonSettlementWindow(0, 100 * DUNGEON_FLOOR_LENGTH_MS, 4);
    expect(window.eligibleFloors).toBe(4); // capped by floorsRemaining, not the 100-floor-worth of elapsed time
    expect(window.discardedMs).toBe(0); // 100 floors' worth of elapsed time is still under the 8h cap itself
  });

  it("computeDungeonSettlementWindow discards elapsed time beyond the 8h cap", () => {
    const window = computeDungeonSettlementWindow(0, 200 * DUNGEON_FLOOR_LENGTH_MS, 100);
    expect(window.cappedMs).toBe(28_800_000);
    expect(window.discardedMs).toBe(200 * DUNGEON_FLOOR_LENGTH_MS - 28_800_000);
  });

  it("is deterministic: same seed/state -> identical floor-by-floor outcome", () => {
    const input = {
      dungeonId: "dungeon_aqueduct_depths",
      frozenParty: strongParty(),
      currentFloor: 1,
      combatSeedBase: 42,
      rngState: createRngState(42),
      unequippedCount: 0,
      eligibleFloors: 4,
    };
    const a = simulateDungeonFloorBatch(input);
    const b = simulateDungeonFloorBatch(input);
    expect(a).toEqual(b);
  });

  it("a strong party clears all 4 floors, crediting rewards and ending in 'cleared'", () => {
    const result = simulateDungeonFloorBatch({
      dungeonId: "dungeon_aqueduct_depths",
      frozenParty: strongParty(),
      currentFloor: 1,
      combatSeedBase: 7,
      rngState: createRngState(7),
      unequippedCount: 0,
      eligibleFloors: 4,
    });
    expect(result.outcome).toBe("cleared");
    expect(result.floorsProcessed).toBe(4);
    expect(result.floorsClearedDelta).toBe(4);
    expect(result.floorResults.every((f) => f.result === "win")).toBe(true);
    expect(result.floorResults[3]!.isBoss).toBe(true);
    expect(result.floorResults[3]!.rewards!.materials).toEqual({ scrap: 4, sigil: 2, core: 1 }); // gear.md "dungeon 1 final boss" row
  });

  it("stops the batch immediately on a loss, granting no reward for that floor and no further floors", () => {
    const result = simulateDungeonFloorBatch({
      dungeonId: "dungeon_aqueduct_depths",
      frozenParty: weakParty(),
      currentFloor: 1,
      combatSeedBase: 3,
      rngState: createRngState(3),
      unequippedCount: 0,
      eligibleFloors: 4,
    });
    expect(result.outcome).toBe("failed");
    const lastFloor = result.floorResults[result.floorResults.length - 1]!;
    expect(lastFloor.result).toBe("loss");
    expect(lastFloor.rewards).toBeNull();
  });

  it("stops the batch immediately on clearing the final (boss) floor even if more eligibleFloors remain", () => {
    const result = simulateDungeonFloorBatch({
      dungeonId: "dungeon_aqueduct_depths",
      frozenParty: strongParty(),
      currentFloor: 4,
      combatSeedBase: 9,
      rngState: createRngState(9),
      unequippedCount: 0,
      eligibleFloors: 10, // far more than the single remaining floor
    });
    expect(result.floorsProcessed).toBe(1);
    expect(result.outcome).toBe("cleared");
  });
});
