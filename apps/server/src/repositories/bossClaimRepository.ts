import type { DatabaseSync } from "node:sqlite";
import type { BossClaim } from "@banner-and-bounty/contracts";

export const BOSS_IDS = ["boss_tollkeeper"] as const;

export class BossClaimRepository {
  constructor(private readonly db: DatabaseSync) {}

  /** One entry per known boss; a missing row means "not yet claimed". */
  listByAccount(accountId: string): BossClaim[] {
    const rows = this.db
      .prepare("SELECT bossId, claimedAt FROM boss_claims WHERE accountId = ?")
      .all(accountId) as Array<{ bossId: string; claimedAt: string | null }>;
    const byBoss = new Map(rows.map((r) => [r.bossId, r.claimedAt]));
    return BOSS_IDS.map((bossId) => ({ accountId, bossId, claimedAt: byBoss.get(bossId) ?? null }));
  }

  /**
   * Check-then-set in one statement: returns true only for the caller that
   * transitions claimedAt from null. Run inside the boss/challenge
   * transaction, so the reward grant commits or rolls back with it.
   */
  claimIfUnclaimed(accountId: string, bossId: string, claimedAt: string): boolean {
    const result = this.db
      .prepare(
        `INSERT INTO boss_claims (accountId, bossId, claimedAt) VALUES (?, ?, ?)
         ON CONFLICT(accountId, bossId) DO UPDATE SET claimedAt = excluded.claimedAt
         WHERE boss_claims.claimedAt IS NULL`,
      )
      .run(accountId, bossId, claimedAt);
    return Number(result.changes) === 1;
  }
}
