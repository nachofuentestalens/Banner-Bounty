import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { HeroRecruitRequest, LoadoutRequest, SecondaryClassRequest } from "@banner-and-bounty/contracts";
import { autoFillLoadout, getSkillDefinition, isBaseClassId, unlockedSkillPool } from "@banner-and-bounty/content";
import { AppError } from "../errors.js";
import { runMutation, type MutationResult } from "../mutation.js";
import { AccountRepository } from "../repositories/accountRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { attachEffectiveStats } from "./partyLoadout.js";
import { requireNoActiveActivity } from "./equipmentService.js";
import type { HeroResult } from "./equipmentService.js";

export const ROSTER_CAP = 20;
export const RECRUIT_BASE_COST = 150;
export const SECONDARY_CLASS_MIN_LEVEL = 3;

// POST /hero/recruit (contracts.md M2-25 addition, classes.md section 8).
export function recruitHero(db: DatabaseSync, accountId: string, request: HeroRecruitRequest): MutationResult<HeroResult> {
  const heroes = new HeroRepository(db);
  const accounts = new AccountRepository(db);
  const { primaryClassId } = request;

  return runMutation<HeroResult>(
    db,
    {
      accountId,
      command: "hero/recruit",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { primaryClassId },
    },
    {
      precondition: () => {
        if (!isBaseClassId(primaryClassId)) {
          throw new AppError("validation", `unknown primaryClassId ${primaryClassId}`);
        }
        const ownedCount = heroes.countByAccount(accountId);
        if (ownedCount >= ROSTER_CAP) {
          throw new AppError("validation", `roster is at its ${ROSTER_CAP}-hero cap`, { reason: "roster_full" });
        }
        const cost = RECRUIT_BASE_COST * ownedCount;
        if (accounts.getGold(accountId) < cost) {
          throw new AppError("validation", `recruiting costs ${cost} gold`, { reason: "insufficient_gold" });
        }
      },
      apply: () => {
        const ownedCount = heroes.countByAccount(accountId);
        const cost = RECRUIT_BASE_COST * ownedCount;
        accounts.spendGold(accountId, cost);
        const heroId = crypto.randomUUID();
        heroes.insert({ heroId, accountId, primaryClassId, skillLoadout: autoFillLoadout(primaryClassId, 1) });
        return { result: { hero: attachEffectiveStats(db, accountId, heroes.findById(heroId)!) }, changed: true };
      },
    },
  );
}

function requireOwnedHero(heroes: HeroRepository, heroId: string, accountId: string) {
  const hero = heroes.findById(heroId);
  if (!hero || hero.accountId !== accountId) {
    throw new AppError("forbidden", `heroId ${heroId} does not belong to this account`);
  }
  return hero;
}

// POST /hero/secondary-class.
export function assignSecondaryClass(db: DatabaseSync, accountId: string, request: SecondaryClassRequest): MutationResult<HeroResult> {
  const heroes = new HeroRepository(db);
  const { heroId, secondaryClassId } = request;

  return runMutation<HeroResult>(
    db,
    {
      accountId,
      command: "hero/secondary-class",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { heroId, secondaryClassId },
    },
    {
      precondition: () => {
        const hero = requireOwnedHero(heroes, heroId, accountId);
        if (hero.level < SECONDARY_CLASS_MIN_LEVEL) {
          throw new AppError("validation", `secondary class unlocks at level ${SECONDARY_CLASS_MIN_LEVEL}`, { reason: "level_too_low" });
        }
        requireNoActiveActivity(db, accountId);
        if (!isBaseClassId(secondaryClassId)) {
          throw new AppError("validation", `unknown secondaryClassId ${secondaryClassId}`);
        }
        if (secondaryClassId === hero.primaryClassId) {
          throw new AppError("validation", "a hero cannot dual-class into its own primary class");
        }
      },
      apply: () => {
        const hero = heroes.findById(heroId)!;
        if (hero.secondaryClassId === secondaryClassId) {
          return { result: { hero: attachEffectiveStats(db, accountId, hero) }, changed: false };
        }
        heroes.setSecondaryClass(heroId, secondaryClassId);
        return { result: { hero: attachEffectiveStats(db, accountId, heroes.findById(heroId)!) }, changed: true };
      },
    },
  );
}

function validateLoadoutSlots(hero: { primaryClassId: string; secondaryClassId: string | null; level: number }, active: [string, string], passive: [string, string]): void {
  const activePool = new Set<string>(unlockedSkillPool(hero.primaryClassId, hero.secondaryClassId, hero.level, "active"));
  const passivePool = new Set<string>(unlockedSkillPool(hero.primaryClassId, hero.secondaryClassId, hero.level, "passive"));
  for (const [kind, slots, pool] of [["active", active, activePool], ["passive", passive, passivePool]] as const) {
    const filled = slots.filter((s) => s !== "");
    if (new Set(filled).size !== filled.length) {
      throw new AppError("validation", `duplicate ${kind} skillId in loadout`);
    }
    for (const skillId of filled) {
      if (!pool.has(skillId)) {
        throw new AppError("validation", `skillId ${skillId} is not an unlocked ${kind} skill for this hero`);
      }
      if (getSkillDefinition(skillId).kind !== kind) {
        throw new AppError("validation", `skillId ${skillId} is not a ${kind} skill`);
      }
    }
  }
}

// PATCH /hero/loadout.
export function setLoadout(db: DatabaseSync, accountId: string, request: LoadoutRequest): MutationResult<HeroResult> {
  const heroes = new HeroRepository(db);
  const { heroId, active, passive } = request;

  return runMutation<HeroResult>(
    db,
    {
      accountId,
      command: "hero/loadout",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { heroId, active, passive },
    },
    {
      precondition: () => {
        const hero = requireOwnedHero(heroes, heroId, accountId);
        requireNoActiveActivity(db, accountId);
        validateLoadoutSlots(hero, active, passive);
      },
      apply: () => {
        const hero = heroes.findById(heroId)!;
        const unchanged = hero.skillLoadout.active[0] === active[0] && hero.skillLoadout.active[1] === active[1] && hero.skillLoadout.passive[0] === passive[0] && hero.skillLoadout.passive[1] === passive[1];
        if (unchanged) return { result: { hero: attachEffectiveStats(db, accountId, hero) }, changed: false };
        heroes.setLoadout(heroId, { active, passive });
        return { result: { hero: attachEffectiveStats(db, accountId, heroes.findById(heroId)!) }, changed: true };
      },
    },
  );
}
