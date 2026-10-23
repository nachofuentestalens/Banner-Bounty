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
