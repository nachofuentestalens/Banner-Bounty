import type { DatabaseSync } from "node:sqlite";
import type { Hero } from "@banner-and-bounty/contracts";

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
      .prepare("SELECT * FROM heroes WHERE accountId = ?")
      .all(accountId) as unknown as HeroRow[];
    return rows.map(toHero);
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
