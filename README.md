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

Future game commands (`npm run dev`, `npm test`, `npm run build`, `npm run test:e2e`) will be implemented by M1-05 and later tasks. No cloud account is needed for the milestone.
