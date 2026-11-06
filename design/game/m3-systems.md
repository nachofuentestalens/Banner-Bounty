# M3 systems and accessible flows — M3-03 freeze

Date: 2026-10-30. Owner: Systems Designer. Task: `550ab2a3-819a-4a7c-baed-fb0e17d5ba78`.
Status: implementation specification, not implemented or play-accepted. Authority: [M3 gates](../studio/milestones/M3.md).

## 1. Scope and precedence

This document governs G1–G2 and G4–G9 for new M3 play. It supersedes conflicting M1/M2 Design rules and the two M3 candidate documents only on these surfaces. Historical reports, rewards and snapshots are never reinterpreted. CTO M3-05 owns wire/schema/time contracts; Economy M3-04 owns provisional pacing and respec tuning; Narrative M3-06 owns final display copy. Stable IDs and numerical mechanics here are implementable defaults, not measured balance claims.

Preserve level cap 10, roster cap 20, 1–5 distinct active heroes, front slots 0–2/back slots 3–4, two active and two passive slots, free Basic Attack, existing six class curves/kits, both expedition areas, existing dungeon and Tollkeeper level-3 readiness. No new equipment, status type, expedition area, currency, race-change action, multiplayer service or renderer. Exactly two new classes, two primary specializations per class, three races and one additional four-floor dungeon. Existing secondary stat contribution and six named synergies remain; no new named pair bonuses.

New combat uses combat.md §8: 100-round limit, integer floors, per-target dodge/crit, taunt before single-target selection, full HP/fresh effects each battle. Use its v2 Burn (3 stacks, duration 2, ATK/3), not stale M1 values or the contradictory classes.md worked example. Existing production RNG must be versioned, not replaced using the illustrative generator in combat.md.

## 2. G1 — successive reports and playback

An expedition assigns an increasing battle ordinal and immutable report identity independently of browser polling. The account feed also assigns a monotonically increasing completion sequence across run boundaries; pagination uses that sequence, while run/ordinal identify the fight. Every credited battle has an outcome and summary entry. Access is an ordered feed, never a last-report-only field. A fetch after sequence N returns successive retained entries greater than N, next cursor, oldest/newest available sequence and explicit missing ranges. Page size 10; fetching/retrying a page changes no progression or reward. Per-account authorization includes report and cursor access.

Retain the latest **50 full expedition reports per account**, across run boundaries, ordered by server completion sequence; inserting the 51st evicts the oldest. No wall-time eviction within that window. A foreground connected consumer drains all pages, including after a delayed poll. Thus any ten successive completions remain individually inspectable even if delivered in one batch. This guarantee is bounded by 50 later completions, not by a polling interval. At 40 unread retained reports warn that older fights will leave history. Slow readers and paused playback cannot halt server progression.

Persist an account-scoped reader cursor `(runId, ordinal, reportId, eventIndex)` and selected playback state locally across refresh; server is authoritative for availability. Fetch cursor and viewed cursor are separate: downloading never marks a fight viewed. Automatic next-fight playback advances only after the selected report finishes and only when Follow is enabled. Selecting history disables Follow; new data never steals focus or replaces the selected report. Pause keeps its event index while the feed buffers. Next Fight explicitly advances; Show Result reveals this report only. Restart rewinds playback, not combat. Reduced-motion starts paused. Maintain HP/status/formation from initial report state plus recorded events, including defeated actors, and preserve the full text log and damage evidence.

Reconnect fetches from the last downloaded cursor, deduplicates by report ID, and restores the selected report/event. If evicted, show “Fight no longer retained”, missing ordinal range and summary; offer “Open oldest available” and “Return to latest”. Do not silently substitute another fight. A currently loaded evicted report may remain readable until navigation; no server pin/unbounded retention. Invalid cursor/account switch resets to that account's feed with a notice; never exposes another company's private expedition data.

Offline/catch-up may produce more than 50 fights: retain the latest 50, plus one aggregate per settlement containing run/range, wins/losses, elapsed/credited/discarded duration and actual granted rewards/overflow. Retain latest 20 aggregate records per account; older history is explicitly unavailable. No promise of every offline replay. Report eviction does not delete reward receipts or permit settlement replay; CTO separates bounded presentation retention from exactly-once accounting. Boss/dungeon use their existing history policy; season/tournament full reports remain available for the active and immediately previous season (§8–9), independently of the expedition ring.

## 3. G2 and G3 boundary — deferred skills, never retroactive builds

Only active/passive slot edits for a hero in the running expedition are deferred. Primary, secondary, specialization and equipment changes remain barred account-wide while an expedition or dungeon is active. A dungeon freezes all party stats, race, specialization, skills, gear and formation for its entire run. Roster formation editing may update the next-run party but never any running snapshot. There is at most one active PvE run per account. An inactive roster hero's skills remain locked during a run; this is not a second loophole for class or equipment edits.

At a skill-change command's authoritative accepted time T:

1. Serialize with settlement/stop and validate ownership, revision and idempotency. Settle every eligible battle ending at or before T under the prior build/pending timeline. Work may resume in bounded batches; no later mutating command overtakes this command and no new selection enters that overdue history.
2. Preserve any battle with `start < T < end` with its original complete inputs, outcome, duration and seed. It is not credited before its end. Queue the change at its end, for the next battle. If T equals a battle boundary, settle the ending battle first and use the new selection for the battle starting at T. No elapsed partial interval is restarted, shortened or discarded to make a build change convenient.
3. Validate skills against the expedition's **frozen level and fixed class pool**, not the live hero's newly earned level. IDs must match slot kind, be unlocked, and have no duplicates within a kind. Empty slots are valid; Basic Attack cannot occupy a slot. Reject the complete edit on any invalid slot. Newly earned level-5/8 skills require a new expedition; explain the frozen-level lock.
4. Record current and pending selections, boundary ordinal/time and request identity. Update no old report. At boundary apply all heroes' pending selections before the next battle's snapshot, clear pending, and record an applied marker. Recompute passive-derived stats from original class/gear/race baselines, never by accumulating modifiers on old effective stats.

Repeated edits first settle to their own accepted times. For the same still-future boundary, last committed edit wins per hero; otherwise a previous selection may already have governed a battle and cannot be replaced there. Retry of the same request returns its original receipt and does not move its boundary. Cancel pending uses the same ordering: it cancels only an unconsumed selection; if already applied return that fact and current build, not a fictitious cancellation. Different heroes' pending entries are independent; server commit order resolves concurrent edits, with stale revisions rejected.

On stop, settle eligible history at the accepted stop time, retain applied changes in the live hero's skill selection, discard only unconsumed pending edits, and state which were discarded. No reward for a partial battle; no pending entries survive into restart. Pending edits do not modify live selections until applied; application persists selected slots for future runs. Dungeon skill edits are rejected throughout, even between floors. Battle-local death never invalidates a pending change; the next fight starts at full HP.

**G3 handoff:** nominal expedition duration must be a deterministic positive integer function of resolved combat length and frozen rules. `2000 ms/round` is only a measurement candidate, **not a production constant**. M3-04 selects provisional bands; M3-05 specifies accepted-time serialization, persisted partial battle/RNG, eight-hour eligibility cap, rollback high-water clock, resumable catch-up and legacy active-run transition. Required property: identical authoritative commands/times/seeds yield identical state regardless of poll partitions or restart. Precomputation may reveal a planned battle but never grants future rewards. Display pending/in-progress versus credited outcomes distinctly. Dungeons stay **180 seconds per floor (720 seconds maximum for four wins)**; playback speed/pause/skip changes neither clock. CTO must publish worked boundary/cap/rollback examples before production code; this specification does not freeze the candidate's `cyclesCompleted` boundary or 60-second timing.

## 4. G4 — eight classes and sixteen primary specializations

All eight classes are available at recruitment and as secondary choices at level 3. Primary and secondary must differ; null secondary is valid. Existing curves and kit IDs remain unchanged. The two new curves use `base + growth*(level-1)`:

| ID / role | HP base/growth | ATK base/growth | DEF base/growth | SPD |
| --- | --- | --- | --- | --- |
| `class_warder` / defensive support | 38/+5 | 6/+1 | 6/+1 | 7 |
| `class_weaver` / control damage | 29/+4 | 9/+2 | 3/+1 | 10 |

New skill IDs are `skill_warder_<suffix>` and `skill_weaver_<suffix>` below. CD uses combat.md's end-of-use-round decrement. Default offensive targeting is lowest current HP in row-respecting pool, slot tie; taunt overrides single-target actions. Heal/buff targeting ignores rows. Every direct damage hit uses normal dodge/crit; attached offensive status applies only on a landed hit. No extra RNG for buffs, healing or pure status actions.

| Class / suffix | Kind; unlock; CD | Exact effect |
| --- | --- | --- |
| Warder / `tap` | Basic; 1; none | Default target, `basic(ATK,DEF)` damage. |
| Warder / `brace` | Active I; 1; 3 | Lowest HP% living ally (slot tie, self eligible): Fortify +30% DEF for 2 rounds. |
| Warder / `repair` | Active II; 5; 3 | Lowest HP% living ally: heal `floor(ATK*6/5)`; clamp at max HP. Full-health target still legal. |
| Warder / `rooted` | Passive I; 1 | While bearer occupies front row, battle-start-fixed DEF +10%. |
| Warder / `aftercare` | Passive II; 8 | Bearer's Repair additionally grants target Regen for 2 rounds. No effect on other heals. |
| Weaver / `thread` | Basic; 1; none | Default target, `basic(ATK,DEF)` damage. |
| Weaver / `snare` | Active I; 1; 3 | Default target, `basic(ATK,DEF)` damage plus Weaken for 2 rounds on hit. |
| Weaver / `unravel` | Active II; 5; 4 | Highest ATK living enemy across both rows (slot tie), overridden by taunt: remove Fortify if present, then deal `basic(ATK,DEF)` using post-removal DEF. Removal occurs before dodge and is logged even on dodge. |
| Weaver / `tension` | Passive I; 1 | Bearer's direct hits against a Weakened target deal `floor(damage*11/10)` before crit. |
| Weaver / `slip` | Passive II; 8 | Battle-start-fixed dodge +10 percentage points; existing 50% cap applies. |

Specialization unlock is **level 3**, independent of secondary selection. One optional primary specialization, exactly one of two choices, never both; null remains legal and has no effect. Secondary class never grants its specializations. Choosing/clearing/switching is free outside active runs, preserves slots, and affects future snapshots only. It does not consume a skill slot or add an action. Modifiers affect only the bearer's named skill, even when other heroes have that skill. Without that skill slotted the specialization has no effect; codex warns rather than auto-equipping. M3 IDs use `m3spec_` and never reuse retired M1 `spec_*` IDs.

| Primary | Choice A ID / effect | Choice B ID / effect |
| --- | --- | --- |
| Vanguard | `m3spec_vanguard_sentinel`: Bulwark also Fortifies the lowest-HP% other living ally for 2 rounds; no other ally means no extra effect. | `m3spec_vanguard_breaker`: Shield Bash ignores row protection (still obeys taunt). |
| Ranger | `m3spec_ranger_tracker`: Aimed Shot's execute threshold becomes 50% instead of 30%. | `m3spec_ranger_scatter`: Volley selects up to 3 targets instead of 2; same attenuation. |
| Arcanist | `m3spec_arcanist_ember`: Firebolt selects highest-current-HP legal enemy instead of lowest, slot tie. | `m3spec_arcanist_quench`: Meteor removes Haste from each selected enemy before its damage roll, even on dodge. |
| Cleric | `m3spec_cleric_triage`: Mending Light uses multiplier 6/5 instead of 4/5 when target HP% <30; then Devotion applies if equipped. | `m3spec_cleric_shelter`: Sanctuary also Fortifies all living allies for 1 round. |
| Rogue | `m3spec_rogue_duelist`: Backstab targets highest ATK living enemy, slot tie, still row-ignoring and taunt-obeying. | `m3spec_rogue_pursuer`: Flurry reselects its default target before hit 2, permitting a new target after death; if none, omit hit 2. |
| Herald | `m3spec_herald_cadence`: War Hymn removes Weaken from each living ally before granting Haste. | `m3spec_herald_dissonance`: Discordant Verse targets highest ATK living enemy across rows, slot tie, obeying taunt. |
| Warder | `m3spec_warder_anchor`: Brace also Taunts its recipient for 1 round; normal most-recent taunt wins, regardless of caster. | `m3spec_warder_mender`: Repair targets up to two lowest-HP% living allies, each healed `floor(ATK*4/5)` instead of 6/5; Aftercare applies to each. |
| Weaver | `m3spec_weaver_fray`: Snare additionally removes Haste on a landed hit. | `m3spec_weaver_sever`: Unravel selects a Fortified enemy first (highest ATK, slot tie), else its usual target; taunt still overrides. |

All HP% comparisons use floor(100*HP/maxHP). Select AoE target set once, resolve in ascending slot order. Specialization replacement factors apply before existing conditional passive multipliers and crit. Multiple conditional damage multipliers use the existing kit's order then Tension, each floored; crit last, incoming reductions afterward. No recursion from removal or heal events. Both new classes' skills work as secondary skills; only their primary specializations require that primary. Example: Vanguard/Weaver may slot Snare and Tension but cannot select Sever; Warder/Cleric may slot Mending Light but Mender modifies Repair only. Effect removals are immediate explicit events, no-op when absent. Removing Haste removes its attached Choir dodge benefit; removing Fortify leaves unrelated modifiers intact. Taunt granted by Anchor belongs to the recipient and clears on their death or expiry. A discarded second Flurry hit consumes no RNG. These rules apply symmetrically in PvE and PvP.

## 5. G5 — three races and migration

Race is chosen once at recruitment, independent of class, with no class/gear/content restriction or price difference. Compare all three before confirm; default selection is explicit, never random. Starter and migrated heroes receive `race_vesper`. Race changes are out of scope.

| ID / working name | One bounded passive tradeoff |
| --- | --- |
| `race_vesper` / Vesperkin | max HP +5%, ATK -5% |
| `race_cairn` / Cairnfolk | DEF +10%, SPD -1 flat |
| `race_serein` / Serein | SPD +1 flat, max HP -5% |

Race applies once in the battle-start passive layer of classes.md §2.1.5: add all flats, then summed percentages with existing clamp; floor HP to at least 1, ATK to at least 1, DEF to at least 0, SPD to at least 1 after that layer. No aura, scaling, RNG or extra slot. UI uses server-computed before/after stats. These are tradeoffs, not a claim of equal measured strength.

Migration is atomic/versioned/idempotent: assign Vesperkin and null M3 specialization to existing heroes; preserve primary, secondary, XP/level, skills, gear, formation, inventory, claims and currencies; initialize respec timestamp null (eligible). Do not infer M3 specialization from a retired M1 value. Existing valid secondary duplicates, if any legacy save permits primary==secondary, remain a labelled legacy state until next class edit, which must choose different/null; deduplicate skill pool and preserve historical stat semantics under the old rules. Do not silently charge or erase builds to repair it.

Existing active runs continue with their captured old rules/builds through stop/completion; new hero fields affect only new M3 snapshots. No mixed-rules partial battle. The new deferred editor is unavailable on a legacy active run (“Finish this older run to queue skill changes”). Old snapshots/reports remain immutable and readable; they are ineligible for M3 competition and require a new entry. No conversion of old results or retroactive reward edits. Restart during migration must either resume the transaction safely or see its complete version, never apply race twice. M3-05 must define old executor availability and persisted-run transition before implementation.

## 6. G6 — codex, respec and free switching

Codex is read-only and server-sourced, available before recruitment, secondary selection, specialization and respec, including while a run locks editing. List all eight classes, primary curves at levels 1–10, secondary 25% contribution, role, Basic/Active/Passive kinds, all unlock levels (1/5/8), cooldowns, targeting/taunt/row exceptions, numerical effects, conditions, synergies and both specializations. Show locked skills with their level, not as equip options. Explain that inspecting a draft secondary does not unlock it. Show three race tradeoffs and no race locks. Selecting “Inspect” changes no pick; returning preserves draft and focus. Server catalog rules version must match mutation preview or force refetch.

Paid primary respec is available only when the account has **no active expedition or dungeon**. Cost starts at `100*L gold + 5*L scrap + (L>=5 ? 1 : 0) sigil`, cooldown 24 server hours per hero. M3-04 may amend these provisional cost/cooldown values before M3-05 freezes contracts; formula shape and exact preview/reset semantics are fixed here. No escalation or lifetime cap. Level 1/5/10 examples: 100/5/0, 500/25/1, 1000/50/1.

Confirm preview, supplied by server and tied to revision/rules, shows old/new primary and secondary, cleared specialization, all four resulting slots, unchanged level/XP/race/gear, exact cost, balance/shortfall and next eligible timestamp. New primary must differ. Optional secondary omitted preserves it if compatible; if equal to new primary reject and require explicit clear/change (never silently clear). Secondary below level 3 must be null. Primary+secondary change charges once. Same-primary request is rejected without charge/reset/cooldown and links to free secondary switching.

On confirmed success in one transaction: debit exact resources, change classes, clear M3 specialization to null, reset Active 1=primary I, Active 2=primary II if level>=5 else empty, Passive 1=primary I, Passive 2=primary II if level>=8 else empty; set last-respec server time; increment revision and store receipt. These are four shared slots, not “two secondary slots”. Preserve all other hero data and recorded snapshots. Route to build editor to freely customize. No charge for re-equipping skills or specialization afterward.

Validate ownership/session before idempotent receipt lookup; identical request retry returns original success even if now on cooldown or a run started. Different payload with same key rejects; stale revision, active run, insufficient funds, incompatible class, cooldown or changed preview rejects without partial debit/reset. Changed costs/level require a fresh preview and explicit reconfirmation, not automatic resubmission. Cooldown eligibility is `serverNow >= lastRespecAt + 24h`; rollback never accelerates it. Show server deadline, not client-calculated authority.

Secondary-only set/clear remains **free, no cooldown**, level>=3, outside active runs. Preserve valid slotted skills in their positions; remove only skills no longer in resulting pool, leaving those slots empty. No automatic replacement/reordering, no specialization reset, no respec timestamp update. Preview exactly which slots clear before confirm; unchanged secondary is a no-op receipt. Invalid duplicate slot IDs reject. These semantics resolve the candidate's unspecified secondary reset.

## 7. G7 — one additional dungeon

`dungeon_cinder_archive` (working title Cinder Archive), exactly four floors, binds existing `reward_dungeon_2` ordinary/final rows in economy/gear.md. No extra first-clear grant or BossClaim. Unlock: account has a successful full `dungeon_aqueduct_depths` clear; persist a clear fact from a server outcome, never inventory inference. Migrate from a retained verifiable clear record if present; otherwise mark locked until a new clear, without removing any prior reward. Intended entry: five level-5 heroes with equal-budget uncommon gear for tactical evaluation; 1–5 heroes may attempt once unlocked, no level or class restriction. Catalog always shows both dungeons including locked ones and both areas remain available unchanged.

New enemies (fixed stats, no growth):

| ID | HP | ATK | DEF | SPD | Behavior |
| --- | --- | --- | --- | --- | --- |
| `enemy_archive_binder` | 85 | 13 | 10 | 8 | Round %3==1: self Fortify 2 rounds; otherwise row-respecting lowest-current-HP hero, basic damage. |
| `enemy_archive_spark` | 52 | 14 | 4 | 12 | Each round: lowest-current-HP hero across rows, basic damage; taunt overrides. |
| `boss_archive_custodian` | 360 | 18 | 10 | 9 | Four-round pattern below. |

| Floor | Exact occupied slots |
| --- | --- |
| 1 | Binder 0, Spark 3 |
| 2 | Binder 0, Spark 3, Spark 4 |
| 3 | Binder 0, Binder 1, Spark 4 |
| 4 | Custodian 0, Spark 3 |

Custodian action: rounds %4==1 self Fortify 2; %4==2 “Index”: lowest-HP% living hero across rows (slot tie, taunt overrides), `floor(basic*3/2)` plus Weaken 2 on hit; %4==3 default row-respecting lowest-current-HP target, basic; %4==0 “Cinder Sweep”: all living heroes, `max(1,floor(ATK*7/10)-floor(DEF/2))` each, ascending slot order, independent rolls, no status. All generic offensive single-target actions obey taunt. No summon/revive, hidden scaling or immunity. Victory requires defeating boss and add; timeout/loss ends run. Every floor starts full HP; no between-floor loadout edits; each completed floor requires 180 elapsed server seconds. Failed floor grants nothing; prior earned floors stay earned; abandon settles elapsed eligible floors then stops, never refunds or claws back. Retry begins floor 1 with a fresh snapshot and seed. Grant/advance/report writes are exactly once.

Server dungeon catalog supplies stable ID, name/copy reference, rules version, lock reason, clear requirement/result, four ordered floor summaries and enemy previews, 180-second timing, reward profile/preview and party validation. Client selects by returned ID; server validates it at start. Unknown/stale IDs or changed unlock state reject and refresh, never fall back to dungeon 1. Display no seeded future loot as guaranteed. Catalog is metadata, not a reward claim endpoint.

Predicted contrast: taunt protects the healer from Sparks; row-ignoring attackers remove backline Sparks before Binders; Weaver strips Fortify, Warder sustains the front. Existing Vanguard/Rogue/Arcanist/Cleric provide alternatives, so neither new class is mandatory. M3-07/10 must compare at least 32 paired seeds per chosen pair, equal level/gear/stat budget, record exact skills/formation, clear rate, rounds, normalized surviving HP and survivors; include a no-new-class clear and counterexamples. These hypotheses are not yet simulation evidence; do not compensate for failure by inflating rewards.

## 8. G8 — seven-day local snapshot season

One local ruleset with repeated consecutive seven-day windows. Server persists epoch E when M3 competition initializes; season k is `[E+7d*k, E+7d*(k+1))`. Epoch never resets on restart. Use authoritative nondecreasing time; client clock is display-only. At a boundary finalize old scheduled records before opening the next season; a long absence skips empty seasons without creating opponents or rewards. Retain full active and immediately previous season histories; older seasons retain compact per-account rank/title/score receipts, no guaranteed replay. PvE progression never resets.

Season entry unlocks with Tollkeeper clear. Enter during first 24 hours only, one entry per local account, 1–5 owned heroes. Server copies the currently selected live company with levels, classes, race, specialization, slots, gear effects, formation, derived stats, rules/content version and immutable snapshot identity. Entry may happen while PvE runs because it only copies the live roster; preview explicitly distinguishes the live company from an active run's frozen party. Show stats as-is: no level normalization. One rules version for the entire season; upgrades wait until next season. Old-version published snapshots cannot enter; create a compatible new snapshot. Unknown/unsupported data rejects, never approximates.

Entry confirmation locks that snapshot immediately for the season and tournament; later PvE edits, publications or respec never replace it. No entry after first 24h (“Next season opens …”), no automatic human entry. Before lock deadline an entrant may withdraw irreversibly for this season; no re-entry or replacing a weak snapshot. At deadline form exactly four competition seats from up to two entered local humans plus labelled server fixtures. Empty/withdrawn human seats become fixtures. With zero humans show “Fixture-only demonstration”; never imply human competition.

Fixtures use IDs `fixture_m3_01` through `fixture_m3_04`, filling unused seats in ascending ID, visibly “Server fixture” in entry, standings, bracket and report. Each is five level-5, unequipped Vesperkin heroes in slots 0..4, null secondaries/specs, primary I/II actives and I passive, Passive 2 empty. Primary compositions: 01 Vanguard/Cleric/Ranger/Rogue/Herald; 02 Warder/Vanguard/Weaver/Cleric/Arcanist; 03 Vanguard/Ranger/Herald/Cleric/Weaver; 04 Warder/Rogue/Ranger/Arcanist/Cleric. No adaptation to human builds; fixtures have no spendable account inventory/rewards. They are examples, not population or balance evidence.

At the 24h lock, freeze participants and schedule a double round robin: each unordered pair has **two** matches, swapping team A/B between legs (combat speed-tie advantage therefore shared). Each entry has **six eligible matches**, two per opponent, no manual rematches that award points. Schedule resolution order: pair lexicographic entry IDs, leg 1 then 2; lower ID is team A leg 1. Server fixes one distinct seed per season/pair/leg and stores it before resolving; seed never comes from client. Retry retrieves the same match. All six can resolve asynchronously after lock; no online presence needed. Archived friendly challenges never affect this score and are labelled unranked.

Score per match: win 3, draw 1 each, loss 0; maximum 18. Timeout or simultaneous elimination is a draw. Rank by points descending, then wins descending, then stable entry ID ascending (display “ID tiebreak”; no hidden HP/grind metric). No head-to-head recursion. At least one played ranked match required for recognition. Late/non-entry has no rank/score; fixtures can rank and win but remain labelled fixtures. After lock there is no season withdrawal or deletion: frozen commitments finish even if account becomes inactive. Before-lock withdrawal has zero matches/points and no title. Do not turn completed results into forfeits retroactively.

At end archive standings and grant only a season-labelled recognition title to rank 1 (fixture win is labelled and gives no human title). No gold, XP, items, materials, stats, discounts or ongoing buffs. New season starts empty and requires fresh entry. Results, score additions and title receipt are transactional/idempotent by season/match/entry keys; repeated refresh, retry or restart cannot duplicate them.

## 9. G9 — four-entry asynchronous tournament

Exactly one tournament per season, using the same four locked entries/snapshots from §8. Entry preview explicitly opts into both season and tournament. No separate new lock, team changes, paid entry or live lobby. Tournament locks at 24h and seeds ascending stable entry ID, independent of season standings: semifinals 1v4 and 2v3, then winners play final. No third-place match. Lower seed number is team A; server stores match seeds at bracket creation. Three battle records maximum, shared replay, independent of the season's six-match allowance and points.

A decisive combat result advances its winner. On draw/timeout compare sum of `floor(10000*remainingHP/maxHP)` over each side's original heroes divided by that side's original hero count (integer floor; dead heroes contribute zero); higher wins. If equal, more surviving heroes; if equal, lower seed advances. The replay still says “Combat draw” and separately gives advancement reason and compared values; never rewrite combat to claim a kill. No sudden-death match or reroll.

Pre-lock withdrawals already get fixture substitution. Post-lock withdrawal is unavailable, labelled “Snapshot locked; matches finish automatically”; leaving the page or stopping PvE is not withdrawal. An unavailable human account's snapshot remains usable. Defensive bye rule for an unusable seat: unsupported/corrupt snapshot is an operational error, pause bracket rather than fabricate a win. An explicitly vacant seat in recovery has a persisted vacancy reason: opponent advances by bye with no combat report or win score; two vacant seats yield a vacant semifinal winner, one vacant finalist yields a bye champion, both yield no champion. Normal creation always fills four seats, so byes are recovery-only and clearly labelled; they award no new currency or stats.

Persist bracket lock, snapshots, seeds, winner links and report IDs; atomic exactly-once resolution creates an advancement only after its two input seats are final. A crash before commit repeats same inputs/seed; after commit reads existing result. Requesting final before semifinal resolution returns pending, never live-roster simulation. Bracket ends as complete/no-champion; winner receives only season-labelled tournament title, separate from standings, no extra season points. A bye-only champion with no played match gets no title. Reopen after restart must show identical bracket/history, including fixtures, byes and tiebreak reasons.

## 10. Accessible flows and state handling

Extend the existing ledger UI; no new navigation framework required. All actions use semantic buttons/inputs, visible focus, stable labels; minimum tap target 44×44 CSS px. At 390×720 stack panels, wrap text; any table scroll is in a labelled keyboard-focusable region, never page overflow. Contrast at least 4.5:1 body text/3:1 large text and controls; no color-only status. Inspection is available by button/Enter/Space/tap, not only hover. Escape closes disclosures/dialogs and restores trigger focus. Modal confirmation traps focus and returns it on cancel; opening never commits. Reduced motion disables battle animation and starts paused. Announce meaningful state changes politely, not every HP tick.

| Flow | Inputs, confirmation and stable outcome |
| --- | --- |
| Watch | Fight list with ordinal/result; select, Play/Pause, Next Action, Restart, speed, Show Result, Previous/Next Fight, Follow latest. Keyboard/tap all work; focus stays on current control during incoming pages. Reconnect/eviction offers explicit recovery (§2). Full log remains inspectable while paused. |
| Queue build | Company → hero → four labelled slots with current/pending comparison → Save for next eligible fight. Show frozen-level locks and boundary ordinal; receipt says pending, applied, superseded or discarded on stop. Cancel pending does not reset playback. Dungeon and legacy-run editors show inline lock reason while help remains available. |
| Recruit/pick | Inspect class/race first; native radio/select choices; preview level-1 stats, price and initial slots before Recruit. Codex return retains draft. Specialization picker shows both choices and their affected skills; null/clear is explicit. Locked choices explain level/run reason. |
| Respec | Hero → Inspect → choose different primary/optional secondary → server preview → Confirm exact spend/reset or Cancel. Show all four new slots, cleared specialization and deadline. In-flight disable submit; response loss offers receipt retry with same ID. Success opens editor; rejection preserves draft and refreshes preview, requiring confirmation again. |
| Free secondary | Preview “Free; no cooldown”, cleared slot list and preserved specialization → Confirm. No paid respec endpoint or full-kit reset. |
| Dungeon | Catalog → locked/available card → four floor previews, timing and rewards → party snapshot preview → Start. Running floor/elapsed/credited distinction, inspect reports, Abandon confirmation with earned/partial-floor explanation. Completion/failure offers explicit fresh attempt, no auto-restart. |
| Competition | Show local-only and fixtures disclosure, server start/entry-close/end dates with timezone, eligibility and locked roster preview → Confirm season+tournament entry. Before lock show Withdraw confirmation; after lock show locked reason, standings, remaining eligible matches and bracket. Each match links the same shared replay with snapshot identities, fixtures and tie/bye labels. Ended season links archive; next season requires new entry. |

Every flow has loading, empty, pending, offline/stale, validation/insufficient-resource, conflict, server-error and success states. Keep last confirmed data and draft on network failure; never show speculative success. Automatic retries are read-only or use the same mutation key; conflicting state requires fresh preview, not a new-key automatic mutation. Account switch clears private cached views/cursors/drafts. Unknown legacy report mechanics display recorded text/evidence only, no reconstruction from current stats. Final wording belongs to M3-06, but the meaning and distinctions in this table are mandatory.

## 11. Observable verification map

These are executable acceptance procedures for downstream work, **not results of this design task**. Capture rules revision, seed, input snapshot/command timeline, expected and actual state, report IDs and UI evidence. G0/G10 remain Director/QA gates.

| ID / gate | Required observation and edge cases |
| --- | --- |
| S01 / G1 | Complete ten consecutive expedition fights; delay a poll until all ten finish; inspect each ordinal and full report in order, no duplicates/gaps. Pause at event 3, refresh/reconnect and recover same identity/event; incoming fights do not replace it. |
| S02 / G1 | Generate 51+ completions, including offline batch; oldest eviction shows explicit missing range and oldest/latest actions. Latest 50 full reports and latest 20 settlement summaries bounded; totals match receipts, replay grants nothing. Test cross-account cursor rejection. |
| S03 / G2–G3 | Submit at T within a partial fight after several overdue completions; old history/current partial retain old build, next boundary uses new. Compare one catch-up, many partitions and restart for identical outcomes/rewards/RNG/partial time. Test exact boundary, >8h gap, rollback and no future rewards. |
| S04 / G2 | Queue twice, retry original, cancel before/after application, concurrent stop, death and restart. Verify per-hero latest pending semantics, unchanged historic reports, applied selections persist, unconsumed selection discarded on stop. Reject frozen-level-locked skill and every dungeon edit. |
| S05 / G4 | Catalog has 8 classes/16 primary choices. Exercise both new full kits at levels 1/3/5/8/10 and every specialization's triggering/nontriggering case. Reject both choices/secondary specialization/duplicate slots/same primary-secondary on edit. Test Warder/Cleric and Vanguard/Weaver plus existing named synergies in PvE and PvP; compare identical seed runs. |
| S06 / G5 | Recruit all three races across new/existing classes; verify tradeoff arithmetic/floors, no locks/price difference. Migrate twice/restart mid-migration: defaults deterministic, no currency/build erasure or race double-application. Old active runs and published snapshots retain old stats/results. |
| S07 / G6 | Before pick, inspect every class including locked skills/specs/races using keyboard and tap; zero mutation on inspect. At L1/5/10 preview and confirm exact respec cost/slots/null spec; insufficient sigil, active run, cooldown, same-primary and stale preview reject atomically. Retry after response loss charges once. Secondary-only clears only invalid slots for free, leaves cooldown/spec unchanged. |
| S08 / G7 | Catalog returns exactly two dungeons and both areas persist. Test unlock with verified old clear/new clear/no clear; stale ID rejects. Four floors take 180s each, frozen builds, loss/abandon/retry do not duplicate or reverse earned rewards. Run §7's 32 paired-seed tactical matrix and no-new-class clears; record counterexamples. |
| S09 / G8 | Server-clock entry at deadline-1/deadline, withdrawal, no-entry/late entry, zero/one/two humans; all fixtures labelled. Four seats, six matches each, two/opponent, max18 points, stable ties. Edit live team/re-publish/retry/restart: snapshots, seeds, reports and points unchanged. At seven-day boundary archive exactly once, new empty season, PvE state preserved and only recognition rewards. |
| S10 / G9 | Same four entries lock once; three matches maximum; normal win, timeout/double-defeat HP/survivor/seed ties, recovery single/double bye, corrupt-seat pause. Retry simultaneous advancement and restart: same bracket/report IDs/title; no extra score or reward. No post-lock withdrawal or roster edit affects matches. |
| S11 / all UI | Keyboard-only and tap walkthrough at 1280×720 and 390×720, reduced motion, long text, offline/recovery and stale revision: visible focus, no hover-only info, confirmation cancel has no effect, no focus theft/overflow, exact pending/locked/fixture/draw/bye labels. |

## 12. Technical handoffs within the existing graph

- **M3-04 Economy:** provisional G3 duration/progression bands (not fixed 2000 ms), respec price/cooldown affordability with 1/3/5 heroes and 30/84/480 credited minutes/day; recognition-only competition; no retroactive reward rebalance. Measure fresh/migrated progression, not fixed-level income alone.
- **M3-05 CTO:** own precise schemas/endpoints/catalogs, rules-version pinning/migration, command-time ordering and bounded resumable old-history settlement, cursors/retention/summary accounting, immutable snapshots, seed storage, monotonic season clocks and idempotent advancement. Preserve §2–9 behavior; record contract amendments in Leadership docs before M3-07. Unsupported legacy executors need an explicit preservation strategy, not silent re-simulation.
- **M3-06 Narrative:** names/help/copy for these IDs and all locked/pending/evicted/fixture/late-entry/bye states; replace stale exactly-three/retired-M1-spec UI copy. No additional content.
- **M3-07–11:** implement then measure/test S01–S11. Numerical combat defaults are unmeasured; failures return through existing owners, not reward edits that conceal combat imbalance. No new duplicate tasks are requested by this specification.
