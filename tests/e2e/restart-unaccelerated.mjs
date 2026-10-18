// QA M1-15: unaccelerated (real wall-clock) restart/A01/A08/A13 evidence.
// Spawns the actual built `apps/server/dist/main.js` process (not an
// in-process buildServer() call) against a temporary isolated DB, so the
// port-collision message, SIGTERM shutdown and real elapsed-time catch-up
// are genuine, not simulated. Run `npm run build` first.
//
// This script waits on real time (~65s) by design — acceptance.md calls for
// at least one unaccelerated restart check distinct from the engineering
// walkthrough's injected clock. Keep this run infrequent (only when the
// server/expedition/settlement code changes), not part of a fast loop.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const mainJs = path.join(repoRoot, "apps", "server", "dist", "main.js");
assert.ok(fs.existsSync(mainJs), "apps/server/dist/main.js missing: run `npm run build` first");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bnb-qa-restart-"));
const dbPath = path.join(tmpDir, "save.sqlite");

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function spawnServer(port, extraEnv = {}) {
  const child = spawn(process.execPath, [mainJs], {
    cwd: repoRoot,
    env: { ...process.env, DB_PATH: dbPath, API_PORT: String(port), SERVE_WEB: "0", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d.toString()));
  child.stderr.on("data", (d) => (stderr += d.toString()));
  return { child, getStdout: () => stdout, getStderr: () => stderr };
}

async function waitForListening(port, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.status === 200) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

function isPortListening(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: "127.0.0.1", port, timeout: 500 });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => resolve(false));
  });
}

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

const port = await findFreePort();
let proc1;

await check("A01.1 fresh server starts and serves /health on a free port", async () => {
  proc1 = spawnServer(port);
  const up = await waitForListening(port);
  assert.ok(up, `server did not come up within timeout; stderr=${proc1.getStderr()}`);
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  const json = await res.json();
  assert.equal(json.data.status, "ok");
  return `listening on 127.0.0.1:${port}, schemaVersion ${json.data.schemaVersion}`;
});

await check("A01.2 port collision produces an actionable message and exits non-zero", async () => {
  const proc2 = spawnServer(port); // same port, still occupied by proc1
  const exitCode = await new Promise((resolve) => proc2.child.on("exit", resolve));
  assert.notEqual(exitCode, 0, "second process on the same port must exit non-zero");
  const combined = proc2.getStdout() + proc2.getStderr();
  assert.match(combined, /already in use/i, `expected an actionable port message, got: ${combined}`);
  assert.match(combined, new RegExp(String(port)), "message should name the occupied port");
  return `second process on port ${port} exited ${exitCode} with: ${combined.trim().split("\n").pop()}`;
});

let cookie;
async function selectA() {
  const res = await fetch(`http://127.0.0.1:${port}/dev/session/select`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountSlot: "A" }),
  });
  cookie = res.headers.get("set-cookie").split(";")[0];
}
async function call(method, p, body) {
  const headers = { "content-type": "application/json", cookie };
  const res = await fetch(`http://127.0.0.1:${port}${p}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}
const uuid = () => crypto.randomUUID();

let realStartedAt;
await check("A08.1 start an expedition under the real system clock", async () => {
  await selectA();
  const st = (await call("GET", "/account/state")).json.data;
  const res = await call("POST", "/expedition/start", { requestId: uuid(), expectedRevision: st.revision });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  realStartedAt = Date.now();
  return `expedition started at real time ${new Date(realStartedAt).toISOString()}`;
});

await check("A13/A08.2 real ~65s wall-clock wait, then server restart while expedition is active", async () => {
  await new Promise((r) => setTimeout(r, 65_000));
  proc1.child.kill("SIGTERM");
  const exitCode = await new Promise((resolve) => proc1.child.on("exit", resolve));
  const stillUp = await isPortListening(port);
  assert.equal(stillUp, false, "port must be free after shutdown (no stray child process)");
  if (process.platform === "win32" && exitCode !== 0) {
    // KNOWN LIMITATION, not a product defect: Node's child_process.kill("SIGTERM")
    // cannot deliver a real signal to a Windows process from another Node
    // process (Node docs: Windows "does not support sending signals"; the
    // child is unconditionally terminated instead), so the server's own
    // SIGTERM handler (main.ts) never runs here. M1-14 verified the real,
    // human Ctrl+C / Stop-Process path separately ("nothing left listening").
    // This run still proves the stronger claim: data survives an *abrupt*
    // kill (not just a graceful one) — see A08.3's successful restart below.
    return `port freed; exit code ${exitCode} (abrupt TerminateProcess on Windows, not a real SIGTERM — see note); data integrity across abrupt kill is checked by A08.3`;
  }
  assert.equal(exitCode, 0, `graceful SIGTERM shutdown must exit 0, got ${exitCode}`);
  return `waited ${((Date.now() - realStartedAt) / 1000).toFixed(1)}s real time, SIGTERM -> exit 0, port freed`;
});

await check("A08.3 restart on the same DB/port and collect real offline progress", async () => {
  proc1 = spawnServer(port);
  const up = await waitForListening(port);
  assert.ok(up, `restarted server did not come up; stderr=${proc1.getStderr()}`);
  await selectA();
  const st = (await call("GET", "/account/state")).json.data;
  assert.equal(st.expedition.status, "active", "expedition must still be active after restart (not lost)");
  const settleRes = await call("POST", "/expedition/settle", { requestId: uuid(), expectedRevision: st.revision });
  assert.equal(settleRes.status, 200, JSON.stringify(settleRes.json));
  const realElapsedS = (Date.now() - realStartedAt) / 1000;
  assert.ok(settleRes.json.data.creditedCycles >= 1, `expected >=1 credited cycle after >60s real downtime+uptime, got ${settleRes.json.data.creditedCycles}`);
  await call("POST", "/expedition/stop", { requestId: uuid(), expectedRevision: (await call("GET", "/account/state")).json.data.revision });
  return `restarted on same DB/port; real elapsed ${realElapsedS.toFixed(1)}s; creditedCycles=${settleRes.json.data.creditedCycles} (unaccelerated, real system clock)`;
});

if (proc1 && !proc1.child.killed) {
  proc1.child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 500));
}
fs.rmSync(tmpDir, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(` - ${f.name}: ${f.note.split("\n")[0]}`);
}
process.exitCode = failed.length ? 1 : 0;
