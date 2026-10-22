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
    const context = await browser.newContext({ viewport: { width, height: 720 }, reducedMotion: "reduce", hasTouch: width === 390 });
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
    await tooltip.waitFor({ state: "hidden" });
    if (width === 390) await label.tap();
    else await label.click();
    await tooltip.waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Boss", exact: true }).click();
    const response = page.waitForResponse((r) => r.url().endsWith("/boss/challenge"));
    await page.getByRole("button", { name: "Challenge", exact: true }).click();
    const report = (await (await response).json()).data.report;
    const recorded = await (await context.request.get(`${url}/battle-reports/${report.reportId}`)).json();
    assert.deepEqual(recorded.data.report.events, report.events, "stored report must retain calculation evidence");
    const hp = Object.fromEntries(report.participantsSnapshot.units.map((u) => [u.unitId, u.maxHp]));
    for (const event of report.events) {
      if (event.amount < 0 || event.dodged) assert.ok(event.damageBreakdown);
      if (event.damageBreakdown) {
        const d = event.damageBreakdown;
        assert.equal(d.hpBefore, hp[event.targetId]);
        assert.equal(d.hpLoss, -event.amount || 0);
        assert.equal(d.hpBefore - d.hpLoss, event.hpAfter);
      }
      if (event.hpAfter !== null) hp[event.targetId] = event.hpAfter;
    }
    assert.deepEqual(hp, report.result.finalHp);
    await page.getByRole("region", { name: "Battle replay" }).waitFor();
    await page.getByText(/Full combat log/).click();
    await page.locator(".battle-log .skill-label").first().hover();
    await tooltip.waitFor();
    assert.match(await tooltip.innerText(), /Unlock level/);
    await page.screenshot({ path: path.join(out, `battle-${width}.png`) });
    await page.locator(".battle-log .skill-label").first().focus();
    await page.keyboard.press("Escape");
    const details = page.locator(".battle-log .damage-details");
    assert.equal(await details.count(), report.events.filter((e) => e.damageBreakdown).length);
    assert.match(await details.first().innerText(), /Base damage|dodged/);
    await details.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `damage-${width}.png`) });
    await page.getByRole("button", { name: "Step", exact: true }).click();
    assert.match(await page.locator(".battle-action").innerText(), /Resolved damage/);
    const statusIndex = report.events.findIndex((e) => e.statusApplied);
    assert.ok(statusIndex >= 0);
    for (let cursor = 1; cursor <= statusIndex; cursor++) await page.getByRole("button", { name: "Step", exact: true }).click();
    assert.ok(await page.locator(".status-badge").count() > 0);
    const modifierIndex = report.events.findIndex((e) => e.damageBreakdown?.steps.some((s) => s.kind === "fortify" || s.kind === "weaken"));
    assert.ok(modifierIndex >= 0, "fight must expose an applied buff/debuff calculation");
    const modifierLine = page.locator(".battle-log > li").nth(modifierIndex);
    assert.match(await modifierLine.innerText(), /Fortified DEF|Weakened ATK/);
    await modifierLine.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await tooltip.waitFor({ state: "hidden" });
    await page.screenshot({ path: path.join(out, `modifier-${width}.png`) });
    console.log(`PASS ${width}px: tooltip access, real boss breakdowns, persisted events and final HP reconciliation`);
    await context.close();
  }
} finally {
  await browser?.close();
  await app.close();
}
