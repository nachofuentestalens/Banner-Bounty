# M2 closure verification

Task: `279a9824-633f-43d4-9163-e0271d770ab4`. Date: 2026-10-30.
Result: **partial acceptance; QA evidence submission complete; acceptance withheld**.
Director owns the final verdict. Latest phase: **2026-11-06**, mechanics, gear,
bounded current UI/area regression and visual review completed. The Phase 3 final
ledger supersedes earlier pending-work lists; failures and coverage limits remain explicit.
Source revision/base: `ba5c431db8d47da8401cdfc21526a57df8f21fab`.
Assigned branch: `agent/task-279a9824-633f-43d4-9163-e0271d770ab4`; unchanged.

## Phase 1: prerequisites, build and original replay regressions

Read root AGENTS.md, the frozen M2 milestone, M2-30 verdict, prior QA reports,
acceptance, architecture, dashboard guide and latest decisions. The specific M2
closure assignment supersedes the generic M1-15 role brief. No game source changed.
Two existing scripts now accept optional artifact-output environment variables;
their default behavior and assertions remain unchanged. Historical evidence is preserved.

Read-only GET `/api/projects/c6faaeda-b5c2-4d67-b351-1e1dd9f594a7/delivery`
on `http://127.0.0.1:5190` reports this approved baseline and integrated prerequisites:

| Task | Checkpoint |
| --- | --- |
| F01 `94444bf3-9cf6-4b17-8758-abab87c3acd1` | `526effd349fa43ef7386213126ae196464b6a741` |
| F02 `952bfce2-c546-4460-915f-4a7c84da33d1` | `5703febe5af7724ec92c6d9e269984c931fb9dc6` |
| M2-29 `a867fc75-35b7-4c84-aeec-c83e9510d66f` | `1cd836668a18f66e6ad5c3e34b0383b690f6b774` |

All commands below ran from the repository root unless noted.

| Exact command | Result |
| --- | --- |
| `git status --short`; `git rev-parse HEAD`; `git branch --show-current` | Initially clean; revision and branch above. |
| `git ls-files --error-unmatch design/studio/reports/M2-30.md design/studio/milestones/M2.md qa/reports/M2-29.md qa/reports/M2-29-resume.md` | Exit 0, all four required inputs tracked. |
| `npm ci` | Exit 0; 189 packages installed; audit reports one moderate and one high vulnerability. No dependency changes attempted. |
| `npm run build` | Exit 0; all five workspace builds pass. This is build evidence, not acceptance. |
| `$env:QA_ROSTER_OUT='qa/artifacts/M2-closure/roster'; node tests/e2e/m2-roster-browser.mjs` | Exit 0; six-hero roster, dual-class loadout and same-save lifecycle restart assertions pass; battle row labels present. |
| `$env:QA_BATTLE_OUT='qa/artifacts/M2-closure/battles'; node tests/e2e/m2-battle-browser.mjs` | Exit 0; seven fights, 147 event-step/HP/feed assertions; 39 application-duration observations, zero findings. Each fight gives 1/4 events at 1x/4x, stable pause, correct skip HP and no 390px horizontal overflow. |
| `git diff --stat ba5c431db8d47da8401cdfc21526a57df8f21fab` | Before adding this report, only two one-line output-path changes. New artifacts inspected separately. |

The optional `qa/AGENTS.md` read failed because that file does not exist; root instructions
and supplied QA instructions apply. No command was permission-refused. Some initial combined
read output was truncated; do not infer complete inspection from those reads.

## Acceptance ledger

| Check | Evidence and remaining work |
| --- | --- |
| 1 Recruitment | PASS fresh browser: six heroes and six classes, five formation slots. |
| 2 Classes/loadout | PASS bounded fresh browser: Vanguard/Cleric active/passive selections survive navigation and graceful in-process server close/reopen on the same SQLite save. Not a combined OS-restart loadout test. |
| 3 Formation | PARTIAL closure: five slots persist; independently viewed `roster/five-party-battle-1280.png` shows Vanguard/Ranger/Arcanist front and Cleric/Herald back in labeled groups. Same x coordinates are expected in the vertical layout. Cross-mode/control formation assertions remain. |
| 4 Unit state | PARTIAL: exact names/HP and 39 application duration badges pass across seven fights. Enemy role/type labels and status expiry across controls still need inspection. Boss screenshot displays Tollkeeper name but no separate class/role line. |
| 5 Feed | PASS bounded fresh run: 147 events across expedition, boss, four dungeon floors and arena; actor/target/known skill names, nonzero amounts, healing and deaths checked. No invented delta for zero-effect events. |
| 6 Playback | PARTIAL: exact event steps, HP, pause, restart, 1x/4x and skip pass in all seven fights. One step means one recorded event. Full status state across these controls remains. |
| 7 Tactics | Historical evidence reconciled below; no new tactical run this phase. |
| 8 Mechanics | OPEN: precise buff/stat arithmetic, cooldown and threat evidence still required; application-duration fix passes the original regression only. |
| 9 Gear | OPEN: actual same-item/same-rarity drops and equipped rarity/affixes remain to verify. |
| 10 Craft/reforge | OPEN: exact cost, affix and equipped-stat deltas into next-fight snapshot remain. |
| 11 Content | PASS scoped fresh browser: both unlocked areas selectable/persisted; four dungeon floors ending in boss use shared replay. Cross-cutting checks 3/4/6 remain partial. |
| 12 M1 regression | OPEN: single-hero improvement or honest failure, retained contrast and full area contract remain; historical isolation/retry/offline/restart/keyboard results are attributed to M2-29, not rerun here. |

## Check 7 reconciliation

The preserved `qa/artifacts/M2-29/mechanics/check7-outcomes.json` records balanced
**win, 6 rounds, 176 allied HP** (74+34+68) and noHealerTank **win, 4 rounds,
130 allied HP** (40+64+26). The prior prose's 8 rounds does not describe this saved
artifact and is superseded for that run. Neither remaining HP alone nor differing
round counts establishes equal-power tactical superiority; base HP/power differ.
M2-30 attributes stronger level-3 dungeon contrast to the later simulation matrix;
that is historical evidence, not independently rerun in this phase.

## Artifacts, limitations and next phase

Fresh outputs live in `qa/artifacts/M2-closure/roster/` and `battles/`.
`battles/observations.json` records per-mode counts, seeds and empty findings;
the report/feed JSON files preserve actual events. Boss seed `01429f20`, arena
seed `d1952ab8b7a5ef33`; expedition/dungeon reports expose empty seeds, so their
retained reports do not constitute captured reproducible seeds. Setup uses injected
time and bounded earned progression; it does not establish natural pacing.
Only the five-party boss screenshot was independently visually inspected this phase;
other image files are captures, not yet visual acceptance evidence.

No P0/P1 defect was reproduced in these bounded checks; absence of all such defects
is not established. Dependency audit findings are unresolved install diagnostics,
not a demonstrated gameplay vulnerability. The original F01/F02 regressions pass,
but closure requires the remaining status/control, formation and mechanics evidence.

Next: continue this same task with targeted status/formation assertions, checks 8-10/12,
visual inspection and final ledger. Do not create replacement fix tasks or advance
to a Director acceptance verdict from this partial report.

Runtime left running: hidden node PID 1996680, `http://127.0.0.1:3299/`, scratch
`qa/artifacts/M2-closure/playtest.sqlite`. Launch command: `$env:DB_PATH=Join-Path
(Get-Location) 'qa/artifacts/M2-closure/playtest.sqlite'; $env:API_PORT='3299';
$p=Start-Process node -ArgumentList 'apps/server/dist/main.js' -WorkingDirectory
(Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput
'qa/artifacts/M2-closure/server.stdout.log' -RedirectStandardError
'qa/artifacts/M2-closure/server.stderr.log' -PassThru; $p.Id`.
`Invoke-RestMethod http://127.0.0.1:3299/health` returned ok/schemaVersion 4.
`git diff --check` passed (line-ending warnings only); base diff inspection confirms
only QA script output routing, this partial report and fresh artifacts, with no game edits.

## Phase 2: refreshed baseline and complete replay-position checks (2026-11-06)

Source HEAD `a299bc388a658ebfe195b81507c8be0a0305fdc0`; assigned branch unchanged.
The baseline refresh includes first-session UI changes. Phase 1 screenshots and
end-to-end results remain historical; they are not fresh runs of those new flows.
Read the current M2 milestone acceptance, M2-30 closure instructions, M2-29 and its
resume companion, F02 reconciliation, acceptance, architecture, latest decisions,
and the relevant replay implementation/status-duration contract. Some combined
reads were truncated; relevant sections were subsequently selected narrowly.

The current reconciliation prose still calls F01 unfixed. Git ancestry and the
current browser observations below contradict that stale description: all three
required checkpoint hashes are ancestors of this HEAD and rows are rendered.
No prerequisite was authored here and no dashboard task was created or closed.

### Commands and results

All commands ran from the repository root.

| Exact command | Observed result |
| --- | --- |
| `git branch --show-current`; `git rev-parse HEAD` | Assigned task branch; HEAD above. |
| `git ls-files --error-unmatch design/studio/reports/M2-30.md design/studio/milestones/M2.md qa/reports/M2-29.md qa/reports/M2-29-resume.md` | Exit 0; all required inputs tracked. |
| `git merge-base --is-ancestor 526effd349fa43ef7386213126ae196464b6a741 HEAD` | Exit 0: F01 checkpoint integrated. |
| `git merge-base --is-ancestor 5703febe5af7724ec92c6d9e269984c931fb9dc6 HEAD` | Exit 0: F02 checkpoint integrated. |
| `git merge-base --is-ancestor 1cd836668a18f66e6ad5c3e34b0383b690f6b774 HEAD` | Exit 0: prior QA checkpoint integrated. |
| `git diff --name-only ba5c431db8d47da8401cdfc21526a57df8f21fab HEAD -- apps/server packages` | Empty: no server/engine/content changes since Phase 1. Historical server regression attribution remains explicit; no unnecessary rerun this phase. |
| `node tests/e2e/m2-closure-replay.mjs` (initial attempt) | Exit 1 after expedition/boss: test locator ambiguity for two Aqueduct Husks. Test identified cards by nonunique name. Corrected to side plus sorted slot, with independent name/row assertions; not a game defect. |
| `node tests/e2e/m2-closure-replay.mjs` (corrected attempt) | Exit 0: 275 positions, 29 explicit expiration events, 13 refresh events, zero status mismatches and zero browser page errors across eight reports. |
| `npm run build` | Exit 0: contracts, game, content, server and web builds succeed on refreshed baseline. Vite reported a dist HTML reload while the separate source-component harness was running; all subsequent assertions completed. |
| `git diff --stat 1f0c881ff2538f9173b6558ee9ea01de48404443`; `git diff --numstat 1f0c881ff2538f9173b6558ee9ea01de48404443 -- tests/e2e qa/reports` | Prior task changes consist of preserved QA captures/report and two optional output-directory overrides. New untracked Phase 2 files inspected separately. No production source edits. |
| `git diff --check` | Exit 0 before final report append; repeated after final edits below. |
| `Invoke-RestMethod http://127.0.0.1:3299/health` | Old Phase 1 runtime no longer reachable; restarted below. This is not proof of a game startup defect. |

No command was permission-refused. Exploratory `rg` calls using Windows glob paths
or guessed nonexistent account filenames failed; corrected to `rg --files` and
`apps/server/src/services/accountStateService.ts`. No acceptance depends on those reads.

### What the new test establishes

`tests/e2e/m2-closure-replay.html` mounts the **current production BattleView** and
stylesheet through a local Vite server. The companion `.mjs` supplies the unmodified
real Phase 1 reports, including the five-party boss report. This isolates current
presentation behavior from changed navigation and avoids replacing old evidence.
It is browser component evidence, **not** a fresh server-generated playthrough.
Expected statuses are independently tracked as round-aged effects, replaced on
refresh and removed by explicit expiry events. This checks the event contract; it
does not independently prove the engine emitted correct expiration events.

Every report checks initial state, every event step, restart, 1x/2x/4x timed progress,
pause stability, skip-to-end and the final 390px layout. At each position every unit's
HP and exact status list (names, stacks, durations and absence) is checked, together
with its front/back group by side and snapshot slot. The empty status set after
restart is checked. Control tests at speed cover early positions; every expiry and
refresh is reached by stepping, and skip checks final state. They do not claim to
pause at every possible timer boundary.

| Retained report | Positions checked | Expirations | Refreshes |
| --- | ---: | ---: | ---: |
| Expedition | 46 | 6 | 2 |
| Boss | 30 | 2 | 2 |
| Dungeon floor 1 | 27 | 3 | 0 |
| Dungeon floor 2 | 29 | 4 | 0 |
| Dungeon floor 3 | 30 | 4 | 0 |
| Dungeon boss | 39 | 4 | 2 |
| Arena | 30 | 4 | 0 |
| Five-party boss | 44 | 2 | 7 |

Fresh artifacts: `qa/artifacts/M2-closure/status-controls/observations.json` and eight
390px captures. Independently viewed `five-party-390.png`: three named heroes in
Front row and two in Back row, visible class lines, numeric HP, duration/stack badges,
playback controls and combat log disclosure. No horizontal overflow in any of the
eight DOM checks. Other seven new captures are **not independently visually reviewed**.

### Acceptance ledger updates and remaining gates

- **3 Formation:** F01 presentation regression passes current component checks across
  all retained modes/controls, including the five-hero front/back arrangement. Save
  persistence evidence is Phase 1, not rerun against redesigned Company.
- **4 Unit state:** F02 duration/refresh/expiry presentation passes the stated position
  checks. Enemy cards have `kind: enemy`, null class IDs and no `.unit-class` content
  (recorded per unit in observations). The frozen requirement says class for every
  unit on both sides; **this portion is not satisfied by the current evidence**.
  Do not invent an enemy class taxonomy or declare full check 4 passed.
- **6 Playback:** HP, status and formation remain synchronized at the tested positions
  for all controls and retained modes. Feed checks remain attributed to Phase 1.
- **8–10:** Exact buff arithmetic, equipped stat/next-fight deltas and two actual
  same-item/same-rarity drops remain pending; crafts alone do not prove drop variance.
- **12:** Literal single-hero improvement or recorded failure, retained contrast audit,
  complete area contract and current redesigned keyboard flow remain pending. Existing
  account isolation/retry/offline/restart evidence is historical. No new P0/P1 was
  demonstrated, and their absence has not been established.

Next phase stays on this task: targeted mechanics/gear and current UI regressions,
then final per-check ledger and evidence submission to the Game Director. No M2
acceptance verdict, task completion, duplicate fix task or prerequisite waiver is issued.

Runtime restored with `$env:DB_PATH=Join-Path (Get-Location)
'qa/artifacts/M2-closure/playtest.sqlite'; $env:API_PORT='3299';
$p=Start-Process node -ArgumentList 'apps/server/dist/main.js' -WorkingDirectory
(Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput
'qa/artifacts/M2-closure/server-phase2.stdout.log' -RedirectStandardError
'qa/artifacts/M2-closure/server-phase2.stderr.log' -PassThru; $p.Id`.
PID **790964**, port **3299**. Subsequent `Invoke-RestMethod
http://127.0.0.1:3299/health` returned `ok: true`, `status: ok`, `schemaVersion: 4`.
Stderr contains the Node SQLite experimental warning only. Final `git diff --check`
passes (LF/CRLF normalization warning only); `git diff --stat
1f0c881ff2538f9173b6558ee9ea01de48404443 -- apps packages` is empty.

## Phase 3: final independent evidence submission (2026-11-06)

Source HEAD: `36c38cc8c7f7ecd40063467c8377105714940992`. The assigned branch is
unchanged. All four required paths remain committed; the three prerequisite hashes
listed above remain ancestors (each `git merge-base --is-ancestor <hash> HEAD`
exited 0). `git diff --name-only a299bc388a658ebfe195b81507c8be0a0305fdc0 HEAD
-- apps packages` is empty. This phase changes QA tests/evidence only. Full task
diff inspected against the newly requested base `aa6c374336d7feac0772792aa8fe7535d0297baf`;
`git diff --stat <base> -- apps packages` is empty.

### Exact commands and observed results

Commands ran from repository root. New scripts use the built production server and
client, Chromium, isolated in-memory SQLite, and explicitly accelerated server time.
No debug endpoints or direct save edits were used. Random instance IDs are retained
in artifacts; they are not reproducible seeds. The status-math fixture uses seed
777001 and fully recorded combat inputs. No natural-pacing claim is made.

| Command | Result |
| --- | --- |
| `node tests/e2e/m2-closure-mechanics.mjs` | Exit 0. Actual drop pair, exact craft/reforge costs, changed affix, next-fight HP/ATK assertions, equipped rarity/name and narrow overflow checks pass; zero page errors. |
| `node tests/e2e/m2-closure-status-math.mjs` | Final exit 0: five numeric samples, Fortify expiry, casts in rounds 1/4, round-2 taunt redirect. First two attempts exited 1 due to QA oracle mistakes: reading pre-modifier operands as final stats, then omitting Toll Smash's multiplier. Corrected against documented rules; neither was a game defect. |
| `node tests/e2e/m2-closure-ui-area.mjs` | Final exit **1**, intentionally reflecting missing area names and unsuccessful literal solo improvement. Eleven keyboard activations, no page errors, four narrow-screen overflow assertions, area lifecycle/error/retry checks completed. Initial diagnostic attempt exited 0 despite recorded findings and its UI collection hit a stale revision after API setup; fixed the test to refresh, assert HTTP 200 for keyboard collection, and return nonzero for unmet checks. Only final captures are evidence for successful UI collection. |
| `node scripts/audit-contrast.mjs --json` | Exit 0. Existing token-pair audit passes; disabled text cases remain explicitly exempt. Retained border ratios 3.62:1 on screen / 3.27:1 on panels; focus 8.24–10.27:1. This is the retained M2-08 audit, not a complete contrast audit of every new component/gradient. |
| `npm run test --workspace=@banner-and-bounty/server -- src/db/migrations.test.ts` | Exit 0; 5/5 existing migration tests, including legacy account migration to `area_old_road`. Engineering test evidence, not an independent browser migration walkthrough. |
| `Invoke-RestMethod http://127.0.0.1:3299/health` | Prior runtime unreachable; restored below, then ok/schemaVersion 4. No startup defect inferred from an absent process between sessions. |

No command was permission-refused. Narrow exploratory reads of guessed stat filenames
and a Windows recursive glob failed; corrected to actual paths. Some long document
reads were truncated; operative numeric and contract sections were read separately.
No broad build rerun: production files have not changed since the successful Phase 2 build.

### Mechanics and gear observations

- **Exact status arithmetic:** independent constants from classes.md: level-5 Vanguard
  base DEF10, Thick Hide floor(10×1.15)=11, Fortify floor(11×1.30)=14. Enemy ATK26
  with Weaken becomes floor(26×0.70)=18. Recorded operands, base damage, Toll Smash
  and final critical multiplier match in five hits; Fortify expires for round 3
  (DEF11), then recasts round 4 (DEF14). Bulwark calls occur rounds 1 and 4, never
  during its intervening cooldown. Round-2 boss attack selects tank slot 1 over
  bait slot 0 under taunt. This is seeded engine evidence, combined with Phase 2's
  browser status/control evidence, not a claim that a browser can issue illegal combat casts.
- **Real drops:** 100 retained expedition drops include two uncommon
  `item_weapon_longspear` instances with the same Vigor affix at +4 and +3, both
  collected in batch 0 before any craft. See `mechanics-current/actual-drops.json`.
  Batches were bounded eight-hour settlements, not naturally elapsed play.
- **Craft/reforge:** uncommon Shortsword costs exactly 100 gold/4 scrap; reforge
  costs 50 gold/2 scrap with sigil/core unchanged. Warding +2 becomes Power +2.
  The full bag consumes the explicitly selected replacement item, recorded in the
  craft response. All resources were earned from commands, including dungeon floors.
- **Next fight:** same capped Ranger, solo formation, no equipment before test.
  Unequipped report: HP68 and attack operand27. Reforged Shortsword adds base ATK3
  plus Power2: following report HP68 and attack32. Both full reports retained in
  `mechanics-current/gear-next-fight.json`. No intervening level growth at cap.
  DEF/SPD deltas are not asserted; this item changes neither. Inventory shows
  `Shortsword of Power (Uncommon)`, Ranger weapon ownership and Unequip. Affix
  numeric values are not displayed in that row; do not imply a numeric UI comparison.

### Current UI, area contract and visual review

`ui-area-current/observations.json` records Tab/Enter activation with nonzero visible
outlines for company selection, Expedition, Start, Collect, Stop, Company, Inventory,
Codex and repeated Expedition navigation. API setup selects the single hero; this
does not certify keyboard formation editing, every guide action, or every loadout/
crafting control. The successful UI collection receives HTTP 200 and shows a retained
fight and spoils panel. At 390px Company, Inventory, Codex and Expedition fit without
horizontal overflow. Keyboard checks are fresh but bounded; historic full keyboard,
reconnect and two-context tests are not relabelled as fresh redesigned-flow evidence.

Solo experiment: fresh level-1 Vanguard alone, 20 API-settled one-minute cycles plus
one successfully keyboard-collected cycle. Level1/XP0/gold0 remain unchanged; final
spoils show zero wins/one loss for that UI cycle. The literal improvement criterion
is **not met**. This is a bounded observed failure, not proof every solo build fails
or a P0/P1 defect. The earlier three-hero substitution is not used as a pass.

Area tests establish authenticated read-only listing, fresh starter selection,
unauthenticated 401, unknown 404/not_found, locked 403/forbidden, active switch
409/active_expedition with unchanged state, boss-earned unlock, successful selection,
identical retry response, stale-revision 409 and the selected area frozen into a new
expedition. Existing migration tests cover the legacy starter default. **The complete
M2-01 contract does not pass:** `/areas` omits `name`, required by contracts.md's
AreaSummaryDTO. Internal-failure injection, area-specific two-account persistence and
OS-restart selection were not independently exercised here.

Visually inspected this phase: all seven previously unreviewed `status-controls/*-390.png`
captures; fresh `ui-area-current/solo-1280.png`, Company/Inventory/Codex and unlocked
areas at 390px. Text, numeric HP, row labels and controls remain visible in those
captures. Arena opponents display UUIDs without class lines in the retained report.
The long full-inventory image is too tall to judge affix text at preview scale;
its equipped-row text/rarity has DOM evidence, not independent fine-print visual QA.
The five-party narrow image was inspected in Phase 2. No claim of exhaustive visual
acceptance is made for every earlier Phase 1 screenshot.

### Final twelve-check ledger (supersedes prior ledgers)

| Check | Result and evidence boundary |
| --- | --- |
| 1 Recruitment | PASS, Phase 1 six-hero browser roster; not rerun through every redesigned control. |
| 2 Dual class/loadout | PASS bounded, Phase 1 persisted choices and same-save lifecycle; combined abrupt OS restart/loadout test remains unperformed. |
| 3 Formation | PASS bounded: Phase 1 persistence plus Phase 2 current component all-mode rows/controls. F01 original regression resolved. |
| 4 Complete unit state | **FAIL/P2:** F02 duration/expiry regression resolved; enemy labels remain absent, retained arena opponent names are UUIDs. |
| 5 Feed | PASS scoped Phase 1 event/amount/death checks; labels inherit check 4 limitations. |
| 6 Playback | PASS scoped current component: 275 positions, all modes and listed controls, HP/status/formation synchronized. |
| 7 Tactics | PASS bounded historical evidence per Director, with the explicit artifact reconciliation above; no new normalized tactical experiment. |
| 8 Mechanics | PASS bounded: fresh exact engine arithmetic/cooldown/taunt fixture plus current browser status/control observations; not all skills/builds. |
| 9 Gear | PASS for literal same-item/same-rarity drop variance and equipped rarity/affix name. Numeric affix UI display not established. |
| 10 Craft/reforge | PASS bounded: exact spending, affix change, HP unchanged and +5 ATK in next fight recorded. |
| 11 Areas/dungeons | PASS content coverage: two areas and four-floor dungeon/boss; full view acceptance conditional on check 4. |
| 12 M1 regression | **PARTIAL/criterion unmet:** literal solo improvement fails; area-name contract discrepancy. Retained contrast audit passes; fresh keyboard coverage bounded as above. |

### Reproducible findings and unresolved limits

1. **P2 — incomplete opponent identification (check 4, existing M2-30 concern).**
   Render retained boss/dungeon/arena reports with `m2-closure-replay.mjs`; enemy
   cards omit a role/type line, arena cards show UUID names without classes.
   Reproduced in inspected captures and Phase 2 DOM records. Expected: meaningful
   names and honest role/type/class information, without inventing enemy classes.
   Impact: weakens fight readability; HP/events remain available. Arena evidence is
   retained-report compatibility, not proof about freshly published current snapshots.
2. **P2 — `/areas` contract missing names.** Select Company A, GET `/areas`;
   both entries contain only areaId/unlocked/isSelected. Expected `name` per frozen
   M2-01 contract. Reproduced in both fresh closure UI/area runs. Browser resolves
   local display names, so no blocked player action was observed. Needs Engineering/
   CTO reconciliation in existing closure work; not a waiver by QA.
3. **Acceptance gap — literal solo improvement.** Repro and limits above. Director
   must retain the failed criterion or explicitly dispose its scope; QA does not
   authorize balance changes or substitute the default-party result.

Historical account isolation, concurrent identical retries, offline cap and abrupt
restart evidence remains attributed to M2-29/M2-30's exact commands. Server/packages
are unchanged since Phase 1; those suites were not rerun in this phase. No new P0/P1
was reproduced, but this bounded submission does not establish their global absence.
Dependency audit diagnostics from Phase 1 remain unresolved. No duplicate backlog
or engineering task was created and no game source changed.

**Next existing task:** Game Director M2-30 / M2 closure gate reviews this completed
QA evidence submission, owns the acceptance verdict and routes these remaining
findings through existing work. QA recommends withholding full M2 acceptance.

Runtime restored using the Phase 2 launch command with logs renamed
`server-phase3.stdout.log` / `server-phase3.stderr.log`, same scratch save and port.
Hidden node PID **695996**; health subsequently returned ok/schemaVersion4. The
launcher command returned an ongoing shell session after printing the PID; the
server itself responds. Final `git diff --check` exited 0 (line-ending warning only);
`git status --short` confirms only permitted QA report/test/artifact changes. Final
health check again returned ok/schemaVersion4. New untracked scripts/artifacts were
inspected separately from the tracked base diff; dashboard checkpointing is pending.
