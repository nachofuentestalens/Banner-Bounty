import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// node:sqlite is still experimental on the pinned Node build (confirmed in
// reports/engineering/M1-05.md); it logs an ExperimentalWarning once per
// process, which is accepted here rather than suppressed so the caveat stays
// visible in server logs.
export function openDatabase(dbPath: string): DatabaseSync {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE;");
  try {
    const result = fn();
    db.exec("COMMIT;");
    return result;
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}
