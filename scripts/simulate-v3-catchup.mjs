#!/usr/bin/env node
// M3-07 catch-up benchmark (design/game/economy/m3.md section 5). Measures
// one authoritative `runSettlementWalkV3` transaction covering the maximum
// eligible 8-hour offline window, using real combat3 battles (not synthetic
// durations), for >=20 repetitions, reporting min/median/p95/max plus
// hardware context — same benchmark shape as the existing `--mode=catchup`
// (legacy fixed-duration) baseline this reuses as its format.
//
// Usage: npm run build && node scripts/simulate-v3-catchup.mjs [--reps=20]
import os from "node:os";
import process from "node:process";

let game, content;
try {
  game = await import("@banner-and-bounty/game");
  content = await import("@banner-and-bounty/content");
} catch (err) {
  console.error("[simulate-v3-catchup] run `npm run build` first.\n" + String(err && err.message ? err.message : err));
  process.exitCode = 1;
  process.exit(1);
}

const { freshSettlementStateV3, runSettlementWalkV3, toHeroCombatantsV3, buildEnemyCombatantsV3, simulateBattleV3 } = game;
const { OLD_ROAD_ENEMIES, autoFillLoadoutV3, M3_RULES } = content;

const REPS = Number((process.argv.find((a) => a.startsWith("--reps=")) ?? "--reps=20").split("=")[1]) || 20;

function balancedParty5(level) {
  const EQUIPMENT = { weapon: null, armor: null, trinket: null };
  const h = (id, slotIndex, primaryClassId) => ({
    id, primaryClassId, secondaryClassId: null, primarySpecializationId: null, raceId: "race_vesper",
    level, slotIndex, equipment: EQUIPMENT, skillLoadout: autoFillLoadoutV3(primaryClassId, level),
  });
  return [h("tank", 0, "class_vanguard"), h("healer", 1, "class_cleric"), h("dps1", 2, "class_rogue"), h("dps2", 3, "class_ranger"), h("dps3", 4, "class_arcanist")];
}

const party = toHeroCombatantsV3(balancedParty5(5));
const enemyPlacements = OLD_ROAD_ENEMIES.map((e, i) => ({ enemyId: e.enemyId, slotIndex: i }));

function rollOldRoadBattle(rngState) {
  // One fresh-seeded V3 battle per roll (combat3's own internal RNG thread, per contracts.md
  // section 4's "roll from rngState (combat.md section 8)"); `rngState` here both seeds this
  // battle and is itself advanced, matching dungeon.ts's combatSeedForFloor precedent.
  const seed = (rngState ^ 0x9e3779b9) >>> 0 || 1;
  const enemies = buildEnemyCombatantsV3(enemyPlacements);
  const battle = simulateBattleV3(party, enemies, "pve", seed);
  return {
    roll: { resolvedRounds: battle.rounds, nominalDurationMs: battle.rounds * M3_RULES.msPerRound, result: battle.result, payload: null },
    nextRngState: (seed * 1_103_515_245 + 12_345) >>> 0 || 1,
  };
}

const durationsMs = [];
let lastBattlesSettled = 0;
for (let i = 0; i < REPS; i++) {
  const fresh = freshSettlementStateV3(0, i + 1);
  const t0 = process.hrtime.bigint();
  const result = runSettlementWalkV3(fresh, M3_RULES.offlineCapMs, rollOldRoadBattle, { maxBattlesPerCall: M3_RULES.maxBattlesPerSettlement });
  const t1 = process.hrtime.bigint();
  durationsMs.push(Number(t1 - t0) / 1e6);
  lastBattlesSettled = result.battlesThisCall;
}

durationsMs.sort((a, b) => a - b);
const pct = (p) => durationsMs[Math.min(durationsMs.length - 1, Math.floor((p / 100) * durationsMs.length))];
const report = {
  reps: REPS,
  msPerRound: M3_RULES.msPerRound,
  maxBattlesPerSettlement: M3_RULES.maxBattlesPerSettlement,
  offlineCapMs: M3_RULES.offlineCapMs,
  battlesSettledPerCall: lastBattlesSettled,
  minMs: Math.round(durationsMs[0] * 100) / 100,
  medianMs: Math.round(pct(50) * 100) / 100,
  p95Ms: Math.round(pct(95) * 100) / 100,
  maxMs: Math.round(durationsMs.at(-1) * 100) / 100,
  hardware: { cpuModel: os.cpus()[0]?.model ?? "unknown", cores: os.cpus().length, nodeVersion: process.version, platform: `${process.platform}-${process.arch}`, totalMemGB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10 },
};
console.log(JSON.stringify(report, null, 2));
console.log(
  `\n[simulate-v3-catchup] p95=${report.p95Ms}ms target<2000ms: ${report.p95Ms < 2000 ? "PASS" : "FAIL"}. ` +
    `Each call settled ${lastBattlesSettled} battles (capped at maxBattlesPerSettlement=${M3_RULES.maxBattlesPerSettlement}; ` +
    "the remaining 8h window is resumable in further calls per contracts.md worked example W4, not measured again here).",
);
