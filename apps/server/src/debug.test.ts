import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildServer } from "./app.js";
import { SEED_ACCOUNT_A_ID, starterHeroIds } from "./db/seed.js";

async function selectSlotA(app: ReturnType<typeof buildServer>): Promise<string> {
  const response = await app.inject({ method: "POST", url: "/dev/session/select", payload: { accountSlot: "A" } });
  const header = response.headers["set-cookie"];
  const cookie = Array.isArray(header) ? header[0] : header;
  if (!cookie) throw new Error("no set-cookie header returned");
  return cookie.split(";")[0] ?? "";
}

describe("GET /debug/enabled", () => {
  it("reports disabled by default", async () => {
    const app = buildServer();
    const response = await app.inject({ method: "GET", url: "/debug/enabled" });
    expect(response.json().data).toEqual({ enabled: false });
    await app.close();
  });

  it("reports enabled when the server opts in", async () => {
    const app = buildServer({ debugToolsEnabled: true });
    const response = await app.inject({ method: "GET", url: "/debug/enabled" });
    expect(response.json().data).toEqual({ enabled: true });
    await app.close();
  });
});

describe("debug menu routes when disabled (default)", () => {
  it("are not registered at all (404), so the menu never reaches normal play", async () => {
    const app = buildServer();
    const cookie = await selectSlotA(app);
    const response = await app.inject({
      method: "POST",
      url: "/debug/gold",
      headers: { cookie },
      payload: { requestId: crypto.randomUUID(), expectedRevision: 0, gold: 500 },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe("debug menu routes when enabled", () => {
  async function appWithSession() {
    const app = buildServer({ debugToolsEnabled: true });
    const cookie = await selectSlotA(app);
    return { app, cookie };
  }

  it("sets a hero's level directly through the normal mutation/revision path", async () => {
    const { app, cookie } = await appWithSession();
    const [heroId] = starterHeroIds(SEED_ACCOUNT_A_ID);

    const response = await app.inject({
      method: "POST",
      url: "/debug/hero/level",
      headers: { cookie },
      payload: { requestId: crypto.randomUUID(), expectedRevision: 0, heroId, level: 7 },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.hero.level).toBe(7);
    expect(body.data.hero.xp).toBe(0);
    expect(body.revision).toBe(1);
    await app.close();
  });

  it("rejects a level outside 1-10 as validation", async () => {
    const { app, cookie } = await appWithSession();
    const [heroId] = starterHeroIds(SEED_ACCOUNT_A_ID);

    const response = await app.inject({
      method: "POST",
      url: "/debug/hero/level",
      headers: { cookie },
      payload: { requestId: crypto.randomUUID(), expectedRevision: 0, heroId, level: 11 },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("validation");
    await app.close();
  });

  it("grants XP through the production xp curve, leveling up when it crosses a threshold", async () => {
    const { app, cookie } = await appWithSession();
    const [heroId] = starterHeroIds(SEED_ACCOUNT_A_ID);

    // xpToNext(1) === 15 (packages/game/src/xp.ts), so granting 20 crosses one level.
    const response = await app.inject({
      method: "POST",
      url: "/debug/hero/xp",
      headers: { cookie },
      payload: { requestId: crypto.randomUUID(), expectedRevision: 0, heroId, xp: 20 },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.hero.level).toBe(2);
    expect(body.data.hero.xp).toBe(5);
    await app.close();
  });

  it("grants gold through the account's authoritative balance", async () => {
    const { app, cookie } = await appWithSession();

    const response = await app.inject({
      method: "POST",
      url: "/debug/gold",
      headers: { cookie },
      payload: { requestId: crypto.randomUUID(), expectedRevision: 0, gold: 500 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.gold).toBeGreaterThanOrEqual(500);
    await app.close();
  });

  it("rejects a heroId belonging to another account as forbidden", async () => {
    const { app, cookie } = await appWithSession();
    const [, , otherHeroId] = starterHeroIds("00000000-0000-4000-8000-00000000000b");

    const response = await app.inject({
      method: "POST",
      url: "/debug/hero/xp",
      headers: { cookie },
      payload: { requestId: crypto.randomUUID(), expectedRevision: 0, heroId: otherHeroId, xp: 10 },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("forbidden");
    await app.close();
  });

  it("replays an identical requestId instead of double-granting gold", async () => {
    const { app, cookie } = await appWithSession();
    const requestId = crypto.randomUUID();
    const payload = { requestId, expectedRevision: 0, gold: 500 };

    const first = await app.inject({ method: "POST", url: "/debug/gold", headers: { cookie }, payload });
    const second = await app.inject({ method: "POST", url: "/debug/gold", headers: { cookie }, payload });

    expect(first.json().data.gold).toBe(second.json().data.gold);
    expect(second.json().revision).toBe(first.json().revision);
    await app.close();
  });
});
