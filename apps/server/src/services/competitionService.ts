// design/studio/contracts.md M3-05 addition sections 10-11 (seasons/
// tournament). Wires packages/game's pure competition3.ts helpers into real
// persistence. `ensureSeasonAdvanced` is the shared lazy-resolution step
// every season/tournament endpoint runs first, in its own transaction,
// guarded by check-then-set-in-one-transaction (BossClaim-style) so it is
// crash-safe/exactly-once without needing a client requestId (section 10/11:
// "server-triggered background-style work, not an account command").
import type { DatabaseSync } from "node:sqlite";
import { M3_RULES, TOLLKEEPER, type ClassIdV3, type RaceIdV3 } from "@banner-and-bounty/content";
import {
  buildDoubleRoundRobinScheduleV3,
  buildFixtureCompanyV3,
  championEarnsTitleV3,
  computeStandingsV3,
  createTournamentBracketSeatsV3,
  defaultSeasonSeedV3,
  fillSeasonSeatsV3,
  isFixtureEntryV3,
  resolveAdvancementV3,
  seasonEndV3,
  seasonIndexForV3,
  seasonLockDeadlineV3,
  seasonStartV3,
  simulateBattleV3,
  toHeroCombatantsV3,
  type HeroBuildV3,
  type HeroCombatantInputV3,
  type MatchResultV3,
  type TiebreakInputSideV3,
} from "@banner-and-bounty/game";
import type {
  SeasonAccountStateDTO,
  SeasonEnterRequest,
  SeasonEntryViewDTO,
  SeasonMatchViewDTO,
  SeasonStandingRowDTO,
  SeasonStandingsResponseDTO,
  SeasonWithdrawRequest,
  TournamentBracketViewDTO,
} from "@banner-and-bounty/contracts";
import { AppError } from "../errors.js";
import { runMutation, type MutationResult } from "../mutation.js";
import { BossClaimRepository } from "../repositories/bossClaimRepository.js";
import {
  CompetitionEpochRepository,
  SeasonArchiveRepository,
  SeasonEntryRepository,
  SeasonMatchRepository,
  TournamentBracketRepository,
  type SeasonEntryRow,
  type SeasonMatchRow,
} from "../repositories/competitionRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { PartyFormationRepository } from "../repositories/partyFormationRepository.js";
import { ServerClockRepository } from "../repositories/serverClockRepository.js";
import { toBattleEventDTOs, toBattleResultDTO, toBattleUnitDTOs } from "./battlePresentation.js";
import { toFrozenMembers } from "./partyLoadout.js";

function seasonWindow(epoch: number, seasonIndex: number) {
  return {
    startAt: seasonStartV3(epoch, seasonIndex, M3_RULES.seasonLengthMs),
    lockAt: seasonLockDeadlineV3(epoch, seasonIndex, M3_RULES.seasonLengthMs, M3_RULES.seasonEntryWindowMs),
    endAt: seasonEndV3(epoch, seasonIndex, M3_RULES.seasonLengthMs),
  };
}

function snapshotToParty(snapshot: readonly HeroBuildV3[]): HeroCombatantInputV3[] {
  return snapshot.map((build, index) => ({ ...build, id: `${index}` }));
}

function simulateMatch(seed: number, snapshotA: readonly HeroBuildV3[], snapshotB: readonly HeroBuildV3[]) {
  const sideA = toHeroCombatantsV3(snapshotToParty(snapshotA));
  const sideB = toHeroCombatantsV3(snapshotToParty(snapshotB).map((h) => ({ ...h, id: `b${h.id}` })));
  return simulateBattleV3(sideA, sideB, "arena", seed);
}

function hpRatiosForSide(battle: ReturnType<typeof simulateBattleV3>, snapshot: readonly HeroBuildV3[], prefix: string): number[] {
  return snapshot.map((_, index) => {
    const id = `${prefix}${index}`;
    const unit = battle.units.find((u) => u.unitId === id);
    const maxHp = unit?.maxHp ?? 1;
    const hp = battle.finalHp[id] ?? 0;
    return Math.max(0, hp) / maxHp;
  });
}

/** `/season/enter`'s by-value company copy, shaped exactly for combat3 (section 8). */
function buildLiveSnapshot(db: DatabaseSync, accountId: string, heroIds: readonly string[]): HeroBuildV3[] {
  const formation = new PartyFormationRepository(db).find(accountId);
  const heroes = new HeroRepository(db);
  return heroIds.map((heroId, index) => {
    const hero = heroes.findById(heroId);
    if (!hero || hero.accountId !== accountId) throw new AppError("validation", `heroId ${heroId} is not owned by this account`, { reason: "invalid_hero" });
    const slotIndex = formation?.slots.indexOf(heroId) ?? index;
    return {
      primaryClassId: hero.primaryClassId as ClassIdV3,
      secondaryClassId: hero.secondaryClassId as ClassIdV3 | null,
      primarySpecializationId: hero.primarySpecializationId ?? null,
      raceId: (hero.raceId ?? "race_vesper") as RaceIdV3,
      level: hero.level,
      slotIndex: slotIndex >= 0 ? slotIndex : index,
      equipment: toFrozenMembers(db, [{ hero, slotIndex: index }])[0]!.equipment,
      skillLoadout: hero.skillLoadout as HeroBuildV3["skillLoadout"],
    };
  });
}

function entrySnapshot(entry: SeasonEntryRow): readonly HeroBuildV3[] {
  return entry.snapshot as readonly HeroBuildV3[];
}

/**
 * The shared lazy-advance step (section 10/11). Idempotent, exactly-once per
 * boundary via each table's own check-then-set guard; safe to call from
 * every season/tournament endpoint before its own work.
 */
/** One season's lock/resolve/archive step, idempotent (every write below is itself guarded). */
function advanceOneSeason(db: DatabaseSync, epoch: number, seasonIndex: number, effectiveNow: number, nowIso: string): void {
  const window = seasonWindow(epoch, seasonIndex);
  const matchRepo = new SeasonMatchRepository(db);
  const entryRepo = new SeasonEntryRepository(db);
  const archiveRepo = new SeasonArchiveRepository(db);

  if (archiveRepo.findBySeason(seasonIndex)) return; // already finalized; nothing left to do, ever.

  // "A long absence skips empty seasons without creating opponents or
  // rewards": only lock (create fixtures/matches) if this season's window is
  // still open or at/after its own lock deadline *and* it hasn't already
  // ended with zero matches ever created.
  if (effectiveNow >= window.lockAt && !matchRepo.existsForSeason(seasonIndex) && effectiveNow < window.endAt) {
    lockSeason(db, seasonIndex, nowIso);
  }

  if (matchRepo.existsForSeason(seasonIndex)) {
    resolveUnresolvedMatches(db, seasonIndex, nowIso);
    maybeAdvanceTournament(db, seasonIndex, nowIso);
  }

  if (effectiveNow < window.endAt) return; // not yet ended; nothing to archive.

  const entries = entryRepo.listBySeason(seasonIndex);
  const matches = matchRepo.listBySeason(seasonIndex).filter((m) => !m.isTournament);
  const standings = computeStandingsV3(
    entries.map((e) => e.entryId),
    matches.filter((m) => m.result !== null).map((m) => ({ teamAEntryId: m.entryAId, teamBEntryId: m.entryBId, result: matchResultFromAB(m.result!) })),
  );
  const standingRows: SeasonStandingRowDTO[] = standings.map((row, index) => ({
    entryId: row.entryId,
    points: row.points,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    rank: index + 1,
    isFixture: isFixtureEntryV3(row.entryId),
  }));
  const titled = standingRows.find((r) => r.rank === 1 && r.points > 0 && !r.isFixture);
  archiveRepo.insertOnce({ seasonIndex, standings: standingRows, titleEntryId: titled?.entryId ?? null, archivedAt: nowIso });
}

/** Bounded catch-up for however many past seasons a long absence skipped, oldest first, each step idempotent/guarded. */
const MAX_SEASONS_CAUGHT_UP_PER_CALL = 500;

export function ensureSeasonAdvanced(db: DatabaseSync, effectiveNow: number, nowIso: string): number {
  const epochRepo = new CompetitionEpochRepository(db);
  const epoch = epochRepo.ensure(effectiveNow);
  const currentSeasonIndex = seasonIndexForV3(epoch, effectiveNow, M3_RULES.seasonLengthMs);
  const archiveRepo = new SeasonArchiveRepository(db);
  const entryRepo = new SeasonEntryRepository(db);

  // Finalize every still-open-or-unarchived past season before advancing
  // the current one ("finalize old scheduled records before opening the
  // next season", section 10). Walk forward from the first season that
  // might still need work; bounded so an extreme absence cannot stall a
  // single request indefinitely.
  const start = Math.max(0, currentSeasonIndex - MAX_SEASONS_CAUGHT_UP_PER_CALL);
  for (let s = start; s <= currentSeasonIndex; s++) {
    if (archiveRepo.findBySeason(s)) continue;
    if (s < currentSeasonIndex && entryRepo.listBySeason(s).length === 0) {
      // Never entered and already elapsed: archive empty, create nothing.
      archiveRepo.insertOnce({ seasonIndex: s, standings: [], titleEntryId: null, archivedAt: nowIso });
      continue;
    }
    advanceOneSeason(db, epoch, s, effectiveNow, nowIso);
  }

  return currentSeasonIndex;
}

function matchResultFromAB(result: "A" | "B" | "draw"): MatchResultV3 {
  return result === "A" ? "a_win" : result === "B" ? "b_win" : "draw";
}

function lockSeason(db: DatabaseSync, seasonIndex: number, nowIso: string): void {
  const entryRepo = new SeasonEntryRepository(db);
  const matchRepo = new SeasonMatchRepository(db);
  const bracketRepo = new TournamentBracketRepository(db);
  const humans = entryRepo.listNonWithdrawnHumansInSeason(seasonIndex).sort((a, b) => a.entryId.localeCompare(b.entryId));
  const seatEntryIds = fillSeasonSeatsV3(humans.map((h) => h.entryId)) as string[];

  for (const seatId of seatEntryIds) {
    if (isFixtureEntryV3(seatId) && !entryRepo.findById(seatId)) {
      entryRepo.insert({
        entryId: seatId,
        accountId: null,
        isFixture: true,
        fixtureId: seatId,
        seasonIndex,
        snapshot: buildFixtureCompanyV3(seatId),
        enteredAt: nowIso,
        withdrawnAt: null,
        optedIntoTournament: true,
      });
    }
  }

  const schedule = buildDoubleRoundRobinScheduleV3(seatEntryIds, (pairKey, leg) => defaultSeasonSeedV3(seasonIndex, pairKey, leg));
  const regularRows: SeasonMatchRow[] = schedule.map((m) => ({
    matchId: `season:${seasonIndex}:${m.pairKey}:${m.leg}`,
    seasonIndex,
    entryAId: m.teamAEntryId,
    entryBId: m.teamBEntryId,
    leg: m.leg,
    seed: m.seed,
    resolvedAt: null,
    reportId: null,
    report: null,
    result: null,
    isTournament: false,
    round: "regular",
    advancementReason: null,
    compared: null,
  }));
  matchRepo.insertMany(regularRows);

  const seats = createTournamentBracketSeatsV3(seatEntryIds);
  const semi1Id = `tournament:${seasonIndex}:semi1`;
  const semi2Id = `tournament:${seasonIndex}:semi2`;
  matchRepo.insertMany([
    {
      matchId: semi1Id,
      seasonIndex,
      entryAId: seats.semifinal1[0].entryId!,
      entryBId: seats.semifinal1[1].entryId!,
      leg: 1,
      seed: defaultSeasonSeedV3(seasonIndex, "tournament:semi1", 1),
      resolvedAt: null,
      reportId: null,
      report: null,
      result: null,
      isTournament: true,
      round: "semi1",
      advancementReason: null,
      compared: null,
    },
    {
      matchId: semi2Id,
      seasonIndex,
      entryAId: seats.semifinal2[0].entryId!,
      entryBId: seats.semifinal2[1].entryId!,
      leg: 1,
      seed: defaultSeasonSeedV3(seasonIndex, "tournament:semi2", 1),
      resolvedAt: null,
      reportId: null,
      report: null,
      result: null,
      isTournament: true,
      round: "semi2",
      advancementReason: null,
      compared: null,
    },
  ]);
  bracketRepo.insertOnce({ seasonIndex, seatEntryIds: seatEntryIds as [string, string, string, string], semifinal1MatchId: semi1Id, semifinal2MatchId: semi2Id, createdAt: nowIso });
}

/** Real bracket seed (1-4) per entryId, independent of season standings (section 9). */
function seedMapForBracket(seatEntryIds: readonly [string, string, string, string]): Map<string, number> {
  const seats = createTournamentBracketSeatsV3(seatEntryIds);
  const map = new Map<string, number>();
  for (const seat of [...seats.semifinal1, ...seats.semifinal2]) if (seat.entryId) map.set(seat.entryId, seat.seed);
  return map;
}

function resolveUnresolvedMatches(db: DatabaseSync, seasonIndex: number, nowIso: string): void {
  const matchRepo = new SeasonMatchRepository(db);
  const entryRepo = new SeasonEntryRepository(db);
  const bracket = new TournamentBracketRepository(db).findBySeason(seasonIndex);
  const seedMap = bracket ? seedMapForBracket(bracket.seatEntryIds) : new Map<string, number>();
  const unresolved = matchRepo.listUnresolved(seasonIndex).filter((m) => m.round !== "final");

  for (const match of unresolved) {
    const entryA = entryRepo.findById(match.entryAId);
    const entryB = entryRepo.findById(match.entryBId);
    if (!entryA || !entryB) continue; // operational error: pause, do not fabricate a win (section 9 recovery path not reachable in normal flow)
    const battle = simulateMatch(match.seed, entrySnapshot(entryA), entrySnapshot(entryB));
    const reportId = `${match.matchId}:report`;
    const report = {
      reportId,
      kind: "arena" as const,
      participantsSnapshot: { units: toBattleUnitDTOs(battle.units) },
      seed: String(match.seed),
      rulesVersion: M3_RULES.rulesVersion,
      events: toBattleEventDTOs(battle.events),
      result: toBattleResultDTO(battle),
      createdAt: nowIso,
    };

    let result: "A" | "B" | "draw";
    let advancementReason: string | null = null;
    let compared: SeasonMatchRow["compared"] = null;
    if (!match.isTournament) {
      result = battle.result === "win" ? "A" : battle.result === "loss" ? "B" : "draw";
    } else {
      const aSide: TiebreakInputSideV3 = { entryId: entryA.entryId, seed: seedMap.get(entryA.entryId) ?? 1, heroHpRatios: hpRatiosForSide(battle, entrySnapshot(entryA), "") };
      const bSide: TiebreakInputSideV3 = { entryId: entryB.entryId, seed: seedMap.get(entryB.entryId) ?? 2, heroHpRatios: hpRatiosForSide(battle, entrySnapshot(entryB), "b") };
      const advancement = resolveAdvancementV3(battle.result === "win" ? "a_win" : battle.result === "loss" ? "b_win" : "draw", aSide, bSide);
      result = advancement.winnerEntryId === entryA.entryId ? "A" : "B";
      advancementReason = advancement.reason;
      compared = advancement.compared;
    }

    matchRepo.resolve(match.matchId, { resolvedAt: nowIso, reportId, report, result, advancementReason, compared });
  }
}

function maybeAdvanceTournament(db: DatabaseSync, seasonIndex: number, nowIso: string): void {
  const bracketRepo = new TournamentBracketRepository(db);
  const matchRepo = new SeasonMatchRepository(db);
  const bracket = bracketRepo.findBySeason(seasonIndex);
  if (!bracket || bracket.championEntryId !== null || bracket.status === "complete" || bracket.status === "no_champion") return;

  const semi1 = matchRepo.findById(bracket.semifinal1MatchId);
  const semi2 = matchRepo.findById(bracket.semifinal2MatchId);
  if (!semi1 || !semi2 || !semi1.resolvedAt || !semi2.resolvedAt) return;

  const winner1 = semi1.result === "A" ? semi1.entryAId : semi1.entryBId;
  const winner2 = semi2.result === "A" ? semi2.entryAId : semi2.entryBId;

  if (!bracket.finalMatchId) {
    const finalId = `tournament:${seasonIndex}:final`;
    matchRepo.insertMany([
      {
        matchId: finalId,
        seasonIndex,
        entryAId: winner1,
        entryBId: winner2,
        leg: 1,
        seed: defaultSeasonSeedV3(seasonIndex, "tournament:final", 1),
        resolvedAt: null,
        reportId: null,
        report: null,
        result: null,
        isTournament: true,
        round: "final",
        advancementReason: null,
        compared: null,
      },
    ]);
    bracketRepo.setFinalMatchId(seasonIndex, finalId);
  }

  const final = matchRepo.findById(bracket.finalMatchId ?? `tournament:${seasonIndex}:final`);
  if (final && !final.resolvedAt) {
    const entryRepo = new SeasonEntryRepository(db);
    const entryA = entryRepo.findById(final.entryAId);
    const entryB = entryRepo.findById(final.entryBId);
    if (entryA && entryB) {
      const battle = simulateMatch(final.seed, entrySnapshot(entryA), entrySnapshot(entryB));
      const reportId = `${final.matchId}:report`;
      const report = {
        reportId,
        kind: "arena" as const,
        participantsSnapshot: { units: toBattleUnitDTOs(battle.units) },
        seed: String(final.seed),
        rulesVersion: M3_RULES.rulesVersion,
        events: toBattleEventDTOs(battle.events),
        result: toBattleResultDTO(battle),
        createdAt: nowIso,
      };
      const seedMap = seedMapForBracket(bracket.seatEntryIds);
      const aSide: TiebreakInputSideV3 = { entryId: entryA.entryId, seed: seedMap.get(entryA.entryId) ?? 1, heroHpRatios: hpRatiosForSide(battle, entrySnapshot(entryA), "") };
      const bSide: TiebreakInputSideV3 = { entryId: entryB.entryId, seed: seedMap.get(entryB.entryId) ?? 2, heroHpRatios: hpRatiosForSide(battle, entrySnapshot(entryB), "b") };
      const advancement = resolveAdvancementV3(battle.result === "win" ? "a_win" : battle.result === "loss" ? "b_win" : "draw", aSide, bSide);
      const result = advancement.winnerEntryId === entryA.entryId ? "A" : "B";
      matchRepo.resolve(final.matchId, { resolvedAt: nowIso, reportId, report, result, advancementReason: advancement.reason, compared: advancement.compared });
    }
  }

  const refreshedFinal = matchRepo.findById(bracket.finalMatchId ?? `tournament:${seasonIndex}:final`);
  if (refreshedFinal?.resolvedAt) {
    const championEntryId = refreshedFinal.result === "A" ? refreshedFinal.entryAId : refreshedFinal.entryBId;
    const earnsTitle = championEarnsTitleV3({ kind: "resolved", winnerEntryId: winner1, reason: "decisive" }, { kind: "resolved", winnerEntryId: winner2, reason: "decisive" }, { kind: "resolved", winnerEntryId: championEntryId, reason: refreshedFinal.advancementReason as never });
    bracketRepo.setChampion(seasonIndex, earnsTitle ? championEntryId : null, earnsTitle ? "complete" : "no_champion");
  }
}

// ---------------------------------------------------------------------------
// Public endpoints
// ---------------------------------------------------------------------------

function toEntryView(row: SeasonEntryRow): SeasonEntryViewDTO {
  return {
    entryId: row.entryId,
    accountId: row.accountId,
    isFixture: row.isFixture,
    fixtureId: row.fixtureId,
    seasonIndex: row.seasonIndex,
    enteredAt: row.enteredAt,
    withdrawnAt: row.withdrawnAt,
    optedIntoTournament: row.optedIntoTournament,
  };
}

export function enterSeason(db: DatabaseSync, accountId: string, request: SeasonEnterRequest, clockNowMs: number): MutationResult<{ entry: SeasonEntryViewDTO }> {
  const entryRepo = new SeasonEntryRepository(db);
  return runMutation(
    db,
    { accountId, command: "season/enter", requestId: request.requestId, expectedRevision: request.expectedRevision, fingerprintPayload: { heroIds: request.heroIds } },
    {
      precondition: () => {
        const bossClaims = new BossClaimRepository(db);
        if (!bossClaims.listByAccount(accountId).some((c) => c.bossId === TOLLKEEPER.enemyId && c.claimedAt !== null)) {
          throw new AppError("forbidden", "season entry requires a Tollkeeper clear");
        }
        const effectiveNowMs = new ServerClockRepository(db).peek();
        const epoch = new CompetitionEpochRepository(db).get() ?? effectiveNowMs;
        const seasonIndex = seasonIndexForV3(epoch, effectiveNowMs, M3_RULES.seasonLengthMs);
        const window = seasonWindow(epoch, seasonIndex);
        if (effectiveNowMs >= window.lockAt) {
          throw new AppError("validation", "entry window for this season has closed", { reason: "entry_window_closed" });
        }
        if (entryRepo.findActiveForAccountInSeason(accountId, seasonIndex)) {
          throw new AppError("validation", "this account already entered this season", { reason: "already_entered" });
        }
        if (new Set(request.heroIds).size !== request.heroIds.length) throw new AppError("validation", "heroIds must be distinct");
      },
      apply: () => {
        const effectiveNowMs = new ServerClockRepository(db).advance(clockNowMs);
        const nowIso = new Date(effectiveNowMs).toISOString();
        const epoch = new CompetitionEpochRepository(db).ensure(effectiveNowMs);
        const seasonIndex = seasonIndexForV3(epoch, effectiveNowMs, M3_RULES.seasonLengthMs);
        const entryId = `entry:${accountId}:${seasonIndex}`;
        const snapshot = buildLiveSnapshot(db, accountId, request.heroIds);
        const row: SeasonEntryRow = { entryId, accountId, isFixture: false, fixtureId: null, seasonIndex, snapshot, enteredAt: nowIso, withdrawnAt: null, optedIntoTournament: true };
        entryRepo.insert(row);
        return { result: { entry: toEntryView(row) }, changed: true };
      },
    },
  );
}

export function withdrawSeason(db: DatabaseSync, accountId: string, request: SeasonWithdrawRequest, clockNowMs: number): MutationResult<{ entry: SeasonEntryViewDTO }> {
  const entryRepo = new SeasonEntryRepository(db);
  return runMutation(
    db,
    { accountId, command: "season/withdraw", requestId: request.requestId, expectedRevision: request.expectedRevision, fingerprintPayload: { entryId: request.entryId } },
    {
      precondition: () => {
        const entry = entryRepo.findById(request.entryId);
        if (!entry || entry.accountId !== accountId) throw new AppError("forbidden", "entry does not belong to this account");
        const epoch = new CompetitionEpochRepository(db).get();
        const effectiveNowMs = new ServerClockRepository(db).peek();
        if (epoch !== null) {
          const window = seasonWindow(epoch, entry.seasonIndex);
          if (effectiveNowMs >= window.lockAt) throw new AppError("validation", "season already locked; withdrawal is no longer possible", { reason: "season_locked" });
        }
      },
      apply: () => {
        const effectiveNowMs = new ServerClockRepository(db).advance(clockNowMs);
        entryRepo.withdraw(request.entryId, new Date(effectiveNowMs).toISOString());
        return { result: { entry: toEntryView(entryRepo.findById(request.entryId)!) }, changed: true };
      },
    },
  );
}

export function getSeasonStandings(db: DatabaseSync, seasonIndex: number, clockNowMs: number): SeasonStandingsResponseDTO {
  const effectiveNowMs = new ServerClockRepository(db).advance(clockNowMs);
  const nowIso = new Date(effectiveNowMs).toISOString();
  const currentSeasonIndex = ensureSeasonAdvanced(db, effectiveNowMs, nowIso);
  if (!Number.isInteger(seasonIndex) || seasonIndex < 0 || seasonIndex > currentSeasonIndex) {
    throw new AppError("not_found", `unknown seasonIndex ${seasonIndex}`);
  }

  const epoch = new CompetitionEpochRepository(db).get() ?? effectiveNowMs;
  const window = seasonWindow(epoch, seasonIndex);
  const archive = new SeasonArchiveRepository(db).findBySeason(seasonIndex);
  const matchRepo = new SeasonMatchRepository(db);
  const entryRepo = new SeasonEntryRepository(db);
  const hasMatches = matchRepo.existsForSeason(seasonIndex);
  const status: SeasonStandingsResponseDTO["status"] = archive ? "archived" : hasMatches ? (effectiveNowMs >= window.endAt ? "in_progress" : "locked") : "entry_open";

  let inProgressStandings: SeasonStandingRowDTO[] | null = null;
  if (!archive && hasMatches) {
    const entries = entryRepo.listBySeason(seasonIndex);
    const resolved = matchRepo.listBySeason(seasonIndex).filter((m) => !m.isTournament && m.result !== null);
    const standings = computeStandingsV3(entries.map((e) => e.entryId), resolved.map((m) => ({ teamAEntryId: m.entryAId, teamBEntryId: m.entryBId, result: matchResultFromAB(m.result!) })));
    inProgressStandings = standings.map((row, index) => ({ entryId: row.entryId, points: row.points, wins: row.wins, draws: row.draws, losses: row.losses, rank: index + 1, isFixture: isFixtureEntryV3(row.entryId) }));
  }

  return {
    seasonIndex,
    startAt: new Date(window.startAt).toISOString(),
    endAt: new Date(window.endAt).toISOString(),
    status,
    standings: (archive?.standings as SeasonStandingRowDTO[] | undefined) ?? null,
    inProgressStandings,
  };
}

export function getSeasonMatch(db: DatabaseSync, seasonIndex: number, matchId: string, clockNowMs: number): { match: SeasonMatchViewDTO; report: unknown } {
  const effectiveNowMs = new ServerClockRepository(db).advance(clockNowMs);
  const nowIso = new Date(effectiveNowMs).toISOString();
  ensureSeasonAdvanced(db, effectiveNowMs, nowIso);
  const match = new SeasonMatchRepository(db).findById(matchId);
  if (!match || match.seasonIndex !== seasonIndex) throw new AppError("not_found", `unknown match ${matchId} for season ${seasonIndex}`);
  const report = match.report;
  return {
    match: {
      matchId: match.matchId,
      seasonIndex: match.seasonIndex,
      entryAId: match.entryAId,
      entryBId: match.entryBId,
      leg: match.leg,
      resolvedAt: match.resolvedAt,
      result: match.result,
      reportId: match.reportId,
      isTournament: match.isTournament,
      round: match.round,
      advancementReason: match.advancementReason as never,
      compared: match.compared,
    },
    report,
  };
}

export function getSeasonAccountState(db: DatabaseSync, accountId: string, clockNowMs: number): SeasonAccountStateDTO {
  const effectiveNowMs = new ServerClockRepository(db).advance(clockNowMs);
  const nowIso = new Date(effectiveNowMs).toISOString();
  const seasonIndex = ensureSeasonAdvanced(db, effectiveNowMs, nowIso);
  const entryRepo = new SeasonEntryRepository(db);
  const entry = entryRepo.findActiveForAccountInSeason(accountId, seasonIndex);
  const epoch = new CompetitionEpochRepository(db).get() ?? effectiveNowMs;
  const window = seasonWindow(epoch, seasonIndex);
  const matchRepo = new SeasonMatchRepository(db);
  const remaining = entry
    ? matchRepo.listBySeason(seasonIndex).filter((m) => !m.isTournament && !m.resolvedAt && (m.entryAId === entry.entryId || m.entryBId === entry.entryId)).length
    : 0;
  return {
    seasonIndex,
    entry: entry ? toEntryView(entry) : null,
    remainingEligibleMatches: remaining,
    canWithdraw: !!entry && effectiveNowMs < window.lockAt,
  };
}

export function getTournamentBracket(db: DatabaseSync, seasonIndex: number, clockNowMs: number): TournamentBracketViewDTO {
  const effectiveNowMs = new ServerClockRepository(db).advance(clockNowMs);
  const nowIso = new Date(effectiveNowMs).toISOString();
  ensureSeasonAdvanced(db, effectiveNowMs, nowIso);
  const bracket = new TournamentBracketRepository(db).findBySeason(seasonIndex);
  if (!bracket) throw new AppError("not_found", `season ${seasonIndex} has no bracket yet`);
  return {
    seasonIndex: bracket.seasonIndex,
    seatEntryIds: [...bracket.seatEntryIds] as [string | null, string | null, string | null, string | null],
    semifinal1MatchId: bracket.semifinal1MatchId,
    semifinal2MatchId: bracket.semifinal2MatchId,
    finalMatchId: bracket.finalMatchId,
    byeReasons: bracket.byeReasons,
    championEntryId: bracket.championEntryId,
    status: bracket.status,
  };
}
