// Exit evidence required by design/studio/reports/M3-02.md ("Accepted
// deferral and its exit evidence") before accepting M3-08's migration/
// progression work: isolated fresh-vs-legacy SQLite fixtures, real
// migrations, controlled clock/RNG, equivalent authoritative command
// timelines; preserved gold/XP/item identity/ownership/equipment/stat
// contribution; zero unearned material grants; compared across the
// documented 1/3/5-hero and 30/84/480-minute scenarios.
//
// This does not duplicate db/migrations.test.ts's single-hero schema-shape
// migration test (which already covers ServerClock/race/respec defaults and
// restart/reopen idempotency). This file instead compares *behavior*: a
// legacy (schema v4) save that is migrated to v5 and then played, against an
// equivalent save built directly at v5 ("fresh"), under the identical
// deterministic clock+seed (expeditionSeed/expeditionCombatSeed are pure
// functions of accountId+startedAt, so two runs starting at the same instant
// for the same account necessarily roll identically).
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "./app.js";
import { FixedClock } from "./clock.js";
import { openDatabase } from "./db/connection.js";
import { runMigrations } from "./db/migrations.js";
import { SEED_ACCOUNT_A_ID, starterHeroIds } from "./db/seed.js";

const T0 = Date.parse("2026-04-01T09:00:00.000Z");
const MIN = 60 * 1000;
const STARTING_GOLD = 500;

type App = ReturnType<typeof buildServer>;

const openedPaths: string[] = [];
const openApps: App[] = [];
afterEach(async () => {
  for (const app of openApps.splice(0)) await app.close();
  for (const dbPath of openedPaths.splice(0)) fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

function tempDbPath(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `bb-m308-matrix-${label}-`));
  const dbPath = path.join(dir, "save.sqlite");
  openedPaths.push(dbPath);
  return dbPath;
}

interface HeroFixture {
  heroId: string;
  itemId: string;
}

/** A fixed 5-hero/5-item roster; every scenario fields a prefix of it so seedAccounts' starter-hero IDs never collide with an unexpected insert. */
function fullRoster(): HeroFixture[] {
  const [h0, h1, h2] = starterHeroIds(SEED_ACCOUNT_A_ID);
  const ids = [h0, h1, h2, "00000000-0000-4000-8000-00000000a004", "00000000-0000-4000-8000-00000000a005"];
  return ids.map((heroId, i) => ({ heroId, itemId: `item-fixture-${i}` }));
}

const AFFIXES = JSON.stringify([
  { affixId: "affix_of_power", value: 3 },
  { affixId: "affix_of_vigor", value: 2 },
]);
const LOADOUT = JSON.stringify({ active: ["aimed_shot", "volley"], passive: ["hunters_focus", ""] });

function insertRosterAndFormation(db: ReturnType<typeof openDatabase>, roster: HeroFixture[], heroCount: 1 | 3 | 5): void {
  for (const hero of roster) {
    db.prepare(
      "INSERT INTO heroes (heroId, accountId, primaryClassId, level, xp, skillLoadout, equipmentWeapon) VALUES (?, ?, 'class_ranger', 5, 0, ?, ?)",
    ).run(hero.heroId, SEED_ACCOUNT_A_ID, LOADOUT, hero.itemId);
    db.prepare(
      "INSERT INTO item_instances (itemInstanceId, accountId, definitionId, rarityId, affixes, equippedBy, createdAt) VALUES (?, ?, 'item_weapon_shortsword', 'rare', ?, ?, 't')",
    ).run(hero.itemId, SEED_ACCOUNT_A_ID, AFFIXES, hero.heroId);
  }
  const fielded = roster.slice(0, heroCount).map((h) => h.heroId);
  const slots = [0, 1, 2, 3, 4].map((i) => fielded[i] ?? null);
  db.prepare("INSERT INTO party_formations (accountId, slot0, slot1, slot2, slot3, slot4) VALUES (?, ?, ?, ?, ?, ?)").run(SEED_ACCOUNT_A_ID, ...slots);
}

function economySnapshot(db: ReturnType<typeof openDatabase>) {
  return db.prepare("SELECT gold, materialScrap, materialSigil, materialCore FROM accounts WHERE accountId = ?").get(SEED_ACCOUNT_A_ID);
}

function itemSnapshot(db: ReturnType<typeof openDatabase>) {
  return db
    .prepare("SELECT itemInstanceId, accountId, definitionId, rarityId, affixes, equippedBy FROM item_instances WHERE accountId = ? ORDER BY itemInstanceId")
    .all(SEED_ACCOUNT_A_ID);
}

function equipmentSnapshot(db: ReturnType<typeof openDatabase>) {
  return db.prepare("SELECT heroId, equipmentWeapon FROM heroes WHERE accountId = ? ORDER BY heroId").all(SEED_ACCOUNT_A_ID);
}

/**
 * Builds a pre-M3 (schema v4) save with `heroCount` fielded heroes (of a
 * fixed 5-hero roster), each wielding an equipped rare weapon, then migrates
 * it to v5. Asserts in-place that migration alone preserves gold/materials
 * (zero unearned grants) and item identity/ownership/definition/rarity/
 * affixes/equipment slot (item identity/ownership/equipment preservation) —
 * the two checks M3-02.md's exit evidence names as "preserved...item
 * identity/ownership/equipment/stat contribution" and "zero unearned
 * material grants", isolated from any subsequent settlement.
 */
function buildMigratedFixture(heroCount: 1 | 3 | 5): string {
  const dbPath = tempDbPath(`v4-${heroCount}`);
  const roster = fullRoster();

  const v4 = openDatabase(dbPath);
  runMigrations(v4, 4);
  v4.prepare(
    "INSERT INTO accounts (accountId, displayName, createdAt, slot, revision, gold, selectedAreaId, materialScrap, materialSigil, materialCore) VALUES (?, 'Company A', 't', 'A', 0, ?, 'area_old_road', 10, 5, 2)",
  ).run(SEED_ACCOUNT_A_ID, STARTING_GOLD);
  insertRosterAndFormation(v4, roster, heroCount);
  const preMigrationEconomy = economySnapshot(v4);
  const preMigrationItems = itemSnapshot(v4);
  v4.close();

  const v5 = openDatabase(dbPath);
  runMigrations(v5);
  expect(economySnapshot(v5)).toEqual(preMigrationEconomy); // migration itself grants no gold/materials
  expect(itemSnapshot(v5)).toEqual(preMigrationItems); // item identity/ownership/definition/rarity/affixes unchanged
  for (const hero of roster.slice(0, heroCount)) {
    expect(equipmentSnapshot(v5).find((h: { heroId: string }) => h.heroId === hero.heroId)).toEqual({ heroId: hero.heroId, equipmentWeapon: hero.itemId });
  }
  v5.close();
  return dbPath;
}

/** An equivalent save built directly at v5 (never crossed the migration boundary), for a same-timeline comparison. */
function buildFreshFixture(heroCount: 1 | 3 | 5): string {
  const dbPath = tempDbPath(`v5-${heroCount}`);
  const roster = fullRoster();
  const db = openDatabase(dbPath);
  runMigrations(db);
  db.prepare(
    "INSERT INTO accounts (accountId, displayName, createdAt, slot, revision, gold, selectedAreaId, materialScrap, materialSigil, materialCore) VALUES (?, 'Company A', 't', 'A', 0, ?, 'area_old_road', 10, 5, 2)",
  ).run(SEED_ACCOUNT_A_ID, STARTING_GOLD);
  insertRosterAndFormation(db, roster, heroCount);
  db.close();
  return dbPath;
}

async function openHarness(dbPath: string): Promise<{ app: App; cookie: string; at: (offsetMs: number) => void }> {
  const clock = new FixedClock(new Date(T0));
  const db = openDatabase(dbPath);
  const app = buildServer({ db, clock });
  openApps.push(app);
  const response = await app.inject({ method: "POST", url: "/dev/session/select", payload: { accountSlot: "A" } });
  const header = response.headers["set-cookie"];
  const cookie = (Array.isArray(header) ? header[0]! : header!).split(";")[0]!;
  return { app, cookie, at: (offsetMs: number) => clock.set(new Date(T0 + offsetMs)) };
}

async function getState(app: App, cookie: string) {
  const response = await app.inject({ method: "GET", url: "/account/state", headers: { cookie } });
  return response.json().data;
}

async function mutate(app: App, cookie: string, url: string, payload: Record<string, unknown> = {}) {
  const expectedRevision = (await getState(app, cookie)).revision;
  const response = await app.inject({
    method: "POST",
    url,
    headers: { cookie },
    payload: { requestId: crypto.randomUUID(), expectedRevision, ...payload },
  });
  return { status: response.statusCode, body: response.json() };
}

const HERO_COUNTS = [1, 3, 5] as const;
const DURATIONS_MIN = [30, 84, 480] as const;

describe("fresh-versus-migrated save progression matrix (M3-02.md exit evidence for M3-08)", () => {
  for (const heroCount of HERO_COUNTS) {
    it(`stat contribution is identical between a migrated and a fresh ${heroCount}-hero save before any settlement`, async () => {
      const migrated = await openHarness(buildMigratedFixture(heroCount));
      const fresh = await openHarness(buildFreshFixture(heroCount));

      const migratedState = await getState(migrated.app, migrated.cookie);
      const freshState = await getState(fresh.app, fresh.cookie);

      // Zero unearned grants: reopening a migrated save (no settlement yet) must not have changed its economy.
      expect(migratedState.gold).toBe(STARTING_GOLD);
      expect(migratedState.materials).toEqual(freshState.materials);

      const migratedHeroes = migratedState.heroes
        .filter((h: { heroId: string }) => migratedState.formation.slots.includes(h.heroId))
        .sort((a: { heroId: string }, b: { heroId: string }) => a.heroId.localeCompare(b.heroId));
      const freshHeroes = freshState.heroes
        .filter((h: { heroId: string }) => freshState.formation.slots.includes(h.heroId))
        .sort((a: { heroId: string }, b: { heroId: string }) => a.heroId.localeCompare(b.heroId));
      expect(migratedHeroes).toHaveLength(heroCount);
      // Same class/level/equipment/affixes on both sides: identical effectiveStats proves the equipped
      // item's stat contribution (and the migrated raceId/specialization defaults) survived migration
      // unchanged, not just that the raw equipment column copied over.
      expect(migratedHeroes.map((h: { effectiveStats: unknown }) => h.effectiveStats)).toEqual(
        freshHeroes.map((h: { effectiveStats: unknown }) => h.effectiveStats),
      );
      expect(migratedHeroes.map((h: { equipment: unknown }) => h.equipment)).toEqual(freshHeroes.map((h: { equipment: unknown }) => h.equipment));
    });

    for (const durationMin of DURATIONS_MIN) {
      it(`equivalent ${durationMin}-minute command timeline settles identically for a migrated and a fresh ${heroCount}-hero save`, async () => {
        const migrated = await openHarness(buildMigratedFixture(heroCount));
        const fresh = await openHarness(buildFreshFixture(heroCount));

        for (const h of [migrated, fresh]) {
          await mutate(h.app, h.cookie, "/expedition/start");
        }
        // Starting an expedition itself must grant nothing (zero unearned materials/gold before any elapsed time).
        const afterStartMigrated = await getState(migrated.app, migrated.cookie);
        expect(afterStartMigrated.gold).toBe(STARTING_GOLD);
        expect(afterStartMigrated.materials).toEqual({ scrap: 10, sigil: 5, core: 2 });

        for (const h of [migrated, fresh]) h.at(durationMin * MIN);
        const settleMigrated = await mutate(migrated.app, migrated.cookie, "/expedition/settle");
        const settleFresh = await mutate(fresh.app, fresh.cookie, "/expedition/settle");
        expect(settleMigrated.status).toBe(200);
        expect(settleFresh.status).toBe(200);

        // Same deterministic seed (accountId+startedAt, identical on both sides) and same equipped
        // party => byte-identical rolls. This is the "equivalent authoritative command timelines"
        // comparison the exit evidence requires, for this (heroCount, duration) cell of the matrix.
        // reportId (prefixed by a freshly-random per-start runId) and any minted item drop's
        // itemInstanceId (crypto.randomUUID() per instance) are excluded: both are randomly
        // generated identifiers by design, not a function of the deterministic combat/reward seed.
        const normalizeBattles = (battles: { reportId: string; rewards: { items: { itemInstanceId: string }[] } | null }[]) =>
          battles.map(({ reportId, ...rest }) => ({
            ...rest,
            rewards: rest.rewards && { ...rest.rewards, items: rest.rewards.items.map(({ itemInstanceId, ...item }) => item) },
          }));
        expect(normalizeBattles(settleMigrated.body.data.creditedBattles)).toEqual(normalizeBattles(settleFresh.body.data.creditedBattles));
        expect(settleMigrated.body.data.discardedMs).toBe(settleFresh.body.data.discardedMs);

        const stateMigrated = await getState(migrated.app, migrated.cookie);
        const stateFresh = await getState(fresh.app, fresh.cookie);
        expect(stateMigrated.gold).toBe(stateFresh.gold);
        expect(stateMigrated.materials).toEqual(stateFresh.materials);
        // No unearned grant beyond what both decks rolled: the gain over the shared starting point
        // is explained entirely by creditedBattles' rewards, not by the migration path taken to get here.
        expect(stateMigrated.gold).toBeGreaterThanOrEqual(STARTING_GOLD);

        const levelsMigrated = stateMigrated.heroes
          .map((h: { heroId: string; level: number; xp: number }) => h)
          .sort((a: { heroId: string }, b: { heroId: string }) => a.heroId.localeCompare(b.heroId))
          .map(({ level, xp }: { level: number; xp: number }) => ({ level, xp }));
        const levelsFresh = stateFresh.heroes
          .map((h: { heroId: string; level: number; xp: number }) => h)
          .sort((a: { heroId: string }, b: { heroId: string }) => a.heroId.localeCompare(b.heroId))
          .map(({ level, xp }: { level: number; xp: number }) => ({ level, xp }));
        expect(levelsMigrated).toEqual(levelsFresh);
      });
    }
  }
});
