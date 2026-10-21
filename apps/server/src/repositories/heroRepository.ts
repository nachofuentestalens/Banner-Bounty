import type { DatabaseSync } from "node:sqlite";
import type { EquipmentSlot, Hero, SkillLoadout } from "@banner-and-bounty/contracts";

const SLOT_COLUMN: Record<EquipmentSlot, string> = {
  weapon: "equipmentWeapon",
  armor: "equipmentArmor",
  trinket: "equipmentTrinket",
};

interface HeroRow {
  heroId: string;
  accountId: string;
  primaryClassId: string;
  secondaryClassId: string | null;
  level: number;
  xp: number;
  skillLoadout: string;
  equipmentWeapon: string | null;
  equipmentArmor: string | null;
  equipmentTrinket: string | null;
}

function toHero(row: HeroRow): Hero {
  return {
    heroId: row.heroId,
    accountId: row.accountId,
    primaryClassId: row.primaryClassId,
    secondaryClassId: row.secondaryClassId,
    level: row.level,
    xp: row.xp,
    skillLoadout: JSON.parse(row.skillLoadout) as SkillLoadout,
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

  countByAccount(accountId: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM heroes WHERE accountId = ?").get(accountId) as { n: number };
    return row.n;
  }

  /** Any account's hero; callers compare accountId to tell not_found from forbidden. */
  findById(heroId: string): Hero | null {
    const row = this.db.prepare("SELECT * FROM heroes WHERE heroId = ?").get(heroId) as HeroRow | undefined;
    return row ? toHero(row) : null;
  }

  setEquipmentSlot(heroId: string, slot: EquipmentSlot, itemInstanceId: string | null): void {
    this.db.prepare(`UPDATE heroes SET ${SLOT_COLUMN[slot]} = ? WHERE heroId = ?`).run(itemInstanceId, heroId);
  }

  setSecondaryClass(heroId: string, secondaryClassId: string): void {
    this.db.prepare("UPDATE heroes SET secondaryClassId = ? WHERE heroId = ?").run(secondaryClassId, heroId);
  }

  setLoadout(heroId: string, loadout: SkillLoadout): void {
    this.db.prepare("UPDATE heroes SET skillLoadout = ? WHERE heroId = ?").run(JSON.stringify(loadout), heroId);
  }

  setLevelXp(heroId: string, level: number, xp: number): void {
    this.db.prepare("UPDATE heroes SET level = ?, xp = ? WHERE heroId = ?").run(level, xp, heroId);
  }

  /** Starter roster / recruit seeding: idempotent on a fixed heroId. */
  insert(hero: Pick<Hero, "heroId" | "accountId" | "primaryClassId" | "skillLoadout">): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO heroes (heroId, accountId, primaryClassId, level, xp, skillLoadout) VALUES (?, ?, ?, 1, 0, ?)",
      )
      .run(hero.heroId, hero.accountId, hero.primaryClassId, JSON.stringify(hero.skillLoadout));
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
          (heroId, accountId, primaryClassId, secondaryClassId, level, xp, skillLoadout, equipmentWeapon, equipmentArmor, equipmentTrinket)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        hero.heroId,
        hero.accountId,
        hero.primaryClassId,
        hero.secondaryClassId,
        hero.level,
        hero.xp,
        JSON.stringify(hero.skillLoadout),
        hero.equipment.weapon,
        hero.equipment.armor,
        hero.equipment.trinket,
      );
  }
}
