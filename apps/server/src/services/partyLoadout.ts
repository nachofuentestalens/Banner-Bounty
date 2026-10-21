import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { EquipmentSlot, Hero, ItemInstance, RarityId } from "@banner-and-bounty/contracts";
import type { AffixIdV2, ClassId } from "@banner-and-bounty/content";
import { type EffectiveStatsV2, type EquipmentV2, computeBattleStartStats } from "@banner-and-bounty/game";
import type { ItemRoll } from "@banner-and-bounty/game";
import { AppError } from "../errors.js";
import { AccountRepository } from "../repositories/accountRepository.js";
import type { FrozenPartyMember } from "../repositories/expeditionRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { ItemRepository } from "../repositories/itemRepository.js";
import { PartyFormationRepository } from "../repositories/partyFormationRepository.js";

/** The account's current formation, front-to-back, as the live heroes occupying each non-null slot. */
export function loadLiveParty(db: DatabaseSync, accountId: string): { hero: Hero; slotIndex: number }[] {
  const formation = new PartyFormationRepository(db).find(accountId);
  if (!formation) {
    throw new AppError("validation", "party formation is not set; at least one hero must be fielded");
  }
  const byId = new Map(new HeroRepository(db).listByAccount(accountId).map((h) => [h.heroId, h]));
  const members: { hero: Hero; slotIndex: number }[] = [];
  formation.slots.forEach((heroId, slotIndex) => {
    if (!heroId) return;
    const hero = byId.get(heroId);
    if (!hero) throw new AppError("validation", `formation references unknown/foreign heroId ${heroId}`);
    members.push({ hero, slotIndex });
  });
  if (members.length === 0) {
    throw new AppError("validation", "formation has no heroes fielded; at least one hero is required");
  }
  return members;
}

function resolveEquipmentV2(items: ItemRepository, hero: Hero): EquipmentV2 {
  const resolve = (slot: EquipmentSlot) => {
    const id = hero.equipment[slot];
    if (!id) return null;
    const item = items.findById(id);
    if (!item || item.accountId !== hero.accountId) {
      throw new AppError("internal", `hero ${hero.heroId} references missing item ${id}`);
    }
    return { definitionId: item.definitionId, affixes: item.affixes as { affixId: AffixIdV2; value: number }[] };
  };
  return { weapon: resolve("weapon"), armor: resolve("armor"), trinket: resolve("trinket") };
}

/** Resolves each hero's equipped instance IDs into the stat inputs packages/game consumes. */
export function toFrozenMembers(db: DatabaseSync, members: readonly { hero: Hero; slotIndex: number }[]): FrozenPartyMember[] {
  const items = new ItemRepository(db);
  return members.map(({ hero, slotIndex }) => {
    const equipment = resolveEquipmentV2(items, hero);
    const equipRarity = (slot: EquipmentSlot): { definitionId: string; rarityId: RarityId; affixes: ItemInstance["affixes"] } | null => {
      const id = hero.equipment[slot];
      if (!id) return null;
      const item = items.findById(id)!;
      return { definitionId: item.definitionId, rarityId: item.rarityId, affixes: item.affixes };
    };
    return {
      heroId: hero.heroId,
      slotIndex,
      primaryClassId: hero.primaryClassId as ClassId,
      secondaryClassId: hero.secondaryClassId as ClassId | null,
      level: hero.level,
      equipment,
      skillLoadout: hero.skillLoadout,
      equippedInstanceIds: { ...hero.equipment },
      presentation: {
        weapon: equipRarity("weapon"),
        armor: equipRarity("armor"),
        trinket: equipRarity("trinket"),
      },
    } as FrozenPartyMember;
  });
}

/**
 * contracts.md M1-10 decision, carried into M2: each hero's `effectiveStats`
 * for display endpoints uses the dual-class battle-start formula
 * (classes.md 2.1 steps 1-5), without the dynamic in-battle passive/status
 * layer (steps 6-7), which only applies mid-combat.
 */
export function computeEffectiveStatsByHero(db: DatabaseSync, accountId: string, heroes: readonly Hero[]): Map<string, EffectiveStatsV2> {
  const items = new ItemRepository(db);
  const result = new Map<string, EffectiveStatsV2>();
  for (const hero of heroes) {
    const equipment = resolveEquipmentV2(items, hero);
    const stats = computeBattleStartStats({
      primaryClassId: hero.primaryClassId as ClassId,
      secondaryClassId: hero.secondaryClassId as ClassId | null,
      level: hero.level,
      equipment,
      hasThickHide: hero.skillLoadout.passive.includes("thick_hide"),
    });
    result.set(hero.heroId, stats);
  }
  return result;
}

/** Augments one hero response with its server-computed `effectiveStats` (contracts.md M1-10 decision). */
export function attachEffectiveStats<H extends Hero>(db: DatabaseSync, accountId: string, hero: H): H & { effectiveStats: EffectiveStatsV2 } {
  const allHeroes = new HeroRepository(db).listByAccount(accountId);
  const statsById = computeEffectiveStatsByHero(db, accountId, allHeroes);
  return { ...hero, effectiveStats: statsById.get(hero.heroId)! };
}

export interface GrantedRewards {
  items: ItemInstance[];
}

/**
 * Applies one reward transaction's effects (caller holds the transaction):
 * live hero level/xp, account gold/materials, and new unequipped instances.
 * Overflow conversion has already been decided in packages/game against the
 * unequipped count read inside this same transaction.
 */
export function grantRewards(
  db: DatabaseSync,
  accountId: string,
  grant: { gold: number; materials?: { scrap: number; sigil: number; core: number }; levels: Readonly<Record<string, { level: number; xp: number }>>; drops: readonly ItemRoll[] },
  createdAt: string,
): GrantedRewards {
  const heroes = new HeroRepository(db);
  for (const [heroId, level] of Object.entries(grant.levels)) {
    heroes.setLevelXp(heroId, level.level, level.xp);
  }
  if (grant.gold > 0) new AccountRepository(db).addGold(accountId, grant.gold);
  if (grant.materials && (grant.materials.scrap > 0 || grant.materials.sigil > 0 || grant.materials.core > 0)) {
    new AccountRepository(db).addMaterials(accountId, grant.materials);
  }

  const itemRepo = new ItemRepository(db);
  const items = grant.drops.map((drop) => {
    const item: ItemInstance = {
      itemInstanceId: crypto.randomUUID(),
      accountId,
      definitionId: drop.definitionId,
      rarityId: drop.rarityId,
      affixes: [...drop.affixes],
      equippedBy: null,
    };
    itemRepo.insert(item, createdAt);
    return item;
  });
  return { items };
}
