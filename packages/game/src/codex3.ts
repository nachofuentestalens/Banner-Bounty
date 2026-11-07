// M3 codex assembly (design/game/m3-systems.md section 6). A pure read-only
// view joining the already-frozen content tables (CLASSES_V3/SKILLS_V3/
// SPECIALIZATIONS_V3/RACES_V3, validated by validateContentV3) into the
// exact shape section 6 requires: all eight classes, primary curves at
// levels 1-10, secondary 25% contribution, role, Basic/Active/Passive kinds,
// all unlock levels/cooldowns (including locked skills, shown with their
// level, never hidden), both specializations per class, and the three race
// tradeoffs. Skill targeting/row/taunt-exception prose and specialization
// effect copy stay sourced from m3-systems.md/combat.md and design/game/
// narrative/copy.md by the UI layer (M3-09) — the same split apps/web/src/
// skillMechanics.ts and copy.ts already use for M1/M2's Codex screen. This
// module never re-derives combat behavior; it only exposes the structured
// facts combat3.ts/builds3.ts already compute from, so a server catalog
// (M3-08) and the codex screen (M3-09) have one pure function to call
// instead of re-deriving this join themselves.
import {
  CLASSES_V3, SKILLS_V3, SPECIALIZATIONS_V3, RACES_V3,
  type ClassIdV3, type ClassDefinitionV3, type SkillDefinitionV3,
  type PrimarySpecializationV3, type RaceDefinitionV3,
} from "@banner-and-bounty/content";
import { statAtLevelV3 } from "./builds3.js";
import type { LeveledStatsV2 } from "./stats2.js";

/** classes.md 2.1 step 2 / m3-systems.md section 6's "secondary 25% contribution": computeDualClassBase already applies floor(secondaryStat/4); this names that fraction for codex display. */
export const SECONDARY_CONTRIBUTION_PERCENT_V3 = 25;

const SKILL_KIND_ORDER = { basic: 0, active: 1, passive: 2 } as const;

/** All of a class's skills (basic + both actives + both passives), including those locked at level 1 — m3-systems.md section 6 requires locked skills shown with their level, never hidden. */
export function skillsForClassV3(classId: ClassIdV3): readonly SkillDefinitionV3[] {
  return SKILLS_V3.filter((s) => s.classId === classId)
    .slice()
    .sort((a, b) => SKILL_KIND_ORDER[a.kind] - SKILL_KIND_ORDER[b.kind] || a.unlockLevel - b.unlockLevel);
}

/** Both primary specialization choices for a class, in m3-systems.md section 4's table order. */
export function specializationsForClassV3(classId: ClassIdV3): readonly PrimarySpecializationV3[] {
  return SPECIALIZATIONS_V3.filter((s) => s.classId === classId);
}

export interface StatCurveEntryV3 extends LeveledStatsV2 {
  readonly level: number;
}

/** Primary curve at every level 1-10 (m3-systems.md section 6: "primary curves at levels 1-10"). */
export function statCurveV3(classId: ClassIdV3): readonly StatCurveEntryV3[] {
  const curve: StatCurveEntryV3[] = [];
  for (let level = 1; level <= 10; level++) curve.push({ level, ...statAtLevelV3(classId, level) });
  return curve;
}

export interface CodexClassEntryV3 {
  readonly classId: ClassIdV3;
  readonly display: string;
  readonly role: ClassDefinitionV3["role"];
  readonly statCurve: readonly StatCurveEntryV3[];
  readonly skills: readonly SkillDefinitionV3[];
  readonly specializations: readonly PrimarySpecializationV3[];
}

export function buildCodexClassEntryV3(classId: ClassIdV3): CodexClassEntryV3 {
  const def = CLASSES_V3.find((c) => c.classId === classId);
  if (!def) throw new Error(`Unknown M3 class: ${classId}`);
  return {
    classId: def.classId,
    display: def.display,
    role: def.role,
    statCurve: statCurveV3(classId),
    skills: skillsForClassV3(classId),
    specializations: specializationsForClassV3(classId),
  };
}

export interface CodexV3 {
  readonly secondaryContributionPercent: number;
  readonly classes: readonly CodexClassEntryV3[];
  readonly races: readonly RaceDefinitionV3[];
}

/** The complete m3-systems.md section 6 table: all eight classes (each with its full curve/skills/specializations) and the three race tradeoffs. */
export function buildCodexV3(): CodexV3 {
  return {
    secondaryContributionPercent: SECONDARY_CONTRIBUTION_PERCENT_V3,
    classes: CLASSES_V3.map((c) => buildCodexClassEntryV3(c.classId)),
    races: RACES_V3,
  };
}
