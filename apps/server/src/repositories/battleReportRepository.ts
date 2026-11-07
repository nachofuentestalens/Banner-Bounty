import type { DatabaseSync } from "node:sqlite";
import type { BattleReportKind } from "@banner-and-bounty/contracts";

export interface BattleReportRow {
  reportId: string;
  accountId: string;
  kind: BattleReportKind;
  participantsSnapshot: unknown;
  seed: string;
  rulesVersion: number;
  events: unknown[];
  result: unknown;
  createdAt: string;
  // M3-05 addition (section 2): valid only for kind="pve" rows produced by
  // the variable-duration settlement walk; null on every pre-M3/legacy row.
  ordinal: number | null;
  runId: string | null;
  completionSequence: number | null;
  nominalDurationMs: number | null;
  creditedAt: string | null;
  rewards: { xp: number; gold: number; items: unknown[] } | null;
}

interface BattleReportTableRow {
  reportId: string;
  accountId: string;
  kind: string;
  participantsSnapshot: string;
  seed: string;
  rulesVersion: number;
  events: string;
  result: string;
  createdAt: string;
  ordinal: number | null;
  runId: string | null;
  completionSequence: number | null;
  nominalDurationMs: number | null;
  creditedAt: string | null;
  rewards: string | null;
}

function toReport(row: BattleReportTableRow): BattleReportRow {
  return {
    reportId: row.reportId,
    accountId: row.accountId,
    kind: row.kind as BattleReportKind,
    participantsSnapshot: JSON.parse(row.participantsSnapshot),
    seed: row.seed,
    rulesVersion: row.rulesVersion,
    events: JSON.parse(row.events),
    result: JSON.parse(row.result),
    createdAt: row.createdAt,
    ordinal: row.ordinal,
    runId: row.runId,
    completionSequence: row.completionSequence,
    nominalDurationMs: row.nominalDurationMs,
    creditedAt: row.creditedAt,
    rewards: row.rewards ? JSON.parse(row.rewards) : null,
  };
}

// Insert-only for every field except the one-time creditedAt/rewards
// transition (contracts.md M3-05 addition section 2: "the one field group
// this document permits to be written by an UPDATE rather than only at
// INSERT"). Every other field, including for "pve" v3 rows, is fixed at
// INSERT, preserving the pre-M3 "immutable once created" invariant for
// combat outcomes.
export class BattleReportRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(row: Partial<Pick<BattleReportRow, "ordinal" | "runId" | "completionSequence" | "nominalDurationMs" | "creditedAt" | "rewards">> & Omit<BattleReportRow, "ordinal" | "runId" | "completionSequence" | "nominalDurationMs" | "creditedAt" | "rewards">): void {
    this.db
      .prepare(
        `INSERT INTO battle_reports
          (reportId, accountId, kind, participantsSnapshot, seed, rulesVersion, events, result, createdAt, ordinal, runId, completionSequence, nominalDurationMs, creditedAt, rewards)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.reportId,
        row.accountId,
        row.kind,
        JSON.stringify(row.participantsSnapshot),
        row.seed,
        row.rulesVersion,
        JSON.stringify(row.events),
        JSON.stringify(row.result),
        row.createdAt,
        row.ordinal ?? null,
        row.runId ?? null,
        row.completionSequence ?? null,
        row.nominalDurationMs ?? null,
        row.creditedAt ?? null,
        row.rewards ? JSON.stringify(row.rewards) : null,
      );
  }

  /** Ownership check inlined in the query: a foreign report ID returns null, same as a missing one (contracts.md not_found decision). */
  findOwnedBy(reportId: string, accountId: string): BattleReportRow | null {
    const row = this.db
      .prepare("SELECT * FROM battle_reports WHERE reportId = ? AND accountId = ?")
      .get(reportId, accountId) as BattleReportTableRow | undefined;
    return row ? toReport(row) : null;
  }

  /** The one-time creditedAt/rewards transition (section 2's narrow exception), guarded by the caller only ever calling this once per reportId. */
  credit(reportId: string, creditedAt: string, rewards: { xp: number; gold: number; items: unknown[] }): void {
    this.db
      .prepare("UPDATE battle_reports SET creditedAt = ?, rewards = ? WHERE reportId = ? AND creditedAt IS NULL")
      .run(creditedAt, JSON.stringify(rewards), reportId);
  }

  /** Feed page: full reports strictly after `afterSequence`, oldest-first, this account's own v3 pve rows only (section 6). */
  listFeedPage(accountId: string, afterSequence: number, limit: number): BattleReportRow[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM battle_reports
         WHERE accountId = ? AND kind = 'pve' AND completionSequence IS NOT NULL AND completionSequence > ?
         ORDER BY completionSequence ASC LIMIT ?`,
      )
      .all(accountId, afterSequence, limit) as unknown as BattleReportTableRow[];
    return rows.map(toReport);
  }

  retainedSequenceBounds(accountId: string): { oldest: number | null; newest: number | null; count: number } {
    const row = this.db
      .prepare(
        `SELECT MIN(completionSequence) AS oldest, MAX(completionSequence) AS newest, COUNT(*) AS count
         FROM battle_reports WHERE accountId = ? AND kind = 'pve' AND completionSequence IS NOT NULL`,
      )
      .get(accountId) as { oldest: number | null; newest: number | null; count: number };
    return row;
  }

  /** Retention policy (section 6): the oldest full v3 pve report by completionSequence beyond `keepLatest`, if any. */
  oldestBeyondRetention(accountId: string, keepLatest: number): BattleReportRow | null {
    const row = this.db
      .prepare(
        `SELECT * FROM battle_reports
         WHERE accountId = ? AND kind = 'pve' AND completionSequence IS NOT NULL
         ORDER BY completionSequence ASC LIMIT 1 OFFSET 0`,
      )
      .get(accountId) as BattleReportTableRow | undefined;
    if (!row) return null;
    const bounds = this.retainedSequenceBounds(accountId);
    return bounds.count > keepLatest ? toReport(row) : null;
  }

  deleteByReportId(reportId: string): void {
    this.db.prepare("DELETE FROM battle_reports WHERE reportId = ?").run(reportId);
  }
}
