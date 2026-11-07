// M3-03 frozen mechanics. The v2 tables remain unchanged for legacy runs.
import type { ClassId } from "../index.js";
import { CLASS_BASE_STATS_V2, type ClassBaseStatsV2 } from "../v2/classes.js";
import { SKILL_DEFINITIONS, type SkillDefinition } from "../v2/skills.js";

export type ClassIdV3 = ClassId | "class_warder" | "class_weaver";
export interface ClassDefinitionV3 extends Omit<ClassBaseStatsV2, "classId"> {
  readonly classId: ClassIdV3;
}
export const CLASSES_V3: readonly ClassDefinitionV3[] = [
  ...CLASS_BASE_STATS_V2,
  { classId: "class_warder", display: "Warder", role: "support", hpBase: 38, hpGrowth: 5, atkBase: 6, atkGrowth: 1, defBase: 6, defGrowth: 1, spd: 7 },
  { classId: "class_weaver", display: "Weaver", role: "magic", hpBase: 29, hpGrowth: 4, atkBase: 9, atkGrowth: 2, defBase: 3, defGrowth: 1, spd: 10 },
];

export interface SkillDefinitionV3 extends Omit<SkillDefinition, "skillId" | "classId"> {
  readonly skillId: string;
  readonly classId: ClassIdV3;
}
export const SKILLS_V3: readonly SkillDefinitionV3[] = [
  ...SKILL_DEFINITIONS,
  { skillId: "skill_warder_tap", classId: "class_warder", kind: "basic", unlockLevel: 1, cooldown: 0 },
  { skillId: "skill_warder_brace", classId: "class_warder", kind: "active", unlockLevel: 1, cooldown: 3 },
  { skillId: "skill_warder_repair", classId: "class_warder", kind: "active", unlockLevel: 5, cooldown: 3 },
  { skillId: "skill_warder_rooted", classId: "class_warder", kind: "passive", unlockLevel: 1, cooldown: 0 },
  { skillId: "skill_warder_aftercare", classId: "class_warder", kind: "passive", unlockLevel: 8, cooldown: 0 },
  { skillId: "skill_weaver_thread", classId: "class_weaver", kind: "basic", unlockLevel: 1, cooldown: 0 },
  { skillId: "skill_weaver_snare", classId: "class_weaver", kind: "active", unlockLevel: 1, cooldown: 3 },
  { skillId: "skill_weaver_unravel", classId: "class_weaver", kind: "active", unlockLevel: 5, cooldown: 4 },
  { skillId: "skill_weaver_tension", classId: "class_weaver", kind: "passive", unlockLevel: 1, cooldown: 0 },
  { skillId: "skill_weaver_slip", classId: "class_weaver", kind: "passive", unlockLevel: 8, cooldown: 0 },
];

export interface PrimarySpecializationV3 {
  readonly specializationId: string;
  readonly classId: ClassIdV3;
  readonly display: string;
  readonly skillId: string;
  readonly effect: string;
  readonly unlockLevel: 3;
}
export const SPECIALIZATIONS_V3: readonly PrimarySpecializationV3[] = [
  ["vanguard", "sentinel", "Sentinel", "bulwark_call", "Also Fortifies the lowest-HP% other living ally for 2 rounds; no other ally means no extra effect."],
  ["vanguard", "breaker", "Breaker", "shield_bash", "Ignores row protection; still obeys taunt."],
  ["ranger", "tracker", "Tracker", "aimed_shot", "Execute threshold is 50% instead of 30%."],
  ["ranger", "scatter", "Scatter", "volley", "Selects up to 3 targets instead of 2, with the same attenuation."],
  ["arcanist", "ember", "Ember", "firebolt", "Selects highest-current-HP legal enemy instead of lowest, slot tie; still obeys taunt and rows."],
  ["arcanist", "quench", "Quench", "meteor", "Removes Haste from each selected enemy before its damage roll, even on dodge."],
  ["cleric", "triage", "Triage", "mending_light", "Uses 6/5 instead of 4/5 healing when target HP% is below 30; Devotion applies afterward if equipped."],
  ["cleric", "shelter", "Shelter", "sanctuary", "Also Fortifies all living allies for 1 round."],
  ["rogue", "duelist", "Duelist", "backstab", "Targets highest ATK living enemy, slot tie; still ignores rows and obeys taunt."],
  ["rogue", "pursuer", "Pursuer", "flurry", "Reselects the default target before hit 2, including after death; omits hit 2 if none remain, consuming no RNG."],
  ["herald", "cadence", "Cadence", "war_hymn", "Removes Weaken from each living ally before granting Haste."],
  ["herald", "dissonance", "Dissonance", "discordant_verse", "Targets highest ATK living enemy across rows, slot tie; obeys taunt."],
  ["warder", "anchor", "Anchor", "skill_warder_brace", "Also Taunts the recipient for 1 round; most recent taunt wins."],
  ["warder", "mender", "Mender", "skill_warder_repair", "Targets up to two lowest-HP% living allies, each healed floor(ATK*4/5) instead of 6/5; Aftercare applies to each."],
  ["weaver", "fray", "Fray", "skill_weaver_snare", "Additionally removes Haste on a landed hit."],
  ["weaver", "sever", "Sever", "skill_weaver_unravel", "Selects a Fortified enemy first (highest ATK, slot tie), else its usual target; taunt overrides."],
].map(([primary, choice, display, skillId, effect]) => ({
  specializationId: `m3spec_${primary}_${choice}`, classId: `class_${primary}` as ClassIdV3,
  display: display!, skillId: skillId!, effect: effect!, unlockLevel: 3,
}));

export type RaceIdV3 = "race_vesper" | "race_cairn" | "race_serein";
export interface RaceDefinitionV3 {
  readonly raceId: RaceIdV3;
  readonly display: string;
  readonly hpPercent: number;
  readonly atkPercent: number;
  readonly defPercent: number;
  readonly spdFlat: number;
}
export const RACES_V3: readonly RaceDefinitionV3[] = [
  { raceId: "race_vesper", display: "Vesperkin", hpPercent: 5, atkPercent: -5, defPercent: 0, spdFlat: 0 },
  { raceId: "race_cairn", display: "Cairnfolk", hpPercent: 0, atkPercent: 0, defPercent: 10, spdFlat: -1 },
  { raceId: "race_serein", display: "Serein", hpPercent: -5, atkPercent: 0, defPercent: 0, spdFlat: 1 },
];

export function getClassV3(id: string): ClassDefinitionV3 {
  const value = CLASSES_V3.find(c => c.classId === id);
  if (!value) throw new Error(`Unknown M3 class: ${id}`);
  return value;
}
export function getSkillV3(id: string): SkillDefinitionV3 {
  const value = SKILLS_V3.find(s => s.skillId === id);
  if (!value) throw new Error(`Unknown M3 skill: ${id}`);
  return value;
}
export function getRaceV3(id: string): RaceDefinitionV3 {
  const value = RACES_V3.find(r => r.raceId === id);
  if (!value) throw new Error(`Unknown M3 race: ${id}`);
  return value;
}
export function basicAttackSkillIdV3(id: ClassIdV3): string {
  getClassV3(id);
  return SKILLS_V3.find(s => s.classId === id && s.kind === "basic")!.skillId;
}
export interface SkillLoadoutV3 {
  readonly active: readonly [string, string];
  readonly passive: readonly [string, string];
}
export function autoFillLoadoutV3(id: ClassIdV3, level: number): SkillLoadoutV3 {
  getClassV3(id);
  assertLevelV3(level);
  const slots = (kind: "active" | "passive"): readonly [string, string] => {
    const skills = SKILLS_V3.filter(s => s.classId === id && s.kind === kind && s.unlockLevel <= level);
    return [skills[0]?.skillId ?? "", skills[1]?.skillId ?? ""];
  };
  return { active: slots("active"), passive: slots("passive") };
}
export function assertLevelV3(level: number): void {
  if (!Number.isInteger(level) || level < 1 || level > 10) throw new Error("M3 level must be 1..10");
}
export function validateClassesV3(primary: ClassIdV3, secondary: ClassIdV3 | null, level: number): void {
  assertLevelV3(level);
  getClassV3(primary);
  if (secondary !== null) {
    getClassV3(secondary);
    if (level < 3 || secondary === primary) throw new Error("M3 secondary requires level 3 and a different class");
  }
}
export function validateLoadoutV3(primary: ClassIdV3, secondary: ClassIdV3 | null, level: number, loadout: SkillLoadoutV3): void {
  validateClassesV3(primary, secondary, level);
  for (const kind of ["active", "passive"] as const) {
    const slots = loadout[kind];
    if (!Array.isArray(slots) || slots.length !== 2) throw new Error(`Expected two ${kind} slots`);
    const filled = slots.filter(id => id !== "");
    if (new Set(filled).size !== filled.length) throw new Error(`Duplicate ${kind} skill`);
    for (const id of filled) {
      const skill = getSkillV3(id);
      if (skill.kind !== kind || skill.unlockLevel > level || (skill.classId !== primary && skill.classId !== secondary)) {
        throw new Error(`Invalid ${kind} skill for frozen M3 build: ${id}`);
      }
    }
  }
}
export function validateSpecializationV3(primary: ClassIdV3, level: number, id: string | null): void {
  getClassV3(primary);
  assertLevelV3(level);
  if (id === null) return;
  const spec = SPECIALIZATIONS_V3.find(s => s.specializationId === id);
  if (!spec || level < spec.unlockLevel || spec.classId !== primary) throw new Error("Invalid M3 primary specialization");
}
