import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

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
