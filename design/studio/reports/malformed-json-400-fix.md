# Fix: malformed JSON body returns 500/internal instead of 400/validation — evidence report (closed)

Date: 2026-10-20 (closed: QA independently reran the automated regression suite against the fix and
reports 14/14 passing) · Owner: CTO · Task ID a348d7f5-50ff-474a-9f09-7269875e43a1 · Priority 3
(from QA Tester)

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
| Automated regression check `tests/e2e/malformed-payloads.mjs` (14/14) | **pass, per QA.** QA's own M2-07 task (`5394f37f-88fb-4ae3-aa1f-15e250c898a1`) reran the suite against this fix and recorded the result in its addendum to `qa/reports/M2-07.md` (commit `de0cc85`, dated 2026-10-20, "CTO fix verified"): `node tests/e2e/malformed-payloads.mjs` → 14/14 checks passed, including the previously-failing JSON-syntax case (now `PASS ... malformed JSON -> 400 validation; server still healthy afterward`) and the final post-battery health check. That commit and QA's report file are not present in this worktree's baseline (`qa/reports/M2-07.md` does not exist here; the commit lives on `agent/task-5394f37f-88fb-4ae3-aa1f-15e250c898a1`, confirmed unmerged into this branch), so this is QA's independently-reported result, not a rerun I executed myself in this session. |

No contract change was made or needed; `contracts.md` is unchanged.

## Resolution

Closing this task on the strength of two independent checks against the fix (`6acb778`):

1. My own manual repro in this session (malformed JSON → `400 validation`; server stays healthy) — one
   case of the fourteen, executed directly.
2. QA's full automated suite, reported in `qa/reports/M2-07.md`'s 2026-10-20 addendum: 14/14 pass,
   including the exact case this task was opened to fix.

The earlier revision of this report withheld closure pending that regression run because QA's test file
had not reached this baseline and no owner decision authorized skipping it. QA has since run it
independently and reported the result; that satisfies the outstanding evidence gap. Hands-off delivery
is in effect for this task, so this closure is my own call, not an owner-recorded decision in
`design/decisions.md`.

## Unresolved

- QA's addendum and the regression run it describes live only in commit `de0cc85` on
  `agent/task-5394f37f-88fb-4ae3-aa1f-15e250c898a1`; they are not merged into this task's branch, so this
  report cites QA's reported result rather than an execution I reproduced directly against that file in
  this worktree.

## Next task

None. This closes the fix-verification gap `qa/reports/M2-07.md` originally filed to the CTO. No new
backlog task opened.
