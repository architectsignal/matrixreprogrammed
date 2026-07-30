import os from 'node:os';
import { execFileSync } from 'node:child_process';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function runCommand(command, args = [], { timeout = 4000, execFile = execFileSync } = {}) {
  try {
    return String(execFile(command, args, {
      encoding: 'utf8',
      timeout,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    }) || '').trim();
  } catch {
    return '';
  }
}

function number(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNvidiaCsv(text = '') {
  return String(text).split(/\r?\n/).filter(Boolean).map((line, index) => {
    const [name, total, free, utilisation, driver] = line.split(',').map(value => value.trim());
    return {
      id: `nvidia-${index}`,
      vendor: 'nvidia',
      name: name || `NVIDIA GPU ${index + 1}`,
      memory_total_mb: number(total),
      memory_free_mb: number(free),
      utilisation_percent: number(utilisation),
      driver_version: driver || null,
      detection_source: 'nvidia-smi'
    };
  });
}

function parseRocmJson(text = '') {
  if (!text) return [];
  try {
    const payload = JSON.parse(text);
    return Object.entries(payload).map(([key, value], index) => {
      const source = value || {};
      const totalBytes = number(source['VRAM Total Memory (B)'] ?? source.vram_total ?? source.memory_total);
      const usedBytes = number(source['VRAM Total Used Memory (B)'] ?? source.vram_used ?? source.memory_used);
      return {
        id: `amd-${index}`,
        vendor: 'amd',
        name: source['Card series'] || source['Card model'] || source['Device Name'] || key,
        memory_total_mb: totalBytes ? Math.round(totalBytes / 1024 / 1024) : 0,
        memory_free_mb: totalBytes ? Math.max(0, Math.round((totalBytes - usedBytes) / 1024 / 1024)) : 0,
        utilisation_percent: number(source['GPU use (%)'] ?? source.gpu_use),
        driver_version: source['Driver version'] || null,
        detection_source: 'rocm-smi'
      };
    });
  } catch {
    return [];
  }
}

function parseWindowsControllers(text = '') {
  if (!text) return [];
  try {
    const payload = JSON.parse(text);
    const rows = Array.isArray(payload) ? payload : [payload];
    return rows.filter(Boolean).map((value, index) => ({
      id: `windows-gpu-${index}`,
      vendor: /nvidia/i.test(value.Name || '') ? 'nvidia' : /amd|radeon/i.test(value.Name || '') ? 'amd' : /intel/i.test(value.Name || '') ? 'intel' : 'unknown',
      name: value.Name || `GPU ${index + 1}`,
      memory_total_mb: Math.round(number(value.AdapterRAM) / 1024 / 1024),
      memory_free_mb: 0,
      utilisation_percent: 0,
      driver_version: value.DriverVersion || null,
      detection_source: 'windows-cim'
    }));
  } catch {
    return [];
  }
}

export function isLoopbackUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) && LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function detectHardware({ platform = os.platform(), execFile = execFileSync, clock = () => new Date() } = {}) {
  const cpuRows = os.cpus() || [];
  const cpuModel = cpuRows[0]?.model || 'unknown';
  let gpus = parseNvidiaCsv(runCommand('nvidia-smi', [
    '--query-gpu=name,memory.total,memory.free,utilization.gpu,driver_version',
    '--format=csv,noheader,nounits'
  ], { execFile }));
  if (!gpus.length) gpus = parseRocmJson(runCommand('rocm-smi', ['--showproductname', '--showmeminfo', 'vram', '--showuse', '--json'], { execFile }));
  if (!gpus.length && platform === 'win32') {
    const script = 'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion | ConvertTo-Json -Compress';
    gpus = parseWindowsControllers(runCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { execFile }));
  }
  return {
    schema_version: 1,
    detected_at: clock().toISOString(),
    platform,
    architecture: os.arch(),
    hostname: os.hostname(),
    cpu: { model: cpuModel, logical_cores: cpuRows.length, physical_cores_estimate: Math.max(1, Math.ceil(cpuRows.length / 2)), load_average: os.loadavg() },
    memory: { total_bytes: os.totalmem(), free_bytes: os.freemem(), total_gb: Number((os.totalmem() / 1024 ** 3).toFixed(2)), free_gb: Number((os.freemem() / 1024 ** 3).toFixed(2)) },
    gpus,
    total_gpu_memory_mb: gpus.reduce((sum, gpu) => sum + Number(gpu.memory_total_mb || 0), 0),
    free_gpu_memory_mb: gpus.reduce((sum, gpu) => sum + Number(gpu.memory_free_mb || 0), 0)
  };
}

async function fetchJson(fetchImpl, url, { timeoutMs = 2500 } = {}) {
  if (!isLoopbackUrl(url)) throw new Error(`Local runtime probe refused non-loopback URL: ${url}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

function inferParametersBillion(name = '', metadata = {}) {
  const combined = `${name} ${metadata.parameter_size || ''}`;
  const match = combined.match(/(?:^|[-_\s])(\d+(?:\.\d+)?)\s*[bB](?:$|[-_\s:])/);
  return match ? number(match[1]) : 0;
}

function normalizeOllamaModels(payload, endpoint, clock) {
  return (payload?.models || []).map(model => ({
    model_id: model.name || model.model,
    display_name: model.name || model.model,
    protocol: 'ollama', endpoint,
    modified_at: model.modified_at || null,
    size_bytes: number(model.size),
    parameters_billion: inferParametersBillion(model.name, model.details),
    quantization: model.details?.quantization_level || null,
    context_length: number(model.details?.context_length, 32768),
    capabilities: ['llm.generate'],
    last_seen: clock().toISOString()
  })).filter(model => model.model_id);
}

function normalizeOpenAiModels(payload, endpoint, protocol, clock) {
  return (payload?.data || payload?.models || []).map(item => {
    const modelId = item.id || item.name || item.model;
    return {
      model_id: modelId, display_name: item.name || modelId, protocol, endpoint,
      modified_at: item.created ? new Date(Number(item.created) * 1000).toISOString() : null,
      size_bytes: number(item.size),
      parameters_billion: inferParametersBillion(modelId, item),
      quantization: item.quantization || null,
      context_length: number(item.context_length ?? item.max_context_length, 32768),
      capabilities: item.capabilities || ['llm.generate'],
      last_seen: clock().toISOString()
    };
  }).filter(model => model.model_id);
}

export async function discoverLocalModelServers({
  fetchImpl = globalThis.fetch,
  clock = () => new Date(),
  endpoints = [
    { protocol: 'ollama', url: 'http://127.0.0.1:11434/api/tags' },
    { protocol: 'openai', url: 'http://127.0.0.1:1234/v1/models' },
    { protocol: 'openai', url: 'http://127.0.0.1:8080/v1/models' },
    { protocol: 'openai', url: 'http://127.0.0.1:1337/v1/models' },
    { protocol: 'openai', url: 'http://127.0.0.1:5000/v1/models' }
  ]
} = {}) {
  if (typeof fetchImpl !== 'function') return [];
  const servers = [];
  for (const candidate of endpoints) {
    try {
      const payload = await fetchJson(fetchImpl, candidate.url);
      const base = new URL(candidate.url);
      const endpoint = `${base.protocol}//${base.host}`;
      const models = candidate.protocol === 'ollama' ? normalizeOllamaModels(payload, endpoint, clock) : normalizeOpenAiModels(payload, endpoint, candidate.protocol, clock);
      if (models.length) servers.push({ protocol: candidate.protocol, endpoint, healthy: true, models });
    } catch (error) {
      servers.push({ protocol: candidate.protocol, endpoint: candidate.url, healthy: false, error: String(error?.message || error).slice(0, 300), models: [] });
    }
  }
  return servers;
}

function safeId(value) { return String(value || 'model').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'model'; }
function qualityForModel(model) {
  const parameters = Number(model.parameters_billion || 0);
  if (parameters >= 70) return 98;
  if (parameters >= 30) return 94;
  if (parameters >= 14) return 90;
  if (parameters >= 7) return 84;
  if (parameters >= 3) return 76;
  return 68;
}

export function buildLocalModelResources({ hardware, servers, clock = () => new Date() } = {}) {
  const now = clock().toISOString();
  const gpuMemoryGb = Number(hardware?.free_gpu_memory_mb || hardware?.total_gpu_memory_mb || 0) / 1024;
  const resources = [];
  for (const server of servers || []) {
    if (!server.healthy) continue;
    for (const model of server.models || []) {
      const quality = qualityForModel(model);
      const estimatedNeed = model.parameters_billion ? Math.max(2, model.parameters_billion * 0.65) : 4;
      const gpuFit = gpuMemoryGb <= 0 ? 45 : gpuMemoryGb >= estimatedNeed ? 96 : Math.max(35, Math.round(70 * gpuMemoryGb / estimatedNeed));
      resources.push({
        resource_id: `local-llm-${safeId(server.protocol)}-${safeId(model.model_id)}`,
        provider_name: 'Owner-controlled local runtime', service_name: model.display_name || model.model_id,
        capability_types: ['llm'], resource_tier: 1,
        official_documentation_url: null, terms_url: null, privacy_url: null, status_url: null,
        licence: 'Local model licence must be verified before publication use',
        account_owner: hardware?.hostname || 'owner-controlled local machine', authentication_type: 'none', credential_reference: null,
        approved_for_automation: true, approved_data_classes: ['public', 'internal', 'confidential', 'restricted'], prohibited_data_classes: [],
        free_quota_amount: null, free_quota_unit: 'local inference', quota_reset_period: null, quota_reset_time: null, quota_remaining: null, quota_reserved: 0, hard_stop_threshold: 0,
        quota_verified: true, quota_unlimited: true, billing_enabled: false, billing_risk: 'none', payment_method_present: false, monetary_cost_per_unit_eur: 0,
        quality_score: quality, reliability_score: 88, latency_score: gpuFit, privacy_score: 100, provenance_score: 75, quota_efficiency_score: 100,
        last_health_check: model.last_seen || now, health_status: 'healthy', last_terms_check: now, terms_revalidation_due: null, last_quota_check: now,
        last_success: null, last_failure: null, consecutive_failures: 0, cooldown_until: null, average_latency: 0, success_rate: 1, error_rate: 0,
        supported_job_types: ['llm.generate'], maximum_payload: 2 * 1024 * 1024, rate_limit: 'bounded by local hardware pressure',
        concurrency_limit: gpuMemoryGb >= estimatedNeed * 2 ? 2 : 1, fallback_resource_ids: [], implementation_status: 'production',
        adapter_id: 'local-openai-compatible', adapter_version: '1.0.0', enabled: true, manual_approval_required: false,
        allowed_hosts: [new URL(server.endpoint).hostname],
        metadata: { local: true, protocol: server.protocol, endpoint: server.endpoint, model_id: model.model_id, parameters_billion: model.parameters_billion || 0, quantization: model.quantization || null, context_length: model.context_length || 32768, estimated_vram_gb: Number(estimatedNeed.toFixed(2)), available_gpu_memory_gb: Number(gpuMemoryGb.toFixed(2)), hardware_hostname: hardware?.hostname || null },
        notes: `Automatically detected local model ${model.model_id} through ${server.protocol} on a loopback-only endpoint.`, created_at: now, updated_at: now
      });
    }
  }
  return resources;
}

export async function detectLocalRuntime(options = {}) {
  const hardware = detectHardware(options);
  const servers = await discoverLocalModelServers(options);
  const resources = buildLocalModelResources({ hardware, servers, clock: options.clock || (() => new Date()) });
  return { schema_version: 1, detected_at: (options.clock || (() => new Date()))().toISOString(), hardware, servers, resources, cost_confirmed_zero: true, external_network_used: false };
}

export const hardwareDetectorInternals = { runCommand, parseNvidiaCsv, parseRocmJson, parseWindowsControllers, inferParametersBillion, fetchJson };
