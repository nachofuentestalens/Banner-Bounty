# M2-23: Gear, crafting and reward economy

Owner: Economy Designer. Date: 2026-10-21. Status: implementation specification;
pacing is an analytical hypothesis, not production-simulation evidence.

Inputs: `../classes.md`, `../content.md`, `../combat.md`, `baseline.md`, and
`../../studio/milestones/M2.md`. M2-31 owns encounter IDs, unlocks, floor counts,
enemy rosters and bosses. This document supplies reusable reward profiles, not
additional encounters. M2-25 owns DTOs, persistence and migration contracts;
M2-26/27 implement these numbers; M2-28 measures and tunes them.

## 1. Decisions and precedence

For M2 rules, this document supersedes baseline sections 2-6 only where stated
below (participant count, item generation, dungeon rewards, overflow and crafting).
Keep the baseline XP curve `xpToNext(L)=15*L`, level cap 10, Old Road 60-second
cycles, eight-hour expedition credit cap, and zero rewards on arena outcomes.
XP goes to each actual participant (1-5), including defeated participants on a
team win; never divide by party size or grant XP to benched heroes. Cap handling
remains baseline section 1. No gear level requirements or class restrictions.
Recruitment remains `150*ownedHeroCount` gold, as in classes section 8; its
placeholder retuning belongs to M2-28. Secondary class/loadout switching stays free.

Keep the nine base item IDs and their exact HP/ATK/DEF bonuses from content 2.1.
Rarity adds affixes, not a multiplier to base stats. This keeps skill/formation
choices relevant and avoids exponential gear inflation. No set bonuses, durability,
item enhancement ladder, salvage, trading, shops, paid currency or crafting failure.
There is no sale action: overflow values are only automatic reward conversion.

The M2-22 statement that RNG is never used for economy/recruitment is interpreted
as protecting deterministic recruitment, not deleting M1 loot RNG or M2's explicitly
required randomized affixes. Combat RNG and reward RNG are separate streams.
These are scoped M2 amendments; historical M1 tables and simulation evidence remain intact.

## 2. Rarity and affix tables

| Rarity ID | Affix count | Overflow gold |
| --- | ---: | ---: |
| `common` | 0 | 5 |
| `uncommon` | 1 | 9 |
| `rare` | 2 | 18 |
| `epic` | 3 | 36 |

Affix values are inclusive integer ranges. Each distinct integer in a range has
equal probability. No duplicate affix ID on an item; duplicate IDs across different
equipped items stack additively. Select IDs uniformly without replacement from the
slot pool, then roll each selected value independently. No hidden weights or
class bias. Stored ordering is selection order and is stable for reforging.

| Slot | Ordered eligible pool |
| --- | --- |
| weapon | `affix_of_power`, `affix_of_warding`, `affix_of_vigor` |
| armor | `affix_of_power`, `affix_of_warding`, `affix_of_vigor` |
| trinket | `affix_of_power`, `affix_of_warding`, `affix_of_vigor`, `affix_of_haste` |

| Slot | Affix / flat stat | Uncommon | Rare | Epic |
| --- | --- | --- | --- | --- |
| weapon | power / ATK | 1-2 | 2-3 | 3-4 |
| weapon | warding / DEF | 1-2 | 2-3 | 2-4 |
| weapon | vigor / HP | 3-6 | 6-9 | 9-12 |
| armor | power / ATK | 1-2 | 2-3 | 2-4 |
| armor | warding / DEF | 1-2 | 2-3 | 3-4 |
| armor | vigor / HP | 3-6 | 6-10 | 10-14 |
| trinket | power / ATK | 1-2 | 2-3 | 3-4 |
| trinket | warding / DEF | 1-2 | 2-3 | 2-4 |
| trinket | vigor / HP | 3-6 | 6-9 | 9-12 |
| trinket | haste / SPD | 1-1 | 1-2 | 1-2 |

For weapon/armor, an affix's inclusion probability is count/3; for trinkets it
is count/4. Epic weapon/armor always have all three IDs but variable values.
All affixes are flat additions in classes 2.1 step 4, before passive percentages.
No crit/dodge, cooldown, skill-level or percentage affixes in M2. Haste's maximum
is +2 SPD per hero because only the single trinket slot can roll it.

Example: level-5 Vanguard/Cleric has base HP72/ATK13/DEF12/SPD10 per classes 10.1.
A rare Plate Harness with warding +3 and vigor +8 gives HP82/ATK13/DEF18/SPD10;
Thick Hide then gives `floor(18*115/100)=20 DEF`. No rounding occurs in flat sums.
With any three epic items, affixes alone add at most HP38/ATK12/DEF12/SPD2
(independent component bounds, not a simultaneously attainable build).

## 3. Area and boss reward profiles

Each won 60-second expedition cycle pays one row; losses/timeouts pay nothing.
Gold is per account, XP per participant, and item probability is per cycle, not
per enemy or hero. All areas share the existing eight-hour cap; switching areas
cannot reset or bank elapsed credit. No expedition profile grants dungeon materials.

| Reward profile | Binding | XP | Gold | Item probability | Conditional rarity weights C/U/R/E |
| --- | --- | ---: | ---: | ---: | --- |
| `reward_area_1` | Old Road | 4 | 10 | 25% | 60/35/5/0 |
| `reward_area_2` | M2-31 second-area profile | 5 | 12 | 25% | 45/45/10/0 |
| `reward_area_3` | available for M2-31's higher difficulty area | 6 | 14 | 25% | 30/50/20/0 |

These are reward-profile IDs, not new area IDs. M2-31 assigns a profile explicitly
to every area it ships; an unused profile does not require another area. No default
fallback for an unknown profile. Item base definition is uniform among all nine
existing IDs (1/9 each), independent of rarity. An area-1 cycle therefore has
75% no item, 15% common, 8.75% uncommon, 1.25% rare, and 0% epic.

`boss_tollkeeper` keeps its one-time account claim: 150 gold, 40 XP per participant,
one guaranteed uncommon item using the new affix table. No repeated rewards and
no entry cost. The owner-approved level-3 readiness target remains; this document
does not change its combat stats. Standalone bosses added by M2-31 use this same
first-clear reward profile unless M2-28 records a measured revision. Each boss
has its own claim. Dungeon final bosses instead use section 4: they must not also
grant standalone-boss rewards or consume the Tollkeeper claim.

## 4. Multi-floor dungeon rewards and time budget

Materials are account-owned nonnegative integer balances, independent of the
100-item bag limit, with no gold exchange or expiry:

| Material ID | Working label | Source / purpose |
| --- | --- | --- |
| `material_scrap` | Forge Scrap | All won floors; every recipe |
| `material_sigil` | Bound Sigil | Final bosses; rare/epic crafts and reforges |
| `material_core` | Heart Core | Final bosses; epic crafting |

M2-31 selects a dungeon's introductory (`reward_dungeon_1`) or advanced
(`reward_dungeon_2`) profile and supplies its actual ordered floors. Every
non-final floor uses the ordinary row; exactly one final floor uses the boss row.
Rewards do not scale with enemy count or party size. All material quantities below
are guaranteed on a win. An item probability of 100% means exactly one item.

| Profile / floor | XP | Gold | Scrap | Sigil | Core | Item probability | Conditional C/U/R/E weights |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| dungeon 1 ordinary | 8 | 20 | 2 | 0 | 0 | 25% | 40/50/10/0 |
| dungeon 1 final boss | 16 | 40 | 4 | 2 | 1 | 100% | 0/70/28/2 |
| dungeon 2 ordinary | 10 | 25 | 3 | 0 | 0 | 25% | 20/55/25/0 |
| dungeon 2 final boss | 20 | 50 | 6 | 3 | 2 | 100% | 0/45/50/5 |

Use the same uniform nine-definition selection as areas. Every successful run
can earn these rows again; there are no daily resets, tickets, entry fees or
additional first-clear caches. Deterministic materials are the bad-luck protection;
epic drops are a bonus rather than the required path to an epic.

**Time constraint for these payouts:** one floor consumes 180 server seconds,
including a failed floor. Only one progression activity (expedition OR dungeon)
may run per account. Each floor starts at full HP with fresh battle-local effects;
the party/build/gear is frozen for the whole run. At each floor boundary the server
resolves the battle and credits its reward once; XP affects live heroes but does
not alter the run's frozen combat stats. A loss/timeout ends the run with no reward
for that floor. Already earned floors remain earned. No checkpoints for restarting
at a cleared floor: a new run begins at floor 1. Voluntary abandon keeps earned
floors but discards the current floor's partial time; restart cannot reuse it.

Floors advance automatically, including offline, through the existing eight-hour
credit budget; they stop at the final boss or first loss. No automatic new run,
no offline loop of repeated dungeons. Require content validation that total run
duration fits the cap (floorCount*180 <= 28800). Playback pause/speed/skip is purely
presentation and cannot advance timers or rewards. There is no client victory claim.
Starting another activity cannot credit the same wall time twice. M2-25/27 must
formalize these run/checkpoint invariants with the existing revision protocol.

For `n` floors, full-clear introductory totals are XP `8*(n-1)+16` per hero,
gold `20*(n-1)+40`, scrap `2*(n-1)+4`, sigils 2, cores 1, and expected items
`0.25*(n-1)+1`. Advanced totals are XP `10*(n-1)+20`, gold `25*(n-1)+50`,
scrap `3*(n-1)+6`, sigils 3, cores 2. Duration is `3*n` minutes for either.
Floor rewards are additive, never multiplied by depth, replay count or a clear bonus.

## 5. Crafting and reforging

All recipes are unlocked once their materials are owned; no level or first-clear
gate beyond earning materials. Each craft chooses one existing base definition
and a recipe rarity. It creates exactly one unequipped item at that rarity with
section 2's random affixes. No random definition, failure or hidden cost.

| Recipe ID | Output / action | Gold | Scrap | Sigil | Core |
| --- | --- | ---: | ---: | ---: | ---: |
| `craft_uncommon` | One uncommon chosen definition | 100 | 4 | 0 | 0 |
| `craft_rare` | One rare chosen definition | 300 | 12 | 2 | 0 |
| `craft_epic` | One epic chosen definition | 900 | 60 | 12 | 8 |
| `reforge_uncommon` | Replace one selected affix | 50 | 2 | 0 | 0 |
| `reforge_rare` | Replace one selected affix | 100 | 2 | 1 | 0 |
| `reforge_epic` | Replace one selected affix | 200 | 4 | 2 | 0 |

Reforge preserves instance ID, definition, rarity and other affixes. Player selects
an affix index, not a desired outcome. Form the eligible ID pool for the item's slot
excluding IDs on untouched affixes. For the current ID exclude its current value
from its range; remove that ID if no alternative value remains. Pick an eligible
ID uniformly, then a remaining value uniformly. Thus every valid reforge changes
the selected (ID,value) pair, can lower its value, and never duplicates an affix.
There is no keep-old choice, refund or increasing price. Common items cannot reforge.
Example: uncommon haste +1 has no other haste value; a trinket reforge picks power,
warding or vigor with 1/3 probability each. On an epic weapon all other IDs are
occupied, so reforge retains its chosen ID and uniformly rolls another legal value.
The UI must show the cost, eligible results and possibility of a downgrade before
submission; the request itself commits the displayed operation, without an extra fee.

Craft/reforge require no active progression activity. Reforge requires an owned,
unequipped item; unequip normally first. Craft requires at least one free bag slot
or an explicitly selected owned, unequipped replacement item. The optional replacement
is consumed atomically by the craft, yields no refund or discount, and works at any
bag count. Show its identity and loss in the craft confirmation; never select one
automatically. At 100 with no replacement, reject without spending or rolling,
rather than converting a paid craft to gold. This replacement option prevents a
full legacy bag from permanently blocking crafting without adding a sale/salvage
system. Reward drops at capacity instead convert to section 2 gold, in floor/cycle
order, leaving materials and XP unaffected. At 99 slots, two rewards insert one
item then convert the next. Equipped items never count toward the 100-slot cap.

Validate ownership, revision, activity lock, index, balances and bag space before
consumption. Debit, item mutation, stored reward RNG advancement, revision and
idempotency receipt (and any explicit replacement removal) commit atomically. Exact request retries return the same result
without a second debit or reroll. Rejected requests do not consume RNG. Concurrent
spend attempts cannot overspend; no negative balances or partial crafts.

## 6. Determinism, persistence and migration requirements

All randomness comes from server-owned persisted reward state and a versioned
pure reward function. Do not derive craft results from a client-selectable request
ID. Use a reward stream independent of combat action count and playback. For each
won reward: draw drop chance, then (if it drops) definition, rarity, affix IDs and
values in that order. Guaranteed drops omit chance; crafts omit chance, definition
and rarity; reforges draw only replacement ID and value. Lost floors/cycles draw no
reward RNG. Overflow still rolls the entire item, then converts by rarity. Persist
the resulting state in the same transaction, ensuring partitioned settlements agree.

Uniform integer draw `U(n)` means an unbiased integer 0..n-1; range value is
`lo+U(hi-lo+1)`. For a uniform 32-bit source, reject values at or above
`floor(2^32/n)*n`, then take remainder modulo n. A singleton selection consumes
one accepted draw too. Percent tests use `U(100)<p`; rarity uses cumulative weights
in C/U/R/E order (sum 100); choose candidates in the order in section 2 and base
definitions in content 2.1 table order. Rejection draws advance persisted state.
The PRNG implementation and seed derivation are versioned engineering contracts;
these tables do not reuse combat's 0..99 roll as an unbiased general-purpose draw.

Migration preserves every existing item ID, owner, equipment link, definition and
stat contribution. Legacy no-affix becomes common/empty affix list; legacy power
and warding become uncommon with value 2; legacy vigor becomes uncommon with value
3. All are legal in every new slot pool. Preserve the old optional field as a
compatibility projection if contracts require it; never double-apply both formats.
New uncommon/rare/epic instances require explicit rarity and ordered rolled values;
clients must not infer rarity from a single nullable ID. Old snapshots/reports keep
their frozen legacy contributions; new snapshots contain resolved M2 gear data.
New accounts start with zero materials; migration grants none and retains gold,
XP, claims and inventory. Active old-rules expeditions follow the existing explicit
rules-version migration/reset path, never silent rerolling at new rates.

## 7. Pacing model and week-one targets

These are conditional calculations, not combat forecasts. All times below assume
winning every attempted encounter, restarting expeditions to apply earned levels,
and no menu/playback overhead. Losses multiply the required attempts; at independent
win probability `w`, area milestone expectation is successful-cycle count / `w`.
Actual dungeon failure is build-dependent, so do not extrapolate its success rate
from this assumption. New recruit XP starts at zero and requires fielding that hero.

| Milestone | Analytical result / target |
| --- | --- |
| First area item | Geometric p=.25: P10=1, median=3, P90=9, P95=11 won cycles; target median <=5 minutes |
| Level 3 / secondary | 45 cumulative XP / 4, rounded up = 12 Old Road wins; target 10-15 minutes |
| Level 5 / second active | 150 XP: 38 Old Road wins |
| Level 8 / second passive | 420 XP: 105 Old Road wins |
| Level 10 cap | 675 XP: 169 Old Road wins; no invented week-long XP grind |
| First rare area item | Area 1 per-cycle p=.0125: median 56, P90 184 wins; areas 2/3 median 28/14 wins |
| Five heroes / spare sixth | From zero gold, ignoring boss/drop conversion and spending: 105/180 Old Road wins (costs 450+600 / +750) |
| First craft / reforge | Introductory dungeon: 4 scrap after two ordinary wins, or a boss; target first session after access, <=2 full clears |
| First epic | Guaranteed crafting route targeted days 4-7 at two introductory full clears/day; lucky drops can be earlier |

**Worked week budget, not a prescribed dungeon layout (M2-28 revision):** M2-31
shipped `dungeon_aqueduct_depths` as a **4-floor** introductory dungeon (3 ordinary
+ 1 final boss), not the 3-floor placeholder this section originally assumed before
M2-31 ran. Using section 4's general formula at `n=4`: one full clear takes 12
credited minutes and pays 40 XP/hero, 100 gold, 10 scrap, 2 sigils, 1 core and mean
1.75 items (sigils/core are flat per clear, from the one final-boss floor; scrap/
gold/XP/items scale with `n`). Confirmed against `node scripts/simulate.mjs
--mode=v2`'s dungeon benchmark (`design/game/reports/M2-28.md`): 200+ seeded runs at
a balanced level-8 party report `avgFloorsProcessed: 4`, `clearRate: 1`, matching
`n=4` exactly.

An established party completing two such runs/day plus 60 won Old Road cycles/day
earns per day 800 gold, 320 XP/participant, 20 scrap, 4 sigils, 2 cores and
mean 18.5 items. Seven days give 5600 gold, 2240 XP/continuously fielded hero
(cap discards surplus), 140 scrap, 28 sigils, 14 cores, mean 129.5 items before
overflow. This is 84 credited minutes/day, not eight hours/day and not all active
attention. Day-one access/recruitment delays can shift this calendar later.

One uncommon craft, one rare craft, one epic craft and two rare reforges cost
1500 gold, 80 scrap, 16 sigils and 8 cores (unchanged — recipe costs don't depend on
dungeon floor count). Remaining week balances before recruitment are 4100 gold,
60 scrap, 12 sigils and 6 cores; recruiting heroes 4-6 costs 1800 more, leaving 2300
gold. The epic alone is affordable after four days' materials (unchanged: cores,
the binding constraint, are still earned at 2/day); the whole listed crafting basket
is now affordable after **four** days, not five, since the corrected scrap income
(20/day, not 16/day) reaches the 80-scrap basket total exactly on day 4. Upgrades
are for a few chosen slots, not a promise of outfitting all 15 active-party slots
with epics.

With 14 introductory final-boss wins, natural epic count has binomial distribution
`Binomial(14,.02)`: expected .28, probability >=1 is `1-.98^14` (~24.64%).
At 28 advanced boss wins the chance is `1-.95^28` (~76.22%). The crafting path
avoids relying on either roll. No claim is made that advanced access is available
on day one. A full successful 480-cycle Old Road catch-up gives 4800 base gold,
1920 XP/participant before cap, and mean 120 items (72 common, 42 uncommon,
6 rare); bag overflow is expected and must be visible, never silently lost.

M2-28 must report production distributions for fresh and migrated saves, first
drop/rare/craft/reforge/epic time, material/gold balances, overflow, unlocks and
clear/fail rates by build and seed. Compare same-level/gear good and poor teams;
test whether abundant legacy gold removes only the gold constraint, while dungeon
materials still pace crafts. Include 1/3/5-hero groups, offline partitions, first
week at 30/78/480 credited minutes/day, and guaranteed-material failure recovery.
Retune only on that evidence. M2-29 owns browser verification of rarity, visible
stat changes, receipts, overflow and dungeon playback. M2-23 claims table readiness,
not that M2 gameplay or its pacing targets have passed.

**M2-28 status (2026-10-21):** the floor-count correction above is evidence-based
(simulated and arithmetic-checked). `scripts/simulate.mjs --mode=v2`'s existing
harness only exercises two fixed 3-hero party presets (balanced vs. glass-cannon)
at fixed levels (5 for Old Road, 8 for the dungeon) and reports win rate/rounds/
clear rate only — it does not yet support the 1/3/5-hero sweep, offline-partition
timing, week-length material/gold ledger, legacy-gold-vs-material-constraint test,
or guaranteed-material-failure-recovery checks this section asks for. See
`design/game/reports/M2-28.md` for exactly what was run, what it showed (no
measurable team-building contrast at the tested levels — both presets clear 100%
of the time, glass-cannon marginally faster), and the harness-extension request
sent to Gameplay Programmer to close the remaining gaps in a follow-up run.
