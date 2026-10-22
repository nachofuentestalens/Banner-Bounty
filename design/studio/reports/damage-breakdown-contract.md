# Damage breakdown contract amendment — evidence report

Date: 2026-10-22. Owner: CTO. Task: `195f2cb0-d2b9-4998-97e7-f1a1860bbc50`.
Originating implementation task: `c5bd2700-b2bc-4995-8741-16f5521c9d7b`.

## Changes and acceptance evidence

| Check | Result and evidence |
| --- | --- |
| Required committed inputs | PASS: `contracts.md` and `combat.md` exist in HEAD; verified with Git. No prerequisite tasks were assigned. |
| Recorded frozen-contract decision | PASS: `contracts.md` records the dated additive decision, both task IDs and its pre-acceptance purpose. |
| Exact DTO shape | PASS: optional readonly event field and all readonly `DamageStep`/`DamageBreakdown` properties match the originating source at `1c97617e03398961e5360ccaa22470e9a2905dc9`; automated field comparison passed. |
| Arithmetic and HP semantics | PASS by source inspection: `resolveHit` collects evaluated steps and short-circuits dodges; `pushEvent` captures prior HP, resolved damage before Vital Surge/clamping and actual loss as negative event amount; `tickStatuses` supplies Burn evidence. These meanings are now explicit in the contract. |
| Compatibility and ownership | PASS by document review: direct hits/dodges/Burn coverage, legacy/other-event omission, formatting-only UI and no intended balance/RNG/endpoint/migration/rules-version changes are explicit. Architecture note agrees. No runtime or Design-owned files edited. |
| Scope and whitespace | PASS: diff against task base `71ae95ff0a74946d02e80d8ca8820751e2af9db8` contains the contract amendment, architecture note and this report only; `git diff --check` passed with line-ending notices only. |

## Commands and results

Commands ran from `design/studio/` unless noted. Source reads used the existing originating branch without switching branches.

- `git status --short` — clean initial worktree.
- `git branch --show-current` — `agent/task-195f2cb0-d2b9-4998-97e7-f1a1860bbc50`.
- `git -C ../.. ls-files --error-unmatch design/studio/contracts.md design/game/combat.md` — exit 0, both tracked. `git ls-tree HEAD contracts.md ../game/combat.md` also confirmed committed blobs.
- `git rev-parse agent/task-c5bd2700-b2bc-4995-8741-16f5521c9d7b` — `1c97617e03398961e5360ccaa22470e9a2905dc9`.
- `git show agent/task-c5bd2700-b2bc-4995-8741-16f5521c9d7b:reports/engineering/skill-tooltips-damage-breakdown.md` — read originating evidence and unresolved contract-freeze finding.
- `git show agent/task-c5bd2700-b2bc-4995-8741-16f5521c9d7b:packages/contracts/src/index.ts` and `git show agent/task-c5bd2700-b2bc-4995-8741-16f5521c9d7b:packages/game/src/combat2.ts` — inspected relevant DTOs, `resolveHit`, `pushEvent`, direct-hit call sites and Burn tick via bounded `Select-String` output.
- `git diff --check` — exit 0; LF-to-CRLF notices only.
- `git diff --stat 71ae95ff0a74946d02e80d8ca8820751e2af9db8` and `git diff 71ae95ff0a74946d02e80d8ca8820751e2af9db8 -- contracts.md architecture.md` — reviewed additive documentation scope.

Exact automated shape check, passed through a PowerShell here-string to `node` (exit 0, printed PASS):

```js
const fs = require('node:fs');
const cp = require('node:child_process');
const doc = fs.readFileSync('contracts.md', 'utf8');
const src = cp.execFileSync('git', ['show', '1c97617e03398961e5360ccaa22470e9a2905dc9:packages/contracts/src/index.ts'], {encoding:'utf8'});
for (const name of ['DamageStep', 'DamageBreakdown']) {
 const fields = text => text.match(new RegExp(name + ' \\{([^}]+)\\}'))[1].split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
 if (JSON.stringify(fields(doc)) !== JSON.stringify(fields(src))) throw new Error(name + ' mismatch');
}
if (!doc.includes('readonly damageBreakdown?: DamageBreakdown') || !src.includes('readonly damageBreakdown?: DamageBreakdown')) throw new Error('missing event field');
console.log('PASS: DamageStep, DamageBreakdown and optional readonly event field match originating commit');
```

Initial path corrections: reading the Engineering report locally failed because it exists on the originating branch; corrected to `git show`. The initial `git ls-files` used root-relative paths from the studio directory and failed; corrected with `git -C ../..`. Neither was a missing required input or an approval refusal.

Checkpoint delivery: `git add contracts.md architecture.md reports/damage-breakdown-contract.md` and `git commit -m "Record additive damage breakdown battle-event contract"` were refused with permission denied creating `D:/Personal/B&B/.git/worktrees/195f2cb0-d2b9-4998-97e7-f1a1860bbc50/index.lock`, outside this session's writable scope. The dashboard subsequently saved all three files in commit `21b5697`. On resumption, `git status --short` was clean; `git log -2 --oneline` confirmed that checkpoint, and `git diff --stat 71ae95ff0a74946d02e80d8ca8820751e2af9db8` confirmed exactly three Leadership documents (90 inserted lines before this delivery note). No branch switch or integration was performed. This report-only delivery note is left for the dashboard's next automatic checkpoint.

## Limitations and next task

Documentation acceptance is complete. No runtime build, simulation or browser checks were rerun for this documentation-only change; the originating report's test results remain historical Engineering evidence, not independently certified here. `combat.md` 8.6 explicitly delegates the exact TypeScript shape to the contracts owner, so this additive metadata amendment needs no combat-rule edit. No unresolved contract question remains.

Next: dashboard review/integration of this amendment into originating task `c5bd2700-b2bc-4995-8741-16f5521c9d7b`'s baseline, then that task verifies the integrated contract before implementation acceptance. Do not duplicate gameplay work or interpret this report as integration already completed.
