#!/usr/bin/env node
import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { publicInvestigationPromptPayload, validatePublicInvestigationResult } from '../src/public-investigation-contract.js';
import { detectLocalRuntime } from '../ai-management/local-runtime/hardware-detector.mjs';

const execFileAsync = promisify(execFile);
const VERSION = '0.2.0';
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

export function configuredModelAdmission({
  modelId = config.modelId,
  parametersBillion = config.modelParametersBillion,
  estimatedVramGb = config.modelEstimatedVramGb,
  totalMemoryMb = Math.round(os.totalmem() / 1024 / 1024),
  maxModelMemoryFraction = Number(env('MATRIX_LOCAL_MAX_MODEL_MEMORY_FRACTION', '0.5'))
} = {}) {
  const inferredParameters = Number(String(modelId || '').match(/(?:^|[-_/\s])(\d+(?:\.\d+)?)\s*b(?:$|[-_/\s:])/i)?.[1] || 0);
  const parameters = Number(parametersBillion || inferredParameters || 0);
  const estimatedNeedGb = Number(estimatedVramGb) > 0
    ? Number(estimatedVramGb)
    : parameters > 0
      ? Math.max(2, parameters * 0.65)
      : 4;
  const memoryFraction = Math.max(0.1, Math.min(0.9, Number(maxModelMemoryFraction || 0.5)));
  const totalMemoryGb = Number(totalMemoryMb || 0) / 1024;
  const maximumAdmittedGb = totalMemoryGb > 0 ? totalMemoryGb * memoryFraction : 0;
  const admitted = maximumAdmittedGb <= 0 || estimatedNeedGb <= maximumAdmittedGb;
  return {
    admitted,
    estimated_need_gb: Number(estimatedNeedGb.toFixed(2)),
    total_memory_gb: Number(totalMemoryGb.toFixed(2)),
    maximum_model_memory_fraction: memoryFraction,
    maximum_admitted_model_memory_gb: Number(maximumAdmittedGb.toFixed(2))
  };
}

function localResource(hardware) {
  if (!config.modelId) return [];
  const availableGpuMemoryGb = hardware.gpus.reduce((sum, gpu) => sum + Number(gpu.memory_free_mb || 0), 0) / 1024;
  const admission = configuredModelAdmission({ totalMemoryMb: hardware.total_memory_mb });
  return [{
    resource_id: `local-${sha256(`${os.hostname()}|${config.modelProtocol}|${config.modelId}`).slice(0, 24)}`,
    provider_name: 'owner-local',
    service_name: config.modelId,
    resource_tier: 1,
    capability_types: ['llm'],
    enabled: admission.admitted,
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
      memory_admission_passed: admission.admitted,
      estimated_model_memory_gb: admission.estimated_need_gb,
      total_system_memory_gb: admission.total_memory_gb,
      maximum_model_memory_fraction: admission.maximum_model_memory_fraction,
      maximum_admitted_model_memory_gb: admission.maximum_admitted_model_memory_gb,
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

function loopbackEndpoint(value) {
  const url = new URL(String(value || ''));
  if (!['127.0.0.1', '::1', 'localhost'].includes(url.hostname)) throw new Error('Local model execution endpoint must remain loopback-only');
  return url.toString().replace(/\/$/, '');
}

async function resolveLocalModel(job, { fetchImpl = globalThis.fetch, runtime = null, configuredModel = config, hardware = null } = {}) {
  const requestedModel = String(job?.payload?.model_id || '').trim();
  if (!requestedModel) throw new Error('No local model is configured for this job');
  if (configuredModel.modelId && requestedModel === configuredModel.modelId) {
    const inventory = hardware || await hardwareInventory();
    const admission = configuredModelAdmission({
      modelId: configuredModel.modelId,
      parametersBillion: configuredModel.modelParametersBillion,
      estimatedVramGb: configuredModel.modelEstimatedVramGb,
      totalMemoryMb: inventory.total_memory_mb
    });
    if (!admission.admitted) {
      throw new Error(`Requested configured owner-local model is excluded by the memory-admission gate: ${requestedModel} requires an estimated ${admission.estimated_need_gb} GB, above the ${admission.maximum_admitted_model_memory_gb} GB limit`);
    }
    return {
      model_id: configuredModel.modelId,
      protocol: configuredModel.modelProtocol,
      endpoint: loopbackEndpoint(configuredModel.modelEndpoint),
      resource_id: String(job?.payload?.selected_resource_id || ''),
      parameters_billion: configuredModel.modelParametersBillion
    };
  }
  const discovered = runtime || await detectLocalRuntime({ fetchImpl });
  const resource = (discovered.resources || []).find(item => item.enabled && item.capability_types?.includes('llm') && item.metadata?.model_id === requestedModel);
  if (!resource) throw new Error(`Requested owner-local model is not currently available: ${requestedModel}`);
  return {
    model_id: requestedModel,
    protocol: String(resource.metadata?.protocol || ''),
    endpoint: loopbackEndpoint(resource.metadata?.endpoint),
    resource_id: resource.resource_id,
    parameters_billion: Number(resource.metadata?.parameters_billion || 0)
  };
}

async function readOpenAiText(response) {
  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
  if (!contentType.includes('text/event-stream')) {
    const payload = await response.json();
    return { payload, output: payload?.choices?.[0]?.message?.content };
  }
  if (!response.body) throw new Error('Local model streaming response did not contain a body');
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';
  let errorPayload = null;
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const payload = JSON.parse(data);
          if (payload.error) errorPayload = payload;
          const content = payload.choices?.[0]?.delta?.content;
          if (typeof content === 'string') output += content;
        } catch {
          // Ignore non-JSON SSE keepalive data; the final contract validator remains authoritative.
        }
      }
    }
  }
  return { payload: errorPayload || { choices: [{ message: { content: output } }] }, output };
}

async function generateLocalText(target, prompt, { fetchImpl = globalThis.fetch, maximumTokens = 1024, jsonMode = false } = {}) {
  let response;
  if (target.protocol === 'ollama') {
    response = await fetchImpl(`${target.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: target.model_id,
        prompt,
        ...(jsonMode ? { format: 'json' } : {}),
        stream: false,
        options: { num_predict: Math.min(4096, Number(maximumTokens || 1024)), temperature: jsonMode ? 0.1 : 0.2 }
      }),
      signal: AbortSignal.timeout(10 * 60 * 1000)
    });
  } else if (target.protocol === 'openai') {
    response = await fetchImpl(`${target.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: target.model_id,
        messages: [{ role: 'user', content: prompt }],
        temperature: jsonMode ? 0.1 : 0.2,
        max_tokens: Math.min(4096, Number(maximumTokens || 1024)),
        stream: true,
        ...(jsonMode ? { response_format: { type: 'text' } } : {})
      }),
      signal: AbortSignal.timeout(10 * 60 * 1000)
    });
  } else {
    throw new Error(`Unsupported loopback model protocol: ${target.protocol || 'missing'}`);
  }
  const openAiResult = target.protocol === 'openai' ? await readOpenAiText(response) : null;
  const data = openAiResult?.payload || await response.json();
  if (!response.ok) throw new Error(`Local model returned HTTP ${response.status}: ${String(data?.error?.message || data?.error || 'unknown error').slice(0, 300)}`);
  const output = target.protocol === 'ollama' ? data.response : openAiResult.output;
  if (typeof output !== 'string' || !output.trim()) throw new Error('Local model response did not contain text');
  return output;
}

function publicInvestigationPrompt(context) {
  return [
    'You are the Matrix Investigator analysing a bounded set of public-record evidence.',
    'Return one JSON object only. Do not include markdown, hidden reasoning, chain-of-thought, prompts, credentials or raw private material.',
    'Keep the answer under 700 characters, include at most 4 facts, 2 allegations/disputed claims, 2 inferences and 3 unknowns.',
    'Lead with the bounded answer. Separate documented facts, allegations/disputed material, inferences and unknowns.',
    'Every fact, allegation or inference must cite one or more evidence_ids from the supplied list. Never invent an evidence ID or source route.',
    'A fact, allegation/disputed claim or inference with an empty evidence_ids array is invalid. If no supplied evidence ID supports it, move it to unknowns.',
    'Association, co-occurrence, contact, employment, payment, meeting or a name in a file does not by itself establish guilt, knowledge, coordination or motive.',
    'If the evidence is insufficient, say so directly and put the gap in unknowns.',
    `PUBLIC INVESTIGATION CONTEXT:\n${JSON.stringify(publicInvestigationPromptPayload(context))}`,
    '/no_think'
  ].join('\n\n');
}

function parseModelJson(value) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!text) throw new Error('Malformed model JSON: empty response');
  try { return JSON.parse(text); } catch (error) { throw new Error(`Malformed model JSON: ${error.message}`); }
}

function validatedEvidenceSelection(value, evidence = []) {
  const candidate = String(value || '').trim().replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/, '').replace(/^["']|["']$/g, '').trim();
  const allowed = new Set(evidence.map(item => String(item?.evidence_id || '').trim()).filter(Boolean));
  if (!allowed.has(candidate)) throw new Error('Evidence reranker did not return exactly one supplied evidence ID');
  return candidate;
}

async function executePublicEvidenceRerank(job, options = {}) {
  const context = job?.payload?.public_investigation;
  if (!context?.investigation_id || !Array.isArray(context.evidence) || context.evidence.length < 1) throw new Error('Public evidence reranking context is incomplete');
  const target = await resolveLocalModel(job, options);
  const compactEvidence = context.evidence.slice(0, 12).map(item => ({
    evidence_id: String(item.evidence_id || ''),
    title: String(item.title || '').slice(0, 300),
    establishes: String(item.establishes || item.summary || '').slice(0, 500),
    evidence_grade: String(item.evidence_grade || ''),
    source_publisher: String(item.source_publisher || '')
  }));
  const basePrompt = [
    'Select the single supplied official record most directly relevant to the public-record question.',
    'Return exactly one evidence_id from the supplied list. Return no explanation, punctuation, JSON or markdown.',
    `QUESTION: ${String(context.question || '').slice(0, 2000)}`,
    `EVIDENCE: ${JSON.stringify(compactEvidence)}`,
    '/no_think'
  ].join('\n\n');
  const generate = prompt => generateLocalText(target, prompt, { ...options, maximumTokens: 96, jsonMode: false });
  let attempts = 1;
  let output = await generate(basePrompt);
  let selectedEvidenceId;
  try {
    selectedEvidenceId = validatedEvidenceSelection(output, compactEvidence);
  } catch (error) {
    attempts += 1;
    output = await generate([
      basePrompt,
      `VALIDATION ERROR: ${error.message}`,
      `ALLOWED IDS: ${compactEvidence.map(item => item.evidence_id).join(', ')}`,
      'Return one allowed ID only.',
      '/no_think'
    ].join('\n\n'));
    selectedEvidenceId = validatedEvidenceSelection(output, compactEvidence);
  }
  return {
    public_rerank: {
      investigation_id: context.investigation_id,
      question: context.question,
      selected_evidence_id: selectedEvidenceId,
      candidate_count: compactEvidence.length,
      selection_sha256: sha256(`${context.investigation_id}|${selectedEvidenceId}`),
      validation_attempts: attempts
    },
    model_id: target.model_id,
    resource_id: target.resource_id || String(job?.payload?.selected_resource_id || ''),
    model_protocol: target.protocol,
    prompt_version: 'ask-matrix-evidence-rerank-v1',
    prompt_compiled_locally: true,
    prompt_persisted: false,
    raw_model_output_persisted: false,
    public_safe: true
  };
}

function deterministicPublicInvestigationResult(context, selectedEvidenceId) {
  const ordered = [
    context.evidence.find(item => item.evidence_id === selectedEvidenceId),
    ...context.evidence.filter(item => item.evidence_id !== selectedEvidenceId)
  ].filter(Boolean).slice(0, 8);
  const facts = [];
  const allegations = [];
  const inferences = [];
  for (const item of ordered) {
    const claim = { text: String(item.establishes || item.summary || item.title || '').slice(0, 1800), evidence_ids: [item.evidence_id] };
    if (!claim.text) continue;
    if (item.claim_class === 'allegation_or_disputed') allegations.push(claim);
    else if (item.claim_class === 'documented_association') inferences.push(claim);
    else facts.push(claim);
  }
  const top = ordered[0];
  const topClaim = String(top?.establishes || top?.summary || top?.title || 'The selected record is preserved for bounded review.').slice(0, 1600);
  const boundary = String(top?.does_not_establish || top?.evidence_boundary || context.evidence_boundary || '').slice(0, 1200);
  return validatePublicInvestigationResult({
    investigation_id: context.investigation_id,
    question: context.question,
    answer: `${topClaim}${boundary ? ` The selected record does not establish: ${boundary}` : ''}`,
    facts: facts.slice(0, 6),
    allegations_or_disputed_claims: allegations.slice(0, 6),
    inferences: inferences.slice(0, 6),
    unknowns: [{ text: 'The selected records do not establish facts beyond their stated evidence boundaries; implementation, effectiveness, motive, causation and undisclosed conduct remain unknown unless a cited record says otherwise.', evidence_ids: [] }],
    evidence_ids: ordered.map(item => item.evidence_id),
    source_routes: [...new Set(ordered.map(item => item.source_route).filter(Boolean))],
    confidence: ordered.length ? 0.65 : 0,
    related_entities: [...new Set(ordered.flatMap(item => item.related_entities || []).map(String).filter(Boolean))].slice(0, 40),
    related_investigations: [...new Set([...(context.related_routes || []), ...ordered.map(item => item.matrix_route)].filter(Boolean))].slice(0, 30),
    evidence_boundary: context.evidence_boundary || 'Retrieval relevance is not proof; every claim remains bounded by the selected public record.'
  }, {
    investigation_id: context.investigation_id,
    question: context.question,
    evidence: context.evidence,
    related_routes: context.related_routes,
    evidence_boundary: context.evidence_boundary
  });
}

async function executePublicInvestigation(job, options = {}) {
  const context = job?.payload?.public_investigation;
  if (!context?.investigation_id || !Array.isArray(context.evidence)) throw new Error('Public investigation context is incomplete');
  const target = await resolveLocalModel(job, options);
  if (target.parameters_billion > 0 && target.parameters_billion <= 4.5) {
    const rerank = await executePublicEvidenceRerank(job, options);
    return {
      public_result: deterministicPublicInvestigationResult(context, rerank.public_rerank.selected_evidence_id),
      model_id: target.model_id,
      resource_id: target.resource_id || String(job?.payload?.selected_resource_id || ''),
      model_protocol: target.protocol,
      prompt_version: 'ask-matrix-evidence-rerank-v1',
      validation_attempts: rerank.public_rerank.validation_attempts,
      completion_mode: 'model-rerank-deterministic-synthesis',
      prompt_compiled_locally: true,
      prompt_persisted: false,
      raw_model_output_persisted: false,
      public_safe: true
    };
  }
  const prompt = publicInvestigationPrompt(context);
  if (prompt.length > 100000) throw new Error('Locally compiled investigation prompt exceeds the local limit');
  const generationOptions = {
    ...options,
    maximumTokens: job?.payload?.max_tokens || 1800,
    jsonMode: true
  };
  const validationContext = {
    investigation_id: context.investigation_id,
    question: context.question,
    evidence: context.evidence,
    related_routes: context.related_routes,
    evidence_boundary: context.evidence_boundary
  };
  let attempts = 1;
  let completionMode = 'direct-model-synthesis';
  let raw = await generateLocalText(target, prompt, generationOptions);
  let publicResult;
  try {
    publicResult = validatePublicInvestigationResult(parseModelJson(raw), validationContext);
  } catch (error) {
    const rerank = await executePublicEvidenceRerank(job, options);
    attempts += rerank.public_rerank.validation_attempts;
    publicResult = deterministicPublicInvestigationResult(context, rerank.public_rerank.selected_evidence_id);
    completionMode = 'model-rerank-deterministic-synthesis';
  }
  return {
    public_result: publicResult,
    model_id: target.model_id,
    resource_id: target.resource_id || String(job?.payload?.selected_resource_id || ''),
    model_protocol: target.protocol,
    prompt_version: 'ask-matrix-public-v2',
    validation_attempts: attempts,
    completion_mode: completionMode,
    prompt_compiled_locally: true,
    prompt_persisted: false,
    raw_model_output_persisted: false,
    public_safe: true
  };
}

async function executeLocalLlm(job, options = {}) {
  const publicInvestigationAuthorized = job?.data_class === 'public' && Boolean(job?.payload?.public_investigation?.investigation_id);
  if (!config.allowLlmJobs && !publicInvestigationAuthorized) throw new Error('Local LLM jobs are disabled');
  if (job?.payload?.public_investigation && job?.payload?.public_investigation_operation === 'evidence-rerank') return executePublicEvidenceRerank(job, options);
  if (job?.payload?.public_investigation) return executePublicInvestigation(job, options);
  const target = await resolveLocalModel(job, options);
  const prompt = String(job?.payload?.prompt || '');
  if (!prompt || prompt.length > 100000) throw new Error('Prompt is missing or exceeds the local limit');
  const output = await generateLocalText(target, prompt, { ...options, maximumTokens: job?.payload?.max_tokens || 1024 });
  return { model: target.model_id, resource_id: target.resource_id, model_protocol: target.protocol, response: output, prompt_local: true, external_network_used: false };
}

async function executeJob(job, options = {}) {
  const jobType = String(job?.job_type || '');
  if (jobType === 'deterministic.hash') return executeDeterministic(job);
  if (jobType === 'llm.generate') return executeLocalLlm(job, options);
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

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}

export { deterministicPublicInvestigationResult, executeJob, generateLocalText, loopbackEndpoint, parseModelJson, readOpenAiText, resolveLocalModel, sha256, timingSafeEqual, validatedEvidenceSelection, verifySignature };
