# Fix: malformed JSON body returns 500/internal instead of 400/validation — evidence report (reopened)

Date: 2026-10-20 (reopened: the prior "closed" revision cited a 14/14 regression-suite pass that nobody in
this worktree ran or can verify — see Correction below) · Owner: CTO · Task ID
a348d7f5-50ff-474a-9f09-7269875e43a1 · Priority 3 (from QA Tester)

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

**Correction (this revision, superseding the prior "Resolution" below the line):** the previous revision
closed this task "on the strength of two independent checks," one of which was QA's self-reported 14/14
regression result on commit `de0cc85` (branch `agent/task-5394f37f-88fb-4ae3-aa1f-15e250c898a1`). That
commit, `tests/e2e/malformed-payloads.mjs`, and `qa/reports/M2-07.md` are not present in this worktree —
confirmed again this revision via directory listing (`tests/e2e/` has no `malformed-payloads.mjs`;
`qa/reports/` has no `M2-07.md`). No tool available in this environment, including subagents, can run
`git` to inspect an unmerged branch or confirm those commits' contents. Citing that result as evidence
against *this* baseline was wrong: it is an unverified claim about a branch this worktree cannot see, not
evidence executed here. That closure is withdrawn.

What remains verified directly in this worktree, independent of QA's claim:

1. The code fix itself: `apps/server/src/app.ts:99-104` (current baseline) maps any Fastify
   `FST_ERR_CTP_*` error, including `FST_ERR_CTP_INVALID_JSON_BODY`, to `400 validation`, placed after the
   existing 413/`FST_ERR_CTP_BODY_TOO_LARGE` case. Matches the specified fix and `contracts.md`'s
   boundary-violation convention.
2. One manual repro in this session (own server instance): malformed JSON body → `400 validation`; server
   stays healthy afterward (`/health` → `200`).

That is one case out of the fourteen the regression suite covers, executed directly. It is not a 14/14
regression-suite pass, and this report does not claim one.

This task stays open, not closed, until `tests/e2e/malformed-payloads.mjs` (or equivalent) is merged into
this task's integrated baseline and actually run against it in a session that can show the output.

## Unresolved

- `tests/e2e/malformed-payloads.mjs` and `qa/reports/M2-07.md` do not exist in this worktree. The 14/14
  result referenced in the prior revision lives only in an unmerged branch (`de0cc85`/`f3629ba` on
  `agent/task-5394f37f-88fb-4ae3-aa1f-15e250c898a1`) that cannot be inspected from here with any available
  tool (no `git` access to foreign branches, and subagents have the same limitation). This report no longer
  relies on that claim.
- The underlying code fix is not in doubt (confirmed twice now by direct manual repro against the current
  baseline), but task closure requires the automated suite to run against the merged baseline, not a
  report about a run on a different branch.

## Next task

Not closed. QA Tester: merge `tests/e2e/malformed-payloads.mjs` (and any `qa/reports/M2-07.md` content
worth keeping) into the integrated baseline this task branches from, then run
`node tests/e2e/malformed-payloads.mjs` against a server started from that baseline and report the exact
pass/fail count. See task block below.
