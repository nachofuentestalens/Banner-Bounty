import { describe, expect, it } from "vitest";
import { contentPackageVersion } from "./index.js";

describe("content package scaffold", () => {
  it("exports a version marker", () => {
    expect(contentPackageVersion).toBe("0.1.0");
  });
});
