# M2-29-F02 retest — evidence report

Task: f502e33d-1203-4fa8-8222-4957b79b5dea. Date: 2026-10-30. Prerequisite: Gameplay Programmer task `952bfce2-c546-4460-915f-4a7c84da33d1`.

Result: **PASS. F02 is fixed; closing.**

## Defect under test

M2-29-F02 (P2): the status-duration badge in `UnitPanel` (`apps/web/src/components/BattleView.tsx:154`) read one round lower than the just-applied duration stated in the battle feed, for Burning/Taunting/Fortified/Weakened. Original defect source and 38 historical discrepancies: `qa/artifacts/M2-29/battles/observations.json` (preserved before this run; see below), reproduced via `tests/e2e/m2-battle-browser.mjs`.

## Review-gate retest steps and results

1. **Confirm integration.** `git show HEAD:apps/web/src/components/BattleView.tsx | Select-String -Pattern 'duration -|currentRound'` at HEAD `25ea121edc70bbfcc1a15e9c2ceeb090532279de` (this task's branch). Result: the unconditional `Math.max(0, s.duration - 1)` is **gone**. Line 154 now reads `Math.max(0, s.duration - (currentRound - s.appliedRound))`, driven by `currentRound` tracked from replay state (lines 52, 62, 67, 80) and `s.appliedRound`. Fix from `952bfce2-c546-4460-915f-4a7c84da33d1` is integrated into this execution baseline.
2. **Build from a clean checkout.** `npm ci` (189 packages, 0 vulnerabilities blocking) then `npm run build` — all five workspace builds passed, including web typecheck and `vite build`. Exit 0.
3. **Run the repro.** `node tests/e2e/m2-battle-browser.mjs` — exited 0. All seven fight inspections (expedition, boss, dungeon floors 1–3, dungeon-boss, arena) printed PASS for exact steps/HP, feed, pause/speed/skip, narrow overflow. No browser page errors.
4. **Compare fresh observations against the 38 historical discrepancies.** Historical `qa/artifacts/M2-29/battles/observations.json` (preserved as `observations-historical.json` before rerunning the script) recorded `findings.length === 38`, all `type: "status-duration"` for Burning/Taunting/Fortified/Weakened. The fresh run's `observations.json` (same path, overwritten by the script as designed) has `findings.length === 0`. Zero status-duration discrepancies remain for all four effects.
5. **Verdict.** **PASS.** F02 is closed as fixed. Status badges now correctly reflect remaining duration against the replay's current round rather than an unconditional one-round subtraction.

## Scope notes

- No game-source file was edited by QA; the fix was authored and integrated by Gameplay Programmer under `952bfce2-c546-4460-915f-4a7c84da33d1`.
- F01 (formation rows not visually distinguished in battle view) is unrelated to this retest and remains open; not addressed here.
- Historical battle artifacts were preserved (`observations-historical.json`) before the script overwrote `observations.json`, matching the retest instruction to preserve historical artifacts before running scripts.
- This report consumes task `952bfce2-c546-4460-915f-4a7c84da33d1`'s review-gated integration as its single prerequisite; it does not duplicate or re-run the broader M2-29 twelve-check ledger, which is owned by `qa/reports/M2-29.md` and the separate closure task `279a9824-633f-43d4-9163-e0271d770ab4`.

## Next

F02 is closed. `qa/reports/M2-29.md`'s check 4/6/8 notes and open-defects section are updated to reflect this PASS. M2-30's playability verdict now only needs disposition on F01 (still open, P2).
