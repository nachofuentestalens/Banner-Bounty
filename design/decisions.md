# Decisions

What the owner decided, appended by AgentDashboard when a proposal is accepted or a question answered. Newest last. Agents follow these.

## 2026-10-17 · [M1-04] Define progression and reward baseline

Economy Designer asked:

> This worktree has no AGENTS.md and no design/ directory at all — not first-playable.md, combat.md, content.md, contracts.md, nor any prior economy/ or reports/ folder. The task depends on M1-02 and on reading those four input docs before writing design/game/economy/baseline.md and design/game/reports/M1-04.md. Should I: (a) proceed by authoring the full economy baseline from the task's written scope alone (levels 1-10, rewards, drops, boss reward, overflow, pacing) without those inputs, clearly flagging in the report that none of the stated inputs/dependencies were available to verify against, or (b) wait until M1-02 and the listed design docs actually exist in this branch? I don't want to invent assumptions about hero stats, combat pacing, or content structure that another department already decided elsewhere without being able to check.

The owner answered:

I think the issue is the coordinator didn't account for dependencies, put this on hold and I'll get the agent dashboard to re-structure tasks so they can account for dependencies, and not only priorities

## 2026-10-17 · [M1-06] Implement deterministic combat and content validation

Gameplay Programmer asked:

> M1-06 cannot start: the repo has no baseline. `main` at D:/Personal/B&B has zero commits, and my task branch is an orphan root with no files — no AGENTS.md, no design/ directory, no packages/. Dependencies M1-02, M1-04, M1-05 (content schema, contracts, economy baseline) don't appear to be merged anywhere; the only non-empty branch is an unrelated task's unmerged WIP scaffold with generic stub packages and no design docs. How should I proceed — is there a baseline I should be branching from that isn't reaching this worktree, or do M1-02/M1-04/M1-05 need to be (re)run first?

The owner answered:

I think the issue is the coordinator didn't account for dependencies, put this on hold and I'll get the agent dashboard to re-structure tasks so they can account for dependencies, and not only priorities

## 2026-10-18 · [M1-13] Tune first-session pacing from simulation evidence

Economy Designer asked:

> M1-12/M1-13 confirm the Tollkeeper is winnable the instant level 3 is reached (12 cycles, ~12 minutes), coincident with specialization unlock — not in the 20-40 minute band first-playable.md hypothesized. Margin is thin if unequipped (2 of 3 heroes die while still winning). Is an early, high-stakes boss win right at the specialization-unlock moment acceptable for first playable, or should content.md's Tollkeeper stats (or combat.md's level-3 gate) be hardened to restore a real separation between the two milestones? This is a combat/content stat-balance change outside design/game/economy's scope, so I have not filed or implemented anything — flagging for your decision before any follow-up task is created.

The owner answered:

yes, let's keep it at level 3, 20-40 minute grind might be a bit much, the first few hours need to be really addictive

## 2026-10-18 · [M1-13] Tune first-session pacing from simulation evidence

Economy Designer asked:

> This re-raises the M1-13 open question for formal logging: should boss-readiness stay at level 3 as measured (coincident with specialization unlock, ~12 minutes, no content.md/combat.md hardening), or should the Tollkeeper/level-3 gate be hardened to restore the original 20-40 minute separation? You already replied in conversation ("yes, let's keep it at level 3, 20-40 minute grind might be a bit much, the first few hours need to be really addictive"), but design/decisions.md has no entry for this task, and that file is the authoritative decision log per its own header — re-asking here so your answer gets logged there before M1-14 builds on it.

The owner answered:

Yes, boss-readiness stay at level 3 as measured

## 2026-10-18 · design/studio/contracts.md updated

Proposed by Gameplay Programmer; accepted by the owner.

M1-10 code review found apps/web computing hero effective stats client-side (computeHeroEffectiveStats) to satisfy ui-spec.md's Company/Inventory stat display, violating architecture.md's 'apps/web: ... No client-authoritative loot, XP, time, stats or victory' and creating an undeclared apps/web -> game/content/contracts package edge. The fix removes the client computation, but ui-spec.md's requirement then has no data source: GET /account/state's Hero shape never included computed stats. This proposal adds an additive, server-computed field so the UI can show real numbers again without recomputing them.

## 2026-10-18 · Add server-computed effectiveStats to account/state and equip responses

Gameplay Programmer asked:

> Please accept and integrate the existing effectiveStats contract proposal into this task’s baseline so implementation can proceed.

The owner answered:

Accepted
