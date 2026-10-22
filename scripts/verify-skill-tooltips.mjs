// Focused real-endpoint UI evidence; uses an isolated temporary save.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { buildServer } from "../apps/server/dist/app.js";

const out = path.resolve("test-results/skill-tooltips");
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bnb-skill-tooltips-"));
const app = buildServer({ dbPath: path.join(tmp, "save.sqlite"), webDistDir: path.resolve("apps/web/dist") });
let browser;
try {
  const url = await app.listen({ port: 0, host: "127.0.0.1" });
  browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 720 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(url);
    await page.getByRole("button", { name: "Company A", exact: true }).click();
    const label = page.getByRole("button", { name: "Bulwark Call", exact: true }).first();
    await label.hover();
    const tooltip = page.getByRole("tooltip");
    await tooltip.waitFor();
    assert.match(await tooltip.innerText(), /\+30% DEF/);
    const box = await tooltip.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 720);
    await page.screenshot({ path: path.join(out, `build-${width}.png`) });
    await label.focus();
    await page.keyboard.press("Escape");
    assert.equal(await tooltip.count(), 0);
    await label.click();
    await tooltip.waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Boss", exact: true }).click();
    await page.getByRole("button", { name: "Challenge", exact: true }).click();
    await page.getByRole("region", { name: "Battle replay" }).waitFor();
    await page.getByText(/Full combat log/).click();
    await page.locator(".battle-log .skill-label").first().hover();
    await tooltip.waitFor();
    assert.match(await tooltip.innerText(), /Unlock level/);
    await page.screenshot({ path: path.join(out, `battle-${width}.png`) });
    console.log(`PASS ${width}px: build hover/focus/Escape/tap, bounded tooltip, real boss replay skill help`);
    await context.close();
  }
} finally {
  await browser?.close();
  await app.close();
}
