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
    expect(currentSchemaVersion(db)).toBe(4);
    db.close();
  });

  it("is idempotent: running twice does not fail or duplicate schema_version rows", () => {
    const db = openDatabase(":memory:");
    runMigrations(db);
    runMigrations(db);
    const rows = db.prepare("SELECT * FROM schema_version").all();
    expect(rows).toHaveLength(4);
    db.close();
  });

  it("upgrades an existing version-2 save to version 3 without losing accounts or heroes", () => {
    const dbPath = tempDbPath("upgrade");
    openedPaths.push(dbPath);

    const v2 = openDatabase(dbPath);
    runMigrations(v2, 2);
    v2.prepare("INSERT INTO accounts (accountId, displayName, createdAt, slot, revision) VALUES ('acc', 'Old Save', 't', 'A', 7)").run();
    v2.prepare("INSERT INTO heroes (heroId, accountId, classId, level, xp) VALUES ('h1', 'acc', 'class_ranger', 4, 12)").run();
    expect(currentSchemaVersion(v2)).toBe(2);
    v2.close();

    const v3 = openDatabase(dbPath);
    runMigrations(v3, 3);
    expect(currentSchemaVersion(v3)).toBe(3);
    expect(v3.prepare("SELECT revision, gold FROM accounts WHERE accountId = 'acc'").get()).toEqual({ revision: 7, gold: 0 });
    expect(v3.prepare("SELECT level, xp FROM heroes WHERE heroId = 'h1'").get()).toEqual({ level: 4, xp: 12 });
    expect(v3.prepare("SELECT COUNT(*) AS n FROM expeditions").get()).toEqual({ n: 0 });
    v3.close();
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
    expect(currentSchemaVersion(second)).toBe(4);
    const accountIdAfter = new AccountRepository(second).findBySlot("A")?.accountId;
    expect(accountIdAfter).toBe(accountIdBefore);
    second.close();
  });

  it("migrates a version-3 save's heroes/items/party to the M2-25 shape (migration steps 1-8)", () => {
    const dbPath = tempDbPath("m225-migrate");
    openedPaths.push(dbPath);

    const v3 = openDatabase(dbPath);
    runMigrations(v3, 3);
    v3.prepare("INSERT INTO accounts (accountId, displayName, createdAt, slot, revision, gold) VALUES ('acc', 'Old Save', 't', 'A', 0, 50)").run();
    v3.prepare(
      "INSERT INTO heroes (heroId, accountId, classId, level, xp, specializationId) VALUES ('h1', 'acc', 'class_ranger', 5, 10, 'spec_marksman')",
    ).run();
    v3.prepare("INSERT INTO heroes (heroId, accountId, classId, level, xp) VALUES ('h2', 'acc', 'class_vanguard', 1, 0)").run();
    v3.prepare("INSERT INTO heroes (heroId, accountId, classId, level, xp) VALUES ('h3', 'acc', 'class_arcanist', 1, 0)").run();
    v3.prepare("INSERT INTO party_orders (accountId, hero1, hero2, hero3) VALUES ('acc', 'h1', 'h2', 'h3')").run();
    v3.prepare(
      "INSERT INTO item_instances (itemInstanceId, accountId, definitionId, affixId, createdAt) VALUES ('i1', 'acc', 'item_weapon_shortsword', 'affix_of_power', 't')",
    ).run();
    v3.prepare(
      "INSERT INTO item_instances (itemInstanceId, accountId, definitionId, affixId, createdAt) VALUES ('i2', 'acc', 'item_armor_leather', NULL, 't')",
    ).run();
    v3.close();

    const v4 = openDatabase(dbPath);
    runMigrations(v4);
    expect(currentSchemaVersion(v4)).toBe(4);

    const hero = v4.prepare("SELECT primaryClassId, secondaryClassId, skillLoadout FROM heroes WHERE heroId = 'h1'").get() as {
      primaryClassId: string;
      secondaryClassId: string | null;
      skillLoadout: string;
    };
    expect(hero.primaryClassId).toBe("class_ranger");
    expect(hero.secondaryClassId).toBeNull();
    expect(JSON.parse(hero.skillLoadout)).toEqual({ active: ["aimed_shot", "volley"], passive: ["hunters_focus", ""] });

    const item1 = v4.prepare("SELECT rarityId, affixes FROM item_instances WHERE itemInstanceId = 'i1'").get() as {
      rarityId: string;
      affixes: string;
    };
    expect(item1.rarityId).toBe("uncommon");
    expect(JSON.parse(item1.affixes)).toEqual([{ affixId: "affix_of_power", value: 2 }]);

    const item2 = v4.prepare("SELECT rarityId, affixes FROM item_instances WHERE itemInstanceId = 'i2'").get() as {
      rarityId: string;
      affixes: string;
    };
    expect(item2.rarityId).toBe("common");
    expect(JSON.parse(item2.affixes)).toEqual([]);

    const formation = v4.prepare("SELECT slot0, slot1, slot2, slot3, slot4 FROM party_formations WHERE accountId = 'acc'").get();
    expect(formation).toEqual({ slot0: "h1", slot1: "h2", slot2: "h3", slot3: null, slot4: null });

    const dungeonRun = v4.prepare("SELECT status, outcome FROM dungeon_runs WHERE accountId = 'acc'").get();
    expect(dungeonRun).toEqual({ status: "none", outcome: "none" });

    const account = v4.prepare("SELECT selectedAreaId, materialScrap, materialSigil, materialCore FROM accounts WHERE accountId = 'acc'").get();
    expect(account).toEqual({ selectedAreaId: "area_old_road", materialScrap: 0, materialSigil: 0, materialCore: 0 });

    v4.close();
  });
});
