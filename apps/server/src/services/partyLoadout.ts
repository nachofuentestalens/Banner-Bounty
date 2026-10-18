import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { EquipmentSlot, Hero, ItemInstance } from "@banner-and-bounty/contracts";
import type { ClassId, SpecializationId } from "@banner-and-bounty/content";
import { type ItemDropRoll, type LevelState, effectiveSpecialization } from "@banner-and-bounty/game";
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
