# M2 closure verification

Task: `279a9824-633f-43d4-9163-e0271d770ab4`. Date: 2026-10-30.
Result: **partial; acceptance withheld**. Director owns the final verdict.
Latest resumed phase: **2026-11-06**, replay/status phase completed; mechanics and
current UI regression evidence still pending. See Phase 2 below for superseding scope.
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
