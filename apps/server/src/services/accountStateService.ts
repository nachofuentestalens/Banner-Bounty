import type { DatabaseSync } from "node:sqlite";
import { AccountRepository } from "../repositories/accountRepository.js";
import { BossClaimRepository } from "../repositories/bossClaimRepository.js";
import { ExpeditionRepository } from "../repositories/expeditionRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { ItemRepository } from "../repositories/itemRepository.js";
import { PartyOrderRepository } from "../repositories/partyOrderRepository.js";

// GET /account/state. Read-only: never settles, grants or advances anything
// (contracts.md M1-01 invariant). Settlement happens only via
// /expedition/settle or /expedition/stop.
export function buildAccountState(db: DatabaseSync, accountId: string) {
  const accounts = new AccountRepository(db);
  const expeditionRow = new ExpeditionRepository(db).find(accountId);
  const revision = accounts.getRevision(accountId);

  const expedition =
    expeditionRow?.status === "active"
      ? {
          status: "active" as const,
          startedAt: expeditionRow.startedAt,
          checkpointAt: expeditionRow.checkpointAt,
          frozenLoadout: expeditionRow.frozenLoadout,
          rulesVersion: expeditionRow.rulesVersion,
          cyclesCompletedSinceStart: expeditionRow.cyclesCompleted,
          wins: expeditionRow.wins,
          losses: expeditionRow.losses,
        }
      : { status: "none" as const, checkpointAt: null, cyclesCompletedSinceStart: 0 };

  return {
    data: {
      heroes: new HeroRepository(db).listByAccount(accountId),
      inventory: new ItemRepository(db).listByAccount(accountId),
      partyOrder: new PartyOrderRepository(db).find(accountId),
      expedition,
      gold: accounts.getGold(accountId),
      bossClaims: new BossClaimRepository(db).listByAccount(accountId),
      revision,
    },
    revision,
  };
}
