// Class kits (design/game/classes.md section 5). Metadata only — unlock
// level, cooldown and kind, used for loadout validation (what can occupy a
// slot, when); the actual skill formulas are implemented in
// packages/game/src/combat2.ts, same division of labor M1 already used
// between content.md (IDs/stats) and combat.ts (formulas).

import type { ClassId } from "../index.js";

export type SkillKind = "basic" | "active" | "passive";

export const SKILL_IDS = [
  "strike", "bulwark_call", "shield_bash", "thick_hide", "last_stand",
  "smite", "mending_light", "sanctuary", "devotion", "vital_surge",
  "quick_shot", "aimed_shot", "volley", "hunters_focus", "momentum",
  "puncture", "backstab", "flurry", "opportunist", "evasion",
  "arcane_bolt", "firebolt", "meteor", "overload", "arcane_reserve",
  "rally_strike", "war_hymn", "discordant_verse", "encore", "battle_hymn",
] as const;

export type SkillId = (typeof SKILL_IDS)[number];

export interface SkillDefinition {
  readonly skillId: SkillId;
  readonly classId: ClassId;
  readonly kind: SkillKind;
  readonly unlockLevel: number;
  readonly cooldown: number; // rounds; 0 for basic/passive and for Firebolt (classes.md 5.5)
}

export const SKILL_DEFINITIONS: readonly SkillDefinition[] = [
  // Vanguard
  { skillId: "strike", classId: "class_vanguard", kind: "basic", unlockLevel: 1, cooldown: 0 },
  { skillId: "bulwark_call", classId: "class_vanguard", kind: "active", unlockLevel: 1, cooldown: 3 },
  { skillId: "shield_bash", classId: "class_vanguard", kind: "active", unlockLevel: 5, cooldown: 2 },
  { skillId: "thick_hide", classId: "class_vanguard", kind: "passive", unlockLevel: 1, cooldown: 0 },
  { skillId: "last_stand", classId: "class_vanguard", kind: "passive", unlockLevel: 8, cooldown: 0 },
  // Cleric
  { skillId: "smite", classId: "class_cleric", kind: "basic", unlockLevel: 1, cooldown: 0 },
  { skillId: "mending_light", classId: "class_cleric", kind: "active", unlockLevel: 1, cooldown: 2 },
  { skillId: "sanctuary", classId: "class_cleric", kind: "active", unlockLevel: 5, cooldown: 4 },
  { skillId: "devotion", classId: "class_cleric", kind: "passive", unlockLevel: 1, cooldown: 0 },
  { skillId: "vital_surge", classId: "class_cleric", kind: "passive", unlockLevel: 8, cooldown: 0 },
  // Ranger
  { skillId: "quick_shot", classId: "class_ranger", kind: "basic", unlockLevel: 1, cooldown: 0 },
  { skillId: "aimed_shot", classId: "class_ranger", kind: "active", unlockLevel: 1, cooldown: 2 },
  { skillId: "volley", classId: "class_ranger", kind: "active", unlockLevel: 5, cooldown: 3 },
  { skillId: "hunters_focus", classId: "class_ranger", kind: "passive", unlockLevel: 1, cooldown: 0 },
  { skillId: "momentum", classId: "class_ranger", kind: "passive", unlockLevel: 8, cooldown: 0 },
  // Rogue
  { skillId: "puncture", classId: "class_rogue", kind: "basic", unlockLevel: 1, cooldown: 0 },
  { skillId: "backstab", classId: "class_rogue", kind: "active", unlockLevel: 1, cooldown: 2 },
  { skillId: "flurry", classId: "class_rogue", kind: "active", unlockLevel: 5, cooldown: 3 },
  { skillId: "opportunist", classId: "class_rogue", kind: "passive", unlockLevel: 1, cooldown: 0 },
  { skillId: "evasion", classId: "class_rogue", kind: "passive", unlockLevel: 8, cooldown: 0 },
  // Arcanist
  { skillId: "arcane_bolt", classId: "class_arcanist", kind: "basic", unlockLevel: 1, cooldown: 0 },
  { skillId: "firebolt", classId: "class_arcanist", kind: "active", unlockLevel: 1, cooldown: 0 },
  { skillId: "meteor", classId: "class_arcanist", kind: "active", unlockLevel: 5, cooldown: 4 },
  { skillId: "overload", classId: "class_arcanist", kind: "passive", unlockLevel: 1, cooldown: 0 },
  { skillId: "arcane_reserve", classId: "class_arcanist", kind: "passive", unlockLevel: 8, cooldown: 0 },
  // Herald
  { skillId: "rally_strike", classId: "class_herald", kind: "basic", unlockLevel: 1, cooldown: 0 },
  { skillId: "war_hymn", classId: "class_herald", kind: "active", unlockLevel: 1, cooldown: 3 },
  { skillId: "discordant_verse", classId: "class_herald", kind: "active", unlockLevel: 5, cooldown: 3 },
  { skillId: "encore", classId: "class_herald", kind: "passive", unlockLevel: 1, cooldown: 0 },
  { skillId: "battle_hymn", classId: "class_herald", kind: "passive", unlockLevel: 8, cooldown: 0 },
];

const BY_SKILL_ID = new Map(SKILL_DEFINITIONS.map((s) => [s.skillId, s] as const));

export function getSkillDefinition(skillId: string): SkillDefinition {
  const found = BY_SKILL_ID.get(skillId as SkillId);
  if (!found) throw new Error(`Unknown skillId: ${skillId}`);
  return found;
}

export function basicAttackSkillId(classId: ClassId): SkillId {
  const found = SKILL_DEFINITIONS.find((s) => s.classId === classId && s.kind === "basic");
  if (!found) throw new Error(`No basic attack defined for classId: ${classId}`);
  return found.skillId;
}

export function skillsForClass(classId: string): readonly SkillDefinition[] {
  return SKILL_DEFINITIONS.filter((s) => s.classId === classId);
}

/** Skills of `kind` unlocked for `classId` at `level` (classes.md section 5.7). */
export function unlockedSkillIds(classId: string, level: number, kind: "active" | "passive"): readonly SkillId[] {
  return SKILL_DEFINITIONS.filter((s) => s.classId === classId && s.kind === kind && s.unlockLevel <= level).map((s) => s.skillId);
}

/**
 * The union pool a hero may fill its 2 active + 2 passive slots from
 * (classes.md section 4/5.7): primary's unlocked skills, plus secondary's if
 * assigned, at the hero's current level.
 */
export function unlockedSkillPool(
  primaryClassId: string,
  secondaryClassId: string | null,
  level: number,
  kind: "active" | "passive",
): readonly SkillId[] {
  const pool = new Set<SkillId>(unlockedSkillIds(primaryClassId, level, kind));
  if (secondaryClassId) for (const id of unlockedSkillIds(secondaryClassId, level, kind)) pool.add(id);
  return [...pool];
}

/** Auto-fill a loadout with as much of the class's own unlocked kit as fits (classes.md 5.7, used by fresh recruits and by the M1->M2 migration plan). */
export function autoFillLoadout(classId: string, level: number): { active: readonly [string, string]; passive: readonly [string, string] } {
  const actives = unlockedSkillIds(classId, level, "active");
  const passives = unlockedSkillIds(classId, level, "passive");
  return {
    active: [actives[0] ?? "", actives[1] ?? ""],
    passive: [passives[0] ?? "", passives[1] ?? ""],
  };
}
