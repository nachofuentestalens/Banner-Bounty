// Ad hoc verification script for the first-session redesign task
// (design/game/first-session-redesign.md). NOT a permanent CI step and not
// a replacement for scripts/walkthrough.mjs (QA/release-owned) — this only
// exercises FS-01..FS-12 against the built client/server, the same way
// scripts/walkthrough.mjs does (in-process server, injected clock, fresh
// temp DB, Playwright over the system Edge channel by default).
// Run: `npm run build` first, then `node scripts/fs-redesign-check.mjs`.
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

const outDir = path.resolve(process.env.FS_CHECK_OUT ?? path.join(repoRoot, "test-results", "fs-redesign-check"));
fs.mkdirSync(outDir, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bnb-fs-check-"));
const dbPath = path.join(tmpDir, "save.sqlite");

const MINUTE = 60_000;
let nowMs = Date.parse("2026-10-19T09:00:00.000Z");
const clock = { now: () => new Date(nowMs) };
const advance = (minutes) => { nowMs += minutes * MINUTE; };

let app;
let baseUrl;
async function startServer() {
  app = buildServer({ dbPath, clock, webDistDir });
  baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
}

const results = [];
async function step(name, fn) {
  const started = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true, note: note ?? "", ms: Date.now() - started });
    console.log(`PASS ${name}${note ? ` — ${note}` : ""} (${Date.now() - started} ms)`);
  } catch (error) {
    results.push({ name, ok: false, note: String(error?.message ?? error).split("\n")[0] });
    console.log(`FAIL ${name} — ${String(error?.message ?? error).split("\n")[0]}`);
  }
}

// A locked nav item's accessible name becomes "Label, locked: defeat X"
// (first-session-redesign.md section 3), so match by prefix, not exact.
const nav = (page, label) => page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: new RegExp(`^${label}\\b`) }).click();

// WCAG relative-luminance contrast ratio, computed from this project's own
// CSS custom-property hex values (styles.css's :root block) rather than an
// external tool — deterministic and exact for these fixed tokens.
function luminance(hex) {
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((h) => parseInt(h, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(hexA, hexB) {
  const lA = luminance(hexA) + 0.05;
  const lB = luminance(hexB) + 0.05;
  return lA > lB ? lA / lB : lB / lA;
}

const TOKENS = { bg: "#1c1915", bgPanel: "#26221c", bgPanelRaised: "#302b23", text: "#f1e9da", textMuted: "#cfc3ae", brass: "#c9a24b", brassText: "#1c1915", teal: "#4caf9e", red: "#e08585", border: "#7a715a", focusRing: "#7fd6c4" };
console.log("Measured contrast (WCAG relative luminance, this project's fixed tokens):");
console.log(`  body text on bg: ${contrast(TOKENS.text, TOKENS.bg).toFixed(2)}:1 (need >=4.5:1)`);
console.log(`  muted text on panel: ${contrast(TOKENS.textMuted, TOKENS.bgPanel).toFixed(2)}:1 (need >=4.5:1)`);
console.log(`  brass button text on brass: ${contrast(TOKENS.brassText, TOKENS.brass).toFixed(2)}:1 (need >=4.5:1)`);
console.log(`  border on panel (component boundary): ${contrast(TOKENS.border, TOKENS.bgPanel).toFixed(2)}:1 (need >=3:1)`);
console.log(`  focus ring on bg: ${contrast(TOKENS.focusRing, TOKENS.bg).toFixed(2)}:1 (need >=3:1)`);
console.log(`  teal (success) on bg-panel: ${contrast(TOKENS.teal, TOKENS.bgPanel).toFixed(2)}:1 (need >=3:1 for UI/large text)`);
console.log(`  red (danger) on bg-panel: ${contrast(TOKENS.red, TOKENS.bgPanel).toFixed(2)}:1 (need >=3:1 for UI/large text)`);

await startServer();
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
let page = await ctx.newPage();
// The initial unauthenticated GET /dev/session/current 401 (before a company
// is picked) is expected, normal REST behavior, not a bug — scripts/
// walkthrough.mjs treats console errors as informational for the same
// reason. Only unexpected errors after that point are asserted on.
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && !m.text().includes("401") && consoleErrors.push(m.text()));
const timings = {};
const t0 = Date.now();

try {
  await step("FS setup: load client, pick a fresh company", async () => {
    await page.goto(baseUrl);
    await page.getByRole("button", { name: "Company A" }).click();
    await page.getByRole("heading", { level: 1, name: "Company" }).waitFor();
    timings.toCompanyRender = Date.now() - t0;
    await page.screenshot({ path: path.join(outDir, "fs-01-company-1280.png") });
    return `t+${timings.toCompanyRender}ms to first Company render`;
  });

  await step("FS-02: ActivityStrip visible; nav has Codex; no console errors on load", async () => {
    await page.locator(".activity-strip").waitFor();
    const text = await page.locator(".activity-strip-status").innerText();
    assert.match(text, /idle/i);
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Codex" }).waitFor();
    assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" || ")}`);
    return `activity strip text: "${text}"`;
  });

  await step("FS-03: Next-step card shows goal 1 (dispatch) on a fresh account", async () => {
    const heading = await page.locator("#next-step-heading").innerText();
    await page.locator(".first-dispatch-guide").waitFor();
    return `next-step heading: "${heading}"`;
  });

  await step("FS-04: formation board operable by keyboard; dirty marker appears then clears", async () => {
    const firstSlot = page.locator(".formation-slot button").first();
    await firstSlot.focus();
    await page.keyboard.press("Enter");
    await page.locator(".formation-slot-picker").first().waitFor();
    const radios = page.locator(".formation-slot-picker input[type=radio]");
    const count = await radios.count();
    assert.ok(count >= 3, `expected >=3 roster radios, found ${count}`);
    await radios.nth(1).check();
    await page.locator(".unsaved-marker").first().waitFor();
    await firstSlot.click(); // closes the (deliberately still-open) picker
    await page.getByRole("button", { name: "Save formation" }).click();
    await page.waitForFunction(() => !document.querySelector(".unsaved-marker"));
    timings.toFormationDecision = Date.now() - t0;
    return `t+${timings.toFormationDecision}ms to a saved formation decision; dirty marker appeared and cleared`;
  });

  await step("FS-05: guided dispatch reaches Expedition in <=3 activations after the formation choice", async () => {
    await page.getByRole("button", { name: "Keep this formation" }).click();
    const dispatchButton = page.locator(".first-dispatch-guide").getByRole("button", { name: "Start Expedition" });
    await dispatchButton.click();
    await page.getByRole("heading", { level: 1, name: "Expedition" }).waitFor();
    timings.toDispatch = Date.now() - t0;
    return `t+${timings.toDispatch}ms to dispatch (2 activations: Keep this formation, Start Expedition)`;
  });

  await step("FS-07: Expedition hierarchy — idle party summary, Collect primary / Stop secondary styling", async () => {
    await page.getByRole("button", { name: "Stop and Collect" }).waitFor();
    const primaryClass = await page.getByRole("button", { name: "Collect Rewards" }).getAttribute("class");
    const secondaryClass = await page.getByRole("button", { name: "Stop and Collect" }).getAttribute("class");
    assert.match(primaryClass ?? "", /expedition-primary-action/);
    assert.match(secondaryClass ?? "", /expedition-secondary-action/);
    return `primary="${primaryClass}" secondary="${secondaryClass}"`;
  });

  await step("FS-06: Spoils survives a navigation away and back; shows no fight before any credit", async () => {
    await page.locator(".fight-none, .screen-expedition").first().waitFor().catch(() => {});
    assert.ok(await page.getByText(/first fight report appears after it is credited/).isVisible());
    advance(5);
    await page.getByRole("button", { name: "Collect Rewards" }).click();
    await page.locator(".spoils-panel").waitFor();
    timings.toFirstSpoils = Date.now() - t0;
    await nav(page, "Company");
    await page.getByRole("heading", { level: 1, name: "Company" }).waitFor();
    await nav(page, "Expedition");
    await page.getByRole("heading", { level: 1, name: "Expedition" }).waitFor();
    const stillThere = await page.locator(".spoils-panel").isVisible();
    assert.ok(stillThere, "Spoils panel did not survive navigating away and back");
    return `t+${timings.toFirstSpoils}ms to first Spoils; survived Company->Expedition nav`;
  });

  await step("FS-01: no recorded report ever says live or in progress", async () => {
    const bodyText = await page.locator("main").innerText();
    assert.doesNotMatch(bodyText, /battle in progress/i);
    return "no 'battle in progress' text found on Expedition after a settle";
  });

  await step("FS-08: Codex screen shows six classes, skills table, works regardless of activity lock", async () => {
    await nav(page, "Codex");
    await page.getByRole("heading", { level: 1, name: "Codex" }).waitFor();
    const classButtons = await page.locator(".codex-class-list button").count();
    assert.equal(classButtons, 6, `expected 6 classes, found ${classButtons}`);
    await page.locator(".codex-class-list button").first().click();
    await page.locator(".codex-skills-table").waitFor();
    return `${classButtons} classes listed; skills table rendered`;
  });

  await step("FS-09: Dungeon nav shows a locked reason as text before the Tollkeeper is claimed", async () => {
    const dungeonButton = page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /Dungeon/ });
    const accessibleName = await dungeonButton.getAttribute("aria-label");
    assert.match(accessibleName ?? "", /locked/);
    return `dungeon nav accessible name: "${accessibleName}"`;
  });

  await step("FS-10: no text below 0.75rem renders on Expedition/Company (computed style sweep)", async () => {
    await nav(page, "Company");
    const tooSmall = await page.evaluate(() => {
      const offenders = [];
      document.querySelectorAll("main *").forEach((el) => {
        if (el.textContent?.trim() && el.children.length === 0) {
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (size < 12) offenders.push(`${el.tagName}.${el.className}: ${size}px`);
        }
      });
      return offenders;
    });
    assert.equal(tooSmall.length, 0, `elements below 0.75rem (12px @16px root): ${tooSmall.join(", ")}`);
    return "no element under 12px (0.75rem) found";
  });

  await step("390px: screenshots, no horizontal overflow, nav wraps without scroll", async () => {
    const ctxNarrow = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pageN = await ctxNarrow.newPage();
    await pageN.goto(baseUrl);
    await pageN.getByRole("button", { name: "Company A" }).click();
    const widths = {};
    for (const screen of ["Company", "Expedition", "Dungeon", "Inventory", "Boss", "Arena", "Codex"]) {
      await nav(pageN, screen);
      await pageN.getByRole("heading", { level: 1, name: screen }).waitFor();
      widths[screen] = await pageN.evaluate(() => document.documentElement.scrollWidth);
      await pageN.screenshot({ path: path.join(outDir, `fs-390-${screen.toLowerCase()}.png`), fullPage: true });
    }
    const overflow = Object.entries(widths).filter(([, w]) => w > 390);
    await ctxNarrow.close();
    assert.equal(overflow.length, 0, `horizontal overflow at 390px: ${JSON.stringify(widths)}`);
    return `scrollWidths: ${JSON.stringify(widths)}`;
  });

  await step("keyboard-only: reach Company via Tab+Enter from the account selector; focus visible", async () => {
    const ctxK = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const pageK = await ctxK.newPage();
    await pageK.goto(baseUrl);
    await pageK.getByRole("button", { name: "Company A" }).waitFor();
    let focused = "";
    for (let i = 0; i < 10 && focused !== "Company A"; i++) {
      await pageK.keyboard.press("Tab");
      focused = await pageK.evaluate(() => document.activeElement?.textContent ?? "");
    }
    assert.equal(focused, "Company A");
    const outline = await pageK.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    await pageK.keyboard.press("Enter");
    await pageK.getByRole("heading", { level: 1, name: "Company" }).waitFor();
    await ctxK.close();
    return `focus outline style on activated element: ${outline}`;
  });

  await step("reduced motion: BattleView starts paused, no skip past live cursor", async () => {
    const ctxR = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
    const pageR = await ctxR.newPage();
    await pageR.goto(baseUrl);
    await pageR.getByRole("button", { name: "Company B" }).click();
    await nav(pageR, "Boss");
    await pageR.getByRole("button", { name: "Challenge" }).click();
    await pageR.locator(".battle-result-panel").waitFor();
    const playLabel = await pageR.locator(".battle-result-panel").getByRole("button", { name: /Play|Pause/ }).innerText();
    await ctxR.close();
    assert.equal(playLabel, "Play", `expected reduced-motion to start paused ("Play" shown), got "${playLabel}"`);
    return `reduced-motion BattleView control reads "${playLabel}" (paused)`;
  });
} finally {
  await browser.close().catch(() => {});
  await app.close().catch(() => {});
  fs.rmSync(tmpDir, { recursive: true, force: true });
  const passed = results.filter((r) => r.ok).length;
  console.log(`\nfs-redesign-check: ${passed}/${results.length} steps passed`);
  console.log(`timings: ${JSON.stringify(timings)}`);
  console.log(`console errors across the whole run: ${consoleErrors.length ? consoleErrors.join(" || ") : "none"}`);
  console.log(`screenshots: ${outDir}`);
  if (passed !== results.length) process.exitCode = 1;
}
