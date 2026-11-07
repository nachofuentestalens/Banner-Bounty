export * from "./builds.js";
export * from "./encounters.js";

import { CLASSES_V3, SKILLS_V3, SPECIALIZATIONS_V3, RACES_V3 } from "./builds.js";
import { ARCHIVE_ENEMIES_V3, DUNGEONS_V3 } from "./encounters.js";
import { REWARD_PROFILES } from "../v2/gear.js";
import { validateContentV2 } from "../v2/index.js";

// Separate opt-in version: do not change the current server rules until M3-08 migration.
export const M3_RULES_VERSION = 3 as const;
export const M3_RULES = {
  rulesVersion: M3_RULES_VERSION,
  msPerRound: 2000, // provisional measurement candidate, frozen per run
  maxBattlesPerSettlement: 500, // provisional CPU bound, benchmark before acceptance
  offlineCapMs: 28_800_000,
  respecCooldownMs: 86_400_000,
  seasonLengthMs: 604_800_000,
  seasonEntryWindowMs: 86_400_000,
} as const;

export function validateContentV3(): void {
  validateContentV2();
  function unique(ids: readonly string[], count: number): void {
    if (ids.length !== count || new Set(ids).size !== count) throw new Error(`Expected ${count} unique M3 IDs`);
  }
  unique(CLASSES_V3.map(c => c.classId), 8);
  unique(SKILLS_V3.map(s => s.skillId), 40);
  unique(SPECIALIZATIONS_V3.map(s => s.specializationId), 16);
  unique(RACES_V3.map(r => r.raceId), 3);
  unique(DUNGEONS_V3.map(d => d.dungeonId), 2);
  for (const c of CLASSES_V3) {
    for (const value of [c.hpBase, c.hpGrowth, c.atkBase, c.atkGrowth, c.defBase, c.defGrowth, c.spd]) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid M3 curve: ${c.classId}`);
    }
    for (const [kind, count] of [["basic", 1], ["active", 2], ["passive", 2]] as const) {
      if (SKILLS_V3.filter(s => s.classId === c.classId && s.kind === kind).length !== count) throw new Error(`Invalid M3 kit: ${c.classId}`);
    }
    if (SPECIALIZATIONS_V3.filter(s => s.classId === c.classId).length !== 2) throw new Error(`Invalid M3 specializations: ${c.classId}`);
  }
  for (const skill of SKILLS_V3) {
    if (!CLASSES_V3.some(c => c.classId === skill.classId) || ![1, 5, 8].includes(skill.unlockLevel) || !Number.isSafeInteger(skill.cooldown) || skill.cooldown < 0) throw new Error(`Invalid M3 skill: ${skill.skillId}`);
  }
  for (const spec of SPECIALIZATIONS_V3) {
    if (!SKILLS_V3.some(s => s.skillId === spec.skillId && s.classId === spec.classId && s.kind === "active")) throw new Error(`Invalid M3 specialization skill: ${spec.specializationId}`);
  }
  for (const dungeon of DUNGEONS_V3) {
    if (dungeon.floors.length !== 4 || dungeon.floorDurationMs !== 180_000) throw new Error("Invalid M3 dungeon timing");
    dungeon.floors.forEach((floor, index) => {
      if (floor.floor !== index + 1 || floor.isBoss !== (index === 3) || !REWARD_PROFILES[floor.rewardProfileId]) throw new Error("Invalid M3 floor");
      const slots = floor.enemies.map(e => e.slotIndex);
      if (!slots.length || slots.length > 5 || new Set(slots).size !== slots.length || slots.some(s => !Number.isInteger(s) || s < 0 || s > 4)) throw new Error("Invalid M3 enemy formation");
      if (dungeon.dungeonId === "dungeon_cinder_archive" && floor.enemies.some(e => !ARCHIVE_ENEMIES_V3.some(a => a.enemyId === e.enemyId))) throw new Error("Unknown archive enemy");
    });
  }
}
