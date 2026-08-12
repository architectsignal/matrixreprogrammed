import {
  completePublicInvestigationLocalResult,
  recordPublicInvestigationLocalFailure
} from './worker-public-investigation.js';
import { D1ResourceRegistry } from '../ai-management/resource-registry/resource-registry.mjs';

const PRIORITY_SQL = "CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END";

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-matrix-origin': 'cloudflare-worker-local-jobs'
    }
  });
}

async function digest(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value ?? '')));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(String(value || '')); } catch { return fallback; }
}

function containsPrivatePublicResultMaterial(value, depth = 0) {
  if (depth > 8 || value == null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(item => containsPrivatePublicResultMaterial(item, depth + 1));
  return Object.entries(value).some(([key, item]) => /^(?:response|raw_output|prompt|messages|reasoning|analysis|chain_of_thought|scratchpad)$/i.test(key)
    || containsPrivatePublicResultMaterial(item, depth + 1));
}

function normalizeJob(body = {}) {
  const jobType = String(body.job_type || '');
  if (!['deterministic.hash', 'llm.generate'].includes(jobType)) throw new Error('Unsupported local job type');
  const dataClass = String(body.data_class || 'internal');
  if (!['public', 'internal', 'confidential', 'restricted'].includes(dataClass)) throw new Error('Invalid data class');
  const priority = String(body.priority || 'P3');
  if (!['P0', 'P1', 'P2', 'P3', 'P4'].includes(priority)) throw new Error('Invalid priority');
  if (jobType === 'llm.generate' && !body.payload?.model_id) throw new Error('LLM jobs require an explicit model_id');
  return {
    job_id: String(body.job_id || `local-job-${crypto.randomUUID()}`).slice(0, 160),
    job_type: jobType,
    payload: body.payload || {},
    requirements: { ...(body.requirements || {}), cost_ceiling_eur: 0, external_network_allowed: false },
    data_class: dataClass,
    priority,
    maximum_attempts: Math.max(1, Math.min(5, Number(body.maximum_attempts || 3)))
  };
}

export async function enqueueLocalJob(env, body) {
  const job = normalizeJob(body);
  const now = new Date().toISOString();
  await env.MEMBERS_DB.prepare(`INSERT INTO ai_local_jobs(
    job_id,job_type,payload_json,requirements_json,data_class,priority,status,attempt_count,maximum_attempts,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,'queued',0,?,?,?)`)
    .bind(job.job_id, job.job_type, JSON.stringify(job.payload), JSON.stringify(job.requirements), job.data_class, job.priority, job.maximum_attempts, now, now).run();
  return json({ ok: true, job_id: job.job_id, status: 'queued', cost_ceiling_eur: 0, external_network_allowed: false }, 201);
}

export async function leaseLocalJob(env, body) {
  const nodeId = String(body?.node_id || '');
  if (!nodeId) return json({ ok: false, error: 'node_id is required' }, 400);
  const node = await env.MEMBERS_DB.prepare("SELECT node_id,status,expires_at,cost_confirmed_zero,external_network_used FROM ai_local_runtime_nodes WHERE node_id=? LIMIT 1").bind(nodeId).first();
  if (!node || node.status !== 'online' || Date.parse(node.expires_at || '') <= Date.now()) return json({ ok: false, error: 'Node is not online' }, 409);
  if (!Boolean(node.cost_confirmed_zero) || Boolean(node.external_network_used)) return json({ ok: false, error: 'Node is not eligible for zero-spend offline execution' }, 409);
  const row = await env.MEMBERS_DB.prepare(`SELECT * FROM ai_local_jobs
    WHERE status='queued' AND attempt_count<maximum_attempts AND (assigned_node_id IS NULL OR assigned_node_id=?)
    ORDER BY ${PRIORITY_SQL},created_at ASC LIMIT 1`).bind(nodeId).first();
  if (!row) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  const token = randomToken();
  const tokenHash = await digest(token);
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 120000).toISOString();
  const updated = await env.MEMBERS_DB.prepare(`UPDATE ai_local_jobs SET status='leased',assigned_node_id=?,lease_token_hash=?,lease_expires_at=?,attempt_count=attempt_count+1,updated_at=?
    WHERE job_id=? AND status='queued'`).bind(nodeId, tokenHash, expires, now, row.job_id).run();
  if (!updated?.meta?.changes) return json({ ok: false, error: 'Job was leased concurrently; retry' }, 409);
  const receiptId = `receipt-${crypto.randomUUID()}`;
  await env.MEMBERS_DB.prepare(`INSERT INTO ai_local_job_receipts(receipt_id,job_id,node_id,receipt_type,payload_hash,cost_confirmed_zero,external_network_used,created_at)
    VALUES(?,?,?,'leased',?,1,0,?)`).bind(receiptId, row.job_id, nodeId, await digest(row.payload_json), now).run();
  return json({
    ok: true,
    lease_token: token,
    lease_expires_at: expires,
    job: {
      job_id: row.job_id,
      node_id: nodeId,
      job_type: row.job_type,
      payload: JSON.parse(row.payload_json || '{}'),
      requirements: JSON.parse(row.requirements_json || '{}'),
      data_class: row.data_class,
      priority: row.priority,
      cost_ceiling_eur: 0,
      external_network_allowed: false
    }
  });
}

export async function completeLocalJob(env, body) {
  const jobId = String(body?.job_id || '');
  const nodeId = String(body?.node_id || '');
  const token = String(body?.lease_token || '');
  let completion = body?.completion || {};
  if (!jobId || !nodeId || !token) return json({ ok: false, error: 'job_id, node_id and lease_token are required' }, 400);
  const row = await env.MEMBERS_DB.prepare('SELECT * FROM ai_local_jobs WHERE job_id=? LIMIT 1').bind(jobId).first();
  if (!row || row.status !== 'leased') return json({ ok: false, error: 'Job is not leased' }, 409);
  if (row.assigned_node_id !== nodeId || await digest(token) !== row.lease_token_hash) return json({ ok: false, error: 'Lease identity is invalid' }, 403);
  if (Date.parse(row.lease_expires_at || '') <= Date.now()) return json({ ok: false, error: 'Lease has expired' }, 409);
  if (completion.cost_confirmed_zero !== true || completion.external_network_used !== false) return json({ ok: false, error: 'Completion violated zero-spend or network boundary' }, 400);
  const jobPayload = parseJson(row.payload_json, {});
  const publicInvestigationJob = Boolean(jobPayload?.public_investigation?.investigation_id);
  let publicCompletion = null;
  let publicFailureType = null;
  if (publicInvestigationJob && containsPrivatePublicResultMaterial(completion?.result)) {
    completion = { ...completion, ok: false, error: 'Public investigation completion contained private prompt, reasoning or raw model material', result: undefined };
    publicFailureType = 'private-material-rejected';
  }
  if (publicInvestigationJob && completion.ok === true) {
    try {
      publicCompletion = await completePublicInvestigationLocalResult(env, row, completion);
    } catch (error) {
      completion = { ...completion, ok: false, error: String(error?.message || error).slice(0, 1200), result: undefined };
      publicFailureType = /evidence ID|source route|citation/i.test(String(error?.message || error))
        ? 'invented-citation-rejected'
        : /JSON|object|field/i.test(String(error?.message || error))
          ? 'malformed-model-json'
          : 'public-result-validation-failed';
    }
  }
  const successful = completion.ok === true;
  const now = new Date().toISOString();
  const nextStatus = successful ? 'completed' : Number(row.attempt_count || 0) >= Number(row.maximum_attempts || 3) ? 'failed' : 'queued';
  const resultJson = publicInvestigationJob
    ? JSON.stringify({
        ok: successful,
        public_result_persisted: Boolean(publicCompletion?.handled),
        public_investigation_id: publicCompletion?.investigation_id || jobPayload.public_investigation.investigation_id,
        result_sha256: String(body?.completion?.result_sha256 || ''),
        error: successful ? null : String(completion.error || 'Local public-result validation failed').slice(0, 1200),
        raw_output_persisted: false,
        prompt_persisted: false
      })
    : JSON.stringify(completion);
  await env.MEMBERS_DB.prepare(`UPDATE ai_local_jobs SET status=?,result_json=?,error_text=?,assigned_node_id=NULL,lease_token_hash=NULL,lease_expires_at=NULL,updated_at=?,completed_at=? WHERE job_id=?`)
    .bind(nextStatus, resultJson, successful ? null : String(completion.error || 'Local execution failed').slice(0, 2000), now, successful || nextStatus === 'failed' ? now : null, jobId).run();
  const receiptId = `receipt-${crypto.randomUUID()}`;
  await env.MEMBERS_DB.prepare(`INSERT INTO ai_local_job_receipts(receipt_id,job_id,node_id,receipt_type,payload_hash,result_hash,cost_confirmed_zero,external_network_used,created_at)
    VALUES(?,?,?,?,?,?,1,0,?)`).bind(receiptId, jobId, nodeId, successful ? 'completed' : nextStatus === 'failed' ? 'failed' : 'requeued', await digest(row.payload_json), await digest(resultJson), now).run();
  const executionLatencyMs = Math.max(0, Date.now() - (Date.parse(row.updated_at || '') || Date.now()));
  const registry = new D1ResourceRegistry(env.MEMBERS_DB);
  if (successful) await registry.recordSuccess(nodeId, executionLatencyMs, now).catch(() => null);
  else await registry.recordFailure(nodeId, completion.error || 'Local execution failed', now, nextStatus === 'failed' ? 300000 : 0).catch(() => null);
  if (jobId.startsWith('capacity-benchmark-')) {
    const learningId = `learning-${jobId}`.slice(0, 180);
    const auditIdentifier = `capacity-benchmark:${jobId}`.slice(0, 220);
    await env.MEMBERS_DB.prepare(`INSERT OR IGNORE INTO matrix_learning_ledger(
      learning_id,source_event_id,domain,observation,proposed_change,change_class,decision,evidence_json,audit_identifier,created_at
    ) VALUES(?,NULL,'zero-cost-compute',?,?,'A','recorded',?,?,?)`)
      .bind(
        learningId,
        `Owner-local benchmark ${successful ? 'passed' : 'failed'} on ${nodeId} in ${executionLatencyMs}ms at EUR 0.`,
        'Use the recorded reliability and latency outcome in subsequent capacity ranking.',
        JSON.stringify({ job_id: jobId, node_id: nodeId, successful, latency_ms: executionLatencyMs, cost_eur: 0, external_network_used: false }),
        auditIdentifier,
        now
      ).run().catch(() => null);
  }
  if (publicInvestigationJob && !successful) {
    await recordPublicInvestigationLocalFailure(env, row, publicFailureType || 'local-model-failed', completion.error, nextStatus === 'failed').catch(() => null);
  }
  return json({
    ok: true,
    job_id: jobId,
    status: nextStatus,
    receipt_id: receiptId,
    public_investigation_id: publicCompletion?.investigation_id || (publicInvestigationJob ? jobPayload.public_investigation.investigation_id : null),
    public_result_persisted: Boolean(publicCompletion?.handled),
    raw_output_persisted: publicInvestigationJob ? false : undefined
  });
}

export async function listLocalJobs(env) {
  const rows = await env.MEMBERS_DB.prepare(`SELECT job_id,job_type,data_class,priority,status,assigned_node_id,lease_expires_at,attempt_count,maximum_attempts,created_at,updated_at,completed_at
    FROM ai_local_jobs ORDER BY created_at DESC LIMIT 200`).all();
  return json({ ok: true, jobs: rows?.results || [] });
}

export async function recoverExpiredLocalJobs(env) {
  const now = new Date().toISOString();
  const rows = await env.MEMBERS_DB.prepare("SELECT * FROM ai_local_jobs WHERE status='leased' AND lease_expires_at<=?").bind(now).all();
  let recovered = 0;
  for (const row of rows?.results || []) {
    const nextStatus = Number(row.attempt_count || 0) >= Number(row.maximum_attempts || 3) ? 'failed' : 'queued';
    await env.MEMBERS_DB.prepare(`UPDATE ai_local_jobs SET status=?,assigned_node_id=NULL,lease_token_hash=NULL,lease_expires_at=NULL,updated_at=?,error_text=? WHERE job_id=?`)
      .bind(nextStatus, now, nextStatus === 'failed' ? 'Lease expired after maximum attempts' : 'Lease expired and was requeued', row.job_id).run();
    const receiptId = `receipt-${crypto.randomUUID()}`;
    await env.MEMBERS_DB.prepare(`INSERT INTO ai_local_job_receipts(receipt_id,job_id,node_id,receipt_type,payload_hash,cost_confirmed_zero,external_network_used,created_at)
      VALUES(?,?,?,?,?,1,0,?)`).bind(receiptId, row.job_id, row.assigned_node_id, nextStatus === 'failed' ? 'expired' : 'requeued', await digest(row.payload_json), now).run();
    recovered += 1;
  }
  return recovered;
}

export function isLocalJobRoute(path) {
  return path === '/api/ai-management/admin/local-jobs'
    || path === '/api/ai-management/admin/local-jobs/enqueue'
    || path === '/api/ai-management/admin/local-jobs/lease'
    || path === '/api/ai-management/admin/local-jobs/complete';
}

export async function handleLocalJobRoute(request, env) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  let body = {};
  if (request.method !== 'GET') {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  }
  if (path === '/api/ai-management/admin/local-jobs' && request.method === 'GET') return listLocalJobs(env);
  if (path === '/api/ai-management/admin/local-jobs/enqueue' && request.method === 'POST') return enqueueLocalJob(env, body);
  if (path === '/api/ai-management/admin/local-jobs/lease' && request.method === 'POST') return leaseLocalJob(env, body);
  if (path === '/api/ai-management/admin/local-jobs/complete' && request.method === 'POST') return completeLocalJob(env, body);
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
