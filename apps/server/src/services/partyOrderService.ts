import type { DatabaseSync } from "node:sqlite";
import type { HeroId, PartyOrderRequest } from "@banner-and-bounty/contracts";
import { AppError } from "../errors.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { PartyOrderRepository } from "../repositories/partyOrderRepository.js";
import { runMutation } from "../mutation.js";

export interface PartyOrderResult {
  partyOrder: { accountId: string; order: [HeroId, HeroId, HeroId] };
}

// PATCH /party/order (design/studio/contracts.md). No packages/game
// dependency: reordering never touches combat/frozenLoadout, so this is the
// one mutating endpoint M1-07 implements end-to-end to prove the ownership +
// revision + idempotency protocol against a real route. Equip/expedition/
// boss/arena endpoints are implemented by M1-08/M1-11 against packages/game
// and packages/content, which do not exist yet.
export function applyPartyOrder(
  db: DatabaseSync,
  accountId: string,
  request: PartyOrderRequest,
): { result: PartyOrderResult; revision: number; replayed: boolean } {
  const heroes = new HeroRepository(db);
  const partyOrders = new PartyOrderRepository(db);
  const order = request.order as [HeroId, HeroId, HeroId];

  return runMutation<PartyOrderResult>(
    db,
    {
      accountId,
      command: "party/order",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { order },
    },
    {
      precondition: () => {
        for (const heroId of order) {
          if (!heroes.ownedBy(heroId, accountId)) {
            throw new AppError("forbidden", `heroId ${heroId} does not belong to this account`);
          }
        }
      },
      apply: () => {
        const previous = partyOrders.find(accountId);
        partyOrders.upsert(accountId, order);
        const changed =
          !previous ||
          previous.order[0] !== order[0] ||
          previous.order[1] !== order[1] ||
          previous.order[2] !== order[2];
        return { result: { partyOrder: { accountId, order } }, changed };
      },
    },
  );
}
