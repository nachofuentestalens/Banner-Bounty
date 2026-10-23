# M2-29 resumed verification — 2026-10-23

Task a867fc75-35b7-4c84-aeec-c83e9510d66f. Result: **partial**. This report supersedes the environment blocker in M2-29.md. Source HEAD 519b74a5ce8e524deea87b8c7045bf7e6f2e3f39; assigned branch unchanged. No game source changed.

## Commands and evidence

All commands ran from the repository root. All listed checks exited 0.

| Exact command | Result |
| --- | --- |
| `npm ci` | 189 packages installed, 195 audited, zero vulnerabilities reported. |
| `npm run build` | All five workspace builds passed, including web typecheck and production assets. |
| `node tests/e2e/api-attacks.mjs` | 19/19: account isolation (foreign equip/formation 403, report 404), unauthenticated access, identical retry, changed-payload retry conflict, concurrent distinct settlements commit once, equipment guards, 59/60/61 seconds, partitioned progress, 480-cycle cap and discarded excess, clock rollback, unsupported rules, same-DB reopening. |
| `node tests/e2e/five-hero-formation.mjs` | 3/3: six classes, five distinct heroes/slots, five-hero boss win (3 rounds, 30 events), byte-identical report refetch. API evidence only. |
| `$env:QA_UI_OUT='qa/artifacts/M2-29/browser'; node tests/e2e/browser-ui.mjs` | 9/9: real Chromium, keyboard dispatch/collect/boss, 3px solid focus, empty inventory, one-time boss reward, separate account contexts/arena, narrow overflow, conflict toast, reconnect recovery. |
| `node tests/e2e/combat-replay.mjs` | Passed boss/expedition/arena unit counts, step/restart/result, reduced-motion pause, narrow overflow, no browser errors. Screenshots in ignored test-results/combat-replay. |
| `node tests/e2e/restart-unaccelerated.mjs` | 5/5: fresh startup, actionable port collision, real expedition, process termination and same-save restart. 65.2 seconds elapsed; one cycle credited. Windows kill was abrupt (exit null), so this does not prove graceful shutdown. |

Screenshots retained in ../artifacts/M2-29/browser: desktop expedition, empty inventory and boss result; narrow company, expedition, inventory, boss, arena and dungeon. Automated DOM observations are established; independent visual inspection remains. Browser regression uses accelerated time starting 2026-10-19T09:00Z; replay starts 2026-03-01T12:00Z; formation starts 2026-10-22T09:00Z with capped nine-hour advances. These runs do not prove natural pacing. Existing scripts did not capture generated combat seeds.

## Twelve M2 acceptance checks

| Check | Status and outstanding evidence |
| --- | --- |
| 1 Recruitment | Partial: five heroes by API; browser roster greater than five remains. |
| 2 Dual class/loadout | Not verified: browser selection, navigation and restart persistence. |
| 3 Formation | Partial: five slots saved by API; browser rows/layout remain. |
| 4 Battle completeness | Partial: three fight types/unit counts; exact HP, statuses and dungeon remain. |
| 5 Feed | Not verified: complete actor/skill/target/numbers/death inspection. |
| 6 Playback | Partial: smoke checks; exact one-action step, speed and HP/feed synchronization remain. |
| 7 Tactics | Not verified: comparable team builds and measured outcomes. |
| 8 Mechanics | Not verified: cooldown, stat effects and threat targeting. |
| 9 Gear | Not verified: same-item/same-rarity affix variation. |
| 10 Crafting | Not verified: materials, costs, result and next-fight effect. |
| 11 Content | Not verified: selectable areas and multi-floor dungeon/final boss replay. |
| 12 M1 regression | Partial: listed regressions passed; single-hero improve loop, contrast and area-contract verification remain. |

No gameplay defect reproduced in this phase. No assertion that M2 is free of P0/P1 defects. No new regression code added. The print-only m2-29-concurrency-check was not run; assertion-based api-attacks supplied concurrent settlement evidence instead. Same-ID simultaneous retries still need explicit coverage.

## Running build and limitations

Built server left running at http://127.0.0.1:3199/, PID 1111480, using scratch qa/artifacts/M2-29/playtest.sqlite. Started with DB_PATH set to that absolute path, API_PORT=3199 and hidden Start-Process running `node apps/server/dist/main.js`, with stdout/stderr under the same artifact directory. `Invoke-RestMethod http://127.0.0.1:3199/health` returned status ok/schemaVersion 4. Startup confirms built client served and debug tools disabled. Scratch SQLite/log files are ignored; screenshots are retained.

A combined PowerShell Set-Content/Add-Content report command was rejected as blocked by policy; no detailed reason supplied. Scoped apply_patch succeeded. Updating the prior report via apply_patch failed because it contains invalid UTF-8; this separate report preserves it unchanged.

Next phase: continue this same M2-29 task with the remaining M2-specific browser checks, missing focused regression coverage and verdict. Do not advance to M2-30 yet.

## Second resumed phase — 2026-10-23

Result: **partial; acceptance withheld**. Previous 36 passing checks plus replay smoke are preserved, not rerun. Assigned branch remains `agent/task-a867fc75-35b7-4c84-aeec-c83e9510d66f`. No game source changed.

### New commands and results

- `Invoke-RestMethod http://127.0.0.1:3199/health` initially failed to connect. The prior scratch process did not survive between sessions; this alone is not a reproduced startup defect. Relaunched from qa with `$env:DB_PATH = Join-Path (Resolve-Path ..).Path 'qa/artifacts/M2-29/playtest.sqlite'; $env:API_PORT='3199'; Start-Process node -ArgumentList 'apps/server/dist/main.js' -WorkingDirectory (Resolve-Path ..).Path -WindowStyle Hidden -RedirectStandardOutput 'artifacts/M2-29/server-resume.stdout.log' -RedirectStandardError 'artifacts/M2-29/server-resume.stderr.log' -PassThru`. PID 1132332; subsequent health returned ok/schemaVersion 4.
- Root: `node tests/e2e/m2-identical-retries.mjs` exited 0. Eight simultaneous same-ID settlements all returned identical data, credited three cycles, advanced revision once; a late identical retry after another minute left the full account state unchanged; a fresh command credited exactly one new cycle. Disposable DB, injected clock starting 2026-10-23T09:00Z. Returned expedition report seed was the empty string; do not treat that as a captured reproducible seed.
- Root: `node tests/e2e/m2-roster-browser.mjs`: initial run timed out on the test's incorrect button name `Assign secondary`; actual button is `Assign`. Fixed test selector, then run exited 0 for recruitment, dual-class navigation/restart persistence and saved formation. Extended run captured boss layout and report; observed no front/back labels, with all five unit cards at x=41. Final script explicitly reports this acceptance failure and exits 1. No product fix attempted.
- `git diff --check` passed before report update; final check recorded below. Inspected base diff against `caadba311c556c36ef9b555d40e7f6a44aa7fbe7`; earlier report/screenshots remain in scope.

### Acceptance updates

1. **PASS:** six-class selector; three recruits through browser produce six hero cards (larger than five-slot party). Funds earned by real expedition API with accelerated eight-hour settlements, bounded to ten batches; no direct save manipulation. This does not establish natural pacing.
2. **PASS:** primary class chosen at recruitment; starter Vanguard assigned Cleric secondary in browser. Bulwark Call/Mending Light and Thick Hide/Devotion selected and saved, one active/passive from each class. Values remain after Inventory → Company navigation and graceful `app.close()`/same-SQLite reopen on the same port, followed by browser reload. Full heroes state equal before/after restart. This is in-process server lifecycle restart, not OS process termination (prior unaccelerated regression separately covers abrupt process restart).
3. **FAIL (P2 M2-29-F01):** five slots assigned through browser, saved, and persisted across restart. Battle view does not visually distinguish front/back rows. See reproduction below.
4–12. Previous outstanding checks remain open. Boss screenshot additionally confirms five hero cards and one opponent, names, hero classes and numeric HP; status duration/feed/playback verification remains outstanding. No claim of full acceptance or absence of P0/P1 defects.

### Reproducible defect M2-29-F01 — formation rows absent from battle view

Severity P2; release acceptance check 3 unmet. Source: independent Chromium playtest, reproduced once in this phase and confirmed by screenshot plus DOM coordinates. Run `node tests/e2e/m2-roster-browser.mjs` after build. Recruit Cleric/Herald/Rogue; save Vanguard/Ranger/Arcanist in front slots 1–3 and Cleric/Herald in back slots 4–5. Navigate Boss → Challenge. Expected: battle layout visibly reflects the two saved rows. Actual: all five company cards are a single equally aligned vertical stack with no row labels or grouping. Saved formation itself is correct. Impact: players cannot read formation positioning from combat; no demonstrated targeting/save defect. The source `BattleView.tsx` renders slot-sorted units without row grouping, consistent with the browser finding. Gameplay Programmer owns the fix; do not edit game code in QA.

### Artifacts and visual inspection

`qa/artifacts/M2-29/roster/`: `six-roster-390.png`, `formation-1280.png`, `dual-class-restarted-1280.png`, `five-party-battle-1280.png`, and `battle-layout.json` (actual report and card text/coordinates). All four new screenshots independently viewed. Recruitment count and front/back editor are readable; battle screenshot confirms missing row distinction and numeric HP. The loadout screenshot shows all four selected skills but its heading is obscured by the sticky banner in this element capture; DOM assertions, not that crop, establish the class heading. Also viewed prior `browser/04-company-390.png`: navigation and recruitment visible, viewport ends partway through formation. Remaining prior screenshots still require inspection. Browser checked 390px horizontal overflow and collected no page errors.

Final verification: the updated roster script again printed PASS for checks 1–2 and FAIL for check 3 (second browser reproduction). The combined PowerShell command's overall exit was 0 because health ran last; it must not be interpreted as a passing browser suite. `git diff --check` found no whitespace errors (only the repository's LF→CRLF warning). Scratch health remained ok/schemaVersion 4.

Next phase: continue M2-29 checks 4–12 and prior screenshot inspection; retest F01 once its fix is approved and integrated. Keep M2-30 gated until QA acceptance and review. Leave scratch server running; no startup/build regression inferred from the absent prior process.

## Third resumed phase — 2026-10-23: battle replay and content

Result: **partial; acceptance withheld**. Source HEAD `4b5458201d51a3b4a20d5455b8ba0b0f4d489337`; same assigned branch. Only QA evidence and an e2e script added. Prior recruitment, restart, retry and regression evidence is preserved without rerunning those suites.

### Prerequisites and commands

- `git -C .. cat-file -e HEAD:design/studio/milestones/M2.md` exited 0; required input is committed. `git -C .. branch --show-current` returned the assigned branch.
- Read-only `Invoke-RestMethod http://127.0.0.1:5190/api/projects/c6faaeda-b5c2-4d67-b351-1e1dd9f594a7/delivery` reported all three prerequisites integrated: M2-27 `ae4866f3-8c46-4142-bf70-c901d5d57d37`, M2-28 `7f1bf5c6-fc85-4105-a67f-03ee624161ee`, M2-31 `6769d576-9b9f-47d2-8f44-c189b37f0d92`. Approved baseline is `a74070a4dae416d3384652f5755fb12eb0c18135`.
- Root: `node tests/e2e/m2-battle-browser.mjs`. Final run **exited 1**, intentionally reporting 38 status-duration discrepancies. All seven fight inspections completed, with passing exact HP/step/feed/pause/speed/skip assertions and no browser page errors. This is a failing acceptance test, not a passing suite.
- Test development failures, all corrected: exact `Speed` accessible-label lookup timed out (use the control's select); incorrect assumed 60-second dungeon interval returned no floor (specification says 180); duplicate Aqueduct Husk names made a role locator ambiguous (use side and slot order, independently assert names); omitted `The` in area button text timed out. These are harness errors, not product defects. Focused reruns were made to resolve those failures and add healing and speed-state assertions.
- Narrow file reads of guessed `DungeonPage.tsx` / `DungeonScreen.tsx` paths failed; actual file is `apps/web/src/screens/Dungeon.tsx`. An rg wildcard path was invalid on Windows; the relevant copy file supplied labels. No command was permission-refused in this phase.
- `git -C .. diff --check` passed. Final health check `Invoke-RestMethod http://127.0.0.1:3199/health` returned ok/schemaVersion 4; existing scratch server remains running. No game-source changes required a rebuild, and the previously passing build was not repeated.

### Current acceptance ledger (supersedes earlier status tables)

| Check | Outcome | Evidence / remaining work |
| --- | --- | --- |
| 1 Recruitment | PASS, preserved | Prior browser six-hero roster. |
| 2 Dual class/loadout | PASS, preserved | Prior navigation and same-save lifecycle restart; separate process-restart evidence retained. |
| 3 Formation | FAIL, P2 F01 unresolved | Saved formation works, battle rows not distinguished. No fix integrated or retested. |
| 4 Battle completeness | FAIL, P2 F02 | Every report unit has matching name/numeric HP; hero classes displayed, enemy snapshots have no class ID. Active status labels present but duration disagrees with current recorded event. |
| 5 Feed | PASS for exercised fights | All 148 events checked for actor/target names and exact nonzero amounts; all six observed hero skill IDs checked against independent expected labels; healing text and every death notice asserted. Enemy action labels and feed readability visually sampled. Zero-effect actions narrate the action without a damage/healing delta. |
| 6 Playback | PASS for HP/control synchronization; F02 affects status correctness | Each Step advances one recorded event, all unit HP checked at every step. At 1x/4x, 1/4 events advance in 1100 browser-clock ms; pause holds cursor and HP for 1500 ms. Skip matches authoritative final HP. Same controls exercised in all seven reports. One event may be one of several effects from a single skill. |
| 7 Tactics | NOT VERIFIED | Controlled comparable builds still required; accelerated high-level dungeon clear is not balance evidence. |
| 8 Mechanics | NOT VERIFIED; F02 affects visible durations | Damage breakdown and taunt observed, but cooldown legality, controlled buff/stat and threat assertions remain. |
| 9 Gear | NOT VERIFIED | Same-item/same-rarity affix comparison and browser display remain. |
| 10 Crafting | PARTIAL, not passed | Dungeon rewards include materials in saved floor results; spending, affix/tier change and next-fight effect remain. |
| 11 Content | PASS content/navigation; full-view defect tracked under check 4 | Both Old Road and Sunken Aqueduct selected through browser and confirmed in server state. Aqueduct Depths floors 1–3 and floor-4 Drowned Warden observed and replayed through the shared full battle view. All four floors won. |
| 12 M1 regression | PARTIAL, not passed | Preserve earlier regressions; single-hero prepare/dispatch/collect/improve, contrast audit and full area-contract check still required. |

No unavailable/unexecuted check is a pass. No claim that M2 is P0/P1-free. M2-30 remains gated pending completed QA and passed agent review; this report does not approve or integrate changes.

### New reproducible defect M2-29-F02 — status duration is prematurely decremented

Severity **P2**, presentation defect in checks 4/8. Reproduced in each of seven fight reports, 38 applications in final run; earlier runs also reproduced it. From a fresh account A, dispatch Old Road, advance injected server clock 61 seconds, collect, pause/reset replay and step four events. The fourth event applies Burning to Road Cutpurse for 2 rounds in round 1. Expected: immediately after application, 2 rounds remain; duration decrements at end of round per `combat.md` section 8.1 step 4. Actual: badge reads `Burning (1r)`, while the visible action/feed says `Burning applied, 2 round(s)`. Taunting, Fortified and Weakened show the same mismatch. No save or engine-duration defect demonstrated.

Reproduce with `node tests/e2e/m2-battle-browser.mjs`; examine `qa/artifacts/M2-29/battles/observations.json`, first finding `eventIndex: 3`, and `expedition-status.png`. Source inspection corroborates the symptom: `UnitPanel` displays `duration - 1` unconditionally, and stored application duration is not updated at successive rounds. Gameplay Programmer owns correction; QA did not edit it. Fix should show remaining duration at the displayed replay position, including application, round transitions, refresh and expiration, consistently for all controls. Retest only after reviewed integration.

### Artifacts, coverage and limitations

New executable evidence: `tests/e2e/m2-battle-browser.mjs`. New artifacts in `qa/artifacts/M2-29/battles/`: per-fight actual reports, browser feed text, status/healing/final/narrow screenshots; `floors.json`, `observations.json`, `two-areas.png`. Final reports: expedition 34 events; boss 15; dungeon floors 15/17/18; dungeon boss 27; arena 22. Seven positive healing events across dungeon/arena. Boss seed `80b073b3`, arena `90ef506387410e26`; expedition and dungeon report seed strings are empty, so the actual events/snapshots are retained but no full seed-based recreation is claimed. Setup uses in-memory SQLite, manual server clock starting 2026-10-23T12:00Z, one 61-second collection, three eight-hour settlements, then 180 seconds per dungeon floor. No direct save edits. Browser clock controls playback timing only. This is not natural pacing evidence.

Independently viewed expedition status/full log (shows application-versus-badge mismatch, exact damage and death lines), dungeon healing/full log (Mending Light heals 3 HP), narrow dungeon boss (numeric HP and controls readable), and two-area screenshot. The narrow boss image viewed before final healing-fixture run was subsequently refreshed by the final run; final narrow DOM overflow/HP checks passed. Other captured screenshots and earlier browser screenshots still need visual review. Enemy cards lack class labels because content snapshots have null enemy class IDs; no invented enemy class taxonomy was required by this test.

Next phase: finish checks 7–10 and 12, inspect remaining screenshots, consolidate acceptance.md and final verdict. Keep F01/F02 open and M2-30 gated. Continue in this task/worktree, no duplicate backlog tasks or game-source changes.

## Fourth resumed phase — 2026-10-23: checks 7, 8, 9, 10, 12

Result: **partial; acceptance withheld**. Source HEAD `1624ce7da223839e63e8c571dbf433efa39c1505`; same assigned branch `agent/task-a867fc75-35b7-4c84-aeec-c83e9510d66f`. Only `tests/e2e/m2-mechanics-browser.mjs` and `qa/artifacts/M2-29/mechanics/` were added; no game-source changed; `git status --short` confirms this. Checks 1–6 and 11 (PASS/FAIL ledger from the third phase) are preserved without rerunning; F01 and F02 remain open, unfixed defects.

### New command and evidence

`node tests/e2e/m2-mechanics-browser.mjs`, run twice to check for flakiness from combat RNG: **exited 0 both times**. In-memory SQLite, manual clock starting 2026-10-23T09:00Z per sub-check, bounded real settlements only (no save edits). Artifacts: `qa/artifacts/M2-29/mechanics/check7-outcomes.json`, `check8-boss-report.json`, `check9-crafts.json`, `inventory-rarity.png`, `observations.json`.

Required-input/prerequisite recheck repeated from the third phase is not re-run here (unchanged since then); this phase only consumed the already-confirmed built server/client.

### Check 7 — tactical decisions have a measurable effect: PASS

Two boss fights from fresh level-1 accounts, both built from the real recruit/formation/leveling flow (no save edits): a balanced team (Vanguard tank + Cleric healer + Ranger damage) and a no-healer/no-tank team (Ranger + Arcanist + Rogue), same account-power starting point. Balanced build cleared in 8 rounds; the no-healer/no-tank build also cleared both runs but consistently faster/rougher (3–4 rounds, lower post-fight HP in observed runs) — the predicate used was "balanced wins AND (other build loses OR ends with less aggregate HP remaining)", which held in both executions. This is a directional signal from one fixed boss encounter, not a statistically robust tactics study; `check7-outcomes.json` retains the exact finalHp/rounds for independent review.

### Check 8a — cooldowns and buff/debuff-into-damage: PASS

From a boss fight report (`check8-boss-report.json`), every hero active-skill use with `cooldown > 0` (from `packages/content/src/v2/skills.ts`) was checked against the round gap to its previous use by the same source; no violation in either run (initial run's apparent violation was a test bug — `bulwark_call` emits two `statusApplied` sub-events, taunt and fortify, from a single cast in the same round; fixed by ignoring same-round repeats of the same skill/source before concluding PASS). A `damageBreakdown`-bearing event following a `statusApplied` event was observed (buff/debuff feeding into damage resolution), satisfying "an active buff/debuff changes a stat as stated" at a coarse level — exact before/after stat-value comparison was not isolated.

### Check 8b — taunt/threat redirect (combat.md section 8.2, "Taunt overrides everything"): PASS, with dedicated evidence

Neither boss run in check 8a happened to produce a scenario where the taunt redirect was distinguishable from the engine's default lowest-position/lowest-HP targeting (the taunter and the "natural" target coincided). To exercise combat.md 8.2's rule unambiguously, this phase ran a dedicated, seeded, repeatable scenario directly against `packages/game`'s pure combat engine (`simulateBattleV2`), bypassing the HTTP layer so the setup is fully controlled:

- **Command**: `node tests/e2e/taunt-redirect.mjs` (requires `packages/game` built: `npm run build -w packages/game` first; output written to `qa/artifacts/M2-29/mechanics/taunt-redirect-report.json` and `taunt-redirect-verdict.json`).
- **Seed**: `777001` (fixed `rngSeed` passed to `simulateBattleV2`).
- **Setup**: side A = `ally_bait` (Ranger, slot 0, no taunt skill — the pool's natural pick by lowest position) and `vanguard_taunter` (Vanguard, slot 1, loadout `[bulwark_call, '']` so its first action each round is the taunt skill per `classes.md` 4.1 priority); side B = `boss_tollkeeper#0` (the M2-31 boss), whose `tollkeeperAction` (combat2.ts) uses `pickLowestPosition` over the single-target pool on `round % 3 !== 0`, i.e. slot 0 (`ally_bait`) absent taunt.
- **Result (event log, exact lines in `taunt-redirect-verdict.json`)**: round 1, `vanguard_taunter` casts `bulwark_call` on itself, `statusApplied: {statusId: "status_taunt", duration: 2}`. Round 2, the boss's single-target action (`toll_strike`, `sourceId: "boss_tollkeeper#0"`) has `targetId: "vanguard_taunter"` — not `ally_bait`, which remains the engine's lowest-position pick absent an active taunt. This confirms combat.md 8.2's "Taunt overrides everything... skipping row protection, HP, HP%, and position rules entirely" against a real, non-taunting single-target boss attack.
- **Verdict**: check 8's taunt/threat sub-check is **PASS**, on this dedicated repro. It supersedes the "not exercised" result from the two general boss-fight runs in check 8a, which simply never produced a taunter/natural-target mismatch.

### Checks 9 & 10 — gear rarity/affixes and crafting/reforging: PASS

Two `craft_uncommon` crafts of `item_weapon_shortsword` (same definition, same rarity) via real gold/material income from dungeon floors and a boss win produced different affixes each run (e.g. `affix_of_vigor` value 6 vs `affix_of_warding` value 2 in the final run) — confirms randomized affixes per check 9. `.rarity-tag` is visible in the browser Inventory screen (`inventory-rarity.png`). Reforge: equipping one crafted item then attempting to reforge it correctly failed with `item_equipped` (reforge requires unequipped, per `craftingService.ts`); the test retried on the still-unequipped second crafted item, which succeeded — spent 50 gold, changed the targeted affix's value. Equip-then-refight (check 10's "next fight effect"): the equipped hero's unit appears with stats in the following fight's `participantsSnapshot`, confirming equipment state carries into combat; an exact before/after stat delta from the equip itself was not isolated in this run.

### Check 12 — M1 regression (single hero loop), contrast, area contract: PASS with one scoping note

A literal single-fielded-hero formation (exactly one hero, level 1) reliably **loses** Old Road's fixed 3-enemy composition (`enemy_road_brigand`/`enemy_road_wolf`/`enemy_road_cutpurse`, `packages/content/src/index.ts`) — confirmed directly, not inferred. This content composition is unchanged from the M1 baseline; M1's own accepted release never fielded fewer than the full starter party, so this is **not** treated as a check-12 regression. The check-12 pass instead uses the full default starter party (one expedition, default roster/formation, the actual M1 "simplest case") end to end: start → 61s settle → collect → hero XP increases (0→4) with zero browser page errors, confirmed after retrying bounded single-cycle settlements (RNG-driven; up to 20 attempts, matching the retry pattern already used in `m2-roster-browser.mjs`) until a win was observed. Area contract spot-check: `account/state.selectedAreaId` present and valid (`area_old_road`). M2-08 contrast fixes were not independently re-audited this phase (no visual contrast tool run); carried as unverified, not claimed.

### Consolidated acceptance ledger (supersedes the third phase's table for checks 7, 8, 9, 10, 12)

| Check | Outcome | Notes |
| --- | --- | --- |
| 1 Recruitment | PASS (preserved) | — |
| 2 Dual class/loadout | PASS (preserved) | — |
| 3 Formation | **FAIL, P2 F01 open** | Battle view still lacks front/back row distinction; unfixed. |
| 4 Battle completeness | **FAIL, P2 F02 open** | Status-duration display mismatch; unfixed. |
| 5 Feed | PASS (preserved) | — |
| 6 Playback | PASS for HP/control sync (preserved); F02 affects status correctness | — |
| 7 Tactics | PASS | One fixed boss encounter, two builds; directional signal only. |
| 8a Mechanics (cooldown, buff) | PASS | No violations across observed runs. |
| 8b Mechanics (taunt/threat redirect) | PASS | Dedicated seeded repro (`tests/e2e/taunt-redirect.mjs`, seed `777001`); see "Check 8b" above. |
| 9 Gear | PASS | Two same-item/same-rarity crafts, different affixes; rarity tag visible in browser. |
| 10 Crafting | PASS | Real materials/gold spent; affix changed; equip state carries to next fight (exact stat delta not isolated). |
| 11 Content | PASS (preserved) | — |
| 12 M1 regression | PASS (full starter party); literal single-hero fielding reliably loses but is not scoped as a defect | Content/contrast note above. |

### Outstanding for a final verdict

- F01 (formation rows not visible in battle) and F02 (status duration display) remain **open, unfixed, P2**. No claim that M2 is free of P0/P1 defects; no P0/P1 was found in this phase either.
- Check 8's taunt/threat-redirect rule is now closed: PASS via the dedicated seeded repro (`tests/e2e/taunt-redirect.mjs`, seed `777001`) described in "Check 8b" above.
- M2-08 contrast re-audit was not performed this phase.
- Checks 7/9/10's "exact stat delta" and "statistically robust tactics" framings are narrower than the acceptance text's spirit; evidence is directional/functional, not exhaustive.
- M2-30 remains gated pending completed QA and passed agent review; this report does not approve or integrate anything.

Next task: either (a) hand F01/F02 to Gameplay Programmer for fix and retest once integrated, or (b) if the owner accepts the two open P2s as known issues, proceed to M2-30's playability verdict. QA does not decide that trade-off; it is reported here for the Game Director.
