// design/studio/contracts.md M3-05 addition section 8: POST
// /hero/respec-primary/preview, POST /hero/respec-primary, POST
// /hero/secondary-class/preview.
import type { DatabaseSync } from "node:sqlite";
import { autoFillLoadoutV3, getClassV3, getSkillV3, M3_RULES, type ClassIdV3 } from "@banner-and-bounty/content";
import { respecCostV3 } from "@banner-and-bounty/game";
import type { RespecPreviewRequest, RespecPreviewResultDTO, RespecPrimaryRequest, SecondaryClassPreviewRequest, SecondaryClassPreviewResultDTO } from "@banner-and-bounty/contracts";
import { AppError } from "../errors.js";
import { runMutation, type MutationResult } from "../mutation.js";
import { AccountRepository } from "../repositories/accountRepository.js";
import { DungeonRunRepository } from "../repositories/dungeonRunRepository.js";
import { ExpeditionRepository } from "../repositories/expeditionRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { ServerClockRepository } from "../repositories/serverClockRepository.js";
import { attachEffectiveStats } from "./partyLoadout.js";

function requireOwnedHero(heroes: HeroRepository, heroId: string, accountId: string) {
  const hero = heroes.findById(heroId);
  if (!hero) throw new AppError("not_found", `unknown heroId ${heroId}`);
  if (hero.accountId !== accountId) throw new AppError("forbidden", `heroId ${heroId} does not belong to this account`);
  return hero;
}

export function previewRespecPrimary(db: DatabaseSync, accountId: string, request: RespecPreviewRequest): RespecPreviewResultDTO {
  const heroes = new HeroRepository(db);
  const hero = requireOwnedHero(heroes, request.heroId, accountId);
  const cost = respecCostV3(hero.level);
  const highWaterMs = new ServerClockRepository(db).peek();
  const lastRespecAtMs = hero.lastRespecAt ? Date.parse(hero.lastRespecAt) : null;
  const nextEligibleAtMs = lastRespecAtMs !== null ? lastRespecAtMs + M3_RULES.respecCooldownMs : null;
  const cooldownEligible = nextEligibleAtMs === null || highWaterMs >= nextEligibleAtMs;
  return {
    heroId: hero.heroId,
    currentPrimaryClassId: hero.primaryClassId,
    currentSecondaryClassId: hero.secondaryClassId,
    cost,
    cooldownEligible,
    nextEligibleAt: nextEligibleAtMs !== null ? new Date(nextEligibleAtMs).toISOString() : null,
    revision: new AccountRepository(db).getRevision(accountId),
  };
}

export function previewSecondaryClassSwitch(db: DatabaseSync, accountId: string, request: SecondaryClassPreviewRequest): SecondaryClassPreviewResultDTO {
  const heroes = new HeroRepository(db);
  const hero = requireOwnedHero(heroes, request.heroId, accountId);
  if (!isKnownClassV3(request.candidateSecondaryClassId)) {
    throw new AppError("not_found", `unknown candidate class ${request.candidateSecondaryClassId}`);
  }
  const candidate = request.candidateSecondaryClassId as ClassIdV3;
  const willClear = (skillId: string): boolean => {
    if (!skillId) return false;
    const skill = getSkillV3(skillId);
    return skill.classId !== hero.primaryClassId && skill.classId !== candidate;
  };
  return {
    heroId: hero.heroId,
    slotsToClear: {
      active: [willClear(hero.skillLoadout.active[0]), willClear(hero.skillLoadout.active[1])],
      passive: [willClear(hero.skillLoadout.passive[0]), willClear(hero.skillLoadout.passive[1])],
    },
    revision: new AccountRepository(db).getRevision(accountId),
  };
}

function isKnownClassV3(id: string): boolean {
  try {
    getClassV3(id);
    return true;
  } catch {
    return false;
  }
}

export function respecPrimary(db: DatabaseSync, accountId: string, request: RespecPrimaryRequest, clockNowMs: number): MutationResult<{ hero: ReturnType<typeof attachEffectiveStats> }> {
  const heroes = new HeroRepository(db);
  const accounts = new AccountRepository(db);

  return runMutation(
    db,
    {
      accountId,
      command: "hero/respec-primary",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { heroId: request.heroId, newPrimaryClassId: request.newPrimaryClassId, newSecondaryClassId: request.newSecondaryClassId },
    },
    {
      precondition: () => {
        const hero = requireOwnedHero(heroes, request.heroId, accountId);
        if (new ExpeditionRepository(db).isActive(accountId)) throw new AppError("active_expedition", "an expedition is already running");
        if (new DungeonRunRepository(db).isActive(accountId)) throw new AppError("active_dungeon", "a dungeon run is already active");

        const highWaterMs = new ServerClockRepository(db).peek();
        const lastRespecAtMs = hero.lastRespecAt ? Date.parse(hero.lastRespecAt) : null;
        const nextEligibleAtMs = lastRespecAtMs !== null ? lastRespecAtMs + M3_RULES.respecCooldownMs : null;
        if (nextEligibleAtMs !== null && highWaterMs < nextEligibleAtMs) {
          throw new AppError("validation", "primary respec is on cooldown", { reason: "cooldown", nextEligibleAt: new Date(nextEligibleAtMs).toISOString() });
        }
        if (!isKnownClassV3(request.newPrimaryClassId)) throw new AppError("validation", `unknown primary class ${request.newPrimaryClassId}`);
        if (request.newPrimaryClassId === hero.primaryClassId) {
          throw new AppError("validation", "new primary class matches the current primary; use free secondary switching", { reason: "same_primary" });
        }
        const resultingSecondary = request.newSecondaryClassId === undefined ? hero.secondaryClassId : request.newSecondaryClassId;
        if (resultingSecondary !== null && resultingSecondary === request.newPrimaryClassId) {
          throw new AppError("validation", "resulting secondary class cannot equal the new primary class; supply a different class or null explicitly", {
            reason: "secondary_conflict_requires_explicit_choice",
          });
        }
        const cost = respecCostV3(hero.level);
        const balance = accounts.getMaterials(accountId);
        if (accounts.getGold(accountId) < cost.gold || balance.scrap < cost.scrap || balance.sigil < cost.sigil) {
          throw new AppError("validation", "insufficient funds for primary respec", { reason: "insufficient_funds", cost });
        }
      },
      apply: () => {
        const hero = heroes.findById(request.heroId)!;
        const cost = respecCostV3(hero.level);
        accounts.spendGold(accountId, cost.gold);
        accounts.spendMaterials(accountId, { scrap: cost.scrap, sigil: cost.sigil, core: 0 });
        const resultingSecondary = request.newSecondaryClassId === undefined ? hero.secondaryClassId : request.newSecondaryClassId;
        const newLoadout = autoFillLoadoutV3(request.newPrimaryClassId as ClassIdV3, hero.level);
        const effectiveNowMs = new ServerClockRepository(db).advance(clockNowMs);
        heroes.applyPrimaryRespec(request.heroId, {
          primaryClassId: request.newPrimaryClassId,
          secondaryClassId: resultingSecondary,
          skillLoadout: newLoadout,
          lastRespecAt: new Date(effectiveNowMs).toISOString(),
        });
        return { result: { hero: attachEffectiveStats(db, accountId, heroes.findById(request.heroId)!) }, changed: true };
      },
    },
  );
}
