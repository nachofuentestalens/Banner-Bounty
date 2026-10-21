// Status effects reference (design/game/classes.md section 6). Durations
// and stack caps are data; the magnitude formulas (percent/flat amounts)
// are small enough and tightly coupled to combat2.ts's per-round loop that
// they are implemented there directly (same precedent as M1's Burn, which
// combat.md 3.7 fully specifies but combat.ts hardcodes the tick formula).

export type StatusId = "status_burn" | "status_weaken" | "status_fortify" | "status_haste" | "status_regen" | "status_taunt";

export type StatusKind = "dot" | "debuff" | "buff" | "hot" | "control";

export interface StatusDefinition {
  readonly statusId: StatusId;
  readonly kind: StatusKind;
  readonly baseDuration: number; // rounds; some skills grant a non-default duration (e.g. Battle Medic's 1-round Fortify) — combat2.ts overrides per-application where the spec says so
  readonly stackCap: number; // 1 = not stackable
}

export const STATUS_DEFINITIONS: readonly StatusDefinition[] = [
  { statusId: "status_burn", kind: "dot", baseDuration: 2, stackCap: 3 },
  { statusId: "status_weaken", kind: "debuff", baseDuration: 2, stackCap: 1 },
  { statusId: "status_fortify", kind: "buff", baseDuration: 2, stackCap: 1 },
  { statusId: "status_haste", kind: "buff", baseDuration: 3, stackCap: 1 },
  { statusId: "status_regen", kind: "hot", baseDuration: 3, stackCap: 1 },
  { statusId: "status_taunt", kind: "control", baseDuration: 2, stackCap: 1 },
];

const BY_ID = new Map(STATUS_DEFINITIONS.map((s) => [s.statusId, s] as const));

export function getStatusDefinition(statusId: string): StatusDefinition {
  const found = BY_ID.get(statusId as StatusId);
  if (!found) throw new Error(`Unknown statusId: ${statusId}`);
  return found;
}
