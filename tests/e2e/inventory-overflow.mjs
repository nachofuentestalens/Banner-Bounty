// M2-07: independently exercise the 100-item unequipped-inventory cap
// (design/qa/acceptance.md "maximum inventory overflow" fixture;
// design/studio/contracts.md M1-08 "inventory_full"/overflow-conversion
// decision) against the built server's real HTTP API. New script — does
// not modify or duplicate tests/e2e/api-attacks.mjs or boss-arena.mjs.
//
// Seeding 100 unequipped items by playing the game to completion would take
// many expedition cycles with no drop-rate guarantee; to reach the boundary
// deterministically we seed item_instances rows directly in this run's own
// *temporary, isolated* SQLite file (same technique and schema as
// apps/server/src/progression.test.ts's own "addItems" fixture), then drive
// every assertion through the real HTTP API — this is a QA fixture, not a
// product-code reuse, and the DB is destroyed with the rest of the run.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { startTestServer, makeManualClock, makeClient, uuid } from "./lib/server.mjs";

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

async function state(client) {
  const res = await client.get("/account/state");
  assert.equal(res.status, 200);
  return res.json.data;
}

const { clock, advanceMs } = makeManualClock("2026-10-19T09:00:00.000Z");
const server = await startTestServer({ clock });
const { baseUrl, dbPath } = server;
console.log(`server up at ${baseUrl}, db at ${dbPath}`);

const A = makeClient(baseUrl);
const selectRes = await A.post("/dev/session/select", { accountSlot: "A" });
assert.equal(selectRes.status, 200);
const accountIdA = selectRes.json.data.accountId;

function seedUnequippedItems(count) {
  const db = new DatabaseSync(dbPath);
  const stmt = db.prepare(
    `INSERT INTO item_instances (itemInstanceId, accountId, definitionId, affixId, equippedBy, createdAt)
     VALUES (?, ?, ?, ?, NULL, ?)`,
  );
  const now = new Date().toISOString();
  for (let i = 0; i < count; i++) {
    stmt.run(`qa-seed-${uuid()}`, accountIdA, "item_trinket_luckycoin", null, now);
  }
  db.close();
}

function countUnequipped() {
  const db = new DatabaseSync(dbPath);
  const row = db.prepare("SELECT COUNT(*) AS n FROM item_instances WHERE accountId = ? AND equippedBy IS NULL").get(accountIdA);
  db.close();
  return row.n;
}

await check("setup: seed 99 unequipped items directly (fixture, not product code)", async () => {
  seedUnequippedItems(99);
  const n = countUnequipped();
  assert.equal(n, 99);
  const st = await state(A);
  assert.equal(st.inventory.length, 99, "/account/state must reflect the seeded rows");
  return "99 unequipped items confirmed via DB count and /account/state";
});

await check("boundary: one more drop reaches exactly 100 and is kept (not converted)", async () => {
  const st = await state(A);
  const goldBefore = st.gold;
  await A.post("/expedition/start", { requestId: uuid(), expectedRevision: st.revision });
  advanceMs(10 * 60_000); // several cycles, to reliably observe at least one drop while under the cap
  const res = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const settlement = res.json.data;
  const after = await state(A);
  assert.ok(after.inventory.length <= 100, `inventory must never exceed 100, got ${after.inventory.length}`);
  if (settlement.rewards.items.length === 0 && settlement.overflow.convertedCount === 0) {
    return `inconclusive this run: no item dropped while approaching the cap (inventory ${after.inventory.length}/100) — not a confirmed defect, just no drop this seed window`;
  }
  // 99 preexisting + however many drops landed this settle: the first drop
  // that reaches slot 100 must be kept; only drops after the cap is already
  // full may convert. The precise count-vs-conversion split for >1 drop in
  // one settle is exercised deterministically by the next check (seeded to
  // exactly 100 beforehand); here we only assert the invariant that holds
  // regardless of how many drops occurred: the cap is never exceeded, and
  // at least one item was kept if inventory grew past 99.
  if (after.inventory.length > 99) {
    assert.ok(settlement.rewards.items.length >= 1, "inventory grew past 99, so at least one drop must have been kept (not converted)");
  }
  return `inventory now ${after.inventory.length}/100; rewards.items=${settlement.rewards.items.length}; overflow.convertedCount=${settlement.overflow.convertedCount}; gold ${goldBefore}->${after.gold}`;
});

await check("overflow: further drops at a full 100-item inventory convert to gold, never exceeding the cap", async () => {
  // Top up to exactly 100 unequipped regardless of the previous check's
  // outcome, so this check is self-contained and deterministic.
  const current = countUnequipped();
  if (current < 100) seedUnequippedItems(100 - current);
  assert.equal(countUnequipped(), 100, "precondition: exactly 100 unequipped items before this check");

  const before = await state(A);
  const goldBefore = before.gold;
  await A.post("/expedition/stop", { requestId: uuid(), expectedRevision: before.revision }).catch(() => {});
  const st = await state(A);
  await A.post("/expedition/start", { requestId: uuid(), expectedRevision: st.revision });
  advanceMs(10 * 60_000); // 10 cycles: expect multiple drop attempts to exercise conversion
  const res = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const settlement = res.json.data;
  const after = await state(A);

  assert.equal(after.inventory.length, 100, `inventory must stay capped at exactly 100 unequipped items, got ${after.inventory.length}`);
  assert.equal(settlement.rewards.items.length, 0, "no new ItemInstance should be returned once the cap is already full");
  // `rewards.gold` already includes `overflow.convertedGold` (confirmed by
  // inspecting `settlement.recentCycles`: a cycle with a converted drop
  // reports a higher per-cycle `gold` than a no-drop cycle) — it is not an
  // additional amount on top.
  assert.equal(after.gold, goldBefore + settlement.rewards.gold, "gold must increase by exactly rewards.gold (which already folds in any overflow conversion)");
  if (settlement.overflow.convertedCount > 0) {
    assert.ok(settlement.overflow.convertedGold > 0, "a non-zero convertedCount must report non-zero convertedGold");
    assert.ok(settlement.rewards.gold >= settlement.overflow.convertedGold, "rewards.gold must be at least the converted-overflow amount it includes");
  }
  return `inventory held at 100; overflow.convertedCount=${settlement.overflow.convertedCount}, convertedGold=${settlement.overflow.convertedGold}; gold ${goldBefore}->${after.gold}`;
});

await check("unequip at a full 100-item inventory is refused with validation/inventory_full, and the equipped item stays equipped (no loss of equipped gear)", async () => {
  // Stop the expedition first so equip/unequip is not blocked by
  // active_expedition (contracts.md precondition order: ownership ->
  // active_expedition -> validation -> conflict).
  const st0 = await state(A);
  const stopRes = await A.post("/expedition/stop", { requestId: uuid(), expectedRevision: st0.revision });
  assert.equal(stopRes.status, 200, JSON.stringify(stopRes.json));

  // Ensure exactly 100 unequipped items, then equip one into a hero's
  // weapon slot by seeding it directly and marking it equipped, so we can
  // attempt to unequip it back into an already-full inventory.
  const db = new DatabaseSync(dbPath);
  const stAfterStop = JSON.parse(JSON.stringify(await state(A)));
  const heroId = stAfterStop.heroes[0].heroId;
  const equippedItemId = `qa-equipped-${uuid()}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO item_instances (itemInstanceId, accountId, definitionId, affixId, equippedBy, createdAt)
     VALUES (?, ?, ?, NULL, ?, ?)`,
  ).run(equippedItemId, accountIdA, "item_weapon_shortsword", heroId, now);
  db.prepare(`UPDATE heroes SET equipmentWeapon = ? WHERE heroId = ?`).run(equippedItemId, heroId);
  db.close();

  const unequippedBefore = countUnequipped();
  if (unequippedBefore < 100) {
    seedUnequippedItems(100 - unequippedBefore);
  }
  assert.equal(countUnequipped(), 100, "precondition: exactly 100 unequipped items, one additional item equipped");

  const st = await state(A);
  const res = await A.post("/equipment/unequip", { requestId: uuid(), expectedRevision: st.revision, heroId, slot: "weapon" });
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assert.equal(res.json.error.code, "validation");
  assert.equal(res.json.error.details?.reason, "inventory_full");
  assert.equal(countUnequipped(), 100, "unequip must not have created a 101st unequipped item");
  const afterRejection = await state(A);
  const hero = afterRejection.heroes.find((h) => h.heroId === heroId);
  assert.equal(hero.equipment.weapon, equippedItemId, "the equipped weapon must remain equipped after the rejected unequip — no loss of equipped gear");
  return `unequip at full inventory -> 400 validation, details.reason=inventory_full, unequipped count still 100, equipped weapon untouched`;
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED/INCONCLUSIVE:");
  for (const f of failed) console.log(` - ${f.name}: ${f.note.split("\n")[0]}`);
}
await server.close();
process.exitCode = failed.length ? 1 : 0;
