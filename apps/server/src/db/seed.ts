import type { DatabaseSync } from "node:sqlite";
import { STARTER_HEROES } from "@banner-and-bounty/content";
import { AccountRepository } from "../repositories/accountRepository.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { PartyOrderRepository } from "../repositories/partyOrderRepository.js";
import type { Clock } from "../clock.js";

// design/studio/architecture.md: "Seed two local accounts." Fixed accountIds
// keep the two dev-selectable saves stable across restarts; INSERT OR IGNORE
// in the repository makes this safe to call on every startup.
export const SEED_ACCOUNT_A_ID = "00000000-0000-4000-8000-00000000000a";
export const SEED_ACCOUNT_B_ID = "00000000-0000-4000-8000-00000000000b";

/**
 * first-playable.md: three starter heroes, one per class, available
 * immediately, with a default front-to-back party in STARTER_HEROES order.
 * Fixed IDs make seeding idempotent; an existing save keeps its own party
 * order and hero progress.
 */
export function starterHeroIds(accountId: string): [string, string, string] {
  const tag = accountId.slice(-1);
  return [1, 2, 3].map((n) => `00000000-0000-4000-8000-0000000${tag}000${n}`) as [string, string, string];
}

export function seedAccounts(db: DatabaseSync, clock: Clock): void {
  const accounts = new AccountRepository(db);
  const heroes = new HeroRepository(db);
  const partyOrders = new PartyOrderRepository(db);
  const now = clock.now().toISOString();
  accounts.insertSeed(SEED_ACCOUNT_A_ID, "Company A", "A", now);
  accounts.insertSeed(SEED_ACCOUNT_B_ID, "Company B", "B", now);

  for (const accountId of [SEED_ACCOUNT_A_ID, SEED_ACCOUNT_B_ID]) {
    const ids = starterHeroIds(accountId);
    STARTER_HEROES.forEach((starter, i) => {
      heroes.insertIfMissing({ heroId: ids[i]!, accountId, classId: starter.classId });
    });
    partyOrders.insertIfMissing(accountId, ids);
  }
}
