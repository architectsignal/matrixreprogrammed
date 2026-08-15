import { MATRIX_LAW, MATRIX_LAW_SHA256, evaluateDelegatedAction } from './matrix-constitution.mjs';

export const MATRIX_MISSION_TYPES = Object.freeze([
  'PRIMARY_OBJECTIVE', 'RECOVERY_MISSION', 'SYSTEMIC_FAILURE_MISSION',
  'AUTONOMY_STALL', 'CAPABILITY_STAGNATION_MISSION', 'CAPABILITY_GAP_MISSION',
  'RESOURCE_EXPANSION_MISSION', 'TECHNOLOGY_EVALUATION_MISSION'
]);

export const TRUTHFUL_COMPONENT_STATES = Object.freeze([
  'LIVE_WORKING', 'WORKING_NOT_LIVE', 'PARTIAL', 'BLOCKED', 'BROKEN', 'SIMULATION_ONLY', 'DISABLED'
]);

const STATE_FACTOR = Object.freeze({ LIVE_WORKING: 1, WORKING_NOT_LIVE: 0.75, PARTIAL: 0.5, SIMULATION_ONLY: 0.35, BLOCKED: 0.15, DISABLED: 0.05, BROKEN: 0 });

function text(value, maximum = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function round(value, digits = 3) { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function slug(value, maximum = 80) { return text(value, maximum).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mission'; }

export function computeCapabilityMetrics(components = [], history = [], { now = Date.now() } = {}) {
  const normalized = (Array.isArray(components) ? components : []).map(item => {
    const state = TRUTHFUL_COMPONENT_STATES.includes(item.state) ? item.state : 'BROKEN';
    const raw = Math.max(0, finite(item.capacityUnits, 1));
    const reliability = Math.max(0, Math.min(1, finite(item.reliability, state === 'LIVE_WORKING' ? 1 : 0)));
    const factor = STATE_FACTOR[state];
    return { component_id: text(item.componentId || item.component_id, 120), state, capacity_units: raw, reliability, effective_units: round(raw * factor * reliability) };
  });
  const rawPower = normalized.reduce((sum, item) => sum + item.capacity_units, 0);
  const effectivePower = normalized.reduce((sum, item) => sum + item.effective_units, 0);
  const capabilityIndex = rawPower > 0 ? round(100 * effectivePower / rawPower, 2) : 0;
  const sorted = [...(Array.isArray(history) ? history : [])].sort((a, b) => Date.parse(b.recordedAt || b.recorded_at || 0) - Date.parse(a.recordedAt || a.recorded_at || 0));
  const windowValue = hours => {
    const referenceTime = typeof now === 'string' ? Date.parse(now) : now instanceof Date ? now.getTime() : Number(now);
    const limit = (Number.isFinite(referenceTime) ? referenceTime : Date.now()) - hours * 60 * 60 * 1000;
    const record = sorted.find(item => Date.parse(item.recordedAt || item.recorded_at || 0) <= limit);
    return record ? finite(record.effectivePower ?? record.effective_power) : effectivePower;
  };
  const current24 = windowValue(24);
  const dailyEvolutionScore = current24 > 0 ? round(100 * (effectivePower - current24) / current24, 3) : effectivePower > 0 ? 100 : 0;
  return {
    matrix_capability_index: capabilityIndex,
    matrix_effective_power: round(effectivePower),
    raw_capacity_units: round(rawPower),
    daily_evolution_score: dailyEvolutionScore,
    windows: { current: round(effectivePower), hours_24: round(current24), days_7: round(windowValue(24 * 7)), days_30: round(windowValue(24 * 30)), days_90: round(windowValue(24 * 90)), lifetime_high: round(Math.max(effectivePower, ...sorted.map(item => finite(item.effectivePower ?? item.effective_power)))) },
    components: normalized
  };
}

export function classifyLearningEffect(input = {}) {
  const before = input.before ?? null;
  const after = input.after ?? null;
  const changed = stable(before) !== stable(after);
  return {
    classification: changed ? 'LEARNING' : 'TELEMETRY',
    changed_future_decision: changed,
    before,
    observation: input.observation ?? null,
    after,
    expected_result: input.expectedResult ?? null,
    actual_result: input.actualResult ?? null,
    no_change_is_not_learning: true
  };
}

export function retryLadder(input = {}) {
  const available = Array.isArray(input.availableRoutes) ? input.availableRoutes : [];
  return [
    { stage: 'same-capability-retry', eligible: input.retryable !== false },
    { stage: 'alternate-adapter', eligible: available.includes('adapter') },
    { stage: 'alternate-resource', eligible: available.includes('resource') },
    { stage: 'alternate-model', eligible: available.includes('model') },
    { stage: 'decompose-mission', eligible: true },
    { stage: 'safe-degraded-result', eligible: true },
    { stage: 'record-exact-blocker', eligible: true }
  ];
}

export function buildOperatingMission(input = {}, date = new Date().toISOString().slice(0, 10)) {
  const missionType = MATRIX_MISSION_TYPES.includes(input.missionType) ? input.missionType : 'CAPABILITY_GAP_MISSION';
  const objective = text(input.objective, 1000);
  const reason = text(input.reason, 1000);
  const key = text(input.key || objective || reason, 180);
  return {
    mission_id: `ops-${date}-${slug(missionType, 50)}-${slug(key, 70)}`,
    mission_type: missionType,
    objective,
    reason,
    priority: Math.max(0, Math.min(100, Math.trunc(finite(input.priority, 50)))),
    requirements: Array.isArray(input.requirements) ? input.requirements : [],
    resources: Array.isArray(input.resources) ? input.resources : [],
    expected_mission_value: finite(input.expectedMissionValue),
    expected_financial_value_minor: Math.max(0, Math.trunc(finite(input.expectedFinancialValueMinor))),
    risk_domains: Array.isArray(input.riskDomains) ? input.riskDomains : [],
    required_permissions: Array.isArray(input.requiredPermissions) ? input.requiredPermissions : [],
    dependencies: Array.isArray(input.dependencies) ? input.dependencies : [],
    success_definition: text(input.successDefinition || 'A measured, evidenced result changes future action without weakening the Matrix law.', 1000),
    status: 'queued',
    results: {},
    learning: {},
    retry_ladder: retryLadder(input)
  };
}

export function allocateWork({ stagnationDays = 0, missionUnits = 100 } = {}) {
  const evolutionShare = Number(stagnationDays) >= 1 ? 0.1 : 0;
  return {
    primary_mission_units: Math.round(missionUnits * (1 - evolutionShare)),
    capability_evolution_units: Math.round(missionUnits * evolutionShare),
    ratio: evolutionShare ? '90/10' : '100/0',
    stagnation_detected: evolutionShare > 0
  };
}

export function planOperatingCycle(input = {}) {
  const now = input.now || new Date().toISOString();
  const date = now.slice(0, 10);
  const missions = [];
  const failedCycles = Array.isArray(input.failedCycles) ? input.failedCycles : [];
  const missing = Array.isArray(input.missingCapabilities) ? input.missingCapabilities : [];
  const blockers = Array.isArray(input.blockedDependencies) ? input.blockedDependencies : [];
  const stalled = Math.max(0, finite(input.stalledQueueCount));
  const stagnationDays = Math.max(0, finite(input.stagnationDays));

  for (const failure of failedCycles.slice(0, 20)) missions.push(buildOperatingMission({ missionType: 'RECOVERY_MISSION', key: failure.id, objective: `Recover failed cycle ${text(failure.id, 160)}`, reason: text(failure.reason), priority: 90, requirements: ['preserve-state', 'retry-idempotently'], resources: [failure.id], successDefinition: 'The failed cycle completes or produces a narrower exact blocker with preserved state.', availableRoutes: ['adapter', 'resource', 'model'] }, date));
  if (failedCycles.length >= 3) missions.push(buildOperatingMission({ missionType: 'SYSTEMIC_FAILURE_MISSION', key: 'repeated-cycle-failures', objective: 'Eliminate the shared cause of repeated cycle failures', reason: `${failedCycles.length} failures were observed in the bounded health window.`, priority: 100, requirements: ['root-cause-evidence', 'regression-test', 'rollback-ready'], successDefinition: 'The common fault is reproduced, repaired and passes regression without hiding failed records.' }, date));
  if (stalled > 0) missions.push(buildOperatingMission({ missionType: 'AUTONOMY_STALL', key: 'stalled-queue', objective: 'Unblock the automated mission queue safely', reason: `${stalled} queued or leased unit(s) exceed the stall threshold.`, priority: 95, requirements: ['lease-recovery', 'owner-dependency-separation'], successDefinition: 'Every stalled unit resumes, safely degrades, or exposes one exact external dependency.' }, date));
  for (const item of missing.slice(0, 20)) missions.push(buildOperatingMission({ missionType: 'CAPABILITY_GAP_MISSION', key: item.id || item, objective: `Close capability gap: ${text(item.label || item.id || item)}`, reason: text(item.reason || 'Required capability is not live-working.'), priority: finite(item.priority, 70), requirements: ['zero-spend-first', 'benchmark-on-real-workload', 'truthful-state'], resources: [item.id || item], successDefinition: 'The capability is benchmarked on a real eligible workload and its state is updated from evidence.' }, date));
  for (const item of blockers.slice(0, 20)) missions.push(buildOperatingMission({ missionType: 'RECOVERY_MISSION', key: item.id || item, objective: `Resolve dependency: ${text(item.label || item.id || item)}`, reason: text(item.reason || 'Dependency is blocked.'), priority: finite(item.priority, 80), requirements: ['exact-blocker', 'safe-alternative', 'preserve-owner-control'], resources: [item.id || item], successDefinition: 'A lawful automated alternative succeeds or the owner receives exact minimal steps.' }, date));
  if (stagnationDays >= 1) {
    missions.push(buildOperatingMission({ missionType: 'CAPABILITY_STAGNATION_MISSION', key: 'daily-stagnation', objective: 'Restore measured capability growth', reason: `${stagnationDays} day(s) without positive effective-power growth.`, priority: 85, requirements: ['technology-scan', 'resource-scan', 'real-benchmark', 'no-authority-expansion'], successDefinition: 'At least one benchmarked capability improves effective power without authority expansion.' }, date));
    missions.push(buildOperatingMission({ missionType: 'RESOURCE_EXPANSION_MISSION', key: 'zero-spend-real-workload', objective: 'Discover and benchmark additional lawful zero-spend capacity', reason: 'Capability evolution is stagnant and requires measured resource expansion.', priority: 75, requirements: ['official-current-terms', 'licence-proof', 'privacy-proof', 'zero-cost-proof', 'real-workload-receipt'], dependencies: ['Opportunity Hunter', 'Resource Broker'], successDefinition: 'A candidate passes current policy and a real eligible workload receipt before capacity is counted.' }, date));
    missions.push(buildOperatingMission({ missionType: 'TECHNOLOGY_EVALUATION_MISSION', key: 'emerging-capability-scan', objective: 'Evaluate an emerging tool, model or method in protected staging', reason: 'Capability evolution is stagnant and technology coverage should be re-evaluated.', priority: 70, requirements: ['zero-spend', 'licence', 'privacy', 'tests', 'security', 'benchmark', 'rollback', 'protected-release'], dependencies: ['MatrixTechnologyDirector', 'MatrixArchitectDirector'], successDefinition: 'A candidate is rejected with evidence or staged after tests and a measured improvement; it cannot self-deploy or expand authority.' }, date));
  }

  const deduped = [...new Map(missions.map(item => [item.mission_id, item])).values()].sort((a, b) => b.priority - a.priority || a.mission_id.localeCompare(b.mission_id));
  return {
    law: MATRIX_LAW,
    law_sha256: MATRIX_LAW_SHA256,
    generated_at: now,
    missions: deduped,
    allocation: allocateWork({ stagnationDays, missionUnits: finite(input.missionUnits, 100) }),
    no_silent_stop: true,
    capability_expansion_grants_authority: false
  };
}

export function brokerMatrixAction(input = {}, delegations = []) {
  return evaluateDelegatedAction(input, delegations);
}

export class MatrixMissionDirector {
  plan(input) { return planOperatingCycle(input); }
}

export class MatrixCapabilityGraph {
  measure(components, history) { return computeCapabilityMetrics(components, history); }
}

export class MatrixLearningDirector {
  classify(contract) { return classifyLearningEffect(contract); }
}

export class MatrixResourceDirector {
  qualify(candidate = {}) {
    const benchmark = candidate.realWorkloadBenchmark || {};
    const blockers = [];
    if (candidate.costConfirmedZero !== true || candidate.paidFallbackPossible !== false) blockers.push('zero-spend-not-proven');
    if (candidate.licenceAllowed !== true || candidate.currentTermsVerified !== true) blockers.push('licence-or-terms-not-proven');
    if (candidate.privacyPassed !== true || candidate.publicWorkloadsOnly !== true) blockers.push('privacy-or-scope-not-proven');
    if (benchmark.success !== true || !text(benchmark.receiptHash, 100)) blockers.push('real-workload-benchmark-required');
    return { counted_as_capability: blockers.length === 0, state: blockers.length ? 'CANDIDATE' : 'WORKING_NOT_LIVE', blockers };
  }
}

export class MatrixValueDirector {
  realized(receipts = []) {
    const eligible = (Array.isArray(receipts) ? receipts : []).filter(item => item.reconciled === true && item.finalized !== false && item.externalReceiptReference);
    return { received_reconciled_minor: eligible.reduce((sum, item) => sum + Math.max(0, Math.trunc(finite(item.netAmountMinor))), 0), counted_receipts: eligible.length, discovered_or_pending_counted: false };
  }
}

export class MatrixArchitectDirector {
  evaluateCodeProposal(proposal = {}) {
    const blockers = [];
    if (proposal.testsPassed !== true) blockers.push('tests-required');
    if (proposal.securityPassed !== true) blockers.push('security-gate-required');
    if (proposal.benchmarkImproved !== true) blockers.push('measured-improvement-required');
    if (proposal.rollbackReady !== true) blockers.push('rollback-required');
    if (proposal.changesConstitution === true || proposal.expandsAuthority === true) blockers.push('constitutional-or-authority-change-prohibited');
    return { state: blockers.length ? 'QUARANTINED' : 'STAGED_FOR_PROTECTED_RELEASE', blockers, production_self_deploy: false };
  }
}

export class MatrixTechnologyDirector {
  evaluate(candidate = {}) {
    const architect = new MatrixArchitectDirector();
    const result = architect.evaluateCodeProposal(candidate);
    if (candidate.zeroSpend !== true) result.blockers.push('zero-spend-required');
    if (candidate.licenceAllowed !== true) result.blockers.push('licence-required');
    return { ...result, state: result.blockers.length ? 'QUARANTINED' : 'STAGED_FOR_PROTECTED_RELEASE', reversible_evaluation_only: true };
  }
}

export class MatrixHealthDirector {
  assess(input) { return planOperatingCycle(input); }
}

export class MatrixBootDirector {
  sequence(manifest = {}) {
    const required = Array.isArray(manifest.required_boot_order) ? manifest.required_boot_order : [];
    return { law_first: required[0] === 'matrix-constitution', ordered_components: required, immediate_cycle_required: true, watchdog_required: true };
  }
}
