import { replayUnits } from "./battlePresentation.js";
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ArenaChallengeRequest, Hero, NoPayloadMutationRequest } from "@banner-and-bounty/contracts";
import type { ClassId, SpecializationId } from "@banner-and-bounty/content";
import {
  computePartyEffectiveStats,
  effectiveSpecialization,
  simulateArenaBattle,
  toHeroCombatants,
  type HeroCombatantInput,
} from "@banner-and-bounty/game";
import { AppError } from "../errors.js";
import type { Clock } from "../clock.js";
import { loadLiveParty, toFrozenMembers } from "./partyLoadout.js";
import {
  SnapshotRepository,
  type SnapshotPartyEntry,
  type SnapshotRow,
  type SnapshotStatsEntry,
} from "../repositories/snapshotRepository.js";
import { BattleReportRepository } from "../repositories/battleReportRepository.js";
import { runMutation } from "../mutation.js";
import { CURRENT_RULES_VERSION } from "../rulesVersion.js";

// Live party stats include equipped items (M1-08 added item instances);
// loadLiveParty/toFrozenMembers are shared with expedition start and boss.
function toCombatants(db: DatabaseSync, heroesOrdered: readonly Hero[]): HeroCombatantInput[] {
  return toHeroCombatants(toFrozenMembers(db, heroesOrdered));
}

function snapshotToCombatants(snapshot: SnapshotRow): HeroCombatantInput[] {
  const statsById = new Map(snapshot.frozenStats.map((s) => [s.heroId, s]));
  return snapshot.frozenParty.map((entry) => {
    const stats = statsById.get(entry.heroId);
    if (!stats) throw new AppError("internal", `snapshot ${snapshot.snapshotId} missing stats for ${entry.heroId}`);
    return {
      id: entry.heroId,
      side: "hero" as const,
      position: entry.position,
      classId: entry.classId as ClassId,
      specializationId: entry.specializationId as SpecializationId | null,
      stats: { maxHp: stats.maxHp, atk: stats.atk, def: stats.def, spd: stats.spd },
    };
  });
}

export interface PublishSnapshotResult {
  snapshot: {
    snapshotId: string;
    accountId: string;
    publishedAt: string;
    rulesVersion: number;
    frozenParty: SnapshotPartyEntry[];
    frozenStats: SnapshotStatsEntry[];
  };
}

// POST /arena/publish (contracts.md): copies current hero stats/party by
// value into an insert-only row. Never updates an existing snapshot, and
// never touches partyOrder or any live hero.
export function publishSnapshot(
  db: DatabaseSync,
  accountId: string,
  request: NoPayloadMutationRequest,
  clock: Clock,
): { result: PublishSnapshotResult; revision: number; replayed: boolean } {
  const snapshots = new SnapshotRepository(db);

  return runMutation<PublishSnapshotResult>(
    db,
    {
      accountId,
      command: "arena/publish",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: {},
    },
    {
      precondition: () => {
        loadLiveParty(db, accountId);
      },
      apply: () => {
        const ordered = loadLiveParty(db, accountId);
        const stats = computePartyEffectiveStats(toFrozenMembers(db, ordered));

        const snapshotId = crypto.randomUUID();
        const publishedAt = clock.now().toISOString();
        const frozenParty: SnapshotPartyEntry[] = ordered.map((hero, i) => ({
          heroId: hero.heroId,
          position: i,
          classId: hero.classId,
          level: hero.level,
          specializationId: effectiveSpecialization({
            level: hero.level,
            specializationId: hero.specializationId as SpecializationId | null,
          }),
        }));
        const frozenStats: SnapshotStatsEntry[] = ordered.map((hero, i) => ({
          heroId: hero.heroId,
          maxHp: stats[i]!.maxHp,
          atk: stats[i]!.atk,
          def: stats[i]!.def,
          spd: stats[i]!.spd,
        }));

        snapshots.insert({
          snapshotId,
          accountId,
          publishedAt,
          rulesVersion: CURRENT_RULES_VERSION,
          frozenParty,
          frozenStats,
        });

        return {
          result: {
            snapshot: { snapshotId, accountId, publishedAt, rulesVersion: CURRENT_RULES_VERSION, frozenParty, frozenStats },
          },
          // Every publish call creates a brand-new immutable row; there is
          // no toggle/no-op case (unlike settle's zero-credit case), so this
          // is always a persisted change.
          changed: true,
        };
      },
    },
  );
}

export interface SnapshotSummary {
  snapshotId: string;
  accountId: string;
  publishedAt: string;
  rulesVersion: number;
  heroClasses: string[];
}

// GET /arena/snapshots: public, summaries only — never the full frozen
// stats (that is the one-by-ID endpoint below).
export function listSnapshotSummaries(
  db: DatabaseSync,
  viewerAccountId: string | undefined,
  excludeMine: boolean,
): SnapshotSummary[] {
  const excludeAccountId = excludeMine && viewerAccountId ? viewerAccountId : undefined;
  const rows = new SnapshotRepository(db).listSummaries(excludeAccountId);
  return rows.map((row) => ({
    snapshotId: row.snapshotId,
    accountId: row.accountId,
    publishedAt: row.publishedAt,
    rulesVersion: row.rulesVersion,
    heroClasses: row.frozenParty.map((p) => p.classId),
  }));
}

// GET /arena/snapshots/:snapshotId: public, full frozen party/stats for
// opponent preview — never the owner's live data (it was copied at publish
// time, so there is nothing live to leak).
export function getSnapshotDetail(db: DatabaseSync, snapshotId: string): SnapshotRow {
  const row = new SnapshotRepository(db).findById(snapshotId);
  if (!row) throw new AppError("not_found", `snapshot ${snapshotId} not found`);
  return row;
}

export interface ChallengeResult {
  report: {
    reportId: string;
    kind: "arena";
    participantsSnapshot: unknown;
    seed: string;
    rulesVersion: number;
    events: unknown[];
    result: unknown;
    createdAt: string;
  };
}

// POST /arena/challenge: loads the challenger's current live party and the
// target snapshot (read-only, may belong to any account), simulates with
// packages/game's arena engine, and writes the report under the
// challenger's account only. Never writes to the opponent's account.
export function challenge(
  db: DatabaseSync,
  accountId: string,
  request: ArenaChallengeRequest,
  clock: Clock,
): { result: ChallengeResult; revision: number; replayed: boolean } {
  const snapshots = new SnapshotRepository(db);
  const reports = new BattleReportRepository(db);

  return runMutation<ChallengeResult>(
    db,
    {
      accountId,
      command: "arena/challenge",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { snapshotId: request.snapshotId },
    },
    {
      precondition: () => {
        loadLiveParty(db, accountId);
        if (!snapshots.findById(request.snapshotId)) {
          throw new AppError("not_found", `snapshot ${request.snapshotId} not found`);
        }
      },
      apply: () => {
        const ordered = loadLiveParty(db, accountId);
        const snapshot = snapshots.findById(request.snapshotId);
        if (!snapshot) throw new AppError("not_found", `snapshot ${request.snapshotId} not found`);

        const challengerCombatants = toCombatants(db, ordered);
        const opponentCombatants = snapshotToCombatants(snapshot);
        const battle = simulateArenaBattle(challengerCombatants, opponentCombatants);

        const reportId = crypto.randomUUID();
        const createdAt = clock.now().toISOString();
        // Combat in M1 is fully deterministic (combat.md section 7: rngSeed
        // is accepted for interface consistency but unused by any formula),
        // so this seed only has to be unique/reproducible for the report
        // record, not fed into the simulation.
        const seed = crypto
          .createHash("sha256")
          .update(`arena/challenge:${accountId}:${request.requestId}`)
          .digest("hex")
          .slice(0, 16);

        const participantsSnapshot = {
          units: replayUnits(challengerCombatants, opponentCombatants),
          challenger: {
            accountId,
            party: challengerCombatants.map((c) => ({
              heroId: c.id,
              position: c.position,
              classId: c.classId,
              specializationId: c.specializationId,
              stats: c.stats,
            })),
          },
          opponent: {
            snapshotId: snapshot.snapshotId,
            accountId: snapshot.accountId,
            party: snapshot.frozenParty,
            stats: snapshot.frozenStats,
          },
        };
        const resultDto = { outcome: battle.result, rounds: battle.rounds, finalHp: battle.finalHp };

        reports.insert({
          reportId,
          accountId,
          kind: "arena",
          participantsSnapshot,
          seed,
          rulesVersion: CURRENT_RULES_VERSION,
          events: battle.events as unknown[],
          result: resultDto,
          createdAt,
        });

        return {
          result: {
            report: {
              reportId,
              kind: "arena",
              participantsSnapshot,
              seed,
              rulesVersion: CURRENT_RULES_VERSION,
              events: battle.events as unknown[],
              result: resultDto,
              createdAt,
            },
          },
          changed: true,
        };
      },
    },
  );
}
