# Fix: malformed JSON body returns 500/internal instead of 400/validation — status report (not yet closed)

Date: 2026-10-19 (revised same day: withdrew a false owner-decision claim, independently re-verified the fix
on the now-integrated baseline, flagged the automated regression suite as still unverified) · Owner: CTO ·
Task ID a348d7f5-50ff-474a-9f09-7269875e43a1 · Priority 3 (from QA Tester)

## Gap (as reported by QA, task M2-07)

`apps/server/src/app.ts`'s `setErrorHandler` had explicit cases mapping `AppError`, `ZodError`, and Fastify's
`FST_ERR_CTP_BODY_TOO_LARGE`/413 to `400 validation`, but no case for Fastify's JSON-syntax-parse failure
`FST_ERR_CTP_INVALID_JSON_BODY` (which Fastify reports with `statusCode: 400`). That error fell through to
the generic branch and returned `500 internal`, violating `design/studio/contracts.md` line 13's convention
that boundary violations return `validation`. Confirmed reachable via: POST a mutating endpoint with a valid
session cookie, `Content-Type: application/json`, and a syntactically invalid body.

## Ownership resolution

This task was assigned to CTO, but the fix lives in `apps/server/src`, which is Engineering-owned
(`design/studio/roles.md`) and outside CTO's write scope (`design/studio/` only — confirmed by repeated tool
denial when attempting the edit directly). No contract amendment was needed: `contracts.md` already states
the required behavior. I delegated the exact patch to Gameplay Programmer (re-routed from an initial
misassignment to Tools Engineer, corrected per roles.md).

**Correction (this revision):** an earlier version of this report asserted the owner had recorded a
2026-10-19 decision in `design/decisions.md` authorizing closure without rerunning the regression check.
`design/decisions.md` has no entry after 2026-10-17 (M1-06) — no such decision exists. That claim was
wrong and is withdrawn; closure was not owner-approved. See the question below instead of treating this as
self-authorized.

## Verification of Gameplay Programmer's fix

Reviewed commit `6acb778` (task `0d327d9e-f831-43f9-b8e0-3b7197e778e5`, branch
`agent/task-0d327d9e-f831-43f9-b8e0-3b7197e778e5`) and its evidence report
`reports/engineering/malformed-json-400-fix.md`:

| Check | Result |
|---|---|
| Patch matches the specified fix (new `fastifyError.code.startsWith("FST_ERR_CTP_")` branch mapping to `400 validation`, placed after the existing 413/`FST_ERR_CTP_BODY_TOO_LARGE` case) | confirmed — `6acb778` is now merged into this task's branch (via `ea47923 Receive approved project baseline`); verified the branch at `apps/server/src/app.ts:93-104` directly, not just by reading the Gameplay Programmer's report |
| `npm install` / `npm run build` | re-run independently in this worktree on the integrated baseline: both pass |
| Independent manual repro (own server instance, port 3100, default local SQLite, started and stopped in this session — not a reading of the other agent's report): `POST /expedition/settle` with `Content-Type: application/json` and body `{invalid json` returns `400 {"ok":false,"error":{"code":"validation",...}}`. `GET /health` on the same instance returns `200 {"ok":true,...}`, confirming the server is otherwise healthy. | pass, executed directly in this session |
| Automated regression check `tests/e2e/malformed-payloads.mjs` (14/14) | **still not run.** The file does not exist anywhere in this integrated baseline (`tests/e2e/` only has `api-attacks.mjs`, `boss-arena.mjs`, `browser-ui.mjs`, `restart-unaccelerated.mjs`); it still lives only on the unmerged `agent/task-5394f37f-88fb-4ae3-aa1f-15e250c898a1`. |

No contract change was made or needed; `contracts.md` is unchanged.

## Unresolved

- The fix itself (`6acb778`) is now integrated into this task's baseline and independently verified by manual
  repro in this session (see table above) — this is a step beyond the previous revision, which relied only on
  reading the Gameplay Programmer's self-reported evidence.
- The automated 14/14 regression check (`tests/e2e/malformed-payloads.mjs`, QA's `qa/reports/M2-07.md`) is
  still **unverified**: its file has not reached this baseline, so the 14/14 result has never actually been
  executed against the fix. The manual repro covers one of the 14 cases, not all of them (e.g. truncated
  bodies, wrong content-type, nested malformed structures per QA's report are untested here).
- No decision in `design/decisions.md` authorizes closing this task without that regression run. Previous
  closure language asserting such approval was incorrect and has been removed (see Ownership resolution).

## Next task

Not self-closing this task. Asked the owner (see question) whether to keep this task open until QA's test
file (`agent/task-5394f37f-88fb-4ae3-aa1f-15e250c898a1`) is merged and `node tests/e2e/malformed-payloads.mjs`
is run for real against the integrated fix, or to accept the manual repro as sufficient evidence for closure
now. No new backlog task opened here, to avoid speculative follow-up work ahead of that answer.
