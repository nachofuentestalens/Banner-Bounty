// Pure client-side gating rules mirrored from design/game/ui-spec.md /
// classes.md. These are UX conveniences only (ui-spec.md "Global
// conventions": disabling is a courtesy, not the correctness mechanism) —
// the server re-validates every one of them independently.
import type { AccountState, EquipmentSlot, Hero } from "./types.js";
import { itemSlot } from "./frozenIds.js";
import { classCopy } from "./copy.js";

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

/** first-session-redesign.md 4.3: "class name plus a 1-based index within that class, in the server's hero-array order" — never a real name (that needs contract S3). */
export function heroOrdinalLabel(heroes: readonly Hero[], heroId: string): string {
  const hero = heroes.find((h) => h.heroId === heroId);
  if (!hero) return heroId;
  const sameClass = heroes.filter((h) => h.primaryClassId === hero.primaryClassId);
  const idx = sameClass.findIndex((h) => h.heroId === heroId) + 1;
  return `${classCopy(hero.primaryClassId).name} ${idx}`;
}

export function fieldedHeroIds(state: Pick<AccountState, "formation">): string[] {
  const slots: readonly (string | null)[] = state.formation?.slots ?? [];
  return slots.filter((s): s is string => s !== null);
}

/** first-session-redesign.md section 4.2's seven-rung goal ladder. Pure and read-only: no field here ever triggers a mutation. */
export type GoalId = "dispatch" | "watch_or_collect" | "equip" | "secondary_class" | "challenge_boss" | "enter_dungeon" | "publish_arena" | "keep_building";

export interface Goal {
  readonly id: GoalId;
  readonly heroId?: string;
  readonly slot?: EquipmentSlot;
}

export function nextGoal(state: Pick<AccountState, "heroes" | "formation" | "inventory" | "expedition" | "dungeon" | "bossClaims">): Goal {
  const neverRun = state.expedition.status === "none" && state.dungeon.status === "none";
  const allFreshLevel1 = state.heroes.length > 0 && state.heroes.every((h) => h.level === 1 && h.xp === 0);
  if (neverRun && allFreshLevel1) return { id: "dispatch" };

  if (isActivityActive(state)) return { id: "watch_or_collect" };

  const fielded = fieldedHeroIds(state);
  for (const item of state.inventory) {
    if (item.equippedBy) continue;
    const slot = itemSlot(item.definitionId);
    const hero = state.heroes.find((h) => fielded.includes(h.heroId) && h.equipment[slot] === null);
    if (hero) return { id: "equip", heroId: hero.heroId, slot };
  }

  const needsSecondary = state.heroes.find((h) => h.level >= 3 && h.secondaryClassId === null);
  if (needsSecondary) return { id: "secondary_class", heroId: needsSecondary.heroId };

  const tollClaim = state.bossClaims.find((c) => c.bossId === "boss_tollkeeper");
  const tollClaimed = tollClaim?.claimedAt != null;
  const fieldedLv3 = state.heroes.some((h) => fielded.includes(h.heroId) && h.level >= 3);
  if (!tollClaimed && fieldedLv3) return { id: "challenge_boss" };

  const dungeonEverEntered = state.dungeon.status === "active" || state.dungeon.outcome !== "none";
  if (tollClaimed && !dungeonEverEntered) return { id: "enter_dungeon" };

  // No "published to arena" field exists on AccountState yet (section 4.2
  // goal 7's documented fallback for a state shape without that field).
  return { id: "keep_building" };
}
