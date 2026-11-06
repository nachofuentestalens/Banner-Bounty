// Closure evidence only: real API commands, accelerated server clock, isolated save.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { buildServer } from '../../apps/server/dist/app.js';
import { makeManualClock } from './lib/server.mjs';
const out = 'qa/artifacts/M2-closure/mechanics-current';
fs.mkdirSync(out, { recursive: true });
const evidence = { accelerated: true, checks: {}, errors: [] };
const { clock, advanceMs } = makeManualClock('2026-11-06T09:00:00Z');
const app = buildServer({ clock, dbPath: ':memory:', webDistDir: new URL('../../apps/web/dist', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
const url = await app.listen({ host: '127.0.0.1', port: 0 });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => evidence.errors.push(e.message));
const state = async () => (await (await page.request.get(url + '/account/state')).json()).data;
async function cmd(endpoint, data = {}, method = 'post') {
  const s = await state();
  const r = await page.request[method](url + endpoint, { data: { requestId: crypto.randomUUID(), expectedRevision: s.revision, ...data } });
  assert.equal(r.status(), 200, `${endpoint}: ${await r.text()}`);
  return (await r.json()).data;
}
const save = (name, data) => fs.writeFileSync(`${out}/${name}.json`, JSON.stringify(data, null, 2));
async function fight(heroId) {
  await cmd('/expedition/start'); advanceMs(60000);
  const r = await cmd('/expedition/settle'); await cmd('/expedition/stop');
  const report = r.latestBattleReport;
  const unit = report.participantsSnapshot.units.find(u => u.unitId === heroId);
  const attack = report.events.find(e => e.sourceId === heroId && e.damageBreakdown?.steps.some(s => s.kind === 'attack'));
  assert.ok(attack, 'hero must make a non-dodged attack');
  return { maxHp: unit.maxHp, atk: attack.damageBreakdown.steps.find(s => s.kind === 'attack').value, report };
}
try {
  await page.goto(url);
  await page.getByRole('button', { name: 'Company A', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Company', exact: true, level: 1 })).toBeVisible();
  let s = await state();
  const hero = s.heroes[1]; // Ranger: no passive percentage HP/ATK modifiers.
  await cmd('/expedition/start');
  const drops = [];
  for (let i = 0; i < 10; i++) {
    const before = new Set((await state()).inventory.map(x => x.itemInstanceId));
    advanceMs(8 * 3600000); const settlement = await cmd('/expedition/settle');
    const fresh = (await state()).inventory.filter(x => !before.has(x.itemInstanceId));
    drops.push(...fresh.map(item => ({ batch: i, item })));
    if (i === 0) save('first-settlement', settlement);
  }
  await cmd('/expedition/stop');
  const pair = drops.flatMap((a, i) => drops.slice(i + 1).filter(b => a.item.definitionId === b.item.definitionId && a.item.rarityId === b.item.rarityId && a.item.affixes.some(x => b.item.affixes.some(y => x.affixId === y.affixId && x.value !== y.value))).map(b => [a, b]))[0];
  assert.ok(pair, 'two actual same-definition/same-rarity drops with differing values');
  save('actual-drops', { totalRetainedDrops: drops.length, pair });
  evidence.checks.drops = { pass: true, pair };
  await cmd('/boss/challenge');
  await cmd('/dungeon/start', { dungeonId: 'dungeon_aqueduct_depths' });
  for (let i = 0; i < 4; i++) { advanceMs(180000); const r = await cmd('/dungeon/settle'); if (r.outcome !== 'in_progress') break; }
  const beforeCraft = await state();
  const replacement = beforeCraft.inventory.find(x => !x.equippedBy);
  const craft = await cmd('/craft', { recipeId: 'craft_uncommon', definitionId: 'item_weapon_shortsword', ...(beforeCraft.inventory.filter(x => !x.equippedBy).length >= 100 ? { replacementItemInstanceId: replacement.itemInstanceId } : {}) });
  const afterCraft = await state();
  assert.equal(beforeCraft.gold - afterCraft.gold, 100);
  assert.equal(beforeCraft.materials.scrap - afterCraft.materials.scrap, 4);
  const reforge = await cmd('/reforge', { itemInstanceId: craft.item.itemInstanceId, affixIndex: 0 });
  const afterReforge = await state();
  assert.equal(afterCraft.gold - afterReforge.gold, 50);
  assert.equal(afterCraft.materials.scrap - afterReforge.materials.scrap, 2);
  assert.equal(afterCraft.materials.sigil, afterReforge.materials.sigil);
  assert.equal(afterCraft.materials.core, afterReforge.materials.core);
  assert.notDeepEqual(craft.item.affixes, reforge.item.affixes);
  // Preserve real-earned level; no XP/save edits. Solo Ranger is already at cap.
  await cmd('/party/formation', { slots: [hero.heroId, null, null, null, null] }, 'patch');
  const beforeEquip = await fight(hero.heroId);
  await cmd('/equipment/equip', { heroId: hero.heroId, itemInstanceId: reforge.item.itemInstanceId, slot: 'weapon' });
  const afterEquip = await fight(hero.heroId);
  const affixes = reforge.item.affixes;
  const hpDelta = affixes.filter(x => x.affixId === 'affix_of_vigor').reduce((n, x) => n + x.value, 0);
  const atkDelta = 3 + affixes.filter(x => x.affixId === 'affix_of_power').reduce((n, x) => n + x.value, 0);
  assert.equal(afterEquip.maxHp - beforeEquip.maxHp, hpDelta);
  assert.equal(afterEquip.atk - beforeEquip.atk, atkDelta);
  save('gear-next-fight', { craft, reforge, costs: { craftGold: 100, craftScrap: 4, reforgeGold: 50, reforgeScrap: 2 }, expected: { hpDelta, atkDelta }, beforeEquip, afterEquip });
  await page.reload();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Inventory', exact: true }).click();
  const row = page.locator('.item-row').filter({ has: page.getByRole('button', { name: 'Unequip', exact: true }) });
  await expect(row).toHaveCount(1);
  await expect(row.locator('.rarity-tag')).toHaveText('(Uncommon)');
  evidence.checks.gear = { pass: true, expected: { hpDelta, atkDelta }, equippedText: await row.innerText() };
  await page.screenshot({ path: `${out}/equipped-1280.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${out}/equipped-390.png`, fullPage: true });
  evidence.checks.gear.note = 'HP snapshot and attack operand measured; DEF/SPD not exposed by participant snapshots and not asserted here.';
} finally {
  save('observations', evidence); await browser.close(); await app.close();
}
console.log(JSON.stringify(evidence.checks, null, 2));
