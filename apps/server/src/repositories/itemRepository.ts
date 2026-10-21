import type { DatabaseSync } from "node:sqlite";
import type { AffixInstance, ItemInstance, RarityId } from "@banner-and-bounty/contracts";

interface ItemRow {
  seq: number;
  itemInstanceId: string;
  accountId: string;
  definitionId: string;
  rarityId: RarityId;
  affixes: string;
  equippedBy: string | null;
  createdAt: string;
}

function toItem(row: ItemRow): ItemInstance {
  return {
    itemInstanceId: row.itemInstanceId,
    accountId: row.accountId,
    definitionId: row.definitionId,
    rarityId: row.rarityId,
    affixes: JSON.parse(row.affixes) as AffixInstance[],
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

  /** Overflow cap counts unequipped instances only (baseline.md 6 / gear.md section 4). */
  countUnequipped(accountId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM item_instances WHERE accountId = ? AND equippedBy IS NULL")
      .get(accountId) as { n: number };
    return row.n;
  }

  insert(item: ItemInstance, createdAt: string): void {
    this.db
      .prepare(
        `INSERT INTO item_instances (itemInstanceId, accountId, definitionId, rarityId, affixes, equippedBy, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(item.itemInstanceId, item.accountId, item.definitionId, item.rarityId, JSON.stringify(item.affixes), item.equippedBy, createdAt);
  }

  setEquippedBy(itemInstanceId: string, heroId: string | null): void {
    this.db.prepare("UPDATE item_instances SET equippedBy = ? WHERE itemInstanceId = ?").run(heroId, itemInstanceId);
  }

  setAffixes(itemInstanceId: string, affixes: readonly AffixInstance[]): void {
    this.db.prepare("UPDATE item_instances SET affixes = ? WHERE itemInstanceId = ?").run(JSON.stringify(affixes), itemInstanceId);
  }

  delete(itemInstanceId: string): void {
    this.db.prepare("DELETE FROM item_instances WHERE itemInstanceId = ?").run(itemInstanceId);
  }
}
