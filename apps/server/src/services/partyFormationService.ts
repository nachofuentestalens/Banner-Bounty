import type { DatabaseSync } from "node:sqlite";
import type { PartyFormation, PartyFormationRequest } from "@banner-and-bounty/contracts";
import { AppError } from "../errors.js";
import { runMutation, type MutationResult } from "../mutation.js";
import { HeroRepository } from "../repositories/heroRepository.js";
import { PartyFormationRepository } from "../repositories/partyFormationRepository.js";

// PATCH /party/formation (contracts.md M2-25 addition, replacing PATCH
// /party/order). Not locked by active_expedition/active_dungeon — formation
// only affects future activity starts, mirroring the M1-01 decision on the
// retired /party/order.
export function applyPartyFormation(
  db: DatabaseSync,
  accountId: string,
  request: PartyFormationRequest,
): MutationResult<{ formation: PartyFormation }> {
  const heroes = new HeroRepository(db);
  const formations = new PartyFormationRepository(db);
  const { slots } = request;

  return runMutation(
    db,
    {
      accountId,
      command: "party/formation",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: { slots },
    },
    {
      precondition: () => {
        for (const heroId of slots) {
          if (heroId === null) continue;
          const hero = heroes.findById(heroId);
          if (!hero || hero.accountId !== accountId) {
            throw new AppError("forbidden", `heroId ${heroId} does not belong to this account`);
          }
        }
      },
      apply: () => {
        const current = formations.find(accountId);
        if (current && current.slots.every((s, i) => s === slots[i])) {
          return { result: { formation: current }, changed: false };
        }
        formations.upsert(accountId, slots);
        return { result: { formation: formations.find(accountId)! }, changed: true };
      },
    },
  );
}
