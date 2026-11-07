// design/studio/contracts.md M3-05 addition section 6: GET /expedition/feed.
// Read-only; never settles, grants or advances anything.
import type { DatabaseSync } from "node:sqlite";
import type { ExpeditionFeedResponseDTO, FeedEntryDTO } from "@banner-and-bounty/contracts";
import { BattleReportRepository } from "../repositories/battleReportRepository.js";
import { SettlementAggregateRepository } from "../repositories/settlementAggregateRepository.js";

export function getExpeditionFeed(db: DatabaseSync, accountId: string, afterSequence: number, limit: number): ExpeditionFeedResponseDTO {
  const reports = new BattleReportRepository(db);
  const aggregates = new SettlementAggregateRepository(db);
  const bounds = reports.retainedSequenceBounds(accountId);

  const entries: FeedEntryDTO[] = [];
  let missingRange: { from: number; to: number } | null = null;

  if (bounds.oldest !== null && afterSequence < bounds.oldest - 1) {
    // Contiguous walk through aggregates covering the gap (eviction always
    // evicts the oldest sequence first, so the gap is a single contiguous
    // range per contracts.md section 6).
    let cursor = afterSequence + 1;
    for (;;) {
      const aggregate = aggregates.findCovering(accountId, cursor);
      if (!aggregate || aggregate.fromSequence > cursor) break;
      entries.push({
        kind: "aggregate",
        aggregateId: aggregate.aggregateId,
        fromOrdinal: aggregate.fromOrdinal,
        toOrdinal: aggregate.toOrdinal,
        fromSequence: aggregate.fromSequence,
        toSequence: aggregate.toSequence,
        wins: aggregate.wins,
        losses: aggregate.losses,
        elapsedMs: aggregate.elapsedMs,
        creditedMs: aggregate.creditedMs,
        discardedMs: aggregate.discardedMs,
        rewards: aggregate.rewards as never,
      });
      cursor = aggregate.toSequence + 1;
      if (cursor > bounds.oldest - 1 || entries.length >= limit) break;
    }
    if (cursor <= bounds.oldest - 1) {
      missingRange = { from: cursor, to: bounds.oldest - 1 };
    }
  }

  const remaining = Math.max(0, limit - entries.length);
  if (remaining > 0) {
    const page = reports.listFeedPage(accountId, afterSequence, remaining);
    for (const row of page) {
      entries.push({
        kind: "battle",
        reportId: row.reportId,
        runId: row.runId!,
        ordinal: row.ordinal!,
        completionSequence: row.completionSequence!,
        result: (row.result as { outcome: "win" | "loss" | "draw" }).outcome,
        credited: row.creditedAt !== null,
      });
    }
  }

  const last = entries[entries.length - 1];
  const nextCursor = last ? (last.kind === "battle" ? last.completionSequence : last.toSequence) : null;

  return {
    entries,
    nextCursor,
    oldestAvailableSequence: bounds.oldest,
    newestAvailableSequence: bounds.newest,
    missingRange,
  };
}
