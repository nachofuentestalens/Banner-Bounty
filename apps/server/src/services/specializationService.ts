// design/studio/contracts.md M3-05 addition section 7: POST
// /hero/specialization/primary.
import type { DatabaseSync } from "node:sqlite";
import { validateSpecializationV3, type ClassIdV3 } from "@banner-and-bounty/content";
import type { HeroSpecializationPrimaryRequest } from "@banner-and-bounty/contracts";
import { AppError } from "../errors.js";
import { runMutation, type MutationResult } from "../mutation.js";
import { DungeonRunRepository } from "../repositories/dungeonRunRepository.js";
import { ExpeditionRepository } from "../repositories/expeditionRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { attachEffectiveStats } from "./partyLoadout.js";

export const SPECIALIZATION_MIN_LEVEL = 3;

export function setPrimarySpecialization(
  db: DatabaseSync,
  accountId: string,
  request: HeroSpecializationPrimaryRequest,
): MutationResult<{ hero: ReturnType<typeof attachEffectiveStats> }> {
  const heroes = new HeroRepository(db);

  return runMutation(
    db,
    {
      accountId,
      command: "hero/specialization/primary",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { heroId: request.heroId, primarySpecializationId: request.primarySpecializationId },
    },
    {
      precondition: () => {
        const hero = heroes.findById(request.heroId);
        if (!hero || hero.accountId !== accountId) throw new AppError("forbidden", `heroId ${request.heroId} does not belong to this account`);
        if (hero.level < SPECIALIZATION_MIN_LEVEL) {
          throw new AppError("validation", `primary specialization unlocks at level ${SPECIALIZATION_MIN_LEVEL}`, { reason: "level_too_low" });
        }
        if (new ExpeditionRepository(db).isActive(accountId)) throw new AppError("active_expedition", "an expedition is already running");
        if (new DungeonRunRepository(db).isActive(accountId)) throw new AppError("active_dungeon", "a dungeon run is already active");
        try {
          validateSpecializationV3(hero.primaryClassId as ClassIdV3, hero.level, request.primarySpecializationId);
        } catch (error) {
          throw new AppError("validation", error instanceof Error ? error.message : "invalid specialization", { reason: "wrong_primary_class" });
        }
      },
      apply: () => {
        const hero = heroes.findById(request.heroId)!;
        if (hero.primarySpecializationId === request.primarySpecializationId) {
          return { result: { hero: attachEffectiveStats(db, accountId, hero) }, changed: false };
        }
        heroes.setPrimarySpecialization(request.heroId, request.primarySpecializationId);
        return { result: { hero: attachEffectiveStats(db, accountId, heroes.findById(request.heroId)!) }, changed: true };
      },
    },
  );
}
