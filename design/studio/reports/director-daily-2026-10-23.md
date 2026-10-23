# Director daily review — 2026-10-23 UTC

Task: `553642d9-b1ea-40f8-b3de-5aff5b72b9ac` · Game Director  
**Playtest: NOT PLAYED. M2 acceptance remains unestablished by this review.**

Reviewed commit: `9dfd8ed26492f567c29812b58f5650b31908a75f` (also task base). Interactive gameplay: **0 minutes**; review duration was not instrumented. Evidence timestamp: 11:02 UTC. This is an AI director assessment of documents and test-environment observations, not human player feedback or a substitute for M2-30.

## Current playable state against the brief

M1 remains historically accepted, with the owner's subsequent “too basic” and “boring fights” feedback still the product problem M2 must solve. The available evidence has advanced beyond the October 21 daily report: M2-27 now records server/browser integration, six-class builds, recruitment, formation, dungeon/crafting screens and a shared battle view. It reports `npm run validate` passing 198 tests and two accelerated browser walkthroughs. These are another agent's results, not commands executed today.

The skill-tooltip/damage-breakdown report additionally records accessible skill help and server-recorded damage arithmetic in the build editor and battle view, with browser checks at 1280px and 390px. This directly supports explainable preparation and combat. Its screenshots are ignored local artifacts; I did not inspect them today.

The newer simulation-matrix report materially qualifies the older M2-28 concern: `node scripts/simulate.mjs --mode=v2 --level=3` reportedly tested 32 seeds, with balanced dungeon clear rate 1 versus glass-cannon 0. Both teams still won all Old Road fights, with the damage-heavy team faster. Easy farming content need not punish an offensive build; the dungeon result is the more relevant evidence of composition value. It does not prove balanced difficulty across levels, equal effective power, or a satisfying fresh-save journey.

No independent M2-29 report was found in the bounded `design/qa` and `reports` file inventory. The Producer's codex-candidate report records M2-29/M2-30 as in progress on October 23; this is historical reported status, not a live dashboard query.

## Acceptance assessment

No check below is independently passed today.

| M2 check | Available evidence and remaining gap |
| --- | --- |
| 1. Recruitment | M2-27 labels this passed but describes only 3→4 heroes. This does not demonstrate a roster larger than five. Require at least six owned heroes. |
| 2. Dual classes/loadouts | Secondary-class selection and API round-trip reported. Independently verify six available classes, legal active/passive choices and restart persistence; reconcile primary-class selection wording with recruitment rules. |
| 3. Formation | Swapping/reloading reported; a fully fielded five-hero party with persisted front/back rows is not established by the cited steps. |
| 4. Unit panels | Numeric HP, classes and statuses reported in boss/dungeon views; verify every fight kind and visible durations independently. |
| 5. Action feed | Actor/skill/target/amount/death tests and subsequent damage-arithmetic browser evidence reported. Independent readability assessment remains open. |
| 6. Playback | Step/skip evidence reported. Shared cursor architecture alone does not prove pause, speed and state consistency across all fight kinds. |
| 7. Tactical effect | Level-three dungeon comparison now supports the intended direction; verify comparable-power builds and the same encounter/seed in the browser. |
| 8. Combat mechanics | Enforcement tests and modifier explanations reported. Independently connect cooldown, status duration and threat behavior to the visible replay. |
| 9. Rarity/affixes | Implementation reported; independently compare two same-definition, same-rarity drops and their differing affixes. |
| 10. Craft/reforge | Browser crafting reported; successful browser reforge remains explicitly untested in M2-27. The literal check permits craft **or** reforge, but reforge remains a shipped feature needing coverage. |
| 11. Areas/dungeon | Area selection and four-floor dungeon with final boss reported; independently verify selectable areas and boss replay. |
| 12. Core-loop regression | Accelerated integration walkthrough reported. Independently verify the single-hero loop, save/restart, isolation, reward integrity and contrast behavior. |

## Strongest and weakest parts

**Strongest documented qualities:** preparation now has several interacting levers, combat explanations expose actual arithmetic, and a level-appropriate dungeon comparison supports a meaningful tank/healer composition. These are stronger foundations for the owner’s requested depth than M1's feature count alone.

**Weakest evidence:** the complete newcomer journey remains unobserved here. Recruitment and five-slot acceptance claims exceed the specific examples cited. The ledger assumes fixed levels, no spending/equipping and an initially empty bag, so its income totals cannot establish time to first recruit, build choice, craft or recovery from failure.

Usability and clarity look better supported by reported tooltips and damage explanations. Perceived pacing, challenge, watchability and replay motivation remain **untested today**. Hypothesis: dense arithmetic may explain outcomes while making the action feed harder to scan; test before redesigning it. Do not treat that hypothesis as a bug or invented player feedback.

## Top three next steps

1. **Finish independent M2-29 coverage on an identified, isolated build.** Use the existing QA Tester assignment. Acceptance: record SHA, scratch save, elapsed play time and browser evidence for all twelve checks; own at least six heroes, field five, verify formation/loadouts after restart, and exercise all playback controls across expedition, dungeon/boss and arena. Include successful reforge and save/account/reward regression checks. Resolve any P0/P1 before acceptance.

2. **Close the M2-28 pacing evidence gaps using the corrected harness.** Economy Designer interprets the integrated matrix; Systems Designer reviews encounter difficulty where evidence warrants. Acceptance: compare documented legal builds at comparable power with identical seeds at relevant unlock levels; record clear rate, turns and surviving HP. Measure fresh-save time to meaningful build choices, recruitment and first craft/reforge, plus recovery and offline behavior. Preserve the owner's level-three boss-readiness decision; do not add grind to manufacture challenge.

3. **Complete M2-30 after QA and tuning evidence are available.** Acceptance: a per-check accept/conditional/reject verdict citing the integrated revision, exact evidence and unresolved issues, plus an actual director browser session or an explicit NOT PLAYED limitation. Judge whether preparation changes outcomes and replay makes those outcomes understandable. Keep M3 candidates separate until this gate is settled.

These are priorities for existing work, not new tasks or claims that approved tasks are currently running. No duplicate task or staffing change is executed.

## Milestone goals, exit criteria and needed designs

M2 remains watchable, deterministic combat with consequential classes, skills, formation and gear in the prepare → dispatch → collect → improve loop. Exit requires evidence for all twelve frozen checks, a five-hero party drawn from a larger roster, at least two selectable expedition areas, a multi-floor dungeon, crafting, no unresolved P0/P1, independent QA and the director verdict. Report completion is not milestone acceptance.

Needed design clarification is narrow: align acceptance wording with legal class selection and skill unlocks; define comparable-power tactical fixtures; assess the reported stale “exactly 3 heroes” error copy against the 1–5 formation rule. M2-27 also records automatic selection of an unequipped item for replacement when crafting into a full bag: QA should establish what the player sees before confirming and whether valuable gear can be lost unexpectedly. This is a report-derived risk, not a reproduced defect.

Keep the existing class/skill codex, class respec, deferred expedition-loadout changes and cycle-duration proposals as M3 candidates. Prioritize informed build choice and reversible experimentation if later evidence supports them. Races, seasons, tournaments and team PvP remain later; no public hosting or excluded social systems are introduced.

## Staffing recommendation

No added seats or hiring. Prioritize QA Tester’s existing hands-on verification, with QA Player providing read-only second opinions as the owner decided. Keep Economy Designer and Systems Designer focused on the remaining progression/tactical evidence; use engineering for confirmed blockers and harness gaps. Producer should reconcile evidence and prerequisite integration, rather than creating duplicate implementation tasks. Leadership edits remain serial.

## Today's commands, results and limitations

| Command/tool | Actual result |
| --- | --- |
| `git status --short` | Clean at review start. |
| `git rev-parse HEAD` | Commit recorded above. |
| `node --version`; `npm --version` | v22.14.0; 10.9.2. |
| `Test-Path node_modules`; `Test-Path apps/server/dist`; `Test-Path apps/web/dist` | All False. |
| `Test-Path apps/server/dist/main.js`; `Test-Path apps/web/dist/index.html` | Both False. |
| `rg --files design/qa reports` | Located engineering evidence and M1 acceptance document; no M2-29 report in those paths. |
| `Get-ChildItem reports/qa -Name` | Failed: directory does not exist. Subsequent bounded inventory supplied report locations. |
| `cua.getState()` | Empty apps and browsers. |
| `cua.createBrowserTab('iab', 'about:blank', {visible:false})` | Failed: “Browser is not available: iab”. |
| `git diff --stat 9dfd8ed26492f567c29812b58f5650b31908a75f` | No prior branch changes at review time. |

No command was refused by an approval gate. Installing/building would write outside this seat's permitted `design/studio/` scope, so `npm ci`, build, validate, walkthrough and simulation commands were not attempted. No server was started, no live service was interrupted, and no owner save was accessed. No interactive scenarios completed and no screenshots captured. The browser failure is an environment blocker; no reproducible game bug was established.

Concrete next playtest: QA Tester uses its existing assignment and writable task environment to install/build the identified revision, start a separate loopback server on a free non-dashboard port with a scratch `DB_PATH`, and run the M2 walkthrough through an enabled browser. Record real elapsed time separately from accelerated checks.

Evidence paths: `reports/engineering/M2-27.md`, `reports/engineering/M2-28-simulation-matrix.md`, `reports/engineering/skill-tooltips-damage-breakdown.md`, `design/game/reports/M2-28.md`, `design/studio/reports/class-skill-codex-m3-candidate.md`, and this task's tool transcript. Only this report is changed.

