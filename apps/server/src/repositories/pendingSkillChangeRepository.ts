import type { DatabaseSync } from "node:sqlite";

export type PendingSkillChangeStatus = "pending" | "applied" | "discarded";

export interface PendingSkillChangeRow {
  accountId: string;
  heroId: string;
  requestId: string;
  acceptedAt: string;
  boundaryOrdinal: number;
  runId: string;
  active: readonly [string, string];
  passive: readonly [string, string];
  status: PendingSkillChangeStatus;
  appliedAt: string | null;
}

interface PendingSkillChangeTableRow extends Omit<PendingSkillChangeRow, "active" | "passive"> {
  active: string;
  passive: string;
}

function toRow(row: PendingSkillChangeTableRow): PendingSkillChangeRow {
  return { ...row, active: JSON.parse(row.active), passive: JSON.parse(row.passive) };
}

// design/studio/contracts.md M3-05 addition section 3/5: at most one
// status="pending" row per (accountId, heroId) at a time; a new queue
// request for the same hero overwrites it in place ("last committed edit
// wins per hero"). Applied/discarded rows are kept as immutable history.
export class PendingSkillChangeRepository {
  constructor(private readonly db: DatabaseSync) {}

  findPendingForHero(accountId: string, heroId: string): PendingSkillChangeRow | null {
    const row = this.db
      .prepare("SELECT * FROM pending_skill_changes WHERE accountId = ? AND heroId = ? AND status = 'pending'")
      .get(accountId, heroId) as PendingSkillChangeTableRow | undefined;
    return row ? toRow(row) : null;
  }

  /** Most recent row for this hero regardless of status — used by cancel to distinguish "never queued" from "already applied" (contracts.md section 5). */
  findMostRecentForHero(accountId: string, heroId: string): PendingSkillChangeRow | null {
    const row = this.db
      .prepare("SELECT * FROM pending_skill_changes WHERE accountId = ? AND heroId = ? ORDER BY acceptedAt DESC LIMIT 1")
      .get(accountId, heroId) as PendingSkillChangeTableRow | undefined;
    return row ? toRow(row) : null;
  }

  /** Every still-pending row for this account's run, used by the settlement walk's boundary-apply hook. */
  listPendingForRun(accountId: string, runId: string): PendingSkillChangeRow[] {
    const rows = this.db
      .prepare("SELECT * FROM pending_skill_changes WHERE accountId = ? AND runId = ? AND status = 'pending'")
      .all(accountId, runId) as unknown as PendingSkillChangeTableRow[];
    return rows.map(toRow);
  }

  /** "Overwrites it in place": discard any prior pending row for this hero, then insert the new one, in the caller's transaction. */
  upsertPending(row: PendingSkillChangeRow): void {
    this.db
      .prepare("UPDATE pending_skill_changes SET status = 'discarded' WHERE accountId = ? AND heroId = ? AND status = 'pending'")
      .run(row.accountId, row.heroId);
    this.db
      .prepare(
        `INSERT INTO pending_skill_changes (accountId, heroId, requestId, acceptedAt, boundaryOrdinal, runId, active, passive, status, appliedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL)`,
      )
      .run(row.accountId, row.heroId, row.requestId, row.acceptedAt, row.boundaryOrdinal, row.runId, JSON.stringify(row.active), JSON.stringify(row.passive));
  }

  markApplied(accountId: string, heroId: string, requestId: string, appliedAt: string): void {
    this.db
      .prepare(
        "UPDATE pending_skill_changes SET status = 'applied', appliedAt = ? WHERE accountId = ? AND heroId = ? AND requestId = ? AND status = 'pending'",
      )
      .run(appliedAt, accountId, heroId, requestId);
  }

  markDiscarded(accountId: string, heroId: string, requestId: string): void {
    this.db
      .prepare("UPDATE pending_skill_changes SET status = 'discarded' WHERE accountId = ? AND heroId = ? AND requestId = ? AND status = 'pending'")
      .run(accountId, heroId, requestId);
  }

  /** `/expedition/stop`: discard every unconsumed pending row for this account's heroes in the given run. */
  discardAllPendingForRun(accountId: string, runId: string): PendingSkillChangeRow[] {
    const pending = this.listPendingForRun(accountId, runId);
    for (const row of pending) this.markDiscarded(row.accountId, row.heroId, row.requestId);
    return pending;
  }
}
