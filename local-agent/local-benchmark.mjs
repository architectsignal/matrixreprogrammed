import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const PROFILES = [
  { id: 'classification', prompt: 'Classify this public-record statement as FACT, ALLEGATION, INFERENCE, or UNKNOWN. Reply with exactly FACT: A filed court judgment is a public record.', expect: /FACT/i, maxTokens: 16 },
  { id: 'reasoning', prompt: 'Evidence A says 17 records. Evidence B says 25 different records. Reply with only the total number.', expect: /42/, maxTokens: 16 },
  { id: 'structured-extraction', prompt: 'Return JSON only with keys status and evidence_count. status must be verified and evidence_count must be 2.', expect: /"status"\s*:\s*"verified"[\s\S]*"evidence_count"\s*:\s*2|"evidence_count"\s*:\s*2[\s\S]*"status"\s*:\s*"verified"/i, maxTokens: 64 },
  { id: 'bounded-synthesis', prompt: `${'Public evidence sentence. '.repeat(80)}\nReply with exactly: BOUNDED`, expect: /BOUNDED/i, maxTokens: 16 }
];

const EMBEDDING_PROFILES = [
  { id: 'evidence-indexing', input: 'Filed public court judgment dated 12 August 2026.' },
  { id: 'entity-retrieval', input: 'Named entity relationship between an organisation and a public official.' },
  { id: 'source-similarity', input: 'Compare two public records while preserving provenance and uncertainty.' },
  { id: 'long-record', input: 'Public evidence record. '.repeat(160) }
];

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function latencyScore(milliseconds) {
  if (!Number.isFinite(milliseconds)) return 0;
  if (milliseconds <= 1000) return 100;
  if (milliseconds <= 3000) return 90;
  if (milliseconds <= 8000) return 75;
  if (milliseconds <= 20000) return 55;
  return 35;
}

function assertLoopback(value) {
  const url = new URL(value);
  if (!['127.0.0.1', '::1', 'localhost'].includes(url.hostname)) throw new Error('Benchmark endpoint must remain loopback-only');
  return url;
}

async function invokeModel(resource, profile, fetchImpl) {
  const metadata = resource.metadata || {};
  const endpoint = assertLoopback(metadata.endpoint).toString().replace(/\/$/, '');
  const protocol = String(metadata.protocol || 'openai').toLowerCase();
  const started = Date.now();
  let response;
  const isEmbedding = resource.capability_types?.includes('embeddings') && !resource.capability_types?.includes('llm');
  if (isEmbedding) {
    response = await fetchImpl(`${endpoint}/v1/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: metadata.model_id, input: profile.input }),
      signal: AbortSignal.timeout(120000)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(`Local embedding model returned HTTP ${response.status}: ${String(payload?.error?.message || 'unknown error').slice(0, 220)}`);
    const vector = payload.data?.[0]?.embedding;
    const passed = Array.isArray(vector) && vector.length > 0 && vector.every(Number.isFinite);
    return { latency_ms: Date.now() - started, passed, vector_dimensions: Array.isArray(vector) ? vector.length : 0, output_sha256: crypto.createHash('sha256').update(JSON.stringify(vector || [])).digest('hex') };
  }
  if (protocol === 'ollama') {
    response = await fetchImpl(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: metadata.model_id, prompt: profile.prompt, stream: false, options: { temperature: 0, num_predict: profile.maxTokens } }),
      signal: AbortSignal.timeout(120000)
    });
  } else {
    response = await fetchImpl(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: metadata.model_id, messages: [{ role: 'user', content: profile.prompt }], temperature: 0, max_tokens: profile.maxTokens }),
      signal: AbortSignal.timeout(120000)
    });
  }
  const payload = await response.json();
  if (!response.ok) throw new Error(`Local model returned HTTP ${response.status}: ${String(payload?.error?.message || 'unknown error').slice(0, 220)}`);
  const output = protocol === 'ollama' ? payload.response : payload.choices?.[0]?.message?.content;
  if (typeof output !== 'string') throw new Error('Local model response did not contain text');
  return { latency_ms: Date.now() - started, passed: profile.expect.test(output), output_sha256: crypto.createHash('sha256').update(output).digest('hex') };
}

export function applyBenchmarkScores(resources = [], report = null) {
  const benchmarked = new Map((report?.models || []).map(model => [model.resource_id, model]));
  return resources.map(resource => {
    const result = benchmarked.get(resource.resource_id);
    if (!result) return resource;
    if (result.status !== 'measured') {
      return {
        ...resource,
        enabled: false,
        health_status: 'unhealthy',
        reliability_score: 0,
        success_rate: 0,
        error_rate: 1,
        last_failure: report.completed_at,
        metadata: {
          ...resource.metadata,
          matrix_benchmark: {
            completed_at: report.completed_at,
            passed_profiles: Number(result.passed_profiles || 0),
            total_profiles: Number(result.total_profiles || 0),
            score: Number(result.composite_score || 0),
            status: result.status
          }
        }
      };
    }
    return {
      ...resource,
      enabled: true,
      health_status: 'healthy',
      quality_score: result.quality_score,
      reliability_score: result.reliability_score,
      latency_score: result.latency_score,
      success_rate: result.success_rate,
      error_rate: Number((1 - result.success_rate).toFixed(4)),
      average_latency: result.p50_latency_ms,
      last_success: result.passed_profiles > 0 ? report.completed_at : resource.last_success,
      last_failure: result.failed_profiles > 0 ? report.completed_at : null,
      metadata: { ...resource.metadata, matrix_benchmark: { completed_at: report.completed_at, passed_profiles: result.passed_profiles, total_profiles: result.total_profiles, score: result.composite_score, status: result.status } }
    };
  });
}

export async function benchmarkLocalRuntime(runtime = {}, { fetchImpl = globalThis.fetch, clock = () => new Date(), stateDir = null } = {}) {
  const began = Date.now();
  const iterations = 10000;
  let digest = '';
  const cpuStarted = Date.now();
  for (let index = 0; index < iterations; index += 1) digest = crypto.createHash('sha256').update(`${index}:${digest}`).digest('hex');
  const cpuDurationMs = Math.max(1, Date.now() - cpuStarted);
  const models = [];
  for (const resource of runtime.resources || []) {
    const results = [];
    const profiles = resource.capability_types?.includes('embeddings') && !resource.capability_types?.includes('llm') ? EMBEDDING_PROFILES : PROFILES;
    for (const profile of profiles) {
      try {
        results.push({ profile: profile.id, ok: true, ...(await invokeModel(resource, profile, fetchImpl)) });
      } catch (error) {
        results.push({ profile: profile.id, ok: false, passed: false, latency_ms: null, error: String(error?.message || error).slice(0, 300) });
      }
    }
    const successful = results.filter(result => result.ok);
    const passed = results.filter(result => result.passed).length;
    const successRate = results.length ? successful.length / results.length : 0;
    const passRate = results.length ? passed / results.length : 0;
    const p50 = percentile(successful.map(result => result.latency_ms), 0.5);
    const quality = Math.round(50 + passRate * 48);
    const reliability = Math.round(successRate * 100);
    const speed = latencyScore(p50);
    models.push({
      resource_id: resource.resource_id,
      model_id: resource.metadata?.model_id || resource.service_name,
      protocol: resource.metadata?.protocol || null,
      status: successful.length ? 'measured' : 'unavailable',
      total_profiles: results.length,
      passed_profiles: passed,
      failed_profiles: results.length - passed,
      success_rate: Number(successRate.toFixed(4)),
      p50_latency_ms: p50,
      quality_score: quality,
      reliability_score: reliability,
      latency_score: speed,
      composite_score: Number((quality * 0.45 + reliability * 0.3 + speed * 0.25).toFixed(2)),
      results
    });
  }
  const completedAt = clock().toISOString();
  const report = {
    schema_version: 1,
    completed_at: completedAt,
    duration_ms: Date.now() - began,
    zero_spend_confirmed: true,
    external_network_used: false,
    deterministic_cpu: { algorithm: 'sha256', iterations, duration_ms: cpuDurationMs, operations_per_second: Math.round(iterations * 1000 / cpuDurationMs), result_sha256: digest },
    discovered_models: (runtime.resources || []).length,
    measured_models: models.filter(model => model.status === 'measured').length,
    models
  };
  if (stateDir) {
    const directory = path.join(stateDir, 'benchmarks');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    await fs.appendFile(path.join(directory, 'history.jsonl'), `${JSON.stringify(report)}\n`, { mode: 0o600 });
  }
  return report;
}

export const localBenchmarkProfiles = PROFILES.map(({ id }) => id);
export const localEmbeddingBenchmarkProfiles = EMBEDDING_PROFILES.map(({ id }) => id);
