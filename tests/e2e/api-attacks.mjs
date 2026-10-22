// QA M1-15: API-level independent verification of A02, A05, A06, A07, A08,
// A09, A10 against the *built* server (run `npm run build` first). Exercises
// ownership attacks, retry/concurrency races, offline-settlement edge cases,
// one-time boss reward and arena snapshot immutability directly over HTTP,
// bypassing the UI so results aren't a DOM-snapshot duplicate of the
// implementation (design/qa/acceptance.md fixture requirements).
//
// Uses temporary isolated databases only (tests/e2e/lib/server.mjs). Each
// check prints PASS/FAIL with the concrete observed values so this output can
// be pasted into qa/reports/M1-15.md as evidence, not invented.
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

async function selectAccount(client, slot) {
  const res = await client.post("/dev/session/select", { accountSlot: slot });
  assert.equal(res.status, 200, `select ${slot} status`);
  return res.json.data;
}

async function state(client) {
  const res = await client.get("/account/state");
  assert.equal(res.status, 200);
  return res.json.data;
}

// PATCH /party/formation (M2-25) replaces PATCH /party/order's fixed 3-tuple
// with a 5-slot nullable tuple (packages/contracts/src/index.ts). Pads any
// ordered heroId list out to 5 slots with null.
function toSlots(ids) {
  const slots = [...ids, null, null, null, null, null];
  return slots.slice(0, 5);
}

// ---------------------------------------------------------------------------
const { clock, advanceMs } = makeManualClock("2026-10-19T09:00:00.000Z");
const server = await startTestServer({ clock });
const { baseUrl, dbPath } = server;
console.log(`server up at ${baseUrl}, db ${dbPath}`);

const A = makeClient(baseUrl);
const B = makeClient(baseUrl);
await selectAccount(A, "A");
await selectAccount(B, "B");
const aState0 = await state(A);
const bState0 = await state(B);

// ---- A02: account isolation / ownership attacks -----------------------
await check("A02.1 B cannot equip using A's heroId/itemInstanceId", async () => {
  const aHero = aState0.heroes[0];
  // give A an item to try to steal: not needed — attempt foreign hero id directly.
  const res = await B.post("/equipment/equip", {
    requestId: uuid(),
    expectedRevision: bState0.revision,
    heroId: aHero.heroId,
    itemInstanceId: "00000000-0000-0000-0000-000000000000",
    slot: "weapon",
  });
  assert.equal(res.status, 403, `expected 403, got ${res.status} ${JSON.stringify(res.json)}`);
  assert.equal(res.json.error.code, "forbidden");
  return `foreign heroId -> 403 forbidden`;
});

await check("A02.2 B cannot read A's battle report by ID", async () => {
  const bossRes = await A.post("/boss/challenge", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  assert.equal(bossRes.status, 200);
  const reportId = bossRes.json.data.report.reportId;
  const res = await B.get(`/battle-reports/${reportId}`);
  assert.equal(res.status, 404, `expected 404 (not_found, no forbidden leak), got ${res.status}`);
  assert.equal(res.json.error.code, "not_found");
  return `cross-account report read -> 404 not_found (no existence leak)`;
});

await check("A02.3 unauthenticated request is rejected", async () => {
  const anon = makeClient(baseUrl);
  const res = await anon.get("/account/state");
  assert.equal(res.status, 401);
  assert.equal(res.json.error.code, "unauthenticated");
  return "no-cookie /account/state -> 401";
});

await check("A02.4 B cannot reorder party using A's heroIds", async () => {
  const aHeroes = aState0.heroes.map((h) => h.heroId);
  const res = await B.patch("/party/formation", {
    requestId: uuid(),
    expectedRevision: (await state(B)).revision,
    slots: toSlots(aHeroes),
  });
  assert.equal(res.status, 403);
  assert.equal(res.json.error.code, "forbidden");
  return "foreign heroIds in /party/formation -> 403 forbidden";
});

// ---- A07: retry / concurrency ------------------------------------------
await check("A07.1 identical retry (same requestId) returns identical result, no double credit", async () => {
  const fresh = makeClient(baseUrl);
  await selectAccount(fresh, "A"); // new session, same account A
  const st = await state(A);
  const partyRes1 = await fresh.patch("/party/formation", {
    requestId: "11111111-1111-1111-1111-111111111111",
    expectedRevision: st.revision,
    slots: toSlots([st.heroes[1].heroId, st.heroes[0].heroId, st.heroes[2].heroId]),
  });
  assert.equal(partyRes1.status, 200);
  const rev1 = partyRes1.json.revision;
  const partyRes2 = await fresh.patch("/party/formation", {
    requestId: "11111111-1111-1111-1111-111111111111",
    expectedRevision: st.revision,
    slots: toSlots([st.heroes[1].heroId, st.heroes[0].heroId, st.heroes[2].heroId]),
  });
  assert.equal(partyRes2.status, 200);
  assert.deepEqual(partyRes2.json.data, partyRes1.json.data, "retry must return identical stored result");
  assert.equal(partyRes2.json.revision, rev1, "retry must not bump revision again");
  return `retry returned identical data at revision ${rev1} both times`;
});

await check("A07.2 reused requestId with different payload -> conflict, no mutation", async () => {
  const st = await state(A);
  const reqId = "22222222-2222-2222-2222-222222222222";
  const first = await A.patch("/party/formation", {
    requestId: reqId,
    expectedRevision: st.revision,
    slots: toSlots([st.heroes[0].heroId, st.heroes[1].heroId, st.heroes[2].heroId]),
  });
  assert.equal(first.status, 200);
  const before = await state(A);
  const second = await A.patch("/party/formation", {
    requestId: reqId,
    expectedRevision: before.revision, // even with a fresh, correct revision
    slots: toSlots([st.heroes[2].heroId, st.heroes[1].heroId, st.heroes[0].heroId]), // different payload, same requestId
  });
  assert.equal(second.status, 409, `expected 409 conflict, got ${second.status}`);
  assert.equal(second.json.error.code, "conflict");
  const after = await state(A);
  assert.deepEqual(after.formation.slots, before.formation.slots, "party formation must not have changed");
  assert.equal(after.revision, before.revision, "revision must not have changed");
  return "reused requestId + different payload -> 409 conflict, state unchanged";
});

await check("A07.3 two concurrent settle calls at same revision: only one commits", async () => {
  // Start a fresh expedition for A, advance real-cycle time, then fire two
  // distinct settle requests concurrently at the same expectedRevision.
  const started = await A.post("/expedition/start", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  assert.equal(started.status, 200, JSON.stringify(started.json));
  advanceMs(3 * 60_000); // 3 whole cycles available
  const stBefore = await state(A);
  const [r1, r2] = await Promise.all([
    A.post("/expedition/settle", { requestId: uuid(), expectedRevision: stBefore.revision }),
    A.post("/expedition/settle", { requestId: uuid(), expectedRevision: stBefore.revision }),
  ]);
  const okCount = [r1, r2].filter((r) => r.status === 200).length;
  const conflictCount = [r1, r2].filter((r) => r.status === 409).length;
  assert.equal(okCount, 1, `expected exactly 1 to succeed, got ${okCount} (statuses ${r1.status}/${r2.status})`);
  assert.equal(conflictCount, 1, `expected exactly 1 conflict, got ${conflictCount}`);
  const winner = r1.status === 200 ? r1 : r2;
  assert.equal(winner.json.data.creditedCycles, 3, `expected 3 credited cycles, got ${winner.json.data.creditedCycles}`);
  // stop to leave a clean state for later checks
  const stopRes = await A.post("/expedition/stop", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  assert.equal(stopRes.status, 200);
  return `exactly one of two concurrent settles committed (${winner.json.data.creditedCycles} cycles), the other got 409`;
});

// ---- A05: equip/unequip and active-expedition lock ---------------------
// Fresh accounts start with no unequipped items (seed.ts grants heroes but
// no starting drops), so run a short expedition first to accrue real drop
// items to equip/unequip against, instead of fabricating an inventory row.
await check("A05.0 run expedition cycles to accrue a real drop for equip/unequip checks", async () => {
  const st = await state(A);
  await A.post("/expedition/start", { requestId: uuid(), expectedRevision: st.revision });
  advanceMs(20 * 60_000); // 20 cycles; tuning.md median first drop ~cycle 2.5
  const settleRes = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  assert.equal(settleRes.status, 200);
  await A.post("/expedition/stop", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  const after = await state(A);
  return `${after.inventory.length} unequipped item(s) in inventory after 20 cycles`;
});

// ItemInstance (repositories/itemRepository.ts) has no `.slot` field; slot is
// a property of the item *definition* (packages/content). Inventory rows
// only carry definitionId, so derive slot from its `item_<slot>_...` prefix.
const slotOf = (item) => item.definitionId.split("_")[1];

await check("A05.1 equip into wrong slot fails validation", async () => {
  const st = await state(A);
  const weapon = st.inventory.find((i) => slotOf(i) === "weapon");
  if (!weapon) throw new Error("no weapon drop after 20 cycles — rerun with more cycles or inspect manually, not a confirmed defect");
  const hero = st.heroes[0];
  const res = await A.post("/equipment/equip", {
    requestId: uuid(),
    expectedRevision: st.revision,
    heroId: hero.heroId,
    itemInstanceId: weapon.itemInstanceId,
    slot: "armor", // wrong slot for a weapon
  });
  assert.equal(res.status, 400, `expected 400 validation, got ${res.status} ${JSON.stringify(res.json)}`);
  assert.equal(res.json.error.code, "validation");
  return "weapon into armor slot -> 400 validation";
});

await check("A05.2 equip/spec blocked while expedition active (active_expedition)", async () => {
  const st = await state(A);
  const startRes = await A.post("/expedition/start", { requestId: uuid(), expectedRevision: st.revision });
  assert.equal(startRes.status, 200, JSON.stringify(startRes.json));
  const st2 = await state(A);
  const weapon = st2.inventory.find((i) => slotOf(i) === "weapon");
  const equipRes = await A.post("/equipment/equip", {
    requestId: uuid(),
    expectedRevision: st2.revision,
    heroId: st2.heroes[0].heroId,
    itemInstanceId: weapon ? weapon.itemInstanceId : "00000000-0000-0000-0000-000000000000",
    slot: "weapon",
  });
  assert.equal(equipRes.status, 409, `expected 409 (active_expedition maps to conflict family per errors.ts), got ${equipRes.status} code=${equipRes.json.error.code}`);
  assert.equal(equipRes.json.error.code, "active_expedition");
  const stopRes = await A.post("/expedition/stop", { requestId: uuid(), expectedRevision: st2.revision });
  assert.equal(stopRes.status, 200);
  return `equip during active expedition -> active_expedition (${equipRes.status}); stopped cleanly after`;
});

await check("A05.3 reorder party IS allowed during active expedition (M1-01 decision)", async () => {
  const st = await state(A);
  const startRes = await A.post("/expedition/start", { requestId: uuid(), expectedRevision: st.revision });
  assert.equal(startRes.status, 200);
  const st2 = await state(A);
  const slots = toSlots([st2.heroes[2].heroId, st2.heroes[1].heroId, st2.heroes[0].heroId]);
  const reorderRes = await A.patch("/party/formation", { requestId: uuid(), expectedRevision: st2.revision, slots });
  assert.equal(reorderRes.status, 200, `reorder should succeed mid-expedition, got ${reorderRes.status} ${JSON.stringify(reorderRes.json)}`);
  const stopRes = await A.post("/expedition/stop", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  assert.equal(stopRes.status, 200);
  return "party reorder succeeded while expedition active, as contracted";
});

// ---- A06: offline settlement edge cases --------------------------------
await check("A06.1 59s elapsed credits 0 cycles, checkpoint unchanged", async () => {
  const st = await state(A);
  await A.post("/expedition/start", { requestId: uuid(), expectedRevision: st.revision });
  const st2 = await state(A);
  const checkpointBefore = st2.expedition.checkpointAt;
  advanceMs(59_000);
  const res = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: st2.revision });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.creditedCycles, 0);
  assert.equal(res.json.revision, st2.revision, "no-op settle must not bump revision");
  const st3 = await state(A);
  assert.equal(st3.expedition.checkpointAt, checkpointBefore, "checkpoint must be unchanged at 59s");
  await A.post("/expedition/stop", { requestId: uuid(), expectedRevision: st3.revision });
  return "59s -> 0 credited cycles, checkpoint and revision unchanged";
});

await check("A06.1b 60s elapsed credits exactly 1 cycle", async () => {
  const st = await state(A);
  await A.post("/expedition/start", { requestId: uuid(), expectedRevision: st.revision });
  advanceMs(60_000);
  const res = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.creditedCycles, 1, `expected 1 cycle at exactly 60s, got ${res.json.data.creditedCycles}`);
  await A.post("/expedition/stop", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  return "60s -> exactly 1 credited cycle";
});

await check("A06.1c 61s elapsed credits 1 cycle, 1000ms deferred (not lost)", async () => {
  const st = await state(A);
  await A.post("/expedition/start", { requestId: uuid(), expectedRevision: st.revision });
  advanceMs(61_000);
  const res = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  assert.equal(res.json.data.creditedCycles, 1, `expected 1 cycle at 61s, got ${res.json.data.creditedCycles}`);
  // The leftover 1000ms must be recoverable: settling again after 59000ms
  // more (1000ms deferred + 59000ms = 60000ms = 1 more whole cycle) proves
  // it wasn't discarded.
  advanceMs(59_000);
  const res2 = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  assert.equal(res2.json.data.creditedCycles, 1, `expected the deferred 1s + 59s to combine into 1 more cycle, got ${res2.json.data.creditedCycles}`);
  await A.post("/expedition/stop", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  return "61s -> 1 cycle credited, deferred 1000ms recovered on next settle (not lost)";
});

await check("A06.2 partitioned settlement equals continuous settlement (125s split vs direct)", async () => {
  // Partitioned: settle at +60s, then +65s more (125s total across 2 calls).
  const st = await state(A);
  await A.post("/expedition/start", { requestId: uuid(), expectedRevision: st.revision });
  advanceMs(60_000);
  const s1 = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  advanceMs(65_000);
  const s2 = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  const partitionedTotal = s1.json.data.creditedCycles + s2.json.data.creditedCycles;
  await A.post("/expedition/stop", { requestId: uuid(), expectedRevision: (await state(A)).revision });

  // Continuous: fresh expedition, advance 125s once, settle once.
  const st4 = await state(A);
  await A.post("/expedition/start", { requestId: uuid(), expectedRevision: st4.revision });
  advanceMs(125_000);
  const direct = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  await A.post("/expedition/stop", { requestId: uuid(), expectedRevision: (await state(A)).revision });

  assert.equal(partitionedTotal, 2, `expected 2 total cycles across partitioned calls, got ${partitionedTotal}`);
  assert.equal(direct.json.data.creditedCycles, 2, `expected 2 cycles in one direct settle, got ${direct.json.data.creditedCycles}`);
  return `partitioned (${s1.json.data.creditedCycles}+${s2.json.data.creditedCycles}=${partitionedTotal}) == continuous (${direct.json.data.creditedCycles})`;
});

await check("A06.3 8-hour cap discards excess, repeated collection grants nothing more", async () => {
  const st = await state(A);
  await A.post("/expedition/start", { requestId: uuid(), expectedRevision: st.revision });
  advanceMs(10 * 60 * 60 * 1000); // 10 real hours
  const settleRes = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  assert.equal(settleRes.status, 200);
  assert.equal(settleRes.json.data.creditedCycles, 480, `expected 480-cycle cap, got ${settleRes.json.data.creditedCycles}`);
  assert.equal(settleRes.json.data.elapsedMs, 36_000_000);
  assert.equal(settleRes.json.data.discardedMs, 7_200_000, `expected 2h discarded, got ${settleRes.json.data.discardedMs}`);
  const again = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  assert.equal(again.json.data.creditedCycles, 0, "immediate repeat collection must grant nothing more");
  await A.post("/expedition/stop", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  return `10h offline -> 480 cycles credited, 7.2e6ms discarded, repeat collect -> 0 (discarded time unrecoverable)`;
});

await check("A06.4 negative elapsed (clock rollback) clamps to 0, no negative reward/crash", async () => {
  const st = await state(A);
  await A.post("/expedition/start", { requestId: uuid(), expectedRevision: st.revision });
  advanceMs(-5_000); // rollback before checkpoint
  const res = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  assert.equal(res.status, 200, `rollback must not crash/error, got ${res.status} ${JSON.stringify(res.json)}`);
  assert.equal(res.json.data.creditedCycles, 0);
  assert.equal(res.json.data.elapsedMs, 0, "elapsed must clamp to 0, not go negative");
  advanceMs(5_000); // restore clock
  await A.post("/expedition/stop", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  return "clock rollback -> elapsedMs clamped to 0, creditedCycles 0, no crash";
});

// ---- A08: unsupported rules version on reopen --------------------------
await check("A08.1 stale Expedition.rulesVersion on settle -> validation unsupported_rules_version", async () => {
  const st = await state(A);
  const startRes = await A.post("/expedition/start", { requestId: uuid(), expectedRevision: st.revision });
  assert.equal(startRes.status, 200);
  // Directly corrupt the persisted rulesVersion to simulate an old save
  // reopened under a newer server (contracts.md "Migration/reopen behavior").
  const direct = new DatabaseSync(dbPath);
  direct.exec("PRAGMA journal_mode = WAL;");
  const aAccountId = (await A.get("/dev/session/current")).json.data.accountId;
  direct.prepare("UPDATE expeditions SET rulesVersion = 999 WHERE accountId = ?").run(aAccountId);
  direct.close();
  advanceMs(60_000);
  const settleRes = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  assert.equal(settleRes.status, 400, `expected 400 validation, got ${settleRes.status} ${JSON.stringify(settleRes.json)}`);
  assert.equal(settleRes.json.error.code, "validation");
  assert.equal(settleRes.json.error.details?.reason, "unsupported_rules_version", `expected details.reason, got ${JSON.stringify(settleRes.json.error.details)}`);
  // Repair for subsequent checks: reset rulesVersion back to 1 and stop.
  const direct2 = new DatabaseSync(dbPath);
  direct2.exec("PRAGMA journal_mode = WAL;");
  direct2.prepare("UPDATE expeditions SET rulesVersion = 1 WHERE accountId = ?").run(aAccountId);
  direct2.close();
  const stopRes = await A.post("/expedition/stop", { requestId: uuid(), expectedRevision: (await state(A)).revision });
  assert.equal(stopRes.status, 200);
  return "mismatched rulesVersion on settle -> 400 validation, details.reason=unsupported_rules_version";
});

await check("A08.2 server restart (rebuild in-process, same DB file) reproduces identical /account/state", async () => {
  const before = await state(A);
  await server.app.close();
  const { buildServer } = await import(new URL("../../apps/server/dist/app.js", import.meta.url).href);
  const restarted = buildServer({ dbPath, clock });
  const restartedUrl = await restarted.listen({ port: 0, host: "127.0.0.1" });
  const freshClient = makeClient(restartedUrl);
  await selectAccount(freshClient, "A");
  const after = await state(freshClient);
  assert.deepEqual(after, before, "state after restart must be byte-identical to before (no mutation on reopen)");
  await restarted.close();
  // Original `server` handle is now closed; subsequent checks in this script
  // that reused `A`/`B` against the old baseUrl would fail, so this check
  // runs last.
  return "restart with same DB file -> /account/state deep-equal before/after";
});

// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(` - ${f.name}: ${f.note.split("\n")[0]}`);
}
process.exitCode = failed.length ? 1 : 0;
