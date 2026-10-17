import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(root, 'planning', 'milestone.json');
const statePath = path.join(root, 'planning', 'dashboard-state.json');
const lockPath = path.join(root, 'planning', '.dispatch.lock');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const exists = (relative) => fs.existsSync(path.join(root, relative));
const reportHash = (relative) => exists(relative) ? createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex') : null;
const within = (file, scope) => scope === '.' || file === scope || file.startsWith(`${scope}/`);

export function validatePlan(plan, fileExists = exists) {
  const errors = [];
  const roles = new Map((plan.roles ?? []).map((r) => [r.name, r]));
  const tasks = new Map((plan.tasks ?? []).map((t) => [t.id, t]));
  if (plan.schemaVersion !== 1 || !plan.projectId || !plan.tasks?.length) errors.push('Invalid plan header.');
  if (roles.size !== plan.roles?.length || tasks.size !== plan.tasks?.length) errors.push('Duplicate role or task ID.');
  const safePath = (p) => typeof p === 'string' && /^(?:\.|[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*)$/.test(p) && !p.split('/').includes('..');
  for (const role of roles.values()) {
    if (!role.brief || !role.department || !['low', 'medium'].includes(role.effort)) errors.push(`Invalid role: ${role.name}`);
    for (const input of role.contextDocs ?? []) if (!safePath(input) || !fileExists(input)) errors.push(`Missing role context: ${input}`);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push(`Dependency cycle at ${id}`); return; }
    if (visited.has(id) || !tasks.has(id)) return;
    visiting.add(id);
    for (const dep of tasks.get(id).dependsOn ?? []) visit(dep);
    visiting.delete(id);
    visited.add(id);
  }
  function ancestors(id, found = new Set()) {
    for (const dep of tasks.get(id)?.dependsOn ?? []) {
      if (found.has(dep)) continue;
      found.add(dep);
      ancestors(dep, found);
    }
    return found;
  }
  for (const task of tasks.values()) {
    if (!/^M1-\d{2}$/.test(task.id) || !roles.has(task.role) || !task.goal || !task.title) errors.push(`Invalid task identity: ${task.id}`);
    if (!Number.isInteger(task.priority) || task.priority < 0 || task.priority > 10) errors.push(`Invalid priority: ${task.id}`);
    if (!['low', 'medium'].includes(task.effort) || !task.acceptance?.length || !task.scope?.length) errors.push(`Incomplete task: ${task.id}`);
    for (const dep of task.dependsOn ?? []) if (!tasks.has(dep) || dep === task.id) errors.push(`Invalid dependency: ${task.id} -> ${dep}`);
    for (const p of [...(task.inputs ?? []), ...(task.deliverables ?? []), ...(task.scope ?? []), task.report]) {
      if (!safePath(p)) errors.push(`Unsafe path in ${task.id}: ${p}`);
    }
    if (!task.deliverables?.includes(task.report)) errors.push(`Report is not a deliverable: ${task.id}`);
    for (const output of task.deliverables ?? []) {
      if (!task.scope?.some((s) => within(output, s))) errors.push(`Output outside task scope: ${task.id}: ${output}`);
    }
    const deps = ancestors(task.id);
    for (const input of task.inputs ?? []) {
      const produced = [...deps].some((id) => tasks.get(id)?.deliverables?.includes(input));
      if (!fileExists(input) && !produced) errors.push(`Input has no existing file or prerequisite producer: ${task.id}: ${input}`);
    }
    if (createHandoff(task).length > 6000) errors.push(`Handoff too long: ${task.id}`);
    visit(task.id);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { roles: roles.size, tasks: tasks.size, dependencies: plan.tasks.reduce((n, t) => n + t.dependsOn.length, 0) };
}

export function createPrompt(task) {
  return [
    `${task.id}: ${task.title}`, `Owner: ${task.role}.`, task.goal,
    'Read AGENTS.md first, then only these inputs:', ...task.inputs.map((p) => `- ${p}`),
    `Dependencies: ${task.dependsOn.join(', ') || 'none'}.`,
    `Write scope: ${task.scope.join(', ')}. Department ownership still applies; root scope does not override it.`,
    'Deliverables:', ...task.deliverables.map((p) => `- ${p}`),
    'Acceptance:', ...task.acceptance.map((a, i) => `${i + 1}. ${a}`),
    `Evidence report: ${task.report}; include pass/partial/blocked/fail, exact checks, results, limitations and next task.`,
    'Do not launch agents, delegate, auto-start successors or create duplicate backlog tasks. Implement only this assigned task. Keep output bounded and do not rerun successful broad checks without a relevant change.',
    'At a safe incomplete phase boundary, return the dashboard six-field context-handoff. A coordinator reviews evidence before marking done.'
  ].join('\n');
}

export function createHandoff(task) {
  return JSON.stringify({
    goal: `${task.id}: ${task.goal}`,
    constraints: 'Read AGENTS.md. Local Windows development, no paid/cloud dependency, no delegation or speculative work. Follow task scope and existing department ownership. Only bounded relevant reads/checks.',
    files: [...task.inputs, ...task.deliverables].join('; '),
    completed: 'Planning only. No implementation or acceptance check for this task has been completed.',
    verification: 'Task is staged without an agent run. Dependencies and acceptance must be checked when execution starts.',
    remaining: createPrompt(task)
  });
}

export function readiness(task, plan, records, fileExists = exists) {
  const reasons = [];
  const own = records.get(task.id);
  if (!own) reasons.push('not synced');
  else if (own.status !== 'idle') reasons.push(`task ${own.status}`);
  for (const dep of task.dependsOn) {
    if (records.get(dep)?.status !== 'done') reasons.push(`${dep} not done`);
    if (!records.get(dep)?.evidenceReviewed) reasons.push(`${dep} evidence not reviewed`);
    const report = plan.tasks.find((t) => t.id === dep)?.report;
    if (!report || !fileExists(report)) reasons.push(`${dep} missing report`);
  }
  for (const input of task.inputs) if (!fileExists(input)) reasons.push(`missing ${input}`);
  return reasons;
}

export function completionProblems(task, plan, records, detail, fileExists = exists) {
  const problems = [];
  const record = records.get(task.id);
  if (!['idle', 'done'].includes(record?.status)) problems.push('Task must be idle or done for evidence review.');
  const latest = detail.runs.at(-1);
  if (!latest || latest.status !== 'succeeded' || latest.purpose !== 'work') problems.push('Latest run must be a successful work run.');
  for (const output of task.deliverables) if (!fileExists(output)) problems.push(`Missing deliverable: ${output}`);
  problems.push(...readiness(task, plan, new Map([...records, [task.id, { ...record, status: 'idle' }]]), fileExists));
  return problems;
}

function writeState(state) {
  const temp = `${statePath}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(temp, statePath);
}

function writeBacklog(plan) {
  const lines = ['# First-playable task briefs', '', 'Generated from `planning/milestone.json` by `node scripts/dashboard.mjs validate`. Edit the registry, not this file. All tasks begin staged; live status is in AgentDashboard.', ''];
  for (const t of plan.tasks) {
    lines.push(`## ${t.id}: ${t.title}`, '', `Owner: **${t.role}** | priority ${t.priority} | effort ${t.effort} | prerequisites: ${t.dependsOn.join(', ') || 'none'}`, '', t.goal, '', `Inputs: ${t.inputs.map((p) => `\`${p}\``).join(', ')}`, '', `Deliverables: ${t.deliverables.map((p) => `\`${p}\``).join(', ')}`, '', 'Acceptance:', '', ...t.acceptance.map((a) => `- ${a}`), '');
  }
  fs.writeFileSync(path.join(root, 'design/studio/backlog.md'), `${lines.join('\n')}\n`);
}

function client(plan) {
  const url = new URL(plan.dashboardUrl);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/' || url.username || url.password) throw new Error('Only the documented loopback dashboard is allowed.');
  return async (route, method = 'GET', body) => {
    const response = await fetch(new URL(route, url), {
      method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${(await response.text()).slice(0, 500)}`);
    return response.status === 204 ? null : response.json();
  };
}

async function ensureProject(api, plan) {
  const project = await api(`/api/projects/${plan.projectId}`);
  if (path.resolve(project.repoPath).toLowerCase() !== root.toLowerCase()) throw new Error('Dashboard project does not point at this repository.');
}

async function sync(api, plan) {
  const studio = await api(`/api/projects/${plan.projectId}/studio`);
  const roles = studio.departments.flatMap((d) => d.roles.map((r) => ({ ...r, department: d.name })));
  const allTasks = await api(`/api/projects/${plan.projectId}/tasks`);
  const old = fs.existsSync(statePath) ? readJson(statePath) : null;
  if (old && old.projectId !== plan.projectId) throw new Error('Mapping belongs to another project.');
  const state = old ?? { schemaVersion: 1, projectId: plan.projectId, roles: {}, tasks: {} };
  for (const desired of plan.roles) {
    const role = roles.find((r) => r.name === desired.name && r.department === desired.department);
    if (!role) throw new Error(`Expected existing role ${desired.name} in ${desired.department}; no template reset was attempted.`);
    const roleTasks = allTasks.filter((t) => t.roleId === role.id);
    if (roleTasks.some((t) => ['running', 'queued'].includes(t.status))) throw new Error(`Role ${desired.name} is busy; sync stopped.`);
    const patch = { brief: desired.brief, contextDocs: desired.contextDocs };
    if (role.brief !== patch.brief || JSON.stringify(role.contextDocs) !== JSON.stringify(patch.contextDocs)) await api(`/api/roles/${role.id}`, 'PATCH', patch);
    if (role.agents.length === 0) await api(`/api/roles/${role.id}/agents`, 'POST', { name: role.name });
    state.roles[desired.name] = role.id;
  }
  const qa = studio.departments.find((d) => d.name === 'QA');
  if (!qa) throw new Error('QA department missing.');
  const folders = [...new Set([...qa.folders, 'qa', 'tests/e2e', 'design/qa'])];
  if (JSON.stringify(folders) !== JSON.stringify(qa.folders)) await api(`/api/departments/${qa.id}`, 'PATCH', { folders });
  for (const task of plan.tasks) {
    const matches = allTasks.filter((t) => t.id === state.tasks[task.id] || t.title.startsWith(`[${task.id}] `));
    if (matches.length > 1) throw new Error(`Ambiguous dashboard mapping for ${task.id}.`);
    let record = matches[0];
    if (record && record.roleId !== state.roles[task.role]) throw new Error(`Wrong role on existing ${task.id}.`);
    if (!record) {
      record = await api(`/api/projects/${plan.projectId}/tasks`, 'POST', {
        title: `[${task.id}] ${task.title}`, roleId: state.roles[task.role], priority: task.priority,
        effort: task.effort, canEdit: true, emergency: false
      });
      allTasks.push(record);
    }
    state.tasks[task.id] = record.id;
    writeState(state);
    const detail = await api(`/api/tasks/${record.id}`);
    if (detail.runs.length === 0 && detail.messages.length === 0 && record.status === 'idle') {
      const patch = { tokenBudget: plan.execution.tokenBudget, toolBudget: plan.execution.toolBudget, autoCompact: plan.execution.autoCompact };
      if (Object.entries(patch).some(([k, v]) => detail.task[k] !== v)) await api(`/api/tasks/${record.id}`, 'PATCH', patch);
      const summary = createHandoff(task);
      if (detail.task.handoff !== summary) await api(`/api/tasks/${record.id}/compact`, 'POST', { summary });
    }
  }
  console.log(`Synced ${plan.roles.length} roles and ${plan.tasks.length} staged tasks. No work messages sent; no agents launched.`);
}

async function recordsFor(api, plan) {
  if (!fs.existsSync(statePath)) throw new Error('Run sync first.');
  const state = readJson(statePath);
  if (state.projectId !== plan.projectId) throw new Error('Wrong project mapping.');
  const all = await api(`/api/projects/${plan.projectId}/tasks`);
  const records = new Map(plan.tasks.map((t) => {
    const record = all.find((r) => r.id === state.tasks[t.id]);
    const review = state.reviews?.[t.id];
    return [t.id, record ? { ...record, evidenceReviewed: Boolean(review && review.taskUpdatedAt === record.updatedAt && review.reportHash === reportHash(t.report)) } : undefined];
  }));
  return { all, records, state };
}

async function main(args) {
  const [command = 'status', id, ...rest] = args;
  const plan = readJson(registryPath);
  const result = validatePlan(plan);
  if (command === 'validate') {
    writeBacklog(plan);
    console.log(`Plan valid: ${result.roles} roles, ${result.tasks} tasks, ${result.dependencies} dependencies; no cycles or missing input producers.`);
    return;
  }
  if (!['sync', 'status', 'start', 'complete'].includes(command)) throw new Error('Commands: validate | sync | status | start M1-XX [--coordinator TASK_ID] | complete M1-XX');
  const api = client(plan);
  await ensureProject(api, plan);
  if (command === 'sync') return sync(api, plan);
  const { all, records, state } = await recordsFor(api, plan);
  if (command === 'status') {
    for (const task of [...plan.tasks].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
      const reasons = readiness(task, plan, records);
      const status = records.get(task.id)?.status ?? 'missing';
      const label = status === 'done' ? (records.get(task.id)?.evidenceReviewed ? 'ACCEPTED' : 'REVIEW') : reasons.length ? 'HELD' : 'READY';
      console.log(`${task.id} ${label} | ${task.role} | ${task.title}${status === 'done' || !reasons.length ? '' : ` | ${reasons.slice(0, 2).join('; ')}`}`);
    }
    return;
  }
  const task = plan.tasks.find((t) => t.id === id);
  const record = records.get(id);
  if (!task || !record) throw new Error(`Unknown or unsynced task: ${id}`);
  const detail = await api(`/api/tasks/${record.id}`);
  if (command === 'complete') {
    const problems = completionProblems(task, plan, records, detail);
    if (problems.length) throw new Error(problems.join('; '));
    const completed = await api(`/api/tasks/${record.id}`, 'PATCH', { done: true });
    state.reviews ??= {};
    state.reviews[id] = { runId: detail.runs.at(-1).id, taskUpdatedAt: completed.updatedAt, reportHash: reportHash(task.report), reviewedAt: new Date().toISOString() };
    writeState(state);
    console.log(`${id} marked done with evidence review recorded. Coordinator is responsible for reviewing truth of the evidence; no successor was started.`);
    return;
  }
  const held = readiness(task, plan, records);
  if (held.length) throw new Error(`Not ready: ${held.join('; ')}`);
  if (detail.runs.length || detail.messages.length) throw new Error('This task already has history. Resume it in AgentDashboard; do not resend its initial prompt.');
  let coordinator;
  if (rest.length) {
    if (rest.length !== 2 || rest[0] !== '--coordinator') throw new Error('Expected --coordinator TASK_ID.');
    coordinator = all.find((t) => t.id === rest[1]);
    if (!coordinator || coordinator.roleId !== null || coordinator.id === record.id) throw new Error('Coordinator exemption must name an existing plain chat in this project.');
  }
  const busy = all.filter((t) => ['running', 'queued', 'waiting'].includes(t.status) && t.id !== coordinator?.id);
  if (busy.length) throw new Error(`Project has active/unresolved work: ${busy.map((t) => t.title).join('; ')}`);
  const studio = await api(`/api/projects/${plan.projectId}/studio`);
  const role = studio.departments.flatMap((d) => d.roles).find((r) => r.id === record.roleId);
  if (!role?.agents.some((a) => !a.paused && a.status === 'idle')) throw new Error('No idle, unpaused seat for this role.');
  await api(`/api/tasks/${record.id}/messages`, 'POST', { text: createPrompt(task) });
  console.log(`Dispatched ${id} to ${task.role}. Monitor AgentDashboard; no automatic successor. ${coordinator ? 'Coordinator must now stop editing and yield.' : ''}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] ?? 'status';
  let lock;
  try {
    if (['sync', 'start', 'complete'].includes(command)) {
      lock = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(lock, `${process.pid}\n`);
    }
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.code === 'EEXIST' ? `Dispatch lock exists: ${lockPath}. Check for another helper before removing a stale lock.` : error.message);
    process.exitCode = 1;
  } finally {
    if (lock !== undefined) { fs.closeSync(lock); fs.unlinkSync(lockPath); }
  }
}
