import { NETWORK_SCOPES } from './rpc-broker.mjs';

const PUBLIC_WORKLOADS = new Set(['permissionless.scan', 'permissionless.decode', 'permissionless.health', 'permissionless.rank']);
const SIMULATION_WORKLOADS = new Set(['permissionless.simulate']);
const SECRET = /(private.?key|seed.?phrase|mnemonic|signer.?token|treasury.?credential|identity.?document|banking)/i;

async function hash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function sensitive(value, trail = '') {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) => SECRET.test(`${trail}.${key}`) || (nested && typeof nested === 'object' && sensitive(nested, `${trail}.${key}`)));
}

export async function buildDiscoveryJob(input = {}) {
  const workload = String(input.workload || '');
  if (!PUBLIC_WORKLOADS.has(workload) && !SIMULATION_WORKLOADS.has(workload)) throw new Error('Distributed workload is not allowlisted');
  if (input.data_class !== 'public') throw new Error('Distributed workers accept public data only');
  if (sensitive(input.payload)) throw new Error('Distributed job contains sensitive material');
  const scopes = [...new Set(input.network_scopes || [])];
  if (scopes.some(scope => !NETWORK_SCOPES.includes(scope))) throw new Error('Distributed network scope is not allowlisted');
  const payload = structuredClone(input.payload || {});
  const job = {
    job_id: String(input.job_id || ''), workload, data_class: 'public', payload,
    input_hash: await hash(payload), network_scopes: scopes, allowed_hosts: [...new Set(input.allowed_hosts || [])],
    monetary_ceiling_eur: 0, signing_allowed: false, secrets_available: false
  };
  if (!job.job_id || !job.allowed_hosts.length) throw new Error('Distributed job identity and host allowlist are required');
  return Object.freeze(job);
}

export class DistributedDiscoveryFabric {
  constructor({ centralVerify, clock = () => new Date(), maximumExternalResources = 100 } = {}) {
    this.centralVerify = centralVerify;
    this.clock = clock;
    this.maximumExternalResources = Math.max(1, Math.min(10_000, Number(maximumExternalResources || 100)));
    this.seen = new Set();
    this.pending = new Set();
  }

  validateWorker(resource = {}, job) {
    const blockers = [];
    if (resource.owner_authorized !== true || resource.approved_for_automation !== true) blockers.push('worker-not-authorized');
    if (resource.billing_enabled !== false || resource.payment_method_present !== false || Number(resource.monetary_cost_per_unit_eur) !== 0 || resource.billing_risk !== 'none') blockers.push('worker-not-zero-spend');
    if (resource.public_retrieval_only !== true || resource.secrets_available === true || resource.signing_allowed === true) blockers.push('worker-capability-boundary-invalid');
    if (!resource.supported_workloads?.includes(job.workload)) blockers.push('workload-not-supported');
    if (job.network_scopes.some(scope => !resource.network_scopes?.includes(scope))) blockers.push('worker-network-scope-insufficient');
    if (job.allowed_hosts.some(host => !resource.allowed_hosts?.includes(host))) blockers.push('worker-host-scope-insufficient');
    return { allowed: blockers.length === 0, blockers };
  }

  async acceptResult(job, resource, result = {}) {
    const worker = this.validateWorker(resource, job);
    if (!worker.allowed) return { accepted: false, blockers: worker.blockers };
    if (result.job_id !== job.job_id || result.input_hash !== job.input_hash || !result.output_hash || result.output_hash !== await hash(result.output)) return { accepted: false, blockers: ['worker-receipt-invalid'] };
    const receiptKey = `${result.job_id}:${result.output_hash}`;
    if (this.seen.has(receiptKey) || this.pending.has(receiptKey)) return { accepted: false, duplicate: true, blockers: ['duplicate-worker-result'] };
    if (typeof this.centralVerify !== 'function') return { accepted: false, blockers: ['central-verification-unavailable'] };
    this.pending.add(receiptKey);
    let verification;
    try {
      verification = await this.centralVerify(result.output, { job, resource });
    } finally {
      this.pending.delete(receiptKey);
    }
    if (verification?.verified !== true) return { accepted: false, blockers: ['central-verification-failed', ...(verification?.blockers || [])] };
    this.seen.add(receiptKey);
    return {
      accepted: true, centrally_verified: true, worker_receipt: {
        job_id: job.job_id, input_hash: job.input_hash, output_hash: result.output_hash,
        resource_id: resource.resource_id, completed_at: result.completed_at || this.clock().toISOString()
      }, output: verification.output || result.output
    };
  }
}

export async function buildWorkerResult(job, output, resourceId, completedAt = new Date().toISOString()) {
  return { job_id: job.job_id, input_hash: job.input_hash, output, output_hash: await hash(output), resource_id: resourceId, completed_at: completedAt };
}

export const distributedDiscoveryInternals = { PUBLIC_WORKLOADS, SIMULATION_WORKLOADS, SECRET, hash, sensitive };
