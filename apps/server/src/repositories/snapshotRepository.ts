import type { DatabaseSync } from "node:sqlite";

// Frozen at publish time (design/game/combat.md "effective stat computation
// order"), copied by value — never recomputed from the owning account's
// live heroes again. See services/arenaService.ts for the exact shape.
export interface SnapshotPartyEntry {
  heroId: string;
  position: number;
  classId: string;
  level: number;
  specializationId: string | null;
}

export interface SnapshotStatsEntry {
  heroId: string;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
}

export interface SnapshotRow {
  snapshotId: string;
  accountId: string;
  publishedAt: string;
  rulesVersion: number;
  frozenParty: SnapshotPartyEntry[];
  frozenStats: SnapshotStatsEntry[];
}

interface SnapshotTableRow {
  snapshotId: string;
  accountId: string;
  publishedAt: string;
  rulesVersion: number;
  frozenParty: string;
  frozenStats: string;
}

function toSnapshot(row: SnapshotTableRow): SnapshotRow {
  return {
    snapshotId: row.snapshotId,
    accountId: row.accountId,
    publishedAt: row.publishedAt,
    rulesVersion: row.rulesVersion,
    frozenParty: JSON.parse(row.frozenParty) as SnapshotPartyEntry[],
    frozenStats: JSON.parse(row.frozenStats) as SnapshotStatsEntry[],
  };
}

export class SnapshotRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(row: SnapshotRow): void {
    this.db
      .prepare(
        `INSERT INTO team_snapshots
          (snapshotId, accountId, publishedAt, rulesVersion, frozenParty, frozenStats)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.snapshotId,
        row.accountId,
        row.publishedAt,
        row.rulesVersion,
        JSON.stringify(row.frozenParty),
        JSON.stringify(row.frozenStats),
      );
  }

  findById(snapshotId: string): SnapshotRow | null {
    const row = this.db
      .prepare("SELECT * FROM team_snapshots WHERE snapshotId = ?")
      .get(snapshotId) as SnapshotTableRow | undefined;
    return row ? toSnapshot(row) : null;
  }

  /** Public listing (no live stats): newest first, optionally excluding one account's own snapshots. */
  listSummaries(excludeAccountId?: string): SnapshotRow[] {
    const rows = excludeAccountId
      ? (this.db
          .prepare("SELECT * FROM team_snapshots WHERE accountId != ? ORDER BY publishedAt DESC")
          .all(excludeAccountId) as unknown as SnapshotTableRow[])
      : (this.db
          .prepare("SELECT * FROM team_snapshots ORDER BY publishedAt DESC")
          .all() as unknown as SnapshotTableRow[]);
    return rows.map(toSnapshot);
  }
}
