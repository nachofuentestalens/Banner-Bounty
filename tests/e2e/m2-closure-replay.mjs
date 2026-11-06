// Current production component, preserved real reports. No regenerated historical artifacts.
// This is component/browser evidence, not a new end-to-end server playthrough.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';
const root = fileURLToPath(new URL('../..', import.meta.url));
const out = path.join(root, 'qa/artifacts/M2-closure/status-controls');
fs.mkdirSync(out, { recursive: true });
const server = await createServer({ root, configFile: false, esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 0 }, cacheDir: path.join(out, '.vite') });
await server.listen();
const browser = await chromium.launch();
const results = [], findings = [], errors = [];
const names = { status_burn: 'Burning', status_taunt: 'Taunting', status_fortify: 'Fortified', status_weaken: 'Weakened', status_haste: 'Hastened', status_regen: 'Regenerating' };
try {
  const labels = ['expedition', 'boss', 'dungeon-floor-1', 'dungeon-floor-2', 'dungeon-floor-3', 'dungeon-boss', 'arena', 'five-party'];
  for (const label of labels) {
    const report = label === 'five-party'
      ? JSON.parse(fs.readFileSync(path.join(root, 'qa/artifacts/M2-closure/roster/battle-layout.json'))).report
      : JSON.parse(fs.readFileSync(path.join(root, `qa/artifacts/M2-closure/battles/${label}-report.json`)));
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    page.on('pageerror', e => errors.push({ label, message: e.message }));
    await page.goto(`${server.resolvedUrls.local[0]}tests/e2e/m2-closure-replay.html`);
    await page.waitForFunction(() => typeof window.showReport === 'function');
    await page.evaluate(r => window.showReport(r), report);
    const units = report.participantsSnapshot.units;
    const unitCard = u => page.locator(`.team-${u.side} .combatant`).nth(units.filter(x => x.side === u.side).sort((a, b) => a.slotIndex - b.slotIndex).findIndex(x => x.unitId === u.unitId));
    await expect(page.locator('.combatant')).toHaveCount(units.length);
    let positions = 0, expiryChecks = 0, refreshChecks = 0;
    const expectedAt = cursor => {
      const hp = Object.fromEntries(units.map(u => [u.unitId, u.maxHp]));
      const statuses = Object.fromEntries(units.map(u => [u.unitId, new Map()]));
      let round = 1;
      for (const e of report.events.slice(0, cursor)) {
        // Age every retained effect once per crossed round, per combat.md 8.1.
        while (round < e.round) { for (const effects of Object.values(statuses)) for (const effect of effects.values()) effect.remaining--; round++; }
        if (e.targetId && e.hpAfter !== null) hp[e.targetId] = e.hpAfter;
        if (e.statusApplied) statuses[e.targetId].set(e.statusApplied.statusId, { remaining: e.statusApplied.duration, stacks: e.statusApplied.stacks });
        if (e.statusExpired) statuses[e.targetId].delete(e.statusExpired);
      }
      if (cursor === report.events.length) Object.assign(hp, report.result.finalHp);
      return { hp, statuses };
    };
    const check = async (cursor, control) => {
      const expected = expectedAt(cursor);
      await expect(page.locator('.battle-controls')).toContainText(`${cursor} / ${report.events.length} actions`);
      for (const u of units) {
        const card = unitCard(u);
        await expect(card.locator('strong')).toHaveText(u.name);
        await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(Math.max(0, expected.hp[u.unitId])));
        const row = `.team-${u.side} .row-${u.slotIndex < 3 ? 'front' : 'back'}`;
        assert.ok(await card.evaluate((el, selector) => !!el.closest(selector), row));
        await expect(page.locator(row).locator('.row-label')).toHaveText(u.slotIndex < 3 ? 'Front row' : 'Back row');
        const wanted = [...expected.statuses[u.unitId]].map(([id, s]) => {
          assert.ok(names[id], `unknown status ${id}`);
          return `${names[id]}${s.stacks > 1 ? ` x${s.stacks}` : ''} (${Math.max(0, s.remaining)}r)`;
        }).sort();
        const actual = (await card.locator('.status-badge').allTextContents()).map(s => s.trim()).sort();
        if (JSON.stringify(actual) !== JSON.stringify(wanted)) findings.push({ label, cursor, control, unit: u.unitId, wanted, actual });
      }
      positions++;
    };
    await check(0, 'initial');
    const seen = new Set();
    for (let i = 0; i < report.events.length; i++) {
      const e = report.events[i];
      if (e.statusExpired) { expiryChecks++; seen.delete(`${e.targetId}/${e.statusExpired}`); }
      if (e.statusApplied) { const key = `${e.targetId}/${e.statusApplied.statusId}`; if (seen.has(key)) refreshChecks++; seen.add(key); }
      await page.getByRole('button', { name: 'Step', exact: true }).click();
      await check(i + 1, 'step');
    }
    await page.clock.install();
    for (const speed of [1, 2, 4]) {
      await page.getByRole('button', { name: 'Restart replay' }).click();
      await check(0, 'restart');
      await page.getByRole('combobox', { name: 'Speed' }).selectOption(String(speed));
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page.clock.runFor(1100);
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await check(speed, `${speed}x`);
      await page.clock.runFor(1500);
      await check(speed, 'pause');
    }
    await page.getByRole('button', { name: 'Skip to end' }).click();
    await check(report.events.length, 'skip');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await check(report.events.length, 'narrow');
    await page.screenshot({ path: path.join(out, `${label}-390.png`), fullPage: true });
    const enemies = [];
    for (const u of units.filter(u => u.kind !== 'hero')) {
      const card = unitCard(u);
      enemies.push({ name: u.name, kind: u.kind, classId: u.classId, displayedClass: await card.locator('.unit-class').allTextContents() });
    }
    results.push({ label, events: report.events.length, positions, expiryChecks, refreshChecks, enemies });
    console.log(`PASS ${label}: ${positions} HP/status/formation positions, ${expiryChecks} expirations, ${refreshChecks} refreshes`);
    await page.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(findings, []);
} finally {
  fs.writeFileSync(path.join(out, 'observations.json'), JSON.stringify({ scope: 'Current component with historical real reports; not fresh server-generated fights', results, findings, errors }, null, 2));
  await browser.close();
  await server.close();
}
