import type { DatabaseSync } from "node:sqlite";

export interface IdempotencyReceiptRow {
  accountId: string;
  command: string;
  requestId: string;
  fingerprint: string;
  resultPayload: string;
  resultRevision: number;
  createdAt: string;
}

export class IdempotencyRepository {
  constructor(private readonly db: DatabaseSync) {}

  find(accountId: string, command: string, requestId: string): IdempotencyReceiptRow | null {
    const row = this.db
      .prepare(
        "SELECT * FROM idempotency_receipts WHERE accountId = ? AND command = ? AND requestId = ?",
      )
      .get(accountId, command, requestId) as IdempotencyReceiptRow | undefined;
    return row ?? null;
  }

  insert(row: Omit<IdempotencyReceiptRow, "createdAt"> & { createdAt?: string }): void {
    this.db
      .prepare(
        `INSERT INTO idempotency_receipts
          (accountId, command, requestId, fingerprint, resultPayload, resultRevision, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.accountId,
        row.command,
        row.requestId,
        row.fingerprint,
        row.resultPayload,
        row.resultRevision,
        row.createdAt ?? new Date().toISOString(),
      );
  }
}
