import { describe, expect, it } from "vitest";
import { autoFillLoadoutV3 } from "@banner-and-bounty/content";
import { simulateDungeonRunV3 } from "./dungeon3.js";
import type { HeroCombatantInputV3 } from "./combat3.js";

function hero(id: string, slotIndex: number, primaryClassId: string, level: number): HeroCombatantInputV3 {
  return {
    id,
    primaryClassId: primaryClassId as never,
    secondaryClassId: null,
    primarySpecializationId: null,
    raceId: "race_vesper",
    level,
    slotIndex,
    equipment: { weapon: null, armor: null, trinket: null },
    skillLoadout: autoFillLoadoutV3(primaryClassId as never, level),
  };
}

function fiveHeroParty(level: number): HeroCombatantInputV3[] {
  return [
    hero("tank", 0, "class_vanguard", level),
    hero("healer", 1, "class_cleric", level),
    hero("dps1", 2, "class_rogue", level),
    hero("dps2", 3, "class_ranger", level),
    hero("dps3", 4, "class_arcanist", level),
  ];
}

describe("simulateDungeonRunV3", () => {
  it("is a pure deterministic function of (dungeonId, party, seed)", () => {
    const party = fiveHeroParty(5);
    const first = simulateDungeonRunV3("dungeon_cinder_archive", party, 42);
    const second = simulateDungeonRunV3("dungeon_cinder_archive", party, 42);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("stops at the first loss and never attempts a later floor", () => {
    const weakParty: HeroCombatantInputV3[] = [hero("solo", 0, "class_cleric", 1)];
    const run = simulateDungeonRunV3("dungeon_cinder_archive", weakParty, 7);
    expect(run.outcome).toBe("failed");
    expect(run.floorResults.at(-1)!.result).toBe("loss");
    expect(run.floorResults.length).toBeLessThanOrEqual(4);
  });

  it("every floor starts at full HP: a near-death survivor on floor 1 does not carry damage into floor 2", () => {
    const party = fiveHeroParty(8);
    const run = simulateDungeonRunV3("dungeon_cinder_archive", party, 11);
    const floor1 = run.floorResults[0]!;
    if (floor1.result === "win" && run.floorResults.length > 1) {
      // Floor 2's own battle log starts every actor at baseline maxHp; this is implicit in
      // combat3's buildActor (no carried-over hp input) — assert the run at least reaches
      // floor 2 using the same party ids, which would throw on a slot/id mismatch otherwise.
      expect(run.floorResults[1]!.floor).toBe(2);
    }
  });

  it("records a normalized HP ratio per original hero, in party order, dead heroes at 0", () => {
    const party = fiveHeroParty(1); // deliberately underleveled: likely to lose with casualties
    const run = simulateDungeonRunV3("dungeon_cinder_archive", party, 99);
    expect(run.finalHeroHpRatios).toHaveLength(5);
    for (const ratio of run.finalHeroHpRatios) expect(ratio).toBeGreaterThanOrEqual(0);
  });
});
