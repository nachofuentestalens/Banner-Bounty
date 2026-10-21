import { describe, expect, it } from "vitest";
import { canAssignSecondaryClass, canEditEquipment, isActivityActive, isDungeonActive, isExpeditionActive, isFormationComplete, isSecondaryClassUnlocked } from "./rules.js";

describe("isFormationComplete", () => {
  it("is false with no formation", () => {
    expect(isFormationComplete({ formation: null })).toBe(false);
  });
  it("is false with every slot empty", () => {
    expect(isFormationComplete({ formation: { accountId: "a", slots: [null, null, null, null, null] } })).toBe(false);
  });
  it("is true with at least one filled slot", () => {
    expect(isFormationComplete({ formation: { accountId: "a", slots: ["h1", null, null, null, null] } })).toBe(true);
  });
});

describe("isExpeditionActive / isDungeonActive / isActivityActive", () => {
  const none = { status: "none" as const, areaId: null, checkpointAt: null, cyclesCompletedSinceStart: 0 as const };
  const active = {
    status: "active" as const,
    areaId: "area_old_road",
    startedAt: "t",
    checkpointAt: "t",
    frozenLoadout: null,
    rulesVersion: 1,
    cyclesCompletedSinceStart: 0,
    wins: 0,
    losses: 0,
  };
  const dungeonNone = { status: "none" as const, dungeonId: null, startedAt: null, checkpointAt: null, currentFloor: 1, floorsCleared: 0, rulesVersion: null, outcome: "none" as const };
  const dungeonActive = { ...dungeonNone, status: "active" as const };

  it("reflects expedition.status", () => {
    expect(isExpeditionActive({ expedition: none })).toBe(false);
    expect(isExpeditionActive({ expedition: active })).toBe(true);
  });

  it("reflects dungeon.status", () => {
    expect(isDungeonActive({ dungeon: dungeonNone })).toBe(false);
    expect(isDungeonActive({ dungeon: dungeonActive })).toBe(true);
  });

  it("is true if either activity is active (gear.md: only one may run per account)", () => {
    expect(isActivityActive({ expedition: none, dungeon: dungeonNone })).toBe(false);
    expect(isActivityActive({ expedition: active, dungeon: dungeonNone })).toBe(true);
    expect(isActivityActive({ expedition: none, dungeon: dungeonActive })).toBe(true);
  });
});

describe("dual-class and equip gating (ui-spec.md disabled.* rules)", () => {
  it("locks secondary-class assignment below level 3", () => {
    expect(isSecondaryClassUnlocked({ level: 2 })).toBe(false);
    expect(isSecondaryClassUnlocked({ level: 3 })).toBe(true);
  });

  it("allows assigning a secondary class above level 3, outside an active progression activity", () => {
    expect(canAssignSecondaryClass({ level: 3 }, false)).toBe(true);
    expect(canAssignSecondaryClass({ level: 3 }, true)).toBe(false);
    expect(canAssignSecondaryClass({ level: 2 }, false)).toBe(false);
  });

  it("freezes equipment edits during an active progression activity", () => {
    expect(canEditEquipment(false)).toBe(true);
    expect(canEditEquipment(true)).toBe(false);
  });
});
