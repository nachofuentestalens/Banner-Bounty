import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { EquipmentSlot, Hero, ItemInstance } from "@banner-and-bounty/contracts";
import type { ClassId, SpecializationId } from "@banner-and-bounty/content";
import {
  type EffectiveStats,
  type ItemDropRoll,
  type LevelState,
  computeHeroEffectiveStats,
  effectiveSpecialization,
  partyHasPathfinder,
} from "@banner-and-bounty/game";
import { AppError } from "../errors.js";
import { AccountRepository } from "../repositories/accountRepository.js";
import type { FrozenPartyMember } from "../repositories/expeditionRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { ItemRepository } from "../repositories/itemRepository.js";
import { PartyOrderRepository } from "../repositories/partyOrderRepository.js";

/** The account's current party in front-to-back order, or `validation` if incomplete/foreign. */
export function loadLiveParty(db: DatabaseSync, accountId: string): Hero[] {
  const order = new PartyOrderRepository(db).find(accountId);
  if (!order) {
    throw new AppError("validation", "party order is not set; a complete 3-hero party is required");
  }
  const byId = new Map(new HeroRepository(db).listByAccount(accountId).map((h) => [h.heroId, h]));
  if (new Set(order.order).size !== 3) {
    throw new AppError("validation", "party order must contain three distinct heroes");
  }
  return order.order.map((heroId) => {
    const hero = byId.get(heroId);
    if (!hero) throw new AppError("validation", `party order references unknown/foreign heroId ${heroId}`);
    return hero;
  });
}

/** Resolves each hero's equipped instance IDs into the stat inputs packages/game consumes. */
export function toFrozenMembers(db: DatabaseSync, heroes: readonly Hero[]): FrozenPartyMember[] {
  const items = new ItemRepository(db);
  return heroes.map((hero) => {
    const resolve = (slot: EquipmentSlot) => {
      const id = hero.equipment[slot];
      if (!id) return null;
      const item = items.findById(id);
      if (!item || item.accountId !== hero.accountId) {
        throw new AppError("internal", `hero ${hero.heroId} references missing item ${id}`);
      }
      return { definitionId: item.definitionId, affixId: item.affixId };
    };
    return {
      heroId: hero.heroId,
      classId: hero.classId as ClassId,
      level: hero.level,
      specializationId: effectiveSpecialization({
        level: hero.level,
        specializationId: hero.specializationId as SpecializationId | null,
      }),
      equipment: { weapon: resolve("weapon"), armor: resolve("armor"), trinket: resolve("trinket") },
      equippedInstanceIds: { ...hero.equipment },
    };
  });
}

/**
 * contracts.md M1-10 decision: each hero's `effectiveStats` for display
 * endpoints (account/state, equip, unequip, specialization) includes the
 * party Pathfinder SPD bonus only while the hero is one of the account's
 * current 3 party members (combat.md 3.5 — the bonus is a battle-time
 * effect on "the whole living party", so a benched hero never gets it).
 */
export function computeEffectiveStatsByHero(
  db: DatabaseSync,
  accountId: string,
  heroes: readonly Hero[],
): Map<string, EffectiveStats> {
  const partyOrder = new PartyOrderRepository(db).find(accountId);
  const partyIds = new Set<string>(partyOrder?.order ?? []);
  const frozen = toFrozenMembers(db, heroes);
  const hasPathfinder = partyHasPathfinder(frozen.filter((member) => partyIds.has(member.heroId)));

  const result = new Map<string, EffectiveStats>();
  for (const member of frozen) {
    result.set(member.heroId, computeHeroEffectiveStats(member, hasPathfinder && partyIds.has(member.heroId)));
  }
  return result;
}

/** Augments one hero response with its server-computed `effectiveStats` (contracts.md M1-10 decision). */
export function attachEffectiveStats<H extends Hero>(
  db: DatabaseSync,
  accountId: string,
  hero: H,
): H & { effectiveStats: EffectiveStats } {
  const allHeroes = new HeroRepository(db).listByAccount(accountId);
  const statsById = computeEffectiveStatsByHero(db, accountId, allHeroes);
  return { ...hero, effectiveStats: statsById.get(hero.heroId)! };
}

export interface GrantedRewards {
  items: ItemInstance[];
}

/**
 * Applies one reward transaction's effects (caller holds the transaction):
 * live hero level/xp, account gold, and new unequipped instances. Overflow
 * conversion has already been decided in packages/game against the
 * unequipped count read inside this same transaction.
 */
export function grantRewards(
  db: DatabaseSync,
  accountId: string,
  grant: { gold: number; levels: Readonly<Record<string, LevelState>>; drops: readonly ItemDropRoll[] },
  createdAt: string,
): GrantedRewards {
  const heroes = new HeroRepository(db);
  for (const [heroId, level] of Object.entries(grant.levels)) {
    heroes.setLevelXp(heroId, level.level, level.xp);
  }
  if (grant.gold > 0) new AccountRepository(db).addGold(accountId, grant.gold);

  const itemRepo = new ItemRepository(db);
  const items = grant.drops.map((drop) => {
    const item: ItemInstance = {
      itemInstanceId: crypto.randomUUID(),
      accountId,
      definitionId: drop.definitionId,
      affixId: drop.affixId,
      equippedBy: null,
    };
    itemRepo.insert(item, createdAt);
    return item;
  });
  return { items };
}
