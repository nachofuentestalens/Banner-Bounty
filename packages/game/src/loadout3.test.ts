import { describe, expect, it } from "vitest";
import { freshSettlementStateV3, runSettlementWalkV3, type RollBattleFnV3 } from "./settlement3.js";
import { applyDuePendingChangesV3, cancelPendingSkillChangeV3, discardPendingOnStopV3, queuePendingSkillChangeV3, type PendingSkillChangeV3 } from "./loadout3.js";

const T0 = 1_000_000;

function fixedRoll(durationMs: number): RollBattleFnV3 {
  return (rngState) => ({ roll: { resolvedRounds: 1, nominalDurationMs: durationMs, result: "win", payload: null }, nextRngState: rngState + 1 });
}

describe("queuePendingSkillChangeV3", () => {
  it("validates against the frozen level/class pool and rejects an unlocked skill", () => {
    const state = freshSettlementStateV3(T0, 0);
    expect(() =>
      queuePendingSkillChangeV3("class_vanguard", null, 1, "hero-1", { active: ["shield_bash", ""], passive: ["", ""] }, state, T0),
    ).toThrow(); // shield_bash unlocks at 5, frozen level is 1
  });

  it("records the boundary ordinal from the settlement state immediately after the walk ran", () => {
    const rolled = runSettlementWalkV3(freshSettlementStateV3(T0, 0), T0 + 0, fixedRoll(10_000)); // reveals pending ordinal 1
    const change = queuePendingSkillChangeV3("class_vanguard", null, 10, "hero-1", { active: ["", ""], passive: ["", ""] }, rolled.state, T0);
    // pending battle #1 already locked to the old build; boundary is the *next* unrolled ordinal.
    expect(change.boundaryOrdinal).toBe(2);
    expect(change.status).toBe("pending");
  });

  it("last committed edit wins per hero: a second queue call before the boundary overwrites the first", () => {
    let state = freshSettlementStateV3(T0, 0);
    const first = queuePendingSkillChangeV3("class_vanguard", null, 10, "hero-1", { active: ["", ""], passive: ["", ""] }, state, T0);
    expect(first.boundaryOrdinal).toBe(1);

    // Time passes, battle 1 rolls and credits before the second edit.
    const walked = runSettlementWalkV3(state, T0 + 10_000, fixedRoll(10_000));
    state = walked.state;
    const second = queuePendingSkillChangeV3("class_vanguard", null, 10, "hero-1", { active: ["", ""], passive: ["", ""] }, state, T0 + 10_000);
    // Battle 1 consumed, and the walk already revealed/cached battle 2 locked to the old build;
    // the next unrolled battle is 3.
    expect(second.boundaryOrdinal).toBe(3);
    expect(second.boundaryOrdinal).not.toBe(first.boundaryOrdinal);
  });
});

describe("cancelPendingSkillChangeV3", () => {
  const pending: PendingSkillChangeV3 = { heroId: "hero-1", active: ["", ""], passive: ["", ""], boundaryOrdinal: 3, acceptedAt: T0, status: "pending", appliedAt: null };

  it("cancels an unconsumed pending change", () => {
    expect(cancelPendingSkillChangeV3(pending, { active: ["a", ""], passive: ["", ""] })).toEqual({ outcome: "cancelled" });
  });

  it("reports already-applied instead of fabricating a cancellation", () => {
    const applied: PendingSkillChangeV3 = { ...pending, status: "applied", appliedAt: T0 + 5 };
    const current = { active: ["skill_x", ""] as const, passive: ["", ""] as const };
    expect(cancelPendingSkillChangeV3(applied, current)).toEqual({ outcome: "already_applied", currentSkillLoadout: current });
  });

  it("reports not_found for a missing or already-discarded change", () => {
    expect(cancelPendingSkillChangeV3(undefined, { active: ["", ""], passive: ["", ""] })).toEqual({ outcome: "not_found" });
    const discarded: PendingSkillChangeV3 = { ...pending, status: "discarded" };
    expect(cancelPendingSkillChangeV3(discarded, { active: ["", ""], passive: ["", ""] })).toEqual({ outcome: "not_found" });
  });
});

describe("applyDuePendingChangesV3", () => {
  it("applies only changes whose boundary has arrived, leaving later ones pending", () => {
    const due: PendingSkillChangeV3 = { heroId: "hero-1", active: ["a", ""], passive: ["", ""], boundaryOrdinal: 2, acceptedAt: T0, status: "pending", appliedAt: null };
    const notYetDue: PendingSkillChangeV3 = { heroId: "hero-2", active: ["b", ""], passive: ["", ""], boundaryOrdinal: 5, acceptedAt: T0, status: "pending", appliedAt: null };
    const result = applyDuePendingChangesV3([due, notYetDue], 2, T0 + 10_000);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]!.heroId).toBe("hero-1");
    expect(result.applied[0]!.status).toBe("applied");
    expect(result.appliedLoadouts.get("hero-1")).toEqual({ active: ["a", ""], passive: ["", ""] });
    expect(result.stillPending).toEqual([notYetDue]);
  });

  it("never re-applies an already-applied or discarded row", () => {
    const applied: PendingSkillChangeV3 = { heroId: "hero-1", active: ["a", ""], passive: ["", ""], boundaryOrdinal: 1, acceptedAt: T0, status: "applied", appliedAt: T0 };
    const result = applyDuePendingChangesV3([applied], 5, T0 + 1);
    expect(result.applied).toHaveLength(0);
    expect(result.stillPending).toEqual([applied]);
  });
});

describe("discardPendingOnStopV3", () => {
  it("discards only still-pending rows and leaves applied rows as permanent history", () => {
    const pending: PendingSkillChangeV3 = { heroId: "hero-1", active: ["", ""], passive: ["", ""], boundaryOrdinal: 9, acceptedAt: T0, status: "pending", appliedAt: null };
    const applied: PendingSkillChangeV3 = { heroId: "hero-2", active: ["", ""], passive: ["", ""], boundaryOrdinal: 1, acceptedAt: T0, status: "applied", appliedAt: T0 };
    const result = discardPendingOnStopV3([pending, applied]);
    expect(result.discarded).toHaveLength(1);
    expect(result.discarded[0]!.status).toBe("discarded");
    expect(result.unchanged).toEqual([applied]);
  });
});

describe("settlement3 + loadout3 integration — boundary timing never retroactive", () => {
  it("a battle already in flight keeps its original build; the next battle after the boundary uses the new one", () => {
    // Fresh walk: battle #1 rolls and credits immediately (duration 10s, window exactly 10s).
    let state = freshSettlementStateV3(T0, 0);
    const first = runSettlementWalkV3(state, T0 + 10_000, fixedRoll(10_000));
    state = first.state; // pending battle #2 now cached (not yet credited), boundary = ordinal 3
    expect(first.creditedBattles.map((b) => b.ordinal)).toEqual([1]);

    const change = queuePendingSkillChangeV3("class_vanguard", null, 10, "hero-1", { active: ["bulwark_call", ""], passive: ["", ""] }, state, T0 + 10_000);
    expect(change.boundaryOrdinal).toBe(3); // battle #2 already cached/locked to the old build

    let activeBuild = { active: ["", ""] as [string, string], passive: ["", ""] as [string, string] };
    let pendingChanges: readonly PendingSkillChangeV3[] = [change];
    const appliedLog: number[] = [];
    const applyAtBoundary = (appliedAt: number) => (ordinal: number) => {
      const due = applyDuePendingChangesV3(pendingChanges, ordinal, appliedAt);
      pendingChanges = [...due.applied, ...due.stillPending]; // caller persists the mutation before the next call
      const applied = due.appliedLoadouts.get("hero-1");
      if (applied) {
        activeBuild = applied as { active: [string, string]; passive: [string, string] };
        appliedLog.push(ordinal);
      }
    };

    // Cap this call at one credited battle so crediting #2 (already cached, locked to the
    // old build) does not also roll #3 in the same call — isolating the boundary's own call.
    const next = runSettlementWalkV3(state, T0 + 10_000 + 10_000, fixedRoll(10_000), {
      maxBattlesPerCall: 1,
      beforeRoll: applyAtBoundary(T0 + 20_000),
    });

    // Battle #2 (already cached before the edit) credits untouched; no beforeRoll fired for it.
    expect(next.creditedBattles.map((b) => b.ordinal)).toEqual([2]);
    expect(appliedLog).toEqual([]);
    expect(activeBuild.active[0]).toBe(""); // not yet applied

    // Now roll battle #3: this is the boundary ordinal, so beforeRoll applies the change first.
    const after = runSettlementWalkV3(next.state, T0 + 10_000 + 10_000 + 10_000, fixedRoll(10_000), {
      beforeRoll: applyAtBoundary(T0 + 30_000),
    });
    expect(appliedLog).toEqual([3]);
    expect(activeBuild.active[0]).toBe("bulwark_call");
    expect(after.creditedBattles.some((b) => b.ordinal === 3)).toBe(true);
  });
});
