import assert from 'node:assert/strict';
import test from 'node:test';
import { isRuntimeLog, needsIntegration, needsRecovery, parseStatus } from './recover-delivery.mjs';

test('integrates only idle approved role tasks whose approval matches the checkpoint', () => {
  const t = { roleId: 'r', stage: 'approved', status: 'idle', workspace: { error: null, approvedCommit: 'c', checkpointCommit: 'c' } };
  assert.ok(needsIntegration(t));
  assert.ok(!needsIntegration({ ...t, roleId: null }));
  assert.ok(!needsIntegration({ ...t, stage: 'needs_review' }));
  assert.ok(!needsIntegration({ ...t, status: 'running' }));
  assert.ok(!needsIntegration({ ...t, workspace: { ...t.workspace, checkpointCommit: 'd' } }));
  assert.ok(!needsIntegration({ ...t, workspace: null }));
});

test('only runtime logs are eligible for automatic reset', () => {
  assert.ok(isRuntimeLog('qa/artifacts/M2-closure/server-phase3.stdout.log'));
  assert.ok(isRuntimeLog('apps/server/run.stderr.log'));
  assert.ok(isRuntimeLog('startup-err.log'));
  assert.ok(!isRuntimeLog('qa/reports/M2-29.md'));
  assert.ok(!isRuntimeLog('qa/artifacts/M2-closure/observations.json'));
  assert.ok(!isRuntimeLog('apps/server/src/main.ts'));
});

test('parses tracked and untracked porcelain entries', () => {
  assert.deepEqual(parseStatus(' M qa/artifacts/a.stdout.log\n?? b.stderr.log\n'), { tracked: ['qa/artifacts/a.stdout.log'], untracked: ['b.stderr.log'] });
});

test('recovers only approved, unmerged stale-checkpoint failures', () => {
  const w = { approvedCommit: 'a', mergeCommit: null, error: null, publishError: 'Save a fresh checkpoint before publishing or merging.' };
  assert.ok(needsRecovery(w));
  assert.ok(!needsRecovery({ ...w, approvedCommit: null }));
  assert.ok(!needsRecovery({ ...w, mergeCommit: 'm' }));
  assert.ok(!needsRecovery({ ...w, publishError: 'GitHub POST failed (HTTP 422).' }));
  assert.ok(!needsRecovery(null));
});
