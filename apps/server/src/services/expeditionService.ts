import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ExpeditionViewDTO, FrozenPartyMemberDTO, NoPayloadMutationRequest, SettlementResultDTO } from "@banner-and-bounty/contracts";
import { OLD_ROAD_ENEMIES, SUNKEN_AQUEDUCT_ENEMIES } from "@banner-and-bounty/content";
import {
  type CycleBatchResultV2,
  type LevelState,
  type SettlementWindowV2,
  computeSettlementWindowV2,
  createRngState,
  simulateExpeditionCyclesV2,
} from "@banner-and-bounty/game";
import type { Clock } from "../clock.js";
import { AppError } from "../errors.js";
import { presentBattle } from "./battlePresentation.js";
import { runMutation, type MutationResult } from "../mutation.js";
import { AccountRepository } from "../repositories/accountRepository.js";
import { DungeonRunRepository } from "../repositories/dungeonRunRepository.js";
import { ExpeditionRepository, type ExpeditionRow } from "../repositories/expeditionRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { ItemRepository } from "../repositories/itemRepository.js";
import { CURRENT_RULES_VERSION } from "../rulesVersion.js";
import { grantRewards, loadLiveParty, toFrozenMembers } from "./partyLoadout.js";

type ExpeditionView = ExpeditionViewDTO;
type SettlementResult = SettlementResultDTO;

/** areaId -> content enemyId roster. Not a packages/content field (AREAS only carries rewardProfileId); this is apps/server's own lookup, per contracts.md M2-25's "apps/server (lookups)" package-boundary note. */
const AREA_ENEMY_IDS: Record<string, readonly string[]> = {
  area_old_road: OLD_ROAD_ENEMIES.map((e) => e.enemyId),
  area_sunken_aqueduct: SUNKEN_AQUEDUCT_ENEMIES.map((e) => e.enemyId),
};

export function toExpeditionView(row: ExpeditionRow): ExpeditionView {
  const frozenLoadout: FrozenPartyMemberDTO[] | null =
    row.frozenLoadout?.map((m) => ({
      heroId: m.heroId,
      slotIndex: m.slotIndex,
      primaryClassId: m.primaryClassId,
      secondaryClassId: m.secondaryClassId,
      level: m.level,
      skillLoadout: { active: [...m.skillLoadout.active] as [string, string], passive: [...m.skillLoadout.passive] as [string, string] },
      equipment: m.presentation,
      equippedInstanceIds: m.equippedInstanceIds,
    })) ?? null;
  return {
    status: row.status,
    areaId: row.areaId,
    startedAt: row.startedAt,
    checkpointAt: row.checkpointAt,
    subCycleRemainderMs: row.subCycleRemainderMs,
    frozenLoadout,
    rulesVersion: row.rulesVersion,
    cyclesCompleted: row.cyclesCompleted,
    wins: row.wins,
    losses: row.losses,
  };
}

/** contracts.md: rngState = seed(accountId, startedAt). Combat and reward RNG are separate streams (gear.md section 1); this seeds the reward stream, expeditionCombatSeed below seeds combat. */
export function expeditionSeed(accountId: string, startedAt: string): number {
  return crypto.createHash("sha256").update(`expedition:${accountId}:${startedAt}`).digest().readUInt32BE(0);
}

export function expeditionCombatSeed(accountId: string, startedAt: string): number {
  return crypto.createHash("sha256").update(`expedition:combat:${accountId}:${startedAt}`).digest().readUInt32BE(0);
}

// ---------------------------------------------------------------------------
// Settlement planning (bounded simulation, no writes)
// ---------------------------------------------------------------------------

interface SettlementPlan {
  revision: number;
  window: SettlementWindowV2;
  checkpointAt: string;
  batch: CycleBatchResultV2 | null;
}

function requireSettleableExpedition(db: DatabaseSync, accountId: string): ExpeditionRow {
  const expedition = new ExpeditionRepository(db).find(accountId);
  if (!expedition || expedition.status !== "active") {
    throw new AppError("validation", "there is no active expedition to settle", { reason: "no_active_expedition" });
  }
  if (expedition.rulesVersion !== CURRENT_RULES_VERSION) {
    throw new AppError(
      "validation",
      `expedition was started under rules version ${expedition.rulesVersion}, this server runs ${CURRENT_RULES_VERSION}; ` +
        "use the explicit local reset/migration path instead of settling",
      { reason: "unsupported_rules_version", expeditionRulesVersion: expedition.rulesVersion, currentRulesVersion: CURRENT_RULES_VERSION },
    );
  }
  return expedition;
}

/** Reads state and simulates up to 480 cycles; throws the same precondition errors settle would. */
function planSettlement(db: DatabaseSync, accountId: string, nowMs: number): SettlementPlan {
  const expedition = requireSettleableExpedition(db, accountId);
  const window = computeSettlementWindowV2(Date.parse(expedition.checkpointAt!), nowMs);
  const revision = new AccountRepository(db).getRevision(accountId);
  if (window.creditedCycles === 0) {
    return { revision, window, checkpointAt: expedition.checkpointAt!, batch: null };
  }

  const frozenParty = expedition.frozenLoadout!;
  const heroes = new HeroRepository(db);
  const liveLevels: Record<string, LevelState> = {};
  for (const member of frozenParty) {
    const hero = heroes.findById(member.heroId);
    if (!hero) throw new AppError("internal", `frozen hero ${member.heroId} no longer exists`);
    liveLevels[member.heroId] = { level: hero.level, xp: hero.xp };
  }

  const batch = simulateExpeditionCyclesV2({
    areaId: expedition.areaId ?? "area_old_road",
    enemyIds: AREA_ENEMY_IDS[expedition.areaId ?? "area_old_road"] ?? AREA_ENEMY_IDS.area_old_road!,
    frozenParty,
    liveLevels,
    combatSeedBase: expedition.seed!,
    rngState: expedition.rngState!,
    unequippedCount: new ItemRepository(db).countUnequipped(accountId),
    cyclesCompletedBefore: expedition.cyclesCompleted,
    cycles: window.creditedCycles,
  });
  return { revision, window, checkpointAt: new Date(window.nextCheckpointMs).toISOString(), batch };
}

/** Pre-transaction plan, or null when a precondition fails (re-raised inside the transaction). */
function tryPlan(db: DatabaseSync, accountId: string, nowMs: number): SettlementPlan | null {
  try {
    return planSettlement(db, accountId, nowMs);
  } catch (error) {
    if (error instanceof AppError) return null;
    throw error;
  }
}

/**
 * Applies a plan inside the mutation transaction. contracts.md "Atomic
 * transaction boundaries": the plan was simulated before BEGIN; if the
 * account's revision moved since then, its inputs may have changed, so it is
 * recomputed here rather than applied stale.
 */
function applySettlement(
  db: DatabaseSync,
  accountId: string,
  precomputed: SettlementPlan | null,
  nowMs: number,
  createdAt: string,
): { result: SettlementResult; changed: boolean } {
  const currentRevision = new AccountRepository(db).getRevision(accountId);
  const plan =
    precomputed && precomputed.revision === currentRevision ? precomputed : planSettlement(db, accountId, nowMs);
  const { window, batch } = plan;

  const base = {
    creditedCycles: window.creditedCycles,
    elapsedMs: window.elapsedMs,
    discardedMs: window.discardedMs,
    checkpointAt: plan.checkpointAt,
  };
  if (!batch) {
    return {
      result: {
        ...base,
        rewards: { xp: 0, gold: 0, items: [] },
        outcomes: { wins: 0, losses: 0 },
        overflow: { convertedCount: 0, convertedGold: 0 },
        recentCycles: [],
      },
      changed: false,
    };
  }

  const { items } = grantRewards(db, accountId, { gold: batch.gold, materials: batch.materials, levels: batch.liveLevels, drops: batch.items }, createdAt);
  new ExpeditionRepository(db).applySettlement(accountId, {
    checkpointAt: plan.checkpointAt,
    rngState: batch.rngState,
    cycles: window.creditedCycles,
    wins: batch.wins,
    losses: batch.losses,
  });

  return {
    result: {
      ...base,
      rewards: { xp: batch.xpPerParticipant, gold: batch.gold, items },
      outcomes: { wins: batch.wins, losses: batch.losses },
      overflow: { convertedCount: batch.overflowConvertedCount, convertedGold: batch.overflowConvertedGold },
      recentCycles: batch.recentCycles.map((c) => ({
        cycle: c.cycle,
        result: c.result,
        rounds: c.rounds,
        gold: c.gold,
        drop: c.drop ? { definitionId: c.drop.definitionId, rarityId: c.drop.rarityId } : null,
        converted: c.converted,
      })),
      ...(batch.latestBattle
        ? {
            latestBattleReport: {
              reportId: `expedition:${accountId}:${plan.checkpointAt}`,
              kind: "pve" as const,
              seed: "",
              rulesVersion: CURRENT_RULES_VERSION,
              createdAt,
              ...presentBattle(batch.latestBattle),
            },
          }
        : {}),
    },
    changed: true,
  };
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export function startExpedition(
  db: DatabaseSync,
  accountId: string,
  request: NoPayloadMutationRequest,
  clock: Clock,
): MutationResult<{ expedition: ExpeditionView }> {
  const expeditions = new ExpeditionRepository(db);
  const dungeons = new DungeonRunRepository(db);
  return runMutation(
    db,
    {
      accountId,
      command: "expedition/start",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: {},
    },
    {
      precondition: () => {
        if (expeditions.isActive(accountId)) {
          throw new AppError("active_expedition", "an expedition is already running");
        }
        if (dungeons.isActive(accountId)) {
          throw new AppError("active_dungeon", "a dungeon run is already active; only one progression activity may run at a time");
        }
        loadLiveParty(db, accountId);
      },
      apply: () => {
        const frozenLoadout = toFrozenMembers(db, loadLiveParty(db, accountId));
        const startedAt = clock.now().toISOString();
        const areaId = new AccountRepository(db).getSelectedAreaId(accountId);
        const rewardSeed = expeditionSeed(accountId, startedAt);
        const combatSeed = expeditionCombatSeed(accountId, startedAt);
        expeditions.start({
          accountId,
          areaId,
          startedAt,
          checkpointAt: startedAt,
          frozenLoadout,
          rulesVersion: CURRENT_RULES_VERSION,
          seed: combatSeed,
          rngState: createRngState(rewardSeed),
        });
        return { result: { expedition: toExpeditionView(expeditions.find(accountId)!) }, changed: true };
      },
    },
  );
}

export function settleExpedition(
  db: DatabaseSync,
  accountId: string,
  request: NoPayloadMutationRequest,
  clock: Clock,
): MutationResult<SettlementResult> {
  const now = clock.now();
  const precomputed = tryPlan(db, accountId, now.getTime());
  return runMutation(
    db,
    {
      accountId,
      command: "expedition/settle",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: {},
    },
    {
      precondition: () => {
        requireSettleableExpedition(db, accountId);
      },
      apply: () => applySettlement(db, accountId, precomputed, now.getTime(), now.toISOString()),
    },
  );
}

export function stopExpedition(
  db: DatabaseSync,
  accountId: string,
  request: NoPayloadMutationRequest,
  clock: Clock,
): MutationResult<{ finalSettlement: SettlementResult; expedition: ExpeditionView }> {
  const expeditions = new ExpeditionRepository(db);
  const now = clock.now();
  const precomputed = tryPlan(db, accountId, now.getTime());
  return runMutation(
    db,
    {
      accountId,
      command: "expedition/stop",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: {},
    },
    {
      precondition: () => {
        requireSettleableExpedition(db, accountId);
      },
      apply: () => {
        const { result: finalSettlement } = applySettlement(db, accountId, precomputed, now.getTime(), now.toISOString());
        expeditions.stop(accountId);
        return { result: { finalSettlement, expedition: toExpeditionView(expeditions.find(accountId)!) }, changed: true };
      },
    },
  );
}
