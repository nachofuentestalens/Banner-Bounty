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
  };
}

// Insert-only: a BattleReport is immutable once created (contracts.md
// entity list), matching TeamSnapshot's insert-only convention.
export class BattleReportRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(row: BattleReportRow): void {
    this.db
      .prepare(
        `INSERT INTO battle_reports
          (reportId, accountId, kind, participantsSnapshot, seed, rulesVersion, events, result, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      );
  }

  /** Ownership check inlined in the query: a foreign report ID returns null, same as a missing one (contracts.md not_found decision). */
  findOwnedBy(reportId: string, accountId: string): BattleReportRow | null {
    const row = this.db
      .prepare("SELECT * FROM battle_reports WHERE reportId = ? AND accountId = ?")
      .get(reportId, accountId) as BattleReportTableRow | undefined;
    return row ? toReport(row) : null;
  }
}
