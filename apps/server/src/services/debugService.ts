import type { DatabaseSync } from "node:sqlite";
import type { DebugGrantHeroXpRequest, DebugGrantGoldRequest, DebugSetHeroLevelRequest, DebugGoldResultDTO } from "@banner-and-bounty/contracts";
import { applyXpGain } from "@banner-and-bounty/game";
import { AppError } from "../errors.js";
import { runMutation, type MutationResult } from "../mutation.js";
import { AccountRepository } from "../repositories/accountRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { attachEffectiveStats } from "./partyLoadout.js";
import type { HeroResult } from "./equipmentService.js";

// Debug menu (level/XP/gold) for manual testing — design task "Add local
// debug menu for level/XP/gold". Every mutation reuses runMutation, the same
// precondition/revision/idempotency path as normal play, so there is no
// direct DB write that could desync a save. apps/app.ts only registers
// these routes when debugToolsEnabled is set, so they never reach normal
// play by default.

function requireOwnedHero(heroes: HeroRepository, heroId: string, accountId: string) {
  const hero = heroes.findById(heroId);
  if (!hero || hero.accountId !== accountId) {
    throw new AppError("forbidden", `heroId ${heroId} does not belong to this account`);
  }
  return hero;
}

// POST /debug/hero/level. Sets the hero's level directly; xp resets to 0 at
// that level, matching the cap behavior in packages/game/xp.ts (no banked
// remainder past the curve).
export function debugSetHeroLevel(db: DatabaseSync, accountId: string, request: DebugSetHeroLevelRequest): MutationResult<HeroResult> {
  const heroes = new HeroRepository(db);
  const { heroId, level } = request;

  return runMutation<HeroResult>(
    db,
    {
      accountId,
      command: "debug/hero/level",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { heroId, level },
    },
    {
      precondition: () => {
        requireOwnedHero(heroes, heroId, accountId);
      },
      apply: () => {
        const hero = heroes.findById(heroId)!;
        if (hero.level === level && hero.xp === 0) {
          return { result: { hero: attachEffectiveStats(db, accountId, hero) }, changed: false };
        }
        heroes.setLevelXp(heroId, level, 0);
        return { result: { hero: attachEffectiveStats(db, accountId, heroes.findById(heroId)!) }, changed: true };
      },
    },
  );
}

// POST /debug/hero/xp. Grants xp through the production curve
// (packages/game/xp.ts applyXpGain) so debug grants cannot produce a
// level/xp combination normal play could never reach.
export function debugGrantHeroXp(db: DatabaseSync, accountId: string, request: DebugGrantHeroXpRequest): MutationResult<HeroResult> {
  const heroes = new HeroRepository(db);
  const { heroId, xp } = request;

  return runMutation<HeroResult>(
    db,
    {
      accountId,
      command: "debug/hero/xp",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { heroId, xp },
    },
    {
      precondition: () => {
        requireOwnedHero(heroes, heroId, accountId);
      },
      apply: () => {
        const hero = heroes.findById(heroId)!;
        const leveled = applyXpGain({ level: hero.level, xp: hero.xp }, xp);
        if (leveled.level === hero.level && leveled.xp === hero.xp) {
          return { result: { hero: attachEffectiveStats(db, accountId, hero) }, changed: false };
        }
        heroes.setLevelXp(heroId, leveled.level, leveled.xp);
        return { result: { hero: attachEffectiveStats(db, accountId, heroes.findById(heroId)!) }, changed: true };
      },
    },
  );
}

// POST /debug/gold. Grants gold through the same AccountRepository path
// normal rewards use.
export function debugGrantGold(db: DatabaseSync, accountId: string, request: DebugGrantGoldRequest): MutationResult<DebugGoldResultDTO> {
  const accounts = new AccountRepository(db);
  const { gold } = request;

  return runMutation<DebugGoldResultDTO>(
    db,
    {
      accountId,
      command: "debug/gold",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { gold },
    },
    {
      apply: () => {
        accounts.addGold(accountId, gold);
        return { result: { gold: accounts.getGold(accountId) }, changed: true };
      },
    },
  );
}
