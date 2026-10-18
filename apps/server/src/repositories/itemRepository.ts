import type { DatabaseSync } from "node:sqlite";
import type { ItemInstance } from "@banner-and-bounty/contracts";

interface ItemRow {
  seq: number;
  itemInstanceId: string;
  accountId: string;
  definitionId: string;
  affixId: string | null;
  equippedBy: string | null;
  createdAt: string;
}

function toItem(row: ItemRow): ItemInstance {
  return {
    itemInstanceId: row.itemInstanceId,
    accountId: row.accountId,
    definitionId: row.definitionId,
    affixId: row.affixId,
    equippedBy: row.equippedBy,
  };
}

export class ItemRepository {
  constructor(private readonly db: DatabaseSync) {}

  listByAccount(accountId: string): ItemInstance[] {
    const rows = this.db
      .prepare("SELECT * FROM item_instances WHERE accountId = ? ORDER BY seq")
      .all(accountId) as unknown as ItemRow[];
    return rows.map(toItem);
  }

  /** Any account's item; callers compare accountId to tell not_found from forbidden. */
  findById(itemInstanceId: string): ItemInstance | null {
    const row = this.db
      .prepare("SELECT * FROM item_instances WHERE itemInstanceId = ?")
      .get(itemInstanceId) as ItemRow | undefined;
    return row ? toItem(row) : null;
  }

  /** Overflow cap counts unequipped instances only (baseline.md 6). */
  countUnequipped(accountId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM item_instances WHERE accountId = ? AND equippedBy IS NULL")
      .get(accountId) as { n: number };
    return row.n;
  }

  insert(item: ItemInstance, createdAt: string): void {
    this.db
      .prepare(
        `INSERT INTO item_instances (itemInstanceId, accountId, definitionId, affixId, equippedBy, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(item.itemInstanceId, item.accountId, item.definitionId, item.affixId, item.equippedBy, createdAt);
  }

  setEquippedBy(itemInstanceId: string, heroId: string | null): void {
    this.db.prepare("UPDATE item_instances SET equippedBy = ? WHERE itemInstanceId = ?").run(heroId, itemInstanceId);
  }
}
