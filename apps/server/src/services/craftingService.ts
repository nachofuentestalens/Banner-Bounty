import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { CraftRequest, ItemInstance, ReforgeRequest } from "@banner-and-bounty/contracts";
import { ITEM_DEFINITIONS, type AffixIdV2, getItemDefinition, getRecipeDefinition, reforgeRecipeForRarity, type RollableRarityId } from "@banner-and-bounty/content";
import { INVENTORY_CAP_V2, createRngState, resolveCraft, resolveReforge } from "@banner-and-bounty/game";
import { AppError } from "../errors.js";
import { runMutation, type MutationResult } from "../mutation.js";
import { AccountRepository } from "../repositories/accountRepository.js";
import { ItemRepository } from "../repositories/itemRepository.js";
import { requireNoActiveActivity } from "./equipmentService.js";

const CRAFT_RECIPE_RARITY: Record<string, RollableRarityId> = {
  craft_uncommon: "uncommon",
  craft_rare: "rare",
  craft_epic: "epic",
};

const ITEM_DEFINITION_IDS = new Set(ITEM_DEFINITIONS.map((d) => d.definitionId));

function craftSeed(accountId: string, requestId: string): number {
  return crypto.createHash("sha256").update(`craft:${accountId}:${requestId}`).digest().readUInt32BE(0);
}

function reforgeSeed(accountId: string, requestId: string): number {
  return crypto.createHash("sha256").update(`reforge:${accountId}:${requestId}`).digest().readUInt32BE(0);
}

function requireAffordable(accounts: AccountRepository, accountId: string, cost: { gold: number; scrap: number; sigil: number; core: number }): void {
  if (accounts.getGold(accountId) < cost.gold) {
    throw new AppError("validation", `this recipe costs ${cost.gold} gold`, { reason: "insufficient_gold" });
  }
  const materials = accounts.getMaterials(accountId);
  if (materials.scrap < cost.scrap || materials.sigil < cost.sigil || materials.core < cost.core) {
    throw new AppError("validation", "insufficient materials for this recipe", { reason: "insufficient_materials" });
  }
}

export interface CraftResult {
  item: ItemInstance;
  replacementConsumed: string | null;
}

// POST /craft (contracts.md M2-25 addition, gear.md section 5).
export function craftItem(db: DatabaseSync, accountId: string, request: CraftRequest): MutationResult<CraftResult> {
  const accounts = new AccountRepository(db);
  const items = new ItemRepository(db);
  const { recipeId, definitionId, replacementItemInstanceId } = request;
  const rarity = CRAFT_RECIPE_RARITY[recipeId];

  return runMutation<CraftResult>(
    db,
    {
      accountId,
      command: "craft",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { recipeId, definitionId, replacementItemInstanceId: replacementItemInstanceId ?? null },
    },
    {
      precondition: () => {
        requireNoActiveActivity(db, accountId);
        if (!rarity) throw new AppError("validation", `unknown recipeId ${recipeId}`);
        if (!ITEM_DEFINITION_IDS.has(definitionId)) throw new AppError("validation", `unknown definitionId ${definitionId}`);
        const cost = getRecipeDefinition(recipeId);
        requireAffordable(accounts, accountId, cost);
        if (items.countUnequipped(accountId) >= INVENTORY_CAP_V2) {
          if (!replacementItemInstanceId) {
            throw new AppError("validation", "inventory is full; supply replacementItemInstanceId", { reason: "bag_full" });
          }
          const replacement = items.findById(replacementItemInstanceId);
          if (!replacement) throw new AppError("validation", "replacement item not found", { reason: "bag_full" });
          if (replacement.accountId !== accountId) throw new AppError("forbidden", "replacement item does not belong to this account");
          if (replacement.equippedBy !== null) throw new AppError("validation", "replacement item must be unequipped", { reason: "bag_full" });
        }
      },
      apply: () => {
        const cost = getRecipeDefinition(recipeId);
        accounts.spendGold(accountId, cost.gold);
        accounts.spendMaterials(accountId, cost);

        let replacementConsumed: string | null = null;
        if (items.countUnequipped(accountId) >= INVENTORY_CAP_V2) {
          items.delete(replacementItemInstanceId!);
          replacementConsumed = replacementItemInstanceId!;
        }

        const seed = craftSeed(accountId, request.requestId);
        const { item: roll } = resolveCraft(createRngState(seed), definitionId, rarity!);
        const item: ItemInstance = {
          itemInstanceId: crypto.randomUUID(),
          accountId,
          definitionId: roll.definitionId,
          rarityId: roll.rarityId,
          affixes: [...roll.affixes],
          equippedBy: null,
        };
        items.insert(item, new Date().toISOString());
        return { result: { item, replacementConsumed }, changed: true };
      },
    },
  );
}

export interface ReforgeResult {
  item: ItemInstance;
}

// POST /reforge (contracts.md M2-25 addition, gear.md section 5). recipeId
// is server-derived from the item's own rarity, not client-supplied.
export function reforgeItem(db: DatabaseSync, accountId: string, request: ReforgeRequest): MutationResult<ReforgeResult> {
  const accounts = new AccountRepository(db);
  const items = new ItemRepository(db);
  const { itemInstanceId, affixIndex } = request;

  return runMutation<ReforgeResult>(
    db,
    {
      accountId,
      command: "reforge",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { itemInstanceId, affixIndex },
    },
    {
      precondition: () => {
        const item = items.findById(itemInstanceId);
        if (!item) throw new AppError("not_found", `itemInstanceId ${itemInstanceId} not found`);
        if (item.accountId !== accountId) throw new AppError("forbidden", `itemInstanceId ${itemInstanceId} does not belong to this account`);
        requireNoActiveActivity(db, accountId);
        if (item.equippedBy !== null) throw new AppError("validation", "reforge requires an unequipped item", { reason: "item_equipped" });
        if (item.rarityId === "common") throw new AppError("validation", "common items cannot be reforged");
        if (affixIndex < 0 || affixIndex >= item.affixes.length) {
          throw new AppError("validation", `affixIndex ${affixIndex} is out of range`);
        }
        const recipeId = reforgeRecipeForRarity(item.rarityId as RollableRarityId);
        requireAffordable(accounts, accountId, getRecipeDefinition(recipeId));
      },
      apply: () => {
        const item = items.findById(itemInstanceId)!;
        const recipeId = reforgeRecipeForRarity(item.rarityId as RollableRarityId);
        const cost = getRecipeDefinition(recipeId);
        accounts.spendGold(accountId, cost.gold);
        accounts.spendMaterials(accountId, cost);

        const slot = getItemDefinition(item.definitionId).slot;
        const seed = reforgeSeed(accountId, request.requestId);
        const { affixes } = resolveReforge(createRngState(seed), slot, item.rarityId as RollableRarityId, item.affixes as { affixId: AffixIdV2; value: number }[], affixIndex);
        items.setAffixes(itemInstanceId, affixes);
        return { result: { item: { ...item, affixes } }, changed: true };
      },
    },
  );
}
