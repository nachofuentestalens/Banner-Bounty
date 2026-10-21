import type { DatabaseSync } from "node:sqlite";
import type { Account, AccountSlot } from "@banner-and-bounty/contracts";

interface AccountRow {
  accountId: string;
  displayName: string;
  createdAt: string;
  slot: string | null;
  revision: number;
}

function toAccount(row: AccountRow): Account {
  return { accountId: row.accountId, displayName: row.displayName, createdAt: row.createdAt };
}

export class AccountRepository {
  constructor(private readonly db: DatabaseSync) {}

  findBySlot(slot: AccountSlot): Account | null {
    const row = this.db
      .prepare("SELECT * FROM accounts WHERE slot = ?")
      .get(slot) as AccountRow | undefined;
    return row ? toAccount(row) : null;
  }

  findById(accountId: string): Account | null {
    const row = this.db
      .prepare("SELECT * FROM accounts WHERE accountId = ?")
      .get(accountId) as AccountRow | undefined;
    return row ? toAccount(row) : null;
  }

  getRevision(accountId: string): number {
    const row = this.db
      .prepare("SELECT revision FROM accounts WHERE accountId = ?")
      .get(accountId) as { revision: number } | undefined;
    if (!row) throw new Error(`unknown accountId ${accountId}`);
    return row.revision;
  }

  setRevision(accountId: string, revision: number): void {
    this.db.prepare("UPDATE accounts SET revision = ? WHERE accountId = ?").run(
      revision,
      accountId,
    );
  }

  getGold(accountId: string): number {
    const row = this.db.prepare("SELECT gold FROM accounts WHERE accountId = ?").get(accountId) as
      | { gold: number }
      | undefined;
    if (!row) throw new Error(`unknown accountId ${accountId}`);
    return row.gold;
  }

  addGold(accountId: string, amount: number): void {
    this.db.prepare("UPDATE accounts SET gold = gold + ? WHERE accountId = ?").run(amount, accountId);
  }

  spendGold(accountId: string, amount: number): void {
    this.db.prepare("UPDATE accounts SET gold = gold - ? WHERE accountId = ?").run(amount, accountId);
  }

  getSelectedAreaId(accountId: string): string {
    const row = this.db.prepare("SELECT selectedAreaId FROM accounts WHERE accountId = ?").get(accountId) as
      | { selectedAreaId: string }
      | undefined;
    if (!row) throw new Error(`unknown accountId ${accountId}`);
    return row.selectedAreaId;
  }

  setSelectedAreaId(accountId: string, areaId: string): void {
    this.db.prepare("UPDATE accounts SET selectedAreaId = ? WHERE accountId = ?").run(areaId, accountId);
  }

  getMaterials(accountId: string): { scrap: number; sigil: number; core: number } {
    const row = this.db
      .prepare("SELECT materialScrap AS scrap, materialSigil AS sigil, materialCore AS core FROM accounts WHERE accountId = ?")
      .get(accountId) as { scrap: number; sigil: number; core: number } | undefined;
    if (!row) throw new Error(`unknown accountId ${accountId}`);
    return row;
  }

  addMaterials(accountId: string, delta: { scrap: number; sigil: number; core: number }): void {
    this.db
      .prepare("UPDATE accounts SET materialScrap = materialScrap + ?, materialSigil = materialSigil + ?, materialCore = materialCore + ? WHERE accountId = ?")
      .run(delta.scrap, delta.sigil, delta.core, accountId);
  }

  spendMaterials(accountId: string, cost: { scrap: number; sigil: number; core: number }): void {
    this.db
      .prepare("UPDATE accounts SET materialScrap = materialScrap - ?, materialSigil = materialSigil - ?, materialCore = materialCore - ? WHERE accountId = ?")
      .run(cost.scrap, cost.sigil, cost.core, accountId);
  }

  insertSeed(accountId: string, displayName: string, slot: AccountSlot, createdAt: string): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO accounts (accountId, displayName, createdAt, slot, revision) VALUES (?, ?, ?, ?, 0)",
      )
      .run(accountId, displayName, createdAt, slot);
  }
}
