// Ad hoc evidence script for M2-29 (QA playtest, task 13c2c764): concurrent
// same-requestId retry must not duplicate expedition settlement reward, and
// a late retry of an already-applied requestId must not re-apply it either.
// Run against a disposable server (API_PORT/DB_PATH pointed at a scratch
// DB) started separately: `node tests/e2e/m2-29-concurrency-check.mjs`.
const base = process.env.BASE_URL ?? "http://127.0.0.1:3101";

const sel = await fetch(`${base}/dev/session/select`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountSlot: "A" }) });
const cookie = sel.headers.get("set-cookie").split(";")[0];

const stateRes = await fetch(`${base}/account/state`, { headers: { cookie } });
const state = await stateRes.json();
const rev = state.revision;
console.log("starting revision", rev, "expedition status", state.data.expedition.status);

const reqId = crypto.randomUUID();
const settleBody = JSON.stringify({ requestId: reqId, expectedRevision: rev });

const [r1, r2] = await Promise.all([
  fetch(`${base}/expedition/settle`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: settleBody }),
  fetch(`${base}/expedition/settle`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: settleBody }),
]);
console.log("r1 status", r1.status, JSON.stringify(await r1.json()));
console.log("r2 status", r2.status, JSON.stringify(await r2.json()));

const finalRes = await fetch(`${base}/account/state`, { headers: { cookie } });
const final = await finalRes.json();
console.log("final gold", final.data.gold, "final revision", final.revision, "cyclesCompleted", final.data.expedition.cyclesCompleted);

// Now retry the SAME requestId a third time (stale retry after success) -- must not duplicate reward.
const r3 = await fetch(`${base}/expedition/settle`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: settleBody });
console.log("r3 (late retry same requestId) status", r3.status, JSON.stringify(await r3.json()));

const finalRes2 = await fetch(`${base}/account/state`, { headers: { cookie } });
const final2 = await finalRes2.json();
console.log("after late retry: gold", final2.data.gold, "revision", final2.revision);
