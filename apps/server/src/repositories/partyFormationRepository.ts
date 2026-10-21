import type { DatabaseSync } from "node:sqlite";
import type { HeroId, PartyFormation } from "@banner-and-bounty/contracts";

interface FormationRow {
  accountId: string;
  slot0: string | null;
  slot1: string | null;
  slot2: string | null;
  slot3: string | null;
  slot4: string | null;
}

function toFormation(row: FormationRow): PartyFormation {
  return { accountId: row.accountId, slots: [row.slot0, row.slot1, row.slot2, row.slot3, row.slot4] };
}

export class PartyFormationRepository {
  constructor(private readonly db: DatabaseSync) {}

  find(accountId: string): PartyFormation | null {
    const row = this.db
      .prepare("SELECT * FROM party_formations WHERE accountId = ?")
      .get(accountId) as FormationRow | undefined;
    return row ? toFormation(row) : null;
  }

  insertIfMissing(accountId: string, slots: PartyFormation["slots"]): void {
    this.db
      .prepare("INSERT OR IGNORE INTO party_formations (accountId, slot0, slot1, slot2, slot3, slot4) VALUES (?, ?, ?, ?, ?, ?)")
      .run(accountId, slots[0], slots[1], slots[2], slots[3], slots[4]);
  }

  upsert(accountId: string, slots: PartyFormation["slots"]): void {
    this.db
      .prepare(
        `INSERT INTO party_formations (accountId, slot0, slot1, slot2, slot3, slot4)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(accountId) DO UPDATE SET slot0 = excluded.slot0, slot1 = excluded.slot1, slot2 = excluded.slot2, slot3 = excluded.slot3, slot4 = excluded.slot4`,
      )
      .run(accountId, slots[0], slots[1], slots[2], slots[3], slots[4]);
  }

  /** Every non-null hero currently in the formation, in slot order. */
  filledHeroIds(formation: PartyFormation): HeroId[] {
    return formation.slots.filter((s): s is string => s !== null);
  }
}
