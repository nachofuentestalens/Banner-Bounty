import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildServer } from "./app.js";
import { openDatabase } from "./db/connection.js";
import { HeroRepository } from "./repositories/heroRepository.js";
import { SEED_ACCOUNT_A_ID, SEED_ACCOUNT_B_ID } from "./db/seed.js";
import { FixedClock } from "./clock.js";

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const header = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!header) throw new Error("no set-cookie header returned");
  return header.split(";")[0] ?? "";
}

async function selectSlot(app: ReturnType<typeof buildServer>, slot: "A" | "B") {
  const response = await app.inject({
    method: "POST",
    url: "/dev/session/select",
    payload: { accountSlot: slot },
  });
  expect(response.statusCode).toBe(200);
  return extractCookie(response.headers["set-cookie"]);
}

describe("GET /health", () => {
  it("returns the ok envelope from contracts.md", async () => {
    const app = buildServer();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      data: { status: "ok", schemaVersion: 1 },
    });
    await app.close();
  });
});

describe("local account sessions", () => {
  it("selects a seeded account and sets an HttpOnly SameSite=Strict cookie", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/dev/session/select",
      payload: { accountSlot: "A" },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.data.accountId).toBe(SEED_ACCOUNT_A_ID);
    const setCookie = Array.isArray(response.headers["set-cookie"])
      ? response.headers["set-cookie"][0]
      : response.headers["set-cookie"];
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    await app.close();
  });

  it("rejects an unknown account slot with validation", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/dev/session/select",
      payload: { accountSlot: "C" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("validation");
    await app.close();
  });

  it("two independent sessions see their own current account and cannot read without a cookie", async () => {
    const app = buildServer();
    const cookieA = await selectSlot(app, "A");
    const cookieB = await selectSlot(app, "B");

    const currentA = await app.inject({ method: "GET", url: "/dev/session/current", headers: { cookie: cookieA } });
    expect(currentA.json().data.accountId).toBe(SEED_ACCOUNT_A_ID);

    const currentB = await app.inject({ method: "GET", url: "/dev/session/current", headers: { cookie: cookieB } });
    expect(currentB.json().data.accountId).toBe(SEED_ACCOUNT_B_ID);

    const noCookie = await app.inject({ method: "GET", url: "/dev/session/current" });
    expect(noCookie.statusCode).toBe(401);
    expect(noCookie.json().error.code).toBe("unauthenticated");
    await app.close();
  });

  it("logout clears the session so the same cookie no longer authenticates", async () => {
    const app = buildServer();
    const cookieA = await selectSlot(app, "A");

    const logout = await app.inject({ method: "POST", url: "/dev/session/logout", headers: { cookie: cookieA } });
    expect(logout.statusCode).toBe(200);

    const afterLogout = await app.inject({ method: "GET", url: "/dev/session/current", headers: { cookie: cookieA } });
    expect(afterLogout.statusCode).toBe(401);
    await app.close();
  });
});

describe("ownership enforcement across accounts", () => {
  it("rejects a party/order request that references another account's hero as forbidden", async () => {
    const db = openDatabase(":memory:");
    const app = buildServer({ db, clock: new FixedClock(new Date("2026-01-01T00:00:00.000Z")) });
    const heroes = new HeroRepository(db);
    const heroA1 = crypto.randomUUID();
    const heroA2 = crypto.randomUUID();
    const heroA3 = crypto.randomUUID();
    const heroB1 = crypto.randomUUID();
    for (const [heroId, accountId] of [
      [heroA1, SEED_ACCOUNT_A_ID],
      [heroA2, SEED_ACCOUNT_A_ID],
      [heroA3, SEED_ACCOUNT_A_ID],
      [heroB1, SEED_ACCOUNT_B_ID],
    ] as const) {
      heroes.insertForFixture({
        heroId,
        accountId,
        classId: "vanguard",
        level: 1,
        xp: 0,
        specializationId: null,
        equipment: { weapon: null, armor: null, trinket: null },
      });
    }

    const cookieA = await selectSlot(app, "A");

    // Foreign hero ID (belongs to account B) is rejected without mutating anything.
    const foreign = await app.inject({
      method: "PATCH",
      url: "/party/order",
      headers: { cookie: cookieA },
      payload: { requestId: crypto.randomUUID(), expectedRevision: 0, order: [heroA1, heroA2, heroB1] },
    });
    expect(foreign.statusCode).toBe(403);
    expect(foreign.json().error.code).toBe("forbidden");

    // A request with all-owned heroes succeeds and does not require a session swap.
    const ok = await app.inject({
      method: "PATCH",
      url: "/party/order",
      headers: { cookie: cookieA },
      payload: { requestId: crypto.randomUUID(), expectedRevision: 0, order: [heroA1, heroA2, heroA3] },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().revision).toBe(1);

    await app.close();
  });

  it("account B's session cannot read or mutate account A's state via /account/state or /party/order", async () => {
    const db = openDatabase(":memory:");
    const app = buildServer({ db });
    const heroes = new HeroRepository(db);
    const heroA1 = crypto.randomUUID();
    heroes.insertForFixture({
      heroId: heroA1,
      accountId: SEED_ACCOUNT_A_ID,
      classId: "vanguard",
      level: 1,
      xp: 0,
      specializationId: null,
      equipment: { weapon: null, armor: null, trinket: null },
    });

    const cookieB = await selectSlot(app, "B");
    const state = await app.inject({ method: "GET", url: "/account/state", headers: { cookie: cookieB } });
    expect(state.json().data.heroes).toEqual([]); // B's own (empty) roster, never A's

    const mutate = await app.inject({
      method: "PATCH",
      url: "/party/order",
      headers: { cookie: cookieB },
      payload: { requestId: crypto.randomUUID(), expectedRevision: 0, order: [heroA1, heroA1, heroA1] },
    });
    // Duplicate IDs are also rejected by Zod validation before ownership runs.
    expect(mutate.statusCode).toBe(400);

    await app.close();
  });
});

describe("revision and idempotency protocol", () => {
  async function seededPartyOrderApp() {
    const db = openDatabase(":memory:");
    const app = buildServer({ db });
    const heroes = new HeroRepository(db);
    const heroIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()] as const;
    for (const heroId of heroIds) {
      heroes.insertForFixture({
        heroId,
        accountId: SEED_ACCOUNT_A_ID,
        classId: "vanguard",
        level: 1,
        xp: 0,
        specializationId: null,
        equipment: { weapon: null, armor: null, trinket: null },
      });
    }
    const cookieA = await selectSlot(app, "A");
    return { app, cookieA, heroIds: heroIds as [string, string, string] };
  }

  it("an identical retry (same requestId, same payload) returns the stored result without double-applying", async () => {
    const { app, cookieA, heroIds } = await seededPartyOrderApp();
    const requestId = crypto.randomUUID();
    const payload = { requestId, expectedRevision: 0, order: heroIds };

    const first = await app.inject({ method: "PATCH", url: "/party/order", headers: { cookie: cookieA }, payload });
    expect(first.statusCode).toBe(200);
    expect(first.json().revision).toBe(1);

    const retry = await app.inject({ method: "PATCH", url: "/party/order", headers: { cookie: cookieA }, payload });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(first.json());

    await app.close();
  });

  it("a reused requestId with a different payload is rejected with conflict and no mutation", async () => {
    const { app, cookieA, heroIds } = await seededPartyOrderApp();
    const requestId = crypto.randomUUID();
    const reordered = [heroIds[1], heroIds[0], heroIds[2]] as [string, string, string];

    const first = await app.inject({
      method: "PATCH",
      url: "/party/order",
      headers: { cookie: cookieA },
      payload: { requestId, expectedRevision: 0, order: heroIds },
    });
    expect(first.statusCode).toBe(200);

    const reused = await app.inject({
      method: "PATCH",
      url: "/party/order",
      headers: { cookie: cookieA },
      payload: { requestId, expectedRevision: 0, order: reordered },
    });
    expect(reused.statusCode).toBe(409);
    expect(reused.json().error.code).toBe("conflict");

    // State still reflects the first, successful application only.
    const state = await app.inject({ method: "GET", url: "/account/state", headers: { cookie: cookieA } });
    expect(state.json().data.partyOrder.order).toEqual(heroIds);

    await app.close();
  });

  it("a stale expectedRevision is rejected with conflict and current revision", async () => {
    const { app, cookieA, heroIds } = await seededPartyOrderApp();
    const first = await app.inject({
      method: "PATCH",
      url: "/party/order",
      headers: { cookie: cookieA },
      payload: { requestId: crypto.randomUUID(), expectedRevision: 0, order: heroIds },
    });
    expect(first.statusCode).toBe(200);

    const stale = await app.inject({
      method: "PATCH",
      url: "/party/order",
      headers: { cookie: cookieA },
      payload: {
        requestId: crypto.randomUUID(),
        expectedRevision: 0, // stale: current revision is now 1
        order: [heroIds[1], heroIds[0], heroIds[2]],
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("conflict");
    expect(stale.json().error.details?.currentRevision).toBe(1);

    await app.close();
  });

  it("two concurrent distinct requests at the same revision: only one commits, the other gets conflict", async () => {
    const { app, cookieA, heroIds } = await seededPartyOrderApp();
    const [a, b, c] = heroIds;
    const payload1 = { requestId: crypto.randomUUID(), expectedRevision: 0, order: [a, b, c] };
    const payload2 = { requestId: crypto.randomUUID(), expectedRevision: 0, order: [c, b, a] };

    // node:sqlite is single-writer; issuing both "simultaneously" still
    // serializes at the transaction level, which is exactly the guarantee
    // under test (architecture.md: "SQLite's single-writer transaction
    // serialization makes this check-then-set race-free").
    const [resp1, resp2] = await Promise.all([
      app.inject({ method: "PATCH", url: "/party/order", headers: { cookie: cookieA }, payload: payload1 }),
      app.inject({ method: "PATCH", url: "/party/order", headers: { cookie: cookieA }, payload: payload2 }),
    ]);

    const statuses = [resp1.statusCode, resp2.statusCode].sort();
    expect(statuses).toEqual([200, 409]);

    await app.close();
  });
});

describe("bounded payloads and consistent error contract", () => {
  it("rejects a request body over the 16KB limit", async () => {
    const app = buildServer();
    const oversized = "x".repeat(20 * 1024);
    const response = await app.inject({
      method: "POST",
      url: "/dev/session/select",
      payload: { accountSlot: "A", padding: oversized },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("validation");
    await app.close();
  });

  it("every error response includes code, message and correlationId", async () => {
    const app = buildServer();
    const response = await app.inject({ method: "GET", url: "/account/state" });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatchObject({ code: "unauthenticated" });
    expect(typeof body.error.message).toBe("string");
    expect(typeof body.error.correlationId).toBe("string");
    await app.close();
  });
});
