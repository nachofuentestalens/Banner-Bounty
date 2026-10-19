// M2-07: independently exercise malformed/oversized request payloads
// against the Zod validation boundary (design/qa/acceptance.md "invalid
// request payload"; design/studio/contracts.md "Bounded inputs: strings
// <= 256 chars unless noted, arrays <= 64 elements, request bodies <= 16
// KB. Zod schemas enforce this at the HTTP boundary; violations return
// `validation`." and "Every response envelope is ... `{ ok: false, error:
// ErrorDTO }`" / `ErrorDTO = { code, message, correlationId, details? }`).
// New script — does not modify or duplicate tests/e2e/api-attacks.mjs.
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

function assertErrorDTO(json, expectedCode) {
  assert.equal(json.ok, false, "error responses must have ok:false");
  assert.ok(json.error, "error responses must include an `error` object");
  assert.equal(json.error.code, expectedCode, `expected error.code=${expectedCode}, got ${json.error.code}`);
  assert.equal(typeof json.error.message, "string", "error.message must be a string");
  assert.ok(json.error.message.length > 0, "error.message must not be empty");
  assert.equal(typeof json.error.correlationId, "string", "error.correlationId must be a string");
  assert.ok(json.error.correlationId.length > 0, "error.correlationId must not be empty");
}

const { clock } = makeManualClock("2026-10-19T09:00:00.000Z");
const server = await startTestServer({ clock });
const { baseUrl } = server;
console.log(`server up at ${baseUrl}`);

const A = makeClient(baseUrl);
const selectRes = await A.post("/dev/session/select", { accountSlot: "A" });
assert.equal(selectRes.status, 200);

// A second, raw fetch client sharing the same session, for checks that need
// to send a body makeClient's JSON.stringify would otherwise normalize away
// (invalid JSON syntax, a top-level array instead of an object).
const rawSelect = await fetch(`${baseUrl}/dev/session/select`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ accountSlot: "A" }),
});
assert.equal(rawSelect.status, 200);
const sessionCookie = rawSelect.headers.get("set-cookie")?.split(";")[0];
assert.ok(sessionCookie, "expected a session cookie from /dev/session/select");

await check("oversized body (>16KB) is rejected with 400 validation on a mutating endpoint", async () => {
  const st = await (await A.get("/account/state")).json.data;
  const padding = "x".repeat(20 * 1024);
  const res = await A.post("/expedition/start", { requestId: uuid(), expectedRevision: st.revision, padding });
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assertErrorDTO(res.json, "validation");
  return `20KB body on /expedition/start -> 400 validation, correlationId=${res.json.error.correlationId}`;
});

await check("oversized body (>16KB) is rejected even on a pre-auth endpoint (/dev/session/select)", async () => {
  const B = makeClient(baseUrl);
  const padding = "x".repeat(20 * 1024);
  const res = await B.post("/dev/session/select", { accountSlot: "A", padding });
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assertErrorDTO(res.json, "validation");
  return `20KB body on /dev/session/select -> 400 validation`;
});

await check("over-length string (>256 chars) in a bounded field is rejected with validation", async () => {
  const st = await (await A.get("/account/state")).json.data;
  const longHeroId = "h".repeat(300);
  const res = await A.patch("/party/order", {
    requestId: uuid(),
    expectedRevision: st.revision,
    order: [longHeroId, st.heroes[1].heroId, st.heroes[2].heroId],
  });
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assertErrorDTO(res.json, "validation");
  return `300-char hero ID in /party/order -> 400 validation`;
});

await check("wrong-arity tuple (4 elements instead of 3) in party order is rejected with validation", async () => {
  const st = await (await A.get("/account/state")).json.data;
  const res = await A.patch("/party/order", {
    requestId: uuid(),
    expectedRevision: st.revision,
    order: [st.heroes[0].heroId, st.heroes[1].heroId, st.heroes[2].heroId, st.heroes[0].heroId],
  });
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assertErrorDTO(res.json, "validation");
  return `4-element order tuple -> 400 validation`;
});

await check("missing requestId is rejected with validation, not a 500/crash", async () => {
  const st = await (await A.get("/account/state")).json.data;
  const res = await A.post("/expedition/settle", { expectedRevision: st.revision });
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assertErrorDTO(res.json, "validation");
  return `/expedition/settle with no requestId -> 400 validation`;
});

await check("non-UUID requestId is rejected with validation", async () => {
  const st = await (await A.get("/account/state")).json.data;
  const res = await A.post("/expedition/settle", { requestId: "not-a-uuid", expectedRevision: st.revision });
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assertErrorDTO(res.json, "validation");
  return `requestId="not-a-uuid" -> 400 validation`;
});

await check("negative expectedRevision is rejected with validation", async () => {
  const res = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: -1 });
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assertErrorDTO(res.json, "validation");
  return `expectedRevision=-1 -> 400 validation`;
});

await check("non-integer (float) expectedRevision is rejected with validation", async () => {
  const res = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: 1.5 });
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assertErrorDTO(res.json, "validation");
  return `expectedRevision=1.5 -> 400 validation`;
});

await check("wrong-type field (expectedRevision as a string) is rejected with validation", async () => {
  const res = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: "3" });
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assertErrorDTO(res.json, "validation");
  return `expectedRevision="3" (string) -> 400 validation`;
});

await check("completely empty body on a mutating endpoint is rejected with validation, not 500", async () => {
  const res = await A.post("/expedition/settle", {});
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assertErrorDTO(res.json, "validation");
  return `empty body {} on /expedition/settle -> 400 validation`;
});

await check("malformed JSON body (invalid syntax) is reported as validation/400, not internal/500 [DEFECT if it fails]", async () => {
  const res = await fetch(`${baseUrl}/expedition/settle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: sessionCookie },
    body: "{not valid json",
  });
  const json = await res.json().catch(() => null);
  // Server must still be alive and serving normal requests afterward
  // regardless of this check's own verdict.
  const healthRes = await A.get("/account/state");
  assert.equal(healthRes.status, 200, "server must still respond normally after a malformed-JSON request");
  assert.equal(res.status, 400, `contracts.md: "Zod schemas enforce this at the HTTP boundary; violations return validation" — expected 400, got ${res.status} (body: ${JSON.stringify(json)})`);
  assertErrorDTO(json, "validation");
  return `malformed JSON -> ${res.status} ${json?.error?.code}; server still healthy afterward`;
});

await check("unknown extra field in an otherwise-valid body does not break the request", async () => {
  const st = await (await A.get("/account/state")).json.data;
  const res = await A.post("/expedition/settle", { requestId: uuid(), expectedRevision: st.revision, unexpectedExtraField: "qa-probe" });
  // Either strict-rejects (validation) or ignores unknown fields (200) — both
  // are acceptable contract behaviors; what must NOT happen is a 500/crash.
  assert.ok([200, 400].includes(res.status), `expected 200 or 400 for an unknown extra field, got ${res.status}: ${JSON.stringify(res.json)}`);
  if (res.status === 400) assertErrorDTO(res.json, "validation");
  return `unexpected extra field -> ${res.status} (no 500/crash either way)`;
});

await check("array-shaped body where an object is expected is rejected with validation, not 500", async () => {
  const res = await fetch(`${baseUrl}/expedition/settle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: sessionCookie },
    body: JSON.stringify([1, 2, 3]),
  });
  assert.equal(res.status, 400, `expected 400 for an array body, got ${res.status}`);
  const json = await res.json();
  assertErrorDTO(json, "validation");
  return `array body [1,2,3] on /expedition/settle -> 400 validation`;
});

await check("server stays healthy after the full malformed-payload battery (no crash, no stuck state)", async () => {
  const res = await A.get("/account/state");
  assert.equal(res.status, 200, "server must still serve valid requests after this battery of malformed payloads");
  return `final health check: /account/state -> 200`;
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED/INCONCLUSIVE:");
  for (const f of failed) console.log(` - ${f.name}: ${f.note.split("\n")[0]}`);
}
await server.close();
process.exitCode = failed.length ? 1 : 0;
