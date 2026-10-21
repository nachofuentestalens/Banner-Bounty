import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { DungeonRunViewDTO, DungeonSettleResultDTO, DungeonStartRequest, NoPayloadMutationRequest } from "@banner-and-bounty/contracts";
import { DUNGEONS, getDungeonDefinition } from "@banner-and-bounty/content";
import {
  type DungeonFloorBatchResult,
  type RngState,
  applyXpGain,
  computeDungeonSettlementWindow,
  createRngState,
  simulateDungeonFloorBatch,
} from "@banner-and-bounty/game";
import type { Clock } from "../clock.js";
import { AppError } from "../errors.js";
import { presentBattle } from "./battlePresentation.js";
import { isUnlocked } from "./areaService.js";
import { runMutation, type MutationResult } from "../mutation.js";
import { AccountRepository } from "../repositories/accountRepository.js";
import { BattleReportRepository } from "../repositories/battleReportRepository.js";
import { BossClaimRepository } from "../repositories/bossClaimRepository.js";
import { DungeonRunRepository, type DungeonRunRow } from "../repositories/dungeonRunRepository.js";
import { ExpeditionRepository } from "../repositories/expeditionRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { ItemRepository } from "../repositories/itemRepository.js";
import { CURRENT_RULES_VERSION } from "../rulesVersion.js";
import { grantRewards, loadLiveParty, toFrozenMembers } from "./partyLoadout.js";

function dungeonRewardSeed(accountId: string, dungeonId: string, startedAt: string): number {
  return crypto.createHash("sha256").update(`dungeon:${accountId}:${dungeonId}:${startedAt}`).digest().readUInt32BE(0);
}

function dungeonCombatSeedBase(accountId: string, dungeonId: string, startedAt: string): number {
  return crypto.createHash("sha256").update(`dungeon:combat:${accountId}:${dungeonId}:${startedAt}`).digest().readUInt32BE(0);
}

export function toDungeonRunView(row: DungeonRunRow): DungeonRunViewDTO {
  return {
    status: row.status,
    dungeonId: row.dungeonId,
    startedAt: row.startedAt,
    checkpointAt: row.checkpointAt,
    currentFloor: row.currentFloor,
    floorsCleared: row.floorsCleared,
    rulesVersion: row.rulesVersion,
    outcome: row.outcome,
  };
}

// POST /dungeon/start (contracts.md M2-25 addition).
export function startDungeon(
  db: DatabaseSync,
  accountId: string,
  request: DungeonStartRequest,
  clock: Clock,
): MutationResult<{ dungeonRun: DungeonRunViewDTO }> {
  const dungeonRuns = new DungeonRunRepository(db);
  const expeditions = new ExpeditionRepository(db);
  const bossClaims = new BossClaimRepository(db);
  const { dungeonId } = request;

  return runMutation(
    db,
    {
      accountId,
      command: "dungeon/start",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { dungeonId },
    },
    {
      precondition: () => {
        if (expeditions.isActive(accountId)) throw new AppError("active_expedition", "an expedition is already running");
        if (dungeonRuns.isActive(accountId)) throw new AppError("active_dungeon", "a dungeon run is already active");
        const dungeon = DUNGEONS.find((d) => d.dungeonId === dungeonId);
        if (!dungeon) throw new AppError("not_found", `unknown dungeonId ${dungeonId}`);
        if (!isUnlocked(accountId, dungeon.unlockRequirement, bossClaims)) {
          throw new AppError("forbidden", `dungeon ${dungeonId} is not yet unlocked`);
        }
        loadLiveParty(db, accountId);
      },
      apply: () => {
        const frozenLoadout = toFrozenMembers(db, loadLiveParty(db, accountId));
        const startedAt = clock.now().toISOString();
        dungeonRuns.start({
          accountId,
          dungeonId,
          startedAt,
          frozenLoadout,
          rulesVersion: CURRENT_RULES_VERSION,
          combatSeedBase: dungeonCombatSeedBase(accountId, dungeonId, startedAt),
          rngState: String(createRngState(dungeonRewardSeed(accountId, dungeonId, startedAt))),
        });
        return { result: { dungeonRun: toDungeonRunView(dungeonRuns.find(accountId)!) }, changed: true };
      },
    },
  );
}

function requireActiveDungeonRun(db: DatabaseSync, accountId: string): DungeonRunRow {
  const run = new DungeonRunRepository(db).find(accountId);
  if (!run || run.status !== "active") {
    throw new AppError("validation", "there is no active dungeon run to settle", { reason: "no_active_dungeon" });
  }
  return run;
}

interface SettlePlan {
  revision: number;
  elapsedMs: number;
  discardedMs: number;
  checkpointAt: string;
  batch: DungeonFloorBatchResult | null;
}

function planSettlement(db: DatabaseSync, accountId: string, nowMs: number): SettlePlan {
  const run = requireActiveDungeonRun(db, accountId);
  const dungeon = getDungeonDefinition(run.dungeonId!);
  const floorsRemaining = dungeon.floors.length - run.currentFloor + 1;
  const window = computeDungeonSettlementWindow(Date.parse(run.checkpointAt!), nowMs, floorsRemaining);
  const revision = new AccountRepository(db).getRevision(accountId);

  if (window.eligibleFloors === 0) {
    return { revision, elapsedMs: window.elapsedMs, discardedMs: window.discardedMs, checkpointAt: run.checkpointAt!, batch: null };
  }

  const batch = simulateDungeonFloorBatch({
    dungeonId: run.dungeonId!,
    frozenParty: run.frozenLoadout as never,
    currentFloor: run.currentFloor,
    combatSeedBase: run.combatSeedBase!,
    rngState: Number(run.rngState) as RngState,
    unequippedCount: new ItemRepository(db).countUnequipped(accountId),
    eligibleFloors: window.eligibleFloors,
  });
  const nextCheckpointMs = Date.parse(run.checkpointAt!) + window.discardedMs + batch.floorsProcessed * 180_000;
  return { revision, elapsedMs: window.elapsedMs, discardedMs: window.discardedMs, checkpointAt: new Date(nextCheckpointMs).toISOString(), batch };
}

function tryPlan(db: DatabaseSync, accountId: string, nowMs: number): SettlePlan | null {
  try {
    return planSettlement(db, accountId, nowMs);
  } catch (error) {
    if (error instanceof AppError) return null;
    throw error;
  }
}

function applySettlement(
  db: DatabaseSync,
  accountId: string,
  precomputed: SettlePlan | null,
  nowMs: number,
  createdAt: string,
): { result: DungeonSettleResultDTO; changed: boolean } {
  const currentRevision = new AccountRepository(db).getRevision(accountId);
  const plan = precomputed && precomputed.revision === currentRevision ? precomputed : planSettlement(db, accountId, nowMs);
  const { batch } = plan;

  if (!batch) {
    return {
      result: {
        floorResults: [],
        outcome: "in_progress",
        elapsedMs: plan.elapsedMs,
        discardedMs: plan.discardedMs,
        creditedFloors: 0,
        checkpointAt: plan.checkpointAt,
        overflow: { convertedCount: 0, convertedGold: 0 },
      },
      changed: false,
    };
  }

  const reports = new BattleReportRepository(db);
  const floorResults: DungeonSettleResultDTO["floorResults"] = [];
  let overflowConvertedCount = 0;
  let overflowConvertedGold = 0;

  for (const floor of batch.floorResults) {
    const reportId = crypto.randomUUID();
    reports.insert({
      reportId,
      accountId,
      kind: floor.isBoss ? "dungeon_boss" : "dungeon_floor",
      seed: "",
      rulesVersion: CURRENT_RULES_VERSION,
      createdAt,
      ...presentBattle(floor.battle),
    });

    if (floor.result === "loss" || !floor.rewards) {
      floorResults.push({ floor: floor.floor, reportId, result: "loss", isBoss: floor.isBoss, rewards: { xp: 0, gold: 0, materials: { scrap: 0, sigil: 0, core: 0 }, items: [] } });
      continue;
    }

    const { items } = grantRewards(db, accountId, { gold: floor.rewards.gold, materials: floor.rewards.materials, levels: {}, drops: floor.rewards.item ? [floor.rewards.item] : [] }, createdAt);
    if (floor.rewards.overflowConverted) {
      overflowConvertedCount += 1;
      overflowConvertedGold += floor.rewards.gold;
    }
    floorResults.push({
      floor: floor.floor,
      reportId,
      result: "win",
      isBoss: floor.isBoss,
      rewards: { xp: floor.rewards.xp, gold: floor.rewards.gold, materials: floor.rewards.materials, items },
    });
  }

  // XP: dungeon floors grant XP to every frozen party member (classes.md/
  // gear.md precedent: expedition grants XP per participant, not per item).
  const run = requireActiveDungeonRun(db, accountId);
  const totalXp = batch.floorResults.reduce((sum, f) => sum + (f.rewards?.xp ?? 0), 0);
  if (totalXp > 0) {
    const heroes = new HeroRepository(db);
    for (const member of run.frozenLoadout as { heroId: string }[]) {
      const hero = heroes.findById(member.heroId);
      if (hero) {
        const leveled = applyXpGain({ level: hero.level, xp: hero.xp }, totalXp);
        heroes.setLevelXp(member.heroId, leveled.level, leveled.xp);
      }
    }
  }

  new DungeonRunRepository(db).applyBatch(accountId, {
    checkpointAt: plan.checkpointAt,
    rngState: String(batch.rngState),
    currentFloor: batch.currentFloorAfter,
    floorsClearedDelta: batch.floorsClearedDelta,
    outcome: batch.outcome === "in_progress" ? "none" : batch.outcome,
    status: batch.outcome === "in_progress" ? "active" : "none",
  });

  return {
    result: {
      floorResults,
      outcome: batch.outcome,
      elapsedMs: plan.elapsedMs,
      discardedMs: plan.discardedMs,
      creditedFloors: batch.floorsProcessed,
      checkpointAt: plan.checkpointAt,
      overflow: { convertedCount: overflowConvertedCount, convertedGold: overflowConvertedGold },
    },
    changed: true,
  };
}

// POST /dungeon/settle.
export function settleDungeon(db: DatabaseSync, accountId: string, request: NoPayloadMutationRequest, clock: Clock): MutationResult<DungeonSettleResultDTO> {
  const now = clock.now();
  const precomputed = tryPlan(db, accountId, now.getTime());
  return runMutation(
    db,
    {
      accountId,
      command: "dungeon/settle",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: {},
    },
    {
      precondition: () => {
        requireActiveDungeonRun(db, accountId);
      },
      apply: () => applySettlement(db, accountId, precomputed, now.getTime(), now.toISOString()),
    },
  );
}

// POST /dungeon/stop.
export function stopDungeon(
  db: DatabaseSync,
  accountId: string,
  request: NoPayloadMutationRequest,
  clock: Clock,
): MutationResult<{ finalSettlement: DungeonSettleResultDTO; dungeonRun: DungeonRunViewDTO }> {
  const dungeonRuns = new DungeonRunRepository(db);
  const now = clock.now();
  const precomputed = tryPlan(db, accountId, now.getTime());
  return runMutation(
    db,
    {
      accountId,
      command: "dungeon/stop",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: {},
    },
    {
      precondition: () => {
        requireActiveDungeonRun(db, accountId);
      },
      apply: () => {
        const { result: finalSettlement } = applySettlement(db, accountId, precomputed, now.getTime(), now.toISOString());
        dungeonRuns.stop(accountId);
        return { result: { finalSettlement, dungeonRun: toDungeonRunView(dungeonRuns.find(accountId)!) }, changed: true };
      },
    },
  );
}
