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
  - `active_expedition` is not a possible error for this screen's own actions (start/settle/stop don't return it per `contracts.md`); omit a handler for it here.
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
  - `action.challenge` button on the preview → `POST /arena/challenge { snapshotId }`. Result → `BattleResultPanel` (same component as Boss screen).
- **Snapshot version understandability:** `rulesVersion` and `publishedAt` are shown together as plain text, e.g. "Published Oct 12 under ruleset v1" — this communicates that an older snapshot may reflect a prior balance pass without using the word "schema" or "migration." If a snapshot's `rulesVersion` differs from the challenger's current version, no special handling is specified in `contracts.md` for cross-version challenge — this spec assumes the simulation runs under the challenger's current rules regardless of the snapshot's recorded version (the snapshot only freezes party/stats, not rules); flagging a mismatch to the player is an **open item**, see below.
- **States:** `not_found` (snapshot deleted/never existed — not possible in M1 since there's no delete, but a stale cached ID from a prior list fetch is possible) → `ActionRejectedToast`, refetch list. `conflict` → `ConflictRefetchToast` (publish only; challenge's `conflict` likewise refetches).
- **Keyboard:** list is a `<ul>` of buttons (each row selectable), preview panel appears below/beside the list and receives focus on open (`tabindex="-1"` + programmatic focus, then screen reader announces via the panel's heading — not a modal, just focus movement).
- **Layout:** desktop — list left, preview right (two columns). Narrow — list, then preview inline below selected row (same pattern as Inventory's comparison panel).

## Navigation shell

- **Component:** `NavBar` — five `nav.*` links (Company/Expedition/Inventory/Boss/Arena) always visible once authenticated, plus `action.confirm_logout` on the far side → `POST /dev/session/logout`, returns to Account Selector.
- Avoid introducing a router/state library per `interface.md`'s explicit guidance — five panels can be switched with a minimal hand-rolled view switch (e.g. a single `currentScreen` state variable and conditional render); this spec does not require client-side routing (no URL-per-screen requirement is stated, so `/company` etc. above are logical routes for this document's readability, not a mandated router).

## Unresolved issues for M1-10

1. **Expedition combat-log detail:** `contracts.md`'s `expedition/settle`/`stop` response has no `reportId`/`events` field, only aggregate rewards — unlike boss/arena which return a full `BattleReport`. Confirm with Gameplay Programmer/Tools Engineer during M1-10 whether expedition cycles produce a retrievable per-cycle log or whether `ExpeditionControls`'s result panel is aggregate-only by design (current `first-playable.md`/`combat.md` scope). This spec's `CombatLogPanel` is written to degrade gracefully to aggregate-only if no log endpoint exists.
2. **Boss loss copy:** no copy.md key exists for a boss-fight loss message distinct from the general fight premise. `BattleResultPanel` can render the server's structured win/loss result without new copy (e.g. a plain "Defeated" label derived from `report.result`), but a warmer loss line would need a Narrative Designer addition — not a blocker, since the report's structured result is sufficient for correctness.
3. **Cross-`rulesVersion` arena challenge:** no contract rule specifies whether a challenge against a snapshot published under an older `rulesVersion` needs a player-facing warning before confirming. This spec shows the version plainly (point 6 above) but does not add a blocking confirmation step, since `contracts.md` does not define different simulation behavior for this case.
