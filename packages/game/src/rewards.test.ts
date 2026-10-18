import { describe, expect, it } from "vitest";
import { createRngState } from "./rng.js";
import {
  overflowGoldValue,
  resolveBossFirstClearReward,
  resolveExpeditionCycleReward,
  rollBossGuaranteedDrop,
  rollExpeditionCycleDrop,
} from "./rewards.js";

describe("rollExpeditionCycleDrop", () => {
  it("is deterministic for the same rngState", () => {
    const state = createRngState(42);
    expect(rollExpeditionCycleDrop(state)).toEqual(rollExpeditionCycleDrop(state));
  });

  it("produces only valid content IDs across a wide seed sweep", () => {
    let state = createRngState(1);
    for (let i = 0; i < 500; i++) {
      const { drop, nextRngState } = rollExpeditionCycleDrop(state);
      if (drop) {
        expect(drop.definitionId).toMatch(/^item_/);
        if (drop.affixId) expect(drop.affixId).toMatch(/^affix_/);
      }
      state = nextRngState;
    }
  });

  it("advances rngState even on a no-drop roll (d0 is always consumed)", () => {
    let noDropState: number | null = null;
    let state = createRngState(7);
    for (let i = 0; i < 50 && noDropState === null; i++) {
      const { drop, nextRngState } = rollExpeditionCycleDrop(state);
      if (!drop) noDropState = nextRngState;
      state = nextRngState;
    }
    expect(noDropState).not.toBeNull();
    expect(noDropState).not.toBe(createRngState(7));
  });
});

describe("rollBossGuaranteedDrop", () => {
  it("always returns a drop with an affix", () => {
    let state = createRngState(99);
    for (let i = 0; i < 20; i++) {
      const { drop, nextRngState } = rollBossGuaranteedDrop(state);
      expect(drop).not.toBeNull();
      expect(drop!.affixId).not.toBeNull();
      state = nextRngState;
    }
  });
});

describe("overflowGoldValue", () => {
  it("matches the frozen conversion table (baseline.md section 6)", () => {
    expect(overflowGoldValue(false)).toBe(5);
    expect(overflowGoldValue(true)).toBe(9);
  });
});

describe("resolveExpeditionCycleReward", () => {
  it("always grants 4 XP per participant and at least 10 gold", () => {
    const result = resolveExpeditionCycleReward(createRngState(1), 0);
    expect(result.xpPerParticipant).toBe(4);
    expect(result.gold).toBeGreaterThanOrEqual(10);
  });

  it("never creates an instance when inventory is already at the cap (any roll converts or no-drops)", () => {
    let state = createRngState(3);
    for (let i = 0; i < 100; i++) {
      const result = resolveExpeditionCycleReward(state, 100);
      expect(result.itemInstance).toBeNull();
      expect(result.unequippedCountAfter).toBe(100);
      expect([10, 15, 19]).toContain(result.gold);
      state = result.nextRngState;
    }
  });

  it("increments the running unequipped count only when a real instance is created", () => {
    let state = createRngState(5);
    let result = resolveExpeditionCycleReward(state, 50);
    for (let i = 0; i < 50 && result.itemInstance === null; i++) {
      state = result.nextRngState;
      result = resolveExpeditionCycleReward(state, 50);
    }
    expect(result.itemInstance).not.toBeNull();
    expect(result.unequippedCountAfter).toBe(51);
  });
});

describe("resolveBossFirstClearReward", () => {
  it("grants 150 gold, 40 XP per participant, and a guaranteed uncommon item under cap", () => {
    const result = resolveBossFirstClearReward(createRngState(10), 0);
    expect(result.xpPerParticipant).toBe(40);
    expect(result.gold).toBe(150);
    expect(result.itemInstance).not.toBeNull();
    expect(result.itemInstance!.affixId).not.toBeNull();
    expect(result.unequippedCountAfter).toBe(1);
  });

  it("converts the guaranteed drop to +9 gold when inventory is full", () => {
    const result = resolveBossFirstClearReward(createRngState(10), 100);
    expect(result.gold).toBe(159);
    expect(result.itemInstance).toBeNull();
    expect(result.unequippedCountAfter).toBe(100);
  });
});
