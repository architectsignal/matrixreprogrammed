import crypto from 'node:crypto';
import { leasePressureEnvelope } from './local-resource-pressure.mjs';

function assertConfig(config = {}) {
  if (!config.siteUrl) throw new Error('siteUrl is required');
  if (!config.adminToken) throw new Error('adminToken is required');
  if (!config.nodeId) throw new Error('nodeId is required');
}

async function requestJson(url, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(url, options);
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
  if (!response.ok) throw new Error(`Control plane returned HTTP ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

export async function leaseNextJob(config, { fetchImpl = fetch, resourcePressure = null } = {}) {
  assertConfig(config);
  const body = { node_id: config.nodeId };
  if (resourcePressure) body.resource_pressure = leasePressureEnvelope(resourcePressure);
  const response = await fetchImpl(`${config.siteUrl.replace(/\/+$/, '')}/api/ai-management/admin/local-jobs/lease`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': config.adminToken,
      'user-agent': 'matrix-local-agent/0.2.0'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
  if (response.status === 204 || data?.job == null) return null;
  if (!response.ok) throw new Error(`Lease request failed with HTTP ${response.status}: ${JSON.stringify(data)}`);
  if (!data.lease_token || !data.job?.job_id) throw new Error('Lease response is incomplete');
  return data;
}

export async function completeJob(config, lease, completion, { fetchImpl = fetch } = {}) {
  assertConfig(config);
  if (!lease?.lease_token || !lease?.job?.job_id) throw new Error('Valid lease is required');
  const body = {
    job_id: lease.job.job_id,
    node_id: config.nodeId,
    lease_token: lease.lease_token,
    completion: {
      ...completion,
      job_id: lease.job.job_id,
      node_id: config.nodeId,
      cost_confirmed_zero: true,
      external_network_used: false
    }
  };
  return requestJson(`${config.siteUrl.replace(/\/+$/, '')}/api/ai-management/admin/local-jobs/complete`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': config.adminToken,
      'user-agent': 'matrix-local-agent/0.2.0'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  }, fetchImpl);
}

export function completionReceipt(job, result, startedAt) {
  const completedAt = new Date().toISOString();
  const resultJson = JSON.stringify(result ?? null);
  return {
    ok: true,
    job_type: job.job_type,
    result,
    result_sha256: crypto.createHash('sha256').update(resultJson).digest('hex'),
    duration_ms: Math.max(0, Date.now() - startedAt),
    completed_at: completedAt,
    cost_confirmed_zero: true,
    external_network_used: false
  };
}

export async function runOneControlPlaneJob(config, executeJob, options = {}) {
  const lease = await leaseNextJob(config, options);
  if (!lease) return { ok: true, idle: true };
  const began = Date.now();
  try {
    const result = await executeJob(lease.job);
    const receipt = completionReceipt(lease.job, result, began);
    const acknowledged = await completeJob(config, lease, receipt, options);
    return { ok: true, idle: false, job_id: lease.job.job_id, acknowledged };
  } catch (error) {
    const receipt = {
      ok: false,
      error: String(error?.message || error).slice(0, 2000),
      duration_ms: Math.max(0, Date.now() - began),
      completed_at: new Date().toISOString(),
      cost_confirmed_zero: true,
      external_network_used: false
    };
    const acknowledged = await completeJob(config, lease, receipt, options);
    return { ok: false, idle: false, job_id: lease.job.job_id, acknowledged, error: receipt.error };
  }
}
