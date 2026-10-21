import { describe, expect, it } from "vitest";
import { belowThreshold, createRngState, drawUint32, drawUniformInt, pickUniformIndex } from "./rng.js";

describe("rng", () => {
  it("is deterministic: same seed produces the same draw sequence", () => {
    const seedA = createRngState(12345);
    const seedB = createRngState(12345);
    const a1 = drawUint32(seedA);
    const b1 = drawUint32(seedB);
    expect(a1.value).toBe(b1.value);
    const a2 = drawUint32(a1.nextState);
    const b2 = drawUint32(b1.nextState);
    expect(a2.value).toBe(b2.value);
  });

  it("different seeds diverge", () => {
    const a = drawUint32(createRngState(1));
    const b = drawUint32(createRngState(2));
    expect(a.value).not.toBe(b.value);
  });

  it("never produces a stuck zero state", () => {
    const state = createRngState(0);
    expect(state).not.toBe(0);
    const { nextState } = drawUint32(state);
    expect(nextState).not.toBe(0);
  });

  it("belowThreshold uses the exact rational boundary, not a rounded float", () => {
    // 2^32 / 3 = 1431655765.33..., floor = 1431655765
    expect(belowThreshold(1431655764, 1, 3)).toBe(true);
    expect(belowThreshold(1431655765, 1, 3)).toBe(false);
  });

  it("pickUniformIndex stays within [0, count)", () => {
    for (const value of [0, 1, 2147483648, 4294967295]) {
      const idx = pickUniformIndex(value, 9);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(9);
    }
  });

  it("drawUniformInt (gear.md section 6) stays within [0, n) and is deterministic", () => {
    let state = createRngState(777);
    for (let i = 0; i < 200; i++) {
      const draw = drawUniformInt(state, 9);
      expect(draw.value).toBeGreaterThanOrEqual(0);
      expect(draw.value).toBeLessThan(9);
      state = draw.nextState;
    }
    const a = drawUniformInt(createRngState(42), 3);
    const b = drawUniformInt(createRngState(42), 3);
    expect(a).toEqual(b);
  });

  it("drawUniformInt distributes roughly evenly over many draws (sanity, not a strict statistical test)", () => {
    let state = createRngState(9001);
    const counts = [0, 0, 0];
    for (let i = 0; i < 3000; i++) {
      const draw = drawUniformInt(state, 3);
      counts[draw.value]! += 1;
      state = draw.nextState;
    }
    for (const c of counts) expect(c).toBeGreaterThan(700); // expected ~1000 each
  });
});
