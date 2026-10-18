// Deterministic seeded RNG for packages/game. Not specified by combat.md
// (unused by combat formulas, combat.md section 7) or baseline.md (which
// only fixes the d0-d3 draw order, not the PRNG algorithm) — the concrete
// 32-bit xorshift here is this package's own implementation decision,
// recorded so apps/server (M1-07/M1-08) knows RngState is an opaque
// unsigned 32-bit integer it must persist and round-trip verbatim, not
// reinterpret.
//
// Probability comparisons use exact integer-rational thresholds scaled by
// 2^32 (baseline.md 4: "compare against the exact rational boundary, not a
// rounded decimal") instead of float comparisons, so results never drift
// across engines/platforms.

export type RngState = number;

const TWO_32 = 4294967296;

function xorshift32(x: number): number {
  let v = x >>> 0;
  v ^= v << 13;
  v >>>= 0;
  v ^= v >>> 17;
  v ^= v << 5;
  v >>>= 0;
  return v >>> 0;
}

/** Normalizes any 32-bit seed into a valid non-zero xorshift32 state. */
export function createRngState(seed: number): RngState {
  const normalized = (seed >>> 0) || 0x9e3779b9;
  return normalized;
}

export interface RngDraw {
  readonly value: number; // uniform in [0, 2^32)
  readonly nextState: RngState;
}

export function drawUint32(state: RngState): RngDraw {
  const next = xorshift32(state === 0 ? 0x9e3779b9 : state);
  return { value: next, nextState: next };
}

/** `value < numerator/denominator`, using an exact integer threshold. */
export function belowThreshold(value: number, numerator: number, denominator: number): boolean {
  const threshold = Math.floor((numerator * TWO_32) / denominator);
  return value < threshold;
}

/** Maps a uniform draw to an index in `[0, count)`. */
export function pickUniformIndex(value: number, count: number): number {
  return Math.floor((value * count) / TWO_32);
}
