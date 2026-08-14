#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { detectLocalRuntime } from '../ai-management/local-runtime/hardware-detector.mjs';
import { runOneControlPlaneJob } from './control-plane-client.mjs';
import { executeJob } from './matrix-local-agent.mjs';
import { applyBenchmarkScores, benchmarkLocalRuntime } from './local-benchmark.mjs';
import { callHarvesterControlPlane } from './permissionless-harvester-cli.mjs';
import { callMatrixControlPlane } from './matrix-operations-cli.mjs';
import { pollAgentCommons, synchronizeAgentCommons } from './agent-commons-client.mjs';

const VERSION = '1.0.0';

function env(name, fallback = '') { return String(process.env[name] ?? fallback).trim(); }
function integer(name, fallback, minimum, maximum) {
  const value = Number(env(name, fallback));
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, Math.trunc(value))) : fallback;
}

export function defaultStateDir() {
  if (env('MATRIX_LOCAL_STATE_DIR')) return path.resolve(env('MATRIX_LOCAL_STATE_DIR'));
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'MatrixReprogrammed', 'host');
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'matrix-reprogrammed', 'host');
}

export function stableNodeId() {
  return `node-${crypto.createHash('sha256').update(`${os.hostname()}|${os.platform()}|${os.arch()}`).digest('hex').slice(0, 24)}`;
}

export function hostConfig() {
  const adminToken = env('MATRIX_AI_MANAGEMENT_ADMIN_TOKEN');
  if (adminToken && adminToken.length < 32) throw new Error('MATRIX_AI_MANAGEMENT_ADMIN_TOKEN must be at least 32 characters when configured');
  const siteUrl = env('MATRIX_SITE_URL', 'https://matrixreprogrammed.com').replace(/\/+$/, '');
  if (new URL(siteUrl).protocol !== 'https:' && env('MATRIX_LOCAL_ALLOW_HTTP_FOR_TESTS') !== 'true') throw new Error('MATRIX_SITE_URL must use HTTPS');
  return {
    version: VERSION,
    nodeId: stableNodeId(),
    siteUrl,
    adminToken,
    stateDir: defaultStateDir(),
    heartbeatMs: integer('MATRIX_LOCAL_HEARTBEAT_SECONDS', 10, 1, 300) * 1000,
    pollMs: integer('MATRIX_LOCAL_JOB_POLL_SECONDS', 5, 2, 300) * 1000,
    idlePollMs: integer('MATRIX_LOCAL_JOB_IDLE_SECONDS', 15, 2, 600) * 1000,
    discoveryMs: integer('MATRIX_LOCAL_DISCOVERY_SECONDS', 300, 30, 3600) * 1000,
    benchmarkMs: integer('MATRIX_LOCAL_BENCHMARK_HOURS', 24, 1, 168) * 60 * 60 * 1000,
    benchmarkEnabled: env('MATRIX_LOCAL_BENCHMARK_ENABLED', 'true').toLowerCase() === 'true',
    harvesterEnabled: env('MATRIX_PERMISSIONLESS_VALUE_ENABLED', 'false').toLowerCase() === 'true',
    matrixOperationsEnabled: env('MATRIX_OPERATING_SYSTEM_ENABLED', 'true').toLowerCase() === 'true',
    agentCommonsEnabled: env('MATRIX_AGENT_COMMONS_HOST_ENABLED', 'true').toLowerCase() === 'true',
    agentCommonsPollMs: integer('MATRIX_AGENT_COMMONS_POLL_SECONDS', 60, 30, 900) * 1000
  };
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, file).catch(async () => {
    await fs.rm(file, { force: true });
    await fs.rename(temporary, file);
  });
}

export async function registerRuntime(config, runtime, { fetchImpl = globalThis.fetch } = {}) {
  if (!config.adminToken) return { ok: false, skipped: true, reason: 'owner-token-not-configured' };
  const response = await fetchImpl(`${config.siteUrl}/api/ai-management/admin/local-runtime`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': config.adminToken, 'user-agent': `matrix-local-host/${VERSION}` },
    body: JSON.stringify({
      node_id: config.nodeId,
      cost_confirmed_zero: true,
      external_network_used: false,
      hardware: runtime.hardware,
      servers: runtime.servers,
      resources: runtime.resources,
      agent: { version: VERSION, mode: 'outbound-only', pid: process.pid, started_at: new Date().toISOString() }
    }),
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 300) }; }
  if (!response.ok) throw new Error(`Runtime registration failed with HTTP ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

function wait(ms, signal) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

export async function runHost({ config = hostConfig(), fetchImpl = globalThis.fetch, clock = () => new Date(), signal = null, onStatus = null } = {}) {
  await fs.mkdir(config.stateDir, { recursive: true });
  const controller = new AbortController();
  const stop = () => controller.abort();
  signal?.addEventListener('abort', stop, { once: true });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const statusFile = path.join(config.stateDir, 'status.json');
  const startedAt = clock().toISOString();
  const status = {
    schema_version: 1, version: VERSION, node_id: config.nodeId, pid: process.pid, started_at: startedAt,
    mode: config.adminToken ? 'connected' : 'local-only-owner-token-required',
    zero_spend_lock: true, outbound_only: true, state: 'starting', restart_safe: true,
    runtime: { discovered_models: 0, healthy_servers: 0 }, jobs: { completed: 0, failed: 0, idle_polls: 0 },
    registration: { configured: Boolean(config.adminToken), last_ok_at: null, last_error: null },
    benchmark: { enabled: config.benchmarkEnabled, last_completed_at: null, measured_models: 0 },
    harvester: { enabled: config.harvesterEnabled, startup_attempted: false, last_result: null },
    matrix_operations: { enabled: config.matrixOperationsEnabled, startup_attempted: false, last_result: null },
    agent_commons: { enabled: config.agentCommonsEnabled, connected_agents: 0, investigations_available: 0, reviews_available: 0, last_ok_at: null, last_error: null }
  };
  let runtime = null;
  let nextDiscovery = 0;
  let nextPoll = 0;
  let nextBenchmark = 0;
  let nextAgentCommonsPoll = 0;
  const agentCommonsCredentials = new Map();
  const latestBenchmarkFile = path.join(config.stateDir, 'benchmarks', 'latest.json');
  const previousBenchmark = await readJson(latestBenchmarkFile);
  if (previousBenchmark?.completed_at) {
    status.benchmark.last_completed_at = previousBenchmark.completed_at;
    status.benchmark.measured_models = previousBenchmark.measured_models || 0;
    nextBenchmark = Date.parse(previousBenchmark.completed_at) + config.benchmarkMs;
  }

  const publishStatus = async () => {
    status.heartbeat_at = clock().toISOString();
    await writeJson(statusFile, status);
    onStatus?.(structuredClone(status));
  };

  // Publish liveness before slower hardware and model probes so operators can
  // distinguish a healthy starting service from a dead process.
  status.state = 'online';
  await publishStatus();

  if (config.harvesterEnabled && config.adminToken) {
    status.harvester.startup_attempted = true;
    try {
      const result = await callHarvesterControlPlane('start', { fetchImpl });
      status.harvester.last_result = { ok: result.ok, at: clock().toISOString(), live_collection_state: result.remote?.report?.live_collection_state || null };
    } catch (error) {
      status.harvester.last_result = { ok: false, at: clock().toISOString(), error: String(error?.message || error).slice(0, 300) };
    }
    await publishStatus();
  }

  if (config.matrixOperationsEnabled && config.adminToken) {
    status.matrix_operations.startup_attempted = true;
    try {
      const result = await callMatrixControlPlane('start', { fetchImpl });
      status.matrix_operations.last_result = {
        ok: result.ok,
        at: clock().toISOString(),
        state: result.remote?.report ? 'cycle-completed' : result.remote?.state || null,
        cycle_id: result.remote?.report?.cycle_id || null
      };
    } catch (error) {
      status.matrix_operations.last_result = { ok: false, at: clock().toISOString(), error: String(error?.message || error).slice(0, 300) };
    }
    await publishStatus();
  }

  while (!controller.signal.aborted) {
    const now = Date.now();
    if (now >= nextDiscovery) {
      try {
        runtime = await detectLocalRuntime({ fetchImpl, clock });
        runtime.resources = applyBenchmarkScores(runtime.resources, await readJson(latestBenchmarkFile));
        status.runtime = {
          detected_at: runtime.detected_at,
          discovered_models: runtime.resources.length,
          healthy_servers: runtime.servers.filter(server => server.healthy).length,
          cpu_threads: runtime.hardware.cpu_threads ?? runtime.hardware.cpu?.logical_cores ?? 0,
          total_memory_mb: runtime.hardware.total_memory_mb ?? Math.round(Number(runtime.hardware.memory?.total_bytes || 0) / 1024 / 1024),
          gpu_count: runtime.hardware.gpus?.length || 0
        };
        const registered = await registerRuntime(config, runtime, { fetchImpl });
        if (!registered.skipped) status.registration.last_ok_at = clock().toISOString();
        status.registration.last_error = registered.skipped ? registered.reason : null;
        const commons = await synchronizeAgentCommons(config, runtime, agentCommonsCredentials, { fetchImpl, clock });
        status.agent_commons.connected_agents = commons.connected || 0;
        status.agent_commons.last_error = commons.errors?.join('; ') || (commons.skipped ? commons.reason : null);
      } catch (error) {
        status.registration.last_error = String(error?.message || error).slice(0, 500);
      }
      nextDiscovery = now + config.discoveryMs;
    }

    if (config.agentCommonsEnabled && agentCommonsCredentials.size && now >= nextAgentCommonsPoll) {
      try {
        const commons = await pollAgentCommons(config, agentCommonsCredentials, { fetchImpl });
        status.agent_commons.connected_agents = commons.agents;
        status.agent_commons.investigations_available = commons.investigationsAvailable;
        status.agent_commons.reviews_available = commons.reviewsAvailable;
        status.agent_commons.last_ok_at = commons.ok ? clock().toISOString() : status.agent_commons.last_ok_at;
        status.agent_commons.last_error = commons.ok ? null : commons.snapshots.filter(item => !item.ok).map(item => item.error).join('; ').slice(0, 500);
      } catch (error) {
        status.agent_commons.last_error = String(error?.message || error).slice(0, 500);
      }
      nextAgentCommonsPoll = now + config.agentCommonsPollMs;
    }

    if (config.adminToken && now >= nextPoll) {
      try {
        const result = await runOneControlPlaneJob({ siteUrl: config.siteUrl, adminToken: config.adminToken, nodeId: config.nodeId }, executeJob, { fetchImpl });
        if (result.idle) {
          status.jobs.idle_polls += 1;
          nextPoll = now + config.idlePollMs;
        } else {
          status.jobs.last_job_id = result.job_id;
          status.jobs.last_job_at = clock().toISOString();
          status.jobs[result.ok ? 'completed' : 'failed'] += 1;
          nextPoll = now + config.pollMs;
        }
        status.jobs.last_error = null;
      } catch (error) {
        status.jobs.last_error = String(error?.message || error).slice(0, 500);
        nextPoll = now + Math.max(config.idlePollMs, 15000);
      }
    }

    const idleEnough = !config.adminToken || status.jobs.idle_polls >= 2;
    if (config.benchmarkEnabled && runtime && idleEnough && now >= nextBenchmark) {
      try {
        status.state = 'benchmarking';
        await publishStatus();
        const report = await benchmarkLocalRuntime(runtime, { fetchImpl, clock, stateDir: config.stateDir });
        status.benchmark.last_completed_at = report.completed_at;
        status.benchmark.measured_models = report.measured_models;
        status.benchmark.last_error = null;
        runtime.resources = applyBenchmarkScores(runtime.resources, report);
        nextDiscovery = 0;
      } catch (error) {
        status.benchmark.last_error = String(error?.message || error).slice(0, 500);
      }
      nextBenchmark = now + config.benchmarkMs;
    }

    status.state = controller.signal.aborted ? 'stopping' : 'online';
    await publishStatus();
    await wait(Math.min(config.heartbeatMs, 2000), controller.signal);
  }
  status.state = 'stopped';
  status.stopped_at = clock().toISOString();
  await publishStatus();
  return status;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  runHost().catch(error => {
    console.error(`[matrix-local-host] fatal: ${error.stack || error.message || error}`);
    process.exit(1);
  });
}

export { readJson, writeJson };
