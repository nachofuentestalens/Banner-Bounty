# F02 report consolidation and retest routing

Date: 2026-10-30. Producer task: `610a411c-c685-4670-b8cf-e9a56fa754d4`.
Status: complete; replacement task and fix dependency verified on 2026-11-06.

## Inventory and scope

Initial read-only project task inventory found 349 tasks. Old focused retest
`eb955b70-0a43-4dd4-b772-2acc833e3193` is closed; fix
`952bfce2-c546-4460-915f-4a7c84da33d1` is approved. At that initial check no replacement focused retest existed.
Broader QA closure `279a9824-633f-43d4-9163-e0271d770ab4` remains in progress and already
depends on the fix. Reuse it for overall closure; request only one focused F02 replacement.
Approval does not prove the fix is committed in the retest checkout.

Producer may edit only `design/studio/`; the requested `qa/reports/M2-29.md` cleanup is therefore
included in the one QA Tester retest task, not performed here. No production code changes.

## Required QA report consolidation

Replace all repeated F02 prerequisite/baseline/integration/review-gate sections with one short
`F02 retest pending` entry. Preserve the correction history unrelated to F02, consolidated
acceptance ledger, open defects, provenance and other sections verbatim except references to
removed sections. Retain the defect source `apps/web/src/components/BattleView.tsx:154`,
the expression `Math.max(0, s.duration - 1)`, and dependency on
`952bfce2-c546-4460-915f-4a7c84da33d1`. Drop per-HEAD rechecks. Preserve these retest steps:

1. Confirm integration using `git show HEAD:apps/web/src/components/BattleView.tsx | Select-String -Pattern 'duration -|currentRound'`; the unconditional subtraction must be gone.
2. Build the app from a clean checkout.
3. Run `node tests/e2e/m2-battle-browser.mjs`.
4. Compare fresh observations with the 38 discrepancies in `qa/artifacts/M2-29/battles/observations.json`; confirm zero remain for Burning/Taunting/Fortified/Weakened.
5. Update the F02 verdict PASS/FAIL and close or reopen that defect based on fresh evidence.

Preserve historical artifacts before any script overwrites them. Report a missing prerequisite
once, without another sequence of repeated blocked sections. No acceptance is claimed here.

## Initial tracking and verification

- Required report is tracked: repository-root `git ls-files --error-unmatch qa/reports/M2-29.md` passed. The initial invocation from `design/studio/` used the wrong relative path and failed; corrected at root.
- Read the permitted tasks GET endpoint only; no dashboard mutation commands were used.
- Search of `planning/` found no F02, old retest ID or fix ID references to update.
- Updated M3 execution notes to identify the closed retest and require replacement evidence.
- Director daily report retains historical observations with a current tracking addendum.
- Native M3-02 (`5dc6371a-c0a0-4393-9404-4497720246f4`) still depends on the old retest. No supported existing-task dependency-edit reply schema was supplied; do not claim its graph has been changed.
- No game build/browser run was needed for these documentation changes; Producer did not independently verify runtime health or F02 correctness.

## Replacement verification — 2026-11-06

The permitted tasks GET endpoint confirms replacement QA task
`f502e33d-1203-4fa8-8222-4957b79b5dea`, "Retest F02 after integrated fix and consolidate blocker notes",
is approved. Its sole native dependency is `952bfce2-c546-4460-915f-4a7c84da33d1`.
Its required paths are `qa/reports/M2-29.md`, `qa/reports/M2-29-resume.md`,
`qa/artifacts/M2-29/battles/observations.json`, `tests/e2e/m2-battle-browser.mjs` and
`apps/web/src/components/BattleView.tsx`. No duplicate task was requested in this continuation.

Both QA reports are tracked in this checkout. [QA's retest report](../../../qa/reports/M2-29-F02-retest.md)
records PASS on baseline `25ea121edc70bbfcc1a15e9c2ceeb090532279de`: integration check,
clean install/build, seven browser fight inspections and zero remaining discrepancies versus
38 historical findings. It records preservation of historical observations. `qa/reports/M2-29.md`
now contains the consolidated resolved F02 entry and links that evidence. These are reviewed QA
results, not a new Producer build or playtest; QA files were not edited here.

Recorded the replacement ID and evidence in M3 and Director exit tracking. The endpoint still
shows M3-02 depending on closed retest `eb955b70`; native graph repair is not claimed.
The initial local `AGENTS.md` read failed because the map lives at repository root; the root map
was then read successfully. Focused diff review against task base
`1f0c881ff2538f9173b6558ee9ea01de48404443` and `git diff --check` verify documentation scope
and whitespace only.

Next: existing QA closure `279a9824-633f-43d4-9163-e0271d770ab4` and Director M3-02 consume
the replacement evidence and disposition remaining M2 checks. F02 PASS alone does not grant M2 acceptance.
