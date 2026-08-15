import assert from 'node:assert/strict';
import { buildLocalModelResources, discoverLocalModelServers } from './hardware-detector.mjs';

const now = new Date('2026-08-13T15:00:00.000Z');
const endpoints = [{ protocol: 'openai', url: 'http://127.0.0.1:1234/v1/models' }];
const fetchImpl = async url => {
  if (String(url).endsWith('/v1/models')) {
    return Response.json({ data: [
      { id: 'qwen3-14b' },
      { id: 'qwen/qwen3-4b' },
      { id: 'text-embedding-qwen3-embedding-0.6b' }
    ] });
  }
  if (String(url).endsWith('/api/v0/models')) {
    return Response.json({ data: [
      { id: 'qwen3-14b', type: 'llm', state: 'not-loaded', quantization: 'Q4_K_M', max_context_length: 40960, publisher: 'Qwen' },
      { id: 'qwen/qwen3-4b', type: 'llm', state: 'loaded', quantization: 'Q4_K_M', max_context_length: 32768, publisher: 'qwen' },
      { id: 'text-embedding-qwen3-embedding-0.6b', type: 'embeddings', state: 'not-loaded', quantization: 'Q8_0', max_context_length: 32768, publisher: 'Qwen' }
    ] });
  }
  throw new Error(`Unexpected probe: ${url}`);
};

const servers = await discoverLocalModelServers({ fetchImpl, endpoints, clock: () => now });
assert.equal(servers.length, 1);
assert.equal(servers[0].healthy, true);
assert.equal(servers[0].models.find(model => model.model_id === 'qwen/qwen3-4b').runtime_state, 'loaded');
assert.deepEqual(servers[0].models.find(model => model.model_id.includes('embedding-0.6b')).capabilities, ['embeddings']);

const resources = buildLocalModelResources({
  hardware: { hostname: 'owner-pc', memory: { total_gb: 16 }, free_gpu_memory_mb: 0, total_gpu_memory_mb: 0 },
  servers,
  clock: () => now,
  maxModelMemoryFraction: 0.5
});
const large = resources.find(resource => resource.metadata.model_id === 'qwen3-14b');
const admitted = resources.find(resource => resource.metadata.model_id === 'qwen/qwen3-4b');
const embedding = resources.find(resource => resource.capability_types.includes('embeddings'));
assert.equal(large.enabled, false, '14B model must be excluded from automatic loading on a 16 GB machine');
assert.equal(large.metadata.memory_admission_passed, false);
assert.equal(large.health_status, 'capacity-constrained');
assert.equal(admitted.enabled, true);
assert.equal(admitted.licence, 'Apache-2.0');
assert.equal(admitted.metadata.licence_verified, true);
assert.equal(admitted.metadata.runtime_state, 'loaded');
assert.equal(embedding.enabled, true);

console.log('Matrix local runtime discovery and memory-admission tests passed.');
