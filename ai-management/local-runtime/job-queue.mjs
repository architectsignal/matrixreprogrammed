import crypto from 'node:crypto';

const PRIORITY_ORDER = new Map([['P0',0],['P1',1],['P2',2],['P3',3],['P4',4]]);

export function hash(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

export function createLeaseToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function validateJob(job = {}) {
  if (!['deterministic.hash', 'llm.generate'].includes(job.job_type)) throw new Error('Unsupported local job type');
  if (!['public','internal','confidential','restricted'].includes(job.data_class || 'internal')) throw new Error('Invalid data class');
  if (!PRIORITY_ORDER.has(job.priority || 'P3')) throw new Error('Invalid priority');
  const maximumAttempts = Math.max(1, Math.min(5, Number(job.maximum_attempts || 3)));
  if (job.job_type === 'llm.generate' && !job.payload?.model_id) throw new Error('LLM jobs require an explicit model_id');
  return {
    ...job,
    data_class: job.data_class || 'internal',
    priority: job.priority || 'P3',
    maximum_attempts: maximumAttempts,
    payload: job.payload || {},
    requirements: { cost_ceiling_eur: 0, external_network_allowed: false, ...(job.requirements || {}) }
  };
}

export function selectQueuedJob(rows = []) {
  return [...rows]
    .filter(row => row.status === 'queued' && Number(row.attempt_count || 0) < Number(row.maximum_attempts || 3))
    .sort((a, b) => (PRIORITY_ORDER.get(a.priority) - PRIORITY_ORDER.get(b.priority)) || String(a.created_at).localeCompare(String(b.created_at)))[0] || null;
}

export function buildLease(job, nodeId, { now = Date.now(), leaseMs = 120000, token = createLeaseToken() } = {}) {
  if (!job?.job_id || !nodeId) throw new Error('Job and node are required');
  return {
    token,
    tokenHash: hash(token),
    lease: {
      job_id: job.job_id,
      node_id: nodeId,
      job_type: job.job_type,
      payload: typeof job.payload_json === 'string' ? JSON.parse(job.payload_json) : job.payload || {},
      requirements: typeof job.requirements_json === 'string' ? JSON.parse(job.requirements_json) : job.requirements || {},
      data_class: job.data_class,
      priority: job.priority,
      leased_at: new Date(now).toISOString(),
      lease_expires_at: new Date(now + leaseMs).toISOString(),
      cost_ceiling_eur: 0,
      external_network_allowed: false
    }
  };
}

export function verifyCompletion(job, completion = {}, token) {
  if (!job || job.status !== 'leased') throw new Error('Job is not leased');
  if (!token || hash(token) !== job.lease_token_hash) throw new Error('Lease token is invalid');
  if (Date.parse(job.lease_expires_at || '') <= Date.now()) throw new Error('Lease has expired');
  if (completion.cost_confirmed_zero !== true) throw new Error('Completion did not prove zero cost');
  if (completion.external_network_used !== false) throw new Error('Completion used an external network');
  if (completion.job_id !== job.job_id || completion.node_id !== job.assigned_node_id) throw new Error('Completion identity mismatch');
  return true;
}

export function recoverExpired(rows = [], now = Date.now()) {
  return rows.filter(row => row.status === 'leased' && Date.parse(row.lease_expires_at || '') <= now).map(row => ({
    job_id: row.job_id,
    next_status: Number(row.attempt_count || 0) >= Number(row.maximum_attempts || 3) ? 'failed' : 'queued',
    receipt_type: Number(row.attempt_count || 0) >= Number(row.maximum_attempts || 3) ? 'expired' : 'requeued'
  }));
}
