// M2-29 checks 1-3: browser actions with accelerated, API-earned setup funds.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { buildServer } from '../../apps/server/dist/app.js';
import { makeManualClock } from './lib/server.mjs';

const out = fileURLToPath(new URL('../../qa/artifacts/M2-29/roster/', import.meta.url));
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bnb-m2-roster-'));
const { clock, advanceMs } = makeManualClock('2026-10-23T10:00:00Z');
const options = { clock, dbPath: path.join(tmp, 'save.sqlite'), webDistDir: fileURLToPath(new URL('../../apps/web/dist', import.meta.url)) };
let app = buildServer(options);
let browser;
try {
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.getByRole('button', { name: 'Company A', exact: true }).click();
  const state = async () => (await (await page.request.get(`${url}/account/state`)).json()).data;
  const command = async (endpoint) => {
    const response = await page.request.post(`${url}${endpoint}`, { data: { requestId: crypto.randomUUID(), expectedRevision: (await state()).revision } });
    assert.equal(response.status(), 200, await response.text());
  };
  await command('/expedition/start');
  for (let i = 0; i < 10 && (await state()).gold < 1800; i++) {
    advanceMs(8 * 3600_000);
    await command('/expedition/settle');
  }
  await command('/expedition/stop');
  assert.ok((await state()).gold >= 1800);
  await page.reload();
  await expect(page.locator('#recruit-class')).toBeVisible();
  assert.equal(await page.locator('#recruit-class option').count(), 6);
  for (const classId of ['class_cleric', 'class_herald', 'class_rogue']) {
    const count = (await state()).heroes.length;
    await page.locator('#recruit-class').selectOption(classId);
    await page.getByRole('button', { name: 'Recruit', exact: true }).click();
    await expect(page.locator('.hero-card')).toHaveCount(count + 1);
  }
  await expect(page.locator('.recruit-panel')).toContainText('Roster: 6 / 20');
  console.log('PASS M2-1: browser recruits three heroes, six cards, six classes, five formation slots.');
  const hero = (await state()).heroes.find(h => h.primaryClassId === 'class_vanguard');
  const card = page.locator('.hero-card').filter({ has: page.locator(`#hero-card-${hero.heroId}`) });
  await card.getByLabel('Secondary class', { exact: true }).selectOption('class_cleric');
  await card.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(card.getByRole('heading', { level: 2 })).toContainText('Vanguard / Cleric');
  const choices = { 'Active 1': 'bulwark_call', 'Active 2': 'mending_light', 'Passive 1': 'thick_hide', 'Passive 2': 'devotion' };
  for (const [label, value] of Object.entries(choices)) await card.getByLabel(label, { exact: true }).selectOption(value);
  await card.getByRole('button', { name: /Save loadout/i }).click();
  await expect.poll(async () => (await state()).heroes.find(h => h.heroId === hero.heroId).skillLoadout.active[1]).toBe('mending_light');
  const slots = (await state()).heroes.slice(0, 5).map(h => h.heroId);
  for (let i = 0; i < 5; i++) await page.getByLabel(i < 3 ? `Front row slot ${i + 1}` : `Back row slot ${i - 2}`, { exact: true }).selectOption(slots[i]);
  await page.getByRole('button', { name: /Save formation/i }).click();
  await expect.poll(async () => (await state()).formation.slots).toEqual(slots);
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page.getByRole('button', { name: 'Company', exact: true }).click();
  for (const [label, value] of Object.entries(choices)) await expect(card.getByLabel(label, { exact: true })).toHaveValue(value);
  const saved = await state();
  await app.close();
  app = buildServer(options);
  await app.listen({ host: '127.0.0.1', port: Number(new URL(url).port) });
  await page.reload();
  await expect(card).toBeVisible();
  for (const [label, value] of Object.entries(choices)) await expect(card.getByLabel(label, { exact: true })).toHaveValue(value);
  assert.deepEqual((await state()).heroes, saved.heroes);
  assert.deepEqual((await state()).formation.slots, slots);
  await card.screenshot({ path: path.join(out, 'dual-class-restarted-1280.png') });
  await page.locator('.formation-editor').screenshot({ path: path.join(out, 'formation-1280.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.recruit-panel').screenshot({ path: path.join(out, 'six-roster-390.png') });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Boss', exact: true }).click();
  const reportResponse = page.waitForResponse(r => r.url().endsWith('/boss/challenge') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Challenge', exact: true }).click();
  const report = (await (await reportResponse).json()).data.report;
  await expect(page.locator('.team-A .combatant')).toHaveCount(5);
  await page.locator('.battle-result-panel').screenshot({ path: path.join(out, 'five-party-battle-1280.png') });
  const layout = await page.locator('.team-A .combatant').evaluateAll(nodes => nodes.map(n => ({ text: n.textContent, x: n.getBoundingClientRect().x, y: n.getBoundingClientRect().y })));
  fs.writeFileSync(path.join(out, 'battle-layout.json'), JSON.stringify({ report, layout }, null, 2));
  const rowLabels = await page.locator('.battlefield').innerText();
  console.log('M2-3 battle row labels:', /front|back/i.test(rowLabels), 'unit x positions:', layout.map(n => n.x).join(','));
  assert.deepEqual(errors, []);
  console.log('PASS M2-2: Vanguard/Cleric active+passive from each class persist after navigation and graceful same-save server restart.');
  if (!/front/i.test(rowLabels) || !/back/i.test(rowLabels)) {
    console.error('FAIL M2-3: saved front/back formation has no visible row labels in battle; screenshot and coordinates retained for visual review.');
    process.exitCode = 1;
  }
} finally {
  await browser?.close();
  await app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
