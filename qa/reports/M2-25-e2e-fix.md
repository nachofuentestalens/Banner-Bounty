# Update stale tests/e2e scripts for M2-25 contracts and M2 UI — evidence report

Date: 2026-10-22 · Owner: QA Tester · Task ID 94b59481-ae55-42ea-a08b-58e3c124d253

Base revision: `9e740ffcc216b5a3f68b694a0d989d7debb860e9`. Inputs read: `AGENTS.md`,
`design/qa/acceptance.md`, `design/studio/architecture.md`, `qa/reports/M2-07.md`,
`qa/reports/malformed-payloads-rerun.md`, `packages/contracts/src/index.ts`,
`apps/server/src/app.ts`, `apps/server/src/services/partyFormationService.ts`,
`apps/server/src/services/accountStateService.ts`, `apps/server/src/db/seed.ts`,
`apps/server/src/db/migrations.ts`, `apps/server/src/progression.test.ts`,
`apps/web/src/components/NavBar.tsx`, `apps/web/src/screens/Company.tsx`,
`apps/web/src/screens/Boss.tsx`, `apps/web/src/components/BattleView.tsx`,
`apps/web/src/copy.ts`, `design/game/classes.md`, `packages/content/src/v2/classes.ts`,
and the four named e2e scripts (read-only except where fixed, no other product code
changed).

**Note on the task's cited evidence file:** the task brief pointed at
`qa/reports/smoke-2026-10-21.md`, but no such file exists in this worktree (`qa/reports/`
only contains `M1-15.md`, `M2-07.md`, `malformed-payloads-rerun.md`). The task brief's own
description of the four stale call sites was specific and verifiable enough (exact line
numbers in `packages/contracts/src/index.ts:409` and `apps/server/src/app.ts:157`) that this
report proceeded from direct inspection of the current contracts/server/web code instead of
that missing file. Flagging this as a documentation gap, not a blocker.

Machine: Windows 11 Pro 10.0.26200, Node 22.14.0, npm 10.9.2.

## Result: all four named staleness issues fixed and independently re-verified; one new
## pre-existing defect found and filed; one new e2e script added to close the three named
## coverage gaps

## What changed (all within `tests/e2e/`, QA's write scope)

1. **`tests/e2e/api-attacks.mjs`, `tests/e2e/boss-arena.mjs`, `tests/e2e/malformed-payloads.mjs`**
   — replaced every `PATCH /party/order` call (3-element `order` array) with
   `PATCH /party/formation` (5-element nullable `slots` tuple, M2-25). Added a small
   `toSlots(ids)` helper in each file to pad an ordered heroId list to 5 with `null`.
   Updated response-shape assertions from `state.partyOrder` to `state.formation.slots`
   (`accountStateService.ts` now returns `formation: PartyFormationRepository.find(...)`, not
   `partyOrder`). `malformed-payloads.mjs`'s wrong-arity check now uses a 4-element `slots`
   array (invalid for the 5-tuple) instead of the old 4-vs-3 case.
2. **`tests/e2e/browser-ui.mjs`**:
   - A11.6's conflict-toast check used a "Move down" button and `PATCH /party/order` that no
     longer exist (`Company.tsx`'s party reorder UI was replaced by a `FormationEditor` with
     five `<select>`s — "Front row slot 1-3" / "Back row slot 1-2" — and a "Save formation"
     button). Rewrote the check to bump the server revision from a second tab via
     `PATCH /party/formation`, then edit a Formation select and click "Save formation" from
     the stale tab, same conflict-detection intent as before.
   - **A11.1/A11.3/A11.4 are a real regression, not stale selectors** (see "Defect found"
     below) — their button-label selectors (`Expedition`, `Start Expedition`,
     `Stop and Collect`, `Boss`, `Challenge`) are all still exactly correct against current
     copy (`copy.ts`'s `nav_expedition`/`action_start_expedition`/`action_stop_expedition`/
     `nav_boss`/`action_challenge` are unchanged). The failure was a real reachability-budget
     bug in these checks (each capped its Tab-search loop at 20 presses) combined with a real
     product change: the Company screen grew (M2-25's `RecruitPanel` + 5-select
     `FormationEditor` + a now-larger Roster) enough that 20 forward Tabs from the
     screen's auto-focused `<h1>` can no longer reach the nav links on the far side of all
     that new content. Raised the loop bound to 80 in all 7 affected Tab-search loops. With
     that raised, A11.1/A11.3 now pass cleanly and confirm the nav *is* still keyboard-reachable
     — just further away than before.
   - **A11.4's own assertion was dead code**, independent of the Tab-budget issue (see
     "Defect found" below): fixed by using the keyboard-reachable "Skip to end" control to
     reach the real finished state before reading the outcome, instead of reading the outcome
     heading immediately (which now reads "Battle in progress" until ~1s/round autoplay
     finishes, since `BattleView` added paced playback that didn't exist when this check was
     written).
   - Added "Dungeon" to A11.5's 390px five-screen sweep (6th nav screen now exists; this
     wasn't in the "4 stale call sites" list, but it's a one-line coverage improvement, not a
     fix for a defect).
3. **`tests/e2e/combat-replay.mjs`** — replaced every `getByRole("button", {name:"Next action"})`
   with `{name:"Step"}` (the real `BattleView.tsx` control set is Play/Pause, Step, Restart
   replay, Skip to end, Speed — there has never been a "Next action" or "Show result" button).
   Replaced the one `"Show result"` click with `"Skip to end"`. Replaced a stale
   `.includes("HP")` assertion on the action-feed line (current `describeEvent` damage/heal
   phrasing doesn't always contain the literal string "HP") with a check that the line changed
   from its initial placeholder.
4. **`tests/e2e/inventory-overflow.mjs`** — the direct-SQLite seeding fixture inserted into a
   dropped column (`affixId`); the schema is now `rarityId TEXT` + `affixes TEXT` (JSON array)
   per the v4 migration (`apps/server/src/db/migrations.ts:181-182`, matching
   `progression.test.ts`'s own `addItems` fixture). Fixed both `INSERT` statements (seed and
   equipped-item fixture) to the current column set. Also wrapped every direct `DatabaseSync`
   open/use in `try/finally` so a thrown SQL error (as happened here) can no longer leave the
   connection open — this was the root cause of the reported Windows `EBUSY` on teardown:
   `lib/server.mjs`'s `close()` does `fs.rmSync(tmpDir, ...)` right after `app.close()`, and an
   open direct connection from the failed `INSERT` was still holding the file.
5. **`tests/e2e/five-hero-formation.mjs` (new file)** — closes the three explicitly-named gaps
   that "none of these three were confirmed in the 2026-10-21 smoke run": class count (6, per
   `design/game/classes.md` section 1), a full 5-hero party formation via
   `PATCH /party/formation`, and one completed combat replay end-to-end (real boss fight, 5
   side-A combat units, definite outcome, non-empty event log, and a byte-identical refetch by
   report ID — the last part also re-confirms A04's determinism claim on a real stored report).

## Acceptance checklist (this task)

| Item | Result | Evidence |
| --- | --- | --- |
| 1. `/party/order` → `/party/formation` fixed in all 4 named scripts | **pass** | all 4 scripts run clean below |
| 2. `combat-replay.mjs` control names fixed | **pass** | 1/1 run below, screenshots saved |
| 3. `inventory-overflow.mjs` schema + EBUSY teardown fixed | **pass** | 4/4 below, no EBUSY on 2 consecutive runs |
| 4. A11.1/A11.3/A11.4/A11.6 stale-selector-vs-regression triage | **A11.6 was a stale selector (fixed); A11.1/A11.3/A11.4 were a real reachability/dead-code defect, now fixed** | see "Defect found" below |
| 5. Full tests/e2e battery rerun | **6/7 scripts fully green; 1 pre-existing inconclusive check in `boss-arena.mjs` unrelated to this task's fixes** | see per-script results below |
| 6. Class count / 5-hero formation / one completed replay, scripted | **pass, new script** | `five-hero-formation.mjs` 3/3, run twice |

## Exact commands and results

```
npm ci                                    # EXIT 0: 189 packages installed (worktree had none)
npm run build                             # EXIT 0: all 5 workspaces built clean
npm run validate                          # EXIT 0: "Test Files 23 passed (23)"; "Tests 198 passed (198)"

node tests/e2e/malformed-payloads.mjs     # 14/14 checks passed
node tests/e2e/inventory-overflow.mjs     # 4/4 checks passed (run twice; no EBUSY either time)
node tests/e2e/api-attacks.mjs            # 19/19 checks passed
node tests/e2e/boss-arena.mjs             # 7/8 checks passed (A09.3 inconclusive, see below; run twice, same result both times)
node tests/e2e/combat-replay.mjs          # PASS (1 check; screenshots in test-results/combat-replay/)
node tests/e2e/browser-ui.mjs             # 9/9 checks passed (run twice for stability)
node tests/e2e/five-hero-formation.mjs    # 3/3 checks passed (run twice)
```

### api-attacks.mjs (19/19) — representative output

```
PASS A02.4 B cannot reorder party using A's heroIds — foreign heroIds in /party/formation -> 403 forbidden
PASS A07.1 identical retry (same requestId) returns identical result, no double credit — retry returned identical data at revision 2 both times
PASS A07.3 two concurrent settle calls at same revision: only one commits — exactly one of two concurrent settles committed (3 cycles), the other got 409
PASS A05.3 reorder party IS allowed during active expedition (M1-01 decision) — party reorder succeeded while expedition active, as contracted
PASS A06.3 8-hour cap discards excess, repeated collection grants nothing more — 10h offline -> 480 cycles credited, 7.2e6ms discarded, repeat collect -> 0
PASS A08.2 server restart (rebuild in-process, same DB file) reproduces identical /account/state — restart with same DB file -> /account/state deep-equal before/after
19/19 checks passed
```
This single script independently re-covers account isolation (A02), concurrent retries (A07),
offline catch-up (A06/A08.1), and restart (A08.2) — the acceptance areas this task named —
against the current M2-25 contracts.

### combat-replay.mjs — output

```
PASS boss, expedition and arena replay; exact unit counts; step/restart/result; reduced-motion pause; 390px overflow; no browser errors.
Screenshots: .../test-results/combat-replay/
```

### browser-ui.mjs (9/9, run twice) — representative output

```
PASS A11.1 keyboard-only: Expedition nav has visible focus and starts an expedition — Tab reached Expedition/Start Expedition with outline "solid 3px"; Enter started it
PASS A11.3 keyboard-only: collect rewards and reach Boss screen — collected via keyboard; reached Boss screen via keyboard
PASS A11.4 keyboard-only: challenge boss, one-time reward visible then absent — outcome=Victory; reward shown once (keyboard-driven double challenge)
PASS A11.6 conflict toast: stale expectedRevision shows 'Action Rejected' and self-heals — stale-revision mutation from a second tab -> conflict-toast
PASS A11.7 reconnect: server stop produces a reconnect state; restart recovers without reload — offline banner shown=true; recovered after restart + Retry Now=true
9/9 checks passed
```

### five-hero-formation.mjs (3/3, run twice) — representative output

```
PASS class count: exactly 6 base classes shipped, matching design/game/classes.md section 1 — 6 classes: class_arcanist, class_cleric, class_herald, class_ranger, class_rogue, class_vanguard
PASS recruit 2 more heroes (3 starters + 2 recruited = 5) and fill all 5 formation slots — 5 heroes recruited (class_vanguard, class_ranger, class_arcanist, class_cleric, class_herald), formation.slots fully filled with 5 distinct heroIds
PASS one completed combat replay end-to-end: full 5-hero party vs. boss, deterministic outcome and event log — outcome=win, rounds=4, events=39, 5 side-A combat units; refetch byte-identical
3/3 checks passed
```

## Defect found: A11.1/A11.3/A11.4's keyboard-reachability checks had a dead assertion and a
## too-small Tab budget (confirmed real, now fixed in QA's own test code — not a product defect)

Pre-fix, `node tests/e2e/browser-ui.mjs` failed A11.1 ("could not Tab to the Expedition nav
button"), A11.3 (landed on the whole page's text instead of "Stop and Collect"), and A11.4
(landed on "Expedition" instead of "Challenge"). Investigation (reading `NavBar.tsx`,
`Company.tsx`, `copy.ts` directly, not guessing) found:

- The product's nav labels and action-button copy are **unchanged and correct**
  (`nav_expedition`/`action_start_expedition`/`action_stop_expedition`/`nav_boss`/
  `action_challenge` in `copy.ts` all match the selectors verbatim). This is **not** the A11
  accessibility regression the task asked me to check for — the nav remains fully
  keyboard-reachable and correctly labeled.
- The real cause: `Company.tsx`'s `useEffect` auto-focuses the screen's `<h1>` on mount, and
  all three checks' Tab-search loops started counting *from there*, forward only, capped at 20
  presses. `CompanyScreen` grew substantially under M2-25 (`RecruitPanel` + a 5-`<select>`
  `FormationEditor` + "Save formation" + a Roster that can hold up to 20 heroes), so 20 forward
  Tabs from the auto-focused heading can no longer complete a lap back around to the nav
  links. This is a test-code bounded-loop sizing bug exposed by real, legitimate page growth —
  not a case of users being unable to reach the nav (Shift+Tab reaches it in a single press
  from the heading, since the nav is first in DOM order). Raised all 7 affected loops'
  iteration cap from 20 to 80; confirmed this alone fixes A11.1 and A11.3.
- **A11.4 had a second, independent bug**: it read the battle outcome heading immediately
  after pressing Enter on "Challenge" and asserted on it — but `BattleView.tsx`'s playback
  now paces itself (~950ms/round, autoplay since `reducedMotion` isn't set for this page's
  context) instead of resolving instantly like the pre-M2 instant-result view this check was
  originally written against. The heading reads "Battle in progress" during that window, so
  `if (outcome === "Victory") { ...the actual reward-shown-once assertions... }` was silently
  skipped every run — the check reported PASS without ever checking anything. Fixed by clicking
  the keyboard-reachable "Skip to end" control (present in every `BattleView`) before reading
  the outcome, so the real finished state (and the real reward-text assertions) are exercised.
  Verified this fix actually exercises the assertions: confirmed `outcome=Victory` in the
  passing run's own printed evidence line, not just a bare PASS.

**Severity:** none of this reached product code — all three are QA's own test-code bugs,
fixed within `tests/e2e/`. Flagging the A11.4 dead-assertion pattern specifically because it's
the kind of bug that silently erodes acceptance evidence (a PASS that proves nothing); worth a
general QA note to always assert on an *extracted, logged* value rather than gating an assertion
block behind a condition that can silently never trigger.

## Defect found (pre-existing, not introduced by this task): economy tuning drift breaks
## tuning.md's "level 3 at exactly cycle 12, every seed" invariant for at least one account

`boss-arena.mjs`'s A09.3 check is self-guarded (throws "not a confirmed defect" and is reported
as inconclusive, matching the established pattern in `qa/reports/M2-07.md`) when account B
isn't at boss-ready level 3 after 12 expedition cycles. It failed this way on **two separate
runs**, deterministically (manual clock, no real-time variance): `min level 2`, not a flaky
result.

`design/game/economy/tuning.md` (lines 18, 41, 51-52) explicitly freezes "Specialization
unlock (level 3): exactly 12 cycles, every seed, both builds" and states this was re-affirmed
by the owner for M2-23 ("M2-23 preserves that direction"). In the same script, account A's
setup check (identical 12-cycle advance, same code path) *does* reach level 3 for all heroes.
Both accounts start from an identical fresh seed state and the clock is manually advanced
(not real-time), so this difference is reproducible and account/seed-dependent, not timing
noise — which directly contradicts the "every seed" part of the frozen invariant.

**Not fixed by this task** (out of scope: this task's brief named 4 specific stale call
sites, none of which is this; QA's write scope also excludes the economy/tuning code that
would need investigation). Filed here as a new, independently-confirmed finding for Economy
Designer/Systems Designer to triage — it may mean M2-23's XP/level curve shifted without a
recorded tuning.md amendment, or that account-seed-dependent combat RNG (crits, dodges) now
feeds into XP in a way the M1-era curve didn't account for.

## Unresolved issues / limitations

1. The economy-tuning finding above (level-3-at-cycle-12 seed-dependence) is filed, not fixed,
   and not yet triaged by Economy/Systems Designer.
2. `qa/reports/smoke-2026-10-21.md`, which this task's brief cited as the source of the 4
   staleness findings, does not exist in this worktree. The 4 findings themselves were
   independently re-derived and confirmed by direct code inspection, so this doesn't affect
   this report's conclusions, but the missing file itself is worth tracking down (it may
   exist uncommitted in whichever worktree ran that smoke test, or the report may never have
   been saved).
3. `five-hero-formation.mjs` recruits heroes at their class's default primary; it does not
   exercise dual-class assignment (`POST /hero/assign-secondary-class` or similar) or
   formation front/back-row combat positioning rules beyond the 5-slot fill itself — those are
   `design/game/classes.md` section-8/combat-v2 concerns better owned by a task scoped to that
   surface, not this one.
4. This task did not re-run `boss-loss-retry.mjs` or `restart-unaccelerated.mjs` (not named in
   the brief, not touched by any of the contract/UI changes investigated here, and unaffected
   by anything fixed in this task).
5. All screenshots from `browser-ui.mjs`, `combat-replay.mjs` referenced above are saved
   locally under `test-results/` (gitignored, not committed) — available on request but not
   included inline per the evidence format's existing convention for this repo.

## Next task

File the economy-tuning finding (level-3-at-cycle-12 seed/account dependence) to Economy
Designer or Systems Designer for triage. No other follow-up task created by this QA task per
its own instructions (no duplicate backlog entries).
