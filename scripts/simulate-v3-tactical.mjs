#!/usr/bin/env node
// M3-07/M3-10 tactical measurement protocol (design/game/economy/m3.md
// section 6; design/game/m3-systems.md section 7). Drives the real
// packages/game engine (built dist) — no duplicate combat/content tables
// live in this file. Pure in-memory, deterministic seeds only.
//
// Scope this run covers: pairs (a) no-new-class counterexample, (b)
// Warder-included, (c) Weaver-included (all vs. an equal-budget
// glass-cannon five, against Cinder Archive floors 1-4) run twice — once
// with no gear (earlier session's run, kept for continuity) and once with
// identical equal-budget uncommon gear on every hero on both sides, matching
// economy/gear.md section 7's "equal-budget uncommon gear" entry condition;
// (d) the 16 primary-specialization pairs (one party per specialization
// choice vs. its unmodified-specialization twin, isolating only the skill
// the specialization modifies), against the existing dungeon
// (`dungeon_aqueduct_depths`, pre-M3 content, per economy/m3.md section 6
// item 1's "existing dungeon" instruction) with the same equal-budget gear;
// and (e) the three races, identical class/level/gear, against Old Road at
// level 5.
//
// Usage: npm run build && node scripts/simulate-v3-tactical.mjs [--seeds=32]
import process from "node:process";

let game, content;
try {
  game = await import("@banner-and-bounty/game");
  content = await import("@banner-and-bounty/content");
} catch (err) {
  console.error("[simulate-v3-tactical] run `npm run build` first.\n" + String(err && err.message ? err.message : err));
  process.exitCode = 1;
  process.exit(1);
}

const { simulateDungeonRunV3, simulateBattleV3 } = game;
const { OLD_ROAD_ENEMIES, autoFillLoadoutV3, SPECIALIZATIONS_V3 } = content;

const SEEDS = Number((process.argv.find((a) => a.startsWith("--seeds=")) ?? "--seeds=32").split("=")[1]) || 32;

// No-gear equipment (earlier session's baseline run, kept for continuity).
const NO_GEAR = { weapon: null, armor: null, trinket: null };

// Equal-budget uncommon gear (economy/gear.md section 2/section 7): one
// uncommon item per slot, one affix each, identical definition/affix/value
// on every hero on both sides of every pair below. Identical gear is a
// trivially valid instance of "equal total gear budget" (same rarity
// distribution and affix count) and removes gear entirely as a confound.
const EQUAL_UNCOMMON_GEAR = {
  weapon: { definitionId: "item_weapon_shortsword", affixes: [{ affixId: "affix_of_power", value: 2 }] },
  armor: { definitionId: "item_armor_leather", affixes: [{ affixId: "affix_of_warding", value: 2 }] },
  trinket: { definitionId: "item_trinket_whetstone", affixes: [{ affixId: "affix_of_vigor", value: 6 }] },
};

function hero(id, slotIndex, primaryClassId, level, opts = {}) {
  const { raceId = "race_vesper", secondaryClassId = null, primarySpecializationId = null, equipment = NO_GEAR } = opts;
  return {
    id,
    kind: "hero",
    slotIndex,
    primaryClassId,
    secondaryClassId,
    primarySpecializationId,
    raceId,
    level,
    equipment,
    skillLoadout: autoFillLoadoutV3(primaryClassId, level),
  };
}

function glassCannon5(level, equipment) {
  return [
    hero("dps1", 0, "class_rogue", level, { equipment }),
    hero("dps2", 1, "class_ranger", level, { equipment }),
    hero("dps3", 2, "class_arcanist", level, { equipment }),
    hero("dps4", 3, "class_rogue", level, { equipment }),
    hero("dps5", 4, "class_ranger", level, { equipment }),
  ];
}
function noNewClassBalanced5(level, equipment) {
  return [
    hero("tank", 0, "class_vanguard", level, { equipment }),
    hero("healer", 1, "class_cleric", level, { equipment }),
    hero("dps1", 2, "class_rogue", level, { equipment }),
    hero("dps2", 3, "class_ranger", level, { equipment }),
    hero("dps3", 4, "class_arcanist", level, { equipment }),
  ];
}
function warderIncluded5(level, equipment) {
  return [
    hero("tank", 0, "class_warder", level, { equipment }),
    hero("healer", 1, "class_cleric", level, { equipment }),
    hero("dps1", 2, "class_rogue", level, { equipment }),
    hero("dps2", 3, "class_ranger", level, { equipment }),
    hero("dps3", 4, "class_arcanist", level, { equipment }),
  ];
}
function weaverIncluded5(level, equipment) {
  return [
    hero("tank", 0, "class_vanguard", level, { equipment }),
    hero("healer", 1, "class_cleric", level, { equipment }),
    hero("dps1", 2, "class_rogue", level, { equipment }),
    hero("dps2", 3, "class_ranger", level, { equipment }),
    hero("control", 4, "class_weaver", level, { equipment }),
  ];
}

function runPair(label, dungeonId, partyFnA, partyFnB, level, seeds, seedBase, equipment) {
  const results = { a: [], b: [] };
  for (let i = 0; i < seeds; i++) {
    const seed = seedBase + i;
    for (const [key, partyFn] of [["a", partyFnA], ["b", partyFnB]]) {
      const run = simulateDungeonRunV3(dungeonId, partyFn(level, equipment), seed);
      const survivors = run.finalHeroHpRatios.filter((r) => r > 0).length;
      const avgHp = Math.round((run.finalHeroHpRatios.reduce((x, y) => x + y, 0) / run.finalHeroHpRatios.length) * 100);
      const totalRounds = run.floorResults.reduce((sum, f) => sum + f.battle.rounds, 0);
      results[key].push({ seed, outcome: run.outcome, floorsCleared: run.floorsCleared, survivors, avgHp, totalRounds });
    }
  }
  const clearRate = (rows) => rows.filter((r) => r.outcome === "cleared").length / rows.length;
  const avg = (rows, field) => Math.round((rows.reduce((x, y) => x + y[field], 0) / rows.length) * 100) / 100;
  const counterexamples = results.a.filter((rowA, i) => rowA.outcome !== results.b[i].outcome);
  console.log(`\n=== ${label} (${dungeonId}, ${seeds} paired seeds) ===`);
  console.log(`  A clear rate: ${(clearRate(results.a) * 100).toFixed(1)}%  avgFloorsCleared=${avg(results.a, "floorsCleared")}  avgRounds=${avg(results.a, "totalRounds")}  avgSurvivors=${avg(results.a, "survivors")}  avgHp%=${avg(results.a, "avgHp")}`);
  console.log(`  B clear rate: ${(clearRate(results.b) * 100).toFixed(1)}%  avgFloorsCleared=${avg(results.b, "floorsCleared")}  avgRounds=${avg(results.b, "totalRounds")}  avgSurvivors=${avg(results.b, "survivors")}  avgHp%=${avg(results.b, "avgHp")}`);
  console.log(`  Counterexamples (A/B outcome differs), ${counterexamples.length}/${seeds}: seeds ${counterexamples.map((c) => c.seed).join(",") || "none"}`);
  return { label, a: results.a, b: results.b, counterexampleCount: counterexamples.length };
}

function racedParty3(level, raceId) {
  return [
    hero("tank", 0, "class_vanguard", level, { raceId }),
    hero("healer", 1, "class_cleric", level, { raceId }),
    hero("dps", 2, "class_rogue", level, { raceId }),
  ];
}

function runRacePair(seeds, level) {
  const races = ["race_vesper", "race_cairn", "race_serein"];
  const enemies = OLD_ROAD_ENEMIES.map((e) => ({ kind: "enemy", id: e.enemyId, slotIndex: e.slot, enemyId: e.enemyId, stats: { maxHp: e.hp, atk: e.atk, def: e.def, spd: e.spd } }));
  console.log(`\n=== (e) Race tradeoff (Old Road, ${seeds} paired seeds, level ${level}, identical 3-hero tank/healer/dps party except race) ===`);
  const byRace = {};
  for (const raceId of races) {
    const rows = [];
    for (let i = 0; i < seeds; i++) {
      const seed = 2000 + i;
      const party = racedParty3(level, raceId);
      const battle = simulateBattleV3(party, enemies, "pve", seed);
      rows.push({ seed, result: battle.result, rounds: battle.rounds });
    }
    byRace[raceId] = rows;
    const winRate = rows.filter((r) => r.result === "win").length / rows.length;
    const avgRounds = Math.round((rows.reduce((x, y) => x + y.rounds, 0) / rows.length) * 100) / 100;
    console.log(`  ${raceId}: winRate=${(winRate * 100).toFixed(1)}%  avgRounds=${avgRounds}`);
  }
  return byRace;
}

// Pair (d): one party per primary specialization choice vs. its
// unmodified-specialization twin. The specialized hero occupies slot 0; a
// fixed support crew (healer/rogue/ranger/arcanist) fills the rest
// identically on both sides of every pair, so the specialization flag is
// the only difference between A and B. Every specialization's modified
// skill is an active skill unlocked by level 5, and `autoFillLoadoutV3`
// slots both of a class's actives at level 5 (every class has exactly two),
// so the modified skill is always present without hand-listing skill IDs.
function specializedParty(classId, specializationId, level, equipment) {
  return [
    hero("spec", 0, classId, level, { primarySpecializationId: specializationId, equipment }),
    hero("healer", 1, "class_cleric", level, { equipment }),
    hero("dps1", 2, "class_rogue", level, { equipment }),
    hero("dps2", 3, "class_ranger", level, { equipment }),
    hero("dps3", 4, "class_arcanist", level, { equipment }),
  ];
}

function runSpecializationPairs(seeds, level, equipment) {
  console.log(`\n=== (d) Sixteen primary-specialization pairs (dungeon_aqueduct_depths, ${seeds} paired seeds each, level ${level}, equal-budget uncommon gear) ===`);
  let totalCounterexamples = 0;
  const rows = [];
  for (let s = 0; s < SPECIALIZATIONS_V3.length; s++) {
    const spec = SPECIALIZATIONS_V3[s];
    const seedBase = 4000 + s * 100;
    const result = runPair(
      `  (d.${s + 1}) ${spec.specializationId} vs. unmodified ${spec.classId}`,
      "dungeon_aqueduct_depths",
      (lvl, eq) => specializedParty(spec.classId, spec.specializationId, lvl, eq),
      (lvl, eq) => specializedParty(spec.classId, null, lvl, eq),
      level,
      seeds,
      seedBase,
      equipment,
    );
    totalCounterexamples += result.counterexampleCount;
    rows.push({ specializationId: spec.specializationId, counterexampleCount: result.counterexampleCount });
  }
  console.log(`\n  (d) summary: ${totalCounterexamples} total counterexamples across ${SPECIALIZATIONS_V3.length} specialization pairs, ${seeds} seeds each.`);
  return rows;
}

console.log(`[simulate-v3-tactical] ${SEEDS} seeds per pair; seeds 1000.. for Cinder Archive no-gear pairs, 1500.. for Cinder Archive geared pairs, 2000.. for the race pair, 4000.. for specialization pairs.`);

runPair("(a) no-new-class counterexample: balanced vs glass-cannon (no gear)", "dungeon_cinder_archive", noNewClassBalanced5, glassCannon5, 5, SEEDS, 1000, NO_GEAR);
runPair("(b) Warder-included vs glass-cannon (no gear)", "dungeon_cinder_archive", warderIncluded5, glassCannon5, 5, SEEDS, 1000, NO_GEAR);
runPair("(c) Weaver-included vs glass-cannon (no gear)", "dungeon_cinder_archive", weaverIncluded5, glassCannon5, 5, SEEDS, 1000, NO_GEAR);

runPair("(a) no-new-class counterexample: balanced vs glass-cannon (equal-budget uncommon gear)", "dungeon_cinder_archive", noNewClassBalanced5, glassCannon5, 5, SEEDS, 1500, EQUAL_UNCOMMON_GEAR);
runPair("(b) Warder-included vs glass-cannon (equal-budget uncommon gear)", "dungeon_cinder_archive", warderIncluded5, glassCannon5, 5, SEEDS, 1500, EQUAL_UNCOMMON_GEAR);
runPair("(c) Weaver-included vs glass-cannon (equal-budget uncommon gear)", "dungeon_cinder_archive", weaverIncluded5, glassCannon5, 5, SEEDS, 1500, EQUAL_UNCOMMON_GEAR);

runSpecializationPairs(SEEDS, 5, EQUAL_UNCOMMON_GEAR);

runRacePair(SEEDS, 5);

console.log("\nNo reward-table/balance change follows from this run; counterexamples are reported, not hidden by aggregation.");
