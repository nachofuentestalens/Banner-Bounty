# Interface direction

A readable company ledger with restrained fantasy accents. Prioritize clear choices and explanations over visual ornament; graphics can be added without replacing the layout.

## Screens

1. Local account selector: two named test companies; explain that this is a local development build.
2. Company: three hero cards, party position, class/spec, level/XP, effective stats and gear. Primary next action stays visible.
3. Expedition: area/enemy summary, start/stop/collect, estimated next cycle, server-confirmed result summary and combat log.
4. Inventory: slot/type filters, equipped owner, before/after stat comparison, equip/unequip; labels explain disabled actions.
5. Boss: readiness summary and challenge result, one-time reward state.
6. Arena: publish current team, list opponent snapshots with version/date, challenge and view report; no fake live-player indicator.

M1-09 freezes a compact screen/state map and component list. M1-10 implements it using real endpoints. Avoid introducing a router or state library solely to switch a handful of panels.

## Presentation

Warm charcoal backgrounds, cream body text, muted brass primary actions, clear teal success/red danger states; verify contrast rather than trusting these descriptions. Use system fonts, 16px default body text, generous line-height, compact but readable stat tables. Portrait/icon slots use text or initials until optional original assets exist. Every icon has a text label or accessible name; rarity never relies only on color.

Keyboard-visible focus, semantic buttons/forms, no hover-only required information, tab order matching visual order, reduced-motion support. At 1280x720 show company and activity without overlapping controls; at 390px wide use stacked panels with no page-level horizontal overflow. Tables can scroll within a labeled region.

## Required states

Loading, empty inventory, offline/reconnecting, rejected/stale action, server error, expedition locking loadout, level/spec unlock, full inventory conversion, loss/timeout, already-collected reward and no published opponent. Prevent duplicate submissions while pending but rely on server idempotency for correctness. Preserve context and explain recovery; do not hide errors in console logs.

Assets are not a milestone dependency. Keep optional asset identifiers, fallback rendering and a future asset provenance list; do not spend generation calls on placeholders that CSS/text already handles.
