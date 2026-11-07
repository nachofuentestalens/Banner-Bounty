// Variable-duration expedition settlement (design/studio/contracts.md "M3-05
// addition" sections 2/4/5/6), wiring packages/game's pure settlement3/
// loadout3/combat3 modules into real persistence. Only kind="pve" expedition
// settlement under `EXPEDITION_RULES_VERSION` uses this module; an active
// legacy-rulesVersion expedition keeps using expeditionService.ts's
// untouched fixed-60,000ms path through its next settle/stop.
//
// Implementation simplification (recorded for the evidence report): unlike
// the legacy algorithm's "simulate outside the transaction, recheck revision
// before commit" split (kept for a historically expensive simulation), this
// module runs its whole bounded walk (<=500 battles/call, measured p95
// ~29ms by M3-07's benchmark) directly inside the mutation transaction —
// still "bounded computation...with revision recheck" in spirit, since the
// transaction only opens after runMutation's own revision check, just
// without a second pre-transaction simulate/redo pass that is no longer
// needed at this measured cost.
//
// Reward-timing design decision (not fully pinned by contracts.md's
// pseudocode, recorded here as a bounded CTO-delegable implementation
// choice): combat outcome/events are decided at *roll* time, deterministic
// and independent of credit timing. The reward *amount* (gold/xp/drop,
// including overflow conversion) is computed at *credit* time, against the
// account's unequipped-item count and reward-RNG stream as they stand when
// crediting actually happens — which may be a later settle call than the
// one that rolled a now-cached pending battle. This matches "the same
// instant, deterministic simulation runs... only when its reward is
// *granted* differs" (architecture.md) for the combat half, while letting
// overflow conversion reflect genuinely current inventory state rather than
// a stale roll-time snapshot.
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getAreaDefinition, getRewardProfile, M3_RULES, type ClassIdV3, type RaceIdV3, type RewardProfile, type SkillLoadoutV3 } from "@banner-and-bounty/content";
import {
  applyDuePendingChangesV3,
  applyXpGain,
  buildEnemyCombatantsV3,
  resolveAreaOrDungeonReward,
  runSettlementWalkV3,
  simulateBattleV3,
  toHeroCombatantsV3,
  type BattleRollV3,
  type HeroCombatantInputV3,
  type PendingSkillChangeV3,
  type RollBattleFnV3,
  type RollOutcomeV3,
  type SettlementStateV3,
} from "@banner-and-bounty/game";
import type { CreditedBattleDTO, ItemInstance, PendingBattleViewDTO, SettlementResultV3DTO } from "@banner-and-bounty/contracts";
import { AppError } from "../errors.js";
import { AccountRepository } from "../repositories/accountRepository.js";
import { BattleReportRepository } from "../repositories/battleReportRepository.js";
import { ExpeditionRepository, type ExpeditionRow, type FrozenPartyMember } from "../repositories/expeditionRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { ItemRepository } from "../repositories/itemRepository.js";
import { PendingSkillChangeRepository, type PendingSkillChangeRow } from "../repositories/pendingSkillChangeRepository.js";
import { SettlementAggregateRepository } from "../repositories/settlementAggregateRepository.js";
import { toBattleEventDTOs, toBattleResultDTO, toBattleUnitDTOs } from "./battlePresentation.js";
import { grantRewards } from "./partyLoadout.js";
import { AREA_ENEMY_IDS } from "./expeditionService.js";

export const FEED_RETENTION_LIMIT = 50;
export const AGGREGATE_RETENTION_LIMIT = 20;

function combatSeedForOrdinalV3(baseSeed: number, ordinal: number): number {
  let x = (baseSeed + ordinal * 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function buildPartyV3(db: DatabaseSync, frozenLoadout: readonly FrozenPartyMember[]): HeroCombatantInputV3[] {
  const heroes = new HeroRepository(db);
  return frozenLoadout.map((member) => {
    const liveHero = heroes.findById(member.heroId);
    if (!liveHero) throw new AppError("internal", `frozen hero ${member.heroId} no longer exists`);
    return {
      id: member.heroId,
      primaryClassId: member.primaryClassId as ClassIdV3,
      secondaryClassId: member.secondaryClassId as ClassIdV3 | null,
      primarySpecializationId: liveHero.primarySpecializationId ?? null,
      raceId: (liveHero.raceId ?? "race_vesper") as RaceIdV3,
      level: member.level,
      slotIndex: member.slotIndex,
      equipment: member.equipment,
      skillLoadout: member.skillLoadout as SkillLoadoutV3,
    };
  });
}

function rowToPendingV3(row: PendingSkillChangeRow): PendingSkillChangeV3 {
  return {
    heroId: row.heroId,
    active: row.active,
    passive: row.passive,
    boundaryOrdinal: row.boundaryOrdinal,
    acceptedAt: Date.parse(row.acceptedAt),
    status: row.status,
    appliedAt: row.appliedAt ? Date.parse(row.appliedAt) : null,
  };
}

/** Reconstructs settlement3's persisted SettlementStateV3 from the expedition row + (if pending) its battle_reports row. */
function loadInitialStateV3(db: DatabaseSync, expedition: ExpeditionRow): SettlementStateV3 {
  let pending = null;
  if (expedition.pendingBattleReportId) {
    const row = new BattleReportRepository(db).findOwnedBy(expedition.pendingBattleReportId, expedition.accountId);
    if (!row || row.ordinal === null || row.nominalDurationMs === null) {
      throw new AppError("internal", `expedition pending battle ${expedition.pendingBattleReportId} is missing or malformed`);
    }
    pending = {
      reportId: row.reportId,
      ordinal: row.ordinal,
      roll: {
        resolvedRounds: (row.result as { rounds: number }).rounds,
        nominalDurationMs: row.nominalDurationMs,
        result: (row.result as { outcome: string }).outcome,
        payload: null,
      },
    };
  }
  return { checkpointAt: Date.parse(expedition.checkpointAt!), rngState: expedition.rngState!, pending, nextOrdinal: expedition.nextOrdinal };
}

interface RolledBattleV3 {
  reportId: string;
  battle: ReturnType<typeof simulateBattleV3>;
}

interface WalkOutcomeV3 {
  result: ReturnType<typeof runSettlementWalkV3>;
  rolled: Map<number, RolledBattleV3>;
  appliedHeroIds: Set<string>;
}

function runWalkV3(
  db: DatabaseSync,
  expedition: ExpeditionRow,
  party: HeroCombatantInputV3[],
  enemyIds: readonly string[],
  msPerRound: number,
  combatSeedBase: number,
  pendingRows: readonly PendingSkillChangeV3[],
  effectiveNow: number,
): WalkOutcomeV3 {
  const runId = expedition.runId!;
  const rolled = new Map<number, RolledBattleV3>();
  const appliedHeroIds = new Set<string>();
  let currentOrdinal = -1;
  let stillPending = [...pendingRows];

  const rollBattle: RollBattleFnV3 = (rngState): RollOutcomeV3 => {
    const ordinal = currentOrdinal;
    const enemies = buildEnemyCombatantsV3(enemyIds.map((enemyId, slotIndex) => ({ enemyId, slotIndex })));
    const heroes = toHeroCombatantsV3(party);
    const seed = combatSeedForOrdinalV3(combatSeedBase, ordinal);
    const battle = simulateBattleV3(heroes, enemies, "pve", seed);
    const reportId = `${runId}:${ordinal}`;
    rolled.set(ordinal, { reportId, battle });
    const roll: BattleRollV3 = { resolvedRounds: battle.rounds, nominalDurationMs: battle.rounds * msPerRound, result: battle.result, payload: null };
    return { roll, nextRngState: rngState };
  };

  const state = loadInitialStateV3(db, expedition);
  const result = runSettlementWalkV3(state, effectiveNow, rollBattle, {
    capMs: M3_RULES.offlineCapMs,
    maxBattlesPerCall: M3_RULES.maxBattlesPerSettlement,
    reportIdFor: (ordinal) => `${runId}:${ordinal}`,
    beforeRoll: (ordinal) => {
      currentOrdinal = ordinal;
      if (stillPending.length === 0) return;
      const applied = applyDuePendingChangesV3(stillPending, ordinal, effectiveNow);
      stillPending = [...applied.stillPending];
      for (const change of applied.applied) appliedHeroIds.add(change.heroId);
      for (const [heroId, loadout] of applied.appliedLoadouts) {
        const member = party.find((p) => p.id === heroId);
        if (member) Object.assign(member, { skillLoadout: loadout });
      }
    },
  });

  return { result, rolled, appliedHeroIds };
}

function creditBattleReward(
  db: DatabaseSync,
  accountId: string,
  frozenLoadout: readonly FrozenPartyMember[],
  outcome: "win" | "loss" | "draw",
  profile: RewardProfile,
  rewardRngState: number,
  unequippedCountBefore: number,
  nowIso: string,
): { rewards: { xp: number; gold: number; items: ItemInstance[] }; nextRngState: number; unequippedCountAfter: number; overflowConvertedCount: number; overflowConvertedGold: number } {
  if (outcome !== "win") {
    return { rewards: { xp: 0, gold: 0, items: [] }, nextRngState: rewardRngState, unequippedCountAfter: unequippedCountBefore, overflowConvertedCount: 0, overflowConvertedGold: 0 };
  }
  const reward = resolveAreaOrDungeonReward(rewardRngState, profile, unequippedCountBefore);
  const levels: Record<string, { level: number; xp: number }> = {};
  const heroes = new HeroRepository(db);
  for (const member of frozenLoadout) {
    const hero = heroes.findById(member.heroId);
    if (!hero) continue;
    levels[member.heroId] = applyXpGain({ level: hero.level, xp: hero.xp }, reward.xp);
  }
  const { items } = grantRewards(db, accountId, { gold: reward.gold, materials: reward.materials, levels, drops: reward.itemInstance ? [reward.itemInstance] : [] }, nowIso);
  return {
    rewards: { xp: reward.xp, gold: reward.gold, items },
    nextRngState: reward.nextRngState,
    unequippedCountAfter: reward.unequippedCountAfter,
    overflowConvertedCount: reward.overflowConverted ? 1 : 0,
    overflowConvertedGold: reward.overflowConverted ? reward.gold - profile.gold : 0,
  };
}

function runEvictionV3(db: DatabaseSync, accountId: string): void {
  const reports = new BattleReportRepository(db);
  const aggregates = new SettlementAggregateRepository(db);
  type Acc = { fromOrdinal: number; toOrdinal: number; fromSequence: number; toSequence: number; wins: number; losses: number; rewards: { xp: number; gold: number; items: unknown[] } };
  const byRun = new Map<string, Acc>();

  for (;;) {
    const victim = reports.oldestBeyondRetention(accountId, FEED_RETENTION_LIMIT);
    if (!victim) break;
    const runId = victim.runId ?? "unknown";
    const outcome = (victim.result as { outcome?: string } | undefined)?.outcome;
    const entry = byRun.get(runId) ?? {
      fromOrdinal: victim.ordinal!,
      toOrdinal: victim.ordinal!,
      fromSequence: victim.completionSequence!,
      toSequence: victim.completionSequence!,
      wins: 0,
      losses: 0,
      rewards: { xp: 0, gold: 0, items: [] as unknown[] },
    };
    entry.fromOrdinal = Math.min(entry.fromOrdinal, victim.ordinal!);
    entry.toOrdinal = Math.max(entry.toOrdinal, victim.ordinal!);
    entry.fromSequence = Math.min(entry.fromSequence, victim.completionSequence!);
    entry.toSequence = Math.max(entry.toSequence, victim.completionSequence!);
    if (outcome === "win") entry.wins += 1;
    else entry.losses += 1;
    if (victim.rewards) {
      entry.rewards.xp += victim.rewards.xp;
      entry.rewards.gold += victim.rewards.gold;
      entry.rewards.items = [...entry.rewards.items, ...victim.rewards.items];
    }
    byRun.set(runId, entry);
    reports.deleteByReportId(victim.reportId);
  }

  for (const [runId, acc] of byRun) {
    aggregates.insert({
      aggregateId: crypto.randomUUID(),
      accountId,
      runId,
      fromOrdinal: acc.fromOrdinal,
      toOrdinal: acc.toOrdinal,
      fromSequence: acc.fromSequence,
      toSequence: acc.toSequence,
      wins: acc.wins,
      losses: acc.losses,
      elapsedMs: 0,
      creditedMs: 0,
      discardedMs: 0,
      rewards: acc.rewards,
      createdAt: new Date().toISOString(),
    });
  }
}

export interface SettleWalkOutcomeV3 {
  dto: SettlementResultV3DTO;
  changed: boolean;
}

/**
 * The full settle step: load state, run the walk, apply every resulting
 * write (new/credited battle reports, pending-skill applications, reward
 * ledger effects, eviction/aggregate bookkeeping, expedition row update).
 * Caller must already be inside the mutation transaction and must already
 * have verified `expedition.status === "active"` and
 * `expedition.rulesVersion === EXPEDITION_RULES_VERSION`.
 */
export function settleWalkV3(db: DatabaseSync, accountId: string, expedition: ExpeditionRow, effectiveNow: number, nowIso: string): SettleWalkOutcomeV3 {
  const party = buildPartyV3(db, expedition.frozenLoadout!);
  const area = getAreaDefinition(expedition.areaId ?? "area_old_road");
  const profile = getRewardProfile(area.rewardProfileId);
  const enemyIds = AREA_ENEMY_IDS[expedition.areaId ?? "area_old_road"] ?? AREA_ENEMY_IDS.area_old_road!;
  const pendingChangeRepo = new PendingSkillChangeRepository(db);
  const pendingRowsRaw = pendingChangeRepo.listPendingForRun(accountId, expedition.runId!);
  const pendingRows = pendingRowsRaw.map(rowToPendingV3);
  const msPerRound = expedition.msPerRound ?? M3_RULES.msPerRound;

  const { result: walk, rolled, appliedHeroIds } = runWalkV3(db, expedition, party, enemyIds, msPerRound, expedition.seed!, pendingRows, effectiveNow);

  // --- Persist boundary-apply writes (live hero skillLoadout + pending row status) ---
  const heroes = new HeroRepository(db);
  for (const heroId of appliedHeroIds) {
    const member = party.find((p) => p.id === heroId);
    if (!member) continue;
    heroes.setLoadout(heroId, { active: [...member.skillLoadout.active] as [string, string], passive: [...member.skillLoadout.passive] as [string, string] });
    const row = pendingRowsRaw.find((p) => p.heroId === heroId);
    if (row) pendingChangeRepo.markApplied(accountId, heroId, row.requestId, nowIso);
  }

  // --- Insert every newly-rolled battle this call (creditedAt always null at insert; a uniform credit pass follows) ---
  const reports = new BattleReportRepository(db);
  const accounts = new AccountRepository(db);
  let nextSequence = accounts.getNextCompletionSequence(accountId);
  const sortedRolledOrdinals = [...rolled.keys()].sort((a, b) => a - b);
  for (const ordinal of sortedRolledOrdinals) {
    const { reportId, battle } = rolled.get(ordinal)!;
    reports.insert({
      reportId,
      accountId,
      kind: "pve",
      participantsSnapshot: { units: toBattleUnitDTOs(battle.units) },
      seed: "",
      rulesVersion: expedition.rulesVersion!,
      events: toBattleEventDTOs(battle.events),
      result: toBattleResultDTO(battle),
      createdAt: nowIso,
      ordinal,
      runId: expedition.runId,
      completionSequence: nextSequence++,
      nominalDurationMs: battle.rounds * msPerRound,
      creditedAt: null,
      rewards: null,
    });
  }
  accounts.setNextCompletionSequence(accountId, nextSequence);

  // --- Uniform credit pass, in ascending ordinal order (settlement3 already orders creditedBattles this way) ---
  let rewardRngState = expedition.rngState!;
  let unequippedCount = new ItemRepository(db).countUnequipped(accountId);
  const creditedDTOs: CreditedBattleDTO[] = [];
  let totalXp = 0;
  let totalGold = 0;
  const totalItems: ItemInstance[] = [];
  let overflowConvertedCount = 0;
  let overflowConvertedGold = 0;
  let winsThisCall = 0;
  let lossesThisCall = 0;

  for (const credited of walk.creditedBattles) {
    const outcome = creditBattleReward(db, accountId, expedition.frozenLoadout!, credited.roll.result as "win" | "loss" | "draw", profile, rewardRngState, unequippedCount, nowIso);
    rewardRngState = outcome.nextRngState;
    unequippedCount = outcome.unequippedCountAfter;
    reports.credit(credited.reportId, nowIso, outcome.rewards);
    totalXp += outcome.rewards.xp;
    totalGold += outcome.rewards.gold;
    totalItems.push(...outcome.rewards.items);
    overflowConvertedCount += outcome.overflowConvertedCount;
    overflowConvertedGold += outcome.overflowConvertedGold;
    if (credited.roll.result === "win") winsThisCall += 1;
    else lossesThisCall += 1;
    creditedDTOs.push({
      reportId: credited.reportId,
      ordinal: credited.ordinal,
      result: credited.roll.result as "win" | "loss" | "draw",
      resolvedRounds: credited.roll.resolvedRounds,
      nominalDurationMs: credited.roll.nominalDurationMs,
      rewards: outcome.rewards,
    });
  }

  // --- Retention/eviction (section 6) ---
  runEvictionV3(db, accountId);

  // --- Persist expedition row ---
  const newPendingReportId = walk.state.pending?.reportId ?? null;
  new ExpeditionRepository(db).applySettlementV3(accountId, {
    checkpointAt: new Date(walk.state.checkpointAt).toISOString(),
    rngState: rewardRngState,
    pendingBattleReportId: newPendingReportId,
    nextOrdinal: walk.state.nextOrdinal,
    battlesCredited: creditedDTOs.length,
    wins: winsThisCall,
    losses: lossesThisCall,
  });

  const pendingBattleView: PendingBattleViewDTO | null = newPendingReportId
    ? (() => {
        const row = reports.findOwnedBy(newPendingReportId, accountId);
        if (!row) return null;
        return {
          reportId: row.reportId,
          ordinal: row.ordinal!,
          resolvedRounds: (row.result as { rounds: number }).rounds,
          nominalDurationMs: row.nominalDurationMs!,
          result: (row.result as { outcome: "win" | "loss" | "draw" }).outcome,
          events: row.events as PendingBattleViewDTO["events"],
          credited: false,
        };
      })()
    : null;

  const dto: SettlementResultV3DTO = {
    creditedBattles: creditedDTOs,
    pendingBattle: pendingBattleView,
    elapsedMs: walk.elapsedMs,
    discardedMs: walk.discardedMs,
    checkpointAt: new Date(walk.state.checkpointAt).toISOString(),
    rewards: { xp: totalXp, gold: totalGold, items: totalItems },
    overflow: { convertedCount: overflowConvertedCount, convertedGold: overflowConvertedGold },
  };

  return { dto, changed: walk.revisionChanged };
}

/** `/hero/loadout/queue`'s and `/cancel-pending`'s "run the walk first" shared step. */
export function requireActiveV3Expedition(db: DatabaseSync, accountId: string): ExpeditionRow {
  const expeditions = new ExpeditionRepository(db);
  const expedition = expeditions.find(accountId);
  if (!expedition || expedition.status !== "active") {
    throw new AppError("validation", "there is no active expedition", { reason: "no_active_expedition" });
  }
  return expedition;
}
