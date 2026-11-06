# Ledger spending and offline partitions

Task: 8136ac3b-c065-46cb-986e-ecc52e9daf66. Owner: Gameplay Programmer. Date: 2026-11-06.

## Changes and usage

`scripts/simulate.mjs --mode=v2ledger` now accepts repeatable end-of-day spend actions and daily online/offline budgets. Production `getRecipeDefinition`, `resolveCraft`, `resolveReforge`, settlement-window helpers and inventory cap supply the existing rules. No production API, storage, content or architecture contracts change.

| Option | Meaning |
| --- | --- |
| `--ledger-spend=DAY:craft_RARITY:DEFINITION` | Craft uncommon, rare or epic gear using section 5 costs; e.g. `1:craft_uncommon:item_weapon_focus` |
| `--ledger-spend=DAY:reforge_RARITY:CRAFT_ACTION:AFFIX_INDEX` | Reforge a successfully crafted item from an earlier CLI action; e.g. `2:reforge_uncommon:1:0`. Action numbers are one-based across all spend flags, including rejections; affix indices are zero-based. Recipe rarity must match the item. |
| `--ledger-spend=DAY:recruit:CLASS` | Buy a benched roster member; e.g. `1:recruit:class_cleric` |
| `--ledger-online-minutes=N --ledger-offline-minutes=M` | Both required together, each an integer from 0 through 480. They are available time budgets, not guaranteed earned minutes. |

Spends execute after the day's activities stop, on reconnect, in CLI order within that day. Days must be within `--ledger-days`; malformed actions fail the CLI. Valid but unaffordable actions are recorded as rejected without changing balances, bag/roster counts or crafting RNG. The JSON report contains each action's cost, reason, item and before/after snapshots, daily segment cycles/floors, final crafting items, bag/roster counts and three RNG states. Console output also reports action results.

Recruitment follows `classes.md` section 8 and `heroService.ts`: 150 times owned count before purchase, maximum 20. These constants currently live only in the server, so this pure harness mirrors those two documented values; it does not import SQLite/services. The initial owned count is `max(3, --heroes)` and recruits remain benched. This is a cost/roster simulation, not server hero creation or leveling. Reforges target crafted items only. Crafts add to the same 100-slot bag as earned loot; a full bag rejects. Explicit replacement, equipping and salvage are outside this harness. `final.itemsCount` retains its previous meaning of retained reward drops; `unequippedCount` includes crafted items.

Old Road runs first, then up to the requested number of dungeon attempts. Without time flags the online budget is the planned cycles plus 12 minutes per dungeon, capped at 480; offline defaults to zero. Thus the original 60-cycle/two-dungeon scenario remains 84 minutes and retains its exact results. An explicit smaller budget limits activity. Each segment uses the engine settlement math. A dungeon floor's partial time carries across the online/offline boundary; its reward and floor count appear in the segment where it completes. Only whole cycles/floors earn rewards. Unfinished dungeons stop at day end and are reported separately from failures. Unused minutes and discarded partial floors grant nothing.

A dungeon may be dispatched exactly at disconnect. Later offline dungeon restarts are prohibited, per gear.md section 4. If Old Road consumes the online window and continues offline, the account cannot start a dungeon until reconnect; this daily schedule does no new activity after reconnect, only the scheduled spends. For example, use 64 online + 8 offline minutes for 60 Old Road cycles and a dungeon split after its first floor. Use zero dungeon attempts for all-offline Old Road budgets of 30/78/480 minutes. Budgets are per segment (up to 960 combined), not a new daily cap; the existing Old Road request maximum remains 480 cycles/day.

Independent Old Road, dungeon-reward and crafting RNG streams use the existing mixed-seed convention (base, base+500000, base+1000000). Combat seeds and cycle/floor offsets persist across each segment boundary. This is harness reproducibility evidence, not a claim about server request seeding or transaction behavior.

## Acceptance evidence

| Requested check | Evidence | Result |
| --- | --- | --- |
| Scheduled recipe and recruit spending | Full basket (uncommon/rare/epic crafts, two rare reforges) costs 1500 gold/80 scrap/16 sigils/8 cores. Three recruits cost 450/600/750 gold. Four-day scenario debits 3300 total gold and exhausts materials exactly. | Pass |
| Rejection without debit or roll | Insufficient gold/materials, invalid reforge target, full bag and full roster compare identical before/after snapshots. Rejected epic followed by recovery gives the same item, final balances and all RNG states as recovery without the failed attempt. | Pass |
| Guaranteed-material recovery | Seed 1, 5000 starting gold: day 1 epic rejected with 2 cores; day 4 reaches 8 cores and succeeds. Final gold 7300, scrap 20, sigils 4, cores 0; 240 Old Road wins and 8 dungeon clears. | Pass |
| Offline partitions and bounds | 480-cycle runs split at 0/30/78/240/480 minutes produce equal final state and RNG. Dungeon split at minute 64 preserves the unsplit 72-minute result. 30/78/480-minute offline budgets credit exactly that many cycles. Values over 480, negative, fractional, NaN, or missing paired options reject. | Pass |
| Dungeon offline lifecycle | 480 offline minutes with two requested dungeons credits only one run; a 1-online/4-offline-minute run credits one floor and reports incomplete, not failed/cleared. | Pass |
| RNG independence and capacity | Crafts leave expedition/dungeon streams unchanged; early crafting occupies one slot, reducing retained drops from 100 to 99 and increasing overflow from 28 to 29. Additional partition comparisons include seed 5000, 1/5 heroes, and actual losing cycles. | Pass |
| Prior default ledger | Existing test still verifies 5835 gold, materials 140/28/14, 100 retained drops and 28 conversions. Starting gold only shifts balances. | Pass |
| Fresh vs migrated progression | Separately scoped below; no migration or unlock-progression acceptance claimed. | Not tested by this harness |

## Commands and results

- `npm ci --no-audit --no-fund`: exit 0, 189 packages installed; no lockfile changes.
- `npm run build`: exit 0, all five workspace builds passed, including web/Vite.
- `node --test scripts/simulate-ledger.test.mjs`: exit 0, final run 8/8 passing. Earlier six-case run also passed; two additional cases cover crafted-item overflow and losing-cycle partitions.
- `node scripts/simulate.mjs --mode=v2ledger --ledger-days=4 --ledger-starting-gold=5000 --ledger-spend=1:craft_epic:item_weapon_focus --ledger-spend=4:craft_epic:item_weapon_focus`: exit 0; rejection/recovery and exact balances above.
- `node scripts/simulate.mjs --mode=v2ledger --ledger-online-minutes=64 --ledger-offline-minutes=8 --ledger-dungeon-clears-per-day=1`: exit 0; seven days, 420 wins, 7 clears, 5011 gold, materials 70/14/7, 100 retained drops, 14 conversions.
- `git diff --check`: exit 0; only Git line-ending notices.

No commands were refused. One exploratory `rg` command used a Windows wildcard path and exited 1; subsequent directory-scoped searches/read commands provided the inputs. No server or watcher was started, and no save was touched. CLI regression artifacts are isolated temporary JSON files removed by the tests.

## Remaining scope and next task

The requested harness implementation is complete. Fixed combat levels, preselected party builds, empty initial bags and starting gold are scenario assumptions; they do not establish fresh-save unlock timing, migrated-save equivalence, or the whole economy pacing acceptance matrix.

Fresh-versus-migrated evidence requires a separate server-backed harness: create isolated empty and legacy SQLite fixtures; invoke real migrations; assert preserved gold, XP, claims, item identity/ownership/equipment/stat contribution and zero material grants; handle old-rules active expeditions explicitly; then drive equivalent authoritative commands with an injected clock and controlled RNG, including reopen/retry checks. It must measure unlock/level changes and compare budgets without using real player data. A mocked migration alone would not prove the production migration. This work belongs with server migration/integration evidence, outside this pure-engine extension; no speculative task was created.

Next: review and integrate this task, then the existing Economy Designer follow-up can run spending, recovery and offline scenario distributions against gear.md section 7. Migration evidence remains separately required before claiming full section 7 coverage.
