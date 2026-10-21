import type { DatabaseSync } from "node:sqlite";
import type { AreaSelectRequest, AreaSummaryDTO } from "@banner-and-bounty/contracts";
import { AREAS } from "@banner-and-bounty/content";
import { AppError } from "../errors.js";
import { runMutation, type MutationResult } from "../mutation.js";
import { AccountRepository } from "../repositories/accountRepository.js";
import { BossClaimRepository } from "../repositories/bossClaimRepository.js";
import { ExpeditionRepository } from "../repositories/expeditionRepository.js";

/** contracts.md M2-01: unlockRequirement is evaluated server-side into a boolean per account. Shared with dungeonService.ts (DungeonDefinition uses the same UnlockRequirement shape). */
export function isUnlocked(accountId: string, requirement: { kind: string; value?: unknown }, bossClaims: BossClaimRepository): boolean {
  if (requirement.kind === "none") return true;
  if (requirement.kind === "bossClear") return bossClaims.listByAccount(accountId).some((c) => c.bossId === requirement.value && c.claimedAt !== null);
  return false;
}

// GET /areas. Read-only: never mutates state.
export function listAreas(db: DatabaseSync, accountId: string): AreaSummaryDTO[] {
  const selected = new AccountRepository(db).getSelectedAreaId(accountId);
  const bossClaims = new BossClaimRepository(db);
  return AREAS.map((area) => ({
    areaId: area.areaId,
    unlocked: isUnlocked(accountId, area.unlockRequirement, bossClaims),
    isSelected: area.areaId === selected,
  }));
}

// POST /area/select.
export function selectArea(db: DatabaseSync, accountId: string, request: AreaSelectRequest): MutationResult<{ selectedAreaId: string }> {
  const accounts = new AccountRepository(db);
  const bossClaims = new BossClaimRepository(db);
  const { areaId } = request;

  return runMutation(
    db,
    {
      accountId,
      command: "area/select",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { areaId },
    },
    {
      precondition: () => {
        if (new ExpeditionRepository(db).isActive(accountId)) {
          throw new AppError("active_expedition", "cannot change the selected area while an expedition is active");
        }
        const area = AREAS.find((a) => a.areaId === areaId);
        if (!area) throw new AppError("not_found", `unknown areaId ${areaId}`);
        if (!isUnlocked(accountId, area.unlockRequirement, bossClaims)) {
          throw new AppError("forbidden", `area ${areaId} is not yet unlocked`);
        }
      },
      apply: () => {
        const current = accounts.getSelectedAreaId(accountId);
        if (current === areaId) return { result: { selectedAreaId: areaId }, changed: false };
        accounts.setSelectedAreaId(accountId, areaId);
        return { result: { selectedAreaId: areaId }, changed: true };
      },
    },
  );
}
