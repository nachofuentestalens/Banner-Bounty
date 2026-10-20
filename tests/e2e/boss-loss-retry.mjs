// M2-07: independently exercise a forced boss LOSS and the retry path
// (design/qa/acceptance.md A09 "Boss loss is recoverable"; M1-15's own
// "Unresolved issues" #1 — every boss attempt in that run won, so the
// loss/retry path was never exercised). New script — does not modify or
// duplicate tests/e2e/boss-arena.mjs, which only exercises wins.
//
// A fresh level-1 account (no expedition cycles run) is well below
// tuning.md's documented level-3 boss-ready point, so a challenge at level 1
// is expected to lose. This is forced via real gameplay state (level), not
// a mocked battle outcome.
import assert from "node:assert/strict";
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

const { clock } = makeManualClock("2026-10-19T09:00:00.000Z");
const server = await startTestServer({ clock });
const { baseUrl } = server;
console.log(`server up at ${baseUrl}`);

const A = makeClient(baseUrl);
const selectRes = await A.post("/dev/session/select", { accountSlot: "A" });
assert.equal(selectRes.status, 200);

let forcedLoss = false;

await check("precondition: fresh account is level 1 (no expedition run), nothing claimed", async () => {
  const st = await state(A);
  const minLevel = Math.min(...st.heroes.map((h) => h.level));
  assert.equal(minLevel, 1, "expected a fresh level-1 account for this check");
  const claimed = (st.bossClaims ?? []).filter((c) => c.claimedAt !== null);
  assert.equal(claimed.length, 0, "fresh account must have no claimed boss reward yet");
  return `min hero level=${minLevel}, gold=${st.gold}, bossClaims entries=${st.bossClaims?.length ?? 0}, none claimed`;
});

await check("A09-loss: a level-1 challenge loses; no reward, no claim, no state corruption", async () => {
  const st = await state(A);
  const goldBefore = st.gold;
  const revBefore = st.revision;
  const res = await A.post("/boss/challenge", { requestId: uuid(), expectedRevision: revBefore });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const { report, rewardGranted, reward } = res.json.data;
  assert.ok(report, "a report must be written even on a loss");
  if (report.result.outcome !== "loss") {
    throw new Error(`expected outcome=loss at level 1, got ${report.result.outcome} — level-1 boss difficulty did not force a loss this run, inconclusive, not a confirmed defect`);
  }
  forcedLoss = true;
  assert.equal(rewardGranted, false, "a loss must never grant the one-time reward");
  assert.equal(reward, null, "reward must be null on a loss");
  const after = await state(A);
  assert.equal(after.gold, goldBefore, "gold must be unchanged after a loss");
  const claimedAfter = (after.bossClaims ?? []).filter((c) => c.claimedAt !== null);
  assert.equal(claimedAfter.length, 0, "a loss must not mark any boss claimed");
  assert.equal(after.heroes.length, st.heroes.length, "hero roster must be intact after a loss (no deletion/corruption)");
  assert.ok(after.revision >= revBefore, "revision must not go backwards");
  return `loss recorded, rewardGranted=false, reward=null, gold unchanged (${after.gold}), no claim, revision ${revBefore}->${after.revision}`;
});

await check("retry path: the same account can immediately re-challenge after a loss, repeatedly, with no lockout", async () => {
  if (!forcedLoss) throw new Error("skipped: previous check did not confirm a forced loss");
  const outcomes = [];
  for (let i = 0; i < 4; i++) {
    const st = await state(A);
    const res = await A.post("/boss/challenge", { requestId: uuid(), expectedRevision: st.revision });
    assert.equal(res.status, 200, `retry #${i + 1} must succeed (200), got ${res.status}: ${JSON.stringify(res.json)}`);
    outcomes.push(res.json.data.report.result.outcome);
  }
  // No lockout/cooldown is documented anywhere in contracts.md; every retry
  // must be accepted as a fresh, independent challenge.
  assert.equal(outcomes.length, 4, "all 4 retries must have been accepted");
  return `4 consecutive retries all accepted (200), outcomes: ${outcomes.join(", ")}`;
});

await check("state integrity across retries: gold/claims stay correct regardless of how many losses occurred", async () => {
  if (!forcedLoss) throw new Error("skipped: previous check did not confirm a forced loss");
  const st = await state(A);
  const goldBefore = st.gold;
  const claimedBefore = (st.bossClaims ?? []).filter((c) => c.claimedAt !== null).length;
  const res = await A.post("/boss/challenge", { requestId: uuid(), expectedRevision: st.revision });
  assert.equal(res.status, 200);
  const after = await state(A);
  const claimedAfter = (after.bossClaims ?? []).filter((c) => c.claimedAt !== null).length;
  if (res.json.data.report.result.outcome === "loss") {
    assert.equal(after.gold, goldBefore, "repeated losses must never change gold");
    assert.equal(claimedAfter, claimedBefore, "repeated losses must never create a claim");
  } else {
    // A win can occur here if hero XP from the simulated fight pushed a
    // level-up (a loss still awards no gold in this game, but the fight's
    // own in-combat effects are out of scope for this check); either way
    // the reward/claim invariants from A09.1 in boss-arena.mjs apply and
    // are not re-asserted here to avoid duplicating that script.
    assert.ok(typeof res.json.data.rewardGranted === "boolean");
  }
  return `after one more retry: outcome=${res.json.data.report.result.outcome}, gold ${goldBefore}->${after.gold}, claimed ${claimedBefore}->${claimedAfter}`;
});

await check("retried challenge with a stale revision is rejected with conflict, not silently applied twice", async () => {
  const st = await state(A);
  const staleRevision = st.revision;
  const res1 = await A.post("/boss/challenge", { requestId: uuid(), expectedRevision: staleRevision });
  assert.equal(res1.status, 200);
  // Reuse the now-stale revision for a second, distinct request.
  const res2 = await A.post("/boss/challenge", { requestId: uuid(), expectedRevision: staleRevision });
  assert.equal(res2.status, 409, `a second challenge reusing the now-stale revision must be rejected, got ${res2.status}`);
  assert.equal(res2.json.error.code, "conflict");
  return `second challenge with stale expectedRevision -> 409 conflict (first challenge already advanced the revision)`;
});

if (!forcedLoss) {
  results.push({
    name: "A09-loss root cause",
    ok: false,
    note: "a level-1 challenge never produced a loss in this run; boss-loss recovery could not be exercised. Not a confirmed product defect — see qa/reports/M2-07.md.",
  });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED/INCONCLUSIVE:");
  for (const f of failed) console.log(` - ${f.name}: ${f.note.split("\n")[0]}`);
}
await server.close();
process.exitCode = failed.length ? 1 : 0;
