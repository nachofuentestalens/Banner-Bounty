# F02 report consolidation and retest routing

Date: 2026-10-30. Producer task: `610a411c-c685-4670-b8cf-e9a56fa754d4`.
Status: partial; replacement task requested, assigned ID pending.

## Inventory and scope

Read-only project task inventory found 349 tasks. Old focused retest
`eb955b70-0a43-4dd4-b772-2acc833e3193` is closed; fix
`952bfce2-c546-4460-915f-4a7c84da33d1` is approved. No replacement focused retest exists.
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

## Tracking and verification

- Required report is tracked: repository-root `git ls-files --error-unmatch qa/reports/M2-29.md` passed. The initial invocation from `design/studio/` used the wrong relative path and failed; corrected at root.
- Read the permitted tasks GET endpoint only; no dashboard mutation commands were used.
- Search of `planning/` found no F02, old retest ID or fix ID references to update.
- Updated M3 execution notes to identify the closed retest and require replacement evidence.
- Director daily report retains historical observations with a current tracking addendum.
- Native M3-02 (`5dc6371a-c0a0-4393-9404-4497720246f4`) still depends on the old retest. No supported existing-task dependency-edit reply schema was supplied; do not claim its graph has been changed.
- No game build/browser run was needed for these documentation changes; runtime health and F02 correctness remain unverified.

Next: read the new retest ID from the permitted inventory endpoint, verify its fix dependency,
record it here and in M3/Director exit tracking, and verify the final diff. QA owns cleanup and retest delivery.
