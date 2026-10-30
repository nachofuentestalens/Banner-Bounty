# M2 closure verification

Task: `279a9824-633f-43d4-9163-e0271d770ab4`. Date: 2026-10-30.
Result: **partial; acceptance withheld**. Director owns the final verdict.
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
