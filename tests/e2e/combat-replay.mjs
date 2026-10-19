// Run after npm run build. Real API and browser, in-memory save, accelerated server clock.
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { buildServer } from "../../apps/server/dist/app.js";
import { FixedClock } from "../../apps/server/dist/clock.js";

const clock = new FixedClock(new Date("2026-03-01T12:00:00Z"));
const app = buildServer({ dbPath: ":memory:", clock, webDistDir: fileURLToPath(new URL("../../apps/web/dist", import.meta.url)) });
const url = await app.listen({ host: "127.0.0.1", port: 0 });
const out = fileURLToPath(new URL("../../test-results/combat-replay/", import.meta.url));
fs.mkdirSync(out, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url);
  await page.getByRole("button", { name: "Company A", exact: true }).click();
  await page.getByRole("button", { name: "Boss", exact: true }).click();
  await page.getByRole("button", { name: "Challenge", exact: true }).click();
  await page.getByRole("button", { name: "Next action" }).waitFor();
  assert.equal(await page.getByRole("progressbar").count(), 4);
  await page.getByRole("button", { name: "Next action" }).click();
  assert.ok((await page.locator(".battle-action").innerText()).includes("HP"));
  await page.screenshot({ path: `${out}/boss-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator(".battle-result-panel").screenshot({ path: `${out}/boss-mobile.png` });
  await page.getByRole("button", { name: "Show result" }).click();
  await page.getByRole("heading", { name: "Defeated", exact: true }).waitFor();
  await page.getByRole("button", { name: "Restart replay" }).click();
  assert.ok((await page.locator(".battle-controls").innerText()).includes("0 /"));
  await page.getByRole("button", { name: "Expedition", exact: true }).click();
  await page.getByRole("button", { name: "Start Expedition", exact: true }).click();
  await page.getByRole("button", { name: "Collect Rewards" }).waitFor();
  clock.set(new Date("2026-03-01T12:01:01Z"));
  await page.getByRole("button", { name: "Collect Rewards" }).click();
  await page.getByRole("heading", { name: "Latest expedition fight" }).waitFor();
  assert.equal(await page.getByRole("progressbar").count(), 6);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole("button", { name: "Next action" }).click();
  await page.locator(".battle-result-panel").screenshot({ path: `${out}/expedition-mobile.png` });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator(".battle-result-panel").screenshot({ path: `${out}/expedition-desktop.png` });

  // Publish the other account through its own cookie context, then challenge through the UI.
  const defender = await browser.newContext();
  await defender.request.post(`${url}/dev/session/select`, { data: { accountSlot: "B" } });
  const state = (await (await defender.request.get(`${url}/account/state`)).json()).data;
  await defender.request.post(`${url}/arena/publish`, { data: { requestId: crypto.randomUUID(), expectedRevision: state.revision } });
  await page.getByRole("button", { name: "Arena", exact: true }).click();
  await page.locator(".opponent-list button").first().click();
  await page.getByRole("button", { name: "Challenge", exact: true }).click();
  await page.getByRole("button", { name: "Next action" }).waitFor();
  assert.equal(await page.getByRole("progressbar").count(), 6);
  await page.getByRole("button", { name: "Next action" }).click();
  await page.locator(".battle-result-panel").screenshot({ path: `${out}/arena-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log("PASS boss, expedition and arena replay; exact unit counts; step/restart/result; reduced-motion pause; 390px overflow; no browser errors.");
  console.log(`Screenshots: ${out}`);
} finally {
  await browser?.close();
  await app.close();
}
