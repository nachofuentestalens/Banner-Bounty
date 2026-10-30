import { describe, expect, it } from "vitest";
import { canAssignSecondaryClass, canEditEquipment, isActivityActive, isDungeonActive, isExpeditionActive, isFormationComplete, isSecondaryClassUnlocked, nextGoal } from "./rules.js";
import type { AccountState, Hero } from "./types.js";

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

describe("nextGoal (first-session-redesign.md section 4.2's seven-rung goal ladder)", () => {
  function hero(overrides: Partial<Hero>): Hero {
    return {
      heroId: "h1",
      accountId: "a1",
      primaryClassId: "class_vanguard",
      secondaryClassId: null,
      level: 1,
      xp: 0,
      skillLoadout: { active: ["strike", ""], passive: ["", ""] },
      equipment: { weapon: null, armor: null, trinket: null },
      ...overrides,
    };
  }

  function baseState(overrides: Partial<AccountState> = {}): AccountState {
    return {
      heroes: [hero({})],
      inventory: [],
      formation: { accountId: "a1", slots: ["h1", null, null, null, null] },
      areas: [{ areaId: "area_old_road", unlocked: true, isSelected: true }],
      selectedAreaId: "area_old_road",
      expedition: { status: "none", areaId: null, checkpointAt: null, cyclesCompletedSinceStart: 0 },
      dungeon: { status: "none", dungeonId: null, startedAt: null, checkpointAt: null, currentFloor: 0, floorsCleared: 0, rulesVersion: null, outcome: "none" },
      gold: 0,
      materials: { scrap: 0, sigil: 0, core: 0 },
      bossClaims: [],
      revision: 1,
      ...overrides,
    };
  }

  it("goal 1: dispatch — never run, every hero fresh Lv1/XP0", () => {
    expect(nextGoal(baseState()).id).toBe("dispatch");
  });

  it("goal 2: watch_or_collect — an expedition is active", () => {
    const state = baseState({
      heroes: [hero({ level: 2, xp: 10 })],
      expedition: { status: "active", areaId: "area_old_road", startedAt: "2026-01-01T00:00:00Z", checkpointAt: "2026-01-01T00:00:00Z", frozenLoadout: null, rulesVersion: 1, cyclesCompletedSinceStart: 1, wins: 1, losses: 0 },
    });
    expect(nextGoal(state).id).toBe("watch_or_collect");
  });

  it("goal 2: watch_or_collect — a dungeon is active (takes priority over equip/secondary)", () => {
    const state = baseState({
      heroes: [hero({ level: 2, xp: 10 })],
      dungeon: { status: "active", dungeonId: "dungeon_aqueduct_depths", startedAt: "x", checkpointAt: "x", currentFloor: 1, floorsCleared: 0, rulesVersion: 1, outcome: "none" },
    });
    expect(nextGoal(state).id).toBe("watch_or_collect");
  });

  it("goal 3: equip — an unequipped item fits a fielded hero's empty slot", () => {
    const state = baseState({
      heroes: [hero({ level: 2, xp: 10 })],
      inventory: [{ itemInstanceId: "i1", accountId: "a1", definitionId: "item_weapon_shortsword", rarityId: "common", affixes: [], equippedBy: null }],
    });
    const goal = nextGoal(state);
    expect(goal.id).toBe("equip");
    expect(goal.heroId).toBe("h1");
    expect(goal.slot).toBe("weapon");
  });

  it("goal 3 does not fire for an item with no fielded hero to take it", () => {
    const state = baseState({
      heroes: [hero({ level: 2, xp: 10, equipment: { weapon: "already", armor: null, trinket: null } })],
      inventory: [{ itemInstanceId: "i1", accountId: "a1", definitionId: "item_weapon_shortsword", rarityId: "common", affixes: [], equippedBy: null }],
    });
    expect(nextGoal(state).id).not.toBe("equip");
  });

  it("goal 4: secondary_class — a hero is Lv3+ with no secondary class", () => {
    const state = baseState({ heroes: [hero({ level: 3, xp: 50 })] });
    const goal = nextGoal(state);
    expect(goal.id).toBe("secondary_class");
    expect(goal.heroId).toBe("h1");
  });

  it("goal 5: challenge_boss — Tollkeeper unclaimed, a fielded hero is Lv3+", () => {
    const state = baseState({ heroes: [hero({ level: 3, xp: 50, secondaryClassId: "class_cleric" })] });
    expect(nextGoal(state).id).toBe("challenge_boss");
  });

  it("goal 6: enter_dungeon — Tollkeeper claimed, no dungeon ever entered", () => {
    const state = baseState({
      heroes: [hero({ level: 3, xp: 50, secondaryClassId: "class_cleric" })],
      bossClaims: [{ accountId: "a1", bossId: "boss_tollkeeper", claimedAt: "2026-01-01T00:00:00Z" }],
    });
    expect(nextGoal(state).id).toBe("enter_dungeon");
  });

  it("goal 7: keep_building — fallback once every rung above is satisfied", () => {
    const state = baseState({
      heroes: [hero({ level: 3, xp: 50, secondaryClassId: "class_cleric" })],
      bossClaims: [{ accountId: "a1", bossId: "boss_tollkeeper", claimedAt: "2026-01-01T00:00:00Z" }],
      dungeon: { status: "none", dungeonId: null, startedAt: null, checkpointAt: null, currentFloor: 0, floorsCleared: 1, rulesVersion: null, outcome: "cleared" },
    });
    expect(nextGoal(state).id).toBe("keep_building");
  });

  it("never mutates its input", () => {
    const state = baseState();
    const before = JSON.stringify(state);
    nextGoal(state);
    expect(JSON.stringify(state)).toBe(before);
  });
});
