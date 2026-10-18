import { describe, expect, it } from "vitest";
import { gamePackageVersion } from "./index.js";

describe("game package", () => {
  it("exports a version marker", () => {
    expect(gamePackageVersion).toBe("0.2.0");
  });
});
