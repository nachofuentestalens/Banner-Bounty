import type { DatabaseSync } from "node:sqlite";
import type { EquipmentSlot, Hero } from "@banner-and-bounty/contracts";

const SLOT_COLUMN: Record<EquipmentSlot, string> = {
  weapon: "equipmentWeapon",
  armor: "equipmentArmor",
  trinket: "equipmentTrinket",
};

interface HeroRow {
  heroId: string;
  accountId: string;
  classId: string;
  level: number;
  xp: number;
  specializationId: string | null;
  equipmentWeapon: string | null;
  equipmentArmor: string | null;
  equipmentTrinket: string | null;
}

function toHero(row: HeroRow): Hero {
  return {
    heroId: row.heroId,
    accountId: row.accountId,
    classId: row.classId,
    level: row.level,
    xp: row.xp,
    specializationId: row.specializationId,
    equipment: {
      weapon: row.equipmentWeapon,
      armor: row.equipmentArmor,
      trinket: row.equipmentTrinket,
    },
  };
}

export class HeroRepository {
  constructor(private readonly db: DatabaseSync) {}

  listByAccount(accountId: string): Hero[] {
    const rows = this.db
      .prepare("SELECT * FROM heroes WHERE accountId = ? ORDER BY rowid")
      .all(accountId) as unknown as HeroRow[];
    return rows.map(toHero);
  }

  /** Any account's hero; callers compare accountId to tell not_found from forbidden. */
  findById(heroId: string): Hero | null {
    const row = this.db.prepare("SELECT * FROM heroes WHERE heroId = ?").get(heroId) as HeroRow | undefined;
    return row ? toHero(row) : null;
  }

  setEquipmentSlot(heroId: string, slot: EquipmentSlot, itemInstanceId: string | null): void {
    this.db.prepare(`UPDATE heroes SET ${SLOT_COLUMN[slot]} = ? WHERE heroId = ?`).run(itemInstanceId, heroId);
  }

  setSpecialization(heroId: string, specializationId: string | null): void {
    this.db.prepare("UPDATE heroes SET specializationId = ? WHERE heroId = ?").run(specializationId, heroId);
  }

  setLevelXp(heroId: string, level: number, xp: number): void {
    this.db.prepare("UPDATE heroes SET level = ?, xp = ? WHERE heroId = ?").run(level, xp, heroId);
  }

  /** Starter roster seeding: idempotent on a fixed heroId. */
  insertIfMissing(hero: Pick<Hero, "heroId" | "accountId" | "classId">): void {
    this.db
      .prepare("INSERT OR IGNORE INTO heroes (heroId, accountId, classId, level, xp) VALUES (?, ?, ?, 1, 0)")
      .run(hero.heroId, hero.accountId, hero.classId);
  }

  /** Ownership check: the hero must exist and belong to the given account. */
  ownedBy(heroId: string, accountId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM heroes WHERE heroId = ? AND accountId = ?")
      .get(heroId, accountId);
    return row !== undefined;
  }

  insertForFixture(hero: Hero): void {
    this.db
      .prepare(
        `INSERT INTO heroes
          (heroId, accountId, classId, level, xp, specializationId, equipmentWeapon, equipmentArmor, equipmentTrinket)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        hero.heroId,
        hero.accountId,
        hero.classId,
        hero.level,
        hero.xp,
        hero.specializationId,
        hero.equipment.weapon,
        hero.equipment.armor,
        hero.equipment.trinket,
      );
  }
}
