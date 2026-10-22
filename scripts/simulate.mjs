#!/usr/bin/env node
// Seeded pacing + catch-up benchmark harness (M1-12). Drives the real
// packages/game engine (packages/content for tables) — no duplicate combat
// or reward formula lives in this file. Pure in-memory: no DB, no HTTP, no
// server process, so it can never touch a real player save.
//
// Usage examples:
//   npm run simulate -- --seed 1 --runs 100
//   npm run simulate -- --mode=catchup --catchup-reps=20
//   npm run simulate -- --json=reports/engineering/simulate-out.json
//   npm run simulate -- --mode=v2 --level=3 --runs 100        (sweep a lower level for team-building contrast / dungeon benchmark)
//   npm run simulate -- --mode=v2ledger --heroes=1 --ledger-days=7 --ledger-starting-gold=5000
import os from "node:os";
import { writeFileSync } from "node:fs";
import process from "node:process";

let game, content;
try {
  game = await import("@banner-and-bounty/game");
  content = await import("@banner-and-bounty/content");
} catch (err) {
  console.error(
    "[simulate] could not load @banner-and-bounty/game or @banner-and-bounty/content (built dist). " +
      "Run `npm run build` (or `npm run validate`) first, then retry.\n" +
      String(err && err.message ? err.message : err),
  );
  process.exitCode = 1;
  process.exit(1);
}

const {
  createRngState,
  simulateExpeditionCycles,
  simulateBattle,
  toHeroCombatants,
  CYCLE_LENGTH_MS,
  MAX_CYCLES_PER_SETTLEMENT,
  RECENT_CYCLE_LOG_LIMIT,
  gamePackageVersion,
  simulateBattleV2,
  simulateDungeonFloorBatch,
  simulateExpeditionCyclesV2,
  resolveCraft,
  resolveReforge,
} = game;
const {
  CLASS_DEFINITIONS,
  STARTER_HEROES,
  ITEM_DEFINITIONS,
  TOLLKEEPER,
  getItemDefinition,
  getAffixDefinition,
  powerScore,
  contentPackageVersion,
} = content;

// This is the number apps/server/src/rulesVersion.ts currently fixes
// (CURRENT_RULES_VERSION = 1). The pure engine has no notion of a server
// rules version, so this is reported as context only, not re-derived here.
const SERVER_RULES_VERSION_CONTEXT = 1;

// ---------------------------------------------------------------- CLI args

function parseArgs(argv) {
  const out = {
    seed: 1,
    runs: 32,
    maxCycles: 700,
    mode: "all", // pacing | catchup | v2 | v2ledger | all
    catchupReps: 10,
    json: null,
    quiet: false,
    level: null, // override for v2TeamBuildingContrast/v2DungeonBenchmark; null keeps each check's own default
    heroes: 3, // party size for v2PartyForHeroCount (1 | 3 | 5) and v2ledger
    ledgerDays: 7,
    ledgerCyclesPerDay: 60,
    ledgerDungeonClearsPerDay: 2,
    ledgerStartingGold: 0,
  };
  // Accepts both `--seed=1` and the documented `--seed 1` form.
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if (value === undefined && key !== "quiet" && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) {
      value = argv[++i];
    }
    switch (key) {
      case "seed":
        out.seed = Number(value);
        break;
      case "runs":
      case "seeds":
        out.runs = Number(value);
        break;
      case "max-cycles":
        out.maxCycles = Number(value);
        break;
      case "mode":
        out.mode = value;
        break;
      case "catchup-reps":
        out.catchupReps = Number(value);
        break;
      case "json":
        out.json = value;
        break;
      case "quiet":
        out.quiet = true;
        break;
      case "level":
        out.level = Number(value);
        break;
      case "heroes":
        out.heroes = Number(value);
        break;
      case "ledger-days":
        out.ledgerDays = Number(value);
        break;
      case "ledger-cycles-per-day":
        out.ledgerCyclesPerDay = Number(value);
        break;
      case "ledger-dungeon-clears-per-day":
        out.ledgerDungeonClearsPerDay = Number(value);
        break;
      case "ledger-starting-gold":
        out.ledgerStartingGold = Number(value);
        break;
      default:
        console.error(`[simulate] unknown flag --${key}, ignoring`);
    }
  }
  if (!Number.isFinite(out.seed)) out.seed = 1;
  out.runs = Math.max(1, Math.min(500, Number.isFinite(out.runs) ? out.runs : 32));
  out.maxCycles = Math.max(1, Math.min(5000, Number.isFinite(out.maxCycles) ? out.maxCycles : 700));
  out.catchupReps = Math.max(1, Math.min(200, Number.isFinite(out.catchupReps) ? out.catchupReps : 10));
  out.level = Number.isFinite(out.level) && out.level > 0 ? Math.min(10, Math.round(out.level)) : null;
  out.heroes = [1, 3, 5].includes(out.heroes) ? out.heroes : 3;
  out.ledgerDays = Math.max(1, Math.min(90, Number.isFinite(out.ledgerDays) ? out.ledgerDays : 7));
  out.ledgerCyclesPerDay = Math.max(0, Math.min(480, Number.isFinite(out.ledgerCyclesPerDay) ? out.ledgerCyclesPerDay : 60));
  out.ledgerDungeonClearsPerDay = Math.max(0, Math.min(20, Number.isFinite(out.ledgerDungeonClearsPerDay) ? out.ledgerDungeonClearsPerDay : 2));
  out.ledgerStartingGold = Math.max(0, Number.isFinite(out.ledgerStartingGold) ? out.ledgerStartingGold : 0);
  return out;
}

// ------------------------------------------------------------ party setup

const BY_SLOT = { weapon: [], armor: [], trinket: [] };
for (const item of ITEM_DEFINITIONS) BY_SLOT[item.slot].push(item);

// Specialization combos: index 0 is "undecided" (null for every class, the
// conservative floor); 1-8 are every combination of one spec per class
// (2 classes-worth of choices each, 2*2*2 = 8), covering baseline.md's
// "specialization choices" sweep.
function buildSpecCombos() {
  const combos = [{ label: "unspecialized", byClass: {} }];
  const [a, b, c] = CLASS_DEFINITIONS;
  for (const s1 of a.specializations) {
    for (const s2 of b.specializations) {
      for (const s3 of c.specializations) {
        combos.push({
          label: `${s1}+${s2}+${s3}`,
          byClass: { [a.classId]: s1, [b.classId]: s2, [c.classId]: s3 },
        });
      }
    }
  }
  return combos;
}
const SPEC_COMBOS = buildSpecCombos();

/**
 * packages/game's xorshift32 (createRngState/drawUint32) mixes small,
 * sequential integer seeds weakly on their very first draw: seeds 1-150ish
 * all produced a first draw under the 25% drop threshold in manual testing,
 * which would make every pacing run report an identical "first drop at
 * cycle 1" instead of the expected geometric spread. This is seed
 * *preparation* only (a 32-bit integer hash) so the sweep's seeds 1, 2, 3…
 * land at decorrelated points in the engine's actual state space;
 * createRngState/xorshift32 remains the only RNG the engine itself uses,
 * and a fixed input seed still mixes to the same state every time.
 */
function mixSeed(n) {
  let x = (n + 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function emptyEquipment() {
  return { weapon: null, armor: null, trinket: null };
}

function itemPower(drop) {
  const base = getItemDefinition(drop.definitionId);
  const affix = drop.affixId ? getAffixDefinition(drop.affixId) : null;
  return powerScore({
    hpBonus: base.hpBonus + (affix ? affix.hpBonus : 0),
    atkBonus: base.atkBonus + (affix ? affix.atkBonus : 0),
    defBonus: base.defBonus + (affix ? affix.defBonus : 0),
  });
}

/** Greedy equip: a drop goes to whichever of the three heroes has the weakest (or empty) item in that slot, if it's an upgrade. Deterministic given drop order. */
function equipDrop(gearByHero, heroIds, drop) {
  const def = getItemDefinition(drop.definitionId);
  let targetIdx = -1;
  let worst = Infinity;
  for (let i = 0; i < heroIds.length; i++) {
    const current = gearByHero[heroIds[i]][def.slot];
    const currentPower = current ? itemPower(current) : -1;
    if (currentPower < worst) {
      worst = currentPower;
      targetIdx = i;
    }
  }
  const dropPower = itemPower(drop);
  if (dropPower > worst) {
    gearByHero[heroIds[targetIdx]][def.slot] = drop;
    return true;
  }
  return false;
}

function starterParty(level, specializationId /* {classId: specId|null} */, gearByHero) {
  return STARTER_HEROES.map((h) => ({
    heroId: h.heroTemplateId,
    classId: h.classId,
    level,
    specializationId: specializationId[h.classId] ?? null,
    equipment: gearByHero[h.heroTemplateId],
  }));
}

function bossEnemyCombatant() {
  return {
    id: TOLLKEEPER.enemyId,
    side: "enemy",
    slot: 0,
    stats: { maxHp: TOLLKEEPER.hp, atk: TOLLKEEPER.atk, def: TOLLKEEPER.def, spd: TOLLKEEPER.spd },
    isBoss: true,
  };
}

// --------------------------------------------------------- pacing sweep

/**
 * Runs the Old Road expedition cycle-by-cycle (production
 * simulateExpeditionCycles, one cycle per call) with a fixed, conservative
 * frozen loadout (level 1, unspecialized, unequipped) — baseline.md notes
 * Old Road outcomes/rewards do not depend on hero level or gear, so this
 * matches the real engine for any loadout a player could actually have.
 * Tracks the shared level/xp trajectory (all 3 heroes always receive
 * identical XP, baseline.md section 2) and, in parallel, the gear a player
 * would actually be holding, to find:
 *   - first cycle a drop occurs (any slot)
 *   - first cycle the party reaches level 3 (specialization unlock)
 *   - first cycle a boss (Tollkeeper) fight — run with the live level/gear
 *     and the given specialization combo — would be won
 */
function runSingleSeed(seed, combo, maxCycles) {
  const heroIds = STARTER_HEROES.map((h) => h.heroTemplateId);
  const frozenParty = starterParty(1, {}, Object.fromEntries(heroIds.map((id) => [id, emptyEquipment()])));

  let rngState = createRngState(mixSeed(seed));
  let unequippedCount = 0;
  let level = { level: 1, xp: 0 };
  const liveLevels = Object.fromEntries(heroIds.map((id) => [id, level]));
  const gearByHero = Object.fromEntries(heroIds.map((id) => [id, emptyEquipment()]));

  let wins = 0;
  let losses = 0;
  let gold = 0;
  let overflowConvertedCount = 0;
  let firstDropCycle = null;
  let firstLevel3Cycle = null;
  let firstBossReadyCycle = null;
  let cyclesRun = 0;

  for (let i = 1; i <= maxCycles; i++) {
    const result = simulateExpeditionCycles({
      frozenParty,
      liveLevels,
      rngState,
      unequippedCount,
      cyclesCompletedBefore: i - 1,
      cycles: 1,
    });
    cyclesRun = i;
    wins += result.wins;
    losses += result.losses;
    gold += result.gold;
    overflowConvertedCount += result.overflowConvertedCount;
    rngState = result.rngState;
    unequippedCount = result.unequippedCount;
    level = result.liveLevels[heroIds[0]];
    for (const id of heroIds) liveLevels[id] = level;

    if (result.items.length > 0) {
      if (firstDropCycle === null) firstDropCycle = i;
      for (const drop of result.items) equipDrop(gearByHero, heroIds, drop);
    }
    if (firstLevel3Cycle === null && level.level >= 3) firstLevel3Cycle = i;

    if (firstBossReadyCycle === null && level.level >= 3) {
      const party = starterParty(level.level, combo.byClass, gearByHero);
      const heroes = toHeroCombatants(party);
      const battle = simulateBattle(heroes, [bossEnemyCombatant()], "boss");
      if (battle.result === "win") firstBossReadyCycle = i;
    }

    if (firstDropCycle !== null && firstLevel3Cycle !== null && firstBossReadyCycle !== null) break;
  }

  return {
    seed,
    combo: combo.label,
    cyclesRun,
    wins,
    losses,
    gold,
    overflowConvertedCount,
    finalLevel: level.level,
    firstDropCycle,
    firstLevel3Cycle,
    firstBossReadyCycle,
  };
}

function stats(values) {
  const present = values.filter((v) => v !== null);
  if (present.length === 0) return { count: 0, min: null, median: null, mean: null, max: null, missing: values.length };
  const sorted = [...present].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return {
    count: present.length,
    min: sorted[0],
    median,
    mean: Math.round(mean * 100) / 100,
    max: sorted[sorted.length - 1],
    missing: values.length - present.length,
  };
}

function cyclesToMinutes(cycles) {
  return cycles === null ? null : Math.round((cycles * CYCLE_LENGTH_MS) / 60000 * 100) / 100;
}

function runPacingSweep(opts) {
  const results = [];
  for (let i = 0; i < opts.runs; i++) {
    const seed = opts.seed + i;
    const combo = SPEC_COMBOS[i % SPEC_COMBOS.length];
    results.push(runSingleSeed(seed, combo, opts.maxCycles));
  }

  const dropCycles = results.map((r) => r.firstDropCycle);
  const level3Cycles = results.map((r) => r.firstLevel3Cycle);
  const bossCycles = results.map((r) => r.firstBossReadyCycle);
  const totalLosses = results.reduce((a, r) => a + r.losses, 0);
  const totalWins = results.reduce((a, r) => a + r.wins, 0);

  const dropStats = stats(dropCycles);
  const level3Stats = stats(level3Cycles);
  const bossStats = stats(bossCycles);

  return {
    runs: results.length,
    maxCyclesPerRun: opts.maxCycles,
    winLossTotals: { wins: totalWins, losses: totalLosses },
    firstDrop: { ...dropStats, minutes: { min: cyclesToMinutes(dropStats.min), median: cyclesToMinutes(dropStats.median), max: cyclesToMinutes(dropStats.max) } },
    level3Unlock: { ...level3Stats, minutes: { min: cyclesToMinutes(level3Stats.min), median: cyclesToMinutes(level3Stats.median), max: cyclesToMinutes(level3Stats.max) } },
    bossReady: { ...bossStats, minutes: { min: cyclesToMinutes(bossStats.min), median: cyclesToMinutes(bossStats.median), max: cyclesToMinutes(bossStats.max) } },
    perRun: results,
  };
}

// ----------------------------------------------------------- reproducibility

function reproducibilityCheck(seed) {
  const combo = SPEC_COMBOS[1];
  const first = runSingleSeed(seed, combo, 700);
  const second = runSingleSeed(seed, combo, 700);
  const ok = JSON.stringify(first) === JSON.stringify(second);
  return { ok, seed, comboLabel: combo.label, sample: first };
}

// ------------------------------------------------------- catch-up benchmark

/**
 * Measures one worst-case 8-hour settlement (exactly
 * MAX_CYCLES_PER_SETTLEMENT = 480 cycles, the real contracts.md cap) via the
 * same simulateExpeditionCycles call apps/server's expeditionService makes.
 * This isolates the pure engine's cost; it does not include the SQLite
 * transaction/HTTP overhead M1-08's report already measured separately.
 */
function runCatchupBenchmark(opts) {
  const heroIds = STARTER_HEROES.map((h) => h.heroTemplateId);
  const frozenParty = starterParty(1, {}, Object.fromEntries(heroIds.map((id) => [id, emptyEquipment()])));
  const baseLevels = Object.fromEntries(heroIds.map((id) => [id, { level: 1, xp: 0 }]));

  const durationsMs = [];
  const heapDeltasBytes = [];
  let logBoundViolations = 0;
  let lastResult = null;

  for (let rep = 0; rep < opts.catchupReps; rep++) {
    const rngState = createRngState(mixSeed(opts.seed + 10_000 + rep));
    const before = process.memoryUsage().heapUsed;
    const start = process.hrtime.bigint();
    const result = simulateExpeditionCycles({
      frozenParty,
      liveLevels: baseLevels,
      rngState,
      unequippedCount: 0,
      cyclesCompletedBefore: 0,
      cycles: MAX_CYCLES_PER_SETTLEMENT,
    });
    const end = process.hrtime.bigint();
    const after = process.memoryUsage().heapUsed;
    durationsMs.push(Number(end - start) / 1e6);
    heapDeltasBytes.push(after - before);
    if (result.recentCycles.length > RECENT_CYCLE_LOG_LIMIT) logBoundViolations++;
    lastResult = result;
  }

  const sortedMs = [...durationsMs].sort((a, b) => a - b);
  const p = (q) => sortedMs[Math.min(sortedMs.length - 1, Math.floor(q * sortedMs.length))];

  return {
    reps: opts.catchupReps,
    cyclesPerRun: MAX_CYCLES_PER_SETTLEMENT,
    durationMs: { min: sortedMs[0], median: p(0.5), p95: p(0.95), max: sortedMs[sortedMs.length - 1] },
    heapDeltaBytes: { min: Math.min(...heapDeltasBytes), max: Math.max(...heapDeltasBytes) },
    recentCyclesBoundOk: logBoundViolations === 0,
    recentCyclesLimit: RECENT_CYCLE_LOG_LIMIT,
    sampleFinalWins: lastResult ? lastResult.wins : null,
    sampleFinalLosses: lastResult ? lastResult.losses : null,
    provisionalTargetMs: 2000,
    withinProvisionalTarget: p(0.95) < 2000,
    hardware: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpuModel: os.cpus()[0] ? os.cpus()[0].model : "unknown",
      cpuCount: os.cpus().length,
      totalMemGB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    },
    note:
      "Measures only packages/game's pure computation for one 480-cycle (8h) settlement batch, " +
      "not the SQLite transaction/HTTP round trip (see reports/engineering/M1-08.md for a live " +
      "loopback measurement of that layer). A sub-millisecond-to-low-ms synchronous call of this size " +
      "does not block Node's event loop long enough to be perceptible to a concurrent request.",
  };
}

// --------------------------------------------------------------- combat v2

const V2_EMPTY_EQUIPMENT = { weapon: null, armor: null, trinket: null };

function v2Hero(id, slotIndex, primaryClassId, secondaryClassId, level, active, passive) {
  return {
    kind: "hero",
    id,
    slotIndex,
    primaryClassId,
    secondaryClassId,
    level,
    equipment: V2_EMPTY_EQUIPMENT,
    skillLoadout: { active, passive },
  };
}

/** A deliberately well-rounded 3-hero party: tank (taunt+DEF), healer, DPS. */
function v2BalancedParty(level) {
  return [
    v2Hero("tank", 0, "class_vanguard", "class_herald", level, ["bulwark_call", "shield_bash"], ["thick_hide", "last_stand"]),
    v2Hero("cleric", 1, "class_cleric", "class_vanguard", level, ["mending_light", "sanctuary"], ["devotion", "vital_surge"]),
    v2Hero("rogue", 2, "class_rogue", "class_arcanist", level, ["backstab", "flurry"], ["opportunist", "evasion"]),
  ];
}

/** Same average level/class spread, no tank skills and no healer action, to measure the formation-choice contrast M2.md acceptance check 7 asks for. */
function v2GlassCannonParty(level) {
  return [
    v2Hero("dps1", 0, "class_rogue", null, level, ["backstab", "flurry"], ["opportunist", "evasion"]),
    v2Hero("dps2", 1, "class_ranger", null, level, ["aimed_shot", "volley"], ["hunters_focus", "momentum"]),
    v2Hero("dps3", 2, "class_arcanist", null, level, ["firebolt", "meteor"], ["overload", "arcane_reserve"]),
  ];
}

// content.md's Old Road roster (index.ts OLD_ROAD_ENEMIES); kept as an ID list
// so both the hand-specified v2OldRoadEnemies() combatants (direct
// simulateBattleV2 calls) and simulateExpeditionCyclesV2's buildEnemyCombatants
// lookup (the v2ledger daily loop) reference the same three enemies.
const OLD_ROAD_ENEMY_IDS = ["enemy_road_brigand", "enemy_road_wolf", "enemy_road_cutpurse"];

function v2OldRoadEnemies() {
  return [
    { kind: "enemy", id: "brigand", slotIndex: 0, enemyId: OLD_ROAD_ENEMY_IDS[0], stats: { maxHp: 50, atk: 9, def: 4, spd: 7 } },
    { kind: "enemy", id: "wolf", slotIndex: 1, enemyId: OLD_ROAD_ENEMY_IDS[1], stats: { maxHp: 35, atk: 11, def: 2, spd: 11 } },
    { kind: "enemy", id: "cutpurse", slotIndex: 2, enemyId: OLD_ROAD_ENEMY_IDS[2], stats: { maxHp: 30, atk: 8, def: 2, spd: 10 } },
  ];
}

/** v2Hero() output is already CombatantInputV2-shaped (used directly by simulateBattleV2); this reshapes it to PartyMemberInputV2 (heroId instead of id) for simulateExpeditionCyclesV2/simulateDungeonFloorBatch. */
function toPartyMemberV2(h) {
  return { heroId: h.id, slotIndex: h.slotIndex, primaryClassId: h.primaryClassId, secondaryClassId: h.secondaryClassId, level: h.level, equipment: h.equipment, skillLoadout: h.skillLoadout };
}

/**
 * gear.md section 7 asks M2-28 to "include 1/3/5-hero groups" in its pacing
 * evidence. 3 reuses v2BalancedParty (tank/healer/dps). 1 is a single
 * vanguard/cleric dual-class generalist (bulwark_call for mitigation,
 * mending_light for self-sustain — classes.md's union skill pool lets a
 * primary vanguard pull an active from its cleric secondary) standing in for
 * "no backup if this hero struggles." 5 adds two more back-row DPS (slots 3-4)
 * to the balanced three, per classes.md section 3's 3-front/2-back formation.
 */
function v2PartyForHeroCount(heroCount, level) {
  if (heroCount === 1) {
    return [v2Hero("solo", 0, "class_vanguard", "class_cleric", level, ["bulwark_call", "mending_light"], ["thick_hide", "devotion"])];
  }
  if (heroCount === 5) {
    return [
      ...v2BalancedParty(level),
      v2Hero("dps4", 3, "class_ranger", null, level, ["aimed_shot", "volley"], ["hunters_focus", "momentum"]),
      v2Hero("dps5", 4, "class_arcanist", null, level, ["firebolt", "meteor"], ["overload", "arcane_reserve"]),
    ];
  }
  return v2BalancedParty(level);
}

function v2Reproducibility(seed) {
  const party = v2BalancedParty(5);
  const first = simulateBattleV2(party, v2OldRoadEnemies(), "pve", seed);
  const second = simulateBattleV2(party, v2OldRoadEnemies(), "pve", seed);
  return { ok: JSON.stringify(first) === JSON.stringify(second), seed };
}

/** Runs the same Old Road v2 encounter with a balanced party vs. a same-average-power glass-cannon party, across many seeds, reporting win rate and rounds-to-clear per build — direct evidence for M2.md acceptance check 7. */
function v2TeamBuildingContrast(opts) {
  const level = opts.level ?? 5;
  const results = { balanced: { wins: 0, rounds: [] }, glassCannon: { wins: 0, rounds: [] } };
  for (let i = 0; i < opts.runs; i++) {
    const seed = opts.seed + i;
    for (const [key, partyFn] of [["balanced", v2BalancedParty], ["glassCannon", v2GlassCannonParty]]) {
      const battle = simulateBattleV2(partyFn(level), v2OldRoadEnemies(), "pve", seed);
      if (battle.result === "win") {
        results[key].wins += 1;
        results[key].rounds.push(battle.rounds);
      }
    }
  }
  const summarize = (r) => ({ winRate: r.wins / opts.runs, avgRoundsToClear: r.rounds.length ? Math.round((r.rounds.reduce((a, b) => a + b, 0) / r.rounds.length) * 100) / 100 : null });
  return { runs: opts.runs, level, balanced: summarize(results.balanced), glassCannon: summarize(results.glassCannon) };
}

function v2DungeonClearRateForParty(partyFn, level, opts) {
  const party = partyFn(level).map(toPartyMemberV2);
  let cleared = 0;
  let failed = 0;
  const floorsProcessedSamples = [];
  for (let i = 0; i < opts.runs; i++) {
    const seed = opts.seed + i;
    const result = simulateDungeonFloorBatch({
      dungeonId: "dungeon_aqueduct_depths",
      frozenParty: party,
      currentFloor: 1,
      combatSeedBase: seed,
      rngState: createRngState(seed),
      unequippedCount: 0,
      eligibleFloors: 4,
    });
    if (result.outcome === "cleared") cleared += 1;
    else failed += 1;
    floorsProcessedSamples.push(result.floorsProcessed);
  }
  return {
    clearRate: cleared / opts.runs,
    failed,
    avgFloorsProcessed: Math.round((floorsProcessedSamples.reduce((a, b) => a + b, 0) / floorsProcessedSamples.length) * 100) / 100,
  };
}

/** Full-clear benchmark for the one shipped M2-31 dungeon, now run for both the balanced and glass-cannon builds (same content, same seeds) so clear rate is comparable build-vs-build, not just against Old Road. */
function v2DungeonBenchmark(opts) {
  const level = opts.level ?? 8;
  return {
    runs: opts.runs,
    level,
    balanced: v2DungeonClearRateForParty(v2BalancedParty, level, opts),
    glassCannon: v2DungeonClearRateForParty(v2GlassCannonParty, level, opts),
  };
}

function v2CraftingReproducibility(seed) {
  const a = resolveCraft(createRngState(seed), "item_weapon_focus", "epic");
  const b = resolveCraft(createRngState(seed), "item_weapon_focus", "epic");
  const craftOk = JSON.stringify(a) === JSON.stringify(b);
  const affixes = [{ affixId: "affix_of_power", value: 3 }, { affixId: "affix_of_warding", value: 3 }, { affixId: "affix_of_vigor", value: 10 }];
  const r1 = resolveReforge(createRngState(seed), "weapon", "epic", affixes, 2);
  const r2 = resolveReforge(createRngState(seed), "weapon", "epic", affixes, 2);
  const reforgeOk = JSON.stringify(r1) === JSON.stringify(r2);
  return { ok: craftOk && reforgeOk, seed };
}

function addMaterials(a, b) {
  return { scrap: a.scrap + b.scrap, sigil: a.sigil + b.sigil, core: a.core + b.core };
}

/**
 * gear.md section 7 asks M2-28 to produce a "multi-day material/gold ledger"
 * so a legacy-gold-vs-material-constraint test is possible: run N days of
 * combined Old Road + dungeon_aqueduct_depths clears and report cumulative
 * gold/scrap/sigil/core balances. Mirrors gear.md's own worked week budget
 * (60 Old Road cycles/day + 2 dungeon clears/day by default).
 *
 * Hero level is held fixed for the whole run (opts.level, default 8, same as
 * v2DungeonBenchmark's "established party" level) — this harness does not yet
 * simulate v2 mid-run leveling (simulateExpeditionCyclesV2's returned
 * liveLevels is bookkeeping only; combat stats are drawn from the frozen
 * party's static level field). Rerun at different --level values to sample
 * different progression points, same as --level does for the other two v2
 * checks. --ledger-starting-gold seeds an initial gold balance so a legacy-gold
 * run can be diffed against a from-zero run to isolate the gold vs. material
 * constraint gear.md asks about.
 */
function runV2Ledger(opts) {
  const level = opts.level ?? 8;
  const party = v2PartyForHeroCount(opts.heroes, level);
  const partyMembers = party.map(toPartyMemberV2);
  const heroIds = party.map((h) => h.id);

  let oldRoadRngState = createRngState(mixSeed(opts.seed));
  let dungeonRngState = createRngState(mixSeed(opts.seed + 500_000));
  // Both activities award into the same account bag, as on the server.
  let unequippedCount = 0;
  let cyclesCompletedBefore = 0;

  let gold = opts.ledgerStartingGold;
  let materials = { scrap: 0, sigil: 0, core: 0 };
  let xpPerParticipant = 0;
  let itemsCount = 0;
  let overflowConvertedCount = 0;
  let oldRoadWins = 0;
  let oldRoadLosses = 0;
  let dungeonClears = 0;
  let dungeonFails = 0;
  const dailyBalances = [];

  for (let day = 1; day <= opts.ledgerDays; day++) {
    if (opts.ledgerCyclesPerDay > 0) {
      const oldRoadResult = simulateExpeditionCyclesV2({
        areaId: "area_old_road",
        enemyIds: OLD_ROAD_ENEMY_IDS,
        frozenParty: partyMembers,
        liveLevels: Object.fromEntries(heroIds.map((id) => [id, { level, xp: 0 }])),
        combatSeedBase: mixSeed(opts.seed + day),
        rngState: oldRoadRngState,
        unequippedCount,
        cyclesCompletedBefore,
        cycles: opts.ledgerCyclesPerDay,
      });
      oldRoadRngState = oldRoadResult.rngState;
      unequippedCount = oldRoadResult.unequippedCount;
      cyclesCompletedBefore += opts.ledgerCyclesPerDay;
      gold += oldRoadResult.gold;
      materials = addMaterials(materials, oldRoadResult.materials);
      xpPerParticipant += oldRoadResult.xpPerParticipant;
      itemsCount += oldRoadResult.items.length;
      overflowConvertedCount += oldRoadResult.overflowConvertedCount;
      oldRoadWins += oldRoadResult.wins;
      oldRoadLosses += oldRoadResult.losses;
    }

    for (let clear = 0; clear < opts.ledgerDungeonClearsPerDay; clear++) {
      const dungeonResult = simulateDungeonFloorBatch({
        dungeonId: "dungeon_aqueduct_depths",
        frozenParty: partyMembers,
        currentFloor: 1,
        combatSeedBase: mixSeed(opts.seed + day * 1000 + clear),
        rngState: dungeonRngState,
        unequippedCount,
        eligibleFloors: 4,
      });
      dungeonRngState = dungeonResult.rngState;
      unequippedCount = dungeonResult.unequippedCount;
      if (dungeonResult.outcome === "cleared") dungeonClears += 1;
      else dungeonFails += 1;
      for (const floor of dungeonResult.floorResults) {
        if (!floor.rewards) continue;
        gold += floor.rewards.gold;
        materials = addMaterials(materials, floor.rewards.materials);
        xpPerParticipant += floor.rewards.xp;
        if (floor.rewards.item) itemsCount += 1;
        if (floor.rewards.overflowConverted) overflowConvertedCount += 1;
      }
    }

    dailyBalances.push({
      day,
      gold,
      materials: { ...materials },
      oldRoadWins,
      oldRoadLosses,
      dungeonClears,
      dungeonFails,
    });
  }

  return {
    heroCount: opts.heroes,
    level,
    days: opts.ledgerDays,
    cyclesPerDay: opts.ledgerCyclesPerDay,
    dungeonClearsPerDay: opts.ledgerDungeonClearsPerDay,
    startingGold: opts.ledgerStartingGold,
    final: { gold, materials, xpPerParticipant, itemsCount, overflowConvertedCount, oldRoadWins, oldRoadLosses, dungeonClears, dungeonFails },
    dailyBalances,
  };
}

function runV2Checks(opts) {
  const repro = v2Reproducibility(opts.seed);
  const craftRepro = v2CraftingReproducibility(opts.seed);
  const contrast = v2TeamBuildingContrast(opts);
  const dungeon = v2DungeonBenchmark(opts);
  return { reproducibility: repro, craftingReproducibility: craftRepro, teamBuildingContrast: contrast, dungeonBenchmark: dungeon };
}

// --------------------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const report = {
    tool: "scripts/simulate.mjs",
    generatedAt: new Date().toISOString(),
    versions: {
      gamePackageVersion,
      contentPackageVersion,
      serverRulesVersionContext: SERVER_RULES_VERSION_CONTEXT,
    },
    seedBase: opts.seed,
    assumptions: [
      "Old Road cycle outcomes/rewards do not depend on hero level or gear (baseline.md section 2; combat.md worked example 11): the pacing sweep always uses the same level-1/unspecialized/unequipped frozen loadout for Old Road combat, matching any real player's outcome stream.",
      "All three party heroes receive identical XP every won cycle (baseline.md section 2), so level/xp is tracked once and shared.",
      "Gear is assigned greedily: each drop goes to whichever hero has the weakest (or no) item in that slot, if it is an upgrade (content.md powerScore).",
      "Boss readiness is tested by actually running packages/game's simulateBattle against the Tollkeeper's real content.md stats with the live level/gear/specialization at that point, not a hand estimate.",
      "A specialization is assumed chosen the instant level 3 is reached, for whichever combo this run is sweeping.",
      "Small sequential integer seeds are hashed (mixSeed, a 32-bit integer mix local to this script) before createRngState, because xorshift32's first draw is weakly mixed for small inputs (reports/engineering/M1-12.md 'Observations'); createRngState/xorshift32 is still the only RNG the engine itself runs.",
    ],
  };

  const reproducibility = reproducibilityCheck(opts.seed);
  report.reproducibility = { ok: reproducibility.ok, seed: reproducibility.seed, comboLabel: reproducibility.comboLabel };
  console.log(`[simulate] reproducibility check (seed ${reproducibility.seed}, same seed run twice): ${reproducibility.ok ? "PASS" : "FAIL"}`);
  if (!reproducibility.ok) process.exitCode = 1;

  if (opts.mode === "pacing" || opts.mode === "all") {
    const pacing = runPacingSweep(opts);
    report.pacing = pacing;
    console.log(`[simulate] pacing sweep: ${pacing.runs} runs, seeds ${opts.seed}-${opts.seed + pacing.runs - 1}, max ${opts.maxCycles} cycles/run`);
    console.log(`  win/loss totals: ${pacing.winLossTotals.wins} wins / ${pacing.winLossTotals.losses} losses`);
    console.log(`  first drop (cycle, min/median/max): ${pacing.firstDrop.min}/${pacing.firstDrop.median}/${pacing.firstDrop.max} (~${pacing.firstDrop.minutes.min}/${pacing.firstDrop.minutes.median}/${pacing.firstDrop.minutes.max} min)`);
    console.log(`  level-3 unlock (cycle, min/median/max): ${pacing.level3Unlock.min}/${pacing.level3Unlock.median}/${pacing.level3Unlock.max} (~${pacing.level3Unlock.minutes.min}/${pacing.level3Unlock.minutes.median}/${pacing.level3Unlock.minutes.max} min)`);
    console.log(`  boss ready (cycle, min/median/max): ${pacing.bossReady.min}/${pacing.bossReady.median}/${pacing.bossReady.max} (~${pacing.bossReady.minutes.min}/${pacing.bossReady.minutes.median}/${pacing.bossReady.minutes.max} min); ${pacing.bossReady.missing} of ${pacing.runs} runs never reached boss-ready within ${opts.maxCycles} cycles`);
  }

  if (opts.mode === "v2" || opts.mode === "all") {
    const v2 = runV2Checks(opts);
    report.v2 = v2;
    console.log(`[simulate] combat v2 reproducibility (seed ${v2.reproducibility.seed}): ${v2.reproducibility.ok ? "PASS" : "FAIL"}`);
    if (!v2.reproducibility.ok) process.exitCode = 1;
    console.log(`[simulate] crafting/reforge reproducibility (seed ${v2.craftingReproducibility.seed}): ${v2.craftingReproducibility.ok ? "PASS" : "FAIL"}`);
    if (!v2.craftingReproducibility.ok) process.exitCode = 1;
    console.log(`[simulate] team-building contrast (${v2.teamBuildingContrast.runs} runs, Old Road v2, level ${v2.teamBuildingContrast.level}): balanced win rate ${v2.teamBuildingContrast.balanced.winRate}, avg rounds ${v2.teamBuildingContrast.balanced.avgRoundsToClear}; glass-cannon win rate ${v2.teamBuildingContrast.glassCannon.winRate}, avg rounds ${v2.teamBuildingContrast.glassCannon.avgRoundsToClear}`);
    console.log(`[simulate] dungeon_aqueduct_depths full-clear benchmark (${v2.dungeonBenchmark.runs} runs, level ${v2.dungeonBenchmark.level}): balanced clear rate ${v2.dungeonBenchmark.balanced.clearRate} (avg floors ${v2.dungeonBenchmark.balanced.avgFloorsProcessed}); glass-cannon clear rate ${v2.dungeonBenchmark.glassCannon.clearRate} (avg floors ${v2.dungeonBenchmark.glassCannon.avgFloorsProcessed})`);
  }

  if (opts.mode === "v2ledger" || opts.mode === "all") {
    const ledger = runV2Ledger(opts);
    report.v2ledger = ledger;
    console.log(`[simulate] v2 ledger: ${ledger.heroCount}-hero party, level ${ledger.level}, ${ledger.days} days (${ledger.cyclesPerDay} Old Road cycles/day + ${ledger.dungeonClearsPerDay} dungeon clears/day), starting gold ${ledger.startingGold}`);
    console.log(`  final balances: gold ${ledger.final.gold}, scrap ${ledger.final.materials.scrap}, sigil ${ledger.final.materials.sigil}, core ${ledger.final.materials.core}, items ${ledger.final.itemsCount}, overflow-converted ${ledger.final.overflowConvertedCount}`);
    console.log(`  old road wins/losses: ${ledger.final.oldRoadWins}/${ledger.final.oldRoadLosses}; dungeon clears/fails: ${ledger.final.dungeonClears}/${ledger.final.dungeonFails}`);
  }

  if (opts.mode === "catchup" || opts.mode === "all") {
    const catchup = runCatchupBenchmark(opts);
    report.catchup = catchup;
    console.log(`[simulate] catch-up benchmark: ${catchup.reps} reps of a ${catchup.cyclesPerRun}-cycle (8h) settlement`);
    console.log(`  duration ms (min/median/p95/max): ${catchup.durationMs.min.toFixed(2)}/${catchup.durationMs.median.toFixed(2)}/${catchup.durationMs.p95.toFixed(2)}/${catchup.durationMs.max.toFixed(2)}`);
    console.log(`  heap delta bytes (min/max): ${catchup.heapDeltaBytes.min}/${catchup.heapDeltaBytes.max}`);
    console.log(`  recentCycles bound (<= ${catchup.recentCyclesLimit}) held: ${catchup.recentCyclesBoundOk}`);
    console.log(`  within provisional ${catchup.provisionalTargetMs} ms target (p95): ${catchup.withinProvisionalTarget}`);
    console.log(`  hardware: ${catchup.hardware.cpuModel} x${catchup.hardware.cpuCount}, node ${catchup.hardware.nodeVersion}, ${catchup.hardware.platform}/${catchup.hardware.arch}`);
  }

  if (opts.json) {
    writeFileSync(opts.json, JSON.stringify(report, null, 2), "utf8");
    console.log(`[simulate] wrote machine-readable results to ${opts.json}`);
  }
}

await main();
