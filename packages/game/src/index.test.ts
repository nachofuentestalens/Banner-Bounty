import { describe, expect, it } from "vitest";
import { gamePackageVersion } from "./index.js";

describe("game package scaffold", () => {
  it("exports a version marker", () => {
    expect(gamePackageVersion).toBe("0.1.0");
  });
});
