import type { DatabaseSync } from "node:sqlite";
import { AccountRepository } from "../repositories/accountRepository.js";
import { BossClaimRepository } from "../repositories/bossClaimRepository.js";
import { DungeonRunRepository } from "../repositories/dungeonRunRepository.js";
import { ExpeditionRepository } from "../repositories/expeditionRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { ItemRepository } from "../repositories/itemRepository.js";
import { PartyFormationRepository } from "../repositories/partyFormationRepository.js";
import { computeEffectiveStatsByHero } from "./partyLoadout.js";
import { toDungeonRunView } from "./dungeonService.js";
import { toExpeditionView } from "./expeditionService.js";
import { listAreas } from "./areaService.js";

// GET /account/state. Read-only: never settles, grants or advances anything
// (contracts.md M1-01 invariant). Settlement happens only via
// /expedition/settle|stop or /dungeon/settle|stop.
export function buildAccountState(db: DatabaseSync, accountId: string) {
  const accounts = new AccountRepository(db);
  const expeditionRow = new ExpeditionRepository(db).find(accountId);
  const dungeonRow = new DungeonRunRepository(db).find(accountId);
  const revision = accounts.getRevision(accountId);

  const expeditionView = expeditionRow ? toExpeditionView(expeditionRow) : null;
  const expedition =
    expeditionView?.status === "active"
      ? { ...expeditionView, cyclesCompletedSinceStart: expeditionView.cyclesCompleted }
      : { status: "none" as const, areaId: null, checkpointAt: null, cyclesCompletedSinceStart: 0 };

  const dungeon = dungeonRow ? toDungeonRunView(dungeonRow) : { status: "none" as const, dungeonId: null, startedAt: null, checkpointAt: null, currentFloor: 1, floorsCleared: 0, rulesVersion: null, outcome: "none" as const };

  const heroes = new HeroRepository(db).listByAccount(accountId);
  const statsById = computeEffectiveStatsByHero(db, accountId, heroes);

  return {
    data: {
      // M1-10 additive field: each hero carries its server-computed
      // effectiveStats (contracts.md decision), never persisted.
      heroes: heroes.map((hero) => ({ ...hero, effectiveStats: statsById.get(hero.heroId)! })),
      inventory: new ItemRepository(db).listByAccount(accountId),
      formation: new PartyFormationRepository(db).find(accountId),
      areas: listAreas(db, accountId),
      selectedAreaId: accounts.getSelectedAreaId(accountId),
      expedition,
      dungeon,
      gold: accounts.getGold(accountId),
      materials: accounts.getMaterials(accountId),
      bossClaims: new BossClaimRepository(db).listByAccount(accountId),
      revision,
    },
    revision,
  };
}
