import type { DatabaseSync } from "node:sqlite";

// design/studio/contracts.md M3-05 addition section 3/9: one row per
// (accountId, dungeonId) that has ever reached outcome="cleared";
// insert-only, the persisted "server outcome, never inventory inference"
// fact Cinder Archive's unlock requires.
export class DungeonClearRecordRepository {
  constructor(private readonly db: DatabaseSync) {}

  hasCleared(accountId: string, dungeonId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM dungeon_clear_records WHERE accountId = ? AND dungeonId = ?")
      .get(accountId, dungeonId);
    return row !== undefined;
  }

  /** Idempotent: a second clear of an already-cleared dungeon inserts no duplicate. */
  recordClear(accountId: string, dungeonId: string, clearedAt: string): void {
    this.db
      .prepare("INSERT OR IGNORE INTO dungeon_clear_records (accountId, dungeonId, clearedAt) VALUES (?, ?, ?)")
      .run(accountId, dungeonId, clearedAt);
  }
}
