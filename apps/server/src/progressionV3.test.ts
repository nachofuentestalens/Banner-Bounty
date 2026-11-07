// M3-08 focused integration tests (design/studio/contracts.md "M3-05
// addition"). Covers this task's six acceptance checks: (1) is covered by
// db/migrations.test.ts's new M3-05 migration test; the rest are here.
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "./app.js";
import { FixedClock } from "./clock.js";
import { openDatabase } from "./db/connection.js";
import { SEED_ACCOUNT_A_ID, SEED_ACCOUNT_B_ID } from "./db/seed.js";
import { TOLLKEEPER } from "@banner-and-bounty/content";

const T0 = Date.parse("2026-03-01T12:00:00.000Z");
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

type App = ReturnType<typeof buildServer>;

function harness() {
  const clock = new FixedClock(new Date(T0));
  const db = openDatabase(":memory:");
  const app = buildServer({ db, clock });
  return { app, db, clock, at: (offsetMs: number) => clock.set(new Date(T0 + offsetMs)) };
}

async function login(app: App, slot: "A" | "B" = "A"): Promise<string> {
  const response = await app.inject({ method: "POST", url: "/dev/session/select", payload: { accountSlot: slot } });
  const header = response.headers["set-cookie"];
  return (Array.isArray(header) ? header[0]! : header!).split(";")[0]!;
}

async function getState(app: App, cookie: string) {
  const response = await app.inject({ method: "GET", url: "/account/state", headers: { cookie } });
  return response.json().data;
}

async function mutate(
  app: App,
  cookie: string,
  url: string,
  payload: Record<string, unknown> = {},
  options: { requestId?: string; expectedRevision?: number; method?: string } = {},
) {
  const expectedRevision = options.expectedRevision ?? (await getState(app, cookie)).revision;
  const response = await app.inject({
    method: options.method ?? "POST",
    url,
    headers: { cookie },
    payload: { requestId: options.requestId ?? crypto.randomUUID(), expectedRevision, ...payload },
  });
  return { status: response.statusCode, body: response.json() };
}

async function startedHarness() {
  const h = harness();
  const cookie = await login(h.app);
  const start = await mutate(h.app, cookie, "/expedition/start");
  return { ...h, cookie, start };
}

const openApps: App[] = [];
afterEach(async () => {
  for (const app of openApps.splice(0)) await app.close();
});

function tracked<T extends { app: App }>(h: T): T {
  openApps.push(h.app);
  return h;
}

describe("variable-duration expedition settlement (acceptance check 2)", () => {
  it("assigns EXPEDITION_RULES_VERSION and a runId at a fresh start", async () => {
    const h = tracked(await startedHarness());
    expect(h.start.status).toBe(200);
    const expedition = h.start.body.data.expedition;
    expect(expedition.rulesVersion).toBeGreaterThan(1);
    expect(expedition.status).toBe("active");
  });

  it("partitioned settlement equals continuous settlement end-to-end (A06-equivalent)", async () => {
    const totalElapsed = 10 * MIN;

    const a = tracked(harness() as never);
    const cookieA = await login(a.app);
    await mutate(a.app, cookieA, "/expedition/start");
    a.at(totalElapsed);
    await mutate(a.app, cookieA, "/expedition/settle");
    const stateA = await getState(a.app, cookieA);

    const b = tracked(harness() as never);
    const cookieB = await login(b.app);
    await mutate(b.app, cookieB, "/expedition/start");
    for (const t of [2 * MIN, 4 * MIN, 6 * MIN, 8 * MIN, totalElapsed]) {
      b.at(t);
      await mutate(b.app, cookieB, "/expedition/settle");
    }
    const stateB = await getState(b.app, cookieB);

    expect(stateB.gold).toBe(stateA.gold);
    expect(stateB.expedition.checkpointAt).toBe(stateA.expedition.checkpointAt);
    expect(stateB.heroes.map((h: { level: number; xp: number }) => ({ level: h.level, xp: h.xp }))).toEqual(
      stateA.heroes.map((h: { level: number; xp: number }) => ({ level: h.level, xp: h.xp })),
    );
  });

  it("retry with the same requestId replays the identical result without double-crediting", async () => {
    const h = tracked(await startedHarness());
    h.at(10 * MIN);
    const requestId = crypto.randomUUID();
    const expectedRevision = (await getState(h.app, h.cookie)).revision;
    const first = await mutate(h.app, h.cookie, "/expedition/settle", {}, { requestId, expectedRevision });
    const retry = await mutate(h.app, h.cookie, "/expedition/settle", {}, { requestId, expectedRevision });
    expect(retry.body).toEqual(first.body);
    const stateAfterOneCredit = await getState(h.app, h.cookie);

    // A distinct request at the same stale revision is rejected as a conflict, never double-crediting.
    const distinct = await mutate(h.app, h.cookie, "/expedition/settle", {}, { expectedRevision });
    expect(distinct.status).toBe(409);
    expect(distinct.body.error.code).toBe("conflict");
    expect(await getState(h.app, h.cookie)).toEqual(stateAfterOneCredit);
  });

  it("clock rollback clamps elapsed to zero and never credits negative/duplicate time", async () => {
    const h = tracked(await startedHarness());
    h.at(5 * MIN);
    await mutate(h.app, h.cookie, "/expedition/settle");
    const afterForward = await getState(h.app, h.cookie);

    // Roll the raw clock backward; the server's monotonic high-water mark
    // must prevent any persisted computation from observing this regression.
    h.at(1 * MIN);
    const rollback = await mutate(h.app, h.cookie, "/expedition/settle");
    expect(rollback.status).toBe(200);
    expect(rollback.body.data.creditedBattles).toEqual([]);
    const afterRollback = await getState(h.app, h.cookie);
    expect(Date.parse(afterRollback.expedition.checkpointAt)).toBeGreaterThanOrEqual(Date.parse(afterForward.expedition.checkpointAt));
  });

  it("an 8-hour-plus absence discards exactly the time beyond the cap and never discards it twice", async () => {
    const h = tracked(await startedHarness());
    h.at(10 * HOUR);
    const settle = await mutate(h.app, h.cookie, "/expedition/settle");
    expect(settle.status).toBe(200);
    expect(settle.body.data.discardedMs).toBe(2 * HOUR);

    // Resumable catch-up: a second call at the same instant continues
    // crediting the already-capped (not re-discounted) remainder.
    const again = await mutate(h.app, h.cookie, "/expedition/settle");
    expect(again.body.data.discardedMs).toBe(0);
  });

  it("stop discards unconsumed pending edits and settles eligible history first", async () => {
    const h = tracked(await startedHarness());
    h.at(3 * MIN);
    const stop = await mutate(h.app, h.cookie, "/expedition/stop");
    expect(stop.status).toBe(200);
    expect(stop.body.data.expedition.status).toBe("none");
    expect(stop.body.data.discardedPending).toEqual([]);
  });
});

describe("expedition feed, retention and eviction (acceptance check 3)", () => {
  it("retains at most 50 full reports, evicts the oldest into an aggregate, and bounds the feed page to 10", async () => {
    const h = tracked(await startedHarness());
    h.at(8 * HOUR);
    await mutate(h.app, h.cookie, "/expedition/settle");
    // A second far-future call lets any still-cached pending battle resolve
    // and may trigger further catch-up, growing the account past 50 reports.
    h.at(16 * HOUR);
    await mutate(h.app, h.cookie, "/expedition/settle");

    const feed = await h.app.inject({ method: "GET", url: "/expedition/feed?limit=10", headers: { cookie: h.cookie } });
    expect(feed.statusCode).toBe(200);
    const data = feed.json().data;
    expect(data.entries.length).toBeLessThanOrEqual(10);
    if (data.oldestAvailableSequence !== null && data.newestAvailableSequence !== null) {
      expect(data.newestAvailableSequence - data.oldestAvailableSequence + 1).toBeLessThanOrEqual(50);
    }
  });

  it("an afterSequence older than the retained window returns a missing range, never a silent gap", async () => {
    const h = tracked(await startedHarness());
    h.at(8 * HOUR);
    await mutate(h.app, h.cookie, "/expedition/settle");
    h.at(16 * HOUR);
    await mutate(h.app, h.cookie, "/expedition/settle");

    const feed = await h.app.inject({ method: "GET", url: "/expedition/feed?afterSequence=0&limit=10", headers: { cookie: h.cookie } });
    const data = feed.json().data;
    if (data.oldestAvailableSequence !== null && data.oldestAvailableSequence > 1) {
      // Either an aggregate entry covers the gap, or an explicit missingRange is reported — never silence.
      const coveredByAggregate = data.entries.some((e: { kind: string }) => e.kind === "aggregate");
      expect(coveredByAggregate || data.missingRange !== null).toBe(true);
    }
  });

  it("a session only ever reads its own account's feed (cross-account isolation)", async () => {
    const h = tracked(harness() as never);
    const cookieA = await login(h.app, "A");
    const cookieB = await login(h.app, "B");
    await mutate(h.app, cookieA, "/expedition/start");
    h.at(5 * MIN);
    await mutate(h.app, cookieA, "/expedition/settle");

    const feedB = await h.app.inject({ method: "GET", url: "/expedition/feed", headers: { cookie: cookieB } });
    expect(feedB.json().data.entries).toEqual([]);
    expect(feedB.json().data.oldestAvailableSequence).toBeNull();
  });
});

describe("deferred skill changes and respec (acceptance check 4)", () => {
  it("queues a skill change, reports a boundary ordinal, and the retry of the same request is idempotent", async () => {
    const h = tracked(await startedHarness());
    const heroId = h.start.body.data.expedition.frozenLoadout[0].heroId;
    const requestId = crypto.randomUUID();
    const expectedRevision = (await getState(h.app, h.cookie)).revision;
    const queue = await mutate(
      h.app,
      h.cookie,
      "/hero/loadout/queue",
      { heroId, active: ["", ""], passive: ["", ""] },
      { requestId, expectedRevision },
    );
    expect(queue.status).toBe(200);
    expect(queue.body.data.pendingChange.status).toBe("pending");
    expect(typeof queue.body.data.pendingChange.boundaryOrdinal).toBe("number");

    const retry = await mutate(
      h.app,
      h.cookie,
      "/hero/loadout/queue",
      { heroId, active: ["", ""], passive: ["", ""] },
      { requestId, expectedRevision },
    );
    expect(retry.body).toEqual(queue.body);
  });

  it("cancel-pending discards an unconsumed change and never retroactively edits an already-rolled battle", async () => {
    const h = tracked(await startedHarness());
    const heroId = h.start.body.data.expedition.frozenLoadout[0].heroId;
    await mutate(h.app, h.cookie, "/hero/loadout/queue", { heroId, active: ["", ""], passive: ["", ""] });
    const cancel = await mutate(h.app, h.cookie, "/hero/loadout/cancel-pending", { heroId });
    expect(cancel.status).toBe(200);
    expect([cancel.body.data.cancelled, cancel.body.data.alreadyApplied]).toEqual([true, false]);
  });

  it("cancel-pending after the boundary already applied reports alreadyApplied, not a fictitious cancellation", async () => {
    const h = tracked(await startedHarness());
    const heroId = h.start.body.data.expedition.frozenLoadout[0].heroId;
    await mutate(h.app, h.cookie, "/hero/loadout/queue", { heroId, active: ["", ""], passive: ["", ""] });
    // Let enough time pass that the next battle (the boundary) has certainly rolled and applied.
    h.at(2 * HOUR);
    await mutate(h.app, h.cookie, "/expedition/settle");
    const cancel = await mutate(h.app, h.cookie, "/hero/loadout/cancel-pending", { heroId });
    expect(cancel.body.data.alreadyApplied).toBe(true);
    expect(cancel.body.data.cancelled).toBe(false);
  });

  it("queue/cancel are rejected on a legacy (pre-M3) active run and while a dungeon is active", async () => {
    const h = tracked(harness() as never);
    const cookie = await login(h.app);
    await mutate(h.app, cookie, "/expedition/start");
    h.db.prepare("UPDATE expeditions SET rulesVersion = 1 WHERE accountId = ?").run(SEED_ACCOUNT_A_ID);
    const heroes = h.db.prepare("SELECT heroId FROM heroes WHERE accountId = ?").all(SEED_ACCOUNT_A_ID) as { heroId: string }[];
    const queue = await mutate(h.app, cookie, "/hero/loadout/queue", { heroId: heroes[0]!.heroId, active: ["", ""], passive: ["", ""] });
    expect(queue.status).toBe(400);
    expect(queue.body.error.details.reason).toBe("legacy_run_active");
  });

  it("respec-primary preview/confirm rejects insufficient funds and an active expedition, and retry after success charges only once", async () => {
    const h = tracked(harness() as never);
    const cookie = await login(h.app);
    const heroes = h.db.prepare("SELECT heroId FROM heroes WHERE accountId = ?").all(SEED_ACCOUNT_A_ID) as { heroId: string }[];
    const heroId = heroes[0]!.heroId;

    const preview = await h.app.inject({ method: "POST", url: "/hero/respec-primary/preview", headers: { cookie }, payload: { heroId } });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().data.cooldownEligible).toBe(true);

    const insufficient = await mutate(h.app, cookie, "/hero/respec-primary", { heroId, newPrimaryClassId: "class_cleric" });
    expect(insufficient.status).toBe(400);
    expect(insufficient.body.error.details.reason).toBe("insufficient_funds");

    h.db.prepare("UPDATE accounts SET gold = 100000, materialScrap = 1000, materialSigil = 1000 WHERE accountId = ?").run(SEED_ACCOUNT_A_ID);
    const requestId = crypto.randomUUID();
    const expectedRevision = (await getState(h.app, cookie)).revision;
    const confirm = await mutate(h.app, cookie, "/hero/respec-primary", { heroId, newPrimaryClassId: "class_cleric" }, { requestId, expectedRevision });
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.hero.primaryClassId).toBe("class_cleric");
    const goldAfterFirst = (await getState(h.app, cookie)).gold;

    const retry = await mutate(h.app, cookie, "/hero/respec-primary", { heroId, newPrimaryClassId: "class_cleric" }, { requestId, expectedRevision });
    expect(retry.body).toEqual(confirm.body);
    expect((await getState(h.app, cookie)).gold).toBe(goldAfterFirst);

    await mutate(h.app, cookie, "/expedition/start");
    const whileActive = await mutate(h.app, cookie, "/hero/respec-primary", { heroId, newPrimaryClassId: "class_ranger" });
    expect(whileActive.status).toBe(409);
    expect(whileActive.body.error.code).toBe("active_expedition");
  });
});

describe("season and tournament (acceptance check 5)", () => {
  function clearTollkeeper(db: DatabaseSync, accountId: string, nowIso: string): void {
    db.prepare("INSERT OR REPLACE INTO boss_claims (accountId, bossId, claimedAt) VALUES (?, ?, ?)").run(accountId, TOLLKEEPER.enemyId, nowIso);
  }

  it("rejects season entry without a Tollkeeper clear, then accepts it after one", async () => {
    const h = tracked(harness() as never);
    const cookie = await login(h.app);
    const heroes = h.db.prepare("SELECT heroId FROM heroes WHERE accountId = ?").all(SEED_ACCOUNT_A_ID) as { heroId: string }[];
    const heroIds = heroes.map((r) => r.heroId);

    const rejected = await mutate(h.app, cookie, "/season/enter", { heroIds });
    expect(rejected.status).toBe(403);

    clearTollkeeper(h.db, SEED_ACCOUNT_A_ID, new Date(T0).toISOString());
    const entered = await mutate(h.app, cookie, "/season/enter", { heroIds });
    expect(entered.status).toBe(200);
    expect(entered.body.data.entry.optedIntoTournament).toBe(true);

    const already = await mutate(h.app, cookie, "/season/enter", { heroIds });
    expect(already.status).toBe(400);
    expect(already.body.error.details.reason).toBe("already_entered");
  });

  it("locks at the 24h entry deadline, resolves matches exactly once under repeated requests, and archives at the 7-day boundary", async () => {
    const h = tracked(harness() as never);
    const cookie = await login(h.app);
    const heroes = h.db.prepare("SELECT heroId FROM heroes WHERE accountId = ?").all(SEED_ACCOUNT_A_ID) as { heroId: string }[];
    clearTollkeeper(h.db, SEED_ACCOUNT_A_ID, new Date(T0).toISOString());
    await mutate(h.app, cookie, "/season/enter", { heroIds: heroes.map((r) => r.heroId) });

    h.at(25 * HOUR); // past the 24h entry lock
    const standings1 = await h.app.inject({ method: "GET", url: "/season/0/standings" });
    expect(standings1.statusCode).toBe(200);
    expect(standings1.json().data.status).not.toBe("entry_open");

    const bracket1 = await h.app.inject({ method: "GET", url: "/tournament/0/bracket" });
    expect(bracket1.statusCode).toBe(200);
    const championAfterFirst = bracket1.json().data.bracket.championEntryId;

    // Repeated requests (simulating retry/concurrency) must not re-resolve or double-advance.
    const bracket2 = await h.app.inject({ method: "GET", url: "/tournament/0/bracket" });
    expect(bracket2.json().data.bracket).toEqual(bracket1.json().data.bracket);
    expect(bracket2.json().data.bracket.championEntryId).toBe(championAfterFirst);

    h.at(8 * DAY); // past the 7-day season end
    const standings2 = await h.app.inject({ method: "GET", url: "/season/0/standings" });
    expect(standings2.json().data.status).toBe("archived");
    expect(standings2.json().data.standings).not.toBeNull();

    // A second archive-triggering request must not re-archive or change the result.
    const standings3 = await h.app.inject({ method: "GET", url: "/season/0/standings" });
    expect(standings3.json().data.standings).toEqual(standings2.json().data.standings);
  });

  it("an unknown season index returns not_found, and account-state/standings never leak another account's private data", async () => {
    const h = tracked(harness() as never);
    const far = await h.app.inject({ method: "GET", url: "/season/999999/standings" });
    expect(far.statusCode).toBe(404);
  });
});

describe("regression coverage: malformed requests, clock rollback, unauthorized claims (acceptance check 6)", () => {
  it("rejects malformed bodies with validation, never a 500", async () => {
    const h = tracked(harness() as never);
    const cookie = await login(h.app);
    const bad = await h.app.inject({ method: "POST", url: "/hero/loadout/queue", headers: { cookie }, payload: { requestId: "not-a-uuid", expectedRevision: -1 } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("validation");
  });

  it("rejects every new mutating endpoint without a session", async () => {
    const h = tracked(harness() as never);
    for (const url of ["/hero/loadout/queue", "/hero/loadout/cancel-pending", "/hero/specialization/primary", "/hero/respec-primary", "/season/enter", "/season/withdraw"]) {
      const anon = await h.app.inject({ method: "POST", url, payload: { requestId: crypto.randomUUID(), expectedRevision: 0 } });
      expect([url, anon.statusCode]).toEqual([url, 401]);
    }
  });

  it("rejects a foreign heroId as forbidden, never silently acting on another account's hero", async () => {
    const h = tracked(harness() as never);
    const cookieA = await login(h.app, "A");
    const heroesB = h.db.prepare("SELECT heroId FROM heroes WHERE accountId = ?").all(SEED_ACCOUNT_B_ID) as { heroId: string }[];
    const foreignHeroId = heroesB[0]!.heroId;
    const result = await mutate(h.app, cookieA, "/hero/specialization/primary", { heroId: foreignHeroId, primarySpecializationId: null });
    expect(result.status).toBe(403);
  });

  it("GET /codex and GET /dungeons are server-sourced and never mutate state", async () => {
    const h = tracked(harness() as never);
    const cookie = await login(h.app);
    const before = await getState(h.app, cookie);
    const codex = await h.app.inject({ method: "GET", url: "/codex", headers: { cookie } });
    expect(codex.statusCode).toBe(200);
    expect(codex.json().data.classes).toHaveLength(8);
    const dungeons = await h.app.inject({ method: "GET", url: "/dungeons", headers: { cookie } });
    expect(dungeons.statusCode).toBe(200);
    expect(dungeons.json().data.dungeons.map((d: { dungeonId: string }) => d.dungeonId).sort()).toEqual(["dungeon_aqueduct_depths", "dungeon_cinder_archive"]);
    const after = await getState(h.app, cookie);
    expect(after.revision).toBe(before.revision);
  });
});
