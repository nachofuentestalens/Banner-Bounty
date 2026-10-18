# Banner & Bounty

A mainly text-based idle party RPG for local hosting and asynchronous multiplayer. Current state: **M1 local release candidate** (M1-14). You manage a three-hero company: send it on expeditions, collect rewards, equip gear, choose specializations at level 3, beat the Tollkeeper boss and challenge another local company's published team in the arena.

Agents start with [AGENTS.md](AGENTS.md). Planning: [milestone](design/studio/vision.md), [task order](design/studio/priorities.md), [dashboard operations](design/studio/dashboard.md). Release-candidate evidence: [reports/engineering/M1-14.md](reports/engineering/M1-14.md).

## Prerequisites

- **Windows 10/11** (the tested platform; macOS/Linux are expected to work but are untested).
- **Node.js 22.14.0** (exact tested version, also in `.node-version`; `engines.node` is `>=22.14.0`) with the bundled **npm 10.9.2**. Saves use the built-in `node:sqlite` module, so there is no separate database to install. Node prints one `ExperimentalWarning: SQLite is an experimental feature` line at startup. That is expected.
- No Docker, cloud account, paid service or global package beyond npm.
- Browser walkthrough only: Microsoft Edge (preinstalled on Windows) **or** Playwright's Chromium (`npx playwright install chromium`, then set `PW_CHANNEL=chromium`).

## Play the release candidate (one process)

```powershell
npm ci          # reproducible install from the committed lockfile
npm run build   # builds packages, the API and the web client (apps/web/dist)
npm start       # API + built client at http://127.0.0.1:3100/
```

Open <http://127.0.0.1:3100/> and choose **Company A** or **Company B**. Stop the server with **Ctrl+C**. It is a single Node process with no children of its own, and it closes the database on SIGINT/SIGTERM. Startup logs the save database path and whether the built client was found. If you forgot `npm run build`, it says so and the API still runs.

## Development

```powershell
npm run dev        # API on 3100 (tsx watch) + Vite UI with hot reload on http://127.0.0.1:5174/
npm run typecheck  # tsc --build for packages/server + apps/web tsc --noEmit
npm test           # Vitest: contracts, game, content, server, web
npm run validate   # typecheck && test && build (the standard gate)
npm run walkthrough            # 10-step browser walkthrough against the built client (run `npm run build` first)
node scripts/simulate.mjs --seed 1 --runs 8 --max-cycles 100   # seeded pacing + 8h catch-up benchmark
```

In `npm run dev`, Vite serves the UI and proxies API paths to the API, and the API does not serve `apps/web/dist` (`SERVE_WEB=0`). Ctrl+C stops both. On Windows the launcher kills each child's process tree with `taskkill /t`. If you kill the launcher from outside with a tool that ignores process trees, children can be orphaned. Prefer Ctrl+C, or kill the `node scripts/dev.mjs` process itself.

**PowerShell note:** Windows PowerShell 5.1 drops a bare `--`, so `npm run simulate -- --seed 1` passes the flags to npm instead of the script. Call `node scripts/simulate.mjs …` directly (as above). `npm run simulate -- --seed 1` works as-is in Git Bash (verified) and cmd.exe.

`npm run test:e2e` is reserved for QA's `tests/e2e/` suite and prints "not implemented" until QA adds it. `npm run walkthrough` is the engineering release-candidate check. It is not that suite.

## Ports and configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_PORT` | `3100` | API (and built client in `npm start`) |
| `WEB_PORT` | `5174` | Vite dev UI (`npm run dev` only) |
| `API_HOST` | `127.0.0.1` | Bind address. Loopback only by default. Changing it exposes unauthenticated local accounts to your network; don't, unless you mean to. |
| `DB_PATH` | `<repo>/data/banner-and-bounty.sqlite` | Save database |
| `SERVE_WEB` / `WEB_DIST` | on / `apps/web/dist` | Whether and from where the API serves the built client |

Ports avoid AgentDashboard's 5173/5190. If a port is taken, startup stops with a message naming the variable to change, e.g. `[server] port 3100 is already in use on 127.0.0.1. Set API_PORT to a free port and retry.` Example: `$env:API_PORT=3200; npm start`.

## Saves: location, backup, restore, reset

- **Location:** `data/banner-and-bounty.sqlite` at the repository root (plus `-wal`/`-shm` companions while running). `npm start` and `npm run dev` use the same file whatever the working directory. `data/` is gitignored. `npm run save:path` prints the resolved path. (Before M1-14, `npm run dev` stored it in `apps/server/data/`. To keep an older dev save, stop the server and move that file to `data/`.)
- **Backup:** `npm run save:backup` writes a consistent snapshot to `data/backups/banner-and-bounty-<timestamp>.sqlite` using SQLite `VACUUM INTO`. It is safe while the server runs.
- **Restore:** stop the server, delete `data/banner-and-bounty.sqlite-wal` and `-shm` if present, copy the backup over `data/banner-and-bounty.sqlite`, then start again.
- **Reset:** `npm run save:reset -- confirm`. It refuses without the word `confirm` (a plain word rather than a flag, so it survives PowerShell), refuses while something is listening on `API_PORT`, and **always writes a backup first**. The next start recreates fresh Companies A and B.
- Tests, `npm run walkthrough` and `npm run simulate` use in-memory or temporary databases and **never touch your save**. To experiment without risking it, run with `$env:DB_PATH="$PWD\data\scratch.sqlite"`.
- The game server owns all time and progress. Expedition time accrues from server timestamps while the browser is closed **and while the server is stopped**, capped at 8 hours of offline progress per collection.

## Two-account testing

The server seeds two local accounts, **Company A** and **Company B**. Each browser profile/context holds one session cookie, so to play both at once use two separate contexts: for example a normal window plus an InPrivate window, or two browser profiles. A second tab in the same window shares the cookie and switches that window's account. Typical arena check: B opens **Arena → Publish Team**; A opens **Arena**, selects B's team, and clicks **Challenge**. B's later changes never alter A's saved report.

## Local-only authentication (limitations)

- "Choosing a company" **is** the login. There are no passwords. Anyone who can reach the API port can act as A or B. This is only acceptable because the server binds to loopback by default.
- Sessions are opaque server-side IDs in an `HttpOnly; SameSite=Strict` cookie, without `Secure` because the server is plain HTTP on localhost. There is no TLS, rate limiting, account creation or hosted auth in M1.
- The server still enforces ownership. A session can only read or change its own heroes, items and private reports; forged IDs for the other company are rejected. Treat this as protection against mistakes, not against an attacker on your network.

## Plan and dashboard commands

Dependency-free planning scripts (AgentDashboard expected at `http://127.0.0.1:5190`):

```powershell
node scripts/dashboard.mjs validate
node scripts/dashboard.mjs status
node scripts/dashboard.mjs start M1-01
```

`start` launches a real agent and consumes provider usage. Setup and validation do not.
