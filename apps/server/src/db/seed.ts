import type { DatabaseSync } from "node:sqlite";
import { AccountRepository } from "../repositories/accountRepository.js";
import type { Clock } from "../clock.js";

// design/studio/architecture.md: "Seed two local accounts." Fixed accountIds
// keep the two dev-selectable saves stable across restarts; INSERT OR IGNORE
// in the repository makes this safe to call on every startup.
export const SEED_ACCOUNT_A_ID = "00000000-0000-4000-8000-00000000000a";
export const SEED_ACCOUNT_B_ID = "00000000-0000-4000-8000-00000000000b";

export function seedAccounts(db: DatabaseSync, clock: Clock): void {
  const accounts = new AccountRepository(db);
  const now = clock.now().toISOString();
  accounts.insertSeed(SEED_ACCOUNT_A_ID, "Company A", "A", now);
  accounts.insertSeed(SEED_ACCOUNT_B_ID, "Company B", "B", now);
}
