import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "./app.js";

test("GET /health returns ok status", async () => {
  const app = buildApp();
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.status, "ok");
  await app.close();
});
