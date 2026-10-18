import type { DatabaseSync } from "node:sqlite";

// Each migration is applied exactly once, in order, tracked by schema_version.
// Append new migrations here; never edit a migration already shipped to a
// save file (design/studio/architecture.md: "use migrations from an empty
// database and test reopening an existing save").
interface Migration {
  version: number;
  sql: string;
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
