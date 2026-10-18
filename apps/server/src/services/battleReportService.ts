import type { DatabaseSync } from "node:sqlite";
import { AppError } from "../errors.js";
import { BattleReportRepository } from "../repositories/battleReportRepository.js";

// contracts.md's BattleReport entity has no accountId field (ownership is a
// server-internal concern, resolved from the session, not echoed back).
export interface BattleReportDTO {
  reportId: string;
  kind: string;
  participantsSnapshot: unknown;
  seed: string;
  rulesVersion: number;
  events: unknown[];
  result: unknown;
  createdAt: string;
}

// GET /battle-reports/:reportId (contracts.md): a report that does not
// exist and a report that belongs to a different account both return
// not_found with the same message — the deliberate ID-enumeration-safe
// departure from `forbidden` recorded in contracts.md.
export function getOwnedReport(db: DatabaseSync, accountId: string, reportId: string): BattleReportDTO {
  const row = new BattleReportRepository(db).findOwnedBy(reportId, accountId);
  if (!row) throw new AppError("not_found", "battle report not found");
  const { accountId: _accountId, ...dto } = row;
  return dto;
}
