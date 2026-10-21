// Formation/party helpers for combat v2 (classes.md sections 3-4).

import type { ClassId } from "@banner-and-bounty/content";
import type { CombatantInputV2 } from "./combat2.js";
import type { EquipmentV2 } from "./stats2.js";

export interface PartyMemberInputV2 {
  readonly heroId: string;
  readonly slotIndex: number; // 0-4; 0-2 front row, 3-4 back row (classes.md section 3)
  readonly primaryClassId: ClassId;
  readonly secondaryClassId: ClassId | null;
  readonly level: number;
  readonly equipment: EquipmentV2;
  readonly skillLoadout: { readonly active: readonly [string, string]; readonly passive: readonly [string, string] };
}

export function toHeroCombatantsV2(party: readonly PartyMemberInputV2[]): CombatantInputV2[] {
  return party.map((h) => ({
    kind: "hero" as const,
    id: h.heroId,
    slotIndex: h.slotIndex,
    primaryClassId: h.primaryClassId,
    secondaryClassId: h.secondaryClassId,
    level: h.level,
    equipment: h.equipment,
    skillLoadout: h.skillLoadout,
  }));
}
