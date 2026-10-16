# Banner & Bounty

Local-only npm workspace (no cloud/paid services required to develop or run).

## Requirements

- Node.js `22.14.0` (see `.node-version`)
- npm `>=10.0.0` (ships with Node 22)

## Working commands (verified in M1-05)

```
npm ci              # install all workspace dependencies
npm run typecheck   # tsc --noEmit across every package/app
npm run test        # node's built-in test runner (via tsx) across every package/app
npm run build       # production build of apps/web and tsc build of packages/apps/server
npm run verify       # typecheck + test + build, in that order
npm run dev          # starts apps/server and apps/web together with port-conflict checks
```

`npm run dev` reads `WEB_PORT` (default `5174`) and `SERVER_PORT` (default `3100`) from the
environment so both ports are configurable, e.g. on Windows PowerShell:

```powershell
$env:WEB_PORT=5200; $env:SERVER_PORT=3200; npm run dev
```

If either port is already taken, `npm run dev` prints which port is busy and exits instead of
starting partially. Press `Ctrl+C` to stop both processes together; the server also exits
cleanly on `SIGINT`/`SIGTERM`.

The web app (Vite) proxies `/api/*` to the server's `/*` routes, so the browser shell talks to
`http://127.0.0.1:<SERVER_PORT>` without CORS configuration. Open `http://127.0.0.1:5174` and use
the "Check server health" button to confirm the Fastify `/health` route responds.

## Workspace layout

- `apps/web` — Vite + React shell (UI only, no game logic).
- `apps/server` — Fastify HTTP server; owns all game state (`/health` route today).
- `packages/contracts` — shared TypeScript types for the web/server boundary.
- `packages/game` — server-owned game state/logic (imported by `apps/server` only).
- `packages/content` — placeholder for seeded content/balance data (future M1 work).

Game state is server-owned: `packages/game` is a dependency of `apps/server`, not of `apps/web`.

## Not yet implemented (do not assume these work)

- No seeded balance simulations yet (tracked separately, see M1-12).
- No authentication, persistence, or real game rules — `/health` is the only route.
- No linting is wired up yet; `npm run verify` only covers typecheck/test/build.
- `packages/content` has no real content, only a placeholder export.

## Notes for this scaffold (M1-05)

`AGENTS.md` and `design/studio/{tech-stack,architecture,contracts}.md` did not exist in this
repository when this task ran (only an empty baseline commit was present), so the workspace,
port numbers, and framework choices here follow the task's own acceptance criteria directly.
Reconcile this README and the package choices once those design documents land.
