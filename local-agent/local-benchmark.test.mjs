import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { routeLocalModel } from '../ai-management/local-runtime/model-router.mjs';
import { applyBenchmarkScores, benchmarkLocalRuntime, localBenchmarkProfiles, localEmbeddingBenchmarkProfiles } from './local-benchmark.mjs';

const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'matrix-local-benchmark-'));
const resource = id => ({
  resource_id: id,
  service_name: id,
  capability_types: ['llm'],
  quality_score: 60,
  reliability_score: 60,
  latency_score: 60,
  privacy_score: 100,
  last_health_check: new Date().toISOString(),
  metadata: { local: true, endpoint: 'http://127.0.0.1:11434', protocol: 'ollama', model_id: id, context_length: 32768, parameters_billion: 7 }
});
const runtime = { resources: [resource('model-measured')] };
const embeddingResource = {
  ...resource('embedding-measured'),
  capability_types: ['embeddings'],
  supported_job_types: ['embeddings.generate'],
  metadata: { ...resource('embedding-measured').metadata, model_id: 'embedding-measured', capabilities: ['embeddings'] }
};
runtime.resources.push(embeddingResource);
const fetchImpl = async (url, options) => {
  const request = JSON.parse(options.body);
  if (String(url).endsWith('/v1/embeddings')) {
    return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  let response = 'FACT';
  if (/17 records/.test(request.prompt)) response = '42';
  if (/JSON only/.test(request.prompt)) response = '{"status":"verified","evidence_count":2}';
  if (/Public evidence sentence/.test(request.prompt)) response = 'BOUNDED';
  return new Response(JSON.stringify({ response }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const report = await benchmarkLocalRuntime(runtime, { fetchImpl, stateDir });
assert.equal(report.zero_spend_confirmed, true);
assert.equal(report.external_network_used, false);
assert.equal(report.measured_models, 2);
assert.equal(report.models[0].passed_profiles, localBenchmarkProfiles.length);
assert.equal(report.models[1].passed_profiles, localEmbeddingBenchmarkProfiles.length);
assert.equal(report.models[1].results[0].vector_dimensions, 4);
assert.match(report.deterministic_cpu.result_sha256, /^[a-f0-9]{64}$/);
assert.equal(JSON.parse(await fs.readFile(path.join(stateDir, 'benchmarks', 'latest.json'), 'utf8')).models[0].status, 'measured');

const poorReport = {
  ...report,
  models: [
    { ...report.models[0], resource_id: 'model-measured', quality_score: 98, reliability_score: 100, latency_score: 100, success_rate: 1, composite_score: 99 },
    { ...report.models[0], resource_id: 'model-poor', quality_score: 50, reliability_score: 25, latency_score: 35, success_rate: 0.25, composite_score: 38 }
  ]
};
const learned = applyBenchmarkScores([resource('model-poor'), resource('model-measured')], poorReport);
assert.equal(learned.find(item => item.resource_id === 'model-measured').quality_score, 98);
const route = routeLocalModel(learned, { payload: { prompt: 'short classification', max_tokens: 32 } });
assert.equal(route.selected.resource.resource_id, 'model-measured', 'measured outcomes must change the next routing decision');

const unavailable = applyBenchmarkScores([resource('model-unavailable')], {
  completed_at: report.completed_at,
  models: [{ resource_id: 'model-unavailable', status: 'unavailable', total_profiles: 4, passed_profiles: 0, composite_score: 0 }]
})[0];
assert.equal(unavailable.enabled, false);
assert.equal(unavailable.health_status, 'unhealthy');
assert.equal(unavailable.reliability_score, 0);
assert.equal(unavailable.metadata.matrix_benchmark.status, 'unavailable');

await fs.rm(stateDir, { recursive: true, force: true });
console.log('Matrix local model benchmark and learned-routing tests passed.');
