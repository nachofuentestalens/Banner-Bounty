import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialState, advanceVersion } from "./index.js";

test("createInitialState starts at version 0", () => {
  const state = createInitialState("match-1");
  assert.equal(state.version, 0);
});

test("advanceVersion increments version without mutating input", () => {
  const state = createInitialState("match-1");
  const next = advanceVersion(state);
  assert.equal(next.version, 1);
  assert.equal(state.version, 0);
});
