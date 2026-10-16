import { test } from "node:test";
import assert from "node:assert/strict";
import { placeholderContentVersion } from "./index.js";

test("placeholderContentVersion is defined", () => {
  assert.equal(typeof placeholderContentVersion, "string");
});
