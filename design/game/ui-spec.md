# UI spec (M1-09 freeze)

Implementation-ready screen/state map for the first-playable loop. `interface.md` sets direction; this document fixes the exact endpoints, copy keys, and states M1-10 implements. No new game system or mandatory art dependency is introduced; all visuals use text/CSS (system fonts, color tokens from `interface.md`'s palette).

## Global conventions

- **Session bootstrap:** on load, call `GET /dev/session/current`. `unauthenticated` → show Account Selector. Otherwise call `GET /account/state` and route to Company.
- **Polling, not push:** M1 has no websocket. Expedition/boss/arena screens poll `GET /account/state` on a fixed interval (e.g. 5s) while mounted; no poll while backgrounded. Exact interval is an M1-10 implementation choice, not frozen here.
- **Mutation lifecycle:** every mutating call carries a client-generated `requestId` (UUID v4) and the last-known `expectedRevision`. While a request is in flight, disable the triggering control and any control that mutates the same entity (`state.action_pending.label` — "Working…") to avoid duplicate submission; this is a UX courtesy, not the correctness mechanism (server idempotency via `requestId` is authoritative per `contracts.md`).
- **Revision refresh:** every successful mutation response updates the locally held `revision` to the response's `revision`. A `conflict` error refetches `GET /account/state` before allowing retry.
- **Focus/keyboard baseline (every screen):** all interactive elements are real `<button>`/`<input>`/`<select>`/`<a>` — no `div`-as-button. Visible focus ring on every focusable element (`:focus-visible`, never `outline: none` without replacement). Tab order follows visual/DOM order (no manual `tabindex` reordering except skip-links). `prefers-reduced-motion: reduce` disables any transition/animation beyond opacity-only fades ≤100ms. A route change moves focus to the new screen's `<h1>`.
- **Layout breakpoints:** desktop reference 1280×720 shows the active screen's full content without overlapping controls, using a two-column layout where noted below. Narrow reference 390px wide stacks all panels in one column, no page-level horizontal scroll; any table wider than the viewport scrolls horizontally within its own labeled region (`role="region" aria-label="…"` + `tabindex="0"` on the scroll container so keyboard users can scroll it).
- **Error/async state components (shared, reused by every screen below):**
  - `LoadingPanel` — shown while the screen's primary data fetch is in flight. Text: `state.loading.label`.
  - `OfflineBanner` — shown when a fetch/poll fails with a network error (not a 4xx). Text: `state.offline.title` / `state.offline.desc`. Non-blocking: last confirmed data stays visible beneath it. Auto-retries the failed call; no user action required but a manual "Retry now" button is present.
  - `ActionRejectedToast` — shown when a mutation returns `validation`, `forbidden`, or `not_found`. Text: `state.action_rejected.title` / `state.action_rejected.desc`, plus the server's `message` appended verbatim (already player-safe per `contracts.md` ErrorDTO). Dismissable; does not navigate away.
  - `ServerErrorToast` — shown when a mutation returns `internal`. Text: `state.server_error.title` / `state.server_error.desc`. Includes the `correlationId` in small print for bug reports; never only in console.
  - `ConflictRefetchToast` — shown when a mutation returns `conflict`. Text reuses `state.action_rejected.title` with desc "Your company changed elsewhere — refreshing before you try again." (new key `state.conflict.desc`, see Copy additions). Triggers an automatic `GET /account/state` refetch, then dismisses.
  - All toasts are `role="status"` (non-error) or `role="alert"` (error/offline) live regions so screen readers announce them without requiring focus to move.

## Copy additions needed (not in copy.md; M1-09 proposes these, M1-10 implements verbatim)

copy.md covers titles/bodies for the states it names but is missing a few short strings this spec needs to reference. These are additions within copy.md's existing style (short label/desc), not new systems:

| key | type | text |
| --- | --- | --- |
| `state.conflict.desc` | desc | Your company changed elsewhere — refreshing before you try again. |
| `nav.company` / `nav.expedition` / `nav.inventory` / `nav.boss` / `nav.arena` | label | Company / Expedition / Inventory / Boss / Arena |
| `action.confirm_logout` | label | Switch Account |
| `action.retry` | label | Retry Now |
| `action.start_expedition` | label | Start Expedition |
| `action.stop_expedition` | label | Stop and Collect |
| `action.collect` | label | Collect Rewards |
| `action.equip` / `action.unequip` | label | Equip / Unequip |
| `action.publish_snapshot` | label | Publish Team |
| `action.challenge` | label | Challenge |
| `disabled.spec_locked_level` | desc | Reach level 3 to choose a specialization. |
| `disabled.spec_locked_expedition` | desc | Specialization is frozen while this hero is on expedition. |
| `disabled.equip_locked_expedition` | desc | Gear is frozen while this hero is on expedition. |
| `disabled.party_incomplete` | desc | Choose exactly 3 heroes before starting an expedition or publishing. |
| `disabled.item_wrong_slot` | desc | This item doesn't fit that slot. |

These are a content addition, not a new mechanic — each labels an already-frozen rule from `combat.md`/`contracts.md`.

## 1. Account Selector

**Route:** `/` when unauthenticated.

- **Data:** none (public screen).
- **Component:** `AccountCard` × 2 (fixed "Company A" / "Company B" dev slots), each a `<button>`.
- **Action:** click → `POST /dev/session/select { accountSlot }`. Success → navigate to Company. Errors: `validation` (unknown slot — not reachable via UI since only two buttons exist, but `ActionRejectedToast` covers it defensively), `internal` → `ServerErrorToast`.
- **Copy:** `onboarding.local_build.title` / `.body` shown above the two cards, always visible (not dismissable) so the dev-build disclosure in `interface.md` screen 1 is met.
- **Keyboard:** two buttons, natural tab order, no custom widget.
- **Layout:** single column at both breakpoints; this screen has no dense content.

## 2. Company

**Route:** `/company`. Primary landing screen after session select.

- **Data:** `GET /account/state` → `heroes`, `partyOrder`, `expedition.status`.
- **Components:**
  - `PrimaryActionBanner` — persistent top-of-screen element (per `interface.md` "primary next action stays visible"). Shows one of: "Start your first expedition" (no expedition yet, linking to Expedition), "Expedition running — N cycles so far" (status=active), "Rewards ready to collect" (status=active with `cyclesCompletedSinceStart` increasing — exact collect-ready signal is surfaced on Expedition; this banner is a summary link, not a duplicate collect button).
  - `HeroCard` × 3, one per `partyOrder` slot. Shows: class `name` (copy.md `class_*.name`), specialization `name` or "Unspecialized until level 3" (hero_starter desc text when `specializationId` is null and level < 3), level/XP bar, effective stats (HP/ATK/DEF — exact formula from `combat.md`, display only, no recompute in UI), three gear slots (weapon/armor/trinket) each showing equipped item `name` + affix suffix or "Empty".
  - `PartyOrderControl` — within each `HeroCard`, "Move up"/"Move down" buttons (not drag-and-drop, for keyboard accessibility) reordering `partyOrder`. Calls `PATCH /party/order { order }` on each move. Allowed at any expedition status per `contracts.md` M1-01 decision — never disabled for that reason.
- **States:**
  - Loading → `LoadingPanel`.
  - Reorder success → re-render from response `partyOrder`, no full page refetch needed.
  - Reorder `validation` (duplicate/wrong count — not reachable via the up/down control since it only swaps two existing entries, but kept as a defensive path) / `forbidden` → `ActionRejectedToast`.
  - Reorder `conflict` → `ConflictRefetchToast`.
- **Specialization choice:** when a `HeroCard`'s hero has level ≥ 3 and `specializationId` is null, show a `SpecializationPicker` (two radio-style buttons, one per class's two specs from `content.md`, labeled with copy.md `spec_*.name` + `.desc`). Disabled with `disabled.spec_locked_expedition` tooltip/inline text if `expedition.status==="active"`. Selecting calls `POST /hero/specialization { heroId, specializationId }`. Below level 3: picker is replaced by static text `disabled.spec_locked_level`, not a disabled control (nothing to pick yet).
- **Keyboard:** each `HeroCard` is a labeled region (`<section aria-labelledby>`); up/down buttons are real buttons disabled (not removed) at the top/bottom position with `aria-disabled` and no tooltip needed (position is visually obvious).
- **Layout:** desktop — three `HeroCard`s in a row (three-column grid) under the banner. Narrow — stacked single column, banner stays pinned above the stack.

## 3. Expedition

**Route:** `/expedition`.

- **Data:** `GET /account/state` → `expedition` (status, checkpointAt, frozenLoadout, cyclesCompletedSinceStart), polled every 5s while `status==="active"`.
- **Components:**
  - `AreaSummaryCard` — static content.md/copy.md data for Old Road: `area_old_road.name`/`.desc`, the three enemy names (`enemy_road_*.name`), estimated next-cycle countdown computed client-side from `checkpointAt` + 60s cycle length (display-only estimate; server settlement is authoritative, never trust this countdown for rewards).
  - `ExpeditionControls` — one of:
    - `status==="none"`: `action.start_expedition` button → `POST /expedition/start`. Disabled with `disabled.party_incomplete` text if `partyOrder` has < 3 heroes (checked client-side from already-fetched state; server re-validates regardless).
    - `status==="active"`: `action.collect` button → `POST /expedition/settle` (keeps running) and `action.stop_expedition` button → `POST /expedition/stop` (ends run), shown side by side.
  - `SettlementResultPanel` — shown after a successful settle/stop response, displaying the frozen numbers from `contracts.md`'s `offline_cap` example: elapsed time, credited cycles, discarded time (only shown if > 0, using `expedition.offline_cap.title`/`.body` when discarded > 0), rewards (xp/gold/items granted this settlement).
  - `CombatLogPanel` — server-confirmed round-by-round summary from the most recent `BattleReport` referenced by the settlement response (if the response surfaces a report reference) or, if settlement doesn't include per-cycle combat detail, this panel shows the aggregate result only — **open item for M1-10**: `contracts.md`'s `expedition/settle` response does not include a `BattleReport`/`reportId` field, only aggregate `rewards`; M1-10 must confirm whether per-cycle combat logs are discoverable for expeditions or whether this panel is boss/arena-only (see Unresolved issues below).
- **States:**
  - `state.action_rejected` on `validation` (no active expedition for settle/stop, or incomplete party for start).
  - `active_expedition` (`/expedition/start` only — one already running; `contracts.md:94`) → `ActionRejectedToast`, text reusing `expedition.loadout_locked.body` since the underlying cause is the same "already running" state; not reachable from `settle`/`stop`, which don't return this error (`contracts.md:100`), so no handler is needed for those two calls.
  - `conflict` → `ConflictRefetchToast`.
  - Expedition locking loadout: a persistent inline note on this screen while `status==="active"`: `expedition.loadout_locked.title`/`.body`, linking to Company/Inventory so the player understands why those screens show locked controls.
- **Keyboard:** controls are a horizontal button group, natural tab order; countdown/log panels are non-interactive `aria-live="polite"` regions updated on poll (not `assertive`, to avoid interrupting screen reader users every 5s).
- **Layout:** desktop — area summary left, controls+result right (two columns) so "company and activity" are visible together per `interface.md`. Narrow — stacked: summary, controls, result, log.

## 4. Inventory

**Route:** `/inventory`.

- **Data:** `GET /account/state` → `inventory` (ItemInstance[]), `heroes` (for equipped-owner lookup).
- **Components:**
  - `SlotTypeFilter` — a `<select>` or button group filtering by slot (`weapon`/`armor`/`trinket`) and by equipped/unequipped. Client-side filter only, no extra fetch.
  - `ItemRow` × N — item name (base + affix suffix per copy.md composition rule), equipped-owner (hero class name + slot, or "Unequipped"), `action.equip`/`action.unequip` button.
  - `GearComparisonPanel` — opens on selecting an unequipped item for a specific hero slot: shows current-vs-candidate stat deltas (HP/ATK/DEF) as a simple two-column "Now → After" table, using the already-fetched hero's current effective stats and the candidate item's stat contribution from `content.md` — no extra endpoint call, pure display arithmetic on already-known data, with plain-language deltas (e.g. "Attack +3") rather than raw stat codes.
  - Empty state: `state.empty_inventory.label`/`.desc` when `inventory.length === 0`.
- **Equip/unequip action:** `POST /equipment/equip { heroId, itemInstanceId, slot }` / `POST /equipment/unequip { heroId, slot }`.
  - Disabled with `disabled.equip_locked_expedition` when the target hero's expedition is active (checked client-side via `expedition.status`; this applies account-wide since party heroes are frozen together).
  - Disabled with `disabled.item_wrong_slot` if the selected item's slot doesn't match the target (client pre-filters this; server still enforces via `validation`).
  - `not_found` (stale itemInstanceId/heroId, e.g. another tab equipped it) → `ActionRejectedToast`, then refetch inventory.
  - `conflict` → `ConflictRefetchToast`.
  - `active_expedition` (fresh request racing a just-started expedition) → inline message reusing `expedition.loadout_locked.body`.
- **Full inventory conversion:** when a reward response (surfaced on Expedition/Boss/Arena screens, not here) indicates a drop converted to gold instead of an item (inventory was at the 100-item cap per `contracts.md`), that originating screen's `SettlementResultPanel`/`BattleResultPanel` shows `inventory.overflow.title`/`.body` alongside the gold total, since the Inventory screen doesn't own the moment of conversion. Inventory screen itself, when at 100/100, shows a persistent "Inventory full (100/100)" note near the filter bar using the same copy key.
- **Keyboard:** filter control first in tab order, then rows top-to-bottom; `GearComparisonPanel` is a modal-less inline expansion under the selected row (no focus trap needed) with a "Confirm equip" / "Cancel" button pair.
- **Layout:** desktop — filter bar + two-column item grid. Narrow — filter bar + single-column list; comparison panel expands full-width inline below the row.

## 5. Boss

**Route:** `/boss`.

- **Data:** `GET /account/state` → `bossClaims` (for `boss_tollkeeper`).
- **Components:**
  - `BossSummaryCard` — `boss_tollkeeper.name`/`.desc`.
  - `RewardStateBadge` — `boss.reward.pending.title`/`.desc` if `claimedAt` is null, else `boss.reward.already_claimed.title`/`.desc`.
  - `action.challenge` button (no entry cost, usable regardless of expedition status per `contracts.md`) → `POST /boss/challenge`.
  - `BattleResultPanel` — shown after response: win/loss, round-by-round summary from `report.events`, and `rewardGranted` — if `true`, show reward detail; if `false` and the fight was a win, explicitly show `boss.reward.already_claimed.desc` so a repeat win isn't mistaken for a bug.
- **States:** loss/timeout is just a losing `report.result` — `BattleResultPanel` renders it plainly ("Your company was defeated" — exact copy is M1-03 scope if not already covered; `boss_tollkeeper.desc` covers the fight premise but a loss-specific line is an open item, see below). `conflict` → `ConflictRefetchToast`. `validation` (malformed — not reachable from this UI's single button) → `ActionRejectedToast`.
- **Keyboard:** single primary button; result panel is a non-interactive live region (`aria-live="polite"`).
- **Layout:** single column at both breakpoints (content is not wide).

## 6. Arena

**Route:** `/arena`.

- **Data:** `GET /arena/snapshots?excludeMine=true` (list, public but session-aware per `contracts.md`) for the opponent list; `GET /account/state` for "publish" eligibility (party complete).
- **Components:**
  - `PublishPanel` — `action.publish_snapshot` button → `POST /arena/publish`. Disabled with `disabled.party_incomplete` if party < 3. No confirmation dialog beyond the button itself (publish is reversible in effect — it only adds a new snapshot, never mutates prior ones).
  - `OpponentList` — one `SnapshotRow` per entry: opponent label (snapshot has no player-facing display name beyond what's frozen; show `frozenParty`'s class composition, e.g. "Vanguard / Ranger / Arcanist"), `publishedAt` date, `rulesVersion`. Empty → `arena.no_opponent.title`/`.desc`.
  - `SnapshotPreviewPanel` — on selecting a row, `GET /arena/snapshots/:snapshotId` for the full frozen stats, shown with `arena.snapshot.title`/`.body` framing so the player understands it's a frozen copy, not a live opponent (explicitly "no fake live-player indicator" per `interface.md`).
  - `action.challenge` button on the preview → `POST /arena/challenge { snapshotId }`. Result → `BattleResultPanel` (same component as Boss screen, with an arena-only third outcome below).
  - `BattleResultPanel` **draw outcome:** per `combat.md:103-104`, an arena battle can resolve as `draw` — either round-100 timeout with both sides still living, or the (practically unreachable but engine-defined) simultaneous last-actor-on-both-sides case — and this is distinct from the PvE/boss timeout, which resolves as a **loss** instead. The panel must branch on `report.result` across three values (`win`/`loss`/`draw`), not two: a `draw` is not a loss and must not render the loss copy. **Open item for the copy owner:** no copy.md key exists for any `report.result` label (win/loss/draw) on this panel, including this draw case — see Unresolved issue 2 below, now widened to cover arena's draw text specifically.
- **Snapshot version understandability:** `rulesVersion` and `publishedAt` are shown together as plain text, e.g. "Published Oct 12 under ruleset v1" — this communicates that an older snapshot may reflect a prior balance pass without using the word "schema" or "migration." If a snapshot's `rulesVersion` differs from the challenger's current version, no special handling is specified in `contracts.md` for cross-version challenge — this spec assumes the simulation runs under the challenger's current rules regardless of the snapshot's recorded version (the snapshot only freezes party/stats, not rules); flagging a mismatch to the player is an **open item**, see below.
- **States:** `not_found` (snapshot deleted/never existed — not possible in M1 since there's no delete, but a stale cached ID from a prior list fetch is possible) → `ActionRejectedToast`, refetch list. `conflict` → `ConflictRefetchToast` (publish only; challenge's `conflict` likewise refetches).
- **Keyboard:** list is a `<ul>` of buttons (each row selectable), preview panel appears below/beside the list and receives focus on open (`tabindex="-1"` + programmatic focus, then screen reader announces via the panel's heading — not a modal, just focus movement).
- **Layout:** desktop — list left, preview right (two columns). Narrow — list, then preview inline below selected row (same pattern as Inventory's comparison panel).

## Navigation shell

- **Component:** `NavBar` — five `nav.*` links (Company/Expedition/Inventory/Boss/Arena) always visible once authenticated, plus `action.confirm_logout` on the far side → `POST /dev/session/logout`, returns to Account Selector.
- Avoid introducing a router/state library per `interface.md`'s explicit guidance — five panels can be switched with a minimal hand-rolled view switch (e.g. a single `currentScreen` state variable and conditional render); this spec does not require client-side routing (no URL-per-screen requirement is stated, so `/company` etc. above are logical routes for this document's readability, not a mandated router).

## Unresolved issues for M1-10

1. **Expedition combat-log detail:** `contracts.md`'s `expedition/settle`/`stop` response has no `reportId`/`events` field, only aggregate rewards — unlike boss/arena which return a full `BattleReport`. Confirm with Gameplay Programmer/Tools Engineer during M1-10 whether expedition cycles produce a retrievable per-cycle log or whether `ExpeditionControls`'s result panel is aggregate-only by design (current `first-playable.md`/`combat.md` scope). This spec's `CombatLogPanel` is written to degrade gracefully to aggregate-only if no log endpoint exists.
2. **Battle result copy (loss and draw):** no copy.md key exists for any `report.result` outcome label — not a boss-fight loss message distinct from the general fight premise, and not an arena draw message (`combat.md:103-104`: round-100 timeout or simultaneous-defeat both resolve as `draw` in arena, vs. `loss` in PvE/boss). `BattleResultPanel` can render the server's structured win/loss/draw result without new copy (e.g. plain "Defeated"/"Draw" labels derived from `report.result`), but warmer, player-facing lines for all three outcomes — especially draw, which has no precedent elsewhere in the UI — would need a Narrative Designer addition. Not a blocker for M1-10 (the report's structured result is sufficient for correctness), but flagged for the copy owner before polish.
3. **Cross-`rulesVersion` arena challenge:** no contract rule specifies whether a challenge against a snapshot published under an older `rulesVersion` needs a player-facing warning before confirming. This spec shows the version plainly (point 6 above) but does not add a blocking confirmation step, since `contracts.md` does not define different simulation behavior for this case.

## 2026-10-23 amendment: skill inspection and recorded damage

Owner: Systems Designer. Task `f90d1714-0d5f-4989-8bd5-f0603c0ad872`. This is an additive M2 UI contract; all preceding M1-09 text is preserved as historical specification. For this surface, [classes.md](classes.md) sections 4-6 replace the old specialization picker with skill loadouts; [contracts.md](../studio/contracts.md)'s dated damage-evidence decision owns the DTO. No new endpoint, combat rule or client calculation is introduced.

### A. Company: inspect before selecting or saving

- Each populated Active 1/2 and Passive 1/2 slot has a separately focusable skill-help button next to its select. It describes the currently displayed choice; changing a draft choice updates its help without saving. Empty slots retain their empty label and have no fictitious skill description.
- An expandable **Inspect available skills** section lists the primary class Basic Attack plus the deduplicated unlocked active/passive pool from the hero's committed primary/secondary classes and level. Every listed alternative has the same help. Opening it, inspecting a skill or dismissing help never selects, equips or saves anything. A not-yet-committed secondary-class selection does not pretend its skills are already available.
- Basic Attack occupies no loadout slot. Explain active priority: slot 1 if ready and with a legal target, otherwise slot 2 under the same conditions, otherwise Basic Attack. Unlock levels, cooldowns in rounds, targeting/row exceptions, numerical effects, status durations, passive conditions and conditional synergies follow classes.md. Reuse narrative names/descriptions; mechanical help is factual supplementary text. Do not promise a live remaining-cooldown counter or a numerical damage forecast.
- During an active expedition/dungeon, mutation controls remain disabled with an inline lock reason, but selected-skill help and the alternatives disclosure remain enabled. Inspection does not bypass the server lock or queue a deferred change. Below unlock levels, unavailable skills are not offered as selectable alternatives; a full locked-skill/class encyclopedia is outside scope.

### B. Shared help interaction and narrow layouts

| Input/state | Required observable behavior |
| --- | --- |
| Pointer enters skill button | Open name, narrative description and mechanical help without selecting the skill. Moving into the help keeps it readable; leaving both closes it unless its trigger remains focused. A short close grace period is permitted. |
| Tab focuses skill button | Open the same content, show visible focus and associate it using `aria-describedby` with a unique `role="tooltip"` element. Content is descriptive, with no nested actions or modal focus trap. |
| Tap/click, Enter or Space | Open the same help; repeated activation may keep it open. No save/change/challenge request is sent. Moving focus to another control closes the previous help. On touch, tapping another focusable control supplies the dismissal path. |
| Escape while help is visible | Dismiss it regardless of whether it was opened by hover, focus or tap; retain current focus and do not change selection or playback. Do not immediately reopen until a fresh hover/focus/activation occurs. |
| Blur, navigation or removed event | Close obsolete help and remove its description association. Inspection must not leave a floating panel for a removed trigger. |
| 1280x720 and 390x720 | Help stays within the viewport, clears clipping ancestors such as the log, wraps long text and does not create page-level horizontal overflow. If vertically constrained, all text must remain reachable by keyboard and touch as well as pointer. Scrolling must not strand help off-screen. |

Native `<select>`/`<option>` titles are supplementary only. Skill-help buttons remain available when selects are disabled. Unknown/legacy/enemy skill IDs without authored mechanics retain a readable name/ID and no invented formula or empty help button. Generic skill help describes class rules; it is not proof that a conditional synergy or modifier applied in this historical event.

### C. Battle views and authoritative evidence

Reuse the same skill-help component in the shared BattleView current-action feed and expandable full text log for expedition, dungeon floor/boss, standalone boss and arena reports. Battle inspection describes the recorded action's skill, not alternative edits to a frozen fight; alternatives belong in Company. Preserve actor, target, signed amount, HP, critical/dodge/status/death labels and all replay controls. Help adds no automatic pause or replay-speed change. The full log remains the stable inspection surface if playback advances. A zero-cycle settlement has no invented fight.

Render `damageBreakdown` as ordinary readable event text in both feed and full log, with no hover requirement. The browser formats recorded operands/results in `steps` order; it does not execute formulas, roll dice, infer missing stages or use current hero stats to explain a historical fight. For known step kinds, label the evaluated stat/modifier/base/roll/survival arithmetic. Unknown kinds may use a neutral **Recorded modifier** label with the recorded result, without guessing its operation.

| Evidence/state | Display requirement |
| --- | --- |
| Direct hit | Show recorded evaluated stages, then **Resolved damage**, **HP before**, **actual HP loss**, **HP after**. `damage` is pre-clamp/pre-Vital-Surge damage; `hpLoss` is actual loss, equal to negative event `amount`; `hpBefore - hpLoss = hpAfter`. These are evidence consistency checks, not browser reconstruction rules. |
| Overkill or survival | Keep resolved damage and actual loss distinct. Example fixture: resolved 20 against HP 7 loses 7 and ends at 0; with recorded Vital Surge it loses 6 and ends at 1. Show the recorded survival stage when present and a plain explanation that remaining HP or a survival effect limited damage. Never label all resolved damage as HP removed. |
| Dodge | Recorded resolved damage and loss are zero. Show the recorded dodge outcome and explicitly say base damage and critical roll were not evaluated; do not fabricate those stages. Guaranteed-critical evidence instead states that dodge and critical rolls were skipped when the server recorded that path. |
| Burn | Identify stacks, captured ATK and recorded tick result; explain no dodge/critical roll. Do not substitute the caster's current ATK. Keep direct-hit and tick events distinct. |
| AoE or sequential hits | Keep each target/hit event's evidence separate, including its own HP before/after and evaluated rolls. Do not combine hits into one fictional calculation. |
| Missing legacy evidence | For a damage/dodge event without the field, show **Damage breakdown unavailable in this older report.** Retain original amount, HP and readable log. This wording is a compatibility fallback, not proof of the report's age. Do not backfill from HP differences. Non-damage events without evidence need no damage-unavailable message. |

### D. Observable acceptance checks

These are verification targets, not a claim that every check has run. See the [evidence report](reports/skill-help-damage-ui-amendment.md) for status and mismatches.

| ID | Procedure and expected observation |
| --- | --- |
| SH-01 | Inspect a selected skill, another eligible skill and the primary Basic Attack before saving. Same authored mechanics appear; no mutation request occurs. Empty slots and unknown IDs remain readable without invented help. Compare the 30 class skills against classes.md, including cooldown, target, effects and conditional synergy wording. |
| SH-02 | Repeat inspection with an expedition and then a dungeon active. Selected and alternative help works while edit/save controls stay locked with an inline reason; no deferred edit is queued. |
| SH-03 | Open by hover with focus elsewhere, focus by Tab, and activate by tap/keyboard. Escape dismisses in every case without moving focus; fresh activation reopens. Pointer transfer into help preserves it; blur closes it. Verify description association and readable keyboard/touch scrolling of long help. |
| SH-04 | At 1280x720 and 390x720 inspect Company and battle-log help, including near viewport edges and after scroll. Text remains reachable with no clipped overlay or page-level horizontal overflow. |
| SH-05 | In expedition, dungeon floor/boss, boss and arena reports inspect current action and full log. Same help/evidence appears, actor/target/status/death remain readable, and inspection/replay issues no progression mutation. Old reports and zero-cycle settlements degrade without inventing a fight. |
| SH-06 | Use recorded direct-hit fixtures with Weaken/Fortify, critical damage, overkill and Vital Surge. Compare displayed operands and results with event data; actual loss reconciles with amount/hpAfter and differs visibly from resolved damage where appropriate. |
| SH-07 | Inspect dodge, guaranteed critical, Burn, AoE and sequential-hit fixtures. Only evaluated stages appear; Burn uses captured ATK; separate hits keep separate evidence. |
| SH-08 | Inspect a legacy damage/dodge event with no evidence and an unknown step kind. Missing evidence says unavailable while retaining original log; unknown steps show recorded results without invented arithmetic. |

Scope excludes debug controls, balance changes, the M3 codex, mid-expedition edits and continuous-fight delivery. Their existing task dispositions are unchanged.
