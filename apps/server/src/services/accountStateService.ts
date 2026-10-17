import type { DatabaseSync } from "node:sqlite";
import { AccountRepository } from "../repositories/accountRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { PartyOrderRepository } from "../repositories/partyOrderRepository.js";

// GET /account/state. Expedition/inventory/gold/bossClaims fields are fixed
// M1-01 defaults until M1-08 implements expedition/equipment/reward storage
// (deliberately out of this task's scope); heroes/partyOrder are real, since
// this task owns the hero/party tables used to demonstrate ownership checks.
export function buildAccountState(db: DatabaseSync, accountId: string) {
  const accounts = new AccountRepository(db);
  const heroes = new HeroRepository(db).listByAccount(accountId);
  const partyOrder = new PartyOrderRepository(db).find(accountId);
  const revision = accounts.getRevision(accountId);

  return {
    data: {
      heroes,
      inventory: [] as unknown[],
      partyOrder,
      expedition: {
        status: "none" as const,
        checkpointAt: null,
        cyclesCompletedSinceStart: 0,
      },
      gold: 0,
      bossClaims: [] as unknown[],
      revision,
    },
    revision,
  };
}
