# Banner & Bounty

A mainly text-based idle party RPG, designed for local hosting and asynchronous multiplayer. Current state: milestone planning and AgentDashboard setup; no playable build yet.

Start with [the milestone](design/studio/vision.md), [task order](design/studio/priorities.md), and [dashboard operations](design/studio/dashboard.md). Agents start with [AGENTS.md](AGENTS.md).

[Setup verification](design/studio/setup-report.md) records what was configured and checked. The first ready task is **M1-01**, owned by CTO.

## Plan and dashboard commands

Requires Node.js 22.14+ for these dependency-free planning scripts; AgentDashboard is expected at `http://127.0.0.1:5190`.

```powershell
node scripts/dashboard.mjs validate
node scripts/dashboard.mjs status
node scripts/dashboard.mjs start M1-01
```

`start` launches a real agent and consumes provider usage. Setup and validation do not. Task briefs are already stored in the dashboard's Context & usage handoff field; [the backlog](design/studio/backlog.md) also shows them.

## Game workspace commands (implemented, M1-05)

Tested on Node.js **22.14.0** / npm **10.9.2** on Windows (win32); `engines.node` requires `>=22.14.0`. No global package manager beyond npm; no Docker, cloud account or paid service required.

```powershell
npm ci              # reproducible install from the committed lockfile
npm run typecheck   # tsc --build across packages/apps + apps/web's own tsc --noEmit
npm test            # vitest across packages/contracts, packages/game, packages/content, apps/server, apps/web
npm run build       # tsc build for the packages/server, vite build for apps/web
npm run validate    # typecheck && test && build
npm run dev         # starts the API (3100) and UI (5174) together; configurable, clean shutdown
```

`npm run dev` checks both ports are free first and fails with a clear message (naming the env var to change) if either is occupied. Override with `API_PORT`, `WEB_PORT`, `API_HOST` env vars. Ctrl+C (or any signal delivered directly to the launcher process) stops both the API and the UI; on Windows the launcher uses `taskkill /t` per child so npm's own child processes (tsx/vite) are not left listening on the ports — killing the launcher indirectly through an external process-tree-unaware tool can still orphan children, since Windows has no native signal-forwarding through a `.cmd` wrapper; prefer an interactive terminal's Ctrl+C or killing the `node scripts/dev.mjs` process itself.

`npm run test:e2e` and `npm run simulate` are reserved script names that currently fail with a clear "not implemented yet" message — `test:e2e` belongs to `tests/e2e/` (QA), `simulate` is added in M1-12 against the real production rules engine (no duplicate balance engine). Game state (accounts, heroes, inventory, expeditions) stays entirely server-owned in `apps/server`; the `apps/web` shell only reads `/health` today and has no client-authoritative state.

`packages/contracts`, `packages/game`, `packages/content` are scaffolded as minimal placeholder packages (a version-marker export plus one test each) that build and typecheck cleanly; their real DTOs/combat rules/content tables land in M1-02/M1-04/M1-07+.
