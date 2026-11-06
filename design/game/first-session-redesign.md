# First-session redesign

Owner: UI Designer. Task `f5910ec9-59da-44cd-97fc-0448643177d0`. Date: 2026-10-29. Status: implementation specification, additive to [interface.md](interface.md) and [ui-spec.md](ui-spec.md); neither is rewritten. Gameplay rules, rewards, timing and server authority are unchanged. Anything that needs new server data is listed in section 10 and stays unresolved until that contract exists.

## 1. Evidence status

**NOT PLAYED.** The UI Designer seat has file read and search only, with no shell or browser, so no build was run and no screenshot was taken at 1280x720 or 390px. Findings come from source at baseline `714f932`. Timings are derived from code constants, not measured. Engagement statements are hypotheses for the implementation playtest (section 11, FS-12) to confirm or reject.

## 2. Findings (source-observed)

| ID | Screen | Observation (file) | Proposed behavior |
| --- | --- | --- | --- |
| F1 | Expedition | The first visible combat comes at least 60 s after dispatch and only after a manual Collect (`apps/web/src/screens/Expedition.tsx:10,185-193`). Until then the only feedback is a hedged countdown. | Section 6: an activity panel shows the status at once; the live fight once contract S1 exists; until then a clearly labelled latest recorded fight. |
| F2 | BattleView | A replay is headed `Battle in progress` (`components/BattleView.tsx:201`). | Section 6.3 labels. Replays are never called live or in progress. |
| F3 | Company | About 20 edit controls appear before any purpose; the banner only switches tabs (`screens/Company.tsx:12-30,259-278`). | Section 4: next-step card, formation board, collapsed hero rows. |
| F4 | Company | The seed puts the Arcanist in the front row (`apps/server/src/app.test.ts:254`); this is not surfaced. | Section 5, guided step 2. |
| F5 | Company | Heroes are identified only by class (`Company.tsx:122,205`). | Ordinal labels (4.3); real names would need contract S3. |
| F6 | Company | No unsaved-changes indicator on formation or loadout. | Dirty marker plus a save bar (4.2, 4.3). |
| F7 | Expedition | The settlement shows bare totals and is lost on navigation (`Expedition.tsx:41,115`). | Section 7: persistent Spoils panel. |
| F8 | Expedition | Collect and Stop look the same. | Collect is primary; Stop is secondary (6.1). |
| F9 | Copy | Offline-cap copy says nothing is lost, but the UI prints discarded seconds. Overflow copy implies a choice the game doesn't offer. Lock copy says specialization. (`copy.ts:57,61,65`) | Copy keys in section 9; Narrative Designer to align. |
| F10 | Nav, Area, Dungeon | No Codex; locked content gives no unlock reason (`Expedition.tsx:100`, `Dungeon.tsx:125-128`). | Section 8 and section 3 nav. |
| F11 | Recruit | Bare class select, no descriptions (`Company.tsx:53-59`). | Class summary plus a Codex link (4.4). |
| F12 | Mobile | Battle text at .68 to .8rem (`styles.css:392,428-429`). | Type scale in section 3. |
| F13 | Onboarding | `onboarding_first_expedition` is never rendered. | Used by the guide in section 5. |

Hypothesis (not observed): the session feels unrewarding mainly because of F1 and F7 (more than a minute of nothing after the first decision, then a reward that vanishes), and confusing mainly because of F3 and F10.

## 3. Global layout and visual system

**Shell, top to bottom:** NavBar, then ActivityStrip (new, on every authenticated screen), then toasts, then the screen.

**ActivityStrip** is a single row. Left: activity status text (`activity.idle`, `activity.expedition_running`, `activity.dungeon_running`, all built from account state). Right: one action button that goes to the activity screen (Dispatch, Watch / Collect, or Open dungeon). It never mutates anything; mutations stay on their own screens. Polite live region; it changes only when the status changes, not every 5 s poll.

**Nav:** Company, Expedition, Dungeon, Inventory, Boss, Arena, Codex (Debug only when enabled). A locked destination stays reachable, with a short text suffix and a full accessible name (for example `Dungeon, locked: defeat the Tollkeeper`). It is never colour alone and never disabled. At 640px and below the nav wraps into a 4-column grid (2 rows), with no horizontal scroll and tap targets of at least 44px.

**Spacing scale:** 4, 8, 12, 16, 24, 32 px. Panels use 16 px padding (12 at 390px) and 24 px gap between sections.

**Type scale (system fonts):** body 1rem, line-height 1.5. h1 1.5rem; h2 1.25rem; h3 1.05rem. Secondary text 0.875rem minimum. Badges and row labels 0.8rem minimum, never below 0.75rem at any breakpoint (this replaces the .68 and .7rem rules). Use tabular numerals for HP, XP, gold and timers.

**Colour:** keep the existing tokens (`styles.css:6-16`). Exactly one brass primary button per screen region; secondary buttons are outline (border `--color-border`, text `--color-text`); destructive-leaning actions (Stop) are secondary, never brass. Success is teal plus text and danger is red plus text; a state never depends on colour alone. Verify at least 4.5:1 for text and at least 3:1 for component boundaries and focus rings with a contrast checker, and record the values in the implementation report.

**Responsive:** at 1280x720 the ActivityStrip and the screen's primary action are visible without scrolling. At 390px, panels stack in a single column; the primary action sits in the panel's first row, and the ActivityStrip stays sticky at the top (max 56 px tall). There is no page-level horizontal overflow; wide tables scroll inside a labelled `role=region tabindex=0` container.

**Keyboard and motion:** keep every ui-spec.md global convention (real buttons, `:focus-visible`, focus moves to h1 on navigation, DOM order equals visual order). With reduced motion: no transitions or animated damage numbers, battle playback starts paused, and the live view (6.2) shows the current state with a manual `Follow live` button.

## 4. Company (the muster)

### 4.1 Hierarchy

    [h1 Company]                        Gold 120 | Roster 3/20
    +-- Next step ------------------------------------------+
    | Send your company down the Old Road.  [Dispatch ->]   |
    | Why: your heroes fight on their own and earn XP/gear. |
    +-------------------------------------------------------+
    +-- Formation ---------------------- [unsaved] [Save] --+
    | FRONT  [Vanguard 1 Lv1] [Ranger 1 Lv1] [Arcanist 1]   |
    | BACK   [ empty ]        [ empty ]                     |
    | Tip: back row is protected until the front row falls. |
    +-------------------------------------------------------+
    Roster
    > Vanguard 1   Lv 1  XP ====---  HP 120 ATK 9 DEF 6 SPD 4  Gear 0/3  [Build v]
    > Ranger 1     ...
    > Recruit a hero (next costs 450 gold)  [v]

(The numbers in the sketch are placeholders; the UI shows server values only.)

Desktop: Next step and Formation full width, roster rows below. At 390px, the same order stacked; formation slots wrap 2 per row with the row label above.

### 4.2 Next-step card and goal ladder

One card, always first. The text comes from the first unmet goal, derived purely from account state in a tested `rules.ts` function, with no client progression:

1. No expedition or dungeon has run, and every hero is Lv 1 with XP 0: dispatch (opens the guide, section 5).
2. An expedition is active: watch the fight or collect.
3. An unequipped item exists and a fielded hero has an empty slot for it: equip (opens Inventory filtered to that slot).
4. A hero is Lv 3+ with no secondary class: choose a secondary class (expands that hero's Build, with a Codex pairing link).
5. The Tollkeeper is unclaimed and at least one fielded hero is Lv 3: challenge the Tollkeeper.
6. The Tollkeeper is claimed and no dungeon has been entered: open the dungeon.
7. Otherwise: publish the team to the arena if state shows nothing published; if no such field exists, show the generic `next.keep_building`.

Each goal has a title, a one-line why, and one brass button. The ladder never gates anything; every screen stays reachable.

### 4.3 Formation board and hero rows

- **Formation board:** 5 slot buttons in two labelled rows. Activating a slot opens an inline list of roster heroes (radio group), each showing ordinal label, class, level and current row; choosing a hero places it, and choosing a hero fielded elsewhere moves it (current swap rule). It replaces the 5 selects. A dirty edit shows `[unsaved]` text plus a Save and Discard pair. Leaving with unsaved edits shows an inline warning on return, never a blocking modal: the draft is kept in memory for the session, and the server state is the source of truth after Discard.
- **Formation hint:** if a hero whose class content marks it as back-row (from the shared class data, not a new table) is in the front row, show the inline tip `formation.hint_backline`. Advisory only.
- **Hero rows:** collapsed by default. They show the ordinal label (class name plus a 1-based index within that class, in the server's hero-array order), level, XP bar (`aria-valuenow`), effective stats from the server, and gear count. Expanding `Build` shows the existing secondary-class picker, skill loadout and skill help unchanged in behaviour (ui-spec.md 2026-10-23 amendment A/B), plus `About this class` (Codex link). The loadout has the same dirty and save pattern as formation.
- **Activity lock:** the board and builds stay readable; mutation controls are disabled with `expedition.loadout_locked` (corrected copy), and Codex and skill help stay enabled.

### 4.4 Recruit

Collapsed disclosure at the end of the roster. Six class options, each with role tag and one-line description from the shared content plus `About this class`. The cost and the gold shortfall are shown as text (`recruit.cannot_afford`). The roster-full reason is shown as text.

## 5. Guided first dispatch

Shown inline on Company when goal 1 is current. It is not a modal and adds no focus trap. Dismissal is stored in `localStorage` as a UI preference only (no progression meaning). Three numbered steps, each a heading plus one action:

1. **Meet your company:** `onboarding.first_expedition.body` (rewritten, section 9), plus links to each hero row.
2. **Set your rows:** highlights the formation board. If the 4.3 hint applies, offers `Move Arcanist 1 to the back row`, which changes the draft only, followed by Save. The step completes after any successful formation save, or when the player chooses `Keep this formation`.
3. **Dispatch:** a brass `Start Expedition` button calling the existing `POST /expedition/start` with the same pending, disabled and error handling as the Expedition screen; on success it navigates to Expedition with focus on h1.

The player can skip any step. Errors appear inline under the step plus the existing toast. Loading uses the existing `Working...` label.

## 6. Expedition: activity and fights

### 6.1 Hierarchy

    [h1 Expedition]  The Old Road
    +-- Status ---------------------------------------------+
    | On the road since 14:02. Fights credited so far: 3    |
    | [Collect rewards]   (Stop and collect)                |
    | Next fight resolves in about 0:42 (estimate)          |
    +-------------------------------------------------------+
    +-- Current fight (LIVE) or Latest fight (RECORDED) ----+
    |  BattleView                                           |
    +-------------------------------------------------------+
    +-- Spoils (after collect, section 7) ------------------+
    Areas: [The Old Road *] [Area 2 - locked: reason]

When idle, the Status panel shows the area description, the enemy list, the party summary (labels and rows) and a brass Start. When active, Collect is brass and Stop is a secondary outline button. The area chooser moves below and shows the unlock reason as text (contract S4 if not static content). The countdown keeps its estimate label in shorter words (`expedition.next_fight_estimate`).

### 6.2 Live fight (requires S1)

Once S1 exists, the fight panel shows the server's current in-progress cycle fight within one poll of dispatch or of opening the screen:
- Header badge `LIVE` (text, not only colour) plus `fight.live_caption`. The playback cursor is derived from server-provided time (`serverNow - fightStartedAt`, at the server's event pacing), never from client progression.
- Controls: Pause; when behind, `Jump to live`. There is no step or skip past the live cursor, and no speed above 1x while live. Restart rewinds within the revealed events only.
- When the cycle completes, the panel shows `fight.live_ended` with the recorded outcome and moves on to the next live cycle. Rewards are credited by the server only on Collect, never by watching.
- Reduced motion: paused at the current live state, with `Follow live` to advance.
- Screen reader: one polite announcement per round, not per event.

### 6.3 Until S1 exists (and for any recorded report)

- Header: `Latest recorded fight` (Expedition) or the eyebrow plus `Replay`. The in-progress heading is replaced by `Replaying recorded fight` while the cursor is mid-report, and by the outcome when finished. The words live and in progress never appear on a recorded report.
- Before any credited cycle: `fight.none_yet` ("Your company is on the road; the first fight report appears after it is credited"). No fight is invented.
- If the server exposes the latest credited cycle's report in state (part of S1 or S2), show it without requiring Collect; otherwise it appears after Collect, as today.

## 7. Spoils (reward feedback)

Shown after a settle or stop (Expedition) and after a dungeon settle. It persists across navigation until the next settlement or Dismiss: held in `useAccountState` for the session, or server-persisted via S2. Order:

1. Headline: `spoils.headline` ("{wins} fights won, {losses} lost").
2. Level-ups (one line per hero: `Vanguard 1 reached Lv 3`), plus unlocks reached (secondary class, a skill unlock level), each linking to the hero's Build.
3. Items: name, rarity as text, slot, and `Compare and equip` (Inventory filtered to that item, comparison panel open).
4. Gold and XP totals.
5. Time line: elapsed time, credited time, and, when the cap applied, `spoils.cap_applied` with exact durations (h/m). Wording follows section 9 so it does not contradict the server's behaviour.
6. Overflow line, when drops were converted.
7. A collapsed `Fight-by-fight ledger` table (the existing cycle table, with the result rendered as Victory, Defeated or Draw).
8. The next-step card (4.2) repeated beneath.

Zero credited cycles: `spoils.nothing_yet`, with no fight shown. Errors: existing toasts; the panel keeps the last confirmed spoils.

## 8. Codex and other screens

### 8.1 Codex (UI only; content and planning owned by `e6bc8b74` and owner-feedback item 1)

Nav entry, plus `About this class` links from hero rows, recruit and the secondary-class picker (deep-link to that class). It is always readable, regardless of roster, level or activity lock. Data comes only from the shared class and skill content, with no new stat table.

- Desktop: a two-pane layout, class list (six) on the left and detail on the right. At 390px, the list opens the detail with a `Back to classes` button, and focus moves to the detail h2.
- Detail sections: role tag; base stats; growth per level; skills table (name, active or passive, unlock level, cooldown in rounds, target, effect text from the same help as skill labels); pairing help (documented synergies from classes.md, each naming the partner class with a link).
- States: loading uses `LoadingPanel`; missing content says `codex.unavailable` and never shows invented numbers.

### 8.2 Inventory

Filter bar first. Item rows show rarity as text. A `New` text badge marks items from the latest Spoils (session only). An item that fits an empty fielded slot shows `Fits an empty slot` and opens comparison by default. The lock reason appears once at the top, not on every row. The empty state keeps the existing key.

### 8.3 Boss

Readiness summary: fielded heroes' labels, levels and rows, plus the reward state. Show a recommended level only if content defines one (open item for the Systems Designer); otherwise none. Challenge is brass. The result uses BattleView with the 6.3 recorded labels; a repeat win shows the already-claimed copy.

### 8.4 Dungeon

Locked: `dungeon.locked_reason` naming the unlocking boss, plus a link to Boss. Active: floor progress `Floor N, M cleared`. Settle is brass and Stop is secondary. Floor results use Spoils (7) and the 6.3 labels; a boss floor shows the eyebrow `Dungeon boss`.

### 8.5 Arena

Unchanged structure (ui-spec.md 6). Publish panel shows the published or not-yet state; the no-opponent state keeps its key; there is still no live-player indicator. Arena reports use the 6.3 recorded labels.

## 9. Copy keys for the Narrative Designer

New: `activity.idle`, `activity.expedition_running`, `activity.dungeon_running`, `next.dispatch`, `next.watch_or_collect`, `next.equip`, `next.secondary_class`, `next.challenge_boss`, `next.enter_dungeon`, `next.publish_arena`, `next.keep_building` (each with a title and a why), `guide.step_meet`, `guide.step_rows`, `guide.step_dispatch`, `guide.dismiss`, `formation.hint_backline`, `formation.unsaved`, `recruit.cannot_afford`, `expedition.next_fight_estimate`, `fight.live_caption`, `fight.live_ended`, `fight.behind_live`, `fight.none_yet`, `fight.replay_heading`, `spoils.headline`, `spoils.level_up`, `spoils.unlock`, `spoils.cap_applied`, `spoils.nothing_yet`, `codex.unavailable`, `dungeon.locked_reason`, `area.locked_reason`, `nav.codex`, `nav.locked_suffix`.

Revise (they contradict current behaviour or terms): `onboarding_first_expedition` (says party order and is never shown), `expedition_offline_cap` (says nothing is lost, but the server reports discarded time; confirm the true behaviour with the Economy Designer), `inventory_overflow` (implies a choice before claiming, but drops auto-convert), `expedition_loadout_locked` and `disabled_spec_*` (specialization was replaced by secondary class and loadout).

Until the copy lands, implementation may use the plain English given here, marked as temporary in `copy.ts`.

## 10. Server contracts (separate from UI work; not authorised by this doc)

- **S1, current fight:** a read-only endpoint or state field exposing the active cycle's authoritative fight, its start time, server `now` and event pacing. Owned by owner-feedback item 2 (task `bbdb7310`) together with any cycle-length change; this doc does not choose pacing.
- **S2, last settlement:** optional persisted latest settlement and report in account state, so Spoils survives reload.
- **S3, hero names:** optional display name per hero (name pool from the Narrative Designer). Until then, ordinal labels.
- **S4, unlock reasons:** area and dungeon unlock requirement, from shared content if static, otherwise a state field.

Goal 7 uses an arena-published flag only if one already exists.

## 11. Ordered change list and acceptance

1. **BattleView recorded labels (6.3).** Files: `components/BattleView.tsx`, test. FS-01: no recorded report ever renders the words live or in progress; the mid-replay heading reads Replaying recorded fight.
2. **ActivityStrip plus nav wrap, lock suffixes, Codex entry.** Files: `App.tsx`, `components/NavBar.tsx`, new `components/ActivityStrip.tsx`, `styles.css`. FS-02: the strip is visible on all screens at 1280x720 and 390px; nav has no horizontal overflow at 390; locked items expose a full accessible name.
3. **Goal ladder plus Next-step card.** Files: `rules.ts` (pure, unit-tested for each goal), new `components/NextStep.tsx`. FS-03: fixture states produce goals 1-7 in order; no mutation is sent on render.
4. **Company restructure (4.3, 4.4).** Files: `screens/Company.tsx`, `styles.css`. FS-04: the formation board is operable by keyboard alone; the dirty marker appears and clears; duplicate-class heroes show distinct labels; the lock keeps Codex and help usable.
5. **Guided first dispatch.** New `components/FirstDispatchGuide.tsx`. FS-05: from a fresh seed, dispatch is possible from Company in at most 3 activations after the formation choice; no request is sent before Save or Start; dismissal persists across reload; the guide never reappears after goal 1 is met.
6. **Spoils panel.** Files: new `components/SpoilsPanel.tsx`, `useAccountState.ts`, `screens/Expedition.tsx`, `screens/Dungeon.tsx`. FS-06: Spoils survives Company and back; level-ups and items are listed with working links; a zero-cycle settlement shows no fight.
7. **Expedition hierarchy (6.1).** FS-07: Collect is brass and Stop is secondary; idle shows the party summary and Start in the first panel.
8. **Codex screen (8.1).** Reuse or restyle owner-feedback item 1's Codex if it is integrated; never fork it. FS-08: six classes, stats, growth, unlocks, cooldowns and pairings match the shared content; deep links focus the class; it works under the activity lock.
9. **Locked reasons, Inventory, Boss, Dungeon, Arena tweaks (8.2-8.5).** FS-09: every locked control states its reason as text.
10. **Type scale and contrast pass.** FS-10: no text below 0.75rem; measured contrast values recorded.
11. **Live fight panel (6.2), only once S1 is integrated.** FS-11: the fight is visible within one poll of dispatch; the LIVE badge appears only on S1 data; no skip past the live cursor; reload or reconnect resumes at the server position; watching grants nothing.

FS-12 (playtest, required): a fresh account at 1280x720 and 390px, with screenshots. Measure seconds from first Company render to the first formation decision, to dispatch, to the first visible combat action, and to the first Spoils; then note whether the next goal was clear. Report engagement as observations, separately from hypotheses. Keyboard-only and reduced-motion runs are included.

## 12. ui-spec.md deltas (to apply after acceptance, as a dated amendment by its owner)

- Navigation shell: add Codex and the ActivityStrip; nav wraps at 640px and below; locked suffixes.
- Section 2 Company: PrimaryActionBanner is replaced by the Next-step card plus ActivityStrip; HeroCard by collapsed hero rows; the formation selects by the formation board; Recruit moves to a disclosure.
- Section 3 Expedition: Collect primary and Stop secondary; SettlementResultPanel replaced by the persistent SpoilsPanel; fight panel labels per 6.3; live panel conditional on S1.
- Sections 4-6: Inventory New and Fits badges; Boss readiness summary; Dungeon locked reason; recorded labels on all reports.
- Global conventions: type minimums and the one-brass-per-region rule.
- Copy additions: section 9 replaces the M1-09 copy table's spec_* entries.
