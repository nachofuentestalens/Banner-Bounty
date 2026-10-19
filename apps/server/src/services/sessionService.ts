import crypto from "node:crypto";
import type { Account, AccountSlot } from "@banner-and-bounty/contracts";
import type { Clock } from "../clock.js";
import { AppError } from "../errors.js";
import { AccountRepository } from "../repositories/accountRepository.js";
import { SessionRepository } from "../repositories/sessionRepository.js";

export class SessionService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
  ) {}

  selectAccount(slot: AccountSlot): { sessionId: string; account: Account } {
    const account = this.accounts.findBySlot(slot);
    if (!account) {
      throw new AppError("validation", `unknown accountSlot ${slot}`);
    }
    const sessionId = crypto.randomUUID();
    this.sessions.create(sessionId, account.accountId, this.clock.now().toISOString());
    return { sessionId, account };
  }

  /** Resolves the account for a session cookie value; null if absent/invalid. */
  resolveAccount(sessionId: string | undefined): Account | null {
    if (!sessionId) return null;
    const session = this.sessions.findById(sessionId);
    if (!session) return null;
    return this.accounts.findById(session.accountId);
  }

  logout(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
