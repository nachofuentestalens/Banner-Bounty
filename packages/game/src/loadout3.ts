// Deferred skill-change protocol (design/studio/contracts.md "5. Deferred
// skill-change protocol (G2)"; design/game/m3-systems.md section 3). Pure:
// no clock, no storage, no ownership/revision/idempotency checks — those
// are M3-08's `/hero/loadout/queue` and `/hero/loadout/cancel-pending`.
//
// Validation against the expedition's frozen level/class pool reuses
// `validateLoadoutV3` from @banner-and-bounty/content unchanged; this
// module only adds the boundary/queue/cancel/apply state machine layered
// on top of a settlement walk (settlement3.ts).

import { validateLoadoutV3, type ClassIdV3, type SkillLoadoutV3 } from "@banner-and-bounty/content";
import { computeBoundaryOrdinalV3, type SettlementStateV3 } from "./settlement3.js";

export type PendingSkillChangeStatusV3 = "pending" | "applied" | "discarded";

export interface PendingSkillChangeV3 {
  readonly heroId: string;
  readonly active: readonly [string, string];
  readonly passive: readonly [string, string];
  readonly boundaryOrdinal: number;
  readonly acceptedAt: number;
  readonly status: PendingSkillChangeStatusV3;
  readonly appliedAt: number | null;
}

/**
 * contracts.md section 5: validate against the hero's frozen
 * expedition-start level/class pool, then queue at the boundary implied by
 * the settlement walk's state immediately after it ran for this accepted
 * time T. "Last committed edit wins per hero": calling this again for the
 * same hero before its boundary simply replaces the prior row, which is
 * exactly what returning a fresh object (not mutating) accomplishes when
 * the caller keyes its own map by heroId.
 */
export function queuePendingSkillChangeV3(
  primaryClassId: ClassIdV3,
  secondaryClassId: ClassIdV3 | null,
  frozenLevel: number,
  heroId: string,
  loadout: SkillLoadoutV3,
  settlementStateAfterWalk: SettlementStateV3,
  acceptedAt: number,
): PendingSkillChangeV3 {
  validateLoadoutV3(primaryClassId, secondaryClassId, frozenLevel, loadout);
  return {
    heroId,
    active: loadout.active,
    passive: loadout.passive,
    boundaryOrdinal: computeBoundaryOrdinalV3(settlementStateAfterWalk),
    acceptedAt,
    status: "pending",
    appliedAt: null,
  };
}

export type CancelPendingResultV3 =
  | { readonly outcome: "cancelled" }
  | { readonly outcome: "already_applied"; readonly currentSkillLoadout: SkillLoadoutV3 }
  | { readonly outcome: "not_found" };

/**
 * contracts.md section 5 cancel endpoint: run the walk first (the caller's
 * job, same as queue), then classify. If the boundary-apply step inside
 * that walk already flipped this row to "applied", this is not an error —
 * report the fact and the current build, making no further change.
 */
export function cancelPendingSkillChangeV3(change: PendingSkillChangeV3 | undefined, currentSkillLoadout: SkillLoadoutV3): CancelPendingResultV3 {
  if (!change) return { outcome: "not_found" };
  if (change.status === "applied") return { outcome: "already_applied", currentSkillLoadout };
  if (change.status === "discarded") return { outcome: "not_found" };
  return { outcome: "cancelled" };
}

export interface ApplyDueChangesResultV3<Loadout> {
  /** heroId -> the loadout now in effect (unchanged heroes are omitted). */
  readonly appliedLoadouts: ReadonlyMap<string, Loadout>;
  readonly applied: readonly PendingSkillChangeV3[];
  readonly stillPending: readonly PendingSkillChangeV3[];
}

/**
 * contracts.md section 5's boundary-apply step, invoked from
 * `runSettlementWalkV3`'s `beforeRoll` hook. Applies every hero's
 * still-pending change whose `boundaryOrdinal <= ordinalAboutToRoll`, in
 * one batch, before that next battle is rolled. Recomputation of
 * passive-derived stats from the hero's original class/gear/race
 * baselines — "never by accumulating modifiers on an already-modified
 * effective-stat value" — is satisfied by construction: callers recompute
 * stats via `computeBattleStartStatsV3` (builds3.ts) from the hero's build
 * fields every battle, never from a cached effective-stat value, so there
 * is nothing here to accumulate onto.
 */
export function applyDuePendingChangesV3(pending: readonly PendingSkillChangeV3[], ordinalAboutToRoll: number, appliedAt: number): ApplyDueChangesResultV3<SkillLoadoutV3> {
  const appliedLoadouts = new Map<string, SkillLoadoutV3>();
  const applied: PendingSkillChangeV3[] = [];
  const stillPending: PendingSkillChangeV3[] = [];

  for (const change of pending) {
    if (change.status === "pending" && change.boundaryOrdinal <= ordinalAboutToRoll) {
      appliedLoadouts.set(change.heroId, { active: change.active, passive: change.passive });
      applied.push({ ...change, status: "applied", appliedAt });
    } else {
      stillPending.push(change);
    }
  }

  return { appliedLoadouts, applied, stillPending };
}

/** contracts.md section 5's stop handling: discard every unconsumed pending row. */
export function discardPendingOnStopV3(pending: readonly PendingSkillChangeV3[]): { readonly discarded: readonly PendingSkillChangeV3[]; readonly unchanged: readonly PendingSkillChangeV3[] } {
  const discarded: PendingSkillChangeV3[] = [];
  const unchanged: PendingSkillChangeV3[] = [];
  for (const change of pending) {
    if (change.status === "pending") discarded.push({ ...change, status: "discarded" });
    else unchanged.push(change);
  }
  return { discarded, unchanged };
}
