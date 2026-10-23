// Compare against this task's approved baseline, excluding only new evidence.
// Run after npm run build. No branch or worktree changes.
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { simulateBattleV2 as after } from "../packages/game/dist/combat2.js";
const baseline = "9e740ffcc216b5a3f68b694a0d989d7debb860e9";
const file = new URL("../packages/game/dist/combat2-evidence-baseline.js", import.meta.url);
const source = execFileSync("git", ["show", `${baseline}:packages/game/src/combat2.ts`], { encoding: "utf8" });
fs.writeFileSync(file, ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
try {
  const { simulateBattleV2: before } = await import(file.href);
  const kits = [
    ["vanguard", "bulwark_call", "shield_bash", "thick_hide", "last_stand"],
    ["cleric", "mending_light", "sanctuary", "devotion", "vital_surge"],
    ["ranger", "aimed_shot", "volley", "hunters_focus", "momentum"],
    ["rogue", "backstab", "flurry", "opportunist", "evasion"],
    ["arcanist", "firebolt", "meteor", "overload", "arcane_reserve"],
    ["herald", "war_hymn", "discordant_verse", "encore", "battle_hymn"],
  ];
  const team = (prefix, offset) => Array.from({ length: 5 }, (_, slotIndex) => {
    const k = kits[(slotIndex + offset) % 6];
    return { kind: "hero", id: prefix + slotIndex, slotIndex, primaryClassId: "class_" + k[0],
      secondaryClassId: null, level: 8, equipment: { weapon: null, armor: null, trinket: null },
      skillLoadout: { active: offset % 2 ? [k[2], k[1]] : [k[1], k[2]], passive: [k[3], k[4]] } };
  });
  const enemies = ["boss_tollkeeper", "boss_drowned_warden", "enemy_depths_broodling", "enemy_road_brigand", "enemy_aqueduct_drowned"].map((enemyId, slotIndex) => ({
    kind: "enemy", id: enemyId, enemyId, slotIndex, isBoss: enemyId.startsWith("boss"), stats: { maxHp: 220, atk: 25, def: 10, spd: 12 },
  }));
  for (let seed = 1; seed <= 60; seed++) for (const kind of ["arena", "boss"]) {
    const args = [team("a", seed), kind === "arena" ? team("b", seed + 1) : enemies, kind, seed];
    const actual = after(...args);
    actual.events = actual.events.map(({ damageBreakdown, ...event }) => event);
    assert.deepEqual(actual, before(...args), `seed=${seed}, kind=${kind}`);
  }
  console.log("PASS 120 baseline comparisons: all original events, outcomes, rounds and final HP unchanged");
} finally {
  fs.unlinkSync(file);
}
