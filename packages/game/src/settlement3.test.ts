import { describe, expect, it } from "vitest";
import { freshSettlementStateV3, runSettlementWalkV3, type BattleRollV3, type RollBattleFnV3, type RollOutcomeV3 } from "./settlement3.js";

/** Deterministic synthetic battles reproducing contracts.md's illustrative 5,8,6,... round sequence. */
function sequenceRollBattle(rounds: readonly number[], msPerRound = 2000): RollBattleFnV3 {
  return (rngState): RollOutcomeV3 => {
    const index = rngState;
    const resolvedRounds = rounds[index] ?? rounds[rounds.length - 1]!;
    const roll: BattleRollV3 = { resolvedRounds, nominalDurationMs: resolvedRounds * msPerRound, result: "win", payload: { index } };
    return { roll, nextRngState: index + 1 };
  };
}

describe("runSettlementWalkV3 — contracts.md worked examples", () => {
  const T0 = 1_000_000;
  const roll = sequenceRollBattle([5, 8, 6, 9, 7]);

  it("W1 — connected, frequent small polls", () => {
    const fresh = freshSettlementStateV3(T0, 0);

    const step1 = runSettlementWalkV3(fresh, T0 + 0, roll);
    expect(step1.creditedBattles).toHaveLength(0);
    expect(step1.state.pending).toMatchObject({ ordinal: 1, roll: { resolvedRounds: 5, nominalDurationMs: 10_000 } });
    expect(step1.state.checkpointAt).toBe(T0);
    expect(step1.state.nextOrdinal).toBe(2);
    expect(step1.revisionChanged).toBe(true); // reveal bumps revision even with nothing credited

    const step2 = runSettlementWalkV3(step1.state, T0 + 6_000, roll);
    expect(step2.creditedBattles).toHaveLength(0);
    expect(step2.state.pending?.ordinal).toBe(1);
    expect(step2.state.checkpointAt).toBe(T0); // unchanged: true no-op
    expect(step2.revisionChanged).toBe(false);

    const step3 = runSettlementWalkV3(step2.state, T0 + 10_000, roll);
    expect(step3.creditedBattles).toHaveLength(1);
    expect(step3.creditedBattles[0]!.ordinal).toBe(1);
    expect(step3.state.checkpointAt).toBe(T0 + 10_000);
    expect(step3.state.pending).toMatchObject({ ordinal: 2, roll: { resolvedRounds: 8, nominalDurationMs: 16_000 } });
    expect(step3.revisionChanged).toBe(true);
  });

  it("W2 — offline, one call at an equivalent elapsed time credits the same two battles", () => {
    const fresh = freshSettlementStateV3(T0, 0);
    const offline = runSettlementWalkV3(fresh, T0 + 26_000, roll);
    expect(offline.creditedBattles.map((b) => b.ordinal)).toEqual([1, 2]);
    expect(offline.creditedBattles[0]!.roll.nominalDurationMs).toBe(10_000);
    expect(offline.creditedBattles[1]!.roll.nominalDurationMs).toBe(16_000);
    expect(offline.state.checkpointAt).toBe(T0 + 26_000);
    expect(offline.state.pending).toMatchObject({ ordinal: 3, roll: { resolvedRounds: 6 } });
  });

  it("W2b — partition invariance: many small calls reach the identical state as one big call", () => {
    const freshA = freshSettlementStateV3(T0, 0);
    let stateA = freshA;
    for (const now of [T0 + 1_000, T0 + 6_000, T0 + 10_000, T0 + 15_000, T0 + 22_000, T0 + 26_000]) {
      stateA = runSettlementWalkV3(stateA, now, roll).state;
    }

    const freshB = freshSettlementStateV3(T0, 0);
    const stateB = runSettlementWalkV3(freshB, T0 + 26_000, roll).state;

    expect(stateA).toEqual(stateB);
  });

  it("W3 — pure function of inputs: identical call repeated (retry) yields byte-identical output", () => {
    const fresh = freshSettlementStateV3(T0, 0);
    const first = runSettlementWalkV3(fresh, T0 + 10_000, roll);
    const retry = runSettlementWalkV3(fresh, T0 + 10_000, roll);
    expect(retry).toEqual(first);
  });

  it("W4 — 8-hour cap with resumable catch-up across MAX_BATTLES_PER_SETTLEMENT", () => {
    const fixedDuration = 15_000;
    const fixedRoll: RollBattleFnV3 = (rngState) => ({
      roll: { resolvedRounds: 7, nominalDurationMs: fixedDuration, result: "win", payload: null },
      nextRngState: rngState + 1,
    });
    const fresh = freshSettlementStateV3(T0, 0);
    const awayNow = T0 + 36_000_000; // away 10 hours

    const first = runSettlementWalkV3(fresh, awayNow, fixedRoll, { maxBattlesPerCall: 500 });
    expect(first.elapsedMs).toBe(36_000_000);
    expect(first.cappedMs).toBe(28_800_000);
    expect(first.discardedMs).toBe(7_200_000);
    expect(first.battlesThisCall).toBe(500);
    expect(first.hitBattleCap).toBe(true);
    expect(first.processedMs).toBe(500 * fixedDuration);
    expect(first.state.checkpointAt).toBe(T0 + 7_200_000 + 500 * fixedDuration);

    // Second call, no further real time passing: resumes catch-up, no double discard.
    const second = runSettlementWalkV3(first.state, awayNow, fixedRoll, { maxBattlesPerCall: 500 });
    expect(second.discardedMs).toBe(0);
    expect(second.elapsedMs).toBe(36_000_000 - (7_200_000 + 500 * fixedDuration));
    expect(second.cappedMs).toBe(second.elapsedMs);
    expect(second.battlesThisCall).toBe(500);

    // Keep resuming until the originally-capped window is fully processed.
    let state = second.state;
    let totalProcessed = first.processedMs + second.processedMs;
    while (totalProcessed < 28_800_000) {
      const step = runSettlementWalkV3(state, awayNow, fixedRoll, { maxBattlesPerCall: 500 });
      expect(step.discardedMs).toBe(0);
      state = step.state;
      totalProcessed += step.processedMs;
    }
    expect(totalProcessed).toBe(28_800_000); // 28_800_000 / 15_000 = 1920, divides evenly
    const finalSettle = runSettlementWalkV3(state, awayNow, fixedRoll, { maxBattlesPerCall: 500 });
    expect(finalSettle.creditedBattles).toHaveLength(0);
    expect(finalSettle.revisionChanged).toBe(false); // fully caught up: true no-op
  });

  it("W5 — clock rollback: a windowMs=0 call against an already-cached pending battle is a true no-op", () => {
    const fresh = freshSettlementStateV3(T0, 0);
    const revealed = runSettlementWalkV3(fresh, T0 + 0, roll); // caches pending #1
    const rollback = runSettlementWalkV3(revealed.state, T0, roll); // effectiveNow clamped to no earlier than checkpointAt
    expect(rollback.elapsedMs).toBe(0);
    expect(rollback.creditedBattles).toHaveLength(0);
    expect(rollback.discardedMs).toBe(0);
    expect(rollback.state).toEqual(revealed.state);
    expect(rollback.revisionChanged).toBe(false);
  });

  it("rejects a non-positive battle duration (G3: must be a deterministic positive integer)", () => {
    const badRoll: RollBattleFnV3 = (rngState) => ({ roll: { resolvedRounds: 0, nominalDurationMs: 0, result: "win", payload: null }, nextRngState: rngState + 1 });
    const fresh = freshSettlementStateV3(T0, 0);
    expect(() => runSettlementWalkV3(fresh, T0 + 1_000, badRoll)).toThrow();
  });

  it("invokes beforeRoll with the ordinal about to be assigned, only on new rolls, never on crediting a cached pending battle", () => {
    const seenOrdinals: number[] = [];
    const fresh = freshSettlementStateV3(T0, 0);
    const step1 = runSettlementWalkV3(fresh, T0 + 0, roll, { beforeRoll: (o) => seenOrdinals.push(o) });
    expect(seenOrdinals).toEqual([1]);
    runSettlementWalkV3(step1.state, T0 + 10_000, roll, { beforeRoll: (o) => seenOrdinals.push(o) });
    // Crediting ordinal 1 (cached) triggers no beforeRoll; rolling ordinal 2 does.
    expect(seenOrdinals).toEqual([1, 2]);
  });
});
