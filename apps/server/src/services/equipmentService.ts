import type { DatabaseSync } from "node:sqlite";
import type { EquipRequest, Hero, SpecializationRequest, UnequipRequest } from "@banner-and-bounty/contracts";
import { ContentValidationError, assertSpecializationForClass, getItemDefinition } from "@banner-and-bounty/content";
import { INVENTORY_CAP } from "@banner-and-bounty/game";
import { AppError } from "../errors.js";
import { runMutation, type MutationResult } from "../mutation.js";
import { ExpeditionRepository } from "../repositories/expeditionRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { ItemRepository } from "../repositories/itemRepository.js";

export interface HeroResult {
  hero: Hero;
}

// Equip/unequip/specialization (contracts.md). Precondition order, all at
// protocol step 3 so none of them writes a receipt or touches revision:
// hero/item existence and ownership, then the active-expedition loadout
// lock, then request-specific validation/conflict checks.

function requireOwnedHero(heroes: HeroRepository, heroId: string, accountId: string, unknownCode: "not_found" | "forbidden"): Hero {
  const hero = heroes.findById(heroId);
  if (!hero) throw new AppError(unknownCode, `heroId ${heroId} not found for this account`);
  if (hero.accountId !== accountId) throw new AppError("forbidden", `heroId ${heroId} does not belong to this account`);
  return hero;
}

function requireNoActiveExpedition(db: DatabaseSync, accountId: string): void {
  if (new ExpeditionRepository(db).isActive(accountId)) {
    throw new AppError("active_expedition", "equipment and specialization are frozen while an expedition is active");
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
        requireNoActiveExpedition(db, accountId);
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
        if (previous === itemInstanceId) return { result: { hero }, changed: false };
        // A swap moves the previous item back to inventory and the new one
        // out of it, so the unequipped count is unchanged.
        if (previous) items.setEquippedBy(previous, null);
        heroes.setEquipmentSlot(heroId, slot, itemInstanceId);
        items.setEquippedBy(itemInstanceId, heroId);
        return { result: { hero: heroes.findById(heroId)! }, changed: true };
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
        requireNoActiveExpedition(db, accountId);
        // Unequipping never creates a 101st unequipped instance: the cap is
        // an invariant of the inventory, not just of reward transactions.
        if (hero.equipment[slot] && items.countUnequipped(accountId) >= INVENTORY_CAP) {
          throw new AppError("validation", `inventory already holds ${INVENTORY_CAP} unequipped items`, {
            reason: "inventory_full",
          });
        }
      },
      apply: () => {
        const hero = heroes.findById(heroId)!;
        const previous = hero.equipment[slot];
        if (!previous) return { result: { hero }, changed: false };
        items.setEquippedBy(previous, null);
        heroes.setEquipmentSlot(heroId, slot, null);
        return { result: { hero: heroes.findById(heroId)! }, changed: true };
      },
    },
  );
}

export function chooseSpecialization(
  db: DatabaseSync,
  accountId: string,
  request: SpecializationRequest,
): MutationResult<HeroResult> {
  const heroes = new HeroRepository(db);
  const { heroId, specializationId } = request;

  return runMutation<HeroResult>(
    db,
    {
      accountId,
      command: "hero/specialization",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { heroId, specializationId },
    },
    {
      precondition: () => {
        // contracts.md lists no not_found for this endpoint; an unknown hero
        // is "not one of yours", matching party/order.
        const hero = requireOwnedHero(heroes, heroId, accountId, "forbidden");
        requireNoActiveExpedition(db, accountId);
        if (hero.level < 3) {
          throw new AppError("validation", "specialization unlocks at level 3", { reason: "level_too_low" });
        }
        try {
          assertSpecializationForClass(hero.classId, specializationId);
        } catch (error) {
          if (error instanceof ContentValidationError) {
            throw new AppError("validation", error.message, { reason: "wrong_specialization" });
          }
          throw error;
        }
      },
      apply: () => {
        const hero = heroes.findById(heroId)!;
        if (hero.specializationId === specializationId) return { result: { hero }, changed: false };
        heroes.setSpecialization(heroId, specializationId);
        return { result: { hero: heroes.findById(heroId)! }, changed: true };
      },
    },
  );
}
