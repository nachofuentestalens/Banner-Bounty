import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { AppError } from "./errors.js";
import { AccountRepository } from "./repositories/accountRepository.js";
import { IdempotencyRepository } from "./repositories/idempotencyRepository.js";

// Implements the single canonical transaction order from
// design/studio/contracts.md "Revision & idempotency protocol" (steps 1-8),
// generically, so every mutating endpoint reuses one tested code path rather
// than re-implementing the ordering/receipt/revision rules per-route.
export interface MutationRequest {
  accountId: string;
  command: string;
  requestId: string;
  expectedRevision: number;
  /** Normalized payload used only to detect a reused requestId with different data. */
  fingerprintPayload: unknown;
}

export interface MutationOutcome<TResult> {
  /** Throw AppError for forbidden/validation/not_found/active_expedition. */
  precondition?: () => void;
  /** Applies the state change; `changed` controls whether revision increments. */
  apply: () => { result: TResult; changed: boolean };
}

export interface MutationResult<TResult> {
  result: TResult;
  revision: number;
  replayed: boolean;
}

function fingerprint(command: string, payload: unknown): string {
  return crypto
    .createHash("sha256")
    .update(command)
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function runMutation<TResult>(
  db: DatabaseSync,
  request: MutationRequest,
  outcome: MutationOutcome<TResult>,
): MutationResult<TResult> {
  const accounts = new AccountRepository(db);
  const receipts = new IdempotencyRepository(db);
  const fp = fingerprint(request.command, request.fingerprintPayload);

  db.exec("BEGIN IMMEDIATE;");
  try {
    // Step 2: idempotency lookup always runs first.
    const existing = receipts.find(request.accountId, request.command, request.requestId);
    if (existing) {
      if (existing.fingerprint !== fp) {
        throw new AppError("conflict", "requestId reused with a different payload", {
          currentRevision: accounts.getRevision(request.accountId),
        });
      }
      db.exec("COMMIT;");
      return {
        result: JSON.parse(existing.resultPayload) as TResult,
        revision: existing.resultRevision,
        replayed: true,
      };
    }

    // Step 3: ownership/precondition checks.
    outcome.precondition?.();

    // Step 4: revision check.
    const currentRevision = accounts.getRevision(request.accountId);
    if (request.expectedRevision !== currentRevision) {
      throw new AppError("conflict", "stale expectedRevision", { currentRevision });
    }

    // Step 5: apply the mutation.
    const { result, changed } = outcome.apply();

    // Step 6: conditional revision increment.
    const newRevision = changed ? currentRevision + 1 : currentRevision;
    if (changed) accounts.setRevision(request.accountId, newRevision);

    // Step 7: insert the receipt in the same transaction.
    receipts.insert({
      accountId: request.accountId,
      command: request.command,
      requestId: request.requestId,
      fingerprint: fp,
      resultPayload: JSON.stringify(result),
      resultRevision: newRevision,
    });

    // Step 8: commit.
    db.exec("COMMIT;");
    return { result, revision: newRevision, replayed: false };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}
