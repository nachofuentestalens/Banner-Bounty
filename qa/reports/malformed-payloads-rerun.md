# Re-run of malformed-payloads regression suite against the integrated baseline — evidence report

Date: 2026-10-21 · Task ID 94b492bf-9ef3-4424-9204-c08ceb3e2e02 (priority 3, from CTO)

## Context

`design/studio/reports/malformed-json-400-fix.md` was reopened because its prior closure cited a 14/14
pass of `tests/e2e/malformed-payloads.mjs` (recorded in `qa/reports/M2-07.md`, branch
`agent/task-5394f37f-88fb-4ae3-aa1f-15e250c898a1`, commits `de0cc85`/`f3629ba`) that could not be verified
in the integrated baseline because neither file existed there at the time.

## Step 1 — merge check

Before making any changes, diffed this worktree's checkout against commit `de0cc85` (the referenced
"14/14" commit):

```
git diff de0cc85 -- tests/e2e/malformed-payloads.mjs qa/reports/M2-07.md
```

Output: empty — both files are already byte-identical to the referenced commit in this worktree's base
(`a93674c`, "Merge GitHub main into the managed baseline"). No merge commit was needed; the files had
already reached this baseline through that prior merge. `tests/e2e/boss-loss-retry.mjs` and
`tests/e2e/inventory-overflow.mjs` from the same source commit are also present and identical.

## Step 2 — fix presence check

Read `apps/server/src/app.ts:92-106` directly: the `FST_ERR_CTP_*` → `400 validation` branch (lines
100-106) is present, placed after the existing 413/`FST_ERR_CTP_BODY_TOO_LARGE` case, matching the fix
described in `design/studio/reports/malformed-json-400-fix.md`.

## Step 3 — independent run

```
npm install         # worktree had no node_modules; installed cleanly, 189 packages, 0 vulnerabilities
npm run build        # all five workspaces built clean (contracts, game, content, server, web)
node tests/e2e/malformed-payloads.mjs
```

The script starts its own in-process server (`startTestServer` from `tests/e2e/lib/server.mjs`) — no
separate manual server session was needed.

Exact output:

```
(node:759924) ExperimentalWarning: SQLite is an experimental feature and might change at any time
server up at http://127.0.0.1:57195
PASS oversized body (>16KB) is rejected with 400 validation on a mutating endpoint
PASS oversized body (>16KB) is rejected even on a pre-auth endpoint (/dev/session/select)
PASS over-length string (>256 chars) in a bounded field is rejected with validation
PASS wrong-arity tuple (4 elements instead of 3) in party order is rejected with validation
PASS missing requestId is rejected with validation, not a 500/crash
PASS non-UUID requestId is rejected with validation
PASS negative expectedRevision is rejected with validation
PASS non-integer (float) expectedRevision is rejected with validation
PASS wrong-type field (expectedRevision as a string) is rejected with validation
PASS completely empty body on a mutating endpoint is rejected with validation, not 500
PASS malformed JSON body (invalid syntax) is reported as validation/400, not internal/500 [DEFECT if it fails]
PASS unknown extra field in an otherwise-valid body does not break the request
PASS array-shaped body where an object is expected is rejected with validation, not 500
PASS server stays healthy after the full malformed-payload battery (no crash, no stuck state)

14/14 checks passed
```

## Result

**14/14 pass, verified live in this session** on the integrated baseline (base commit `a93674c`, no
code changes made — `tests/e2e/`, `qa/reports/M2-07.md`, and `apps/server/src/app.ts` were all already
present/correct; this run only added `node_modules` and `dist/` build output, neither committed).

This closes the verification gap `malformed-json-400-fix.md` was reopened for. CTO/Gameplay Programmer
can now close that report citing this run instead of the unverifiable prior claim.

## Limitations

- Did not re-run `boss-loss-retry.mjs` or `inventory-overflow.mjs` (out of scope for this task, which
  named only `malformed-payloads.mjs`).
- Did not re-verify M1-15's broader acceptance checklist (account isolation, concurrent retries, offline
  catch-up, restart, keyboard UI) — this task was scoped narrowly to the malformed-payloads regression
  re-run, not a full M1-15 pass.
