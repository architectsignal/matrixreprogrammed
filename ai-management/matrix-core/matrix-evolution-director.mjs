import { MATRIX_LAW, MATRIX_LAW_SHA256 } from './matrix-constitution.mjs';

export const TECHNOLOGY_STAGES = Object.freeze([
  'UNTRUSTED', 'SANDBOX', 'TESTED', 'BENCHMARKED', 'SECURITY_TESTED', 'CANARY', 'ADOPTED', 'REJECTED'
]);

export const EVOLUTION_SIGNAL_DOMAINS = Object.freeze([
  'failed_jobs', 'slow_jobs', 'failed_searches', 'bad_answers', 'user_friction', 'broken_pages',
  'source_failures', 'model_failures', 'resource_failures', 'manual_dependencies', 'test_gaps',
  'security_findings', 'architecture_debt', 'new_technology'
]);

const DOMAIN_PRIORITY = Object.freeze({
  security_findings: 100,
  broken_pages: 95,
  bad_answers: 92,
  failed_jobs: 90,
  source_failures: 88,
  model_failures: 86,
  resource_failures: 84,
  failed_searches: 82,
  user_friction: 80,
  test_gaps: 78,
  manual_dependencies: 76,
  slow_jobs: 72,
  architecture_debt: 70,
  new_technology: 60
});

function clean(value, maximum = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function list(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === false || value === 0) return [];
  if (typeof value === 'number') return Array.from({ length: Math.min(100, Math.max(0, Math.trunc(value))) }, (_, index) => ({ id: `${index + 1}` }));
  return [value];
}

function slug(value, maximum = 100) {
  return clean(value, maximum).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unclassified';
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function arrays(value) {
  return Array.isArray(value) ? value.map(item => clean(item, 200)).filter(Boolean) : [];
}

export function buildCapabilitySelfModel(components = [], existing = []) {
  const prior = new Map((Array.isArray(existing) ? existing : []).map(item => [item.capability_id || item.capabilityId, item]));
  return (Array.isArray(components) ? components : []).map(component => {
    const capabilityId = clean(component.componentId || component.component_id, 180);
    const old = prior.get(capabilityId) || {};
    const live = component.state === 'LIVE_WORKING';
    return {
      capability_id: capabilityId,
      purpose: clean(old.purpose || component.purpose || `Operate ${capabilityId}`, 500),
      status: clean(component.state || old.status || 'UNTESTED', 40).toUpperCase(),
      quality: Math.max(0, Math.min(100, finite(component.quality ?? old.quality, live ? 100 : 50))),
      throughput: Math.max(0, finite(component.throughput ?? old.throughput ?? component.capacityUnits ?? component.capacity_units)),
      dependencies: arrays(component.dependencies ?? old.dependencies),
      models: arrays(component.models ?? old.models),
      tools: arrays(component.tools ?? old.tools ?? [component.implementation]),
      resources: arrays(component.resources ?? old.resources),
      tests: arrays(component.healthEvidence ?? component.health_evidence ?? old.tests),
      last_success: component.lastVerifiedAt || component.last_verified_at || old.last_success || null,
      last_failure: old.last_failure || null,
      known_limitations: arrays(component.knownLimitations ?? old.known_limitations ?? (component.blocker ? [component.blocker] : [])),
      human_dependencies: arrays(component.humanDependencies ?? old.human_dependencies),
      upgrade_candidates: arrays(component.upgradeCandidates ?? old.upgrade_candidates),
      replacement_candidates: arrays(component.replacementCandidates ?? old.replacement_candidates),
      capability_expansion_grants_authority: false
    };
  }).filter(item => item.capability_id);
}

export class CapabilityGapDetector {
  detect({ requirements = [], capabilities = [] } = {}) {
    const graph = new Map((Array.isArray(capabilities) ? capabilities : []).map(item => [clean(item.capability_id || item.capabilityId, 180), item]));
    const required = [...new Set((Array.isArray(requirements) ? requirements : []).map(item => clean(typeof item === 'string' ? item : item.capability_id || item.capabilityId, 180)).filter(Boolean))];
    return required.map(capabilityId => {
      const capability = graph.get(capabilityId);
      const status = clean(capability?.status || 'NOT_CONFIGURED', 40).toUpperCase();
      const quality = finite(capability?.quality);
      const missing = !capability;
      const operational = ['LIVE_WORKING', 'WORKING'].includes(status) && quality >= 60;
      return {
        capability_id: capabilityId,
        status,
        quality,
        gap: missing || !operational,
        reason: missing ? 'Capability is absent from the self-model.' : operational ? null : `Capability is ${status} with quality ${quality}; live quality 60 is required.`,
        human_dependencies: arrays(capability?.human_dependencies),
        upgrade_candidates: arrays(capability?.upgrade_candidates),
        replacement_candidates: arrays(capability?.replacement_candidates)
      };
    }).filter(item => item.gap);
  }
}

export class HumanDependencyLedger {
  analyze(dependencies = []) {
    const records = (Array.isArray(dependencies) ? dependencies : []).map(item => ({
      dependency_id: clean(item.dependency_id || item.dependencyId || `human-${slug(item.action_required || item.actionRequired || item.reason)}`, 180),
      capability_id: clean(item.capability_id || item.capabilityId, 180) || null,
      action_required: clean(item.action_required || item.actionRequired, 500),
      reason: clean(item.reason, 1000),
      recurrence: clean(item.recurrence || 'one-time', 80),
      technically_automatable: item.technically_automatable === true || item.technicallyAutomatable === true,
      upgrade_needed: clean(item.upgrade_needed || item.upgradeNeeded, 500) || null,
      status: clean(item.status || 'open', 40).toLowerCase()
    })).filter(item => item.dependency_id && item.action_required);
    const automationMissions = records.filter(item => item.status === 'open' && item.technically_automatable).map(item => ({
      id: item.dependency_id,
      label: `Automate human dependency: ${item.action_required}`,
      reason: item.upgrade_needed || item.reason,
      priority: item.recurrence === 'daily' ? 90 : item.recurrence === 'weekly' ? 82 : 75,
      source: 'HumanDependencyLedger'
    }));
    return {
      records,
      automation_missions: automationMissions,
      open_count: records.filter(item => item.status !== 'resolved').length,
      automatable_open_count: automationMissions.length,
      owner_only_count: records.filter(item => item.status !== 'resolved' && !item.technically_automatable).length
    };
  }
}

export class MatrixSiteOperator {
  evaluate(probes = [], now = new Date().toISOString()) {
    const checks = (Array.isArray(probes) ? probes : []).map(probe => {
      const statusCode = Math.trunc(finite(probe.statusCode ?? probe.status));
      const minimumBytes = Math.max(0, Math.trunc(finite(probe.minimumBytes, 100)));
      const bytes = Math.max(0, Math.trunc(finite(probe.bytes)));
      const contentType = clean(probe.contentType, 120).toLowerCase();
      const expectedContent = clean(probe.expectedContentType || 'text/html', 80).toLowerCase();
      const configured = probe.configured !== false;
      const blockers = [];
      if (!configured) blockers.push('surface-not-configured');
      if (configured && (statusCode < 200 || statusCode >= 400)) blockers.push(`unexpected-http-status-${statusCode || 'missing'}`);
      if (configured && bytes < minimumBytes) blockers.push('response-below-minimum-size');
      if (configured && expectedContent && !contentType.includes(expectedContent)) blockers.push('unexpected-content-type');
      return {
        surface_id: clean(probe.surfaceId || probe.surface_id, 180),
        route: clean(probe.route, 500),
        state: !configured ? 'NOT_CONFIGURED' : blockers.length ? 'BROKEN' : 'WORKING',
        status_code: statusCode || null,
        response_bytes: bytes,
        latency_ms: Math.max(0, finite(probe.latencyMs ?? probe.latency_ms)),
        blockers,
        checked_at: now
      };
    });
    return {
      checks,
      failures: checks.filter(item => item.state !== 'WORKING'),
      working: checks.filter(item => item.state === 'WORKING').length,
      total: checks.length,
      all_working: checks.length > 0 && checks.every(item => item.state === 'WORKING')
    };
  }
}

export class TechnologyEvolutionDirector {
  evaluate(candidate = {}) {
    const gates = {
      zero_spend: candidate.zeroSpend === true,
      licence: candidate.licenceAllowed === true && candidate.currentTermsVerified === true,
      sandbox: candidate.sandboxPassed === true,
      tests: candidate.testsPassed === true,
      benchmark: candidate.benchmarkImproved === true,
      security: candidate.securityPassed === true,
      rollback: candidate.rollbackReady === true,
      canary: candidate.canaryPassed === true
    };
    const blockers = Object.entries(gates).filter(([, passed]) => !passed).map(([gate]) => `${gate}-gate-required`);
    let stage = 'UNTRUSTED';
    if (gates.zero_spend && gates.licence) stage = 'SANDBOX';
    if (stage === 'SANDBOX' && gates.sandbox && gates.tests) stage = 'TESTED';
    if (stage === 'TESTED' && gates.benchmark) stage = 'BENCHMARKED';
    if (stage === 'BENCHMARKED' && gates.security && gates.rollback) stage = 'SECURITY_TESTED';
    if (stage === 'SECURITY_TESTED') stage = 'CANARY';
    if (stage === 'CANARY' && gates.canary) stage = 'ADOPTED';
    if (candidate.rejected === true) stage = 'REJECTED';
    return { stage, gates, blockers: stage === 'ADOPTED' || stage === 'REJECTED' ? [] : blockers, production_self_deploy: false, capability_expansion_grants_authority: false };
  }
}

export class MatrixEvolutionDirector {
  inspect(signals = {}, now = new Date().toISOString()) {
    const improvements = [];
    for (const domain of EVOLUTION_SIGNAL_DOMAINS) {
      for (const [index, raw] of list(signals[domain]).entries()) {
        const item = raw && typeof raw === 'object' ? raw : { detail: raw };
        const detail = clean(item.detail || item.reason || item.error || item.label || item.id || `${domain} signal ${index + 1}`, 1000);
        const severity = Math.max(0, Math.min(100, finite(item.severity, DOMAIN_PRIORITY[domain])));
        improvements.push({
          improvement_id: `evolution-${slug(domain, 40)}-${slug(item.id || detail, 100)}`,
          domain,
          objective: clean(item.objective || `Resolve ${domain.replace(/_/g, ' ')}: ${detail}`, 1000),
          reason: detail,
          priority: severity,
          required_capability: clean(item.required_capability || item.capability_id || `evolution-${domain.replace(/_/g, '-')}`, 180),
          protected_pipeline_required: true,
          consequential_execution_allowed: false,
          generated_at: now
        });
      }
    }
    return {
      law: MATRIX_LAW,
      law_sha256: MATRIX_LAW_SHA256,
      improvements: [...new Map(improvements.map(item => [item.improvement_id, item])).values()].sort((a, b) => b.priority - a.priority || a.improvement_id.localeCompare(b.improvement_id)).slice(0, 50),
      signals_inspected: Object.fromEntries(EVOLUTION_SIGNAL_DOMAINS.map(domain => [domain, list(signals[domain]).length])),
      production_self_deploy: false
    };
  }
}

export class AutonomyWatchdog {
  assess({ missionsProgressing, resourceHunterWorking, learningChangesDecisions, architectProducingImprovements, valueHunterPursuing, technologyEvolutionOperating, queuesStalled } = {}) {
    const stalled = queuesStalled === true || [missionsProgressing, resourceHunterWorking, learningChangesDecisions, architectProducingImprovements, valueHunterPursuing, technologyEvolutionOperating].some(value => value === false);
    return { stalled, event: stalled ? 'AUTONOMY_STALL' : 'AUTONOMY_HEALTHY', recovery_mission_required: stalled, law: MATRIX_LAW };
  }
}

export function calculateAutomationReadiness(requirements = []) {
  const weights = { LIVE_WORKING: 1, IMPLEMENTED_LOCAL: 0.8, PARTIAL: 0.5, SIMULATION_ONLY: 0.3, EXTERNAL_BLOCKED: 0.2, NOT_CONFIGURED: 0, BROKEN: 0, UNTESTED: 0 };
  const records = (Array.isArray(requirements) ? requirements : []).map(item => ({ ...item, status: clean(item.status || 'UNTESTED', 40).toUpperCase() }));
  const earned = records.reduce((sum, item) => sum + (weights[item.status] ?? 0), 0);
  return {
    percent: records.length ? Math.round(1000 * earned / records.length) / 10 : 0,
    total_requirements: records.length,
    status_counts: records.reduce((result, item) => ({ ...result, [item.status]: (result[item.status] || 0) + 1 }), {}),
    complete_automation_claim_allowed: records.length > 0 && records.every(item => item.status === 'LIVE_WORKING'),
    no_false_success: true
  };
}

export const matrixEvolutionInternals = { DOMAIN_PRIORITY, clean, list, slug, finite, arrays };
