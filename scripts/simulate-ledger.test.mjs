import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

function ledger(args = [], expectedStatus = 0) {
  const directory = mkdtempSync(join(tmpdir(), "banner-ledger-actions-"));
  try {
    const output = join(directory, "report.json");
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./simulate.mjs", import.meta.url)),
      "--mode=v2ledger", ...args, `--json=${output}`], { encoding: "utf8" });
    assert.equal(result.status, expectedStatus, result.error?.message ?? result.stderr);
    return expectedStatus === 0 ? JSON.parse(readFileSync(output, "utf8")).v2ledger : result.stderr;
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("material rejection is atomic and recovers without advancing any RNG stream", () => {
  const common = ["--ledger-days=4", "--ledger-starting-gold=5000"];
  const recovery = ledger([...common, "--ledger-spend=1:craft_epic:item_weapon_focus", "--ledger-spend=4:craft_epic:item_weapon_focus"]);
  const control = ledger([...common, "--ledger-spend=4:craft_epic:item_weapon_focus"]);
  const [rejected, accepted] = recovery.spendActions;
  assert.equal(rejected.reason, "insufficient_materials");
  assert.deepEqual(rejected.before, rejected.after);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.before.materials.core, 8);
  assert.equal(accepted.after.materials.core, 0);
  assert.equal(accepted.before.gold - accepted.after.gold, 900);
  assert.deepEqual(accepted.item, control.spendActions[0].item);
  assert.deepEqual(recovery.final, control.final);
  assert.deepEqual(recovery.rngStates, control.rngStates);
  assert.deepEqual(recovery, ledger([...common, "--ledger-spend=1:craft_epic:item_weapon_focus", "--ledger-spend=4:craft_epic:item_weapon_focus"]));
});

test("recipe basket, reforge and sequential recruits debit production costs", () => {
  const result = ledger(["--ledger-days=4", "--ledger-starting-gold=5000",
    "--ledger-spend=4:craft_uncommon:item_weapon_focus", "--ledger-spend=4:craft_rare:item_weapon_focus",
    "--ledger-spend=4:craft_epic:item_weapon_focus", "--ledger-spend=4:reforge_rare:2:0",
    "--ledger-spend=4:reforge_rare:2:1", "--ledger-spend=4:recruit:class_cleric",
    "--ledger-spend=4:recruit:class_rogue", "--ledger-spend=4:recruit:class_herald"]);
  assert.ok(result.spendActions.every(a => a.status === "accepted"));
  assert.deepEqual(result.final.materials, { scrap: 0, sigil: 0, core: 0 });
  assert.equal(result.spendActions[0].before.gold - result.final.gold, 3300);
  assert.deepEqual(result.spendActions.slice(5).map(a => a.cost.gold), [450, 600, 750]);
  assert.equal(result.rosterCount, 6);
  const crafted = result.spendActions[1].item;
  const reforged = result.spendActions[3].item;
  assert.notDeepEqual(crafted.affixes[0], reforged.affixes[0]);
  assert.deepEqual(crafted.affixes[1], reforged.affixes[1]);
  const baseline = ledger(["--ledger-days=4", "--ledger-starting-gold=5000"]);
  assert.deepEqual(result.rngStates.oldRoad, baseline.rngStates.oldRoad);
  assert.deepEqual(result.rngStates.dungeon, baseline.rngStates.dungeon);
});

test("gold, bag, reforge ownership and roster rejections never spend or roll", () => {
  const poor = ledger(["--ledger-days=1", "--ledger-cycles-per-day=0", "--ledger-dungeon-clears-per-day=0",
    "--ledger-spend=1:craft_uncommon:item_weapon_focus", "--ledger-spend=1:recruit:class_cleric",
    "--ledger-spend=1:reforge_uncommon:1:0"]);
  assert.deepEqual(poor.spendActions.map(a => a.reason), ["insufficient_gold", "insufficient_gold", "invalid_reforge_target"]);
  const full = ledger(["--ledger-spend=7:craft_uncommon:item_weapon_focus"]);
  assert.equal(full.spendActions[0].reason, "bag_full");
  const roster = ledger(["--ledger-days=1", "--ledger-starting-gold=100000",
    ...Array(18).fill("--ledger-spend=1:recruit:class_cleric")]);
  assert.equal(roster.rosterCount, 20);
  assert.equal(roster.spendActions.at(-1).reason, "roster_full");
  for (const a of [...poor.spendActions, full.spendActions[0], roster.spendActions.at(-1)]) assert.deepEqual(a.before, a.after);
});

test("online/offline splits preserve expedition and cross-boundary dungeon outcomes", () => {
  const common = ["--ledger-days=2", "--ledger-dungeon-clears-per-day=1"];
  const online = ledger(common);
  const split = ledger([...common, "--ledger-online-minutes=64", "--ledger-offline-minutes=8"]);
  assert.deepEqual(split.final, online.final);
  assert.deepEqual(split.rngStates, online.rngStates);
  assert.deepEqual(split.dailyBalances[0].segments.map(s => s.dungeonFloors), [1, 3]);
  const roadOnly = ["--ledger-days=1", "--ledger-cycles-per-day=480", "--ledger-dungeon-clears-per-day=0"];
  const whole = ledger(roadOnly);
  for (const minutes of [0, 30, 78, 240, 480]) {
    const partition = ledger([...roadOnly, `--ledger-online-minutes=${minutes}`, `--ledger-offline-minutes=${480 - minutes}`]);
    assert.deepEqual(partition.final, whole.final);
    assert.deepEqual(partition.rngStates, whole.rngStates);
  }
});

test("minute budgets limit credit and offline dungeons cannot auto-restart", () => {
  for (const minutes of [30, 78, 480]) {
    const result = ledger(["--ledger-days=1", "--ledger-cycles-per-day=480", "--ledger-dungeon-clears-per-day=0",
      "--ledger-online-minutes=0", `--ledger-offline-minutes=${minutes}`]);
    assert.equal(result.final.oldRoadWins + result.final.oldRoadLosses, minutes);
  }
  const dungeon = ledger(["--ledger-days=1", "--ledger-cycles-per-day=0", "--ledger-online-minutes=0", "--ledger-offline-minutes=480"]);
  assert.equal(dungeon.final.dungeonClears, 1);
  const partial = ledger(["--ledger-days=1", "--ledger-cycles-per-day=0", "--ledger-online-minutes=1", "--ledger-offline-minutes=4"]);
  assert.equal(partial.final.dungeonClears, 0);
  assert.equal(partial.final.dungeonFails, 0);
  assert.equal(partial.dailyBalances[0].dungeonIncomplete, 1);
  assert.equal(partial.dailyBalances[0].segments[1].dungeonFloors, 1);
  for (const value of ["481", "-1", "NaN", "1.5"]) {
    assert.match(ledger([`--ledger-online-minutes=${value}`, "--ledger-offline-minutes=0"], 1), /integer from 0 to 480/);
  }
  assert.match(ledger(["--ledger-online-minutes=30"], 1), /provide both/);
  assert.match(ledger(["--ledger-spend=8:craft_epic:item_weapon_focus"], 1), /invalid ledger spend/);
  assert.match(ledger(["--ledger-spend=1:craft_unknown:item_weapon_focus"], 1), /Unknown recipe/);
});

test("crafted items consume shared bag capacity without perturbing reward streams", () => {
  const base = ledger();
  const spent = ledger(["--ledger-spend=1:craft_uncommon:item_weapon_focus"]);
  assert.equal(spent.spendActions[0].status, "accepted");
  assert.equal(spent.unequippedCount, 100);
  assert.equal(spent.final.itemsCount, 99);
  assert.equal(spent.final.overflowConvertedCount, base.final.overflowConvertedCount + 1);
  assert.deepEqual(spent.rngStates.oldRoad, base.rngStates.oldRoad);
  assert.deepEqual(spent.rngStates.dungeon, base.rngStates.dungeon);
});

test("partition equivalence includes other seeds, party sizes and losing cycles", () => {
  for (const heroes of [1, 5]) {
    const args = ["--seed=5000", `--heroes=${heroes}`, "--level=1", "--ledger-days=1", "--ledger-dungeon-clears-per-day=0"];
    const base = ledger(args);
    const split = ledger([...args, "--ledger-online-minutes=17", "--ledger-offline-minutes=43"]);
    assert.deepEqual(split.final, base.final);
    assert.deepEqual(split.rngStates, base.rngStates);
    if (heroes === 1) assert.ok(base.final.oldRoadLosses > 0);
  }
});

// Run after npm run build; exercise the public CLI and production reward rules.
test("combined ledger caps one account bag and preserves material rewards with legacy gold", () => {
  const directory = mkdtempSync(join(tmpdir(), "banner-ledger-"));
  try {
    const run = (startingGold) => {
      const output = join(directory, `${startingGold}.json`);
      const result = spawnSync(process.execPath, [
        fileURLToPath(new URL("./simulate.mjs", import.meta.url)),
        "--mode=v2ledger", `--ledger-starting-gold=${startingGold}`, `--json=${output}`,
      ], { encoding: "utf8" });
      assert.equal(result.status, 0, result.error?.message ?? result.stderr);
      return JSON.parse(readFileSync(output, "utf8")).v2ledger;
    };
    const fresh = run(0);
    // Seed 1 produces 128 drops across the two activities; only 100 fit.
    assert.equal(fresh.final.itemsCount, 100);
    assert.equal(fresh.final.overflowConvertedCount, 28);
    assert.equal(fresh.final.gold, 5835);
    assert.deepEqual(fresh.final.materials, { scrap: 140, sigil: 28, core: 14 });
    assert.equal(fresh.final.oldRoadWins, 420);
    assert.equal(fresh.final.dungeonClears, 14);
    const legacy = run(5000);
    assert.deepEqual(legacy.final, { ...fresh.final, gold: fresh.final.gold + 5000 });
    assert.deepEqual(legacy.dailyBalances, fresh.dailyBalances.map(day => ({ ...day, gold: day.gold + 5000 })));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
