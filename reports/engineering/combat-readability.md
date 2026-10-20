# Combat readability update

Owner request: make fights visible and understandable, including what each unit does and how much HP remains. Implemented in the assigned isolated worktree, without branch changes or changes to the live checkout.

## Changes

- Shared battlefield for boss, arena and latest collected/stopped expedition cycle: original vector silhouettes, two teams, exact HP bars/numbers, action/target emphasis, damage/heal numbers, last-action labels and defeated units.
- Play/pause, next action, restart, speed and show-result controls. Reduced-motion preference starts playback paused and disables animation. Full readable event log and legacy-report fallback remain available.
- Frozen unit metadata is persisted in existing boss/arena snapshot JSON. Expedition response retains only one latest fight; empty settlements omit it. No migration, combat balance changes, reward changes or new dependencies.
- Updated interface and architecture notes with replay semantics and additive response fields.

## Evidence

- `npm ci --no-audit --no-fund`: succeeded in this worktree.
- `npm run build`: all five workspaces succeeded, including TypeScript checks. After final presentation-copy edits, `npm run build --workspace=apps/web` also succeeded.
- `npx vitest run apps/web/src/components/BattleResultPanel.test.tsx apps/server/src/progression.test.ts apps/server/src/arena.test.ts packages/game/src/expedition.test.ts packages/game/src/combat.test.ts`: 69 passed; the new integration test initially failed because its cleanup closed the database twice. Removed the duplicate close. Focused rerun `npx vitest run apps/server/src/progression.test.ts`: all 30 passed. Combined final coverage: 70 passing tests across those five files.
- UI tests verify damage, healing, defeat, reset, skip, pause, speed, new-report reset, legacy fallback and reduced-motion pause. New API test reconstructs final HP from frozen starting HP/events, checks expedition retry equality and empty settlement, and verifies stored boss metadata.
- `node tests/e2e/combat-replay.mjs`: passed against the built UI and real server with an isolated in-memory save and explicitly accelerated server clock. Exercised boss, expedition and cross-account arena; unit counts, next action, result and restart; reduced-motion initial pause; no horizontal overflow at 390px; no browser errors.
- Screenshots saved under ignored `test-results/combat-replay/`. Visually inspected `expedition-desktop.png` and `boss-mobile.png`: readable HP, actor/target distinction, silhouettes and controls without overlap. Desktop arena and mobile expedition screenshots were also captured by the browser check.
- `git diff --check`: passed. Reviewed changes against task base `aaadd88b051c4b98e504643e719034cfed8c43a6`; there were no earlier branch changes at the start of this run.

## Limits and next step

These are replays of authoritative fights, not live simulation. Expedition combat appears after a completed cycle is collected or stopped. Navigating away discards the current in-page playback state. Older stored reports lack unit metadata and show the text log. Artwork is original lightweight vector illustration; this run does not replace the application's broader art direction or alter combat mechanics. No known blocking issue remains in this scope. Next step: owner visual review and normal dashboard integration; no integration was performed here.
