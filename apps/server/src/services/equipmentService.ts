import type { DatabaseSync } from "node:sqlite";
import type { EquipRequest, Hero, UnequipRequest } from "@banner-and-bounty/contracts";
import { ContentValidationError, getItemDefinition } from "@banner-and-bounty/content";
import { type EffectiveStatsV2, INVENTORY_CAP_V2 } from "@banner-and-bounty/game";
import { AppError } from "../errors.js";
import { runMutation, type MutationResult } from "../mutation.js";
import { DungeonRunRepository } from "../repositories/dungeonRunRepository.js";
import { ExpeditionRepository } from "../repositories/expeditionRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { ItemRepository } from "../repositories/itemRepository.js";
import { attachEffectiveStats } from "./partyLoadout.js";

export interface HeroResult {
  hero: Hero & { effectiveStats: EffectiveStatsV2 };
}

// Equip/unequip (contracts.md). Precondition order, all at protocol step 3
// so neither writes a receipt or touches revision: hero/item existence and
// ownership, then the active-expedition/active-dungeon loadout lock, then
// request-specific validation/conflict checks.

function requireOwnedHero(heroes: HeroRepository, heroId: string, accountId: string, unknownCode: "not_found" | "forbidden"): Hero {
  const hero = heroes.findById(heroId);
  if (!hero) throw new AppError(unknownCode, `heroId ${heroId} not found for this account`);
  if (hero.accountId !== accountId) throw new AppError("forbidden", `heroId ${heroId} does not belong to this account`);
  return hero;
}

export function requireNoActiveActivity(db: DatabaseSync, accountId: string): void {
  if (new ExpeditionRepository(db).isActive(accountId)) {
    throw new AppError("active_expedition", "equipment and loadout are frozen while an expedition is active");
  }
  if (new DungeonRunRepository(db).isActive(accountId)) {
    throw new AppError("active_dungeon", "equipment and loadout are frozen while a dungeon run is active");
  }
}

export function equip(db: DatabaseSync, accountId: string, request: EquipRequest): MutationResult<HeroResult> {
  const heroes = new HeroRepository(db);
  const items = new ItemRepository(db);
  const { heroId, itemInstanceId, slot } = request;

  return runMutation<HeroResult>(
    db,
    {
      accountId,
      command: "equipment/equip",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { heroId, itemInstanceId, slot },
    },
    {
      precondition: () => {
        requireOwnedHero(heroes, heroId, accountId, "not_found");
        const item = items.findById(itemInstanceId);
        if (!item) throw new AppError("not_found", `itemInstanceId ${itemInstanceId} not found for this account`);
        if (item.accountId !== accountId) {
          throw new AppError("forbidden", `itemInstanceId ${itemInstanceId} does not belong to this account`);
        }
        requireNoActiveActivity(db, accountId);
        const definitionSlot = getItemDefinition(item.definitionId).slot;
        if (definitionSlot !== slot) {
          throw new AppError("validation", `item ${item.definitionId} fits the ${definitionSlot} slot, not ${slot}`, {
            reason: "wrong_slot",
          });
        }
        if (item.equippedBy !== null && item.equippedBy !== heroId) {
          throw new AppError("conflict", "item is already equipped by a different hero", { reason: "equipped_elsewhere" });
        }
      },
      apply: () => {
        const hero = heroes.findById(heroId)!;
        const previous = hero.equipment[slot];
        if (previous === itemInstanceId) {
          return { result: { hero: attachEffectiveStats(db, accountId, hero) }, changed: false };
        }
        // A swap moves the previous item back to inventory and the new one
        // out of it, so the unequipped count is unchanged.
        if (previous) items.setEquippedBy(previous, null);
        heroes.setEquipmentSlot(heroId, slot, itemInstanceId);
        items.setEquippedBy(itemInstanceId, heroId);
        return { result: { hero: attachEffectiveStats(db, accountId, heroes.findById(heroId)!) }, changed: true };
      },
    },
  );
}

export function unequip(db: DatabaseSync, accountId: string, request: UnequipRequest): MutationResult<HeroResult> {
  const heroes = new HeroRepository(db);
  const items = new ItemRepository(db);
  const { heroId, slot } = request;

  return runMutation<HeroResult>(
    db,
    {
      accountId,
      command: "equipment/unequip",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { heroId, slot },
    },
    {
      precondition: () => {
        const hero = requireOwnedHero(heroes, heroId, accountId, "not_found");
        requireNoActiveActivity(db, accountId);
        // Unequipping never creates a 101st unequipped instance: the cap is
        // an invariant of the inventory, not just of reward transactions.
        if (hero.equipment[slot] && items.countUnequipped(accountId) >= INVENTORY_CAP_V2) {
          throw new AppError("validation", `inventory already holds ${INVENTORY_CAP_V2} unequipped items`, {
            reason: "inventory_full",
          });
        }
      },
      apply: () => {
        const hero = heroes.findById(heroId)!;
        const previous = hero.equipment[slot];
        if (!previous) return { result: { hero: attachEffectiveStats(db, accountId, hero) }, changed: false };
        items.setEquippedBy(previous, null);
        heroes.setEquipmentSlot(heroId, slot, null);
        return { result: { hero: attachEffectiveStats(db, accountId, heroes.findById(heroId)!) }, changed: true };
      },
    },
  );
}

export { ContentValidationError, requireOwnedHero };
