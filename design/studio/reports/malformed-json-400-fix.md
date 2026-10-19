# Fix: malformed JSON body returns 500/internal instead of 400/validation — closure report

Date: 2026-10-19 · Owner: CTO · Task ID a348d7f5-50ff-474a-9f09-7269875e43a1 · Priority 3 (from QA Tester)

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
misassignment to Tools Engineer, corrected per roles.md). The owner decided (recorded in
`design/decisions.md`, 2026-10-19) to keep the fix on Gameplay Programmer's own task/branch and treat this
task as closed once that work is verified, rather than granting this session write access to `apps/server`.

## Verification of Gameplay Programmer's fix

Reviewed commit `6acb778` (task `0d327d9e-f831-43f9-b8e0-3b7197e778e5`, branch
`agent/task-0d327d9e-f831-43f9-b8e0-3b7197e778e5`) and its evidence report
`reports/engineering/malformed-json-400-fix.md`:

| Check | Result |
|---|---|
| Patch matches the specified fix (new `fastifyError.code.startsWith("FST_ERR_CTP_")` branch mapping to `400 validation`, placed after the existing 413/`FST_ERR_CTP_BODY_TOO_LARGE` case) | confirmed via `git show 6acb778 -- apps/server/src/app.ts` |
| `npm install` / `npm run typecheck` / `npm run build` | reported pass in their evidence report |
| Manual repro on an isolated server instance (own port, own SQLite file, cleaned up after): malformed JSON body on `POST /expedition/settle` with a valid session returns `400 {code:"validation"}` instead of `500 {code:"internal"}` | reported pass, with request/response detail and confirmation no `[server] internal error` log line was emitted |
| Automated regression check `tests/e2e/malformed-payloads.mjs` (14/14) | **not run** — the file exists only on `agent/task-5394f37f-88fb-4ae3-aa1f-15e250c898a1` (commit `f3629ba`), not merged into either task's baseline. I independently confirmed this absence in my own worktree before delegating. |

No contract change was made or needed; `contracts.md` is unchanged.

## Unresolved

- The automated 14/14 regression check (`tests/e2e/malformed-payloads.mjs`, QA's `qa/reports/M2-07.md`) has
  not been run against the fix because its branch is not yet merged into the integrated baseline. This is a
  baseline-integration gap, not a defect in the fix itself — the manual repro demonstrates the same behavior
  the automated check targets.
- The fix and QA's regression-test branch currently sit on three separate, unmerged branches
  (this task's `a348d7f5`, the fix's `0d327d9e`, and QA's `5394f37f`). Whoever integrates M2 work should
  merge `0d327d9e`'s `apps/server/src/app.ts` change and `5394f37f`'s test file together and rerun
  `node tests/e2e/malformed-payloads.mjs` to confirm 14/14 before this is considered release-verified.

## Next task

None delegated by this task. Integration/merge of the above three branches is a release-management concern
for whoever next performs M2 baseline integration (e.g. a future M2 acceptance/release task), not a new
task opened here, to avoid creating speculative follow-up work.
