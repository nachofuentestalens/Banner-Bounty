import { describe, expect, it } from "vitest";
import { buildServer } from "./app.js";

describe("GET /health", () => {
  it("returns the ok envelope from contracts.md", async () => {
    const app = buildServer();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      data: { status: "ok", schemaVersion: 0 },
    });
    await app.close();
  });
});
