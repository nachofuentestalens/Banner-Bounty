// Pure client-side gating rules mirrored from design/game/ui-spec.md. These
// are UX conveniences only (ui-spec.md "Global conventions": disabling is a
// courtesy, not the correctness mechanism) — the server re-validates every
// one of them independently.
import type { AccountState, Hero } from "./types.js";

export function isPartyComplete(state: Pick<AccountState, "partyOrder">): boolean {
  return state.partyOrder !== null && state.partyOrder.order.length === 3;
}

export function isExpeditionActive(state: Pick<AccountState, "expedition">): boolean {
  return state.expedition.status === "active";
}

/** A hero is spec-eligible once it reaches level 3 (design/game/content.md). */
export function isSpecUnlocked(hero: Pick<Hero, "level">): boolean {
  return hero.level >= 3;
}

export function canChooseSpecialization(hero: Pick<Hero, "level" | "specializationId">, expeditionActive: boolean): boolean {
  return isSpecUnlocked(hero) && hero.specializationId === null && !expeditionActive;
}

export function canEditEquipment(expeditionActive: boolean): boolean {
  return !expeditionActive;
}
