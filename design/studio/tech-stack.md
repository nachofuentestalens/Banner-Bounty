# Technical baseline

Use a small TypeScript web application with one local authoritative Node.js server and SQLite. Avoid infrastructure that does not serve the first playable.

| Area | Choice | Reason |
| --- | --- | --- |
| Language | TypeScript, strict mode | Shared contracts and checkable game rules |
| Client | React, Vite, CSS | Text-rich UI, browser inspection, reusable components |
| Server | Node.js LTS, Fastify | One local process and explicit validated actions |
| Storage | SQLite through `node:sqlite` | No separately installed database service |
| Validation | Zod at external boundaries | Reject malformed inputs and invalid content |
| Unit/integration | Vitest | Deterministic simulations and API/storage checks |
| Browser checks | Playwright | Separate account contexts and real UI flows |
| Package manager | npm workspaces + committed lockfile | One install path, no extra global package manager |

Node 22.14.0 is installed on the planning machine. M1-05 must verify compatibility of selected package versions and `node:sqlite`, record an exact tested Node version in README and `.node-version`, and pin the installed dependency graph. Prefer an already installed supported runtime; report an actual incompatibility before requiring an upgrade. Do not silently switch persistence engines.

## Planned layout

```text
apps/web/                 React interface and API client
apps/server/              Fastify routes, services, SQLite, migrations
packages/contracts/      DTOs and validation schemas; no DB/browser imports
packages/game/           deterministic simulation and progression rules
packages/content/        validated versioned class/item/enemy data
scripts/                 local lifecycle, content and balance commands
tests/e2e/               browser acceptance flows
design/                  dashboard-visible documentation
qa/                      QA reports and release evidence
reports/engineering/     implementation task evidence
data/                    ignored local databases
planning/                milestone registry and dashboard mapping
```

## Commands to implement

- `npm ci`: reproducible installation after the lockfile exists.
- `npm run dev`: starts client and server together, localhost by default; handles port conflicts and clean shutdown on Windows.
- `npm run typecheck`, `npm test`, `npm run build`: focused structural and runtime gates.
- `npm run test:e2e`: isolated test database, two browser contexts; never reset a real save.
- `npm run validate`: typecheck, unit/integration tests, build; E2E is an explicit release gate.
- `npm run simulate -- --seed 1 --runs 100`: added in M1-12; real production rules, no duplicate balance engine.

Use game ports 3100 (API) and 5174 (dev UI), configurable, to avoid AgentDashboard's 5190/5173. Serve the built client from the API for a one-process release preview. No Docker requirement, cloud CI dependency, WebSocket framework, ORM, or client state library until evidence justifies it. Ordinary packages listed here are preselected for M1; do not create a CTO approval task for each installation.

Optional later: Electron packaging, richer graphics, PostgreSQL and hosted authentication. Keep migration boundaries now without implementing those features.
