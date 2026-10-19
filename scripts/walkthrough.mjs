// Release-candidate browser walkthrough (design/qa/acceptance.md "Ten-step
// playable walkthrough"), run against the *built* client served by the built
// API: `npm run build && npm run walkthrough`.
//
// ACCELERATED EVIDENCE: the server runs in-process with an injected, manually
// advanced clock (the production SystemClock is replaced only here) so ~15
// minutes of expedition time take seconds. This proves the flow works; it is
// NOT pacing evidence. No HTTP surface is added for clock control.
//
// Uses a fresh temporary database (never the real save) and two isolated
// browser contexts. Browser: PW_CHANNEL (default "msedge", the system Edge
// shipped with Windows); set PW_CHANNEL=chromium after `npx playwright install
// chromium` to use Playwright's own build. Screenshots go to WALKTHROUGH_OUT
// (default test-results/walkthrough, gitignored).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const { buildServer } = await import(new URL("../apps/server/dist/app.js", import.meta.url).href);
const webDistDir = path.join(repoRoot, "apps", "web", "dist");
assert.ok(fs.existsSync(path.join(webDistDir, "index.html")), "apps/web/dist missing: run `npm run build` first");

const outDir = path.resolve(process.env.WALKTHROUGH_OUT ?? path.join(repoRoot, "test-results", "walkthrough"));
fs.mkdirSync(outDir, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bnb-walkthrough-"));
const dbPath = path.join(tmpDir, "save.sqlite");

const MINUTE = 60_000;
let nowMs = Date.parse("2026-10-19T09:00:00.000Z");
const clock = { now: () => new Date(nowMs) };
const advance = (minutes) => {
  nowMs += minutes * MINUTE;
};

let app;
let baseUrl;
async function startServer(port = 0) {
  app = buildServer({ dbPath, clock, webDistDir });
  baseUrl = await app.listen({ port, host: "127.0.0.1" });
}

const results = [];
async function step(name, fn) {
  const started = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true, note: note ?? "" });
    console.log(`PASS ${name}${note ? ` — ${note}` : ""} (${Date.now() - started} ms)`);
  } catch (error) {
    results.push({ name, ok: false, note: String(error?.message ?? error).split("\n")[0] });
    console.log(`FAIL ${name} — ${String(error?.message ?? error).split("\n")[0]}`);
    throw error;
  }
}

const nav = (page, label) => page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: label, exact: true }).click();
const heroHeadings = (page) => page.locator("section.hero-card h2").allInnerTexts();
const accountState = async (context) => (await (await context.request.get(`${baseUrl}/account/state`)).json()).data;

await startServer();
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
let pageA = await ctxA.newPage();
const consoleErrors = [];
const watch = (page, label) => page.on("console", (m) => m.type() === "error" && consoleErrors.push(`${label}: ${m.text()}`));
watch(pageA, "A");
let arenaReportId;
let arenaReportBefore;

try {
  await step("1 load built client from API; fresh data dir", async () => {
    const res = await pageA.goto(baseUrl);
    assert.equal(res.status(), 200);
    await pageA.getByRole("button", { name: "Company A" }).waitFor();
    const health = await (await ctxA.request.get(`${baseUrl}/health`)).json();
    return `GET / 200, health schemaVersion=${health.data.schemaVersion}, db=${dbPath}`;
  });

  await step("2 select company A; inspect three heroes; reorder party", async () => {
    await pageA.getByRole("button", { name: "Company A" }).click();
    await pageA.getByRole("heading", { level: 1, name: "Company" }).waitFor();
    const before = await heroHeadings(pageA);
    assert.equal(before.length, 3);
    await pageA.locator("section.hero-card").first().getByRole("button", { name: "Move down" }).click();
    await pageA.waitForFunction((first) => document.querySelector("section.hero-card h2")?.textContent !== first, before[0]);
    const after = await heroHeadings(pageA);
    assert.equal(after[1], before[0]);
    await pageA.screenshot({ path: path.join(outDir, "01-company-1280.png") });
    return `${before.join(" | ")} -> ${after.join(" | ")}`;
  });

  await step("3 start expedition; lock explanations shown for gear/spec", async () => {
    await nav(pageA, "Expedition");
    await pageA.getByRole("button", { name: "Start Expedition" }).click();
    await pageA.getByRole("button", { name: "Collect Rewards" }).waitFor();
    const lockNote = await pageA.locator(".inline-note").first().innerText();
    await nav(pageA, "Company");
    assert.ok(await pageA.locator(".inline-note").isVisible(), "company lock note missing");
    return `lock note: "${lockNote.slice(0, 80)}"`;
  });

  await step("4 collect progression; close/reopen the browser page; collect again", async () => {
    advance(5);
    await nav(pageA, "Expedition");
    await pageA.getByRole("button", { name: "Collect Rewards" }).click();
    await pageA.getByText("Credited cycles: 5").waitFor();
    await pageA.close();
    advance(3);
    pageA = await ctxA.newPage();
    watch(pageA, "A");
    await pageA.goto(baseUrl);
    await pageA.getByRole("heading", { level: 1, name: "Company" }).waitFor(); // session cookie survived
    await nav(pageA, "Expedition");
    await pageA.getByRole("button", { name: "Collect Rewards" }).click();
    await pageA.getByText("Credited cycles: 3").waitFor();
    const s = await accountState(ctxA);
    return `5 then 3 cycles credited; gold=${s.gold ?? s.account?.gold ?? "?"}, inventory=${s.inventory.length}`;
  });

  await step("5 stop; equip a drop; reach level 3; choose specializations", async () => {
    advance(6); // 14 cycles total, past the 12-cycle level-3 point (tuning.md)
    await pageA.getByRole("button", { name: "Stop and Collect" }).click();
    await pageA.getByRole("button", { name: "Start Expedition" }).waitFor();
    let equipNote = "no drop available to equip";
    await nav(pageA, "Inventory");
    const equipButtons = pageA.locator(".item-row").getByRole("button", { name: "Equip", exact: true });
    if ((await equipButtons.count()) > 0) {
      const row = pageA.locator(".item-row").filter({ has: pageA.getByRole("button", { name: "Equip", exact: true }) }).first();
      const itemName = await row.locator(".item-name").innerText();
      await equipButtons.first().click();
      const nowCell = await pageA.locator(".compare-table tbody tr").first().locator("td").first().innerText();
      assert.doesNotMatch(nowCell, /[0-9a-f]{8}-[0-9a-f]{4}-/, "compare panel shows a raw instance ID");
      await pageA.getByRole("button", { name: "Confirm equip" }).click();
      await pageA.locator(".item-row").filter({ hasText: itemName }).getByRole("button", { name: "Unequip" }).first().waitFor();
      equipNote = `equipped "${itemName}" (compare 'Now' = "${nowCell}")`;
    }
    await nav(pageA, "Company");
    const levels = await heroHeadings(pageA);
    assert.ok(levels.every((h) => /Lv ([3-9]|\d\d)/.test(h)), `not all level 3+: ${levels.join(", ")}`);
    const chosen = [];
    for (let i = 0; i < 3; i++) {
      const picker = pageA.locator(".spec-picker").first();
      const option = picker.getByRole("button").first();
      chosen.push((await option.innerText()).split("\n")[0]);
      await option.click();
      await pageA.waitForFunction((n) => document.querySelectorAll(".spec-picker").length === n, 2 - i);
    }
    return `${equipNote}; levels ${levels.join(", ")}; specs ${chosen.join(", ")}`;
  });

  await step("6 challenge boss; inspect result; reward granted only once", async () => {
    await nav(pageA, "Boss");
    await pageA.getByRole("button", { name: "Challenge" }).click();
    const outcome = await pageA.locator(".battle-result-panel h3").innerText();
    const first = await pageA.locator(".battle-result-panel").innerText();
    const goldAfterFirst = (await accountState(ctxA)).gold;
    await pageA.getByRole("button", { name: "Challenge" }).click();
    await pageA.waitForResponse((r) => r.url().endsWith("/boss/challenge"));
    await pageA.locator(".battle-result-panel h3").waitFor();
    const second = await pageA.locator(".battle-result-panel").innerText();
    const goldAfterSecond = (await accountState(ctxA)).gold;
    if (outcome === "Victory") {
      assert.match(first, /Reward:/);
      assert.doesNotMatch(second, /Reward:/, "second victory granted a reward again");
      assert.equal(goldAfterSecond, goldAfterFirst, "gold changed on repeat boss victory");
    }
    const badge = await pageA.locator(".reward-state-badge").innerText();
    return `first=${outcome}, badge="${badge}", gold ${goldAfterFirst} -> ${goldAfterSecond}`;
  });

  await step("7 company B in a separate context publishes its team", async () => {
    const pageB = await ctxB.newPage();
    watch(pageB, "B");
    await pageB.goto(baseUrl);
    await pageB.getByRole("button", { name: "Company B" }).click();
    await nav(pageB, "Arena");
    await pageB.getByRole("button", { name: "Publish Team" }).click();
    await pageB.waitForResponse((r) => r.url().endsWith("/arena/publish") && r.status() === 200);
    const sA = await accountState(ctxA);
    const sB = await accountState(ctxB);
    assert.notEqual(sA.heroes[0].heroId, sB.heroes[0].heroId);
    // A02 spot check: A cannot mutate B's hero by ID.
    const forged = await ctxA.request.post(`${baseUrl}/hero/specialization`, {
      data: { requestId: crypto.randomUUID(), expectedRevision: sA.revision, heroId: sB.heroes[0].heroId, specializationId: "spec_x" },
    });
    assert.ok(forged.status() >= 400, `forged cross-account request returned ${forged.status()}`);
    return `published; cross-account specialization attempt -> ${forged.status()}`;
  });

  await step("8 A challenges B; B alters team; A's saved report unchanged", async () => {
    await nav(pageA, "Arena");
    await pageA.locator(".opponent-list button").first().click();
    const challengeResponse = pageA.waitForResponse((r) => r.url().endsWith("/arena/challenge"));
    await pageA.locator(".snapshot-preview-panel").getByRole("button", { name: "Challenge" }).click();
    const body = await (await challengeResponse).json();
    arenaReportId = body.data.report.reportId;
    await pageA.locator(".snapshot-preview-panel .battle-result-panel h3").waitFor();
    arenaReportBefore = await (await ctxA.request.get(`${baseUrl}/battle-reports/${arenaReportId}`)).json();
    // B alters its company and republishes.
    const pageB = ctxB.pages()[0];
    await nav(pageB, "Company");
    await pageB.locator("section.hero-card").first().getByRole("button", { name: "Move down" }).click();
    await pageB.waitForResponse((r) => r.url().endsWith("/party/order"));
    await nav(pageB, "Arena");
    await pageB.getByRole("button", { name: "Publish Team" }).click();
    await pageB.waitForResponse((r) => r.url().endsWith("/arena/publish"));
    const after = await (await ctxA.request.get(`${baseUrl}/battle-reports/${arenaReportId}`)).json();
    assert.deepEqual(after, arenaReportBefore);
    const byB = await ctxB.request.get(`${baseUrl}/battle-reports/${arenaReportId}`);
    return `outcome=${body.data.report.result.outcome}; report identical after B edit; B reading A's report -> ${byB.status()}`;
  });

  await step("9 restart server; both saves and elapsed progression survive", async () => {
    await nav(pageA, "Expedition");
    await pageA.getByRole("button", { name: "Start Expedition" }).click();
    await pageA.getByRole("button", { name: "Collect Rewards" }).waitFor();
    const beforeA = await accountState(ctxA);
    const beforeB = await accountState(ctxB);
    const port = new URL(baseUrl).port;
    await app.close();
    advance(4); // time passes while the server is down
    await startServer(Number(port));
    const afterA = await accountState(ctxA);
    const afterB = await accountState(ctxB);
    assert.equal(afterA.revision, beforeA.revision);
    assert.equal(afterB.revision, beforeB.revision);
    assert.deepEqual(afterA.heroes, beforeA.heroes);
    await pageA.reload();
    await nav(pageA, "Expedition");
    await pageA.getByRole("button", { name: "Collect Rewards" }).click();
    await pageA.getByText("Credited cycles: 4").waitFor();
    return `revisions A=${afterA.revision} B=${afterB.revision} preserved; 4 cycles credited across downtime`;
  });

  await step("10 keyboard operation and 390px narrow layout", async () => {
    const ctxK = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pageK = await ctxK.newPage();
    watch(pageK, "K");
    await pageK.goto(baseUrl);
    await pageK.getByRole("button", { name: "Company A" }).waitFor();
    let focused = "";
    for (let i = 0; i < 10 && focused !== "Company A"; i++) {
      await pageK.keyboard.press("Tab");
      focused = await pageK.evaluate(() => document.activeElement?.textContent ?? "");
    }
    assert.equal(focused, "Company A", "could not reach Company A by Tab");
    const outline = await pageK.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    await pageK.keyboard.press("Enter");
    await pageK.getByRole("heading", { level: 1, name: "Company" }).waitFor();
    for (let i = 0; i < 15 && focused !== "Expedition"; i++) {
      await pageK.keyboard.press("Tab");
      focused = await pageK.evaluate(() => document.activeElement?.textContent ?? "");
    }
    assert.equal(focused, "Expedition", "could not reach Expedition nav by Tab");
    await pageK.keyboard.press("Enter");
    await pageK.getByRole("heading", { level: 1, name: "Expedition" }).waitFor();
    const widths = {};
    for (const screen of ["Company", "Expedition", "Inventory", "Boss", "Arena"]) {
      await nav(pageK, screen);
      await pageK.getByRole("heading", { level: 1, name: screen }).waitFor();
      widths[screen] = await pageK.evaluate(() => document.documentElement.scrollWidth);
      await pageK.screenshot({ path: path.join(outDir, `10-${screen.toLowerCase()}-390.png`), fullPage: true });
    }
    const overflow = Object.entries(widths).filter(([, w]) => w > 390);
    assert.equal(overflow.length, 0, `horizontal overflow at 390px: ${JSON.stringify(widths)}`);
    await pageA.screenshot({ path: path.join(outDir, "09-expedition-1280.png") });
    await ctxK.close();
    return `focus outline=${outline}; scrollWidth ${JSON.stringify(widths)}`;
  });
} finally {
  await browser.close().catch(() => {});
  await app.close().catch(() => {});
  fs.rmSync(tmpDir, { recursive: true, force: true });
  const passed = results.filter((r) => r.ok).length;
  console.log(`\nwalkthrough: ${passed}/${results.length} steps passed (10 planned); ACCELERATED clock`);
  console.log(`console errors: ${consoleErrors.length ? consoleErrors.join(" || ") : "none"}`);
  console.log(`screenshots: ${outDir}`);
  if (passed !== 10) process.exitCode = 1;
}
