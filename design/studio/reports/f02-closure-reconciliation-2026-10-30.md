# F02 fix integration and orphaned M2-closure evidence — reconciliation

Task: `7c468524-4786-48b2-94bf-d34443f706e0`. Producer. Date: 2026-10-30.

## What this reconciles

`director-daily-2026-10-30.md` reported F02 (status-duration badge off-by-one) as
"still not integrated" and flagged an orphaned evidence checkpoint `faa3f5c`. Both
claims were true when that report was written, but the baseline moved since. This
report records the current, verified state as of this task's run.

## 1. F02 fix task state

Gameplay Programmer task `952bfce2-c546-4460-915f-4a7c84da33d1` ("Fix M2-29-F02:
status-duration badge off by one round vs feed text") — dashboard stage **approved**.

Verified on this checkout's `main`:

- `git merge-base --is-ancestor agent/task-952bfce2-c546-4460-915f-4a7c84da33d1 main` → **true**.
- `git show main:apps/web/src/components/BattleView.tsx` line 154 reads
  `Math.max(0, s.duration - (currentRound - s.appliedRound))`, not the old
  unconditional `Math.max(0, s.duration - 1)`.

**The F02 fix is integrated into the baseline.** QA already retested it: task
`f502e33d-1203-4fa8-8222-4957b79b5dea` ("Retest F02 after integrated fix...", stage
**approved**) ran the full review-gate retest and recorded 0 of 38 historical
status-duration discrepancies remaining (`qa/reports/M2-29-F02-retest.md`, on
`main`). `qa/reports/M2-29.md` on `main` already reflects F02 as fixed and closed.

The nine "F02 prerequisite missing" commits the director's report cited were all
correct at the time they ran; they predate `952bfce2`/`f502e33d` reaching this
baseline. No further re-dispatch of a "check prerequisite" pass is needed — the
prerequisite is now satisfied.

## 2. The orphaned `faa3f5c` checkpoint

`faa3f5c` ("Record initial M2 closure replay evidence...") sits on branch
`agent/task-279a9824-633f-43d4-9163-e0271d770ab4` and is **not** an ancestor of
`main` (`git merge-base --is-ancestor faa3f5c main` → false).

However: `git merge-base --is-ancestor agent/task-952bfce2... faa3f5c` → **true** —
the F02 fix was already present on that branch when this replay evidence
(`qa/artifacts/M2-closure/battles/...`, arena/boss/dungeon-floor/dungeon-boss
reports and screenshots) was captured. This is **not stale, superseded, or
duplicate work** — it is real post-fix replay evidence for the combined F01+F02
closure retest, just not yet merged into the baseline because the owning task
(`279a9824`) has not published/closed.

## 3. Action taken

No branch was merged or deleted (not this role's action to take, and the dashboard
integrates approved task branches automatically). This report is the smallest
reversible action: it records the confirmed baseline state so the next run of
`279a9824` does not re-derive "prerequisite missing" from scratch, and so nobody
mistakes `faa3f5c` for stale work to discard.

A task was sent to QA Tester (see below) to resume `279a9824` on this confirmed
state and complete the combined F01+F02 closure retest, incorporating or
superseding `faa3f5c`'s artifacts as its evidence shows fit, then publish normally
so the dashboard's standard squash-merge integrates it.

Task `610a411c-...` ("Consolidate F02 blocker notes and requeue F02 retest behind
fix 952bfce2") was opened on the premise that the fix was still missing. That
premise no longer holds; whoever resumes it should re-check this report before
doing further blocker-note consolidation, to avoid duplicating `279a9824`'s work.

## Exact condition that unblocks F01+F02 closure retest, then M3-02

- **F02 half: already satisfied.** Fix integrated (`952bfce2` is an ancestor of
  `main`) and independently retested (`f502e33d`, `M2-29-F02-retest.md`).
- **Remaining blocker: F01** (formation rows not visually distinguished in battle
  view) is still open and unfixed per `qa/reports/M2-29.md` on `main` ("FAIL — P2
  M2-29-F01, open"). `279a9824`'s combined closure retest can exercise F02 now but
  cannot report full M2 closure until a Gameplay Programmer fix for F01 lands and
  is retested the same way F02 was.
- Once F01 is fixed, integrated (ancestor of `main`), and retested, `279a9824`
  reports the combined F01+F02 discrepancy count, the Game Director issues the
  M2-closure verdict (M3-02), and M3 production tasks gated on M3-02 can start.
