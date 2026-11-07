import type { DatabaseSync } from "node:sqlite";

export interface SettlementAggregateRow {
  aggregateId: string;
  accountId: string;
  runId: string;
  fromOrdinal: number;
  toOrdinal: number;
  fromSequence: number;
  toSequence: number;
  wins: number;
  losses: number;
  elapsedMs: number;
  creditedMs: number;
  discardedMs: number;
  rewards: { xp: number; gold: number; items: unknown[] };
  createdAt: string;
}

// design/studio/contracts.md M3-05 addition section 6: written once per
// settlement call that evicts a full report out of the 50-report window;
// retain latest 20/account, evicting the oldest on the 21st insert. Never
// updated after insert.
export class SettlementAggregateRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(row: SettlementAggregateRow): void {
    this.db
      .prepare(
        `INSERT INTO settlement_aggregates
          (aggregateId, accountId, runId, fromOrdinal, toOrdinal, fromSequence, toSequence, wins, losses, elapsedMs, creditedMs, discardedMs, rewards, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.aggregateId,
        row.accountId,
        row.runId,
        row.fromOrdinal,
        row.toOrdinal,
        row.fromSequence,
        row.toSequence,
        row.wins,
        row.losses,
        row.elapsedMs,
        row.creditedMs,
        row.discardedMs,
        JSON.stringify(row.rewards),
        row.createdAt,
      );
    this.evictBeyond(row.accountId, 20);
  }

  private evictBeyond(accountId: string, keepLatest: number): void {
    this.db
      .prepare(
        `DELETE FROM settlement_aggregates WHERE accountId = ? AND aggregateId NOT IN (
           SELECT aggregateId FROM settlement_aggregates WHERE accountId = ? ORDER BY createdAt DESC LIMIT ?
         )`,
      )
      .run(accountId, accountId, keepLatest);
  }

  /** The most recent aggregate covering (or immediately preceding) a given sequence, for feed "missing range" coverage. */
  findCovering(accountId: string, fromSequenceAtMost: number): SettlementAggregateRow | null {
    const row = this.db
      .prepare(
        `SELECT * FROM settlement_aggregates WHERE accountId = ? AND toSequence >= ? ORDER BY toSequence ASC LIMIT 1`,
      )
      .get(accountId, fromSequenceAtMost) as (Omit<SettlementAggregateRow, "rewards"> & { rewards: string }) | undefined;
    if (!row) return null;
    return { ...row, rewards: JSON.parse(row.rewards) };
  }
}
