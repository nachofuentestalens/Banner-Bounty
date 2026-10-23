// Independent report-to-browser checks. Setup advances the server clock, never edits saves.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { buildServer } from '../../apps/server/dist/app.js';
import { makeManualClock } from './lib/server.mjs';

const out = fileURLToPath(new URL('../../qa/artifacts/M2-29/battles/', import.meta.url));
fs.mkdirSync(out, { recursive: true });
const { clock, advanceMs } = makeManualClock('2026-10-23T12:00:00Z');
const app = buildServer({ clock, dbPath: ':memory:', webDistDir: fileURLToPath(new URL('../../apps/web/dist', import.meta.url)) });
const url = await app.listen({ host: '127.0.0.1', port: 0 });
const results = [], findings = [];
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.getByRole('button', { name: 'Company A', exact: true }).click();
  const state = async () => (await (await page.request.get(`${url}/account/state`)).json()).data;
  const command = async (endpoint, data = {}) => {
    const r = await page.request.post(`${url}${endpoint}`, { data: { requestId: crypto.randomUUID(), expectedRevision: (await state()).revision, ...data } });
    assert.equal(r.status(), 200, await r.text());
    return (await r.json()).data;
  };
  const clickReport = async (button, endpoint, field) => {
    const response = page.waitForResponse(r => r.url().endsWith(endpoint) && r.request().method() === 'POST');
    await page.getByRole('button', { name: button, exact: true }).click();
    const r = await response;
    assert.equal(r.status(), 200, await r.text());
    const data = (await r.json()).data;
    return field ? data[field] : data;
  };
  async function inspect(report, label) {
    assert.ok(report?.events.length, `${label}: actual report required`);
    fs.writeFileSync(`${out}/${label}-report.json`, JSON.stringify(report, null, 2));
    const units = report.participantsSnapshot.units;
    const cards = page.locator('.combatant');
    await expect(cards).toHaveCount(units.length);
    const card = u => page.locator(`.team-${u.side} .combatant`).nth(units.filter(x => x.side === u.side).sort((a, b) => a.slotIndex - b.slotIndex).findIndex(x => x.unitId === u.unitId));
    const hp = Object.fromEntries(units.map(u => [u.unitId, u.maxHp]));
    const cursor = async () => Number((await page.locator('.battle-controls').innerText()).match(/(\d+) \/ \d+ actions/)[1]);
    const checkHp = async expected => {
      for (const u of units) {
        await expect(card(u).getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(expected[u.unitId]));
        await expect(card(u).locator('.hp-label')).toHaveText(`${expected[u.unitId]} / ${u.maxHp} HP`);
      }
    };
    await checkHp(hp);
    for (const u of units) await expect(card(u).locator('strong')).toHaveText(u.name);
    for (const u of units) if (u.kind === 'hero') await expect(card(u).locator('.unit-class')).not.toBeEmpty();
    await page.locator('.battle-result-panel summary').click();
    const lines = await page.locator('.battle-log > li').allTextContents();
    fs.writeFileSync(`${out}/${label}-feed.json`, JSON.stringify(lines, null, 2));
    assert.equal(lines.length, report.events.length);
    let deaths = 0, heals = 0, statuses = 0;
    for (let i = 0; i < report.events.length; i++) {
      const e = report.events[i], line = lines[i];
      const names = { aimed_shot: 'Aimed Shot', mending_light: 'Mending Light', firebolt: 'Firebolt', quick_shot: 'Quick Shot', bulwark_call: 'Bulwark Call', strike: 'Strike' };
      if (e.skillId) { assert.ok(names[e.skillId], `extend independent skill-name fixture: ${e.skillId}`); assert.ok(line.includes(names[e.skillId]), `${label} event ${i}: skill name`); }
      for (const id of [e.sourceId, e.targetId].filter(Boolean)) assert.ok(line.includes(units.find(u => u.unitId === id).name), `${label} event ${i}: name`);
      if (e.amount) assert.ok(line.includes(String(Math.abs(e.amount))), `${label} event ${i}: exact amount`);
      if (e.death) { assert.match(line, /falls/); deaths++; }
      if (e.amount > 0) { assert.match(line, /healing|recovers/); heals++; }
      await page.getByRole('button', { name: 'Step', exact: true }).click();
      assert.equal(await cursor(), i + 1);
      if (e.targetId && e.hpAfter !== null) hp[e.targetId] = e.hpAfter;
      await checkHp(i === report.events.length - 1 ? report.result.finalHp : hp);
      if (e.amount > 0 && heals === 1) await page.locator('.battle-result-panel').screenshot({ path: `${out}/${label}-healing.png` });
      if (e.statusApplied) {
        statuses++;
        const badge = await card(units.find(u => u.unitId === e.targetId)).locator('.status-badges').innerText();
        if (!badge.includes(`(${e.statusApplied.duration}r)`)) findings.push({ type: 'status-duration', label, eventIndex: i, round: e.round, applied: e.statusApplied, displayed: badge });
        if (statuses === 1) await page.locator('.battle-result-panel').screenshot({ path: `${out}/${label}-status.png` });
      }
    }
    await page.locator('.battle-result-panel summary').click();
    await page.getByRole('button', { name: 'Restart replay', exact: true }).click();
    // The clock is browser-only here: compare progress at 1x and 4x, then pause stability.
    await page.clock.install();
    const counts = [];
    for (const speed of ['1', '4']) {
      await page.locator('.battle-controls select').selectOption(speed);
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page.clock.runFor(1100);
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      const stopped = await cursor();
      const atPause = Object.fromEntries(units.map(u => [u.unitId, u.maxHp]));
      for (const e of report.events.slice(0, stopped)) if (e.targetId && e.hpAfter !== null) atPause[e.targetId] = e.hpAfter;
      await checkHp(atPause);
      await page.clock.runFor(1500);
      assert.equal(await cursor(), stopped, 'paused cursor stable');
      await checkHp(atPause);
      counts.push(stopped);
      await page.getByRole('button', { name: 'Restart replay', exact: true }).click();
    }
    assert.deepEqual(counts, [1, 4], `${label}: 1x/4x progress`);
    await page.getByRole('button', { name: 'Skip to end', exact: true }).click();
    assert.equal(await cursor(), report.events.length);
    await checkHp(report.result.finalHp);
    await page.locator('.battle-result-panel').screenshot({ path: `${out}/${label}-final.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('.battle-result-panel').screenshot({ path: `${out}/${label}-390.png` });
    await page.setViewportSize({ width: 1280, height: 900 });
    results.push({ label, kind: report.kind, seed: report.seed, events: report.events.length, deaths, heals, statuses, speedCounts: counts, hpAndSteps: 'pass', feed: 'actor/target/skill names, exact amounts, healing and deaths pass' });
    console.log(`PASS ${label}: ${report.events.length} exact steps/HP; feed; pause/speed/skip; narrow overflow`);
  }
  await page.getByRole('button', { name: 'Expedition', exact: true }).click();
  await page.getByRole('button', { name: 'Start Expedition', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Collect Rewards', exact: true })).toBeVisible();
  advanceMs(61000);
  await inspect(await clickReport('Collect Rewards', '/expedition/settle', 'latestBattleReport'), 'expedition');
  // Earn levels using bounded actual settlements, then unlock the first dungeon with a boss win.
  for (let i = 0; i < 3; i++) { advanceMs(8 * 3600000); await command('/expedition/settle'); }
  await command('/expedition/stop');
  await page.reload();
  await page.getByRole('button', { name: 'Boss', exact: true }).click();
  const boss = await clickReport('Challenge', '/boss/challenge', 'report');
  await inspect(boss, 'boss');
  assert.equal(boss.result.outcome, 'win', 'dungeon unlock');
  await page.getByRole('button', { name: 'Expedition', exact: true }).click();
  await expect(page.locator('.area-select-list button')).toHaveCount(2);
  await page.getByRole('button', { name: 'The Sunken Aqueduct', exact: true }).click();
  await expect.poll(async () => (await state()).selectedAreaId).toBe('area_sunken_aqueduct');
  await page.getByRole('button', { name: 'The Old Road', exact: true }).click();
  await expect.poll(async () => (await state()).selectedAreaId).toBe('area_old_road');
  await page.screenshot({ path: `${out}/two-areas.png`, fullPage: true });
  results.push({ label: 'two-areas', result: 'PASS both unlocked areas selected through browser and persisted to server state' });
  await page.getByRole('button', { name: 'Company', exact: true }).click();
  const hero = (await state()).heroes.find(h => h.primaryClassId === 'class_vanguard');
  const build = page.locator('.hero-card').filter({ has: page.locator(`#hero-card-${hero.heroId}`) });
  await build.getByLabel('Secondary class', { exact: true }).selectOption('class_cleric');
  await build.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(build.getByRole('heading', { level: 2 })).toContainText('Vanguard / Cleric');
  await build.getByLabel('Active 1', { exact: true }).selectOption('mending_light');
  await build.getByLabel('Active 2', { exact: true }).selectOption('bulwark_call');
  await build.getByRole('button', { name: /Save loadout/i }).click();
  await expect.poll(async () => (await state()).heroes.find(h => h.heroId === hero.heroId).skillLoadout.active[0]).toBe('mending_light');
  await page.getByRole('button', { name: 'Dungeon', exact: true }).click();
  await page.getByRole('button', { name: 'Enter dungeon', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check progress', exact: true })).toBeVisible();
  const floors = [];
  for (let i = 0; i < 5; i++) {
    advanceMs(180000);
    const settled = await clickReport('Check progress', '/dungeon/settle');
    floors.push(...settled.floorResults);
    const floor = settled.floorResults.at(-1);
    assert.ok(floor, 'one floor per 180 server seconds');
    const report = (await (await page.request.get(`${url}/battle-reports/${floor.reportId}`)).json()).data.report;
    await expect(page.locator('.battle-controls')).toContainText(`0 / ${report.events.length} actions`);
    await inspect(report, floor.isBoss ? 'dungeon-boss' : `dungeon-floor-${floor.floor}`);
    if (settled.outcome !== 'in_progress') break;
  }
  fs.writeFileSync(`${out}/floors.json`, JSON.stringify(floors, null, 2));
  assert.ok(floors.length > 1 && floors.at(-1).isBoss, 'multi-floor final boss observed');
  const defender = await browser.newContext();
  await defender.request.post(`${url}/dev/session/select`, { data: { accountSlot: 'B' } });
  const other = (await (await defender.request.get(`${url}/account/state`)).json()).data;
  const published = await defender.request.post(`${url}/arena/publish`, { data: { requestId: crypto.randomUUID(), expectedRevision: other.revision } });
  assert.equal(published.status(), 200);
  await page.getByRole('button', { name: 'Arena', exact: true }).click();
  await page.locator('.opponent-list button').first().click();
  await inspect(await clickReport('Challenge', '/arena/challenge', 'report'), 'arena');
  assert.ok(results.some(r => r.heals > 0), 'positive healing observed in browser');
  assert.deepEqual(errors, []);
} finally {
  fs.writeFileSync(`${out}/observations.json`, JSON.stringify({ results, findings }, null, 2));
  await browser?.close();
  await app.close();
}
if (findings.length) { console.error(`FAIL status duration presentation: ${findings.length} mismatches; see observations.json`); process.exitCode = 1; }
