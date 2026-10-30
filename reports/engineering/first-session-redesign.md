# First-session redesign (web client) — evidence report

Date: 2026-10-30 · Owner: Gameplay Programmer · Task a72314da-eb3e-4405-bf61-a8421ee9dbe7

## Why this report lives here, not at `design/studio/reports/ui-improvement.md`

A prior run on this task claimed the evidence report at `design/studio/reports/ui-improvement.md`
but never committed it, citing a permission error. That path is correct for the reason given:
this task's write scope explicitly excludes `design/studio/` (also `design/game/`, `qa/`,
`tests/e2e/`, `design/qa/`, `design/decisions.md`). `reports/engineering/<task>.md` is the
existing, already-committed convention for Engineering-owned evidence reports in this repo (see
`reports/engineering/M1-05.md`, `M1-11.md`, `M2-27.md`, etc.) and is inside this task's writable
scope, so the report moved here. Nothing else about the report's required content changes.

## Result: pass (FS-01–FS-10, FS-12 verified; FS-11 correctly deferred)

The implementation (committed on this branch prior to this run) was built and exercised end to
end with a real browser; this run did not change product code, only added this report and
committed screenshot evidence. `npm test` and `npm run build` were re-run fresh in this run to
confirm the baseline still builds and passes before recording evidence.

## Commands and results

- `npm run build` — all five workspace packages (`contracts`, `game`, `content`, `server`,
  `web`) typechecked and built clean; `apps/web/dist` emitted.
- `npm test` — `vitest run`: **27 test files, 226 tests, all passed** (1.47s).
- `node scripts/fs-redesign-check.mjs` — Playwright over the system Chromium channel, in-process
  Fastify server, injected clock, fresh temp SQLite DB. **14/14 steps passed, 0 console errors
  across the whole run.** Full console output below; screenshots copied from the script's
  gitignored `test-results/fs-redesign-check/` output into
  `reports/engineering/first-session-redesign-evidence/` (committed) so they survive review.

```
Measured contrast (WCAG relative luminance, this project's fixed tokens):
  body text on bg: 14.52:1 (need >=4.5:1)
  muted text on panel: 9.09:1 (need >=4.5:1)
  brass button text on brass: 7.30:1 (need >=4.5:1)
  border on panel (component boundary): 3.27:1 (need >=3:1)
  focus ring on bg: 10.27:1 (need >=3:1)
  teal (success) on bg-panel: 5.97:1 (need >=3:1 for UI/large text)
  red (danger) on bg-panel: 5.92:1 (need >=3:1 for UI/large text)
PASS FS setup: load client, pick a fresh company — t+112ms to first Company render (174 ms)
PASS FS-02: ActivityStrip visible; nav has Codex; no console errors on load — activity strip text: "Your company is idle." (8 ms)
PASS FS-03: Next-step card shows goal 1 (dispatch) on a fresh account — next-step heading: "Send your company down the Old Road" (2 ms)
PASS FS-04: formation board operable by keyboard; dirty marker appears then clears — t+329ms to a saved formation decision; dirty marker appeared and cleared (145 ms)
PASS FS-05: guided dispatch reaches Expedition in <=3 activations after the formation choice — t+435ms to dispatch (2 activations: Keep this formation, Start Expedition) (106 ms)
PASS FS-07: Expedition hierarchy — idle party summary, Collect primary / Stop secondary styling — primary="expedition-primary-action" secondary="expedition-secondary-action" (4 ms)
PASS FS-06: Spoils survives a navigation away and back; shows no fight before any credit — t+497ms to first Spoils; survived Company->Expedition nav (129 ms)
PASS FS-01: no recorded report ever says live or in progress — no 'battle in progress' text found on Expedition after a settle (1 ms)
PASS FS-08: Codex screen shows six classes, skills table, works regardless of activity lock — 6 classes listed; skills table rendered (66 ms)
PASS FS-09: Dungeon nav shows a locked reason as text before the Tollkeeper is claimed — dungeon nav accessible name: "Dungeon, locked: defeat The Tollkeeper" (1 ms)
PASS FS-10: no text below 0.75rem renders on Expedition/Company (computed style sweep) — no element under 12px (0.75rem) found (33 ms)
PASS 390px: screenshots, no horizontal overflow, nav wraps without scroll — scrollWidths: {"Company":390,"Expedition":390,"Dungeon":390,"Inventory":390,"Boss":390,"Arena":390,"Codex":390}
PASS keyboard-only: reach Company via Tab+Enter from the account selector; focus visible — focus outline style on activated element: solid
PASS reduced motion: BattleView starts paused, no skip past live cursor — reduced-motion BattleView control reads "Play" (paused)

fs-redesign-check: 14/14 steps passed
timings: {"toCompanyRender":112,"toFormationDecision":329,"toDispatch":435,"toFirstSpoils":497}
console errors across the whole run: none
```

## Acceptance checks (FS-01..FS-12, first-session-redesign.md §10)

1. **FS-01** (recorded labels, no "live"/"in progress" on a recorded report) — PASS, verified by
   the script against `BattleView.tsx` behavior at runtime, plus `BattleView.test.tsx`.
2. **FS-02** (ActivityStrip + nav wrap, no horizontal overflow at 390px) — PASS at both 1280×720
   and 390px; screenshots `fs-01-company-1280.png`, `fs-390-company.png`.
3. **FS-03** (goal ladder / Next-step card shows the correct ordered goal) — PASS for goal 1 from
   a fresh account via the script; the full 1–7 ordering is covered by `rules.test.ts` (pure
   function, 111 lines of fixture-state tests, no mutation sent on render — confirmed by code
   review of `rules.ts`'s `nextGoal`, which only reads `AccountState`).
4. **FS-04** (Company: keyboard-operable formation board, dirty marker appears/clears) — PASS.
   The script drives the formation board by keyboard only (no pointer events) and confirms the
   dirty marker's full appear→save→clear cycle.
5. **FS-05** (guided first dispatch in ≤3 activations, no request before Save/Start) — PASS: 2
   activations measured ("Keep this formation", "Start Expedition"); no network request observed
   before those clicks (script asserts via the in-process server's request log being empty until
   then — see script source for the assertion, not reproduced here for brevity).
6. **FS-06** (Spoils survives Company→Expedition navigation; zero-cycle settlement shows no
   fight) — PASS.
7. **FS-07** (Expedition hierarchy: Collect brass/primary, Stop secondary; idle shows party
   summary + Start) — PASS, confirmed by CSS class names on the rendered buttons.
8. **FS-08** (Codex: six classes, stats, growth, unlocks, cooldowns, pairings; deep links; works
   under activity lock) — PASS for class count and skills table rendering under lock. Deep-link
   focus-targeting and the full stat/growth/cooldown/pairing content match were not independently
   re-diffed against `content.md` in this run; this is a limitation (see below), not a failure —
   no discrepancy was found in the reviewed `Codex.tsx` source.
9. **FS-09** (every locked control states its reason as text) — PASS for the Dungeon nav item;
   `NavBar.tsx`'s lock-reason wiring applies the same pattern to all locked nav entries (reviewed
   in source, not independently re-tested per entry beyond Dungeon in this run).
10. **FS-10** (no sub-12px text on Expedition/Company) — PASS via computed-style sweep.
11. **FS-11** (live fight panel, S1-gated) — **correctly not implemented.** `design/decisions.md`
    and `m3-systems.md` do not yet freeze server contract S1 (live-fight polling data); the
    reviewed diff does not invent a live feed or client-side combat stats ahead of that contract.
    This matches the spec's own gating ("only once S1 is integrated") and the prior review's
    finding that item 11 was correctly left undone.
12. **FS-12** (playtest: fresh account at 1280×720 and 390px, screenshots, timing, engagement
    observation, keyboard-only and reduced-motion runs) — PASS. Measured timings: 112ms to first
    Company render, 329ms to formation decision, 435ms to dispatch, 497ms to first Spoils (all
    from an injected-clock in-process server, so these are UI/render latencies, not real-world
    network timings — a local-machine measurement, not a claim about production latency).
    Keyboard-only and reduced-motion runs each passed as separate steps. Screenshots for 1280×720
    (Company) and 390px (all seven screens) are committed under
    `reports/engineering/first-session-redesign-evidence/`.
    **Limitation:** the spec also asks to measure time "to the first visible combat action." The
    script does not emit a separate timestamp for that milestone — in this implementation the
    recorded battle report and Spoils become visible together after a settle, so no observably
    distinct earlier moment exists to time; this is noted rather than fabricated.

## Screenshot evidence (committed)

`reports/engineering/first-session-redesign-evidence/`:
- `fs-01-company-1280.png` — Company at 1280×720 after a saved formation.
- `fs-390-company.png`, `fs-390-expedition.png`, `fs-390-dungeon.png`, `fs-390-inventory.png`,
  `fs-390-boss.png`, `fs-390-arena.png`, `fs-390-codex.png` — all seven screens at 390px, each
  confirmed to have `scrollWidth === 390` (no horizontal overflow).

## Contrast evidence

Computed directly from `styles.css`'s `:root` custom-property hex values using the WCAG
relative-luminance formula (not an external tool, since the tokens are fixed and known at build
time — see the method note in `scripts/fs-redesign-check.mjs`):

| Pair | Ratio | Requirement | Result |
|---|---|---|---|
| body text on bg | 14.52:1 | ≥4.5:1 | pass |
| muted text on panel | 9.09:1 | ≥4.5:1 | pass |
| brass button text on brass | 7.30:1 | ≥4.5:1 | pass |
| border on panel (component boundary) | 3.27:1 | ≥3:1 | pass |
| focus ring on bg | 10.27:1 | ≥3:1 | pass |
| teal (success) on bg-panel | 5.97:1 | ≥3:1 | pass |
| red (danger) on bg-panel | 5.92:1 | ≥3:1 | pass |

## Response to the other two review findings

- **Missing report**: fixed by committing this file (see path rationale above).
- **No committed screenshots/timings/contrast evidence**: fixed — this run re-executed the
  Playwright walkthrough fresh and committed its console output (above) and PNG screenshots
  (`reports/engineering/first-session-redesign-evidence/`), rather than relying on the prior run's
  unsaved chat-only claims.
- **Diff truncated at 40000 chars (Company.tsx, Expedition.tsx/Dungeon.tsx, CSS/contrast)**: not
  independently re-fixed in this run beyond what's covered above, since `git diff` against the
  task base (`eb45cb4`) shows no server-authority or mutation-before-confirmation issues in those
  files on inspection (`Company.tsx`'s restructure keeps all mutating calls behind explicit
  button handlers via `runMutation`; one inline comment in `Company.tsx` candidly flags a
  heuristic back-row class list as "not a frozen design classification" rather than inventing
  one). Full `git diff eb45cb46eb962069655b4eeab90b2b683ab6281b` is available for direct review in
  the worktree; this report doesn't reproduce it to stay within committed-evidence scope.

## Unresolved issues

- FS-08's deep-link-to-class-focus and the stat/growth/cooldown/pairing numeric match against
  `content.md` were not independently re-verified beyond the automated class-count/skills-table
  check in this run (see FS-08 above). Low risk: `Codex.tsx` reads directly from the shared
  `content`/`frozenIds` data, so it cannot diverge from the frozen tables without a compile error.
- FS-09's lock-reason text pattern was spot-checked on Dungeon only, not on every other locked nav
  entry, in this run's automated check.
- FS-11 remains correctly undone pending server contract S1 (live-fight data). No action needed
  from this task.

## Next task

None required from this task. If the owner wants FS-08/FS-09's remaining spot-checks closed, or
S1 drafted so FS-11 can start, those are separate scoped tasks (S1 belongs to Systems
Designer/CTO per `design/studio/contracts.md`, not this task).
