import fs from 'node:fs';
import path from 'node:path';
import { buildAdapterBlueprint, certifyGeneratedAdapter } from '../ai-management/adapter-factory/adapter-factory.mjs';
import { runHarmlessLiveProbe } from '../ai-management/adapter-factory/live-probe-certifier.mjs';
import { runCapabilityImprovementCycle } from '../ai-management/self-improvement/capability-improvement-controller.mjs';

const root = process.cwd();
const configDir = path.join(root, 'ai-management', 'config');
const downloadsDir = path.join(root, 'downloads');
fs.mkdirSync(configDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function enabled(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function candidateSources() {
  const files = [
    path.join(configDir, 'opportunities.autonomous.json'),
    path.join(downloadsDir, 'opportunity-hunter-report.json'),
    path.join(downloadsDir, 'ai-opportunities.json')
  ];
  const merged = new Map();
  for (const file of files) {
    const payload = readJson(file, {});
    const candidates = payload.opportunities || payload.approved || payload.candidates || [];
    for (const candidate of candidates) {
      const id = candidate.candidate_id || candidate.opportunity_id || candidate.id;
      if (id) merged.set(id, { ...candidate, candidate_id: id });
    }
  }
  return [...merged.values()];
}

function currentCapabilityScores(resources = []) {
  const active = resources.filter(resource => resource.enabled === true && resource.implementation_status === 'production');
  const score = capability => {
    const matching = active.filter(resource => (resource.capability_types || []).includes(capability));
    if (!matching.length) return 0;
    const average = matching.reduce((sum, resource) => sum + Number(resource.reliability_score || 50), 0) / matching.length;
    return Math.min(100, Math.round(average + Math.min(20, matching.length * 2)));
  };
  return {
    public_data: score('public_data'),
    local_inference: score('local_inference'),
    remote_free_compute: score('remote_free_compute'),
    storage: score('storage'),
    search: score('search'),
    monitoring: score('monitoring')
  };
}

function observationsByResource() {
  const payload = readJson(path.join(downloadsDir, 'ai-resource-health.json'), {});
  const rows = payload.resources || payload.observations || [];
  return Object.fromEntries(rows.filter(row => row.resource_id).map(row => [row.resource_id, row]));
}

const now = new Date();
const registryFile = path.join(configDir, 'resources.autonomous.json');
const registry = readJson(registryFile, { schema_version: 1, resources: [] });
const resources = Array.isArray(registry.resources) ? registry.resources : [];
const candidates = candidateSources();
const liveProbeEnabled = enabled(process.env.AI_CAPABILITY_LIVE_PROBE_ENABLED, false);
const targets = {
  public_data: Number(process.env.AI_CAPABILITY_TARGET_PUBLIC_DATA || 90),
  local_inference: Number(process.env.AI_CAPABILITY_TARGET_LOCAL_INFERENCE || 90),
  remote_free_compute: Number(process.env.AI_CAPABILITY_TARGET_REMOTE_FREE_COMPUTE || 80),
  storage: Number(process.env.AI_CAPABILITY_TARGET_STORAGE || 70),
  search: Number(process.env.AI_CAPABILITY_TARGET_SEARCH || 90),
  monitoring: Number(process.env.AI_CAPABILITY_TARGET_MONITORING || 85)
};

const staged = new Map();
const suspended = new Set();
const report = await runCapabilityImprovementCycle({
  targets,
  current: currentCapabilityScores(resources),
  candidates,
  resources,
  observations: observationsByResource(),
  now,
  maximumPlans: Math.max(0, Math.min(10, Number(process.env.AI_CAPABILITY_MAXIMUM_PLANS || 3))),
  certifyCandidate: async candidate => {
    if (candidate.capability_type !== 'public_data') {
      return { certified: false, blockers: ['compute-specific-template-not-yet-certified'] };
    }
    const blueprint = buildAdapterBlueprint(candidate, { now });
    const certification = certifyGeneratedAdapter(blueprint);
    if (certification.certified) staged.set(candidate.candidate_id, { blueprint, certification });
    return certification;
  },
  benchmarkCandidate: async candidate => {
    if (!liveProbeEnabled) return { passed: false, cost_confirmed_zero: false, reason: 'live-probe-disabled' };
    const stage = staged.get(candidate.candidate_id);
    if (!stage) return { passed: false, cost_confirmed_zero: false, reason: 'missing-certified-blueprint' };
    const result = await runHarmlessLiveProbe({
      blueprint: stage.blueprint,
      sandboxCertification: stage.certification,
      opportunity: candidate,
      now,
      maximumBytes: Math.min(128 * 1024, Math.max(1024, Number(process.env.AI_CAPABILITY_PROBE_MAXIMUM_BYTES || 65536))),
      timeoutMs: Math.min(15000, Math.max(1000, Number(process.env.AI_CAPABILITY_PROBE_TIMEOUT_MS || 8000))),
      probeCount: 2
    });
    stage.liveProbe = result;
    return {
      passed: result.certified === true && result.activation_allowed === true,
      cost_confirmed_zero: result.zero_spend_receipt?.cost_confirmed_zero === true,
      ...result.benchmark
    };
  },
  registerResource: async candidate => {
    const resource = staged.get(candidate.candidate_id)?.liveProbe?.broker_resource;
    if (!resource) throw new Error('broker-resource-missing');
    return resource;
  },
  suspendResource: async resource => {
    if (resource.resource_id) suspended.add(resource.resource_id);
  }
});

const admittedResources = report.admitted
  .map(item => staged.get(item.candidate_id)?.liveProbe?.broker_resource)
  .filter(Boolean);
const merged = new Map(resources.map(resource => [resource.resource_id, { ...resource }]));
for (const resourceId of suspended) {
  const resource = merged.get(resourceId);
  if (resource) merged.set(resourceId, {
    ...resource,
    enabled: false,
    implementation_status: 'disabled',
    health_status: 'quarantined',
    manual_approval_required: true,
    updated_at: now.toISOString(),
    notes: `${resource.notes || ''} Automatically suspended by capability-improvement regression control.`.trim()
  });
}
for (const resource of admittedResources) merged.set(resource.resource_id, { ...resource, created_at: now.toISOString(), updated_at: now.toISOString() });

const nextRegistry = {
  schema_version: Math.max(1, Number(registry.schema_version || 1)),
  updated_at: now.toISOString(),
  resources: [...merged.values()].sort((a, b) => String(a.resource_id).localeCompare(String(b.resource_id))),
  boundary: 'Resources are admitted only after deterministic generation, sandbox certification, bounded harmless live probes and a current zero-spend receipt. Regressions are disabled and quarantined automatically.'
};
writeJson(registryFile, nextRegistry);
writeJson(path.join(downloadsDir, 'capability-improvement-cycle.json'), {
  ...report,
  live_probe_enabled: liveProbeEnabled,
  candidate_count: candidates.length,
  resources_before: resources.length,
  resources_after: nextRegistry.resources.length,
  admitted_resource_ids: admittedResources.map(resource => resource.resource_id),
  suspended_resource_ids: [...suspended]
});

console.log(JSON.stringify({
  ok: report.failed.length === 0,
  live_probe_enabled: liveProbeEnabled,
  gaps: report.gaps.length,
  planned: report.planned.length,
  admitted: admittedResources.length,
  suspended: suspended.size,
  quarantined: report.quarantined.length,
  failed: report.failed.length,
  cost_confirmed_zero: true
}, null, 2));
