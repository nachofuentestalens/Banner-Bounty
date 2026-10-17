# Progression and reward baseline (M1-04 freeze)

This document is the frozen numeric surface for XP, gold, drops/affixes, boss first-clear reward,
and inventory overflow conversion, consumed by `packages/game`'s reward-generation functions and
`packages/content`'s static tables (`content.md`). `combat.md` fixes battle *outcomes* (win/loss/draw);
this document fixes what a win *pays out*. All math is integer; every division below is floor
(truncating) integer division unless stated otherwise. Changing a number here after `packages/game`
reward code starts (M1-06+) requires a recorded decision in this file, mirroring `combat.md`'s freeze
rule.

Pacing estimates in section 7 are hand-derived hypotheses, not simulation output — they are labeled
pending-simulation per `first-playable.md` and are M1-12/M1-13's job to confirm or correct with the
production engine once it exists.

## 1. XP curve and leveling

`xpToNext(level) = 15 * level` for `level` 1-9 (the XP needed to go from `level` to `level + 1`).
Level 10 is the cap; a level-10 hero has no `xpToNext` and any further XP earned by that hero is
discarded (not banked, not converted).

| Level | xpToNext (to reach next level) | Cumulative XP from level 1 |
| --- | --- | --- |
| 1 | 15 | 0 |
| 2 | 30 | 15 |
| 3 | 45 | 45 |
| 4 | 60 | 90 |
| 5 | 75 | 150 |
| 6 | 90 | 225 |
| 7 | 105 | 315 |
| 8 | 120 | 420 |
| 9 | 135 | 540 |
| 10 | — (cap) | 675 |

**Level-up application**: a reward transaction adds XP to `Hero.xp`, then applies level-ups in a
loop: while `xp >= xpToNext(level)` and `level < 10`, subtract `xpToNext(level)` from `xp` and
increment `level` by 1 (remainder XP carries into the next level, never discarded mid-climb). At
`level == 10`, stop the loop and discard any remaining unapplied XP from that same transaction (do
not let it carry past the cap). A single large settlement (e.g. the 480-cycle, 8-hour-cap batch in
`contracts.md`'s offline algorithm) can cross several levels for the same hero in one transaction;
this loop is what makes that deterministic regardless of batch size.

Stat growth per level (`statAtLevel`) and the level-3 specialization unlock are fixed by `combat.md`
1.1 and 3.3; this document only fixes how much XP produces each level-up, not what a level changes
mechanically. Whether a mid-expedition level-up's stat growth applies to the *current* expedition's
remaining simulated cycles or only the *next* expedition is an open question `contracts.md` assigns
to M1-02/M1-08, not to this reward table.

## 2. Expedition cycle rewards (Old Road)

A won cycle (`combat.md`/`content.md` Old Road encounter resolves as a win) grants, in one reward
transaction:

- **XP**: `4` XP to **each** of the three expedition participants, including a hero defeated during
  the winning battle (`first-playable.md`). Flat per hero, independent of level, class, or
  specialization — all three always receive the same amount for the same cycle.
- **Gold**: `10` gold to the account (not per hero — gold is an account-level resource, `first-playable.md`).
- **Item drop**: resolved per section 4 below; `0` or `1` item instance (or its gold conversion,
  section 6) per cycle. Drops are never per-enemy or per-hero; at most one drop per cycle.

A **lost** cycle (timeout or defeat) grants `0` XP, `0` gold, and no drop — the cycle is still
consumed (`first-playable.md`: "a loss consumes the cycle and awards no loot/XP/gold"). Given the
Old Road's fixed, non-level-scaled stats and `combat.md` worked example 11 (an unspecialized
level-1 party clears it in 7 rounds), a loss is not expected in ordinary play at any level; it
remains possible only as a hand-constructed edge case, not a normal outcome this table needs to
pace around.

## 3. Boss first-clear reward (the Tollkeeper)

On the **first** win against `boss_tollkeeper` for an account (`BossClaim.claimedAt` transitions
`null -> serverNow()` atomically with the reward grant, per `contracts.md`):

- **Gold**: `150` gold to the account.
- **XP**: `40` XP to each of the three challenging heroes (same "all participants, including any
  defeated during the win" rule as section 2).
- **Item**: exactly one guaranteed item instance, rolled as: base `definitionId` uniform among the
  9 definitions in `content.md` 2.1 (1/9 each), **always** uncommon (affix roll is `100%`, not the
  ordinary 1/3 from section 4), `affixId` uniform among the 3 affixes in `content.md` 2.2 (1/3
  each). This guaranteed drop is still subject to the section 6 overflow check like any other drop
  (a full inventory converts it to gold instead of creating the 101st instance; the gold/XP
  components of the boss reward are never affected by overflow, only the item component is).

**Non-exploitability**: every subsequent win against the Tollkeeper (claim already `true`) grants
`0` gold, `0` XP, `0` item — only a `BattleReport` with `rewardGranted: false`. No entry cost means
a player can re-challenge freely for practice or to re-read the report, but repeated wins cannot
farm gold/XP/items, satisfying `first-playable.md`'s "first victory grants a one-time reward; later
victories provide only a report." A loss grants nothing and does not consume or damage the claim
flag — the boss remains re-challengeable at will (A09's "boss loss is recoverable" is unaffected by
this table; it is a property of there being no entry cost and no claim mutation on loss, both
already fixed by `contracts.md`).

## 4. Item drop and affix resolution

Resolved once per won expedition cycle (section 2) or once unconditionally for the boss's
guaranteed drop (section 3, with the affix branch forced):

1. **Drop occurs?** Draw `d0` uniform in `[0, 1)`. Drop if `d0 < 0.25` (25% chance); otherwise no
   drop this cycle (`d0` is still consumed from the RNG stream either way — see section 8).
2. **Base definition.** If a drop occurred, draw `d1` uniform in `[0, 1)` and map it to one of the
   9 `definitionId`s in `content.md` 2.1 with equal `1/9` probability each (3 weapon + 3 armor + 3
   trinket, so each slot is equally likely in aggregate: `3/9 = 1/3` per slot).
3. **Affix?** Draw `d2` uniform in `[0, 1)`. Affix if `d2 < 1/3` (33.3...% chance, i.e. `d2 < 0.3333...`
   using the engine's fixed-point/float comparison — implementation note: compare against the exact
   rational boundary, not a rounded decimal, to avoid drift across engines). For the boss's
   guaranteed drop (section 3) this step is skipped and treated as always-true.
4. **Which affix.** If an affix was rolled, draw `d3` uniform in `[0, 1)` and map it to one of the 3
   `affixId`s in `content.md` 2.2 with equal `1/3` probability each.

Resulting outcome probabilities per cycle (sum to 1): `0.75` no drop; `0.25 * 2/3 = 0.1667` common
drop (no affix); `0.25 * 1/3 = 0.0833` uncommon drop (with affix). Within "uncommon drop," each of
the 3 affixes is independently `1/3`, and within "any drop," each of the 9 base definitions is
independently `1/9` — these are orthogonal rolls (the definition roll does not affect the affix
roll or vice versa).

## 5. Arena rewards

Arena challenges (`content.md`/`contracts.md` `arena/challenge`) grant **zero** gold, XP, or items
regardless of win/loss/draw — matching `first-playable.md`'s "no shop or crafting" minimalism and
the backlog's explicit "zero arena rewards" acceptance line. Only a `BattleReport` is produced. This
keeps arena strictly a bragging-rights/preview feature in M1, with no economy interaction to
balance against PvE.

## 6. Inventory overflow conversion

Cap: **100** unequipped `ItemInstance` rows per account (`first-playable.md`). Equipped items never
count toward this cap and are never affected by overflow (`contracts.md`: "never deleting equipped
gear"). When a reward transaction would create a new unequipped instance and the account's current
unequipped count is already at 100, the drop is **converted to gold** instead of creating the row:

| Converted drop | Gold value |
| --- | --- |
| Common (no affix) | `5` gold |
| Uncommon (any one affix) | `9` gold |

This gold is added to the same reward transaction's gold total (section 2/3), never creates a
"phantom" instance, and never deletes or touches any existing instance (equipped or unequipped).

**Determinism inside a multi-cycle batch** (settlement can resolve up to 480 cycles at once per
`contracts.md`'s 8-hour cap): drops are processed strictly in cycle order (cycle 1's drop resolved
and applied to the running unequipped count before cycle 2's drop is resolved, and so on). The
running count starts at the account's actual unequipped count read at the start of the transaction
and increments by 1 for each drop that does *not* overflow; once it reaches 100, every subsequent
drop in the same batch converts to gold until the batch ends (equipping items mid-batch is
impossible — equip/unequip is blocked during an active expedition per `contracts.md`'s
`active_expedition` lock, so the running count only ever moves in one direction within a single
settlement). This ordering is the same per-item-before-next-item resolution `contracts.md`'s
overflow paragraph requires ("the check and conversion happen inside the same reward-granting
transaction... no separate pass that could run against a stale count").

## 7. Expected pacing (hypotheses, pending simulation)

These are hand-derived point estimates from the formulas above, assuming an unbroken string of won
60-second cycles (no losses, consistent with section 2's note that losses are not expected in
ordinary play). They are **not** a simulation result; M1-12/M1-13 must confirm them against the
production engine (and across fixed seeds/builds, per `first-playable.md`) before they are treated
as validated pacing.

| Milestone | Target (hypothesis, `first-playable.md`) | Hand-derived estimate |
| --- | --- | --- |
| First equipment drop | ~5 minutes | Expected cycles to first drop `= 1/0.25 = 4` cycles → **~4 minutes** |
| Specialization unlock (level 3) | 10-15 minutes | Cumulative XP to level 3 is `45`; at `4` XP/cycle, `ceil(45/4) = 12` cycles → **~12 minutes** |
| Boss readiness | 20-40 minutes | See below — **~23-38 minutes** (level 4-5 band) |

**Boss readiness band.** Cumulative XP to level 4 is `90` (`ceil(90/4) = 23` cycles, ~23 minutes);
to level 5 is `150` (`ceil(150/4) = 38` cycles, ~38 minutes). Both fall inside the 20-40 minute
hypothesis window. A rough (hand-estimated, not simulated) feasibility check at level 5, unspecialized,
unequipped, against the Tollkeeper (`content.md` section 4, HP220/ATK14/DEF8/SPD9):

- Party default-action damage per round vs. boss `DEF8`: Vanguard `11-4=7`, Ranger `17-4=13`,
  Arcanist `18-4=14` → `34`/round if all three act. `ceil(220/34) = 7` rounds to clear, well under
  the 100-round cap.
- Boss damage over those ~7 rounds: 2 Toll Smash rounds (`floor(9*3/2)=13` each) + 5 Toll Strike
  rounds (`14 - floor(DEF/2)` against whichever hero is targeted, `~9` each against a DEF10 front
  Vanguard) ≈ `71` total damage, well under the party's combined `60+48+44=152` HP.

This suggests level 4-5 is a plausible readiness threshold, but it is a single hand-estimated trace
(no equipment, no specialization, one fixed targeting assumption), not a swept simulation across
seeds/builds/equipment states — exactly the gap M1-12/M1-13 are scoped to close. Equipment drops
accumulated by level 4-5 (section 4: ~25-40% of cycles drop something, so roughly 6-15 items by
cycle 23-38) would only make the boss easier than this unequipped estimate, not harder, so this
band is treated as a conservative (not optimistic) estimate.

## 8. Alignment with `contracts.md` and `combat.md`

- Reward generation is a pure function of `{ state, rulesVersion, rngSeed/rngState, elapsedDuration }`
  (`contracts.md`'s package-interface rule, `combat.md` section 7's pattern) — it never reads a
  global clock or RNG. The four draws in section 4 (`d0`-`d3`) are consumed from the expedition's
  `rngState` in that fixed order, once per cycle, regardless of whether earlier draws short-circuit
  later branches (e.g. a no-drop cycle still only consumes `d0`; nothing after it) — the stream
  position after a settlement is therefore a deterministic function of how many cycles were
  simulated and what they rolled, reproducible exactly on replay with the same seed and cycle count.
- Expedition cycles consume `frozenLoadout` for combat per `combat.md` section 7, but XP/gold
  application always writes to the hero's live `level`/`xp` fields (never frozen), matching
  `contracts.md` worked example 10 ("level/xp are not part of frozenLoadout").
- This table fixes reward *amounts*; it does not re-specify or compete with any combat outcome
  number in `combat.md`, nor any content stat/ID in `content.md` — consistent with both documents'
  explicit deferral of reward numbers to M1-04.
