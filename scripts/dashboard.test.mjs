import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root, validatePlan, createHandoff, createPrompt, readiness, completionProblems } from './dashboard.mjs';

const plan = JSON.parse(fs.readFileSync(path.join(root, 'planning/milestone.json'), 'utf8'));
const copy = () => structuredClone(plan);

test('registry resolves every input to a file or a prerequisite output', () => {
  assert.equal(validatePlan(plan).tasks, 16);
  const bad = copy();
  bad.tasks[1].inputs.push('missing-contract.md');
  assert.throws(() => validatePlan(bad), /no existing file or prerequisite producer/);
});

test('cycles, missing roles and escaping paths are rejected', () => {
  const cycle = copy();
  cycle.tasks[0].dependsOn.push('M1-02');
  assert.throws(() => validatePlan(cycle), /Dependency cycle/);
  const role = copy();
  role.tasks[0].role = 'Unknown';
  assert.throws(() => validatePlan(role), /Invalid task identity/);
  const escape = copy();
  escape.tasks[0].deliverables.push('../outside.md');
  assert.throws(() => validatePlan(escape), /Unsafe path/);
});

test('done prerequisite without evidence cannot unlock dependent task', () => {
  const task = plan.tasks.find((t) => t.id === 'M1-02');
  const records = new Map([['M1-01', { status: 'done', evidenceReviewed: true }], ['M1-02', { status: 'idle' }]]);
  assert.ok(readiness(task, plan, records, (p) => !p.endsWith('M1-01.md')).some((r) => r.includes('missing report')));
  assert.deepEqual(readiness(task, plan, records, () => true), []);
  records.set('M1-01', { status: 'idle' });
  assert.ok(readiness(task, plan, records, () => true).includes('M1-01 not done'));
});

test('native auto-done status cannot bypass coordinator evidence review', () => {
  const task = plan.tasks.find((t) => t.id === 'M1-02');
  const records = new Map([['M1-01', { status: 'done' }], ['M1-02', { status: 'idle' }]]);
  assert.ok(readiness(task, plan, records, () => true).includes('M1-01 evidence not reviewed'));
});

test('completion accepts native auto-done only with a successful work run and all outputs', () => {
  const task = plan.tasks[0];
  const records = new Map([[task.id, { status: 'done' }]]);
  const detail = { runs: [{ status: 'succeeded', purpose: 'work' }] };
  assert.deepEqual(completionProblems(task, plan, records, detail, () => true), []);
  assert.ok(completionProblems(task, plan, records, { runs: [] }, () => true).length);
  assert.ok(completionProblems(task, plan, records, { runs: [{ status: 'succeeded', purpose: 'handoff' }] }, () => true).length);
  assert.ok(completionProblems(task, plan, records, detail, (p) => p !== task.report).some((p) => p.includes('Missing deliverable')));
  records.set(task.id, { status: 'running' });
  assert.ok(completionProblems(task, plan, records, detail, () => true).some((p) => p.includes('idle or done')));
});

test('completed, missing and active tasks are not ready for initial dispatch', () => {
  const task = plan.tasks[0];
  for (const status of ['done', 'running', 'queued', 'waiting']) {
    assert.ok(readiness(task, plan, new Map([[task.id, { status }]]), () => true).length);
  }
  assert.ok(readiness(task, plan, new Map(), () => true).includes('not synced'));
});

test('handoffs fit native limits and preserve evidence and acceptance requirements', () => {
  for (const task of plan.tasks) {
    const text = createHandoff(task);
    assert.ok(text.length <= 6000);
    const handoff = JSON.parse(text);
    assert.deepEqual(Object.keys(handoff), ['goal', 'constraints', 'files', 'completed', 'verification', 'remaining']);
    assert.ok(Object.values(handoff).every((v) => typeof v === 'string' && v.length > 0));
    for (const criterion of task.acceptance) assert.ok(createPrompt(task).includes(criterion));
    assert.ok(handoff.completed.includes('No implementation'));
  }
});
