import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { openDatabase } from "./connection.js";
import { runMigrations, currentSchemaVersion } from "./migrations.js";
import { seedAccounts } from "./seed.js";
import { SystemClock } from "../clock.js";
import { AccountRepository } from "../repositories/accountRepository.js";

// Acceptance 1: fresh database and save reopen/migration pass using isolated
// fixtures; test data never replaces real saves. Every fixture here lives
// under os.tmpdir() in a per-test subdirectory, never under the repo's own
// data/ directory.
function tempDbPath(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `bb-m107-${label}-`));
  return path.join(dir, "save.sqlite");
}

const openedPaths: string[] = [];
afterEach(() => {
  for (const dbPath of openedPaths.splice(0)) {
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

describe("migrations", () => {
  it("applies cleanly to a fresh in-memory database", () => {
    const db = openDatabase(":memory:");
    expect(currentSchemaVersion(db)).toBe(0);
    runMigrations(db);
    expect(currentSchemaVersion(db)).toBe(2);
    db.close();
  });

  it("is idempotent: running twice does not fail or duplicate schema_version rows", () => {
    const db = openDatabase(":memory:");
    runMigrations(db);
    runMigrations(db);
    const rows = db.prepare("SELECT * FROM schema_version").all();
    expect(rows).toHaveLength(2);
    db.close();
  });

  it("reopening an existing save file preserves applied schema and seeded data", () => {
    const dbPath = tempDbPath("reopen");
    openedPaths.push(dbPath);

    const first = openDatabase(dbPath);
    runMigrations(first);
    seedAccounts(first, new SystemClock());
    const accountIdBefore = new AccountRepository(first).findBySlot("A")?.accountId;
    first.close();

    const second = openDatabase(dbPath);
    runMigrations(second); // no-op; must not fail or re-create tables
    expect(currentSchemaVersion(second)).toBe(2);
    const accountIdAfter = new AccountRepository(second).findBySlot("A")?.accountId;
    expect(accountIdAfter).toBe(accountIdBefore);
    second.close();
  });
});
