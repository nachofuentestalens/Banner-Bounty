import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ArenaChallengeRequest, NoPayloadMutationRequest } from "@banner-and-bounty/contracts";
import { type CombatantInputV2, computeBattleStartStats, simulateBattleV2, toHeroCombatantsV2 } from "@banner-and-bounty/game";
import { AppError } from "../errors.js";
import type { Clock } from "../clock.js";
import { presentBattle } from "./battlePresentation.js";
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

/** The opponent side of an arena challenge simulates as plain stat blocks (gear already folded into frozenStats at publish time), same precedent M1 used. */
function snapshotToCombatants(snapshot: SnapshotRow): CombatantInputV2[] {
  const statsById = new Map(snapshot.frozenStats.map((s) => [s.heroId, s]));
  return snapshot.frozenParty.map((entry) => {
    const stats = statsById.get(entry.heroId);
    if (!stats) throw new AppError("internal", `snapshot ${snapshot.snapshotId} missing stats for ${entry.heroId}`);
    return {
      kind: "enemy" as const,
      id: entry.heroId,
      slotIndex: entry.slotIndex,
      enemyId: `arena_${entry.primaryClassId}`,
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
// never touches the live formation or any live hero.
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
        const members = loadLiveParty(db, accountId);
        const frozen = toFrozenMembers(db, members);

        const snapshotId = crypto.randomUUID();
        const publishedAt = clock.now().toISOString();
        const frozenParty: SnapshotPartyEntry[] = frozen.map((m) => ({
          heroId: m.heroId,
          slotIndex: m.slotIndex,
          primaryClassId: m.primaryClassId,
          secondaryClassId: m.secondaryClassId,
          level: m.level,
          skillLoadout: m.skillLoadout,
        }));
        const frozenStats: SnapshotStatsEntry[] = frozen.map((m) => {
          const baseline = computeBattleStartStats({
            primaryClassId: m.primaryClassId,
            secondaryClassId: m.secondaryClassId,
            level: m.level,
            equipment: m.equipment,
            hasThickHide: m.skillLoadout.passive.includes("thick_hide"),
          });
          return { heroId: m.heroId, maxHp: baseline.maxHp, atk: baseline.atk, def: baseline.def, spd: baseline.spd };
        });

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
    heroClasses: row.frozenParty.map((p) => p.primaryClassId),
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
// combat v2's uniform "team A vs team B, both hero rules" (combat.md 8.1),
// and writes the report under the challenger's account only.
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
        const members = loadLiveParty(db, accountId);
        const snapshot = snapshots.findById(request.snapshotId);
        if (!snapshot) throw new AppError("not_found", `snapshot ${request.snapshotId} not found`);

        const challengerCombatants = toHeroCombatantsV2(toFrozenMembers(db, members));
        const opponentCombatants = snapshotToCombatants(snapshot);

        const seedBytes = crypto.createHash("sha256").update(`arena/challenge:${accountId}:${request.requestId}`).digest();
        const rngSeed = seedBytes.readUInt32BE(0);
        const battle = simulateBattleV2(challengerCombatants, opponentCombatants, "arena", rngSeed);

        const reportId = crypto.randomUUID();
        const createdAt = clock.now().toISOString();
        const seed = seedBytes.toString("hex").slice(0, 16);

        const report = {
          reportId,
          kind: "arena" as const,
          seed,
          rulesVersion: CURRENT_RULES_VERSION,
          createdAt,
          ...presentBattle(battle),
        };
        reports.insert({ ...report, accountId });

        return { result: { report }, changed: true };
      },
    },
  );
}
