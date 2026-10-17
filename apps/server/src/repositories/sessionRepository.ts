import type { DatabaseSync } from "node:sqlite";

export interface SessionRow {
  sessionId: string;
  accountId: string;
  createdAt: string;
}

export class SessionRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(sessionId: string, accountId: string, createdAt: string): void {
    this.db
      .prepare("INSERT INTO sessions (sessionId, accountId, createdAt) VALUES (?, ?, ?)")
      .run(sessionId, accountId, createdAt);
  }

  findById(sessionId: string): SessionRow | null {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE sessionId = ?")
      .get(sessionId) as SessionRow | undefined;
    return row ?? null;
  }

  delete(sessionId: string): void {
    this.db.prepare("DELETE FROM sessions WHERE sessionId = ?").run(sessionId);
  }
}
