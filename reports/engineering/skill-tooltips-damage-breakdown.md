# Skill tooltips and damage breakdown — phase evidence

Task: `c5bd2700-b2bc-4995-8741-16f5521c9d7b` · Gameplay Programmer · 2026-10-22

Result: **pass for this task; ready for agent review**. Tooltips and authoritative damage breakdowns are implemented and verified. The phase-one notes below are retained as an audit trail; the completion evidence supersedes their outstanding items. This is focused implementation evidence, not independent certification of the entire M2 milestone.

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

Add meaningful deterministic and clamp regression checks, verify the real battle UI, and update this report to distinguish proven checks from limitations. If the additive contract needs owning documentation updates, send the CTO an exact task block rather than editing prohibited `design/studio/` files. No new prerequisite task is needed for the existing M2-27 implementation. Remain on this isolated branch; do not merge or switch worktrees.## Completion: authoritative damage evidence

### Changes and architecture

- packages/game/src/combat2.ts records optional damageBreakdown on direct hits (including dodges) and Burn ticks. Each step stores a kind code, numeric inputs and the actual evaluated value. It captures battle-start ATK/DEF, Arcane Reserve, Weaken, Fortify, skill ATK scaling, base damage, execute/skill/passive scaling, crit/dodge rolls, Last Stand, Vital Surge and final HP loss. Per-target and sequential hits retain separate evidence.
- packages/contracts/src/index.ts and apps/web/src/types.ts add compatible optional DamageBreakdown/ DamageStep shapes. No schema migration or rules-version change: the calculations, RNG consumption and existing event fields are unchanged. Stored JSON and apps/server/src/services/battlePresentation.ts already preserve additive event fields. GET /battle-reports round-trip equality was verified.
- apps/web/src/components/DamageDetails.tsx formats the recorded operands/results only, in the shared BattleView current-action and full-log views. No combat formula executes in the browser. All damage text is visible without hovering; existing SkillLabel hover/focus/touch access remains in both views and in the build editor. Build help explains formulas rather than inventing an unplayed battle outcome.
- Older reports lacking evidence explicitly say the breakdown is unavailable and retain the original final amount and HP. Dodge reports say base damage and the critical roll were not evaluated, matching combat.md 8.3. Burn reports identify captured ATK and stacks with no crit/dodge roll. Overkill and Vital Surge distinguish resolved damage from actual HP loss.
- packages/game/src/damageBreakdown.test.ts adds fixed-seed arithmetic/HP reconciliation checks; DamageDetails.test.tsx checks displayed formulas/modifiers/clamping and legacy/dodge fallback. BattleView.test.tsx narrows an older-report assertion now that the fallback also contains that phrase.
- scripts/verify-damage-parity.mjs reproducibly compiles combat2 from task base 9e740ffcc216b5a3f68b694a0d989d7debb860e9 into an ignored temporary dist file and compares 120 simulations, removing only damageBreakdown before comparison. It never switches branches or edits the baseline.
- scripts/verify-skill-tooltips.mjs now verifies stored reports, per-event HP reconciliation, current-action and full-log breakdowns, actual touch tap at 390px, visible status badges, and Fortify/Weaken arithmetic. Tests use an isolated save and stop their browser/server afterward.

### Final acceptance evidence

| Check | Verified for this task |
| --- | --- |
| 4 ? battle view completeness | Real boss view at 1280x720 and 390x720 retains named/classed units and numeric HP. Stepping to a status event displays a status badge. Tooltip and damage text remain readable. Existing BattleView status-badge test passes. This change does not certify all pre-existing duration behavior or every fight kind independently. |
| 5 ? turn feed | Real boss current-action and full-log text contain the server-recorded arithmetic. Browser checks reconcile every damage event against prior HP, signed amount and hpAfter, then the full finalHp map. Stored GET report events exactly equal the mutation response. Desktop screenshot demonstrates base 5 and critical multiplier producing 7 in the inspected run; mobile screenshot shows wrapped operands and HP loss. Existing actor/skill/target/death behavior remains under BattleView tests. |
| 8 ? modifiers/cooldowns/taunt | Real boss log exposes Fortified DEF or Weakened ATK with recorded operands/results; browser checks require such an event and take modifier screenshots. Fixed-seed tests exercise both effects plus Last Stand and other passives. Existing combat2 cooldown-priority and taunt targeting tests pass. Tooltip help shows cooldown, targeting and mechanical effects; live cooldown counters are not added by this task. |

Fixed seeds 1?36: five-unit mixed teams at level 8, varied active priority, all six classes. Tests check every recorded scale, base calculation, roll and Burn tick; hpBefore ? hpLoss equals hpAfter, hpLoss equals negative event amount, and final replay HP equals finalHp. Required coverage includes execute, AoE, Opportunist, Overload, Arcane Reserve, Last Stand and Vital Surge. A separate guaranteed Backstab fixture checks skipped rolls and overkill. Re-running each seed produces identical full evidence.

Seeds 1?60, each in arena and boss scenarios: 120 comparisons with the task-base engine match every original event, result, round count and final HP. Boss scenario includes Tollkeeper, Drowned Warden, Broodling, Brigand and Drowned enemy actions. This verifies no gameplay change in the exercised scenarios, not an exhaustive proof over every possible input.

### Completion commands/results

- npm test --workspace=packages/game -- --run src/combat2.test.ts ? 15/15 passed.
- npm test --workspace=packages/game -- --run src/damageBreakdown.test.ts ? 2/2 passed (36 deterministic team scenarios plus guaranteed-critical overkill fixture).
- npm test --workspace=apps/web -- --run src/components/BattleView.test.tsx src/components/DamageDetails.test.tsx src/components/SkillLabel.test.tsx ? 8/8 passed.
- node scripts/verify-damage-parity.mjs ? 120/120 baseline comparisons passed.
- npm run build ? all five workspaces passed.
- npm run typecheck ? workspace TypeScript build and web check passed.
- node scripts/verify-skill-tooltips.mjs ? passed both widths; stored event equality, HP reconciliation, modifier visibility and keyboard/touch checks passed. Browser uses actual server seeds; fixed-seed evidence is provided by the focused engine tests above.
- git diff --check ? passed (Windows line-ending notices only). Diff against the task base reviewed, including prior tooltip work and new files.

Failures resolved during this phase: an initial scripted edit mishandled CRLF and caused a TypeScript syntax error; restored the exact checkpoint source and reapplied using normalized newlines. The first legacy UI assertion matched multiple messages; narrowed it to the snapshot fallback. The first browser persistence check used data.events rather than the documented data.report.events; fixed the harness path. A later immediate tooltip-count assertion raced React dismissal; changed it to wait for hidden state. All affected checks then passed. No refused command or unresolved build failure in this phase.

Artifacts: test-results/skill-tooltips/{build,battle,damage,modifier}-{1280,390}.png (ignored local files, reproducible via the browser script). Mobile build, desktop battle, both damage layouts and a mobile modifier screenshot were visually inspected. The modifier harness now moves the pointer away before capture so incidental skill hover does not obscure the arithmetic.

### Copy, limitations and review handoff

Existing M2-24 skill names/descriptions and M2-22 mechanics are reused. The existing feed's critical/dodge/death phrases remain unchanged. No narrative gap required new flavor copy. The copy catalog has no arithmetic-label keys; DamageDetails supplies factual labels such as Base damage, Critical roll, Resolved damage and actual HP loss. Unknown future step codes get a neutral Recorded modifier label; no values are fabricated.

No known unresolved implementation defect for the requested scope. Legacy reports cannot retroactively gain missing calculation evidence. This task does not add live cooldown counters, change balance, or claim independent QA certification across every expedition/dungeon/arena flow. The shared renderer and engine cover those routes; the real-browser fixture is a boss fight.

Next: agent review and owner-controlled integration. CTO documentation follow-up must append the additive damageBreakdown contract and architecture note in the owned design/studio documents; Engineering cannot edit those paths. The optional shape and semantics are documented here and in source so review is concrete. Do not start duplicate M2-27 work.
