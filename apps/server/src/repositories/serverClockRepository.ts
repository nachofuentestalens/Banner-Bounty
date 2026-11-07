import type { DatabaseSync } from "node:sqlite";

// design/studio/contracts.md M3-05 addition section 1: a single global
// ServerClock.highWaterMs row, read/bumped by every command that persists a
// time-stamped computation. Never decreases.
export class ServerClockRepository {
  constructor(private readonly db: DatabaseSync) {}

  private highWaterMs(): number {
    const row = this.db.prepare("SELECT highWaterMs FROM server_clock WHERE id = 1").get() as
      | { highWaterMs: number }
      | undefined;
    return row?.highWaterMs ?? 0;
  }

  /**
   * `effectiveNow = max(rawServerNow(), highWaterMs)`, persisting the result
   * as the new high-water mark in the same call. Callers must invoke this
   * inside their own mutation transaction (it issues a plain UPDATE, not its
   * own BEGIN/COMMIT) so the bump commits atomically with the rest of the
   * command, per contracts.md's "same transaction" requirement.
   */
  advance(rawNowMs: number): number {
    const effectiveNow = Math.max(rawNowMs, this.highWaterMs());
    this.db.prepare("UPDATE server_clock SET highWaterMs = ? WHERE id = 1").run(effectiveNow);
    return effectiveNow;
  }

  /** Read-only peek, for GET endpoints that must not silently bump the clock. */
  peek(): number {
    return this.highWaterMs();
  }
}
