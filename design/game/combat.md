# Combat rules (M1-02 freeze)

This document is the frozen numeric/behavioral surface for `packages/game`'s battle simulation. It implements the discrete-round contract in `first-playable.md` ("Combat rules to freeze") against the state shapes frozen in `contracts.md`. All math is integer; every division specified below is a floor (truncating) integer division unless stated otherwise. Changing a number or rule here after `packages/game` implementation starts (M1-05+) requires a recorded decision in this file.

Reward quantities (XP, gold, drop/affix probabilities) are **not** specified here; they belong to the economy table (M1-04). This document only fixes combat *outcomes* (damage, healing, status, win/loss/draw) that the economy table consumes as inputs.

## 1. Actors and stats

Four stats per actor, all non-negative integers: `HP` (current/max), `ATK`, `DEF`, `SPD`. There is no separate magic stat in M1 — `ATK` drives both the Arcanist's and the Vanguard's/Ranger's damage and the Warden's healing; class identity comes from the action each class takes and its specialization, not from a second offensive stat.

### 1.1 Hero base stats and per-level growth

`statAtLevel(level) = base + growth * (level - 1)`, levels 1-10, evaluated independently per stat.

| Class | HP base | HP growth | ATK base | ATK growth | DEF base | DEF growth | SPD (fixed, all levels) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Vanguard | 40 | +5 | 7 | +1 | 6 | +1 | 8 |
| Ranger | 32 | +4 | 9 | +2 | 4 | +1 | 12 |
| Arcanist | 28 | +4 | 10 | +2 | 3 | +1 | 9 |

SPD does not grow with level in M1 (keeps turn order stable and easy to reason about as heroes level). Example: a level-5 Vanguard has `HP = 40 + 5*4 = 60`, `ATK = 7 + 1*4 = 11`, `DEF = 6 + 1*4 = 10`, `SPD = 8`.

### 1.2 Effective stat computation order (per battle, computed once at battle start from `frozenLoadout`/live stats)

1. `leveled = statAtLevel(level)` per stat (1.1).
2. `equipped = leveled + sum of equipped items' flat bonus for that stat` (base item bonus + affix bonus if any; see `content.md` 2.1). Unequipped slots contribute 0.
3. `effective = equipped` with the hero's specialization modifier applied (3.2-3.7 define each spec's exact modifier, if any; a hero with no specialization — pre-level-3 or deliberately unspecialized — uses `effective = equipped` unmodified).

`effective` stats are fixed for the whole battle except where a rule below explicitly re-reads current HP (e.g., Berserker's HP<50% check, which reads *current* HP each time it would act, not a one-time snapshot).

### 1.3 Enemies and the boss

Enemy and boss stats are fixed content values (`content.md`), not derived from hero level. M1 does not scale Old Road enemies or the Tollkeeper to hero level — this is a deliberate simplification recorded as a limitation in the evidence report; a difficulty tier system is out of M1-02's scope.

## 2. Round structure

A battle runs up to 100 rounds. Each round:

1. **Speed order.** Collect all currently-living actors on both sides. Sort by `SPD` descending. Tie-break, in order: (a) heroes before enemies, (b) ascending slot index — hero party position 0/1/2 (per `PartyOrder`), enemy slot index 0/1/2 as listed in that encounter's composition (`content.md`). This produces one fully deterministic ordering per round; it is recomputed each round only because the living set changes, not because SPD changes (SPD is fixed for the battle per 1.2).
2. **Actions.** Walk the speed order. For each actor, if it is still alive at the moment its turn arrives (an actor killed earlier in the same round by an earlier actor's action does **not** act — "a defeated actor cannot act later that round", `first-playable.md`), resolve its action: the class default action, or its specialization's override if it has one (section 3). Damage/healing/status apply immediately, visible to every subsequent actor's targeting this round.
3. **End-of-round status ticks.** In the same speed order (living-at-this-point actors only), resolve damage-over-time ticks (currently only Burn, 3.5). Clamp HP to 0 on lethal ticks.
4. **Status duration decrement.** Every active status's remaining duration decrements by 1; a status at 0 remaining is removed before the next round starts.
5. **Resolution check** (section 5): if a side has been fully reduced to 0 living actors, the battle ends this round. Otherwise, if `round == 100`, the battle ends in timeout. Otherwise, proceed to round `round + 1`.

HP is clamped to `[0, maxHP]` after every change (damage, heal, status tick). An actor at `HP == 0` is defeated and is excluded from all future speed-order computations, targeting, and status ticks in the battle.

## 3. Actions

### 3.1 Targeting rules (shared)

- **Hero action targeting an enemy** (the common case — default actions and most specs): target the living enemy with the lowest *current* HP. Tie-break: lowest enemy slot index.
- **Enemy action targeting a hero**: target the living hero in the lowest party position (position 0 = front). This is the only place "front position influences enemy targeting" (`first-playable.md`) applies; it is unconditional — enemies never pick by HP.
- **Hero action targeting an ally** (Guardian's guard assignment, Warden's heal): target the living ally with the lowest *current HP as a percentage of max HP* (`floor(HP*100/maxHP)`); ties broken by lowest party position. An actor may target itself only where stated (Guardian's own HP counts toward its own guard assignment the same as allies).

### 3.2 Class default actions (used whenever a hero has no specialization, or by heroes whose spec does not override the default)

- **Vanguard — Strike**: deal `damage = max(1, ATK - floor(DEF/2))` to the default-targeted enemy, where `DEF` is that enemy's current DEF.
- **Ranger — Quick Shot**: same formula and target rule as Strike.
- **Arcanist — Arcane Bolt**: same formula and target rule as Strike.

All three class defaults use an identical damage formula; class identity in M1 comes from stat spread (Vanguard tankier/slower, Ranger fastest, Arcanist highest ATK) and from specialization, not from a different base formula per class.

### 3.3 Specialization unlock and switching

- A hero may pick a specialization once `level >= 3` (matches `contracts.md`'s `/hero/specialization` validation). Below level 3, the hero has `specializationId = null` and always uses its class default action (3.2).
- Switching is free and unlimited outside an active expedition. `contracts.md`'s `active_expedition` lock blocks `/hero/specialization` while an expedition is running; switching takes effect immediately for the next battle simulated after the call commits (boss/arena fights use live `specializationId` at challenge time; expedition cycles use the `frozenLoadout` captured at `/expedition/start`, so a mid-expedition switch has no effect until the expedition is stopped and restarted — consistent with `contracts.md` worked example 9/10).
- No specialization is required to clear any M1 content. Section 6's viability note shows unspecialized heroes can clear the Old Road; specializations change *how* a fight goes (faster kills, more sustain, more tankiness), not *whether* it is winnable, satisfying `first-playable.md`'s "no mandatory specialization" requirement.
- There are no cooldowns on any ability in M1. Every automatic ability (default action or spec override) is evaluated fresh each time its actor's turn comes up in the speed order; "automatic" means the engine chooses the action and target per the rules below, never a player-scripted choice.

### 3.4 Vanguard specializations

- **Guardian** ("protect an ally"): at the start of the Guardian's turn, it assigns guard to the lowest-HP%-living ally per 3.1 (itself included in the candidate pool, so a Guardian that is itself the lowest-HP% actor guards itself, which is a no-op redirect). The Guardian's action becomes **Guard Strike**: identical target/damage to Strike (3.2) against the enemy, but its `DEF` for its own damage-taken calculations this battle is `effective DEF + 2` (flat, applied in step 1.2.3). Additionally, for the remainder of the round (until the next round's guard assignment), any damage an enemy action would deal to the guarded ally is split: `floor(damage/2)` is redirected to the Guardian instead (clamped by the Guardian's own current HP, never dealing more than lethal-then-overkill-discarded to the Guardian), and the ally takes the remainder `damage - floor(damage/2)`. If the Guardian is defeated before the redirect resolves, the full original damage applies to the ally instead (redirect requires a living Guardian).
- **Berserker** ("trade resilience for damage"): `effective ATK = floor(equipped ATK * 7 / 5)` (+40%) and `effective DEF = floor(equipped DEF * 4 / 5)` (−20%), computed once at battle start (1.2.3). Its action is **Reckless Strike**: identical target rule to Strike; damage is `max(1, ATK - floor(targetDEF/2))` using the boosted ATK, and if the Berserker's *current* HP at the moment of acting is `< floor(maxHP/2)`, that damage is further increased by 25%: `floor(damage * 5 / 4)`. The HP check re-reads current HP every time the Berserker acts (not a one-time battle-start snapshot), so the bonus can turn on mid-battle as the Berserker takes damage.

### 3.5 Ranger specializations

- **Marksman** ("finish weakened targets"): its action is **Aimed Shot**. Target selection: among living enemies at `floor(HP*100/maxHP) <= 30`, pick the lowest-HP one (tie by slot index); if none qualify, fall back to the standard lowest-current-HP target (3.1). Damage: `max(1, ATK - floor(targetDEF/2))`, then `floor(damage * 3 / 2)` (+50%) **only if** the execute-threshold target was selected (the fallback shot does not get the bonus).
- **Pathfinder** ("support party tempo"): passive, no override to its own action (it still uses Quick Shot, 3.2). Its presence grants the whole living party `+2 SPD` for the battle, applied once at battle start to every hero's `effective SPD` before the first round's speed-order sort (1.2.3, read as "if this hero is Pathfinder-specialized, the whole party's SPD is already +2 by the time section 2 step 1 runs"). If a party fields a Pathfinder but the Pathfinder itself is later defeated, the SPD bonus persists for the remaining rounds (it was applied once at battle start to all actors' fixed `effective SPD`, not re-evaluated per round).

### 3.6 Arcanist specializations

- **Pyromancer** ("damage over time"): its action is **Firebolt**: identical target/damage to Arcane Bolt (3.2), and additionally applies (or refreshes) a **Burn** status on the target (3.7).
- **Warden** ("healing and sustain"): its action is **Mend** — it does not damage an enemy. Target: the living ally with lowest HP% per 3.1 (itself eligible). Heal amount: `floor(ATK * 4 / 5)` (80% of ATK), applied to the target's current HP, clamped at the target's max HP (any excess is discarded — "healing cap", matching the overflow-discard pattern `contracts.md` uses for inventory). If every ally is already at full HP, Mend still resolves (heals the tied-lowest-position full-HP ally for 0 net effect) rather than falling back to a different action — there is no damage fallback for Warden.

### 3.7 Burn status (stacking and duration)

Burn is the only status effect in M1. One actor may hold at most 2 Burn stacks at once.

- **Apply/refresh**: when Firebolt hits a target that has 0 Burn stacks, it applies 1 stack with `duration = 3` (rounds remaining, counted at step 4 of section 2). When Firebolt hits a target that already has 1 Burn stack, it adds a 2nd stack and **resets duration to 3** for the combined stacks (refreshing, not stacking durations independently). When Firebolt hits a target already holding 2 stacks (the cap), the hit still deals its direct damage, but the Burn application is ignored — stacks stay at 2 and duration is **not** reset.
- **Tick**: at section 2 step 3 of every round in which the actor holds at least 1 Burn stack, it takes `stacks * floor(ATK_of_the_Pyromancer_who_applied_it / 4)` damage, where the stored value is the Pyromancer's `effective ATK` at the moment Burn was last applied/refreshed (not re-read later, so a Pyromancer's own level/equipment changes after applying Burn never retroactively change an already-ticking Burn). If the Pyromancer that applied Burn is defeated before a tick, the tick still uses that stored value (Burn is independent of its caster's survival once applied).
- **Expiry**: at step 4, duration decrements by 1; at 0 remaining, both stacks are removed simultaneously (there is no partial expiry of a single stack while the other remains — refreshing always resets both together).

## 4. Healing cap

Healing (Mend, 3.6) clamps at the target's max HP; the excess above max HP is discarded and produces no other effect (no overheal shield, no banked healing). This is the only healing source in M1.

## 5. Victory, death, and timeout

- **Death**: an actor at `HP == 0` is immediately defeated, removed from all further speed-order computation, targeting pools, and status-tick resolution for the rest of the battle (it cannot act later in the same round, and cannot be targeted, healed, or ticked afterward).
- **Victory**: the moment one side reaches 0 living actors (checked at step 5, after actions and status ticks for that round have fully resolved — never mid-round), the battle ends.
  - All enemies dead, at least one hero alive: **win**.
  - All heroes dead, at least one enemy alive: **loss**.
  - Both sides reach 0 living actors in the same round (e.g., simultaneous Burn ticks defeat the last hero and the last enemy at step 3): **loss** in PvE and boss battles; **draw** in arena. (This case is not reachable by the two Old Road/Tollkeeper encounters in `content.md` under the stat tables given, since enemy damage output cannot simultaneously zero out the last hero while that hero's own queued action/tick also zeroes the last enemy in the same resolution pass without an explicit tie — it is specified here only to make the engine's branch fully determined, matching `first-playable.md`'s "deterministic timeout/draw" requirement.)
- **Timeout**: if round 100 completes (step 5) with both sides still having at least one living actor, the battle ends in timeout: **loss** in PvE and boss battles, **draw** in arena (`first-playable.md`).
- Every battle begins with every participant at full HP and no active statuses, regardless of any status/HP state left over from a previous battle in the same expedition cycle (`first-playable.md`: "each battle begins with full HP and fresh battle-local effects").

## 6. Worked examples

All examples use the level-1 base stats from 1.1 with no equipment unless stated, and the Old Road enemy stats from `content.md` (`enemy_road_brigand` HP50/ATK9/DEF4/SPD7 slot0, `enemy_road_wolf` HP35/ATK11/DEF2/SPD11 slot1, `enemy_road_cutpurse` HP30/ATK8/DEF2/SPD10 slot2).

1. **Speed order and ties.** Party: Vanguard(SPD8, pos0), Ranger(SPD12, pos1), Arcanist(SPD9, pos2) vs. brigand(SPD7,slot0)/wolf(SPD11,slot1)/cutpurse(SPD10,slot2). Sort by SPD desc: Ranger(12), wolf(11), cutpurse(10), Arcanist(9), Vanguard(8), brigand(7). No SPD ties here, so the hero-before-enemy/slot-index tie-break is unused in this example — see example 2 for a tie.
2. **A genuine SPD tie.** Two enemies both at SPD10 (hypothetical reskin), slots 1 and 2: both sort after any higher-SPD actor and before any lower one; between them, slot1 acts before slot2 (ascending slot index). If a hero and an enemy ever shared SPD, the hero acts first regardless of slot/position (heroes-before-enemies tie-break).
3. **Targeting.** Round 1, all enemies at full HP (50/35/30): lowest-HP enemy is the cutpurse at 30, so every hero's default action (and Marksman's fallback, and Arcane Bolt) targets the cutpurse until its HP drops below another enemy's, at which point targeting re-evaluates live each action (e.g., if the cutpurse is brought to 10 HP and the wolf is still at 35, every subsequent hero this round continues targeting the cutpurse, not the wolf, since 10 < 35).
4. **Damage and death mid-round.** Ranger (ATK9) acts before Arcanist in round 1 (example 1's order). Ranger hits cutpurse (DEF2): `max(1, 9 - floor(2/2)) = max(1,8) = 8` → cutpurse at 22 HP. Suppose cutpurse is instead already at 6 HP from a prior round: Ranger's 8 damage reduces it to 0 → cutpurse defeated immediately. When the Arcanist's turn comes later the same round, the cutpurse is excluded from targeting (already removed from the living set) even though the round isn't over — "a defeated actor cannot act later that round" also means it cannot be targeted later that round.
5. **Status stacking and refresh.** A level-3 Pyromancer (ATK10) Firebolts the brigand in round 1: 1 Burn stack, duration 3, stored tick-ATK=10. Round 2, Firebolt hits the brigand again (now at 1 stack): adds a 2nd stack, duration resets to 3, tick-ATK for both stacks is now 10 (the same Pyromancer, unchanged ATK). End of round 2: tick damage `= 2 * floor(10/4) = 2*2 = 4`. Round 3, Firebolt hits again: already at 2 stacks (cap) — direct Firebolt damage still applies, but the Burn application is ignored, so duration is **not** reset; it continues counting down from the round-2 refresh (2 remaining after round 2's decrement, 1 remaining after round 3's). Round 4: duration reaches 0 after the decrement, both stacks removed together — no tick in round 5 unless Firebolt reapplies.
6. **Healing cap.** A level-3 Warden (ATK10) Mends a Vanguard ally at 58/60 HP: heal `= floor(10*4/5) = 8`; raw result would be 66, clamped to 60 — the 2 excess HP is discarded, no other effect.
7. **Victory.** Round N: the last living enemy (say the wolf at 6 HP) is hit by the Arcanist's Arcane Bolt for `max(1,10-1)=9` damage, dropping it to 0. All three enemies are now dead and at least one hero is alive → the battle resolves as a **win** immediately at step 5 of that round; no further rounds run, no status ticks from already-acted heroes this round are skipped (they already resolved in step 3 before the step-5 check).
8. **Timeout.** A hypothetical stalemate composition where neither side's damage can out-pace the other's effective HP within 100 rounds reaches round 100 with both sides still having living actors: the engine stops and returns timeout. In a PvE Old Road cycle or a boss challenge this is recorded as a **loss** (no reward, per `first-playable.md`); in an arena challenge it is recorded as a **draw**.
9. **Guardian redirect.** Guardian (effective DEF includes +2 flat) guards the Arcanist (lowest HP% this round). An enemy action would deal 10 damage to the Arcanist: redirect sends `floor(10/2)=5` to the Guardian and the remaining `10-5=5` to the Arcanist. If the Guardian is at 4 current HP when the 5-damage redirect lands, the Guardian drops to 0 (defeated) — the 5 damage is still fully applied to the Guardian (no partial clamp beyond 0; "overkill" damage is simply discarded, matching the universal HP-clamp rule in section 2), and the Arcanist still only took 5, not 10.
10. **Berserker threshold.** Level-1 Berserker: `equipped ATK=7` → `effective ATK = floor(7*7/5) = floor(9.8) = 9`; `equipped DEF=6` → `effective DEF = floor(6*4/5) = 4`. At full HP (40), Reckless Strike deals `max(1, 9 - floor(targetDEF/2))` with no bonus. Once the Berserker's current HP drops to 19 (`< floor(40/2)=20`), the same hit's damage is further scaled by `floor(damage*5/4)` — e.g. a base 7 becomes `floor(7*5/4)=8`.
11. **No-spec viability (full trace).** Level-1, unequipped, unspecialized party (Vanguard pos0/Ranger pos1/Arcanist pos2) vs. the three Old Road enemies (section 6 header stats), focus-fire lowest-HP target, enemies default-target the lowest living party position: cutpurse dies end of round 2, wolf dies end of round 3 (Vanguard also dies round 3 to the wolf, after which Ranger becomes the front target), brigand dies end of round 7 — a clean **win**, Ranger ending at 4/32 HP and Arcanist at 28/28 HP, well inside the 100-round cap. This confirms 3.3's claim that no specialization is required to clear Old Road content; specializing only makes the same fight faster or safer.

## 7. Alignment with M1-01

- Battles never read a client-supplied clock or RNG seed; `packages/game` battle functions take `{ state, rulesVersion, rngSeed, elapsedDuration }` per `contracts.md`'s package-interface rule. Combat in M1 is fully deterministic given participants and action order, so `rngSeed` is accepted (for interface consistency and to leave room for future randomness) but **unused** by any formula in this document — re-running the same matchup with the same stats always produces the same result.
- Expedition cycles simulate against `frozenLoadout` (equipment + specialization fixed at `/expedition/start`); boss and arena challenges simulate against live hero stats at challenge time. Both cases use the same formulas above — only which stat snapshot feeds `effective` (1.2) differs.
- Reset/loadout: every battle starts all participants at full HP with no active statuses (section 5), regardless of the outcome of a previous cycle's battle in the same expedition — this matches `first-playable.md` and introduces no additional carry-over state beyond what `contracts.md` already tracks (`Hero.level/xp`, `Hero.equipment`, `Hero.specializationId`).
- This document fixes combat *outcomes*, not reward quantities: XP/gold/drop amounts per cycle/boss/arena result are the economy table's responsibility (M1-04), consumed as "given a win/loss/draw and participant list, grant X" — no numbers here compete with that table.
