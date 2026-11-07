#!/usr/bin/env node
// M3-07/M3-10 tactical measurement protocol (design/game/economy/m3.md
// section 6; design/game/m3-systems.md section 7). Drives the real
// packages/game engine (built dist) — no duplicate combat/content tables
// live in this file. Pure in-memory, deterministic seeds only.
//
// Scope this run actually covers: pairs (a) no-new-class counterexample,
// (b) Warder-included, (c) Weaver-included (all vs. an equal-budget
// glass-cannon five, against Cinder Archive floors 1-4), and (e) the three
// races, identical class/level/gear, against Old Road at level 5. Pair (d)
// — one party per primary specialization choice (16 pairs) — is NOT run
// here; seeing specific text in the evidence report before relying on it.
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
const { OLD_ROAD_ENEMIES, autoFillLoadoutV3 } = content;

const SEEDS = Number((process.argv.find((a) => a.startsWith("--seeds=")) ?? "--seeds=32").split("=")[1]) || 32;
const EQUIPMENT = { weapon: null, armor: null, trinket: null };

function hero(id, slotIndex, primaryClassId, level, raceId = "race_vesper") {
  return {
    id,
    kind: "hero",
    slotIndex,
    primaryClassId,
    secondaryClassId: null,
    primarySpecializationId: null,
    raceId,
    level,
    equipment: EQUIPMENT,
    skillLoadout: autoFillLoadoutV3(primaryClassId, level),
  };
}

function glassCannon5(level) {
  return [
    hero("dps1", 0, "class_rogue", level),
    hero("dps2", 1, "class_ranger", level),
    hero("dps3", 2, "class_arcanist", level),
    hero("dps4", 3, "class_rogue", level),
    hero("dps5", 4, "class_ranger", level),
  ];
}
function noNewClassBalanced5(level) {
  return [
    hero("tank", 0, "class_vanguard", level),
    hero("healer", 1, "class_cleric", level),
    hero("dps1", 2, "class_rogue", level),
    hero("dps2", 3, "class_ranger", level),
    hero("dps3", 4, "class_arcanist", level),
  ];
}
function warderIncluded5(level) {
  return [
    hero("tank", 0, "class_warder", level),
    hero("healer", 1, "class_cleric", level),
    hero("dps1", 2, "class_rogue", level),
    hero("dps2", 3, "class_ranger", level),
    hero("dps3", 4, "class_arcanist", level),
  ];
}
function weaverIncluded5(level) {
  return [
    hero("tank", 0, "class_vanguard", level),
    hero("healer", 1, "class_cleric", level),
    hero("dps1", 2, "class_rogue", level),
    hero("dps2", 3, "class_ranger", level),
    hero("control", 4, "class_weaver", level),
  ];
}

function runPair(label, partyFnA, partyFnB, level, seeds) {
  const results = { a: [], b: [] };
  for (let i = 0; i < seeds; i++) {
    const seed = 1000 + i;
    for (const [key, partyFn] of [["a", partyFnA], ["b", partyFnB]]) {
      const run = simulateDungeonRunV3("dungeon_cinder_archive", partyFn(level), seed);
      const survivors = run.finalHeroHpRatios.filter((r) => r > 0).length;
      const avgHp = Math.round((run.finalHeroHpRatios.reduce((x, y) => x + y, 0) / run.finalHeroHpRatios.length) * 100);
      results[key].push({ seed, outcome: run.outcome, floorsCleared: run.floorsCleared, survivors, avgHp });
    }
  }
  const clearRate = (rows) => rows.filter((r) => r.outcome === "cleared").length / rows.length;
  const avg = (rows, field) => Math.round((rows.reduce((x, y) => x + y[field], 0) / rows.length) * 100) / 100;
  const counterexamples = results.a.filter((rowA, i) => rowA.outcome !== results.b[i].outcome);
  console.log(`\n=== ${label} (Cinder Archive, ${seeds} paired seeds) ===`);
  console.log(`  A clear rate: ${(clearRate(results.a) * 100).toFixed(1)}%  avgFloorsCleared=${avg(results.a, "floorsCleared")}  avgSurvivors=${avg(results.a, "survivors")}  avgHp%=${avg(results.a, "avgHp")}`);
  console.log(`  B clear rate: ${(clearRate(results.b) * 100).toFixed(1)}%  avgFloorsCleared=${avg(results.b, "floorsCleared")}  avgSurvivors=${avg(results.b, "survivors")}  avgHp%=${avg(results.b, "avgHp")}`);
  console.log(`  Counterexamples (A/B outcome differs), ${counterexamples.length}/${seeds}: seeds ${counterexamples.map((c) => c.seed).join(",") || "none"}`);
  return { label, a: results.a, b: results.b, counterexampleCount: counterexamples.length };
}

function racedParty3(level, raceId) {
  return [
    hero("tank", 0, "class_vanguard", level, raceId),
    hero("healer", 1, "class_cleric", level, raceId),
    hero("dps", 2, "class_rogue", level, raceId),
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

console.log(`[simulate-v3-tactical] ${SEEDS} seeds per pair; seeds 1000.. for Cinder Archive pairs, 2000.. for the race pair.`);
const a = runPair("(a) no-new-class counterexample: balanced vs glass-cannon", noNewClassBalanced5, glassCannon5, 5, SEEDS);
const b = runPair("(b) Warder-included vs glass-cannon", warderIncluded5, glassCannon5, 5, SEEDS);
const c = runPair("(c) Weaver-included vs glass-cannon", weaverIncluded5, glassCannon5, 5, SEEDS);
runRacePair(SEEDS, 5);
console.log("\nNo reward-table/balance change follows from this run; counterexamples are reported, not hidden by aggregation.");
