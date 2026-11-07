import type { DatabaseSync } from "node:sqlite";

// design/studio/contracts.md M3-05 addition section 3/10: single global row,
// created lazily (not at migration time) by the first competition-surface
// request. Never updated again once set.
export class CompetitionEpochRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(): number | null {
    const row = this.db.prepare("SELECT epochMs FROM competition_epoch WHERE id = 1").get() as { epochMs: number } | undefined;
    return row?.epochMs ?? null;
  }

  /** Lazily establishes the epoch exactly once, at `nowMs`, inside the caller's transaction. Returns the (possibly pre-existing) epoch. */
  ensure(nowMs: number): number {
    const existing = this.get();
    if (existing !== null) return existing;
    this.db.prepare("INSERT INTO competition_epoch (id, epochMs) VALUES (1, ?)").run(nowMs);
    return nowMs;
  }
}

export interface SeasonEntryRow {
  entryId: string;
  accountId: string | null;
  isFixture: boolean;
  fixtureId: string | null;
  seasonIndex: number;
  snapshot: unknown;
  enteredAt: string;
  withdrawnAt: string | null;
  optedIntoTournament: boolean;
}

interface SeasonEntryTableRow extends Omit<SeasonEntryRow, "isFixture" | "optedIntoTournament" | "snapshot"> {
  isFixture: number;
  optedIntoTournament: number;
  snapshot: string;
}

function toEntry(row: SeasonEntryTableRow): SeasonEntryRow {
  return { ...row, isFixture: row.isFixture === 1, optedIntoTournament: row.optedIntoTournament === 1, snapshot: JSON.parse(row.snapshot) };
}

// section 3/8: insert-only except withdrawnAt (set exactly once, only before
// the 24h entry lock, by the owning account).
export class SeasonEntryRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(row: SeasonEntryRow): void {
    this.db
      .prepare(
        `INSERT INTO season_entries (entryId, accountId, isFixture, fixtureId, seasonIndex, snapshot, enteredAt, withdrawnAt, optedIntoTournament)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.entryId, row.accountId, row.isFixture ? 1 : 0, row.fixtureId, row.seasonIndex, JSON.stringify(row.snapshot), row.enteredAt, row.withdrawnAt, row.optedIntoTournament ? 1 : 0);
  }

  findById(entryId: string): SeasonEntryRow | null {
    const row = this.db.prepare("SELECT * FROM season_entries WHERE entryId = ?").get(entryId) as SeasonEntryTableRow | undefined;
    return row ? toEntry(row) : null;
  }

  findActiveForAccountInSeason(accountId: string, seasonIndex: number): SeasonEntryRow | null {
    const row = this.db
      .prepare("SELECT * FROM season_entries WHERE accountId = ? AND seasonIndex = ? AND withdrawnAt IS NULL")
      .get(accountId, seasonIndex) as SeasonEntryTableRow | undefined;
    return row ? toEntry(row) : null;
  }

  listNonWithdrawnHumansInSeason(seasonIndex: number): SeasonEntryRow[] {
    const rows = this.db
      .prepare("SELECT * FROM season_entries WHERE seasonIndex = ? AND isFixture = 0 AND withdrawnAt IS NULL ORDER BY enteredAt ASC")
      .all(seasonIndex) as unknown as SeasonEntryTableRow[];
    return rows.map(toEntry);
  }

  listBySeason(seasonIndex: number): SeasonEntryRow[] {
    const rows = this.db.prepare("SELECT * FROM season_entries WHERE seasonIndex = ?").all(seasonIndex) as unknown as SeasonEntryTableRow[];
    return rows.map(toEntry);
  }

  withdraw(entryId: string, withdrawnAt: string): void {
    this.db.prepare("UPDATE season_entries SET withdrawnAt = ? WHERE entryId = ? AND withdrawnAt IS NULL").run(withdrawnAt, entryId);
  }
}

export interface SeasonMatchRow {
  matchId: string;
  seasonIndex: number;
  entryAId: string;
  entryBId: string;
  leg: number;
  seed: number;
  resolvedAt: string | null;
  reportId: string | null;
  /** Stored inline rather than in `battle_reports` — season/tournament matches have no owning account (battle_reports.accountId is a FK with foreign_keys=ON), and the report is public shared-replay data anyway (section 10). */
  report: unknown | null;
  result: "A" | "B" | "draw" | null;
  isTournament: boolean;
  round: "regular" | "semi1" | "semi2" | "final";
  advancementReason: string | null;
  compared: { aHp: number; bHp: number; aSurvivors: number; bSurvivors: number } | null;
}

interface SeasonMatchTableRow extends Omit<SeasonMatchRow, "isTournament" | "compared" | "report"> {
  isTournament: number;
  comparedJson: string | null;
  reportJson: string | null;
}

function toMatch(row: SeasonMatchTableRow): SeasonMatchRow {
  return { ...row, isTournament: row.isTournament === 1, compared: row.comparedJson ? JSON.parse(row.comparedJson) : null, report: row.reportJson ? JSON.parse(row.reportJson) : null };
}

// section 3/10/11: created once at the 24h lock (12 regular + up to 3
// tournament rows); resolution is guarded by `resolvedAt IS NULL` as the
// commit precondition (BossClaim-style check-then-set), making it
// crash-safe/exactly-once without a client requestId.
export class SeasonMatchRepository {
  constructor(private readonly db: DatabaseSync) {}

  insertMany(rows: readonly SeasonMatchRow[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO season_matches (matchId, seasonIndex, entryAId, entryBId, leg, seed, resolvedAt, reportId, reportJson, result, isTournament, round, advancementReason, comparedJson)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, NULL, NULL)`,
    );
    for (const row of rows) stmt.run(row.matchId, row.seasonIndex, row.entryAId, row.entryBId, row.leg, row.seed, row.isTournament ? 1 : 0, row.round);
  }

  existsForSeason(seasonIndex: number): boolean {
    const row = this.db.prepare("SELECT 1 FROM season_matches WHERE seasonIndex = ? LIMIT 1").get(seasonIndex);
    return row !== undefined;
  }

  listBySeason(seasonIndex: number): SeasonMatchRow[] {
    const rows = this.db.prepare("SELECT * FROM season_matches WHERE seasonIndex = ? ORDER BY round ASC, leg ASC").all(seasonIndex) as unknown as SeasonMatchTableRow[];
    return rows.map(toMatch);
  }

  findById(matchId: string): SeasonMatchRow | null {
    const row = this.db.prepare("SELECT * FROM season_matches WHERE matchId = ?").get(matchId) as SeasonMatchTableRow | undefined;
    return row ? toMatch(row) : null;
  }

  listUnresolved(seasonIndex: number): SeasonMatchRow[] {
    const rows = this.db.prepare("SELECT * FROM season_matches WHERE seasonIndex = ? AND resolvedAt IS NULL").all(seasonIndex) as unknown as SeasonMatchTableRow[];
    return rows.map(toMatch);
  }

  /** Exactly-once resolve: the `resolvedAt IS NULL` guard is the commit precondition. Returns whether this call actually resolved it (false if another commit already had). */
  resolve(
    matchId: string,
    update: { resolvedAt: string; reportId: string; report: unknown; result: "A" | "B" | "draw"; advancementReason: string | null; compared: SeasonMatchRow["compared"] },
  ): boolean {
    const result = this.db
      .prepare(
        "UPDATE season_matches SET resolvedAt = ?, reportId = ?, reportJson = ?, result = ?, advancementReason = ?, comparedJson = ? WHERE matchId = ? AND resolvedAt IS NULL",
      )
      .run(update.resolvedAt, update.reportId, JSON.stringify(update.report), update.result, update.advancementReason, update.compared ? JSON.stringify(update.compared) : null, matchId);
    return result.changes > 0;
  }

  /** Bye resolution: no report/score, only an advancement reason recorded via result. */
  resolveBye(matchId: string, resolvedAt: string, winnerSide: "A" | "B"): boolean {
    const result = this.db
      .prepare("UPDATE season_matches SET resolvedAt = ?, result = ?, advancementReason = 'bye' WHERE matchId = ? AND resolvedAt IS NULL")
      .run(resolvedAt, winnerSide, matchId);
    return result.changes > 0;
  }
}

export interface SeasonArchiveRow {
  seasonIndex: number;
  standings: unknown;
  titleEntryId: string | null;
  archivedAt: string;
}

export class SeasonArchiveRepository {
  constructor(private readonly db: DatabaseSync) {}

  findBySeason(seasonIndex: number): SeasonArchiveRow | null {
    const row = this.db.prepare("SELECT * FROM season_archives WHERE seasonIndex = ?").get(seasonIndex) as
      | (Omit<SeasonArchiveRow, "standings"> & { standings: string })
      | undefined;
    return row ? { ...row, standings: JSON.parse(row.standings) } : null;
  }

  /** Guarded insert: exactly once per season (section 10 step 3's "insert once, guarded the same way"). Returns whether this call inserted it. */
  insertOnce(row: SeasonArchiveRow): boolean {
    const result = this.db
      .prepare("INSERT OR IGNORE INTO season_archives (seasonIndex, standings, titleEntryId, archivedAt) VALUES (?, ?, ?, ?)")
      .run(row.seasonIndex, JSON.stringify(row.standings), row.titleEntryId, row.archivedAt);
    return result.changes > 0;
  }
}

export interface TournamentBracketRow {
  seasonIndex: number;
  seatEntryIds: readonly [string, string, string, string];
  semifinal1MatchId: string;
  semifinal2MatchId: string;
  finalMatchId: string | null;
  byeReasons: Record<string, string>;
  championEntryId: string | null;
  status: "pending" | "in_progress" | "complete" | "no_champion";
  createdAt: string;
}

export class TournamentBracketRepository {
  constructor(private readonly db: DatabaseSync) {}

  findBySeason(seasonIndex: number): TournamentBracketRow | null {
    const row = this.db.prepare("SELECT * FROM tournament_brackets WHERE seasonIndex = ?").get(seasonIndex) as
      | (Omit<TournamentBracketRow, "seatEntryIds" | "byeReasons"> & { seatEntryIds: string; byeReasons: string })
      | undefined;
    if (!row) return null;
    return { ...row, seatEntryIds: JSON.parse(row.seatEntryIds), byeReasons: JSON.parse(row.byeReasons) };
  }

  /** Guarded insert: created once, at the season's 24h lock. Returns whether this call created it. */
  insertOnce(row: Omit<TournamentBracketRow, "finalMatchId" | "byeReasons" | "championEntryId" | "status">): boolean {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO tournament_brackets (seasonIndex, seatEntryIds, semifinal1MatchId, semifinal2MatchId, finalMatchId, byeReasons, championEntryId, status, createdAt)
         VALUES (?, ?, ?, ?, NULL, '{}', NULL, 'pending', ?)`,
      )
      .run(row.seasonIndex, JSON.stringify(row.seatEntryIds), row.semifinal1MatchId, row.semifinal2MatchId, row.createdAt);
    return result.changes > 0;
  }

  setFinalMatchId(seasonIndex: number, finalMatchId: string): void {
    this.db.prepare("UPDATE tournament_brackets SET finalMatchId = ?, status = 'in_progress' WHERE seasonIndex = ? AND finalMatchId IS NULL").run(finalMatchId, seasonIndex);
  }

  setByeReason(seasonIndex: number, seatEntryId: string, reason: string): void {
    const bracket = this.findBySeason(seasonIndex);
    if (!bracket) return;
    const next = { ...bracket.byeReasons, [seatEntryId]: reason };
    this.db.prepare("UPDATE tournament_brackets SET byeReasons = ? WHERE seasonIndex = ?").run(JSON.stringify(next), seasonIndex);
  }

  /** Exactly-once champion grant, guarded by `championEntryId IS NULL`. */
  setChampion(seasonIndex: number, championEntryId: string | null, status: "complete" | "no_champion"): boolean {
    const result = this.db
      .prepare("UPDATE tournament_brackets SET championEntryId = ?, status = ? WHERE seasonIndex = ? AND status != 'complete' AND status != 'no_champion'")
      .run(championEntryId, status, seasonIndex);
    return result.changes > 0;
  }
}
