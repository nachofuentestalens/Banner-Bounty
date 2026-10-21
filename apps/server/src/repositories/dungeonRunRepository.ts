import type { DatabaseSync } from "node:sqlite";
import type { DungeonOutcome, ExpeditionStatus } from "@banner-and-bounty/contracts";

export interface DungeonRunRow {
  accountId: string;
  status: ExpeditionStatus;
  dungeonId: string | null;
  startedAt: string | null;
  checkpointAt: string | null;
  currentFloor: number;
  floorsCleared: number;
  frozenLoadout: unknown | null;
  rulesVersion: number | null;
  combatSeedBase: number | null;
  rngState: string | null;
  outcome: DungeonOutcome;
}

interface DungeonRunTableRow extends Omit<DungeonRunRow, "frozenLoadout"> {
  frozenLoadout: string | null;
}

export class DungeonRunRepository {
  constructor(private readonly db: DatabaseSync) {}

  find(accountId: string): DungeonRunRow | null {
    const row = this.db.prepare("SELECT * FROM dungeon_runs WHERE accountId = ?").get(accountId) as DungeonRunTableRow | undefined;
    if (!row) return null;
    return { ...row, frozenLoadout: row.frozenLoadout ? JSON.parse(row.frozenLoadout) : null };
  }

  isActive(accountId: string): boolean {
    return this.find(accountId)?.status === "active";
  }

  start(row: {
    accountId: string;
    dungeonId: string;
    startedAt: string;
    frozenLoadout: unknown;
    rulesVersion: number;
    combatSeedBase: number;
    rngState: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO dungeon_runs (accountId, status, dungeonId, startedAt, checkpointAt, currentFloor, floorsCleared, frozenLoadout, rulesVersion, combatSeedBase, rngState, outcome)
         VALUES (?, 'active', ?, ?, ?, 1, 0, ?, ?, ?, ?, 'none')
         ON CONFLICT(accountId) DO UPDATE SET
           status = 'active', dungeonId = excluded.dungeonId, startedAt = excluded.startedAt, checkpointAt = excluded.checkpointAt,
           currentFloor = 1, floorsCleared = 0, frozenLoadout = excluded.frozenLoadout, rulesVersion = excluded.rulesVersion,
           combatSeedBase = excluded.combatSeedBase, rngState = excluded.rngState, outcome = 'none'`,
      )
      .run(row.accountId, row.dungeonId, row.startedAt, row.startedAt, JSON.stringify(row.frozenLoadout), row.rulesVersion, row.combatSeedBase, row.rngState);
  }

  applyBatch(
    accountId: string,
    update: { checkpointAt: string; rngState: string; currentFloor: number; floorsClearedDelta: number; outcome: DungeonOutcome; status: ExpeditionStatus },
  ): void {
    this.db
      .prepare(
        `UPDATE dungeon_runs
           SET checkpointAt = ?, rngState = ?, currentFloor = ?, floorsCleared = floorsCleared + ?, outcome = ?, status = ?
         WHERE accountId = ? AND status = 'active'`,
      )
      .run(update.checkpointAt, update.rngState, update.currentFloor, update.floorsClearedDelta, update.outcome, update.status, accountId);
  }

  stop(accountId: string): void {
    this.db.prepare("UPDATE dungeon_runs SET status = 'none' WHERE accountId = ?").run(accountId);
  }
}
