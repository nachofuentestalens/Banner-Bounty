// M2-22 class roster base stats (design/game/classes.md section 1). The
// three starter classId values and their stat curves are copied verbatim
// from the M1 CLASS_DEFINITIONS table (no change); the three new classes
// (Cleric/Rogue/Herald) exist only here, since M1's CLASS_DEFINITIONS /
// `specializations` tuple shape has no room for a class without exactly 2
// specializations and M2 retires the specialization concept entirely.

import type { ClassId } from "../index.js";

export interface ClassBaseStatsV2 {
  readonly classId: ClassId;
  readonly display: string;
  readonly role: "tank" | "healer" | "physical" | "magic" | "support";
  readonly hpBase: number;
  readonly hpGrowth: number;
  readonly atkBase: number;
  readonly atkGrowth: number;
  readonly defBase: number;
  readonly defGrowth: number;
  readonly spd: number;
}

export const CLASS_BASE_STATS_V2: readonly ClassBaseStatsV2[] = [
  { classId: "class_vanguard", display: "Vanguard", role: "tank", hpBase: 40, hpGrowth: 5, atkBase: 7, atkGrowth: 1, defBase: 6, defGrowth: 1, spd: 8 },
  { classId: "class_ranger", display: "Ranger", role: "physical", hpBase: 32, hpGrowth: 4, atkBase: 9, atkGrowth: 2, defBase: 4, defGrowth: 1, spd: 12 },
  { classId: "class_arcanist", display: "Arcanist", role: "magic", hpBase: 28, hpGrowth: 4, atkBase: 10, atkGrowth: 2, defBase: 3, defGrowth: 1, spd: 9 },
  { classId: "class_cleric", display: "Cleric", role: "healer", hpBase: 34, hpGrowth: 4, atkBase: 7, atkGrowth: 1, defBase: 5, defGrowth: 1, spd: 9 },
  { classId: "class_rogue", display: "Rogue", role: "physical", hpBase: 26, hpGrowth: 3, atkBase: 9, atkGrowth: 2, defBase: 3, defGrowth: 1, spd: 13 },
  { classId: "class_herald", display: "Herald", role: "support", hpBase: 30, hpGrowth: 4, atkBase: 6, atkGrowth: 1, defBase: 4, defGrowth: 1, spd: 11 },
];

export const BASE_CLASS_IDS_V2: readonly ClassId[] = CLASS_BASE_STATS_V2.map((c) => c.classId);

const BY_ID = new Map(CLASS_BASE_STATS_V2.map((c) => [c.classId, c] as const));

export function getClassBaseStatsV2(classId: string): ClassBaseStatsV2 {
  const found = BY_ID.get(classId as ClassId);
  if (!found) throw new Error(`Unknown classId (v2): ${classId}`);
  return found;
}

export function isBaseClassId(classId: string): classId is ClassId {
  return BY_ID.has(classId as ClassId);
}

/** Named synergy pairs (classes.md section 2.2) — documentation/UI lookup only; combat2.ts hardcodes each pair's behavior directly against (primaryClassId, secondaryClassId). */
export interface SynergyPair {
  readonly primaryClassId: ClassId;
  readonly secondaryClassId: ClassId;
  readonly name: string;
  readonly description: string;
}

export const SYNERGY_PAIRS: readonly SynergyPair[] = [
  { primaryClassId: "class_vanguard", secondaryClassId: "class_herald", name: "Banner Bearer", description: "Bulwark Call's Taunt duration is 3 rounds instead of 2." },
  { primaryClassId: "class_cleric", secondaryClassId: "class_vanguard", name: "Battle Medic", description: "Mending Light also grants its heal target status_fortify (+30% DEF, 1 round)." },
  { primaryClassId: "class_arcanist", secondaryClassId: "class_rogue", name: "Shadowflame", description: "status_burn applied by this hero caps at 4 stacks instead of 3." },
  { primaryClassId: "class_ranger", secondaryClassId: "class_herald", name: "Marching Fire", description: "Volley's AoE-attenuated ATK uses 8/10 instead of 7/10." },
  { primaryClassId: "class_rogue", secondaryClassId: "class_arcanist", name: "Hexblade", description: "Backstab also applies 1 status_burn stack (duration 2) to its target if the hit lands (not on dodge)." },
  { primaryClassId: "class_herald", secondaryClassId: "class_cleric", name: "Choir", description: "War Hymn's status_haste also grants +5% dodge chance to every affected ally for the status's duration." },
];

export function getSynergyName(primaryClassId: string, secondaryClassId: string | null): string | null {
  if (!secondaryClassId) return null;
  return SYNERGY_PAIRS.find((s) => s.primaryClassId === primaryClassId && s.secondaryClassId === secondaryClassId)?.name ?? null;
}

export function hasSynergy(primaryClassId: string, secondaryClassId: string | null, name: SynergyPair["name"]): boolean {
  return getSynergyName(primaryClassId, secondaryClassId) === name;
}
