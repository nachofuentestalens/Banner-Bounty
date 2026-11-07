# Fix: scripts/walkthrough.mjs stale hero-card locator — evidence report

Date: 2026-11-07 · Owner: Tools Engineer · Task ID 1b32fced-f7e8-40dd-ac69-0437f6390f69 · Priority 5 (QA Tester)

## Gap

`scripts/walkthrough.mjs` targeted `section.hero-card h2` and `section.hero-card` to read the roster and
drive the dual-class/loadout flow. `apps/web/src/screens/Company.tsx` was redesigned by
`first-session-redesign.md` to render each hero as `<li class="hero-row"><details><summary>{ordinal} Lv
{level}...</summary><details><summary>Build</summary><HeroBuild/></details></details></li>` — there is no
`section.hero-card` or `h2` anywhere. The three starter heroes are present and visible in the DOM
("Vanguard 1 Lv 1", "Ranger 1 Lv 1", "Arcanist 1 Lv 1"); this was a stale locator, not a missing-roster
game bug, confirming QA's diagnosis.

Fixing just that locator surfaced three more of the same class of problem from the same redesign, each of
which would otherwise abort the walkthrough before the task's required "formation/dispatch/collect" bar or
shortly after it:

1. The front-row formation editor changed from `<select>` comboboxes (`getByRole("combobox", {name: "Front
   row slot N"})`) to a toggle-button + radio-list picker (`FormationSlot` in `Company.tsx`). Used in step 2
   (company A) and step 8 (company B).
2. The dual-class/loadout controls in `HeroBuild` sit inside two nested, collapsed `<details>` elements
   (the hero row, then its "Build" disclosure) that must be expanded by clicking their `<summary>` before
   the "Assign"/"Save loadout" buttons and selects are interactable. There is also no `h2` anywhere to
   check "secondary class reflected in hero heading" against.
3. `Expedition.tsx` no longer renders a per-collect "Credited cycles: N" message; it shows a cumulative
   "Fights credited so far: {cyclesCompletedSinceStart}" counter instead (first-session-redesign.md
   section 7's Spoils rework). Used in steps 4 and 9.

## Fix

- `heroHeadings` now reads `li.hero-row > details > summary` (the outer, direct-child summary only — the
  nested "Build" summary is excluded by the `>` child combinators).
- Added a `swapFrontRowSlots(page)` helper that reads each front-row slot's toggle-button label, opens the
  slot's picker, and checks the radio for the other hero's label — used by both step 2 (company A) and step
  8 (company B), replacing the stale `selectOption` calls. Formation-swap assertions now compare
  `/account/state` slot heroIds before/after instead of reading `<select>` `inputValue()`.
- Step 5's dual-class flow now clicks both `<summary>` elements to expand the hero row before interacting
  with "Assign"/selects/"Save loadout" (button names "Assign" and "Save loadout" were unchanged by the
  redesign, confirmed against `apps/web/src/copy.ts`). Dropped the `h2`-based "secondary class reflected in
  heading" check — no UI element carries that text post-redesign — since the existing API-level assertion
  right after (`dualHero = ...find(h => h.secondaryClassId !== null); assert.ok(dualHero, ...)`) already
  fails loudly if the assignment didn't persist.
- Steps 4 and 9 now assert the credited-cycle delta via `(await accountState(ctxA)).expedition
  .cyclesCompletedSinceStart` before/after each settle call, instead of waiting for now-absent "Credited
  cycles: N" text.

No change to game/server code or any design document — this is a test-script-only fix for a UI markup drift
that the walkthrough hadn't been updated for.

## Acceptance checks

| Check | Result | Evidence |
|---|---|---|
| `npm install` in this isolated worktree | pass | 189 packages added, 0 vulnerabilities after audit |
| `npm run build` | pass | contracts/game/content/server/web all built cleanly; `tsc --noEmit` + `vite build` for web succeeded |
| `npm run walkthrough` against a fresh isolated DB/port (default behavior: temp dir under the OS temp folder, server bound to an ephemeral port, both created fresh per run) | **9 of 11 steps pass**, well past the required "formation/dispatch/collect" bar | See run log below |
| Step 2 "select company A; inspect roster; reorder formation" (roster presence + formation swap) | pass | `PASS 2 ... formation slots 0/1 swapped (Vanguard 1 <-> Ranger 1) and persisted (...0002, ...0001)` |
| Step 3 "start expedition ... lock explanations shown" (dispatch) | pass | `PASS 3 ... lock note: "Loadout Locked: ..."` |
| Step 4 "collect progression; close/reopen; collect again" (collect) | pass | `PASS 4 ... 5 then 3 cycles credited; gold=70, inventory=3` |
| Step 5 dual-class/loadout assignment (beyond the required bar, fixed incidentally) | pass | `PASS 5 ... dual-classed secondary=class_cleric; loadout persisted for ...0001` |
| Steps 6, 6b, 7, 8, 9 (boss battle, playback controls, arena publish/challenge, cross-account isolation, server restart durability) | pass | see run log |
| Step 10 "recruit a 4th hero" | **fail — unrelated, pre-existing staleness, out of this task's scope** | `locator.selectOption: Timeout 30000ms exceeded ... waiting for locator('.recruit-panel select#recruit-class')` |

### Run log (final run, abbreviated)

```
PASS 1 load built client from API; fresh data dir — GET / 200, health schemaVersion=4, db=...\save.sqlite (980 ms)
PASS 2 select company A; inspect roster; reorder formation — starters: Vanguard 1 / Ranger 1 / Arcanist 1 ...; formation slots 0/1 swapped (Vanguard 1 <-> Ranger 1) and persisted (189 ms)
PASS 3 start expedition on the selected area; lock explanations shown — lock note: "Loadout Locked: This hero is out on expedition. Gear and specialization are froz" (84 ms)
PASS 4 collect progression; close/reopen the browser page; collect again — 5 then 3 cycles credited; gold=70, inventory=3 (242 ms)
PASS 5 stop; equip a drop; reach level 3; assign a secondary class and loadout — equipped "Iron Band of Haste (Uncommon)" ...; levels Vanguard 1 Lv 3 / Ranger 1 Lv 3 / Arcanist 1 Lv 3; dual-classed secondary=class_cleric; loadout persisted for 00000000-0000-4000-8000-0000000a0001 (228 ms)
PASS 6 challenge boss; full battle view shows units/HP/statuses; reward granted only once — first=Victory, 4 unit panels, badge="Already Claimed", gold 280 -> 280 (102 ms)
PASS 6b playback controls: step, pause, speed and skip-to-end stay in sync with HP/log shown — ... Victory (30098 ms)
PASS 7 company B in a separate context publishes its team — published; cross-account secondary-class attempt -> 403 (228 ms)
PASS 8 A challenges B; B alters team; A's saved report unchanged — outcome=win; report identical after B edit; B reading A's report -> 404 (284 ms)
PASS 9 restart server; both saves and elapsed progression survive — revisions A=11 B=3 preserved; 4 cycles credited across downtime (166 ms)
FAIL 10 recruit a 4th hero; roster exceeds the 3-hero party cap — locator.selectOption: Timeout 30000ms exceeded

walkthrough: 9/11 steps passed; ACCELERATED clock
console errors: A: 401 Unauthorized || B: 401 Unauthorized (pre-existing dev-mode probe noise, present before this fix too — see Unresolved)
```

Run with `PW_CHANNEL=chromium` against Playwright's own Chromium build (system Edge was not verified this
run); fresh temp SQLite DB under the OS temp dir and an ephemeral server port each run, per the script's
existing isolation (`fs.mkdtempSync`, `listen({ port: 0 })`); no paid/cloud dependency.

## Unresolved

- **Step 10 onward (recruit, area select, dungeon, crafting, 390px keyboard nav) were not fixed — out of
  this task's scope.** They fail or may fail on the *same class* of stale-locator drift from
  `first-session-redesign.md`, independently of the hero-card issue this task targeted. Confirmed for step
  10: `RecruitDisclosure` in `Company.tsx` now renders a `<fieldset>` of radio inputs
  (`name="recruit-class"`), not `<select id="recruit-class">`. Steps 11–14 were not reached this run and
  were not individually audited against the redesign.
- The `401 Unauthorized` console error on both contexts predates this fix (present in the original stale-
  locator run too, before any script changes) and did not block any step; it looks like an expected
  rejected probe (e.g. an early unauthenticated request before session selection) rather than a regression,
  but was not root-caused since it's outside this task's bug.
- Ran under `PW_CHANNEL=chromium`; the script's default (`msedge`) was not separately re-verified in this
  session.

## Next task

Recommend a follow-up Tools Engineer (or QA Tester) task to bring steps 10–14 of
`scripts/walkthrough.mjs` in line with the `first-session-redesign.md` markup (starting with the recruit
panel's select→radio change identified above), so the full release-candidate walkthrough passes end to
end. Not opened as a new backlog task here per this task's instruction to work only on the assigned ticket;
flagging it in this report for the owner/QA Tester to prioritize.
