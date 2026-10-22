# M2-28 simulation matrix review fixes

Task: afca49d9-c213-441c-916e-49e3c7e771ef. Date: 2026-10-23.

## Changes

The task branch extends the v2 harness with level overrides, balanced/glass-cannon dungeon comparisons, 1/3/5-hero ledger parties, daily gold/material balances and configurable starting gold. This review correction replaces separate Old Road/dungeon bag counters with one account-wide count carried through each activity and subsequent days, matching both server services' countUnequipped(accountId). RNG streams remain independent. No production contracts or architecture change.

The ledger assumes fixed levels, an initially empty bag, no spending/equipping and Old Road followed by dungeon attempts each day. It is an income scenario, not a full fresh-save progression or crafting simulation. Starting gold represents a gold-only comparison, not a full migrated save.

## Acceptance evidence

| Review check | Evidence | Result |
| --- | --- | --- |
| Shared inventory capacity | Public-CLI regression, seed 1: 128 drops produce 100 retained items and 28 conversions across both activities | Pass |
| Gold/material accounting | Final gold 5835; scrap/sigil/core 140/28/14. Starting with 5000 gold adds exactly 5000 to every daily and final balance while all other final fields remain equal | Pass |
| v2ledger runtime | Requested default command exits 0; 420 Old Road wins, 14 dungeon clears, no failures | Pass |
| v2 level-3 runtime | Requested command exits 0; 32 seeds, combat/crafting reproducibility pass. Old Road win rates both 1; dungeon balanced clear rate 1 versus glass-cannon 0 | Pass |

## Commands and results

- `npm run build`: all five workspace builds completed, including Vite. The surrounding shell command returned 1 because a subsequent unrelated `rg` Windows wildcard search failed; this was not a build failure.
- `node scripts/simulate.mjs --mode=v2ledger`: standalone exit 0; results above.
- `node scripts/simulate.mjs --mode=v2 --level=3`: standalone exit 0; results above. Average Old Road rounds: balanced 5.06, glass-cannon 3; dungeon floors processed: balanced 4, glass-cannon 3.91.
- `node --test scripts/simulate-ledger.test.mjs`: exit 0, 1 test passed. Exercises both fresh-gold and legacy-gold CLI JSON output against built production rules.

No commands were refused. Two exploratory rg searches used unsupported Windows wildcard paths and failed; subsequent bounded reads supplied the required evidence. No save data or running services were modified.

## Remaining scope and next task

Both assigned review findings are resolved. Full M2-28 economy acceptance (all party-size/time/seed distributions, purchases, unlocks, offline partitions and failure recovery) remains Economy Designer's existing task; these focused checks do not claim that broader acceptance. Next: review/integrate this branch, then use the corrected ledger for existing M2-28 analysis. No new backlog task is needed.
