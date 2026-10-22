// QA (this task): independently confirm three M2 claims that no prior QA run
// had exercised end-to-end — design/game/classes.md's "6 base classes"
// freeze, a full 5-hero party formation via PATCH /party/formation (M2-25),
// and one completed combat replay (not just a UI-control smoke check).
// Against the built server's real HTTP API; no UI/browser involved here
// (browser-ui.mjs and combat-replay.mjs cover the UI side separately).
import assert from "node:assert/strict";
import { CLASS_BASE_STATS_V2 } from "@banner-and-bounty/content";
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

const { clock, advanceMs } = makeManualClock("2026-10-22T09:00:00.000Z");
const server = await startTestServer({ clock });
const { baseUrl } = server;
console.log(`server up at ${baseUrl}`);

const A = makeClient(baseUrl);
await A.post("/dev/session/select", { accountSlot: "A" });

await check("class count: exactly 6 base classes shipped, matching design/game/classes.md section 1", async () => {
  assert.equal(CLASS_BASE_STATS_V2.length, 6, `expected 6 base classes, got ${CLASS_BASE_STATS_V2.length}`);
  const ids = CLASS_BASE_STATS_V2.map((c) => c.classId).sort();
  const expected = ["class_arcanist", "class_cleric", "class_herald", "class_ranger", "class_rogue", "class_vanguard"].sort();
  assert.deepEqual(ids, expected, `classId set must match design/game/classes.md section 1`);
  return `6 classes: ${ids.join(", ")}`;
});

await check("recruit 2 more heroes (3 starters + 2 recruited = 5) and fill all 5 formation slots", async () => {
  let st = await state(A);
  assert.equal(st.heroes.length, 3, `fresh account should start with 3 starter heroes, got ${st.heroes.length}`);

  // Fresh accounts start with 0 gold (seed.ts grants heroes but no
  // starting gold); recruiting the 4th hero costs RECRUIT_BASE_COST(150) *
  // ownedCount(3) = 450, and the 5th costs 150*4 = 600 (heroService.ts
  // scales cost by current roster size) — 1050 gold total. Earn it via
  // repeated real 8-hour-capped expedition settlements rather than
  // fabricating a gold balance directly in the DB.
  while (st.gold < 1050) {
    await A.post("/expedition/start", { requestId: uuid(), expectedRevision: st.revision }).catch(() => {});
    advanceMs(9 * 60 * 60 * 1000); // >8h, hits the 480-cycle cap each round
    const settleRes = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: (await state(A)).revision });
    assert.equal(settleRes.status, 200, JSON.stringify(settleRes.json));
    st = await state(A);
  }
  await A.post("/expedition/stop", { requestId: uuid(), expectedRevision: st.revision });
  st = await state(A);
  assert.ok(st.gold >= 1050, `need >=1050 gold to recruit the 4th+5th heroes, have ${st.gold}`);

  const recruit1 = await A.post("/hero/recruit", { requestId: uuid(), expectedRevision: st.revision, primaryClassId: "class_cleric" });
  assert.equal(recruit1.status, 200, JSON.stringify(recruit1.json));
  st = await state(A);
  const recruit2 = await A.post("/hero/recruit", { requestId: uuid(), expectedRevision: st.revision, primaryClassId: "class_herald" });
  assert.equal(recruit2.status, 200, JSON.stringify(recruit2.json));

  st = await state(A);
  assert.equal(st.heroes.length, 5, `expected 5 heroes after 2 recruits, got ${st.heroes.length}`);

  const slots = st.heroes.map((h) => h.heroId);
  const formRes = await A.patch("/party/formation", { requestId: uuid(), expectedRevision: st.revision, slots });
  assert.equal(formRes.status, 200, JSON.stringify(formRes.json));
  assert.deepEqual(formRes.json.data.formation.slots, slots, "all 5 slots must hold the 5 distinct heroIds, in order");

  const after = await state(A);
  const filled = after.formation.slots.filter((s) => s !== null);
  assert.equal(filled.length, 5, `expected all 5 formation slots filled, got ${filled.length}`);
  assert.equal(new Set(filled).size, 5, "all 5 slots must hold distinct heroIds");
  return `5 heroes recruited (${st.heroes.map((h) => h.primaryClassId).join(", ")}), formation.slots fully filled with 5 distinct heroIds`;
});

await check("one completed combat replay end-to-end: full 5-hero party vs. boss, deterministic outcome and event log", async () => {
  const st = await state(A);
  const res = await A.post("/boss/challenge", { requestId: uuid(), expectedRevision: st.revision });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const { report } = res.json.data;
  assert.ok(["win", "loss", "draw"].includes(report.result.outcome), `expected a definite outcome, got ${report.result.outcome}`);
  assert.ok(report.events.length > 0, "a completed battle must have a non-empty event log");
  assert.ok(report.result.rounds >= 1, "a completed battle must report at least 1 round");
  const unitsA = (report.participantsSnapshot?.units ?? []).filter((u) => u.side === "A");
  assert.equal(unitsA.length, 5, `expected all 5 fielded heroes as side-A combat units, got ${unitsA.length}`);
  // Replaying the stored report must be deterministic: fetching it again by
  // ID returns the byte-identical events/result (A04's "same seed/rules
  // version yield identical events" — exercised here on a real stored
  // report, not a re-simulation).
  const refetch = await A.get(`/battle-reports/${report.reportId}`);
  assert.equal(refetch.status, 200);
  assert.deepEqual(refetch.json.data.report, report, "refetching the same report by ID must return byte-identical events/result");
  return `outcome=${report.result.outcome}, rounds=${report.result.rounds}, events=${report.events.length}, 5 side-A combat units; refetch byte-identical`;
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(` - ${f.name}: ${f.note.split("\n")[0]}`);
}
await server.close();
process.exitCode = failed.length ? 1 : 0;
