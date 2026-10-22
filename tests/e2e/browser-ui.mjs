// QA M1-15: independent browser verification of A02 (two contexts), A09
// (boss one-time reward via UI), A10 (arena cross-account via UI), A11
// (keyboard operation, both viewports, empty/error/reconnect states) against
// the *built* client served by the built API. Independent of, and not a
// rerun of, scripts/walkthrough.mjs (engineering's release-candidate check).
//
// ACCELERATED CLOCK for progression (labeled per acceptance.md); the offline
// *network* reconnect check below uses a real server stop/start, not the
// clock. Screenshots go to QA_UI_OUT (default test-results/qa-ui, gitignored).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const webDistDir = path.join(repoRoot, "apps", "web", "dist");
assert.ok(fs.existsSync(path.join(webDistDir, "index.html")), "apps/web/dist missing: run `npm run build` first");

const outDir = path.resolve(process.env.QA_UI_OUT ?? path.join(repoRoot, "test-results", "qa-ui"));
fs.mkdirSync(outDir, { recursive: true });

const results = [];
async function check(name, fn) {
  try {
    const note = await fn();
    results.push({ name, ok: true, note: note ?? "" });
    console.log(`PASS ${name}${note ? ` — ${note}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, note: String(error?.stack ?? error) });
    console.log(`FAIL ${name} — ${String(error?.message ?? error)}`);
  }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bnb-qa-ui-"));
const dbPath = path.join(tmpDir, "save.sqlite");

const MINUTE = 60_000;
let nowMs = Date.parse("2026-10-19T09:00:00.000Z");
const clock = { now: () => new Date(nowMs) };
const advance = (minutes) => (nowMs += minutes * MINUTE);

const { buildServer } = await import(new URL("../../apps/server/dist/app.js", import.meta.url).href);
let app = buildServer({ dbPath, clock, webDistDir });
let baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
let port = new URL(baseUrl).port;

const browser = await chromium.launch();
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const pageA = await ctxA.newPage();

const nav = (page, label) => page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: label, exact: true }).click();

await check("load built client; select Company A", async () => {
  const res = await pageA.goto(baseUrl);
  assert.equal(res.status(), 200);
  await pageA.getByRole("button", { name: "Company A" }).click();
  await pageA.getByRole("heading", { level: 1, name: "Company" }).waitFor();
  return "loaded and selected Company A";
});

// ---- A11: keyboard-only operation of core actions, 1280x720 ------------
await check("A11.1 keyboard-only: Expedition nav has visible focus and starts an expedition", async () => {
  let focused = "";
  for (let i = 0; i < 80 && focused !== "Expedition"; i++) {
    await pageA.keyboard.press("Tab");
    focused = await pageA.evaluate(() => document.activeElement?.textContent ?? "");
  }
  assert.equal(focused, "Expedition", "could not Tab to the Expedition nav button");
  const outline = await pageA.evaluate(() => {
    const cs = getComputedStyle(document.activeElement);
    return `${cs.outlineStyle} ${cs.outlineWidth}`;
  });
  assert.doesNotMatch(outline, /^none/, `expected a visible focus outline, got "${outline}"`);
  await pageA.keyboard.press("Enter");
  await pageA.getByRole("heading", { level: 1, name: "Expedition" }).waitFor();
  focused = "";
  for (let i = 0; i < 80 && focused !== "Start Expedition"; i++) {
    await pageA.keyboard.press("Tab");
    focused = await pageA.evaluate(() => document.activeElement?.textContent ?? "");
  }
  assert.equal(focused, "Start Expedition");
  await pageA.keyboard.press("Enter");
  await pageA.getByRole("button", { name: "Collect Rewards" }).waitFor();
  await pageA.screenshot({ path: path.join(outDir, "01-expedition-1280.png") });
  return `Tab reached Expedition/Start Expedition with outline "${outline}"; Enter started it`;
});

await check("A11.2 keyboard-only: Inventory shows empty state before any drop", async () => {
  let focused = "";
  for (let i = 0; i < 80 && focused !== "Inventory"; i++) {
    await pageA.keyboard.press("Tab");
    focused = await pageA.evaluate(() => document.activeElement?.textContent ?? "");
  }
  assert.equal(focused, "Inventory");
  await pageA.keyboard.press("Enter");
  await pageA.getByText("No items yet").waitFor();
  await pageA.screenshot({ path: path.join(outDir, "02-inventory-empty-1280.png") });
  return `reached Inventory by keyboard; empty state "No items yet" shown`;
});

await check("A11.3 keyboard-only: collect rewards and reach Boss screen", async () => {
  advance(14); // past the 12-cycle level-3 point (tuning.md)
  let focused = "";
  for (let i = 0; i < 80 && focused !== "Expedition"; i++) {
    await pageA.keyboard.press("Tab");
    focused = await pageA.evaluate(() => document.activeElement?.textContent ?? "");
  }
  await pageA.keyboard.press("Enter");
  await pageA.getByRole("heading", { level: 1, name: "Expedition" }).waitFor();
  focused = "";
  for (let i = 0; i < 80 && focused !== "Stop and Collect"; i++) {
    await pageA.keyboard.press("Tab");
    focused = await pageA.evaluate(() => document.activeElement?.textContent ?? "");
  }
  assert.equal(focused, "Stop and Collect");
  await pageA.keyboard.press("Enter");
  await pageA.getByRole("button", { name: "Start Expedition" }).waitFor();
  focused = "";
  for (let i = 0; i < 80 && focused !== "Boss"; i++) {
    await pageA.keyboard.press("Tab");
    focused = await pageA.evaluate(() => document.activeElement?.textContent ?? "");
  }
  assert.equal(focused, "Boss");
  await pageA.keyboard.press("Enter");
  await pageA.getByRole("heading", { level: 1, name: "Boss" }).waitFor();
  return "collected via keyboard; reached Boss screen via keyboard";
});

await check("A11.4 keyboard-only: challenge boss, one-time reward visible then absent", async () => {
  let focused = "";
  for (let i = 0; i < 80 && focused !== "Challenge"; i++) {
    await pageA.keyboard.press("Tab");
    focused = await pageA.evaluate(() => document.activeElement?.textContent ?? "");
  }
  assert.equal(focused, "Challenge");
  await pageA.keyboard.press("Enter");
  // BattleView now paces playback (~950ms/round) instead of resolving
  // instantly, so the outcome heading reads "Battle in progress" until
  // autoplay finishes, which can exceed a bounded wait for longer fights.
  // Jump to the end via the keyboard-reachable "Skip to end" control instead
  // of waiting out the animation.
  await pageA.locator(".battle-result-panel").getByRole("button", { name: "Skip to end" }).click();
  await pageA.waitForFunction(() => /Victory|Defeated|Draw/.test(document.querySelector(".battle-result-panel h3")?.textContent ?? ""), undefined, { timeout: 10_000 });
  const outcome = await pageA.locator(".battle-result-panel h3").innerText();
  const first = await pageA.locator(".battle-result-panel").innerText();
  await pageA.screenshot({ path: path.join(outDir, "03-boss-result-1280.png") });
  // Re-challenge via keyboard.
  focused = "";
  for (let i = 0; i < 80 && focused !== "Challenge"; i++) {
    await pageA.keyboard.press("Tab");
    focused = await pageA.evaluate(() => document.activeElement?.textContent ?? "");
  }
  assert.equal(focused, "Challenge", "could not re-find the Challenge button by keyboard");
  await pageA.keyboard.press("Enter");
  await pageA.waitForResponse((r) => r.url().endsWith("/boss/challenge"));
  await pageA.locator(".battle-result-panel").getByRole("button", { name: "Skip to end" }).click();
  await pageA.waitForFunction(() => /Victory|Defeated|Draw/.test(document.querySelector(".battle-result-panel h3")?.textContent ?? ""), undefined, { timeout: 10_000 });
  const second = await pageA.locator(".battle-result-panel").innerText();
  if (outcome === "Victory") {
    assert.match(first, /Reward:/, "first victory should show a reward line");
    assert.doesNotMatch(second, /Reward:/, "second victory must not show a reward line again");
  }
  return `outcome=${outcome}; reward shown once (keyboard-driven double challenge)`;
});

// ---- A02 / A10 via UI: two contexts, ownership, snapshot immutability --
await check("A02/A10 via UI: B publishes in a separate context; A challenges; B cannot read A's report", async () => {
  const pageB = await ctxB.newPage();
  await pageB.goto(baseUrl);
  await pageB.getByRole("button", { name: "Company B" }).click();
  await nav(pageB, "Arena");
  await pageB.getByRole("button", { name: "Publish Team" }).click();
  await pageB.waitForResponse((r) => r.url().endsWith("/arena/publish") && r.status() === 200);

  await nav(pageA, "Arena");
  await pageA.locator(".opponent-list button").first().click();
  const challengeResponse = pageA.waitForResponse((r) => r.url().endsWith("/arena/challenge"));
  await pageA.locator(".snapshot-preview-panel").getByRole("button", { name: "Challenge" }).click();
  const body = await (await challengeResponse).json();
  const reportId = body.data.report.reportId;

  const byB = await ctxB.request.get(`${baseUrl}/battle-reports/${reportId}`);
  assert.equal(byB.status(), 404, `B reading A's arena report should 404, got ${byB.status()}`);
  return `A challenged B's published team via UI; B reading A's report by ID -> ${byB.status()}`;
});

// ---- A11: 390px narrow layout, all five screens -------------------------
await check("A11.5 390px viewport: five screens, no horizontal overflow, screenshots saved", async () => {
  const ctxNarrow = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageN = await ctxNarrow.newPage();
  await pageN.goto(baseUrl);
  await pageN.getByRole("button", { name: "Company A" }).click();
  await pageN.getByRole("heading", { level: 1, name: "Company" }).waitFor();
  const screens = ["Company", "Expedition", "Dungeon", "Inventory", "Boss", "Arena"];
  const overflow = [];
  for (const label of screens) {
    if (label !== "Company") await nav(pageN, label);
    await pageN.getByRole("heading", { level: 1, name: label }).waitFor();
    const scrollWidth = await pageN.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth > 390) overflow.push(`${label}:${scrollWidth}`);
    await pageN.screenshot({ path: path.join(outDir, `04-${label.toLowerCase()}-390.png`) });
  }
  assert.equal(overflow.length, 0, `horizontal overflow on: ${overflow.join(", ")}`);
  await ctxNarrow.close();
  return `all 5 screens at 390px: scrollWidth<=390, screenshots in ${outDir}`;
});

// ---- A11: empty/error/reconnect states ----------------------------------
await check("A11.6 conflict toast: stale expectedRevision shows 'Action Rejected' and self-heals", async () => {
  // Load the Formation editor first so pageA's in-memory state (and the
  // revision its "Save formation" button will submit) is captured *before*
  // the second tab bumps the server's revision underneath it.
  await nav(pageA, "Company");
  await pageA.getByRole("heading", { level: 2, name: "Formation" }).waitFor();

  // Force a stale revision from a second tab on the same account/context.
  const pageA2 = await ctxA.newPage();
  await pageA2.goto(baseUrl);
  await pageA2.getByRole("heading", { level: 1, name: /Company|Expedition|Boss|Arena|Inventory|Dungeon/ }).waitFor();
  const staleState = await (await ctxA.request.get(`${baseUrl}/account/state`)).json();
  // Mutate from pageA2 to bump the revision pageA doesn't know about yet.
  await ctxA.request.patch(`${baseUrl}/party/formation`, {
    data: {
      requestId: crypto.randomUUID(),
      expectedRevision: staleState.data.revision,
      slots: [staleState.data.heroes[1].heroId, staleState.data.heroes[0].heroId, staleState.data.heroes[2].heroId, null, null],
    },
  });
  await pageA2.close();

  // Now pageA's in-memory state still has the old revision; edit the
  // Formation select and save, racing against the bumped server revision.
  await pageA.getByLabel("Front row slot 1").focus();
  await pageA.keyboard.press("ArrowDown");
  await pageA.getByRole("button", { name: "Save formation" }).click();
  const toastOrOk = await Promise.race([
    pageA.getByText("Action Rejected").waitFor({ timeout: 4000 }).then(() => "conflict-toast"),
    pageA.waitForTimeout(4000).then(() => "no-visible-conflict"),
  ]);
  return `stale-revision mutation from a second tab -> ${toastOrOk}`;
});

await check("A11.7 reconnect: server stop produces a reconnect state; restart recovers without reload", async () => {
  await pageA.reload();
  await pageA.getByRole("heading", { level: 1, name: "Company" }).waitFor();
  await app.close(); // simulate server going down while the page is open
  const offlineShown = await pageA
    .getByText("Reconnecting")
    .waitFor({ timeout: 12_000 })
    .then(() => true)
    .catch(() => false);
  // Restart on the same port and same DB so the open page's next poll/retry succeeds.
  app = buildServer({ dbPath, clock, webDistDir, port: undefined });
  await app.listen({ port: Number(port), host: "127.0.0.1" });
  const retryBtn = pageA.getByRole("button", { name: "Retry Now" });
  const recovered = await retryBtn
    .click({ timeout: 8000 })
    .then(() => pageA.getByText("Reconnecting").waitFor({ state: "detached", timeout: 8000 }))
    .then(() => true)
    .catch(() => false);
  if (!offlineShown) throw new Error("offline/'Reconnecting' banner never appeared after stopping the server — not a confirmed pass");
  return `offline banner shown=${offlineShown}; recovered after restart + Retry Now=${recovered}`;
});

await browser.close();
await app.close().catch(() => {});
fs.rmSync(tmpDir, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(` - ${f.name}: ${f.note.split("\n")[0]}`);
}
process.exitCode = failed.length ? 1 : 0;
