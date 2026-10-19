// Shared helper to boot the built server against a temporary, isolated
// SQLite database for QA's e2e/API scripts. Never touches the real save
// (design/qa/acceptance.md: "injected clocks, fixed seeds, temporary
// isolated databases").
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

export async function startTestServer({ clock } = {}) {
  const { buildServer } = await import(new URL("../../../apps/server/dist/app.js", import.meta.url).href);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bnb-qa-"));
  const dbPath = path.join(tmpDir, "save.sqlite");
  const app = buildServer({ dbPath, clock });
  const baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
  return {
    app,
    baseUrl,
    dbPath,
    async close() {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

export function makeManualClock(startIso) {
  let nowMs = Date.parse(startIso);
  return {
    clock: { now: () => new Date(nowMs) },
    advanceMs: (ms) => {
      nowMs += ms;
    },
    nowMs: () => nowMs,
  };
}

export { repoRoot };

// Minimal cookie-jar fetch client: one jar = one session, mirroring one
// browser context/profile (design/studio/contracts.md session model).
export function makeClient(baseUrl) {
  let cookie;
  async function raw(method, pathname, body) {
    const headers = { "content-type": "application/json" };
    if (cookie) headers.cookie = cookie;
    const res = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    let json;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  }
  return {
    get: (p) => raw("GET", p),
    post: (p, body) => raw("POST", p, body),
    patch: (p, body) => raw("PATCH", p, body),
    clearCookie: () => {
      cookie = undefined;
    },
  };
}

export function uuid() {
  return crypto.randomUUID();
}
