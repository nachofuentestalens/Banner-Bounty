export * from "./classes.js";
export * from "./skills.js";
export * from "./statuses.js";
export * from "./gear.js";
export * from "./encounters.js";

import { CLASS_BASE_STATS_V2 } from "./classes.js";
import { SKILL_DEFINITIONS, type SkillKind } from "./skills.js";
import { STATUS_DEFINITIONS } from "./statuses.js";
import { RARITY_DEFINITIONS, SLOT_AFFIX_POOL, AFFIX_VALUE_RANGES, REWARD_PROFILES } from "./gear.js";
import { AREAS, DUNGEONS, validateDungeonTimeBudget } from "./encounters.js";

/** Structural self-check for the M2 content tables, mirroring validateContent()'s M1 checks. */
export function validateContentV2(): void {
  const classIds = new Set<string>();
  for (const c of CLASS_BASE_STATS_V2) {
    if (classIds.has(c.classId)) throw new Error(`Duplicate classId (v2): ${c.classId}`);
    classIds.add(c.classId);
  }
  if (CLASS_BASE_STATS_V2.length !== 6) throw new Error(`Expected exactly 6 base classes, found ${CLASS_BASE_STATS_V2.length}`);

  const skillIds = new Set<string>();
  const countByClass = new Map<string, Record<SkillKind, number>>();
  for (const s of SKILL_DEFINITIONS) {
    if (skillIds.has(s.skillId)) throw new Error(`Duplicate skillId: ${s.skillId}`);
    skillIds.add(s.skillId);
    if (!classIds.has(s.classId)) throw new Error(`Skill ${s.skillId} references unknown classId ${s.classId}`);
    const counts = countByClass.get(s.classId) ?? { basic: 0, active: 0, passive: 0 };
    counts[s.kind] += 1;
    countByClass.set(s.classId, counts);
  }
  for (const classId of classIds) {
    const counts = countByClass.get(classId);
    if (!counts || counts.basic !== 1 || counts.active !== 2 || counts.passive !== 2) {
      throw new Error(`Class ${classId} must have exactly 1 basic + 2 active + 2 passive skills, found ${JSON.stringify(counts)}`);
    }
  }

  const statusIds = new Set<string>();
  for (const s of STATUS_DEFINITIONS) {
    if (statusIds.has(s.statusId)) throw new Error(`Duplicate statusId: ${s.statusId}`);
    statusIds.add(s.statusId);
  }
  if (STATUS_DEFINITIONS.length !== 6) throw new Error(`Expected exactly 6 statuses, found ${STATUS_DEFINITIONS.length}`);

  const rarityIds = new Set<string>();
  for (const r of RARITY_DEFINITIONS) {
    if (rarityIds.has(r.rarityId)) throw new Error(`Duplicate rarityId: ${r.rarityId}`);
    rarityIds.add(r.rarityId);
  }
  if (RARITY_DEFINITIONS.length !== 4) throw new Error(`Expected exactly 4 rarities, found ${RARITY_DEFINITIONS.length}`);

  for (const slot of ["weapon", "armor", "trinket"] as const) {
    const pool = SLOT_AFFIX_POOL[slot];
    const expected = slot === "trinket" ? 4 : 3;
    if (pool.length !== expected) throw new Error(`Slot ${slot} affix pool expected ${expected} entries, found ${pool.length}`);
    for (const affixId of pool) {
      for (const rarity of ["uncommon", "rare", "epic"] as const) {
        if (!AFFIX_VALUE_RANGES[slot][affixId]?.[rarity]) {
          throw new Error(`Missing affix value range for ${slot}/${affixId}/${rarity}`);
        }
      }
    }
  }

  for (const profile of Object.values(REWARD_PROFILES)) {
    const sum = profile.rarityWeights.reduce((a, b) => a + b, 0);
    if (sum !== 100) throw new Error(`Reward profile ${profile.profileId} rarity weights must sum to 100, found ${sum}`);
  }

  const areaIds = new Set<string>();
  for (const area of AREAS) {
    if (areaIds.has(area.areaId)) throw new Error(`Duplicate areaId: ${area.areaId}`);
    areaIds.add(area.areaId);
    if (!REWARD_PROFILES[area.rewardProfileId]) throw new Error(`Area ${area.areaId} references unknown reward profile ${area.rewardProfileId}`);
  }

  const dungeonIds = new Set<string>();
  for (const dungeon of DUNGEONS) {
    if (dungeonIds.has(dungeon.dungeonId)) throw new Error(`Duplicate dungeonId: ${dungeon.dungeonId}`);
    dungeonIds.add(dungeon.dungeonId);
    validateDungeonTimeBudget(dungeon);
    if (dungeon.floors.length === 0) throw new Error(`Dungeon ${dungeon.dungeonId} has no floors`);
    const lastFloor = dungeon.floors[dungeon.floors.length - 1]!;
    if (!lastFloor.isBoss) throw new Error(`Dungeon ${dungeon.dungeonId}'s last floor must be the boss floor`);
    for (const floor of dungeon.floors.slice(0, -1)) {
      if (floor.isBoss) throw new Error(`Dungeon ${dungeon.dungeonId} floor ${floor.floor} is marked isBoss but is not the last floor`);
    }
    dungeon.floors.forEach((floor, i) => {
      if (floor.floor !== i + 1) throw new Error(`Dungeon ${dungeon.dungeonId} floors must be ordered 1..N, found floor ${floor.floor} at index ${i}`);
      if (!REWARD_PROFILES[floor.rewardProfileId]) throw new Error(`Dungeon floor ${dungeon.dungeonId}#${floor.floor} references unknown reward profile ${floor.rewardProfileId}`);
    });
  }
}
