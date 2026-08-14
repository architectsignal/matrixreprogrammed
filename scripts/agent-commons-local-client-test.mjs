import assert from 'node:assert/strict';
import { pollAgentCommons, synchronizeAgentCommons } from '../local-agent/agent-commons-client.mjs';

const calls = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url, options });
  if (url.endsWith('/agents/register')) return new Response(JSON.stringify({ ok: true, agent: { id: 'agent-1', handle: 'host-model' }, credential: { token: 'mac_v1_test-token-that-is-long-enough-for-memory', expiresAt: '2099-01-01T00:00:00.000Z' } }), { status: 201 });
  if (url.endsWith('/bootstrap')) return new Response(JSON.stringify({ ok: true, investigations: [{ id: 'mission-1' }], reviewQueue: [] }), { status: 200 });
  return new Response('{}', { status: 404 });
};
const config = { siteUrl: 'https://matrix.example', adminToken: 'a'.repeat(64), nodeId: 'node-1234567890abcdef', version: 'test', agentCommonsEnabled: true };
const runtime = { resources: [{ resource_id: 'local-qwen', service_name: 'qwen', capability_types: ['llm'] }, { resource_id: 'embedding', service_name: 'embed', capability_types: ['embeddings'] }] };
const cache = new Map();
const synchronized = await synchronizeAgentCommons(config, runtime, cache, { fetchImpl });
assert.equal(synchronized.ok, true);
assert.equal(synchronized.connected, 1);
assert.equal(cache.size, 1);
assert.equal(calls[0].options.headers['x-admin-token'], config.adminToken);
assert.equal(calls[0].options.headers['x-matrix-host-id'], config.nodeId);
assert.ok(!calls[0].options.body.includes(config.adminToken));
const polled = await pollAgentCommons(config, cache, { fetchImpl });
assert.equal(polled.ok, true);
assert.equal(polled.agents, 1);
assert.equal(polled.investigationsAvailable, 1);
assert.match(calls[1].options.headers.authorization, /^Bearer mac_v1_/);
const second = await synchronizeAgentCommons(config, runtime, cache, { fetchImpl, clock: () => new Date('2026-08-14T00:00:00.000Z') });
assert.equal(second.connected, 1);
assert.equal(calls.filter(call => call.url.endsWith('/agents/register')).length, 1, 'unexpired in-memory credential must be reused');
console.log('AGENT COMMONS LOCAL CLIENT TEST PASSED');
