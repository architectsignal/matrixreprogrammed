#!/usr/bin/env node
import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const VERSION = '0.1.0';
const startedAt = new Date().toISOString();

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function integer(name, fallback, minimum, maximum) {
  const value = Number(env(name, fallback));
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, Math.trunc(value))) : fallback;
}

const config = {
  siteUrl: env('MATRIX_SITE_URL', 'https://matrixreprogrammed.com').replace(/\/+$/, ''),
  adminToken: env('MATRIX_AI_MANAGEMENT_ADMIN_TOKEN'),
  sharedSecret: env('MATRIX_LOCAL_AGENT_SHARED_SECRET'),
  host: env('MATRIX_LOCAL_AGENT_HOST', '127.0.0.1'),
  port: integer('MATRIX_LOCAL_AGENT_PORT', 43117, 1024, 65535),
  registrationIntervalMs: integer('MATRIX_LOCAL_AGENT_REGISTRATION_SECONDS', 300, 30, 3600) * 1000,
  maxBodyBytes: integer('MATRIX_LOCAL_AGENT_MAX_BODY_BYTES', 262144, 1024, 2 * 1024 * 1024),
  maxClockSkewMs: integer('MATRIX_LOCAL_AGENT_MAX_CLOCK_SKEW_SECONDS', 120, 10, 900) * 1000,
  modelEndpoint: env('MATRIX_LOCAL_MODEL_ENDPOINT', 'http://127.0.0.1:11434'),
  modelProtocol: env('MATRIX_LOCAL_MODEL_PROTOCOL', 'ollama'),
  modelId: env('MATRIX_LOCAL_MODEL_ID'),
  modelContextLength: integer('MATRIX_LOCAL_MODEL_CONTEXT_LENGTH', 32768, 1024, 2000000),
  modelParametersBillion: Number(env('MATRIX_LOCAL_MODEL_PARAMETERS_BILLION', '0')) || 0,
  modelEstimatedVramGb: Number(env('MATRIX_LOCAL_MODEL_ESTIMATED_VRAM_GB', '0')) || 0,
  allowLlmJobs: env('MATRIX_LOCAL_AGENT_ALLOW_LLM_JOBS', 'false').toLowerCase() === 'true'
};

function assertSafeConfiguration() {
  if (!config.sharedSecret || config.sharedSecret.length < 32) {
    throw new Error('MATRIX_LOCAL_AGENT_SHARED_SECRET must contain at least 32 characters');
  }
  if (!['127.0.0.1', '::1', 'localhost'].includes(config.host) && env('MATRIX_LOCAL_AGENT_ALLOW_LAN', 'false').toLowerCase() !== 'true') {
    throw new Error('Refusing non-loopback binding unless MATRIX_LOCAL_AGENT_ALLOW_LAN=true');
  }
  const endpoint = new URL(config.modelEndpoint);
  if (!['127.0.0.1', '::1', 'localhost'].includes(endpoint.hostname)) {
    throw new Error('Local model endpoint must remain loopback-only');
  }
}

function json(response, status, value) {
  const body = JSON.stringify(value, null, 2);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  response.end(body);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function timingSafeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const usedNonces = new Map();
function cleanNonces(now = Date.now()) {
  for (const [nonce, expiresAt] of usedNonces) if (expiresAt <= now) usedNonces.delete(nonce);
}

function verifySignature(request, rawBody) {
  const timestamp = request.headers['x-matrix-timestamp'];
  const nonce = request.headers['x-matrix-nonce'];
  const signature = request.headers['x-matrix-signature'];
  if (!timestamp || !nonce || !signature) return { ok: false, error: 'Signed request headers are required' };
  const timestampMs = Number(timestamp);
  const now = Date.now();
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > config.maxClockSkewMs) return { ok: false, error: 'Request timestamp is outside the allowed window' };
  cleanNonces(now);
  if (usedNonces.has(String(nonce))) return { ok: false, error: 'Request nonce has already been used' };
  const canonical = `${request.method}\n${request.url}\n${timestamp}\n${nonce}\n${sha256(rawBody)}`;
  const expected = crypto.createHmac('sha256', config.sharedSecret).update(canonical).digest('hex');
  if (!timingSafeEqual(signature, expected)) return { ok: false, error: 'Request signature is invalid' };
  usedNonces.set(String(nonce), now + config.maxClockSkewMs);
  return { ok: true };
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > config.maxBodyBytes) throw new Error('Request body exceeds the configured limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function command(file, args) {
  try {
    const { stdout } = await execFileAsync(file, args, { timeout: 3000, windowsHide: true });
    return stdout.trim();
  } catch {
    return '';
  }
}

async function gpuInventory() {
  const output = await command('nvidia-smi', ['--query-gpu=name,memory.total,memory.free,driver_version', '--format=csv,noheader,nounits']);
  if (!output) return [];
  return output.split(/\r?\n/).filter(Boolean).map((line, index) => {
    const [name, totalMb, freeMb, driver] = line.split(',').map(value => value.trim());
    return { index, vendor: 'NVIDIA', name, memory_total_mb: Number(totalMb || 0), memory_free_mb: Number(freeMb || 0), driver };
  });
}

async function hardwareInventory() {
  const gpus = await gpuInventory();
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    cpu_model: os.cpus()[0]?.model || 'unknown',
    cpu_threads: os.cpus().length,
    total_memory_mb: Math.round(os.totalmem() / 1024 / 1024),
    free_memory_mb: Math.round(os.freemem() / 1024 / 1024),
    uptime_seconds: Math.round(os.uptime()),
    gpus,
    total_gpu_memory_mb: gpus.reduce((sum, gpu) => sum + Number(gpu.memory_total_mb || 0), 0)
  };
}

function localResource(hardware) {
  if (!config.modelId) return [];
  const availableGpuMemoryGb = hardware.gpus.reduce((sum, gpu) => sum + Number(gpu.memory_free_mb || 0), 0) / 1024;
  return [{
    resource_id: `local-${sha256(`${os.hostname()}|${config.modelProtocol}|${config.modelId}`).slice(0, 24)}`,
    provider_name: 'owner-local',
    service_name: config.modelId,
    resource_tier: 1,
    capability_types: ['llm'],
    enabled: true,
    monetary_cost_per_unit_eur: 0,
    billing_enabled: false,
    payment_method_present: false,
    billing_risk: 'none',
    quota_verified: true,
    approved_for_automation: true,
    quality_score: 75,
    reliability_score: 85,
    latency_score: 80,
    privacy_score: 100,
    last_health_check: new Date().toISOString(),
    metadata: {
      local: true,
      model_id: config.modelId,
      protocol: config.modelProtocol,
      endpoint: config.modelEndpoint,
      endpoint_scope: 'loopback-only',
      context_length: config.modelContextLength,
      parameters_billion: config.modelParametersBillion,
      estimated_vram_gb: config.modelEstimatedVramGb,
      available_gpu_memory_gb: Number(availableGpuMemoryGb.toFixed(2)),
      agent_version: VERSION,
      last_seen: new Date().toISOString()
    }
  }];
}

async function register() {
  if (!config.adminToken) return { ok: false, skipped: true, reason: 'MATRIX_AI_MANAGEMENT_ADMIN_TOKEN is not configured' };
  const hardware = await hardwareInventory();
  const payload = {
    cost_confirmed_zero: true,
    external_network_used: false,
    hardware,
    servers: [{ protocol: config.modelProtocol, endpoint_scope: 'loopback-only', available: Boolean(config.modelId) }],
    resources: localResource(hardware),
    agent: { version: VERSION, started_at: startedAt, bind_host: config.host, bind_port: config.port }
  };
  const response = await fetch(`${config.siteUrl}/api/ai-management/admin/local-runtime`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': config.adminToken,
      'user-agent': `matrix-local-agent/${VERSION}`
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  if (!response.ok) throw new Error(`Registration failed with HTTP ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function executeDeterministic(job) {
  const value = job?.payload?.value ?? '';
  return { algorithm: 'sha256', digest: sha256(String(value)), bytes: Buffer.byteLength(String(value)) };
}

async function executeLocalLlm(job) {
  if (!config.allowLlmJobs) throw new Error('Local LLM jobs are disabled');
  if (!config.modelId) throw new Error('No local model is configured');
  if (config.modelProtocol !== 'ollama') throw new Error('Version 0.1 supports Ollama execution only');
  const prompt = String(job?.payload?.prompt || '');
  if (!prompt || prompt.length > 100000) throw new Error('Prompt is missing or exceeds the local limit');
  const response = await fetch(`${config.modelEndpoint.replace(/\/$/, '')}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.modelId, prompt, stream: false, options: { num_predict: Math.min(4096, Number(job?.payload?.max_tokens || 1024)) } }),
    signal: AbortSignal.timeout(10 * 60 * 1000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Local model returned HTTP ${response.status}`);
  return { model: config.modelId, response: data.response, prompt_local: true, external_network_used: false };
}

async function executeJob(job) {
  const jobType = String(job?.job_type || '');
  if (jobType === 'deterministic.hash') return executeDeterministic(job);
  if (jobType === 'llm.generate') return executeLocalLlm(job);
  throw new Error(`Unsupported job type: ${jobType || 'missing'}`);
}

async function handle(request, response) {
  if (request.method === 'GET' && request.url === '/health') {
    const hardware = await hardwareInventory();
    return json(response, 200, {
      ok: true,
      version: VERSION,
      startedAt,
      loopbackOnly: ['127.0.0.1', '::1', 'localhost'].includes(config.host),
      zeroSpendLock: true,
      promptBoundary: 'Prompts are accepted only by this owner-controlled local process and are never forwarded to Cloudflare.',
      modelConfigured: Boolean(config.modelId),
      llmJobsEnabled: config.allowLlmJobs,
      hardware
    });
  }
  if (request.method === 'POST' && request.url === '/v1/jobs/execute') {
    let rawBody;
    try { rawBody = await readBody(request); } catch (error) { return json(response, 413, { ok: false, error: error.message }); }
    const authorization = verifySignature(request, rawBody);
    if (!authorization.ok) return json(response, 403, { ok: false, error: authorization.error });
    let job;
    try { job = JSON.parse(rawBody); } catch { return json(response, 400, { ok: false, error: 'Request body must be valid JSON' }); }
    const began = Date.now();
    try {
      const result = await executeJob(job);
      return json(response, 200, {
        ok: true,
        job_id: String(job.job_id || ''),
        job_type: job.job_type,
        result,
        duration_ms: Date.now() - began,
        cost_eur: 0,
        external_network_used: false,
        completed_at: new Date().toISOString()
      });
    } catch (error) {
      return json(response, 422, { ok: false, error: String(error?.message || error), duration_ms: Date.now() - began });
    }
  }
  return json(response, 404, { ok: false, error: 'Not found' });
}

async function main() {
  assertSafeConfiguration();
  const server = http.createServer((request, response) => {
    handle(request, response).catch(error => json(response, 500, { ok: false, error: String(error?.message || error) }));
  });
  server.requestTimeout = 11 * 60 * 1000;
  server.headersTimeout = 15000;
  server.listen(config.port, config.host, () => {
    console.log(`Matrix local agent ${VERSION} listening on http://${config.host}:${config.port}`);
    console.log('Zero-spend lock active; model endpoint restricted to loopback.');
  });

  const heartbeat = async () => {
    try {
      const result = await register();
      console.log(`[${new Date().toISOString()}] registration`, result);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] registration failed: ${error.message}`);
    }
  };
  await heartbeat();
  const timer = setInterval(heartbeat, config.registrationIntervalMs);
  timer.unref();

  const shutdown = signal => {
    console.log(`${signal} received; stopping local agent.`);
    clearInterval(timer);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}

export { executeJob, sha256, timingSafeEqual, verifySignature };
