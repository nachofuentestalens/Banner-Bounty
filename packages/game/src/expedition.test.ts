import { describe, expect, it } from "vitest";
import {
  computeSettlementWindow,
  simulateExpeditionCycles,
  type CycleBatchInput,
  type PartyMemberInput,
} from "./expedition.js";
import { createRngState } from "./rng.js";

const T0 = Date.parse("2026-01-01T00:00:00.000Z");
const S = 1000;
const H = 3_600_000;

describe("computeSettlementWindow (contracts.md worked examples)", () => {
  it("59s credits nothing and leaves the checkpoint unchanged (example 1)", () => {
    expect(computeSettlementWindow(T0, T0 + 59 * S)).toEqual({
      elapsedMs: 59_000,
      cappedMs: 59_000,
      discardedMs: 0,
      creditedCycles: 0,
      nextCheckpointMs: T0,
    });
  });

  it("60s credits one cycle (example 2)", () => {
    const w = computeSettlementWindow(T0, T0 + 60 * S);
    expect(w.creditedCycles).toBe(1);
    expect(w.nextCheckpointMs).toBe(T0 + 60_000);
  });

  it("61s credits one cycle and keeps the 1s remainder unconsumed (example 3)", () => {
    const w = computeSettlementWindow(T0, T0 + 61 * S);
    expect(w.creditedCycles).toBe(1);
    expect(w.nextCheckpointMs).toBe(T0 + 60_000);
    expect(computeSettlementWindow(w.nextCheckpointMs, T0 + 120 * S).creditedCycles).toBe(1);
  });

  it("partitioned settlement credits the same whole cycles as one continuous settlement (example 4)", () => {
    const first = computeSettlementWindow(T0, T0 + 60 * S);
    const second = computeSettlementWindow(first.nextCheckpointMs, T0 + 125 * S);
    const single = computeSettlementWindow(T0, T0 + 125 * S);
    expect(first.creditedCycles + second.creditedCycles).toBe(2);
    expect(single.creditedCycles).toBe(2);
    expect(second.nextCheckpointMs).toBe(single.nextCheckpointMs);
    expect(single.nextCheckpointMs).toBe(T0 + 120_000);
  });

  it("10 hours caps at 480 cycles, discards 2 hours and advances past the discarded time (example 5)", () => {
    const w = computeSettlementWindow(T0, T0 + 10 * H);
    expect(w).toEqual({
      elapsedMs: 36_000_000,
      cappedMs: 28_800_000,
      discardedMs: 7_200_000,
      creditedCycles: 480,
      nextCheckpointMs: T0 + 10 * H,
    });
  });

  it("an immediate second settle after a capped one recovers nothing (example 6)", () => {
    const first = computeSettlementWindow(T0, T0 + 10 * H);
    const again = computeSettlementWindow(first.nextCheckpointMs, T0 + 10 * H);
    expect(again.elapsedMs).toBe(0);
    expect(again.creditedCycles).toBe(0);
    // A 20-hour absence is still one capped window, not two.
    expect(computeSettlementWindow(T0, T0 + 20 * H).creditedCycles).toBe(480);
  });

  it("exactly 8 hours credits 480 with nothing discarded", () => {
    const w = computeSettlementWindow(T0, T0 + 8 * H);
    expect(w.creditedCycles).toBe(480);
    expect(w.discardedMs).toBe(0);
    expect(w.nextCheckpointMs).toBe(T0 + 8 * H);
  });

  it("negative elapsed (clock rollback) clamps to zero and never credits (example 7)", () => {
    expect(computeSettlementWindow(T0, T0 - 5 * S)).toEqual({
      elapsedMs: 0,
      cappedMs: 0,
      discardedMs: 0,
      creditedCycles: 0,
      nextCheckpointMs: T0,
    });
  });
});

const PARTY_L1: PartyMemberInput[] = [
  { heroId: "v", classId: "class_vanguard", level: 1, specializationId: null, equipment: { weapon: null, armor: null, trinket: null } },
  { heroId: "r", classId: "class_ranger", level: 1, specializationId: null, equipment: { weapon: null, armor: null, trinket: null } },
  { heroId: "a", classId: "class_arcanist", level: 1, specializationId: null, equipment: { weapon: null, armor: null, trinket: null } },
];

function batch(overrides: Partial<CycleBatchInput>): CycleBatchInput {
  return {
    frozenParty: PARTY_L1,
    liveLevels: { v: { level: 1, xp: 0 }, r: { level: 1, xp: 0 }, a: { level: 1, xp: 0 } },
    rngState: createRngState(12345),
    unequippedCount: 0,
    cyclesCompletedBefore: 0,
    cycles: 1,
    ...overrides,
  };
}

describe("simulateExpeditionCycles", () => {
  it("a level-1 unspecialized party wins Old Road cycles (combat.md example 11) and earns 4 XP + 10 gold each", () => {
    const r = simulateExpeditionCycles(batch({ cycles: 12 }));
    expect(r.wins).toBe(12);
    expect(r.losses).toBe(0);
    expect(r.xpPerParticipant).toBe(48);
    expect(r.gold - r.overflowConvertedGold).toBe(120);
    // 48 XP from level 1: 15 + 30 = 45 to reach level 3, 3 XP left over.
    expect(r.liveLevels.v).toEqual({ level: 3, xp: 3 });
  });

  it("splitting a batch at any point reproduces the identical drop stream, gold and levels", () => {
    const whole = simulateExpeditionCycles(batch({ cycles: 40 }));
    const head = simulateExpeditionCycles(batch({ cycles: 17 }));
    const tail = simulateExpeditionCycles(
      batch({
        cycles: 23,
        rngState: head.rngState,
        unequippedCount: head.unequippedCount,
        liveLevels: head.liveLevels,
        cyclesCompletedBefore: 17,
      }),
    );
    expect([...head.items, ...tail.items]).toEqual(whole.items);
    expect(head.gold + tail.gold).toBe(whole.gold);
    expect(tail.rngState).toBe(whole.rngState);
    expect(tail.liveLevels).toEqual(whole.liveLevels);
    expect(tail.recentCycles).toEqual(whole.recentCycles);
  });

  it("converts every drop once the running unequipped count reaches 100, in cycle order", () => {
    const fresh = simulateExpeditionCycles(batch({ cycles: 60, unequippedCount: 0 }));
    expect(fresh.items.length).toBeGreaterThan(2);

    // At 99, exactly the first drop becomes the 100th instance; the rest convert.
    const near = simulateExpeditionCycles(batch({ cycles: 60, unequippedCount: 99 }));
    expect(near.items).toEqual([fresh.items[0]]);
    expect(near.unequippedCount).toBe(100);
    expect(near.overflowConvertedCount).toBe(fresh.items.length - 1);

    const full = simulateExpeditionCycles(batch({ cycles: 60, unequippedCount: 100 }));
    expect(full.items).toEqual([]);
    expect(full.unequippedCount).toBe(100);
    const expectedConversionGold = fresh.items.reduce((sum, d) => sum + (d.affixId ? 9 : 5), 0);
    expect(full.overflowConvertedGold).toBe(expectedConversionGold);
    expect(full.gold).toBe(fresh.gold + expectedConversionGold);
  });

  it("keeps a bounded recent-cycle log while totals cover all 480 cycles", () => {
    const r = simulateExpeditionCycles(batch({ cycles: 480, cyclesCompletedBefore: 5 }));
    expect(r.wins + r.losses).toBe(480);
    expect(r.recentCycles).toHaveLength(10);
    expect(r.recentCycles[9]!.cycle).toBe(485);
    // Level cap: 480 * 4 = 1920 XP far exceeds 675, so heroes stop at 10 with 0 xp.
    expect(r.liveLevels.a).toEqual({ level: 10, xp: 0 });
  });

  it("a lost cycle grants nothing and consumes no RNG", () => {
    // Three level-1 Arcanists (no front-liner) lose Old Road in round 6.
    const weak: PartyMemberInput[] = PARTY_L1.map((h) => ({ ...h, classId: "class_arcanist" as const }));
    const r = simulateExpeditionCycles(batch({ frozenParty: weak, cycles: 3 }));
    expect(r.losses).toBe(3);
    expect(r.wins).toBe(0);
    expect(r.gold).toBe(0);
    expect(r.xpPerParticipant).toBe(0);
    expect(r.items).toEqual([]);
    expect(r.rngState).toBe(createRngState(12345));
    expect(r.liveLevels.a).toEqual({ level: 1, xp: 0 });
    expect(r.recentCycles.map((c) => c.result)).toEqual(["loss", "loss", "loss"]);
  });
});
