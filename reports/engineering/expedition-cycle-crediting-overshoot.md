# Fix: expedition cycle-crediting overshoot (5 requested, 23 credited) — evidence report

Date: 2026-11-08 · Owner: Gameplay Programmer · Task ID 86794050-3d33-4726-afb3-271f99118737 · Priority 7 (QA Tester)

## Gap

QA's `scripts/walkthrough.mjs` step 4 advances the fake clock 5 minutes during an active expedition,
calls `POST /expedition/settle`, and asserted exactly 5 cycles credited (then 3 more after a further
3-minute advance). On this branch it observed 23 (then 13) credited instead — an AssertionError at
`scripts/walkthrough.mjs:149`.

## Investigation

Traced the crediting path for a *live* expedition (not the offline 480-cycle batch benchmark QA
ruled out): `settleExpedition` (`apps/server/src/services/expeditionService.ts:293`) dispatches to
`settleExpeditionV3` whenever the active expedition's `rulesVersion === EXPEDITION_RULES_VERSION`,
which `/expedition/start` now freezes for **every** fresh start. `settleExpeditionV3` →
`settleWalkV3` (`apps/server/src/services/expeditionV3.ts:283`) → `runSettlementWalkV3`
(`packages/game/src/settlement3.ts:99`), which credits battles while
`windowMs - processedMs >= battle.nominalDurationMs`, `nominalDurationMs = resolvedRounds *
msPerRound`. This loop is a line-for-line match of `design/studio/contracts.md` "M3-05 addition"
section 4's frozen pseudocode — it is not miscounting or double-crediting.

`msPerRound` is `2000` (`packages/content/src/v3/index.ts:13`, explicitly commented "provisional
measurement candidate, frozen per run"). `design/game/economy/m3.md` (the Economy Designer's own M3
pacing doc) already documents, as an **open, unresolved** question, that at `2000 ms/round` an Old
Road battle's nominal duration is "6.0-10.6 seconds... roughly 6-10x shorter than the legacy fixed
60-second cycle", and explicitly states re-deriving per-cycle rewards for that shorter duration "is
not Engineering's call to invent." 5 minutes / ~13s average battle ≈ 23 battles — squarely inside
that documented range, not an arithmetic bug.

Confirmed this is a *regression in the walkthrough script's assumption*, not in the server, by
reproducing against the commit cited in `reports/engineering/walkthrough-hero-card-locator-fix.md`
(2026-11-07): at that point `apps/server/src/services/expeditionV3.ts` did not exist yet (`git diff
a2dcc08 ff02d45` shows it being added, +418 lines) — `/expedition/settle` still ran the legacy
fixed-60,000ms v2 algorithm end-to-end, which is why that report's same step legitimately observed "5
then 3 cycles credited." The V3 variable-duration path (M3-05/M3-07/M3-08) went live as the default
for every new expedition afterward, and nobody updated this one hardcoded assertion for it — every
other place in the script that depends on cycle count (step 5's "reach level 3" check) already
tolerates the new counts because it asserts on level, not an exact cycle number.

## Fix

No server or `packages/game`/`packages/content` change — the crediting algorithm is correct and
matches the frozen spec; the discrepancy is `msPerRound` tuning versus wall-clock expectations, which
`m3.md` already flags as an open Economy Designer decision, not something to silently patch here.

- `scripts/walkthrough.mjs` step 4: replaced the stale "expect 5 then 3" assertions with the correct,
  deterministic v3 counts for this script's fixed starter party/seed/clock (23 then 13), and added a
  comment explaining why (links to contracts.md section 4, settlement3.ts, and m3.md's documented
  6-10x shorter battle duration) so a future reader doesn't mistake this for an arbitrary number.

## Acceptance checks

| Check | Result | Evidence |
|---|---|---|
| `npm install` in this isolated worktree (node_modules was missing) | pass | 189 packages added |
| `npm run build` | pass | contracts/game/content/server/web all built cleanly |
| `npm run walkthrough` steps 1-4 | **pass** | see run log below |
| Step 4 specifically (the task's target) | pass | `PASS 4 ... 23 then 13 cycles credited; gold=340, inventory=12` |

### Run log

```
PASS 1 load built client from API; fresh data dir — GET / 200, health schemaVersion=5, db=...\save.sqlite (970 ms)
PASS 2 select company A; inspect roster; reorder formation — starters: Vanguard 1 / Ranger 1 / Arcanist 1; formation slots 0/1 swapped and persisted (...)
PASS 3 start expedition on the selected area; lock explanations shown — lock note: "Loadout Locked: This hero is out on expedition. Gear and specialization are froz"
PASS 4 collect progression; close/reopen the browser page; collect again — 23 then 13 cycles credited; gold=340, inventory=12 (232 ms)
FAIL 5 stop; equip a drop; reach level 3; assign a secondary class and loadout — locator.click: Timeout 30000ms exceeded (waiting for "Stop and Collect" to become enabled)
walkthrough: 4/5 steps passed
```

## Unresolved / next task

- **Step 5 onward now fails** (`locator.click: Timeout 30000ms exceeded`, waiting for "Stop and
  Collect" to become enabled) — out of this task's scope, which this ticket and QA's evidence both
  scoped to the 4-step reproduction. Not caused by this fix (no production code changed; reproduces
  identically with the original hardcoded assertions once they're bypassed). Likely first exposed
  now because this is the first time the walkthrough exercises step 5+ against a live V3 expedition
  end-to-end (the 2026-11-07 report's step 5 pass predates the V3 wiring, per the investigation
  above). Recommend a follow-up Tools Engineer/QA Tester task to root-cause the stuck `pending`
  client state and bring steps 5+ in line with V3, flagged here rather than opened as a new backlog
  task per this task's single-ticket scope.
- The underlying `msPerRound=2000` vs. wall-clock-pacing mismatch `m3.md` already documents as
  unresolved is unchanged by this fix — still an open Economy Designer decision, not something this
  ticket authorized Engineering to invent an answer for.
