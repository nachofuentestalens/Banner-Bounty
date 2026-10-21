// Pure client-side gating rules mirrored from design/game/ui-spec.md /
// classes.md. These are UX conveniences only (ui-spec.md "Global
// conventions": disabling is a courtesy, not the correctness mechanism) —
// the server re-validates every one of them independently.
import type { AccountState, Hero } from "./types.js";

export function isFormationComplete(state: Pick<AccountState, "formation">): boolean {
  return state.formation !== null && state.formation.slots.some((s) => s !== null);
}

export function isExpeditionActive(state: Pick<AccountState, "expedition">): boolean {
  return state.expedition.status === "active";
}

export function isDungeonActive(state: Pick<AccountState, "dungeon">): boolean {
  return state.dungeon.status === "active";
}

export function isActivityActive(state: Pick<AccountState, "expedition" | "dungeon">): boolean {
  return isExpeditionActive(state) || isDungeonActive(state);
}

/** classes.md section 4.2: dual-class unlocks at level 3. */
export function isSecondaryClassUnlocked(hero: Pick<Hero, "level">): boolean {
  return hero.level >= 3;
}

export function canAssignSecondaryClass(hero: Pick<Hero, "level">, activityActive: boolean): boolean {
  return isSecondaryClassUnlocked(hero) && !activityActive;
}

export function canEditEquipment(activityActive: boolean): boolean {
  return !activityActive;
}
