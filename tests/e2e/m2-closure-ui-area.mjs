import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { buildServer } from '../../apps/server/dist/app.js';
import { makeManualClock } from './lib/server.mjs';
const out = 'qa/artifacts/M2-closure/ui-area-current';
fs.mkdirSync(out, { recursive: true });
const { clock, advanceMs } = makeManualClock('2026-11-06T12:00:00Z');
const app = buildServer({ clock, dbPath: ':memory:', webDistDir: fileURLToPath(new URL('../../apps/web/dist', import.meta.url)) });
const url = await app.listen({ host: '127.0.0.1', port: 0 });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const observations = { keyboard: [], area: [], solo: [], errors: [] };
page.on('pageerror', e => observations.errors.push(e.message));
const state = async () => (await (await page.request.get(url + '/account/state')).json()).data;
async function request(endpoint, data, expected = 200, method = 'post') {
  const s = await state();
  const response = await page.request[method](url + endpoint, { data: { requestId: crypto.randomUUID(), expectedRevision: s.revision, ...data } });
  const body = await response.json();
  assert.equal(response.status(), expected, JSON.stringify(body));
  return body;
}
async function key(label) {
  const target = page.getByRole('button', { name: label, exact: true });
  await expect(target).toBeVisible();
  for (let i = 0; i < 180; i++) {
    if (await target.evaluate(el => el === document.activeElement)) {
      const outline = await target.evaluate(el => { const s = getComputedStyle(el); return { style: s.outlineStyle, width: s.outlineWidth }; });
      assert.notEqual(outline.style, 'none'); assert.notEqual(outline.width, '0px');
      observations.keyboard.push({ label, outline });
      await page.keyboard.press('Enter'); return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Cannot reach ${label} by keyboard`);
}
try {
  const anon = await browser.newContext();
  assert.equal((await anon.request.get(url + '/areas')).status(), 401);
  assert.equal((await anon.request.post(url + '/area/select', { data: { requestId: crypto.randomUUID(), expectedRevision: 0, areaId: 'area_old_road' } })).status(), 401);
  await anon.close();
  await page.goto(url); await key('Company A');
  await expect(page.getByRole('heading', { name: 'Company', level: 1, exact: true })).toBeVisible();
  const initial = await state();
  const areas = (await (await page.request.get(url + '/areas')).json()).data.areas;
  assert.deepEqual(await state(), initial, 'GET /areas must not mutate account');
  assert.equal(initial.selectedAreaId, 'area_old_road');
  const locked = areas.find(a => !a.unlocked);
  assert.ok(locked);
  observations.area.push({ check: 'fresh/default/read-only/unauthenticated', pass: true, areas });
  observations.area.push({ check: 'contract name field', pass: areas.every(a => typeof a.name === 'string'), note: 'M2-01 explicitly requires name on AreaSummaryDTO' });
  const unknown = await request('/area/select', { areaId: 'qa_unknown' }, 404);
  const forbidden = await request('/area/select', { areaId: locked.areaId }, 403);
  assert.equal(unknown.error.code, 'not_found'); assert.equal(forbidden.error.code, 'forbidden');
  observations.area.push({ check: 'unknown and locked errors', pass: true });
  // Literal single fresh hero: prepare via authoritative formation, dispatch/collect/stop via keyboard.
  await request('/party/formation', { slots: [initial.heroes[0].heroId, null, null, null, null] }, 200, 'patch');
  await page.reload(); await key('Expedition'); await key('Start Expedition');
  await expect(page.getByRole('button', { name: 'Collect Rewards', exact: true })).toBeVisible();
  const frozen = await state();
  assert.equal(frozen.expedition.areaId, initial.selectedAreaId);
  const active = await request('/area/select', { areaId: locked.areaId }, 409);
  assert.equal(active.error.code, 'active_expedition');
  assert.deepEqual(await state(), frozen);
  observations.area.push({ check: 'active selection blocked, frozen expedition preserved', pass: true });
  for (let i = 0; i < 20; i++) {
    advanceMs(60000);
    const result = await request('/expedition/settle', {});
    observations.solo.push({ attempt: i + 1, outcomes: result.data.outcomes, rewards: result.data.rewards });
  }
  // API setup has advanced revision. Refresh before testing a successful UI settlement.
  await page.reload(); await key('Expedition'); advanceMs(60000);
  const collected = page.waitForResponse(r => r.url().endsWith('/expedition/settle') && r.request().method() === 'POST');
  await key('Collect Rewards'); assert.equal((await collected).status(), 200);
  await expect(page.getByRole('button', { name: 'Collect Rewards', exact: true })).toBeEnabled();
  await page.screenshot({ path: `${out}/solo-1280.png`, fullPage: true });
  await key('Stop and Collect');
  await expect(page.getByRole('button', { name: 'Start Expedition', exact: true })).toBeVisible();
  const afterSolo = await state();
  observations.soloSummary = { before: initial.heroes[0], after: afterSolo.heroes[0], improved: afterSolo.heroes[0].xp > initial.heroes[0].xp || afterSolo.heroes[0].level > initial.heroes[0].level, note: '20 literal solo cycles; failure to improve is not automatically a gameplay defect' };
  await page.setViewportSize({ width: 390, height: 844 });
  for (const label of ['Company', 'Inventory', 'Codex', 'Expedition']) {
    await key(label);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} overflow`);
    await page.screenshot({ path: `${out}/${label.toLowerCase()}-390.png`, fullPage: true });
  }
  // Unlock second area through earned progression on original party, not direct save edits.
  await request('/party/formation', { slots: [...initial.heroes.map(h => h.heroId), null, null] }, 200, 'patch');
  await request('/expedition/start', {});
  for (let i = 0; i < 10; i++) { advanceMs(8 * 3600000); await request('/expedition/settle', {}); }
  await request('/expedition/stop', {}); await request('/boss/challenge', {});
  const s = await state();
  const payload = { requestId: crypto.randomUUID(), expectedRevision: s.revision, areaId: locked.areaId };
  const select = async p => { const r = await page.request.post(url + '/area/select', { data: p }); return { status: r.status(), body: await r.json() }; };
  const selected = await select(payload); assert.equal(selected.status, 200);
  assert.deepEqual(await select(payload), selected, 'identical area retry');
  assert.equal((await select({ ...payload, requestId: crypto.randomUUID(), areaId: 'area_old_road' })).status, 409);
  await request('/expedition/start', {}); assert.equal((await state()).expedition.areaId, locked.areaId);
  await request('/expedition/stop', {});
  observations.area.push({ check: 'unlock/select/idempotent retry/stale revision/start snapshot', pass: true });
  await page.reload(); await key('Expedition');
  await page.screenshot({ path: `${out}/unlocked-areas-390.png`, fullPage: true });
  assert.equal(observations.errors.length, 0);
} finally {
  fs.writeFileSync(`${out}/observations.json`, JSON.stringify(observations, null, 2));
  await browser.close(); await app.close();
}
console.log(JSON.stringify({ keyboardActions: observations.keyboard.length, area: observations.area, soloImproved: observations.soloSummary.improved, errors: observations.errors }, null, 2));
if (observations.area.some(x => !x.pass) || !observations.soloSummary.improved) process.exitCode = 1;
