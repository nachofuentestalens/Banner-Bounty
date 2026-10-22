# M1-13: Pacing tuning decision

M2 note (2026-10-21, M2-23): [gear.md](gear.md) section 7 contains the M2
week-one analytical targets; production measurement belongs to M2-28. Historical
M1 results below do not validate combat v2. The historical decision-log gap described
below is now resolved: `design/decisions.md` contains two 2026-10-18 owner approvals
to retain level-3 boss readiness. M2-23 preserves that direction.

Owner: Economy Designer. Inputs: `design/game/economy/baseline.md` section 7 (hypotheses),
`reports/engineering/M1-12.md` (simulation evidence), a repeat `scripts/simulate.mjs` run on a
second independent build/seed base (this task, see `design/game/reports/M1-13.md`).

## Decision: no change to any XP/gold/drop/overflow value in `baseline.md` sections 1-6

| Milestone | Target (`first-playable.md`) | Measured (M1-12, 48 seeds + this task, 24 seeds) | Verdict |
| --- | --- | --- | --- |
| First equipment drop | ~5 min | median 2.5-4 cycles (min 1, max 9-25) | within band — no change |
| Specialization unlock (level 3) | 10-15 min | exactly 12 cycles, every seed, both builds | within band — no change |
| First boss clear | 20-40 min | exactly 12 cycles, every seed/spec/gear combo, both builds | **outside band, see below** |

**Why no economy-table change fixes boss readiness.** Boss-ready is not gated by a reward number;
it is gated by `combat.md`'s level-3 specialization unlock plus the Tollkeeper's fixed stats in
`content.md`, both outside this document's and this task's write scope. M1-12 showed the Tollkeeper
is winnable the instant level 3 is reached, regardless of gear or specialization choice (even the
fully unequipped/unspecialized case wins, margin thin: 2 of 3 heroes died in that trace). Since
boss-ready is mechanically pinned to "the cycle level 3 is reached" in the current engine, the only
economy lever that could move it — slowing XP/cycle or raising `xpToNext` — would move
specialization-unlock by the same amount, since they are the same event. Specialization-unlock is
currently exactly on target (12 of a 10-15 min band); slowing it to chase the boss-readiness band
would break a number that is already correct, to compensate for a different system's stat balance.
That is the speculative-fix pattern this task is scoped to avoid.

**What changed instead:** `design/game/economy/baseline.md` section 7's hand-derived hypothesis
band for boss readiness is corrected to match validated simulation evidence (12 cycles, not the
20-40 min / level-4-5 band), per the freeze rule's "changing a number here requires a recorded
decision" — this is a correction of a previously-labeled hypothesis, not a reward-table change.

**Owner's answer, verified against `design/decisions.md` (still not present there).** This task
asked the owner directly, twice, in the dashboard conversation: once inline, then again as a
formal `question` block re-raising it after a review flagged the first reply as unlogged. Both
times the owner answered the same way — most recently, verbatim: "Yes, boss-readiness stay at level
3 as measured." That is an unambiguous, repeated answer to the actual question asked.

What this task does **not** have: a corresponding entry in `design/decisions.md`. Checked directly
in this worktree after the second answer — the file still contains only two 2026-10-17 entries
(M1-04/M1-06 dependency ordering); nothing mentions boss readiness, level 3, the Tollkeeper, or this
task. An earlier draft of this document claimed the question-block channel "is the mechanism that
produces a logged entry there" and that this "closes the open item" — that claim was asserted, not
verified, and a review correctly rejected it. This document no longer makes that claim.

**Decision taken for this task's own deliverables:** proceed on the owner's repeated, explicit
answer — keep boss readiness at level 3, no `content.md`/`combat.md` hardening — since that is the
best available signal and nothing in this conversation contradicts it. **What remains genuinely
unresolved:** whether this constitutes a frozen decision with the same standing as M1-02/M1-04's
decisions.md-backed freezes, given the log has no entry for it. That gap is not something this
economy-scoped task can close by writing more text here; it is a question for the owner/coordinator
about why the question/answer exchange isn't appearing in the log, not a design question this role
should keep re-asking a third time with no new content.

## Effects of the no-change decision

- **Offline rewards (8h/480-cycle cap):** unaffected — no reward number changed. Catch-up benchmark
  reconfirmed healthy on this task's rerun (p95 6.69 ms, well under the 2000 ms provisional target;
  `recentCycles` bound held). XP/gold totals for a full 480-cycle catch-up scale linearly with the
  unchanged per-cycle values, so M1-04's offline-reward math stands as published.
- **Loss streaks:** 0 losses observed across 72 total swept runs (48 in M1-12, 24 in this task), two
  independent builds. The `0 XP / 0 gold / no drop` loss rule is not contested by any evidence
  gathered; no loss-cushioning mechanic is warranted.
- **Boss readiness:** see decision above — documentation correction only, no reward-table change.
  The thin combat margin (2/3 heroes dying in the unequipped trace) is a combat-balance signal, not
  a reward-table one; it is called out for the owner but not acted on here.
- **Viable specializations:** all 8 real specialization combinations plus "unspecialized" won the
  boss at level 3 in the swept data (round-robin across both this task's and M1-12's seeds, 0
  losses in any combo). No specialization is mechanically required or favored at this gate, so no
  reward number needs to be weighted toward or against any specialization.

## Focused rerun for M1-14

Because this task makes no change to any reward/XP/drop/overflow number or any game-logic file,
M1-14's verification does not need to repeat the full 48+24-seed sweep or the catch-up benchmark —
those measured unchanged inputs and already have two independent confirmations. M1-14 should run,
after integrating this task's `baseline.md` section 7 edit:

1. `npm run simulate -- --seed=1 --runs=8 --max-cycles=100` — reproducibility PASS and a quick
   distribution sanity check (first-drop/level-3/boss-ready numbers should match the shape already
   reported here: level-3/boss-ready at cycle 12, first drop within a few cycles).
2. Confirm `design/game/economy/baseline.md` section 7's table text matches this document's
   "Measured" column (a diff/read check, not a new simulation).
3. `npm run validate` only if any code path was touched by integration (none is expected, since this
   task is documentation-only); skip it otherwise to avoid repeating an unrelated passing check.

No other rerun is required unless a future task changes `content.md`'s Tollkeeper stats or
`combat.md`'s level-3 gate, at which point the boss-ready row must be re-measured from scratch.

## M2-28: M2 pacing and class-balance tuning from simulation evidence

Owner: Economy Designer. Date: 2026-10-21. Inputs: `design/game/economy/gear.md` section 7,
`reports/engineering/M2-26.md` (engine delivery + `scripts/simulate.mjs --mode=v2`), a fresh
`node scripts/simulate.mjs --mode=v2` run (3 seed bases, 500 total v2 runs) on this task's own
build. Full commands/results are in `design/game/reports/M2-28.md`.

**Decision 1 — correct `gear.md` section 7's week-budget math to the actual shipped dungeon
(no code change).** Section 7's worked week budget was written against a hypothetical
"if M2-31 supplies a three-floor introductory dungeon" before M2-31 ran. M2-31 actually shipped
`dungeon_aqueduct_depths` as a 4-floor dungeon (3 ordinary + 1 boss), confirmed by this task's
sim (`avgFloorsProcessed: 4`, `clearRate: 1` across 500 runs). Section 4's own formula at `n=4`
gives different per-clear/day/week numbers than the `n=3` placeholder. Corrected in `gear.md`
directly (documentation-only — section 7 is pacing narrative, not a value `packages/content`
reads; sections 2-5's actual reward-profile numbers were already right and are unchanged).

**Decision 2 — no reward-table change for the team-building-contrast gap; this is a
combat/content balance question, not an economy one (same reasoning pattern as M1-13's
boss-readiness finding above).** The existing `v2TeamBuildingContrast`/`v2DungeonBenchmark`
harness (built by M2-26 specifically as "evidence infrastructure for M2-28's tuning pass") shows,
at the only levels it tests (5 for Old Road, 8 for the dungeon), **no measurable contrast**: a
balanced party (tank/healer/DPS) and a glass-cannon party (3 DPS, no tank, no healer skills) both
win every encounter 100% of the time, with the glass-cannon build clearing marginally *faster*
(fewer rounds) across all 3 seed bases tested (500 runs total). This is the same shape of finding
as M1-13's boss-readiness gap: no XP/gold/drop/material number in this document or `gear.md`
changes *why* a glass-cannon party currently wins as reliably as a balanced one — that is
`content.md`'s enemy/boss stats and `combat.md`'s AI cadence (Systems Designer's authored
surface), not a reward amount. Per the M1-13 precedent, this task does not speculatively edit
numbers outside its own write scope to chase a different system's balance signal. Flagged as an
open item for the Systems Designer / Game Director (M2-30) below, not acted on here.

**Decision 3 — request a harness extension from the Gameplay Programmer rather than fabricate
unmeasured evidence.** `gear.md` section 7 asks for 1/3/5-hero sweeps, offline-partition timing,
a week-length material/gold ledger, a legacy-gold-vs-material-constraint test, and
guaranteed-material-failure recovery — none of which `scripts/simulate.mjs --mode=v2` currently
supports (it has exactly two fixed party presets and two fixed levels). Rather than report
invented numbers, this task documents the gap and sends one scoped task block to the Gameplay
Programmer to extend the harness; a follow-up tuning pass reruns against the extended harness
once that lands.

See `design/game/reports/M2-28.md` for the full evidence table, exact commands, and unresolved
issues.
