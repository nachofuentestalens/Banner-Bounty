// Variable-duration expedition settlement walk (design/studio/contracts.md
// "4. Variable-duration settlement algorithm"; design/game/m3-systems.md
// section 3/G3 handoff). Pure: the caller supplies the persisted state,
// `effectiveNow` (already clamped to the server's high-water mark) and a
// `rollBattle` callback that produces one variable-duration battle from the
// combat RNG stream. This module never reads the clock, never touches
// storage and never decides reward tables — M3-08 wires those.
//
// Only `kind="pve"` expedition settlement is replaced by this algorithm
// (contracts.md section 4 preamble); dungeon floor settlement stays the
// existing fixed-180,000ms walk in dungeon.ts, untouched.

import { M3_RULES } from "@banner-and-bounty/content";
import { type RngState } from "./rng.js";

/** One variable-duration battle's outcome, already simulated. */
export interface BattleRollV3 {
  readonly resolvedRounds: number;
  readonly nominalDurationMs: number;
  readonly result: string;
  /** Opaque to this module; carried through so callers can persist/replay it. */
  readonly payload: unknown;
}

export interface RollOutcomeV3 {
  readonly roll: BattleRollV3;
  readonly nextRngState: RngState;
}

/** Rolls exactly one new battle from the given combat RNG state. */
export type RollBattleFnV3 = (rngState: RngState) => RollOutcomeV3;

export interface PendingBattleStateV3 {
  readonly reportId: string;
  readonly ordinal: number;
  readonly roll: BattleRollV3;
}

export interface CreditedBattleV3 {
  readonly reportId: string;
  readonly ordinal: number;
  readonly roll: BattleRollV3;
  readonly creditedAt: number;
}

/**
 * Persisted shape across settle() calls. `nextOrdinal` is always "the
 * ordinal that will be assigned to the next battle rolled" — whether or not
 * one is currently cached as pending — which is exactly contracts.md's
 * `boundaryOrdinal` definition for a deferred skill-change queued right
 * after this walk runs (see loadout3.ts `computeBoundaryOrdinalV3`, which is
 * a trivial alias of this field for that reason).
 */
export interface SettlementStateV3 {
  readonly checkpointAt: number;
  readonly rngState: RngState;
  readonly pending: PendingBattleStateV3 | null;
  readonly nextOrdinal: number;
}

export function freshSettlementStateV3(checkpointAt: number, rngState: RngState, startOrdinal = 1): SettlementStateV3 {
  return { checkpointAt, rngState, pending: null, nextOrdinal: startOrdinal };
}

export interface SettlementWalkOptionsV3 {
  readonly capMs?: number;
  readonly maxBattlesPerCall?: number;
  /**
   * Invoked with the ordinal about to be assigned, immediately before each
   * new roll — the exact point contracts.md section 5 requires deferred
   * skill changes to be applied ("apply all heroes' pending selections
   * before the next battle's snapshot ... only then roll the new battle").
   */
  readonly beforeRoll?: (ordinal: number) => void;
  readonly reportIdFor?: (ordinal: number) => string;
}

export interface SettlementWalkResultV3 {
  readonly state: SettlementStateV3;
  readonly creditedBattles: readonly CreditedBattleV3[];
  /** contracts.md's generalized no-op rule: a new cached-but-uncredited reveal still bumps revision. */
  readonly revisionChanged: boolean;
  readonly elapsedMs: number;
  readonly cappedMs: number;
  readonly discardedMs: number;
  readonly windowMs: number;
  readonly processedMs: number;
  readonly battlesThisCall: number;
  readonly hitBattleCap: boolean;
}

/**
 * contracts.md section 4's loop, generalized over battle production via
 * `rollBattle`. `effectiveNow` must already be the caller's monotonic
 * high-water clock (worked example W5) — this function does not clamp it
 * itself since it has no notion of "previous now" across calls other than
 * `state.checkpointAt`.
 */
export function runSettlementWalkV3(state: SettlementStateV3, effectiveNow: number, rollBattle: RollBattleFnV3, options: SettlementWalkOptionsV3 = {}): SettlementWalkResultV3 {
  const capMs = options.capMs ?? M3_RULES.offlineCapMs;
  const maxBattles = options.maxBattlesPerCall ?? M3_RULES.maxBattlesPerSettlement;
  const reportIdFor = options.reportIdFor ?? ((ordinal: number) => `battle-${ordinal}`);

  const elapsedMs = Math.max(0, effectiveNow - state.checkpointAt);
  const cappedMs = Math.min(elapsedMs, capMs);
  const discardedMs = elapsedMs - cappedMs;
  const windowMs = cappedMs;

  let processedMs = 0;
  let battlesThisCall = 0;
  let pending = state.pending;
  let rngState = state.rngState;
  let nextOrdinal = state.nextOrdinal;
  const creditedBattles: CreditedBattleV3[] = [];

  for (;;) {
    if (battlesThisCall >= maxBattles) break;

    if (pending) {
      if (windowMs - processedMs >= pending.roll.nominalDurationMs) {
        creditedBattles.push({ ...pending, creditedAt: effectiveNow });
        processedMs += pending.roll.nominalDurationMs;
        pending = null;
        battlesThisCall += 1;
        continue;
      }
      break; // not enough window yet; stays cached, pending
    }

    const ordinal = nextOrdinal;
    options.beforeRoll?.(ordinal);
    const outcome = rollBattle(rngState);
    if (!Number.isSafeInteger(outcome.roll.nominalDurationMs) || outcome.roll.nominalDurationMs <= 0) {
      throw new Error("M3 battle duration must be a deterministic positive integer");
    }
    rngState = outcome.nextRngState;
    nextOrdinal = ordinal + 1;
    const rolled: PendingBattleStateV3 = { reportId: reportIdFor(ordinal), ordinal, roll: outcome.roll };

    if (windowMs - processedMs >= rolled.roll.nominalDurationMs) {
      creditedBattles.push({ ...rolled, creditedAt: effectiveNow });
      processedMs += rolled.roll.nominalDurationMs;
      battlesThisCall += 1;
      continue;
    }
    pending = rolled; // cached for a later call ("reveal" without credit)
    break;
  }

  const checkpointAtNew = state.checkpointAt + discardedMs + processedMs;
  const newState: SettlementStateV3 = { checkpointAt: checkpointAtNew, rngState, pending, nextOrdinal };

  const pendingChanged = (state.pending?.reportId ?? null) !== (pending?.reportId ?? null);
  const revisionChanged = creditedBattles.length > 0 || pendingChanged;

  return { state: newState, creditedBattles, revisionChanged, elapsedMs, cappedMs, discardedMs, windowMs, processedMs, battlesThisCall, hitBattleCap: battlesThisCall >= maxBattles };
}

/** The boundary a deferred skill-change queued right after a walk call must record (contracts.md section 5). */
export function computeBoundaryOrdinalV3(state: SettlementStateV3): number {
  return state.nextOrdinal;
}
