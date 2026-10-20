import { replayUnits } from "./battlePresentation.js";
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ExpeditionViewDTO, NoPayloadMutationRequest, SettlementResultDTO } from "@banner-and-bounty/contracts";
import {
  type CycleBatchResult,
  type LevelState,
  type SettlementWindow,
  computeSettlementWindow,
  createRngState,
  simulateExpeditionCycles,
} from "@banner-and-bounty/game";
import type { Clock } from "../clock.js";
import { AppError } from "../errors.js";
import { runMutation, type MutationResult } from "../mutation.js";
import { AccountRepository } from "../repositories/accountRepository.js";
import { ExpeditionRepository, type ExpeditionRow } from "../repositories/expeditionRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { ItemRepository } from "../repositories/itemRepository.js";
import { CURRENT_RULES_VERSION } from "../rulesVersion.js";
import { grantRewards, loadLiveParty, toFrozenMembers } from "./partyLoadout.js";

// Response shapes live in packages/contracts. Settlement adds outcome totals,
// overflow conversion (ui-spec.md needs it to show inventory.overflow copy)
// and a bounded recent-cycle log to the contracts.md settle shape.
type ExpeditionView = ExpeditionViewDTO;
type SettlementResult = SettlementResultDTO;

export function toExpeditionView(row: ExpeditionRow): ExpeditionView {
  return {
    status: row.status,
    startedAt: row.startedAt,
    checkpointAt: row.checkpointAt,
    subCycleRemainderMs: row.subCycleRemainderMs,
    frozenLoadout: row.frozenLoadout,
    rulesVersion: row.rulesVersion,
    cyclesCompleted: row.cyclesCompleted,
    wins: row.wins,
    losses: row.losses,
  };
}

/** contracts.md: rngState = seed(accountId, startedAt). */
export function expeditionSeed(accountId: string, startedAt: string): number {
  return crypto.createHash("sha256").update(`expedition:${accountId}:${startedAt}`).digest().readUInt32BE(0);
}

// ---------------------------------------------------------------------------
// Settlement planning (bounded simulation, no writes)
// ---------------------------------------------------------------------------

interface SettlementPlan {
  revision: number;
  window: SettlementWindow;
  checkpointAt: string;
  batch: CycleBatchResult | null;
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
  const window = computeSettlementWindow(Date.parse(expedition.checkpointAt!), nowMs);
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

  const batch = simulateExpeditionCycles({
    frozenParty,
    liveLevels,
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
 * account's revision moved since then, its inputs (levels, inventory count,
 * checkpoint, rngState) may have changed, so it is recomputed here rather
 * than applied stale. Rewards, inventory rows and the checkpoint commit in
 * this one transaction or not at all.
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

  const { items } = grantRewards(db, accountId, { gold: batch.gold, levels: batch.liveLevels, drops: batch.items }, createdAt);
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
      recentCycles: [...batch.recentCycles],
      ...(batch.latestBattle ? { latestBattleReport: {
        reportId: `expedition:${accountId}:${plan.checkpointAt}`,
        kind: "pve" as const,
        participantsSnapshot: { units: replayUnits(batch.latestBattle.heroes, batch.latestBattle.enemies) },
        seed: "", rulesVersion: CURRENT_RULES_VERSION, createdAt,
        events: [...batch.latestBattle.battle.events],
        result: { outcome: batch.latestBattle.battle.result, rounds: batch.latestBattle.battle.rounds, finalHp: batch.latestBattle.battle.finalHp },
      } } : {}),
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
        loadLiveParty(db, accountId);
      },
      apply: () => {
        const frozenLoadout = toFrozenMembers(db, loadLiveParty(db, accountId));
        const startedAt = clock.now().toISOString();
        const seed = expeditionSeed(accountId, startedAt);
        expeditions.start({
          accountId,
          startedAt,
          checkpointAt: startedAt,
          frozenLoadout,
          rulesVersion: CURRENT_RULES_VERSION,
          seed,
          rngState: createRngState(seed),
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
        // Settle every eligible whole cycle, then discard the sub-cycle
        // remainder by ending the run in the same transaction.
        const { result: finalSettlement } = applySettlement(db, accountId, precomputed, now.getTime(), now.toISOString());
        expeditions.stop(accountId);
        return { result: { finalSettlement, expedition: toExpeditionView(expeditions.find(accountId)!) }, changed: true };
      },
    },
  );
}
