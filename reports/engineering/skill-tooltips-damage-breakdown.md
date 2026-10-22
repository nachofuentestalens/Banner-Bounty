# Skill tooltips and damage breakdown — phase evidence

Task: `c5bd2700-b2bc-4995-8741-16f5521c9d7b` · Gameplay Programmer · 2026-10-22

Result: **partial**. Skill help is implemented and verified. Damage breakdown is not yet implemented; do not close the task or certify the full M2 acceptance checks.

## Changes and decisions

- `apps/web/src/components/SkillLabel.tsx`: reusable hover/focus/tap help, Escape dismissal, accessible description association, viewport-bounded portal to avoid combat-log clipping.
- `apps/web/src/skillMechanics.ts`: display-only transcription of all 30 skill rows from `design/game/classes.md` section 5. Existing `skillCopy` supplies M2-24 narrative copy. No client combat calculation or new narrative content.
- `apps/web/src/screens/Company.tsx`: selected skills retain help while the loadout is locked; an expandable list permits inspecting alternatives and the primary basic attack before choosing. Native select titles supplement the accessible help buttons because option hover behavior differs by browser.
- `apps/web/src/components/BattleView.tsx`: both the current action and full event log use the same skill help. Existing shared view serves expedition, dungeon, boss and arena; no parallel battle screen.
- `apps/web/src/styles.css`: tooltip and skill-label presentation.
- `apps/web/src/components/SkillLabel.test.tsx` and `scripts/verify-skill-tooltips.mjs`: focused interaction, coverage and real-endpoint browser evidence.
- `.gitignore`: ignore task-local npm cache needed because the shared cache is inaccessible.

All four required inputs were tracked at task start; no prerequisite IDs were assigned. The task base already includes M2-27's Company/BattleView implementation and `reports/engineering/M2-27.md` (task `ae4866f3-8c46-4142-bf70-c901d5d57d37`). This phase modifies those components directly, with no duplicate backlog task or delegated implementation. No contracts or architecture changed in this phase.

## Acceptance evidence

Numbers refer to `design/studio/milestones/M2.md`; `design/qa/acceptance.md` in this baseline still contains only M1 acceptance numbering.

| Check | Evidence and remaining limit |
| --- | --- |
| 4 — battle view completeness | Real boss replay at both viewport widths displays existing unit names, classes and numeric HP; tooltip overlay remains within the viewport. This phase does not re-certify status duration behavior or every fight kind. |
| 5 — turn feed | A real boss log's Aimed Shot opens narrative and mechanical help; existing actor, target, amount and HP text remain visible. Current-action rendering uses the same component. Requested damage calculation breakdown is outstanding. |
| 8 — cooldowns/modifiers/taunt | Bulwark Call help shows cooldown 3 rounds, self Taunt 2 rounds (3 with Banner Bearer), and +30% DEF for 2 rounds. All 30 skills have help metadata. This proves explanation visibility, not enforcement; server-recorded modifier evidence is outstanding. |

Browser observations: 390px build screenshot shows a readable Bulwark Call panel without horizontal overflow. 1280px boss screenshot shows Aimed Shot help above the full log without clipping. Both screenshots were visually inspected. Browser script additionally checks focus, Escape and click access and tooltip bounds at each width. It uses a fresh temporary SQLite save, real session selection and `/boss/challenge`, no mocked API or progression grants.

Screenshots (local ignored artifacts): `test-results/skill-tooltips/build-1280.png`, `build-390.png`, `battle-1280.png`, `battle-390.png`.

## Commands and results

- `npm ci --no-audit --no-fund`: failed, EPERM reading shared `C:\Users\user\AppData\Local\npm-cache`; no approval prompt requested.
- `npm ci --no-audit --no-fund --cache .cache/npm`: passed, 189 packages installed.
- `npm run typecheck --workspace=apps/web`: passed.
- `npm test --workspace=apps/web -- --run src/components/BattleView.test.tsx`: passed, 4 tests.
- `npm test --workspace=apps/web -- --run src/components/SkillLabel.test.tsx`: passed, 2 tests (rerun after portal positioning changes).
- `npm run build`: passed all five workspaces.
- `npm run build --workspace=apps/web`: passed after final tooltip positioning and metadata corrections.
- `node scripts/verify-skill-tooltips.mjs`: passed at 1280x720 and 390x720 using system Edge. Test server and browser close in finally; temporary isolated save retained under the OS temp directory. SQLite experimental warning only.

## Next phase — same task

Add authoritative optional damage calculation data in `packages/game/src/combat2.ts`, `packages/contracts/src/index.ts` and `apps/web/src/types.ts`; preserve old reports without it. `apps/server/src/services/battlePresentation.ts` currently spreads event fields unchanged. `resolveHit` currently receives a numeric callback and returns amount/crit/dodged; `pushEvent` then clamps damage to HP and can trigger Vital Surge. Capture actual calculation stages, including active stat modifiers, skill/passive multipliers, crit/dodge and HP clamping, without consuming extra RNG or changing outcomes. Cover Burn ticks as well as direct hits, AoE and sequential hits. Render the recorded values, never reconstruct damage from final HP in the browser.

Add meaningful deterministic and clamp regression checks, verify the real battle UI, and update this report to distinguish proven checks from limitations. If the additive contract needs owning documentation updates, send the CTO an exact task block rather than editing prohibited `design/studio/` files. No new prerequisite task is needed for the existing M2-27 implementation. Remain on this isolated branch; do not merge or switch worktrees.
