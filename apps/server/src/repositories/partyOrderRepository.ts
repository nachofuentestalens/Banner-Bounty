import type { DatabaseSync } from "node:sqlite";
import type { HeroId, PartyOrder } from "@banner-and-bounty/contracts";

interface PartyOrderRow {
  accountId: string;
  hero1: string;
  hero2: string;
  hero3: string;
}

export class PartyOrderRepository {
  constructor(private readonly db: DatabaseSync) {}

  find(accountId: string): PartyOrder | null {
    const row = this.db
      .prepare("SELECT * FROM party_orders WHERE accountId = ?")
      .get(accountId) as PartyOrderRow | undefined;
    if (!row) return null;
    return { accountId: row.accountId, order: [row.hero1, row.hero2, row.hero3] };
  }

  upsert(accountId: string, order: [HeroId, HeroId, HeroId]): void {
    this.db
      .prepare(
        `INSERT INTO party_orders (accountId, hero1, hero2, hero3)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(accountId) DO UPDATE SET hero1 = excluded.hero1, hero2 = excluded.hero2, hero3 = excluded.hero3`,
      )
      .run(accountId, order[0], order[1], order[2]);
  }
}
