// design/studio/contracts.md M3-05 addition section 9: GET /dungeons.
import type { DatabaseSync } from "node:sqlite";
import { DUNGEONS_V3 } from "@banner-and-bounty/content";
import type { DungeonCatalogEntryDTO } from "@banner-and-bounty/contracts";
import { BossClaimRepository } from "../repositories/bossClaimRepository.js";
import { DungeonClearRecordRepository } from "../repositories/dungeonClearRecordRepository.js";
import { isUnlocked } from "./areaService.js";

/** Extends areaService's isUnlocked with the "dungeonClear" requirement kind (Cinder Archive's unlock). */
export function isDungeonUnlockedV3(accountId: string, requirement: { kind: string; value?: unknown }, bossClaims: BossClaimRepository, clears: DungeonClearRecordRepository): boolean {
  if (requirement.kind === "dungeonClear") return clears.hasCleared(accountId, requirement.value as string);
  return isUnlocked(accountId, requirement, bossClaims);
}

export function listDungeonCatalog(db: DatabaseSync, accountId: string): DungeonCatalogEntryDTO[] {
  const bossClaims = new BossClaimRepository(db);
  const clears = new DungeonClearRecordRepository(db);
  return DUNGEONS_V3.map((dungeon) => {
    const unlocked = isDungeonUnlockedV3(accountId, dungeon.unlockRequirement, bossClaims, clears);
    return {
      dungeonId: dungeon.dungeonId,
      rulesVersion: dungeon.dungeonId === "dungeon_cinder_archive" ? 3 : 1,
      locked: !unlocked,
      lockReason: unlocked ? null : dungeon.unlockRequirement.kind === "dungeonClear" ? `clear ${dungeon.unlockRequirement.value} first` : "boss not yet cleared",
      clearRequirement: dungeon.unlockRequirement.kind === "dungeonClear" ? (dungeon.unlockRequirement.value as string) : null,
      floors: dungeon.floors.map((f) => ({ floor: f.floor, isBoss: f.isBoss, rewardProfileRef: f.rewardProfileId })),
      timingSecondsPerFloor: 180,
      partyValidation: { minHeroes: 1, maxHeroes: 5 },
    };
  });
}
