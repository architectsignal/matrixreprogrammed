import assert from 'node:assert/strict';
import {
  AutonomyWatchdog,
  CapabilityGapDetector,
  HumanDependencyLedger,
  MatrixEvolutionDirector,
  MatrixSiteOperator,
  TechnologyEvolutionDirector,
  buildCapabilitySelfModel,
  calculateAutomationReadiness
} from '../ai-management/matrix-core/matrix-evolution-director.mjs';

const graph = buildCapabilitySelfModel([
  { componentId: 'search', state: 'LIVE_WORKING', capacityUnits: 10, reliability: 1, dependencies: ['index'], healthEvidence: ['real-query-receipt'], implementation: 'search.js' },
  { componentId: 'value', state: 'SIMULATION_ONLY', capacityUnits: 1, reliability: 1, blocker: 'No reconciled external receipt.', implementation: 'value.js' }
]);
assert.equal(graph.length, 2);
assert.equal(graph[0].status, 'LIVE_WORKING');
assert.equal(graph[0].capability_expansion_grants_authority, false);

const gaps = new CapabilityGapDetector().detect({ requirements: ['search', 'value', 'missing'], capabilities: graph });
assert.deepEqual(gaps.map(item => item.capability_id), ['value', 'missing']);

const human = new HumanDependencyLedger().analyze([
  { dependencyId: 'daily-copy', actionRequired: 'Copy a daily report', reason: 'Automation is absent.', recurrence: 'daily', technicallyAutomatable: true },
  { dependencyId: 'kyc', actionRequired: 'Complete provider KYC', reason: 'Identity proof is required.', recurrence: 'per-provider', technicallyAutomatable: false, status: 'owner-only' }
]);
assert.equal(human.automatable_open_count, 1);
assert.equal(human.owner_only_count, 1);
assert.equal(human.automation_missions[0].priority, 90);

const site = new MatrixSiteOperator().evaluate([
  { surfaceId: 'home', route: '/', configured: true, statusCode: 200, bytes: 500, contentType: 'text/html', minimumBytes: 100 },
  { surfaceId: 'forum', route: '/forum.html', configured: true, statusCode: 500, bytes: 0, contentType: 'text/plain', minimumBytes: 100 },
  { surfaceId: 'payment', route: '/membership.html', configured: false }
], '2026-08-13T12:00:00.000Z');
assert.equal(site.working, 1);
assert.equal(site.failures.length, 2);
assert.equal(site.all_working, false);

const evolution = new MatrixEvolutionDirector().inspect({
  broken_pages: [{ id: 'forum', reason: 'HTTP 500', severity: 95 }],
  failed_searches: [{ id: 'query-1', reason: 'No useful evidence found.' }],
  manual_dependencies: human.automation_missions
}, '2026-08-13T12:00:00.000Z');
assert.equal(evolution.improvements.length, 3);
assert.equal(evolution.improvements[0].domain, 'broken_pages');
assert.equal(evolution.production_self_deploy, false);

const technology = new TechnologyEvolutionDirector();
assert.equal(technology.evaluate({ zeroSpend: true, licenceAllowed: true, currentTermsVerified: true, sandboxPassed: true, testsPassed: true, benchmarkImproved: true, securityPassed: true, rollbackReady: true, canaryPassed: true }).stage, 'ADOPTED');
assert.equal(technology.evaluate({ zeroSpend: true }).stage, 'UNTRUSTED');
assert.equal(technology.evaluate({ zeroSpend: true }).production_self_deploy, false);

const watchdog = new AutonomyWatchdog().assess({ missionsProgressing: true, resourceHunterWorking: true, learningChangesDecisions: false, architectProducingImprovements: true, valueHunterPursuing: true, technologyEvolutionOperating: true, queuesStalled: false });
assert.equal(watchdog.event, 'AUTONOMY_STALL');
assert.equal(watchdog.recovery_mission_required, true);

const readiness = calculateAutomationReadiness([
  { id: 'site', status: 'LIVE_WORKING' },
  { id: 'self-improvement', status: 'PARTIAL' },
  { id: 'value', status: 'SIMULATION_ONLY' },
  { id: 'deployment', status: 'EXTERNAL_BLOCKED' }
]);
assert.equal(readiness.percent, 50);
assert.equal(readiness.complete_automation_claim_allowed, false);

console.log('Matrix continuous-evolution contract passed: self-model, gap detection, human-dependency conversion, site probes, ranked evolution, staged technology, watchdog and truthful readiness.');
