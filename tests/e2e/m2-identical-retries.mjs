// Focused M2-29 regression: real HTTP, disposable save, accelerated clock.
import assert from 'node:assert/strict';
import { startTestServer, makeManualClock, makeClient, uuid } from './lib/server.mjs';

const { clock, advanceMs } = makeManualClock('2026-10-23T09:00:00Z');
const server = await startTestServer({ clock });
try {
  const client = makeClient(server.baseUrl);
  assert.equal((await client.post('/dev/session/select', { accountSlot: 'A' })).status, 200);
  const state = async () => {
    const response = await client.get('/account/state');
    assert.equal(response.status, 200);
    return response.json.data;
  };
  assert.equal((await client.post('/expedition/start', {
    requestId: uuid(), expectedRevision: (await state()).revision,
  })).status, 200);
  advanceMs(180_000);
  const before = await state();
  const command = { requestId: uuid(), expectedRevision: before.revision };
  const responses = await Promise.all(Array.from({ length: 8 }, () => client.post('/expedition/settle', command)));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.deepEqual(response.json.data, responses[0].json.data);
  }
  assert.equal(responses[0].json.data.creditedCycles, 3);
  const after = await state();
  assert.equal(after.revision, before.revision + 1);
  assert.equal(after.expedition.cyclesCompleted, before.expedition.cyclesCompleted + 3);
  advanceMs(60_000);
  const retry = await client.post('/expedition/settle', command);
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.json.data, responses[0].json.data);
  assert.deepEqual(await state(), after, 'Late retry must not change any persisted account state');
  const fresh = await client.post('/expedition/settle', { requestId: uuid(), expectedRevision: after.revision });
  assert.equal(fresh.status, 200);
  assert.equal(fresh.json.data.creditedCycles, 1);
  console.log('PASS eight simultaneous identical retries: identical results, one revision, three cycles; late retry unchanged; fresh command credits only new cycle.');
  console.log('Combat seed evidence:', JSON.stringify(responses[0].json.data.latestBattleReport?.seed ?? responses[0].json.data.latestBattleReport));
} finally {
  await server.close();
}
