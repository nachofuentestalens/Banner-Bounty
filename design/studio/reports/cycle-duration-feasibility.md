# Feasibility spec: bind expedition cycle duration to real fight length (M3 candidate)

Date: 2026-10-22 · Owner: CTO · Task ID 9fa4109a-92c5-4c03-85d7-406189c0f218

No implementation. This is a feasibility analysis only; `packages/game`, `packages/server`, and
`design/studio/contracts.md` are untouched by this task, per its scope.

## Owner complaint, restated precisely

1. The player cannot reliably watch a fight when it happens.
2. The ~1-minute fixed cycle feels "way too long" and should instead last only as long as the
   fight actually takes, shown close to real time.

## Root cause, read from the current implementation

`design/studio/contracts.md`'s Offline settlement algorithm fixes **cycle length = 60,000 ms** as
a server-side constant, independent of how many combat rounds a battle actually takes
(`combat.md` worked example 11 clears the Old Road in 7 rounds; that battle still consumes exactly
one 60-second slot, same as a 40-round battle would). `apps/server/src/services/expeditionService.ts`
confirms this at the code level:

- `settleExpedition` is **pull-based**: the client calls `expedition/settle`, the server computes
  `creditedCycles = floor(cappedMs / 60_000)` since the last checkpoint, and simulates *all*
  credited cycles in one instant, synchronous batch (`simulateExpeditionCyclesV2`).
- The response surfaces only `batch.latestBattle` as `latestBattleReport` — the *last* credited
  cycle's report. If the client's poll interval doesn't line up with 60-second boundaries, or more
  than one cycle elapsed between polls, earlier cycles in that batch are settled, rewarded, and
  **silently dropped** from what the player can watch. There is no stream of in-progress events and
  no per-cycle push; the player sees a fight only if they happen to call `settle` within the window
  where exactly the most recent battle is still "latest."

So "can't reliably watch a fight" is not a UI polish gap — it is a direct consequence of (a) a
fixed-length wrapper that has no relationship to actual combat duration, and (b) a latest-cycle-only,
poll-driven reporting model with no live delivery channel.

## What "bind cycle length to real fight length" has to mean

Combat already produces a variable, bounded round count (`combat.md` section 1, 100-round cap).
Binding cycle duration to that means replacing the constant 60,000 ms with a **per-battle nominal
duration** derived deterministically from the battle's own round count:

```
nominalDurationMs(battle) = roundsInBattle * MS_PER_ROUND
```

`MS_PER_ROUND` is a new, named display-pacing constant (e.g. 1,500-2,000 ms/round, picked for
watchability, not simulated), not a simulation input — it does not change combat outcomes, RNG
consumption, or rewards. This directly fixes complaint 2: a 7-round Old Road win becomes an
~11-14s cycle instead of a flat 60s one; a 40-round near-loss becomes ~60-80s. Cycle length varies
per battle instead of being constant.

## Two separable concerns — do not conflate them

The owner's two complaints point at two different layers, and the critical feasibility finding is
that they must be solved differently to keep offline/async play intact:

1. **Authoritative pacing** (how much real elapsed time one cycle "costs" against the economy and
   the offline cap) — this is what section 2's formula changes. It must stay a pure, instant,
   deterministic computation; the server never waits out `nominalDurationMs` to compute it.
2. **Live presentation** (letting a connected player watch a fight as it happens) — this is a
   delivery/transport problem, not a simulation-speed problem. The battle is already fully resolved
   the instant the server computes it; "watching live" means pacing the *delivery* of its
   already-known event log to a connected client, not slowing down the server.

**Recommended approach: precompute instantly, pace delivery only to a connected client.**
Keep combat resolution exactly as fast and deterministic as today. Add a short-lived "current cycle
is presentable" window: after a live client's poll/connection triggers settlement of exactly the
next due cycle (not a multi-cycle batch, when a connected session is detected), the server returns
that cycle's full event log plus its `nominalDurationMs`, and the client paces the display locally.
No new server-side timers, no new concurrency model, no change to how fast the authoritative state
advances. This reuses the existing replay/event-log infrastructure (`combat.md` 8.6, M2-21's
`battlePresentation.ts`) that production code already has for the boss/arena replay path — it is a
delivery-cadence change, not a new rendering system.

**Rejected approach: server-paced real-time ticking** (the server only *reveals* a cycle's result
after `nominalDurationMs` of real time has passed, i.e. combat genuinely runs on a live clock).
This would need per-session timers/scheduling inside the single authoritative Node process
(`architecture.md`'s "one Node process owns authoritative state" invariant), and — critically for
async play — it cannot be reconciled with offline catch-up: an away player's 8 hours must still
resolve via one instant batch transaction, not by waiting out real nominal time. Running two
different advancement models (real-time-paced while connected, instant-batch while away) for the
same state machine is a correctness/drift risk this spec does not recommend accepting. The
precompute-then-pace-delivery approach above avoids this entirely because the *same* instant
simulation runs in both cases; only delivery cadence to a connected client differs.

## What changes elsewhere, and what breaks

**`design/studio/contracts.md`'s Offline settlement algorithm.** The core invariant
(`cappedMs = min(elapsedMs, 28_800_000)`, the 8-hour real-time cap) is already expressed in pure
milliseconds and needs no change. What breaks is the shortcut that depends on a *constant* cycle
length: `rawCycles = floor(cappedMs / 60_000)` is a single division only because every cycle costs
exactly 60,000 ms. With variable per-battle duration, "how many cycles fit in the capped window"
becomes a walk — simulate cycle 1, consume its `nominalDurationMs`, simulate cycle 2, consume its
duration, and so on until the next cycle's duration would exceed the remaining capped window. This
is strictly more expensive than one division, but it is not a new class of cost: `contracts.md`
already resolves cycles one-by-one inside a batch for RNG-stream and inventory-overflow
determinism (baseline.md section 6), so the loop structure already exists; only the stopping
condition changes from "count reached 480" to "cumulative nominal ms reached the capped window."

**The 480-cycle batch cap.** `480 = 28,800,000 ms / 60,000 ms` is a *derived* constant, not an
independent rule — it only exists because cycle length is fixed. Once cycle length varies, "480"
stops being a meaningful number: a run of mostly-short battles could fit 800+ cycles in 8 hours; a
run of mostly-long battles might fit 300. Every place that names "480" as if it were an
independent invariant breaks and must be re-expressed as "however many variable-length cycles fit
under the unchanged 8-hour millisecond cap" — including `scripts/simulate.mjs`'s
`MAX_CYCLES_PER_SETTLEMENT = 480` catch-up benchmark (section below) and any test asserting exactly
480.

**`design/game/economy/baseline.md` section 7 and `tuning.md`'s pacing tables.** These express
milestones as cycle counts *and* as a derived "~X minutes" figure computed by multiplying cycle
count by the constant 60s (`scripts/simulate.mjs`'s `cyclesToMinutes`, `CYCLE_LENGTH_MS`). The
cycle-count figures themselves stay valid and need no re-measurement — they describe reward/XP
pacing (first drop ~2.5-4 cycles, level-3/boss-ready at exactly 12 cycles), which does not depend
on how long a cycle takes to watch. The **minutes columns do break**: "12 cycles ≈ 12 minutes" is
only true at a fixed 60s/cycle. Under variable duration, minutes-to-reach-a-milestone must be
re-derived from the actual round-count distribution of the cycles involved (sum of
`nominalDurationMs` across however many cycles it took), which requires a new simulation metric
that `scripts/simulate.mjs` does not currently collect (it tracks cycle index, not round count per
cycle, for the pacing sweep).

**`scripts/simulate.mjs`'s catch-up benchmark** (`MAX_CYCLES_PER_SETTLEMENT = 480`, `cyclesToMinutes`)
measures "the cost of one 480-cycle (8h) settlement batch." Both the fixed cycle count and the
cycle-to-minutes conversion are hard assumptions of the current fixed-duration model and need
rewriting: the benchmark would instead need to simulate battles until cumulative
`nominalDurationMs` reaches the 8-hour cap (a variable count, likely in the hundreds, not a fixed
480), and report elapsed real compute time per that variable-sized batch. This is a measurement
change only — it does not imply the batch becomes slower to *compute*; the server-side cost is
still dominated by combat simulation CPU time, not by the nominal-duration bookkeeping, which is
pure arithmetic.

**Dungeon floors** (`contracts.md`'s dungeon settlement algorithm) reuse the identical
fixed-length-cycle pattern with `180,000 ms` in place of `60,000 ms`. Everything above applies
there too if floor duration is ever bound to actual floor-clear length; this task does not scope
that decision, but flags that any M3 implementation touching expedition cycle length should decide
up front whether dungeon floors get the same treatment or deliberately diverge (a floor already has
a natural "early-termination on loss" rule contracts.md lines ~596-598 that cycles don't, so the two
are not perfectly symmetric even today).

## Async/offline compatibility — explicit check

The task calls out that expeditions must still resolve while the player is away. The recommended
approach (section "Two separable concerns") satisfies this directly: nothing about offline
resolution changes. The server still computes `creditedCycles`' worth of battles in one instant
transaction on the next `settle`/poll after return; `nominalDurationMs` only governs (a) the
pacing-table math in baseline.md/tuning.md and (b) how a *connected* client is shown a battle, never
how fast the authoritative state advances. The rejected real-time-ticking approach would have
broken this guarantee, which is the main reason it is rejected here rather than left as an open
option.

## Scope note on `design/studio/priorities.md`

This task's brief points to "`design/studio/priorities.md`'s new 'M3 candidate backlog' section."
That section does not exist in this worktree as of this task (`priorities.md` currently ends at its
M2 delivery order, 55 lines, no M3 section). This is flagged as a discrepancy for the Producer/Game
Director, not treated as a blocker: `priorities.md` was still a required input and was read in full;
nothing in this spec depended on content from the missing section.

## Recommendation for M3 sequencing

If the owner wants this pursued as implementation, it is a contracts-and-engine change, not a
documentation-only one: it touches `contracts.md`'s frozen Offline settlement algorithm (cycle
length, the 480 constant), `packages/game`'s settlement-window computation
(`computeSettlementWindowV2`), `apps/server`'s `expeditionService.ts` (settle/poll delivery for the
live-watch path), and `scripts/simulate.mjs`'s pacing/catch-up measurements. Recommended sequencing
for an M3 task graph: (1) CTO amends `contracts.md` to replace the fixed 60,000 ms constant with the
per-battle `nominalDurationMs` formula and restate the offline cap in pure ms (dropping "480" as a
named invariant); (2) Economy Designer re-derives baseline.md/tuning.md's minutes columns from a
round-count-aware simulation metric; (3) Engineering implements `computeSettlementWindowV2`'s
variable-length walk and the live-delivery pacing path; (4) QA re-verifies the offline 8-hour cap and
the live-watch acceptance check end to end.

## Unresolved issues / next task

1. `MS_PER_ROUND`'s exact value is a UX/pacing choice (how "snappy" a watched fight should feel),
   not decided here — it is a Design/Economy call for whoever picks this up next, analogous to how
   `classes.md`'s recruitment-cost constant was left as an explicit placeholder in M2-22.
2. Whether dungeon floors (180,000 ms) get the same treatment is explicitly out of this task's scope
   and should be decided before, not during, M3 implementation.
3. `design/studio/priorities.md`'s missing "M3 candidate backlog" section (see above) should be
   added by the Producer/Game Director before further M3 candidates are scoped, so this and future
   feasibility tasks have a single place to register against.
