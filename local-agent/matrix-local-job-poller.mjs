#!/usr/bin/env node
import crypto from 'node:crypto';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { executeJob } from './matrix-local-agent.mjs';
import { evaluateLocalResourcePressure, leasePressureEnvelope } from './local-resource-pressure.mjs';

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
  pollIntervalMs: integer('MATRIX_LOCAL_JOB_POLL_SECONDS', 5, 2, 300) * 1000,
  idleBackoffMs: integer('MATRIX_LOCAL_JOB_IDLE_SECONDS', 10, 2, 600) * 1000,
  busyBackoffMs: integer('MATRIX_LOCAL_BUSY_BACKOFF_SECONDS', 60, 5, 1800) * 1000,
  minimumFreeMemoryMb: integer('MATRIX_LOCAL_MIN_FREE_MEMORY_MB', 4096, 256, 1024 * 1024),
  minimumFreeMemoryPercent: integer('MATRIX_LOCAL_MIN_FREE_MEMORY_PERCENT', 25, 5, 90),
  requestTimeoutMs: integer('MATRIX_LOCAL_JOB_REQUEST_TIMEOUT_SECONDS', 30, 5, 300) * 1000
};

function assertConfiguration() {
  if (!config.adminToken || config.adminToken.length < 32) {
    throw new Error('MATRIX_AI_MANAGEMENT_ADMIN_TOKEN must contain the real shared token and be at least 32 characters');
  }
  const url = new URL(config.siteUrl);
  if (url.protocol !== 'https:') throw new Error('MATRIX_SITE_URL must use HTTPS');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function nodeId() {
  return `node-${sha256(`${os.hostname()}|${os.platform()}|${os.arch()}`).slice(0, 24)}`;
}

function headers() {
  return {
    'content-type': 'application/json',
    'x-admin-token': config.adminToken,
    authorization: `Bearer ${config.adminToken}`,
    'user-agent': 'matrix-local-job-poller/0.2.0'
  };
}

async function post(path, body) {
  const response = await fetch(`${config.siteUrl}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.requestTimeoutMs)
  });
  if (response.status === 204) return { status: 204, data: null };
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
  return { status: response.status, data };
}

async function lease(resourcePressure) {
  return post('/api/ai-management/admin/local-jobs/lease', {
    node_id: nodeId(),
    resource_pressure: leasePressureEnvelope(resourcePressure)
  });
}

async function complete(leaseToken, job, completion) {
  return post('/api/ai-management/admin/local-jobs/complete', {
    job_id: job.job_id,
    node_id: nodeId(),
    lease_token: leaseToken,
    completion
  });
}

async function runJob(leased) {
  const { lease_token: leaseToken, job } = leased;
  const started = Date.now();
  try {
    const result = await executeJob(job);
    const completion = {
      ok: true,
      result,
      duration_ms: Date.now() - started,
      cost_confirmed_zero: true,
      external_network_used: false,
      completed_at: new Date().toISOString()
    };
    const response = await complete(leaseToken, job, completion);
    console.log(`[${new Date().toISOString()}] completed ${job.job_id} (${job.job_type})`, response.data);
  } catch (error) {
    const completion = {
      ok: false,
      error: String(error?.message || error).slice(0, 2000),
      duration_ms: Date.now() - started,
      cost_confirmed_zero: true,
      external_network_used: false,
      completed_at: new Date().toISOString()
    };
    try {
      const response = await complete(leaseToken, job, completion);
      console.error(`[${new Date().toISOString()}] failed ${job.job_id} (${job.job_type})`, response.data);
    } catch (completionError) {
      console.error(`[${new Date().toISOString()}] completion receipt failed for ${job.job_id}: ${completionError.message}`);
    }
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  assertConfiguration();
  const id = nodeId();
  console.log(`Matrix outbound local-job poller 0.2.0 online as ${id}`);
  console.log(`Polling ${config.siteUrl}; zero-spend and no-external-network completion boundaries enforced.`);

  let stopping = false;
  const stop = signal => {
    stopping = true;
    console.log(`${signal} received; stopping after the current request.`);
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  while (!stopping) {
    try {
      const resourcePressure = evaluateLocalResourcePressure({
        minimumFreeMemoryMb: config.minimumFreeMemoryMb,
        minimumFreeMemoryPercent: config.minimumFreeMemoryPercent
      });
      if (!resourcePressure.can_accept_local_jobs) {
        console.log(`[${new Date().toISOString()}] local work deferred: ${resourcePressure.reasons.join(',') || 'resource pressure'}; external zero-spend compute preferred.`);
        await wait(config.busyBackoffMs);
        continue;
      }
      const response = await lease(resourcePressure);
      if (response.status === 204 || !response.data?.job) {
        await wait(config.idleBackoffMs);
        continue;
      }
      await runJob(response.data);
      await wait(config.pollIntervalMs);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] polling failed: ${error.message}`);
      await wait(Math.max(config.idleBackoffMs, 15000));
    }
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}

export { nodeId, runJob };
