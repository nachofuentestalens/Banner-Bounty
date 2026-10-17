import { describe, expect, it } from "vitest";
import { contractsPackageVersion } from "./index.js";

describe("contracts package scaffold", () => {
  it("exports a version marker", () => {
    expect(contractsPackageVersion).toBe("0.1.0");
  });
});
