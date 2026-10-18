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
    mode: "all", // pacing | catchup | all
    catchupReps: 10,
    json: null,
    quiet: false,
  };
  for (const raw of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(raw);
    if (!m) continue;
    const [, key, value] = m;
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
      default:
        console.error(`[simulate] unknown flag --${key}, ignoring`);
    }
  }
  if (!Number.isFinite(out.seed)) out.seed = 1;
  out.runs = Math.max(1, Math.min(500, Number.isFinite(out.runs) ? out.runs : 32));
  out.maxCycles = Math.max(1, Math.min(5000, Number.isFinite(out.maxCycles) ? out.maxCycles : 700));
  out.catchupReps = Math.max(1, Math.min(200, Number.isFinite(out.catchupReps) ? out.catchupReps : 10));
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
