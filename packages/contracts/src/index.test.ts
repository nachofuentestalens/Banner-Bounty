import { test } from "node:test";
import assert from "node:assert/strict";
import type { HealthResponse } from "./index.js";

test("HealthResponse shape accepts expected fields", () => {
  const sample: HealthResponse = { status: "ok", uptimeSeconds: 1 };
  assert.equal(sample.status, "ok");
});
