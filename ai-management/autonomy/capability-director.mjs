import { createHash } from 'node:crypto';

const REMOTE_TASKS = Object.freeze({
  'public-site-analysis': {
    priority: 'P2',
    trigger: ({ siteReport }) => Number(siteReport?.total_issues || 0) >= 100,
    reason: 'Large public site audit can be processed as a bounded batch job without consuming local model capacity.'
  },
  'public-site-asset-audit': {
    priority: 'P3',
    trigger: ({ siteReport }) => Number(siteReport?.issue_counts?.['unversioned-static-assets'] || 0) > 0,
    reason: 'Static asset inventory and optimization recommendations are public, parallelizable and compute-heavy at site scale.'
  },
  'public-site-structure-audit': {
    priority: 'P3',
    trigger: ({ siteReport }) => Number(siteReport?.scanned_pages || 0) >= 500,
    reason: 'Large-scale structure, duplication and navigation analysis benefits from remote batch processing.'
  }
});

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function localPressure(runtime = {}, siteReport = {}) {
  const gpuMemory = Number(runtime?.hardware?.total_gpu_memory_mb ?? runtime?.total_gpu_memory_mb ?? 0);
  const freeGpuMemory = Number(runtime?.hardware?.free_gpu_memory_mb ?? 0);
  const models = Number(runtime?.resources?.length ?? runtime?.models ?? 0);
  const pages = Number(siteReport?.scanned_pages || 0);
  const issues = Number(siteReport?.total_issues || 0);
  let score = 0;
  const reasons = [];
  if (gpuMemory < 8192) { score += 35; reasons.push('gpu-memory-below-8gb'); }
  if (freeGpuMemory > 0 && freeGpuMemory < 4096) { score += 20; reasons.push('free-gpu-memory-below-4gb'); }
  if (models > 0 && gpuMemory < 12288) { score += 10; reasons.push('local-models-compete-for-limited-vram'); }
  if (pages >= 500) { score += 15; reasons.push('large-public-site-surface'); }
  if (issues >= 500) { score += 20; reasons.push('large-improvement-backlog'); }
  return {
    score: Math.max(0, Math.min(100, score)),
    level: score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low',
    reasons,
    gpu_memory_mb: gpuMemory,
    free_gpu_memory_mb: freeGpuMemory,
    models,
    pages,
    issues
  };
}

function eligibleCompute(resources = [], now = new Date()) {
  return resources.filter(resource => {
    if (!resource?.enabled || resource?.metadata?.remote_compute !== true) return false;
    if (resource?.metadata?.public_workloads_only !== true || resource?.metadata?.prompt_transfer_allowed !== false) return false;
    if (resource?.billing_enabled !== false || resource?.payment_method_present !== false || resource?.billing_risk !== 'none') return false;
    if (Number(resource?.monetary_cost_per_unit_eur || 0) !== 0 || resource?.quota_verified !== true) return false;
    if (Number(resource?.quota_remaining || 0) <= Number(resource?.hard_stop_threshold || 0)) return false;
    if (resource?.terms_revalidation_due && Date.parse(resource.terms_revalidation_due) <= now.getTime()) return false;
    if (resource?.metadata?.expires_at && Date.parse(resource.metadata.expires_at) <= now.getTime()) return false;
    return true;
  });
}

function publicManifest({ siteOrigin, siteReport, taskType }) {
  const origin = String(siteOrigin || 'https://matrixreprogrammed.com').replace(/\/+$/, '');
  return {
    task_type: taskType,
    site_origin: origin,
    sitemap_url: `${origin}/sitemap.xml`,
    public_health_url: `${origin}/deploy-health.json`,
    scanned_pages: Number(siteReport?.scanned_pages || 0),
    total_issues: Number(siteReport?.total_issues || 0),
    issue_counts: siteReport?.issue_counts || {},
    generated_at: siteReport?.generated_at || new Date().toISOString(),
    requested_outputs: ['machine-readable findings', 'prioritized recommendations', 'provenance manifest'],
    forbidden_inputs: ['private prompts', 'member data', 'credentials', 'payments', 'unpublished evidence', 'restricted dossiers']
  };
}

function jobForTask(taskType, context, sequence) {
  const definition = REMOTE_TASKS[taskType];
  const manifest = publicManifest({ ...context, taskType });
  const signature = hash({ taskType, manifest, sequence });
  return {
    job_id: `capability-${taskType}-${signature.slice(0, 16)}`,
    objective_id: 'autonomous-site-improvement',
    job_type: 'remote-compute.execute',
    capability_type: 'remote_compute',
    priority: definition.priority,
    data_class: 'public',
    status: 'queued',
    payload: {
      task_type: taskType,
      public_manifest: manifest,
      public_inputs: [manifest.sitemap_url, manifest.public_health_url],
      quota_units: 1,
      maximum_runtime_seconds: 900
    },
    requirements: {
      cost_ceiling_eur: 0,
      maximum_attempts: 1,
      maximum_latency_ms: 15 * 60 * 1000,
      requires_provenance: true,
      cacheable: false
    },
    metadata: {
      director_reason: definition.reason,
      generated_by: 'autonomous-capability-director',
      public_data_only: true,
      local_resource_relief: true
    },
    created_at: new Date().toISOString()
  };
}

export class AutonomousCapabilityDirector {
  constructor({ clock = () => new Date(), maximumRemoteJobs = 2 } = {}) {
    this.clock = clock;
    this.maximumRemoteJobs = Math.max(0, Math.min(Number(maximumRemoteJobs || 0), 5));
  }

  plan({
    siteReport = {},
    localRuntime = {},
    computeResources = [],
    siteOrigin = 'https://matrixreprogrammed.com'
  } = {}) {
    const generatedAt = this.clock().toISOString();
    const pressure = localPressure(localRuntime, siteReport);
    const eligible = eligibleCompute(computeResources, this.clock());
    const triggered = Object.entries(REMOTE_TASKS)
      .filter(([, definition]) => definition.trigger({ siteReport, localRuntime, pressure }))
      .map(([taskType]) => taskType);
    const remotePreferred = pressure.level === 'high' || pressure.level === 'medium' && Number(siteReport?.scanned_pages || 0) >= 1000;
    const jobs = remotePreferred && eligible.length
      ? triggered.slice(0, this.maximumRemoteJobs).map((taskType, index) => jobForTask(taskType, { siteOrigin, siteReport }, index))
      : [];
    const deferred = triggered.filter(taskType => !jobs.some(job => job.payload.task_type === taskType)).map(taskType => ({
      task_type: taskType,
      reason: !remotePreferred
        ? 'local-pressure-does-not-justify-remote-offload'
        : !eligible.length
          ? 'no-approved-zero-spend-remote-compute'
          : 'per-cycle-remote-job-limit'
    }));
    return {
      ok: true,
      generated_at: generatedAt,
      local_pressure: pressure,
      eligible_remote_resources: eligible.map(resource => ({
        resource_id: resource.resource_id,
        provider_name: resource.provider_name,
        quota_remaining: resource.quota_remaining,
        quota_unit: resource.free_quota_unit,
        expires_at: resource.metadata?.expires_at || null
      })),
      remote_preferred: remotePreferred,
      triggered_tasks: triggered,
      queued_jobs: jobs,
      deferred_tasks: deferred,
      cost_ceiling_eur: 0,
      boundary: 'The local computer remains the controller. Only public, bounded, provenance-required tasks may be offloaded to verified zero-spend compute. Private reasoning, credentials and protected site systems remain local.'
    };
  }
}

export const capabilityDirectorInternals = { REMOTE_TASKS, hash, localPressure, eligibleCompute, publicManifest, jobForTask };
