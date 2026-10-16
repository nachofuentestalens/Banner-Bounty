import { test } from "node:test";
import assert from "node:assert/strict";
import { App } from "./App.js";

test("App component is exported as a function", () => {
  assert.equal(typeof App, "function");
});
