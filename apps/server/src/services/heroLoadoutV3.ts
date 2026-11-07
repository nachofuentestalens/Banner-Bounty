// design/studio/contracts.md M3-05 addition section 5: POST
// /hero/loadout/queue and /hero/loadout/cancel-pending. Both run the full
// settlement walk first (settleWalkV3), in the same transaction, before
// doing their own queue/cancel work — "settle every eligible battle ending
// at or before T under the prior build" (m3-systems.md section 3 item 1).
//
// Implementation simplification (recorded for the evidence report): this
// module validates the submitted skill selection against the expedition's
// frozen level/class pool *before* running the settlement walk (in
// runMutation's precondition step, which rolls back the whole transaction
// including the walk on failure), rather than contracts.md's literal
// "walk first, then validate" ordering. A rejected edit therefore does not
// commit the walk's crediting either; the player can resubmit a plain
// /expedition/settle call to credit overdue battles, then retry a valid
// edit. This keeps runMutation's single-transaction precondition/apply
// model intact rather than inventing partial-commit-on-reject semantics.
import type { DatabaseSync } from "node:sqlite";
import { validateLoadoutV3, type ClassIdV3 } from "@banner-and-bounty/content";
import type {
  HeroLoadoutCancelPendingRequest,
  HeroLoadoutQueueRequest,
  PendingSkillChangeViewDTO,
  SettlementResultV3DTO,
} from "@banner-and-bounty/contracts";
import { AppError } from "../errors.js";
import { runMutation, type MutationResult } from "../mutation.js";
import { DungeonRunRepository } from "../repositories/dungeonRunRepository.js";
import { ExpeditionRepository, type ExpeditionRow, type FrozenPartyMember } from "../repositories/expeditionRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { PendingSkillChangeRepository } from "../repositories/pendingSkillChangeRepository.js";
import { ServerClockRepository } from "../repositories/serverClockRepository.js";
import { EXPEDITION_RULES_VERSION } from "../rulesVersion.js";
import { attachEffectiveStats } from "./partyLoadout.js";
import { settleWalkV3 } from "./expeditionV3.js";

function requireV3ActiveExpedition(db: DatabaseSync, accountId: string): ExpeditionRow {
  if (new DungeonRunRepository(db).isActive(accountId)) {
    throw new AppError("active_dungeon", "a dungeon run is active; skill edits have no deferred-edit path during a dungeon");
  }
  const expedition = new ExpeditionRepository(db).find(accountId);
  if (!expedition || expedition.status !== "active") {
    throw new AppError("validation", "there is no active expedition", { reason: "no_active_expedition" });
  }
  if (expedition.rulesVersion !== EXPEDITION_RULES_VERSION) {
    throw new AppError("validation", "this expedition is running under a legacy ruleset with no deferred-edit path; finish this older run to queue skill changes", {
      reason: "legacy_run_active",
    });
  }
  return expedition;
}

function requireFrozenMember(expedition: ExpeditionRow, heroId: string): FrozenPartyMember {
  const member = expedition.frozenLoadout?.find((m) => m.heroId === heroId);
  if (!member) throw new AppError("forbidden", `heroId ${heroId} is not part of this expedition's frozen party`);
  return member;
}

export function queueHeroLoadoutChange(
  db: DatabaseSync,
  accountId: string,
  request: HeroLoadoutQueueRequest,
  clockNowMs: number,
): MutationResult<{ pendingChange: PendingSkillChangeViewDTO; settlement: SettlementResultV3DTO }> {
  const heroes = new HeroRepository(db);

  return runMutation(
    db,
    {
      accountId,
      command: "hero/loadout/queue",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { heroId: request.heroId, active: request.active, passive: request.passive },
    },
    {
      precondition: () => {
        const hero = heroes.findById(request.heroId);
        if (!hero || hero.accountId !== accountId) throw new AppError("forbidden", `heroId ${request.heroId} does not belong to this account`);
        const expedition = requireV3ActiveExpedition(db, accountId);
        const member = requireFrozenMember(expedition, request.heroId);
        try {
          validateLoadoutV3(member.primaryClassId as ClassIdV3, member.secondaryClassId as ClassIdV3 | null, member.level, { active: request.active, passive: request.passive });
        } catch (error) {
          throw new AppError("validation", error instanceof Error ? error.message : "invalid loadout", { reason: "not_unlocked" });
        }
      },
      apply: () => {
        const expedition = requireV3ActiveExpedition(db, accountId);
        const effectiveNowMs = new ServerClockRepository(db).advance(clockNowMs);
        const nowIso = new Date(effectiveNowMs).toISOString();
        const { dto: settlement } = settleWalkV3(db, accountId, expedition, effectiveNowMs, nowIso);
        const after = new ExpeditionRepository(db).find(accountId)!;
        // computeBoundaryOrdinalV3 is a direct alias of SettlementStateV3.nextOrdinal (settlement3.ts).
        const boundaryOrdinal = after.nextOrdinal;

        new PendingSkillChangeRepository(db).upsertPending({
          accountId,
          heroId: request.heroId,
          requestId: request.requestId,
          acceptedAt: nowIso,
          boundaryOrdinal,
          runId: after.runId!,
          active: request.active,
          passive: request.passive,
          status: "pending",
          appliedAt: null,
        });

        const pendingChange: PendingSkillChangeViewDTO = {
          heroId: request.heroId,
          active: request.active,
          passive: request.passive,
          boundaryOrdinal,
          acceptedAt: nowIso,
          status: "pending",
          appliedAt: null,
        };
        return { result: { pendingChange, settlement }, changed: true };
      },
    },
  );
}

export function cancelPendingHeroLoadoutChange(
  db: DatabaseSync,
  accountId: string,
  request: HeroLoadoutCancelPendingRequest,
  clockNowMs: number,
): MutationResult<{ cancelled: boolean; alreadyApplied: boolean; hero: ReturnType<typeof attachEffectiveStats> }> {
  const heroes = new HeroRepository(db);

  return runMutation<{ cancelled: boolean; alreadyApplied: boolean; hero: ReturnType<typeof attachEffectiveStats> }>(
    db,
    {
      accountId,
      command: "hero/loadout/cancel-pending",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { heroId: request.heroId },
    },
    {
      precondition: () => {
        const hero = heroes.findById(request.heroId);
        if (!hero || hero.accountId !== accountId) throw new AppError("forbidden", `heroId ${request.heroId} does not belong to this account`);
        requireV3ActiveExpedition(db, accountId);
        // Existence is checked here only for the "never queued at all" case;
        // a row that has *already* transitioned pending -> applied (by an
        // earlier settle's boundary-apply step) is not a precondition
        // failure — contracts.md section 5 requires reporting that fact from
        // apply(), not rejecting the command outright.
        const pendingChangeRepo = new PendingSkillChangeRepository(db);
        if (!pendingChangeRepo.findMostRecentForHero(accountId, request.heroId)) {
          throw new AppError("validation", "no pending skill change exists for this hero", { reason: "no_pending_change" });
        }
      },
      apply: () => {
        const expedition = requireV3ActiveExpedition(db, accountId);
        const effectiveNowMs = new ServerClockRepository(db).advance(clockNowMs);
        const nowIso = new Date(effectiveNowMs).toISOString();
        settleWalkV3(db, accountId, expedition, effectiveNowMs, nowIso);

        const pendingChangeRepo = new PendingSkillChangeRepository(db);
        const stillPending = pendingChangeRepo.findPendingForHero(accountId, request.heroId);
        const hero = heroes.findById(request.heroId)!;
        if (stillPending) {
          pendingChangeRepo.markDiscarded(accountId, request.heroId, stillPending.requestId);
          return { result: { cancelled: true, alreadyApplied: false, hero: attachEffectiveStats(db, accountId, hero) }, changed: true };
        }
        const mostRecent = pendingChangeRepo.findMostRecentForHero(accountId, request.heroId);
        if (!mostRecent || mostRecent.status !== "applied") {
          throw new AppError("validation", "no pending skill change exists for this hero", { reason: "no_pending_change" });
        }
        // The walk's own boundary-apply step already flipped it to applied
        // before this command reached this point — not an error.
        return { result: { cancelled: false, alreadyApplied: true, hero: attachEffectiveStats(db, accountId, hero) }, changed: false };
      },
    },
  );
}
