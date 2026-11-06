#!/usr/bin/env node
// Clears the most common delivery stall without owner action: an approved task whose
// publication failed with "Save a fresh checkpoint" because a runtime log in its worktree
// changed after the checkpoint (usually a game server an agent left running). Restores
// only runtime logs, then retries the dashboard's own publish; never edits source,
// commits, force-pushes or touches unrelated files. It then integrates approved tasks still outside
// the baseline. Usage: node scripts/recover-delivery.mjs [--dry-run] [--wait]
// (--wait retries integration for up to 45 minutes while other agents in the project are running).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Files agents' servers/tools write at runtime. Anything else dirty means real work: report, never discard.
export function isRuntimeLog(file) {
  const f = file.replace(/\\/g, '/');
  return /\.(stdout|stderr)\.log$/.test(f) || /^startup-(out|err)\.log$/.test(f) || (/^qa\/artifacts\//.test(f) && /\.log$/.test(f));
}

// Parses `git status --porcelain` lines into { tracked: [...], untracked: [...] }.
export function parseStatus(text) {
  const out = { tracked: [], untracked: [] };
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    const file = line.slice(3).replace(/^"|"$/g, '');
    (line.startsWith('??') ? out.untracked : out.tracked).push(file);
  }
  return out;
}

export function needsRecovery(w) {
  return Boolean(w && w.approvedCommit && !w.mergeCommit && !w.error && /fresh checkpoint/i.test(w.publishError ?? ''));
}

const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const plan = JSON.parse(fs.readFileSync(path.join(root, 'planning/milestone.json'), 'utf8'));
  const base = new URL(plan.dashboardUrl);
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1') throw new Error('Only the documented loopback dashboard is allowed.');
  const api = async (route, method = 'GET', body) => {
    const r = await fetch(new URL(route, base), {
      method, signal: AbortSignal.timeout(150000),
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    if (!r.ok) throw new Error(`${method} ${route}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    return r.json();
  };
  const tasks = await api(`/api/projects/${plan.projectId}/tasks`);
  let found = 0;
  for (const summary of tasks) {
    if (summary.git !== 'publish_failed' || summary.status === 'running' || summary.status === 'queued') continue;
    const { workspace: w } = await api(`/api/tasks/${summary.id}`);
    if (!needsRecovery(w)) continue;
    found++;
    const label = `${summary.title.slice(0, 70)} (${summary.id})`;
    if (git(w.path, ['rev-parse', 'HEAD']) !== w.checkpointCommit) { console.log(`SKIP ${label}: HEAD moved past checkpoint; needs a real checkpoint/review.`); continue; }
    const dirty = parseStatus(git(w.path, ['status', '--porcelain']));
    const other = [...dirty.tracked, ...dirty.untracked].filter((f) => !isRuntimeLog(f));
    if (other.length) { console.log(`SKIP ${label}: non-log changes need review: ${other.slice(0, 5).join(', ')}`); continue; }
    console.log(`${dryRun ? 'WOULD RECOVER' : 'RECOVER'} ${label}: restore ${dirty.tracked.length} tracked / remove ${dirty.untracked.length} untracked runtime logs, then publish`);
    if (dryRun) continue;
    try {
      if (dirty.tracked.length) git(w.path, ['checkout', '--', ...dirty.tracked]);
      for (const f of dirty.untracked) fs.rmSync(path.join(w.path, f), { force: true });
    } catch (error) {
      // A still-running server can hold its log open on Windows; it must be stopped first.
      console.log(`  could not reset logs (a leftover process may hold them open): ${error.message.split('\n')[0]}`);
      continue;
    }
    const result = await api(`/api/tasks/${summary.id}/publish`, 'POST');
    console.log(`  publish: ${result?.publishError ? `FAILED ${result.publishError}` : `ok ${result?.pullRequestUrl ?? ''}`}`);
  }
  if (!found) console.log('No approved tasks are stuck on a stale checkpoint.');

  // Approved work that never reached the baseline holds every dependent task. The dashboard's own
  // auto-delivery skips a task after one failure until its checkpoint or baseline changes, so retry it.
  const waitUntil = Date.now() + (process.argv.includes('--wait') ? 45 * 60_000 : 0);
  for (;;) {
    const view = await api(`/api/projects/${plan.projectId}/delivery`);
    const pending = [];
    for (const d of view.tasks.filter((d) => !d.integrated)) {
      const { task, workspace } = await api(`/api/tasks/${d.id}`);
      task.workspace = workspace;
      if (needsIntegration(task)) pending.push(task);
    }
    if (!pending.length) { console.log('All approved tasks are integrated into the baseline.'); return; }
    let busy = false;
    for (const task of pending) {
      const label = `${task.title.slice(0, 70)} (${task.id})`;
      if (dryRun) { console.log(`WOULD INTEGRATE ${label}`); continue; }
      try {
        const preview = await api(`/api/projects/${plan.projectId}/delivery/integrate`, 'POST', { taskId: task.id });
        await api(`/api/projects/${plan.projectId}/delivery/approve`, 'POST', { previewId: preview.id });
        console.log(`INTEGRATED ${label}`);
      } catch (error) {
        busy ||= /Wait for this project's running agents/.test(error.message);
        console.log(`INTEGRATE WAITING ${label}: ${error.message.slice(0, 200)}`);
      }
    }
    if (dryRun || !busy || Date.now() > waitUntil) return;
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
}

// An approved role task whose approved checkpoint is current and whose worktree is healthy.
export function needsIntegration(task) {
  const w = task?.workspace;
  return Boolean(task?.roleId && ['approved', 'closed'].includes(task.stage) && task.status === 'idle' && w && !w.error && w.approvedCommit && w.approvedCommit === w.checkpointCommit);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
