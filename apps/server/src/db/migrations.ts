import type { DatabaseSync } from "node:sqlite";
import { autoFillLoadout } from "@banner-and-bounty/content";

// Each migration is applied exactly once, in order, tracked by schema_version.
// Append new migrations here; never edit a migration already shipped to a
// save file (design/studio/architecture.md: "use migrations from an empty
// database and test reopening an existing save").
interface Migration {
  version: number;
  sql: string;
  /** Optional JS backfill step, run after `sql`, inside the same transaction. */
  migrate?: (db: DatabaseSync) => void;
}

interface LegacyHeroRow {
  heroId: string;
  primaryClassId: string;
  level: number;
}

interface LegacyItemRow {
  itemInstanceId: string;
  affixId: string | null;
}

/** gear.md section 6's exact legacy affixId -> rarityId/affixes table (contracts.md M2-25 migration step 6). */
function migrateLegacyAffix(affixId: string | null): { rarityId: string; affixes: { affixId: string; value: number }[] } {
  if (!affixId) return { rarityId: "common", affixes: [] };
  if (affixId === "affix_of_vigor") return { rarityId: "uncommon", affixes: [{ affixId: "affix_of_vigor", value: 3 }] };
  // legacy "power" or "warding"
  return { rarityId: "uncommon", affixes: [{ affixId, value: 2 }] };
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE schema_version (
        version INTEGER PRIMARY KEY,
        appliedAt TEXT NOT NULL
      );

      CREATE TABLE accounts (
        accountId TEXT PRIMARY KEY,
        displayName TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        slot TEXT UNIQUE,
        revision INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE sessions (
        sessionId TEXT PRIMARY KEY,
        accountId TEXT NOT NULL REFERENCES accounts(accountId),
        createdAt TEXT NOT NULL
      );
      CREATE INDEX idx_sessions_accountId ON sessions(accountId);

      CREATE TABLE heroes (
        heroId TEXT PRIMARY KEY,
        accountId TEXT NOT NULL REFERENCES accounts(accountId),
        classId TEXT NOT NULL,
        level INTEGER NOT NULL,
        xp INTEGER NOT NULL,
        specializationId TEXT,
        equipmentWeapon TEXT,
        equipmentArmor TEXT,
        equipmentTrinket TEXT
      );
      CREATE INDEX idx_heroes_accountId ON heroes(accountId);

      CREATE TABLE party_orders (
        accountId TEXT PRIMARY KEY REFERENCES accounts(accountId),
        hero1 TEXT NOT NULL,
        hero2 TEXT NOT NULL,
        hero3 TEXT NOT NULL
      );

      CREATE TABLE idempotency_receipts (
        accountId TEXT NOT NULL REFERENCES accounts(accountId),
        command TEXT NOT NULL,
        requestId TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        resultPayload TEXT NOT NULL,
        resultRevision INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY (accountId, command, requestId)
      );
    `,
  },
  {
    // M1-11: immutable arena snapshots and battle reports. Insert-only by
    // convention (no UPDATE path in any repository) per contracts.md's
    // "Immutable arena snapshots" invariant.
    version: 2,
    sql: `
      CREATE TABLE team_snapshots (
        snapshotId TEXT PRIMARY KEY,
        accountId TEXT NOT NULL REFERENCES accounts(accountId),
        publishedAt TEXT NOT NULL,
        rulesVersion INTEGER NOT NULL,
        frozenParty TEXT NOT NULL,
        frozenStats TEXT NOT NULL
      );
      CREATE INDEX idx_team_snapshots_accountId ON team_snapshots(accountId);

      CREATE TABLE battle_reports (
        reportId TEXT PRIMARY KEY,
        accountId TEXT NOT NULL REFERENCES accounts(accountId),
        kind TEXT NOT NULL,
        participantsSnapshot TEXT NOT NULL,
        seed TEXT NOT NULL,
        rulesVersion INTEGER NOT NULL,
        events TEXT NOT NULL,
        result TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX idx_battle_reports_accountId ON battle_reports(accountId);
    `,
  },
  {
    // M1-08: gold, item instances, expedition state and boss claims.
    // heroes.equipment* stays the authoritative slot record; items.equippedBy
    // mirrors it and both are written in the same transaction. seq gives the
    // inventory a stable creation order.
    version: 3,
    sql: `
      ALTER TABLE accounts ADD COLUMN gold INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0);

      CREATE TABLE item_instances (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        itemInstanceId TEXT NOT NULL UNIQUE,
        accountId TEXT NOT NULL REFERENCES accounts(accountId),
        definitionId TEXT NOT NULL,
        affixId TEXT,
        equippedBy TEXT REFERENCES heroes(heroId),
        createdAt TEXT NOT NULL
      );
      CREATE INDEX idx_item_instances_account ON item_instances(accountId, equippedBy);

      CREATE TABLE expeditions (
        accountId TEXT PRIMARY KEY REFERENCES accounts(accountId),
        status TEXT NOT NULL CHECK (status IN ('none', 'active')),
        startedAt TEXT,
        checkpointAt TEXT,
        subCycleRemainderMs INTEGER NOT NULL DEFAULT 0,
        frozenLoadout TEXT,
        rulesVersion INTEGER,
        seed INTEGER,
        rngState INTEGER,
        cyclesCompleted INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE boss_claims (
        accountId TEXT NOT NULL REFERENCES accounts(accountId),
        bossId TEXT NOT NULL,
        claimedAt TEXT,
        PRIMARY KEY (accountId, bossId)
      );
    `,
  },
  {
    // M2-25/M2-27: dual class/skill loadout, 5-slot formation, gear rarity/
    // affixes, materials, dungeon runs, and area selection (M2-01). Formalizes
    // contracts.md's M2-25 "Migration" 10-step procedure. Schema changes via
    // SQL; the JS `migrate` step below backfills skillLoadout/affixes/
    // formation/dungeon rows (step 3, step 6, step 5, step 8) since those
    // derivations are not expressible in plain SQL.
    version: 4,
    sql: `
      ALTER TABLE accounts ADD COLUMN selectedAreaId TEXT NOT NULL DEFAULT 'area_old_road';
      ALTER TABLE accounts ADD COLUMN materialScrap INTEGER NOT NULL DEFAULT 0 CHECK (materialScrap >= 0);
      ALTER TABLE accounts ADD COLUMN materialSigil INTEGER NOT NULL DEFAULT 0 CHECK (materialSigil >= 0);
      ALTER TABLE accounts ADD COLUMN materialCore INTEGER NOT NULL DEFAULT 0 CHECK (materialCore >= 0);

      ALTER TABLE heroes RENAME COLUMN classId TO primaryClassId;
      ALTER TABLE heroes ADD COLUMN secondaryClassId TEXT;
      ALTER TABLE heroes ADD COLUMN skillLoadout TEXT;

      ALTER TABLE item_instances ADD COLUMN rarityId TEXT NOT NULL DEFAULT 'common';
      ALTER TABLE item_instances ADD COLUMN affixes TEXT NOT NULL DEFAULT '[]';

      CREATE TABLE party_formations (
        accountId TEXT PRIMARY KEY REFERENCES accounts(accountId),
        slot0 TEXT, slot1 TEXT, slot2 TEXT, slot3 TEXT, slot4 TEXT
      );

      CREATE TABLE dungeon_runs (
        accountId TEXT PRIMARY KEY REFERENCES accounts(accountId),
        status TEXT NOT NULL DEFAULT 'none' CHECK (status IN ('none', 'active')),
        dungeonId TEXT,
        startedAt TEXT,
        checkpointAt TEXT,
        currentFloor INTEGER NOT NULL DEFAULT 1,
        floorsCleared INTEGER NOT NULL DEFAULT 0,
        frozenLoadout TEXT,
        rulesVersion INTEGER,
        combatSeedBase INTEGER,
        rngState TEXT,
        outcome TEXT NOT NULL DEFAULT 'none' CHECK (outcome IN ('none', 'cleared', 'failed'))
      );

      ALTER TABLE expeditions ADD COLUMN areaId TEXT;
    `,
    migrate: (db) => {
      // Step 3: skillLoadout derived (auto-filled from primary class), never
      // copied from the dropped specializationId.
      const heroes = db.prepare("SELECT heroId, primaryClassId, level FROM heroes").all() as unknown as LegacyHeroRow[];
      const setLoadout = db.prepare("UPDATE heroes SET skillLoadout = ? WHERE heroId = ?");
      for (const hero of heroes) {
        setLoadout.run(JSON.stringify(autoFillLoadout(hero.primaryClassId, hero.level)), hero.heroId);
      }
      db.exec("ALTER TABLE heroes DROP COLUMN specializationId;");

      // Step 6: affixId -> rarityId/affixes per gear.md's exact table.
      const items = db.prepare("SELECT itemInstanceId, affixId FROM item_instances").all() as unknown as LegacyItemRow[];
      const setAffixes = db.prepare("UPDATE item_instances SET rarityId = ?, affixes = ? WHERE itemInstanceId = ?");
      for (const item of items) {
        const migrated = migrateLegacyAffix(item.affixId);
        setAffixes.run(migrated.rarityId, JSON.stringify(migrated.affixes), item.itemInstanceId);
      }
      db.exec("ALTER TABLE item_instances DROP COLUMN affixId;");

      // Step 5: PartyOrder.order[0..2] -> PartyFormation.slots[0..2]; back row starts empty.
      const partyOrders = db.prepare("SELECT accountId, hero1, hero2, hero3 FROM party_orders").all() as unknown as {
        accountId: string;
        hero1: string;
        hero2: string;
        hero3: string;
      }[];
      const insertFormation = db.prepare(
        "INSERT OR IGNORE INTO party_formations (accountId, slot0, slot1, slot2, slot3, slot4) VALUES (?, ?, ?, ?, NULL, NULL)",
      );
      for (const order of partyOrders) {
        insertFormation.run(order.accountId, order.hero1, order.hero2, order.hero3);
      }
      db.exec("DROP TABLE party_orders;");

      // Step 8: every existing account gets a dormant DungeonRun row.
      const accountIds = db.prepare("SELECT accountId FROM accounts").all() as unknown as { accountId: string }[];
      const insertDungeonRun = db.prepare("INSERT OR IGNORE INTO dungeon_runs (accountId) VALUES (?)");
      for (const row of accountIds) insertDungeonRun.run(row.accountId);
    },
  },
];

function schemaVersionTableExists(db: DatabaseSync): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'")
    .get();
  return row !== undefined;
}

/** `upToVersion` exists so tests can build an older save and then upgrade it. */
export function runMigrations(db: DatabaseSync, upToVersion = Number.POSITIVE_INFINITY): void {
  const applied = schemaVersionTableExists(db)
    ? new Set(
        (db.prepare("SELECT version FROM schema_version").all() as Array<{ version: number }>)
          .map((row) => row.version),
      )
    : new Set<number>();

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version) || migration.version > upToVersion) continue;
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.exec(migration.sql);
      migration.migrate?.(db);
      db.prepare("INSERT INTO schema_version (version, appliedAt) VALUES (?, ?)").run(
        migration.version,
        new Date().toISOString(),
      );
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  }
}

export function currentSchemaVersion(db: DatabaseSync): number {
  if (!schemaVersionTableExists(db)) return 0;
  const row = db
    .prepare("SELECT MAX(version) AS version FROM schema_version")
    .get() as { version: number | null } | undefined;
  return row?.version ?? 0;
}
