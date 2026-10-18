import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "./app.js";
import { FixedClock } from "./clock.js";
import { openDatabase } from "./db/connection.js";
import { SEED_ACCOUNT_A_ID, SEED_ACCOUNT_B_ID, starterHeroIds } from "./db/seed.js";
import { ItemRepository } from "./repositories/itemRepository.js";

// M1-08 acceptance fixtures: injected FixedClock, isolated in-memory or
// temp-file databases, real HTTP routes via app.inject.

const T0 = Date.parse("2026-03-01T12:00:00.000Z");
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const [VANGUARD, RANGER, ARCANIST] = starterHeroIds(SEED_ACCOUNT_A_ID);

type App = ReturnType<typeof buildServer>;

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bb-m108-"));
  tempDirs.push(dir);
  return path.join(dir, "save.sqlite");
}

function harness(options: { db?: DatabaseSync; clock?: FixedClock } = {}) {
  const clock = options.clock ?? new FixedClock(new Date(T0));
  const db = options.db ?? openDatabase(":memory:");
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
  expect(response.statusCode).toBe(200);
  return response.json().data;
}

/** Sends a mutation; expectedRevision defaults to the account's current revision. */
async function mutate(
  app: App,
  cookie: string,
  url: string,
  payload: Record<string, unknown> = {},
  options: { requestId?: string; expectedRevision?: number } = {},
) {
  const expectedRevision = options.expectedRevision ?? (await getState(app, cookie)).revision;
  const response = await app.inject({
    method: url === "/party/order" ? "PATCH" : "POST",
    url,
    headers: { cookie },
    payload: { requestId: options.requestId ?? crypto.randomUUID(), expectedRevision, ...payload },
  });
  return { status: response.statusCode, body: response.json() };
}

function addItems(db: DatabaseSync, accountId: string, count: number, definitionId = "item_trinket_luckycoin", affixId: string | null = null) {
  const items = new ItemRepository(db);
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const itemInstanceId = crypto.randomUUID();
    items.insert({ itemInstanceId, accountId, definitionId, affixId, equippedBy: null }, new Date(T0).toISOString());
    ids.push(itemInstanceId);
  }
  return ids;
}

function rewardSummary(state: any) {
  return {
    gold: state.gold,
    heroes: state.heroes.map((h: any) => ({ heroId: h.heroId, level: h.level, xp: h.xp })),
    items: state.inventory.map((i: any) => [i.definitionId, i.affixId]),
    checkpointAt: state.expedition.checkpointAt,
    cycles: state.expedition.cyclesCompletedSinceStart,
  };
}

async function startedHarness(options: { db?: DatabaseSync; clock?: FixedClock } = {}) {
  const h = harness(options);
  const cookie = await login(h.app);
  const start = await mutate(h.app, cookie, "/expedition/start");
  expect(start.status).toBe(200);
  return { ...h, cookie, start };
}

describe("expedition start", () => {
  it("freezes the ordered party loadout with the server clock and rules version", async () => {
    const { app, cookie, start } = await startedHarness();
    expect(start.body.revision).toBe(1);
    const expedition = start.body.data.expedition;
    expect(expedition).toMatchObject({
      status: "active",
      startedAt: new Date(T0).toISOString(),
      checkpointAt: new Date(T0).toISOString(),
      subCycleRemainderMs: 0,
      rulesVersion: 1,
      cyclesCompleted: 0,
    });
    expect(expedition.frozenLoadout.map((m: any) => m.heroId)).toEqual([VANGUARD, RANGER, ARCANIST]);
    expect(expedition).not.toHaveProperty("rngState");

    const again = await mutate(app, cookie, "/expedition/start");
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("active_expedition");
    await app.close();
  });

  it("refuses to start without a complete party and settle/stop without an active expedition", async () => {
    const { app, db } = harness();
    const cookie = await login(app);
    for (const url of ["/expedition/settle", "/expedition/stop"]) {
      const r = await mutate(app, cookie, url);
      expect(r.status).toBe(400);
      expect(r.body.error.details.reason).toBe("no_active_expedition");
    }
    db.prepare("DELETE FROM party_orders WHERE accountId = ?").run(SEED_ACCOUNT_A_ID);
    const start = await mutate(app, cookie, "/expedition/start");
    expect(start.status).toBe(400);
    expect(start.body.error.code).toBe("validation");
    await app.close();
  });
});

describe("offline settlement timing (A06)", () => {
  it("59s credits nothing and does not bump revision; 60s credits one cycle", async () => {
    const { app, cookie, at } = await startedHarness();
    at(59 * SEC);
    const requestId = crypto.randomUUID();
    const s59 = await mutate(app, cookie, "/expedition/settle", {}, { requestId, expectedRevision: 1 });
    expect(s59.status).toBe(200);
    expect(s59.body.revision).toBe(1);
    expect(s59.body.data).toMatchObject({
      creditedCycles: 0,
      elapsedMs: 59_000,
      discardedMs: 0,
      checkpointAt: new Date(T0).toISOString(),
      rewards: { xp: 0, gold: 0, items: [] },
    });
    // Retrying the zero-credit receipt returns the identical result.
    const retry = await mutate(app, cookie, "/expedition/settle", {}, { requestId, expectedRevision: 1 });
    expect(retry.body).toEqual(s59.body);

    at(60 * SEC);
    const s60 = await mutate(app, cookie, "/expedition/settle", {}, { expectedRevision: 1 });
    expect(s60.body.revision).toBe(2);
    expect(s60.body.data.creditedCycles).toBe(1);
    expect(s60.body.data.checkpointAt).toBe(new Date(T0 + MIN).toISOString());
    expect(s60.body.data.outcomes).toEqual({ wins: 1, losses: 0 });
    expect(s60.body.data.rewards.xp).toBe(4);

    const state = await getState(app, cookie);
    expect(state.gold).toBe(s60.body.data.rewards.gold);
    expect(state.gold).toBeGreaterThanOrEqual(10);
    expect(state.heroes.map((h: any) => h.xp)).toEqual([4, 4, 4]);
    expect(state.inventory).toHaveLength(s60.body.data.rewards.items.length);
    await app.close();
  });

  it("61s credits one cycle and the 1s remainder is used by the next settlement", async () => {
    const { app, cookie, at } = await startedHarness();
    at(61 * SEC);
    const s61 = await mutate(app, cookie, "/expedition/settle");
    expect(s61.body.data.creditedCycles).toBe(1);
    expect(s61.body.data.checkpointAt).toBe(new Date(T0 + MIN).toISOString());
    at(119 * SEC);
    expect((await mutate(app, cookie, "/expedition/settle")).body.data.creditedCycles).toBe(0);
    at(120 * SEC);
    expect((await mutate(app, cookie, "/expedition/settle")).body.data.creditedCycles).toBe(1);
    await app.close();
  });

  it("partitioned settlement grants exactly what one continuous settlement grants", async () => {
    const partitioned = await startedHarness();
    for (const offset of [MIN, 125 * SEC, 17 * MIN + 5 * SEC, 41 * MIN + 30 * SEC]) {
      partitioned.at(offset);
      expect((await mutate(partitioned.app, partitioned.cookie, "/expedition/settle")).status).toBe(200);
    }
    const continuous = await startedHarness();
    continuous.at(41 * MIN + 30 * SEC);
    const single = await mutate(continuous.app, continuous.cookie, "/expedition/settle");
    expect(single.body.data.creditedCycles).toBe(41);

    const a = rewardSummary(await getState(partitioned.app, partitioned.cookie));
    const b = rewardSummary(await getState(continuous.app, continuous.cookie));
    expect(a).toEqual(b);
    expect(a.cycles).toBe(41);
    expect(a.checkpointAt).toBe(new Date(T0 + 41 * MIN).toISOString());
    expect(a.items.length).toBeGreaterThan(0);
    await partitioned.app.close();
    await continuous.app.close();
  });

  it("negative elapsed (clock rollback) clamps to zero, then real time is credited once", async () => {
    const { app, cookie, at } = await startedHarness();
    at(-5 * MIN);
    const rollback = await mutate(app, cookie, "/expedition/settle");
    expect(rollback.status).toBe(200);
    expect(rollback.body.data).toMatchObject({ creditedCycles: 0, elapsedMs: 0, discardedMs: 0 });
    expect(rollback.body.revision).toBe(1);
    at(2 * MIN);
    expect((await mutate(app, cookie, "/expedition/settle")).body.data.creditedCycles).toBe(2);
    await app.close();
  });

  it("caps a 10-hour absence at 480 cycles, discards 2 hours, and repeated collection recovers nothing", async () => {
    const { app, cookie, at } = await startedHarness();
    at(10 * HOUR);
    const capped = await mutate(app, cookie, "/expedition/settle");
    expect(capped.body.data).toMatchObject({
      creditedCycles: 480,
      elapsedMs: 36_000_000,
      discardedMs: 7_200_000,
      checkpointAt: new Date(T0 + 10 * HOUR).toISOString(),
    });
    const goldAfterCap = (await getState(app, cookie)).gold;

    const again = await mutate(app, cookie, "/expedition/settle");
    expect(again.body.data).toMatchObject({ creditedCycles: 0, elapsedMs: 0, discardedMs: 0 });
    expect((await getState(app, cookie)).gold).toBe(goldAfterCap);

    // Level cap: 480 wins * 4 XP is far beyond 675, so every hero is level 10 with 0 XP.
    const state = await getState(app, cookie);
    expect(state.heroes.map((h: any) => [h.level, h.xp])).toEqual([[10, 0], [10, 0], [10, 0]]);
    expect(state.expedition.cyclesCompletedSinceStart).toBe(480);
    await app.close();
  });

  it("a 20-hour absence is still one capped window of 480 cycles", async () => {
    const { app, cookie, at } = await startedHarness();
    at(20 * HOUR);
    const r = await mutate(app, cookie, "/expedition/settle");
    expect(r.body.data).toMatchObject({ creditedCycles: 480, discardedMs: 12 * HOUR });
    await app.close();
  });

  it("reading /account/state never settles, grants or bumps revision", async () => {
    const { app, cookie, at } = await startedHarness();
    at(3 * HOUR);
    const before = await getState(app, cookie);
    const after = await getState(app, cookie);
    expect(after).toEqual(before);
    expect(before.revision).toBe(1);
    expect(before.gold).toBe(0);
    expect(before.expedition.checkpointAt).toBe(new Date(T0).toISOString());
    await app.close();
  });
});

describe("downtime, reopen and rules version (A08)", () => {
  it("server restart preserves checkpoint, seed stream and unconsumed remainder", async () => {
    const dbPath = tempDbPath();
    const first = await startedHarness({ db: openDatabase(dbPath) });
    first.at(90 * SEC);
    expect((await mutate(first.app, first.cookie, "/expedition/settle")).body.data.creditedCycles).toBe(1);
    const stateBeforeClose = await getState(first.app, first.cookie);
    const rowBefore = first.db.prepare("SELECT rngState, seed, checkpointAt FROM expeditions").get();
    await first.app.close();

    // Reopen the same save while the "server was down" until T0+41.5min.
    const reopenedClock = new FixedClock(new Date(T0 + 90 * SEC));
    const reopened = harness({ db: openDatabase(dbPath), clock: reopenedClock });
    const cookie = await login(reopened.app);
    expect(await getState(reopened.app, cookie)).toEqual(stateBeforeClose);
    expect(reopened.db.prepare("SELECT rngState, seed, checkpointAt FROM expeditions").get()).toEqual(rowBefore);

    reopened.at(41 * MIN + 30 * SEC);
    const catchUp = await mutate(reopened.app, cookie, "/expedition/settle");
    // checkpoint was T0+60s, so the 30s remainder plus downtime yields 40 more cycles.
    expect(catchUp.body.data.creditedCycles).toBe(40);

    const continuous = await startedHarness();
    continuous.at(41 * MIN + 30 * SEC);
    await mutate(continuous.app, continuous.cookie, "/expedition/settle");
    expect(rewardSummary(await getState(reopened.app, cookie))).toEqual(
      rewardSummary(await getState(continuous.app, continuous.cookie)),
    );
    await reopened.app.close();
    await continuous.app.close();
  });

  it("an expedition started under another rules version fails settle/stop explicitly without changes", async () => {
    const { app, db, cookie, at } = await startedHarness();
    db.prepare("UPDATE expeditions SET rulesVersion = 999").run();
    at(HOUR);
    const before = await getState(app, cookie);
    for (const url of ["/expedition/settle", "/expedition/stop"]) {
      const r = await mutate(app, cookie, url);
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe("validation");
      expect(r.body.error.details.reason).toBe("unsupported_rules_version");
    }
    expect(await getState(app, cookie)).toEqual(before);
    await app.close();
  });
});

describe("no duplicated or partial rewards (A07)", () => {
  it("retrying a committed settle returns the stored result without granting again", async () => {
    const { app, cookie, at } = await startedHarness();
    at(30 * MIN);
    const requestId = crypto.randomUUID();
    const first = await mutate(app, cookie, "/expedition/settle", {}, { requestId, expectedRevision: 1 });
    const goldAfter = (await getState(app, cookie)).gold;
    at(45 * MIN);
    const retry = await mutate(app, cookie, "/expedition/settle", {}, { requestId, expectedRevision: 1 });
    expect(retry.body).toEqual(first.body);
    const state = await getState(app, cookie);
    expect(state.gold).toBe(goldAfter);
    expect(state.revision).toBe(2);
    await app.close();
  });

  it("two concurrent distinct settles at the same revision commit exactly once", async () => {
    const { app, cookie, at } = await startedHarness();
    at(30 * MIN);
    const [x, y] = await Promise.all([
      mutate(app, cookie, "/expedition/settle", {}, { expectedRevision: 1 }),
      mutate(app, cookie, "/expedition/settle", {}, { expectedRevision: 1 }),
    ]);
    const statuses = [x.status, y.status].sort();
    expect(statuses).toEqual([200, 409]);
    const winner = x.status === 200 ? x : y;
    const state = await getState(app, cookie);
    expect(state.gold).toBe(winner.body.data.rewards.gold);
    expect(state.inventory).toHaveLength(winner.body.data.rewards.items.length);
    expect(state.expedition.cyclesCompletedSinceStart).toBe(30);
    await app.close();
  });

  it("two server processes on one save file cannot both credit the same window", async () => {
    const dbPath = tempDbPath();
    const clock = new FixedClock(new Date(T0));
    const one = await startedHarness({ db: openDatabase(dbPath), clock });
    const two = harness({ db: openDatabase(dbPath), clock });
    const cookieTwo = await login(two.app);
    clock.set(new Date(T0 + 30 * MIN));
    const r1 = await mutate(one.app, one.cookie, "/expedition/settle", {}, { expectedRevision: 1 });
    const r2 = await mutate(two.app, cookieTwo, "/expedition/settle", {}, { expectedRevision: 1 });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(409);
    expect(r2.body.error.details.currentRevision).toBe(2);
    expect((await getState(two.app, cookieTwo)).gold).toBe(r1.body.data.rewards.gold);
    await one.app.close();
    await two.app.close();
  });

  it("a failure while writing inventory rolls back gold, XP, checkpoint, revision and receipt together", async () => {
    const { app, db, cookie, at } = await startedHarness();
    at(60 * MIN);
    const before = await getState(app, cookie);
    db.exec("CREATE TEMP TRIGGER fail_items BEFORE INSERT ON item_instances BEGIN SELECT RAISE(ABORT, 'injected'); END;");
    const requestId = crypto.randomUUID();
    const failed = await mutate(app, cookie, "/expedition/settle", {}, { requestId, expectedRevision: 1 });
    expect(failed.status).toBe(500);
    expect(failed.body.error.code).toBe("internal");
    expect(await getState(app, cookie)).toEqual(before);
    expect(db.prepare("SELECT COUNT(*) AS n FROM idempotency_receipts WHERE command = 'expedition/settle'").get()).toEqual({ n: 0 });

    db.exec("DROP TRIGGER fail_items;");
    const ok = await mutate(app, cookie, "/expedition/settle", {}, { requestId, expectedRevision: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.creditedCycles).toBe(60);
    await app.close();
  });
});

describe("inventory overflow conversion", () => {
  async function settleWithInventory(preexisting: number, cycles: number) {
    const h = await startedHarness();
    if (preexisting > 0) addItems(h.db, SEED_ACCOUNT_A_ID, preexisting);
    h.at(cycles * MIN);
    const settle = await mutate(h.app, h.cookie, "/expedition/settle");
    const state = await getState(h.app, h.cookie);
    await h.app.close();
    return { data: settle.body.data, state };
  }

  it("converts every drop to gold at 100 unequipped items and never creates a 101st", async () => {
    // Note: fixtures are inserted after start, so all three runs share the same seed/drop stream.
    const empty = await settleWithInventory(0, 60);
    const full = await settleWithInventory(100, 60);
    const dropped = empty.data.rewards.items as Array<{ affixId: string | null }>;
    expect(dropped.length).toBeGreaterThan(1);

    expect(full.data.rewards.items).toEqual([]);
    expect(full.state.inventory.filter((i: any) => i.equippedBy === null)).toHaveLength(100);
    expect(full.data.overflow.convertedCount).toBe(dropped.length);
    const conversionGold = dropped.reduce((sum, d) => sum + (d.affixId ? 9 : 5), 0);
    expect(full.data.overflow.convertedGold).toBe(conversionGold);
    expect(full.state.gold).toBe(empty.state.gold + conversionGold);
    expect(full.data.recentCycles.length).toBeLessThanOrEqual(10);

    const near = await settleWithInventory(99, 60);
    expect(near.data.rewards.items).toHaveLength(1);
    expect(near.state.inventory).toHaveLength(100);
    expect(near.data.overflow.convertedCount).toBe(dropped.length - 1);
  });
});

describe("party, equipment and specialization rules (A05)", () => {
  async function publishedAtk(app: App, cookie: string): Promise<number[]> {
    const r = await mutate(app, cookie, "/arena/publish");
    return r.body.data.snapshot.frozenStats.map((s: any) => s.atk);
  }

  it("equip/unequip update effective stats and enforce slot, ownership and single-owner rules", async () => {
    const { app, db } = harness();
    const cookie = await login(app);
    const [sword, sword2] = addItems(db, SEED_ACCOUNT_A_ID, 2, "item_weapon_shortsword");
    const [plate] = addItems(db, SEED_ACCOUNT_A_ID, 1, "item_armor_plate");
    const [foreignItem] = addItems(db, SEED_ACCOUNT_B_ID, 1, "item_weapon_shortsword");
    const [foreignHero] = starterHeroIds(SEED_ACCOUNT_B_ID);

    const baseAtk = await publishedAtk(app, cookie);
    const ok = await mutate(app, cookie, "/equipment/equip", { heroId: VANGUARD, itemInstanceId: sword, slot: "weapon" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.hero.equipment.weapon).toBe(sword);
    expect((await publishedAtk(app, cookie))[0]).toBe(baseAtk[0]! + 3);

    const cases: Array<[Record<string, unknown>, number, string]> = [
      [{ heroId: VANGUARD, itemInstanceId: plate, slot: "weapon" }, 400, "validation"],
      [{ heroId: VANGUARD, itemInstanceId: foreignItem, slot: "weapon" }, 403, "forbidden"],
      [{ heroId: foreignHero, itemInstanceId: sword2, slot: "weapon" }, 403, "forbidden"],
      [{ heroId: VANGUARD, itemInstanceId: crypto.randomUUID(), slot: "weapon" }, 404, "not_found"],
      [{ heroId: crypto.randomUUID(), itemInstanceId: sword2, slot: "weapon" }, 404, "not_found"],
      [{ heroId: RANGER, itemInstanceId: sword, slot: "weapon" }, 409, "conflict"],
    ];
    const revisionBefore = (await getState(app, cookie)).revision;
    for (const [payload, status, code] of cases) {
      const r = await mutate(app, cookie, "/equipment/equip", payload);
      expect([r.status, r.body.error.code]).toEqual([status, code]);
    }
    expect((await getState(app, cookie)).revision).toBe(revisionBefore);

    // Swapping weapons returns the old one to inventory.
    await mutate(app, cookie, "/equipment/equip", { heroId: VANGUARD, itemInstanceId: sword2, slot: "weapon" });
    let state = await getState(app, cookie);
    const owner = (id: string) => state.inventory.find((i: any) => i.itemInstanceId === id).equippedBy;
    expect([owner(sword), owner(sword2)]).toEqual([null, VANGUARD]);

    const off = await mutate(app, cookie, "/equipment/unequip", { heroId: VANGUARD, slot: "weapon" });
    expect(off.body.data.hero.equipment.weapon).toBeNull();
    state = await getState(app, cookie);
    expect(owner(sword2)).toBeNull();
    expect((await publishedAtk(app, cookie))[0]).toBe(baseAtk[0]);
    await app.close();
  });

  it("unequip is refused when it would push unequipped inventory past 100", async () => {
    const { app, db } = harness();
    const cookie = await login(app);
    const [sword] = addItems(db, SEED_ACCOUNT_A_ID, 1, "item_weapon_shortsword");
    await mutate(app, cookie, "/equipment/equip", { heroId: VANGUARD, itemInstanceId: sword, slot: "weapon" });
    addItems(db, SEED_ACCOUNT_A_ID, 100);
    const r = await mutate(app, cookie, "/equipment/unequip", { heroId: VANGUARD, slot: "weapon" });
    expect(r.status).toBe(400);
    expect(r.body.error.details.reason).toBe("inventory_full");
    await app.close();
  });

  it("specialization requires level 3, the hero's own class and ownership", async () => {
    const { app, db } = harness();
    const cookie = await login(app);
    const early = await mutate(app, cookie, "/hero/specialization", { heroId: VANGUARD, specializationId: "spec_guardian" });
    expect([early.status, early.body.error.details.reason]).toEqual([400, "level_too_low"]);

    db.prepare("UPDATE heroes SET level = 3 WHERE heroId = ?").run(VANGUARD);
    for (const specializationId of ["spec_pathfinder", "spec_unknown"]) {
      const r = await mutate(app, cookie, "/hero/specialization", { heroId: VANGUARD, specializationId });
      expect([r.status, r.body.error.details.reason]).toEqual([400, "wrong_specialization"]);
    }
    const foreign = await mutate(app, cookie, "/hero/specialization", {
      heroId: starterHeroIds(SEED_ACCOUNT_B_ID)[0],
      specializationId: "spec_guardian",
    });
    expect(foreign.status).toBe(403);

    const ok = await mutate(app, cookie, "/hero/specialization", { heroId: VANGUARD, specializationId: "spec_guardian" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.hero.specializationId).toBe("spec_guardian");
    await app.close();
  });

  it("an active expedition freezes loadout/spec (checked before revision) but not party order or retried receipts", async () => {
    const { app, db, at } = harness();
    const cookie = await login(app);
    const [sword, sword2] = addItems(db, SEED_ACCOUNT_A_ID, 2, "item_weapon_shortsword");
    db.prepare("UPDATE heroes SET level = 3 WHERE heroId = ?").run(VANGUARD);
    const preStartRequestId = crypto.randomUUID();
    const preStart = await mutate(
      app,
      cookie,
      "/equipment/equip",
      { heroId: VANGUARD, itemInstanceId: sword, slot: "weapon" },
      { requestId: preStartRequestId, expectedRevision: 0 },
    );
    expect(preStart.status).toBe(200);
    const start = await mutate(app, cookie, "/expedition/start");
    const frozen = start.body.data.expedition.frozenLoadout;
    expect(frozen[0].equippedInstanceIds.weapon).toBe(sword);

    const locked: Array<[string, Record<string, unknown>]> = [
      ["/equipment/equip", { heroId: VANGUARD, itemInstanceId: sword2, slot: "weapon" }],
      ["/equipment/unequip", { heroId: VANGUARD, slot: "weapon" }],
      ["/hero/specialization", { heroId: VANGUARD, specializationId: "spec_guardian" }],
    ];
    for (const [url, payload] of locked) {
      const stale = await mutate(app, cookie, url, payload, { expectedRevision: 0 });
      expect([stale.status, stale.body.error.code]).toEqual([409, "active_expedition"]);
    }

    // The pre-start receipt still replays its original result.
    const replay = await mutate(
      app,
      cookie,
      "/equipment/equip",
      { heroId: VANGUARD, itemInstanceId: sword, slot: "weapon" },
      { requestId: preStartRequestId, expectedRevision: 0 },
    );
    expect(replay.body).toEqual(preStart.body);

    // Reordering is allowed and does not touch the frozen loadout.
    const reorder = await mutate(app, cookie, "/party/order", { order: [ARCANIST, RANGER, VANGUARD] });
    expect(reorder.status).toBe(200);

    // Mid-run level-ups change live level/xp only; the frozen loadout keeps start levels.
    at(15 * MIN);
    await mutate(app, cookie, "/expedition/settle");
    const midRun = await getState(app, cookie);
    expect(midRun.heroes.find((h: any) => h.heroId === RANGER).level).toBe(3);
    expect(midRun.expedition.frozenLoadout.map((m: any) => m.heroId)).toEqual([VANGUARD, RANGER, ARCANIST]);
    expect(midRun.expedition.frozenLoadout[1].level).toBe(1);

    at(15 * MIN + 59 * SEC);
    const stop = await mutate(app, cookie, "/expedition/stop");
    expect(stop.status).toBe(200);
    expect(stop.body.data.finalSettlement.creditedCycles).toBe(0);
    expect(stop.body.data.expedition.status).toBe("none");
    expect((await getState(app, cookie)).expedition).toEqual({ status: "none", checkpointAt: null, cyclesCompletedSinceStart: 0 });

    const afterStop = await mutate(app, cookie, "/hero/specialization", { heroId: VANGUARD, specializationId: "spec_guardian" });
    expect(afterStop.status).toBe(200);
    await app.close();
  });

  it("stop settles whole cycles and discards the sub-cycle remainder", async () => {
    const { app, cookie, at } = await startedHarness();
    at(5 * MIN + 59 * SEC);
    const stop = await mutate(app, cookie, "/expedition/stop");
    expect(stop.body.data.finalSettlement.creditedCycles).toBe(5);
    // Restarting begins a fresh window from the stop instant; the 59s are gone.
    const restart = await mutate(app, cookie, "/expedition/start");
    expect(restart.body.data.expedition.checkpointAt).toBe(new Date(T0 + 5 * MIN + 59 * SEC).toISOString());
    at(6 * MIN + 30 * SEC);
    expect((await mutate(app, cookie, "/expedition/settle")).body.data.creditedCycles).toBe(0);
    await app.close();
  });
});

describe("boss first-clear reward (A09)", () => {
  function strengthen(db: DatabaseSync, level: number) {
    db.prepare("UPDATE heroes SET level = ? WHERE accountId = ?").run(level, SEED_ACCOUNT_A_ID);
  }

  it("a loss is recoverable and leaves the claim untouched; the first win pays once; later wins only report", async () => {
    const { app, db } = harness();
    const cookie = await login(app);

    const loss = await mutate(app, cookie, "/boss/challenge");
    expect(loss.status).toBe(200);
    expect(loss.body.data.report.result.outcome).toBe("loss");
    expect(loss.body.data.rewardGranted).toBe(false);
    let state = await getState(app, cookie);
    expect(state.bossClaims).toEqual([{ accountId: SEED_ACCOUNT_A_ID, bossId: "boss_tollkeeper", claimedAt: null }]);
    expect(state.gold).toBe(0);
    const report = await app.inject({ method: "GET", url: `/battle-reports/${loss.body.data.report.reportId}`, headers: { cookie } });
    expect(report.statusCode).toBe(200);

    strengthen(db, 6);
    const win = await mutate(app, cookie, "/boss/challenge");
    expect(win.body.data.report.result.outcome).toBe("win");
    expect(win.body.data.rewardGranted).toBe(true);
    expect(win.body.data.reward.gold).toBe(150);
    expect(win.body.data.reward.items).toHaveLength(1);
    expect(win.body.data.reward.items[0].affixId).not.toBeNull();
    state = await getState(app, cookie);
    expect(state.gold).toBe(150);
    expect(state.inventory).toHaveLength(1);
    expect(state.heroes.map((h: any) => [h.level, h.xp])).toEqual([[6, 40], [6, 40], [6, 40]]);
    expect(state.bossClaims[0].claimedAt).toBe(new Date(T0).toISOString());

    const repeat = await mutate(app, cookie, "/boss/challenge");
    expect(repeat.body.data.report.result.outcome).toBe("win");
    expect(repeat.body.data.rewardGranted).toBe(false);
    expect(repeat.body.data.reward).toBeNull();
    const after = await getState(app, cookie);
    expect([after.gold, after.inventory.length]).toEqual([150, 1]);
    expect(after.heroes.map((h: any) => h.xp)).toEqual([40, 40, 40]);
    await app.close();
  });

  it("concurrent winning challenges grant the reward exactly once", async () => {
    const { app, db } = harness();
    const cookie = await login(app);
    strengthen(db, 6);
    const results = await Promise.all([0, 1, 2].map(() => mutate(app, cookie, "/boss/challenge", {}, { expectedRevision: 0 })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    // Refetch and retry sequentially: still one grant in total.
    await mutate(app, cookie, "/boss/challenge");
    const state = await getState(app, cookie);
    expect(state.gold).toBe(150);
    expect(state.inventory).toHaveLength(1);
    await app.close();
  });

  it("the guaranteed item converts to 9 gold at a full inventory; gold/XP are unaffected", async () => {
    const { app, db } = harness();
    const cookie = await login(app);
    strengthen(db, 6);
    addItems(db, SEED_ACCOUNT_A_ID, 100);
    const win = await mutate(app, cookie, "/boss/challenge");
    expect(win.body.data.rewardGranted).toBe(true);
    expect(win.body.data.reward).toMatchObject({ gold: 159, items: [], overflowConvertedGold: 9, xp: 40 });
    const state = await getState(app, cookie);
    expect([state.gold, state.inventory.length]).toEqual([159, 100]);
    await app.close();
  });

  it("a failure writing the report rolls back the claim and reward", async () => {
    const { app, db } = harness();
    const cookie = await login(app);
    strengthen(db, 6);
    db.exec("CREATE TEMP TRIGGER fail_reports BEFORE INSERT ON battle_reports BEGIN SELECT RAISE(ABORT, 'injected'); END;");
    const failed = await mutate(app, cookie, "/boss/challenge");
    expect(failed.status).toBe(500);
    const state = await getState(app, cookie);
    expect([state.gold, state.inventory.length, state.bossClaims[0].claimedAt, state.revision]).toEqual([0, 0, null, 0]);
    db.exec("DROP TRIGGER fail_reports;");
    expect((await mutate(app, cookie, "/boss/challenge")).body.data.rewardGranted).toBe(true);
    await app.close();
  });

  it("is usable during an active expedition and uses live gear", async () => {
    const { app, db } = harness();
    const cookie = await login(app);
    strengthen(db, 6);
    await mutate(app, cookie, "/expedition/start");
    const r = await mutate(app, cookie, "/boss/challenge");
    expect(r.status).toBe(200);
    expect(r.body.data.rewardGranted).toBe(true);
    await app.close();
  });
});

describe("endpoint authentication and validation", () => {
  it("every M1-08 mutation requires a session and a valid payload", async () => {
    const { app } = harness();
    const cookie = await login(app);
    for (const url of [
      "/equipment/equip",
      "/equipment/unequip",
      "/hero/specialization",
      "/expedition/start",
      "/expedition/settle",
      "/expedition/stop",
      "/boss/challenge",
    ]) {
      const anon = await app.inject({ method: "POST", url, payload: { requestId: crypto.randomUUID(), expectedRevision: 0 } });
      expect([url, anon.statusCode]).toEqual([url, 401]);
      const bad = await app.inject({ method: "POST", url, headers: { cookie }, payload: { requestId: "nope", expectedRevision: -1 } });
      expect([url, bad.statusCode, bad.json().error.code]).toEqual([url, 400, "validation"]);
    }
    await app.close();
  });
});
