import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATRIX_LAW, MATRIX_LAW_SHA256, MatrixDelegatedActionBroker, MatrixPolicyEngine, OwnerDelegationVault, evaluateDelegatedAction, evaluateMatrixAction, immutableLawRecord } from '../ai-management/matrix-core/matrix-constitution.mjs';
import { MatrixArchitectDirector, MatrixBootDirector, MatrixCapabilityGraph, MatrixHealthDirector, MatrixLearningDirector, MatrixMissionDirector, MatrixResourceDirector, MatrixTechnologyDirector, MatrixValueDirector, allocateWork, buildOperatingMission, classifyLearningEffect, computeCapabilityMetrics, planOperatingCycle } from '../ai-management/matrix-core/matrix-operating-system.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

assert.equal(MATRIX_LAW, 'CAUSE NO HARM OR LOSS.');
assert.equal(MATRIX_LAW_SHA256, '2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189');
assert.equal(immutableLawRecord().immutable, true);
assert.equal(immutableLawRecord().authority_expansion_by_learning, false);
assert.equal(new MatrixPolicyEngine().constitution.law, MATRIX_LAW);

const safeInternal = evaluateMatrixAction({ consequenceClass: 'REVERSIBLE_INTERNAL', authorized: true, boundedScope: true, simulationPassed: true, rollbackReady: true });
assert.equal(safeInternal.allowed, true);
const override = evaluateMatrixAction({ consequenceClass: 'INTERNAL_ANALYSIS', constitutionalOverride: true });
assert.equal(override.decision, 'BLOCKED');
assert.ok(override.blockers.includes('constitutional-override-prohibited'));
const unsafeFinancial = evaluateMatrixAction({ consequenceClass: 'FINANCIAL', authorized: true, boundedScope: true, simulationPassed: true, rollbackReady: true, destinationApproved: false, maximumLossMinor: 1 });
assert.equal(unsafeFinancial.allowed, false);
assert.ok(unsafeFinancial.blockers.includes('approved-financial-destination-required'));
assert.ok(unsafeFinancial.blockers.includes('unauthorized-financial-loss'));
const destructive = evaluateMatrixAction({ consequenceClass: 'DESTRUCTIVE', authorized: true, boundedScope: true, simulationPassed: true, rollbackReady: true });
assert.equal(destructive.decision, 'BLOCKED');
assert.equal(evaluateMatrixAction({ consequenceClass: 'INTERNAL_ANALYSIS', riskDomains: ['physical'] }).decision, 'BLOCKED');

const delegation = [{
  delegationId: 'internal-v1', active: true, startsAt: '2026-01-01T00:00:00.000Z', expiresAt: null,
  allowedActions: ['CREATE_INTERNAL_MISSION'], allowedScopes: ['matrix-internal'],
  allowedConsequenceClasses: ['REVERSIBLE_INTERNAL'], maximumAmountMinor: 0
}];
const delegated = evaluateDelegatedAction({ actionType: 'CREATE_INTERNAL_MISSION', consequenceClass: 'REVERSIBLE_INTERNAL', scope: 'matrix-internal', amountMinor: 0, boundedScope: true, simulationPassed: true, rollbackReady: true, now: '2026-08-13T00:00:00.000Z' }, delegation);
assert.equal(delegated.allowed, true);
const authorityExpansion = evaluateDelegatedAction({ actionType: 'TRANSFER_FUNDS', consequenceClass: 'FINANCIAL', scope: 'matrix-internal', amountMinor: 1, boundedScope: true, simulationPassed: true, rollbackReady: true, destinationApproved: true, now: '2026-08-13T00:00:00.000Z' }, delegation);
assert.equal(authorityExpansion.allowed, false);
assert.ok(authorityExpansion.blockers.includes('active-delegation-not-found'));
const attemptedAuthorityExpansion = evaluateDelegatedAction({ actionType: 'CREATE_INTERNAL_MISSION', consequenceClass: 'REVERSIBLE_INTERNAL', scope: 'matrix-internal', amountMinor: 0, boundedScope: true, simulationPassed: true, rollbackReady: true, capabilityExpansionGrantsAuthority: true, now: '2026-08-13T00:00:00.000Z' }, delegation);
assert.equal(attemptedAuthorityExpansion.decision, 'BLOCKED');
assert.ok(attemptedAuthorityExpansion.blockers.includes('capability-expansion-cannot-grant-authority'));
const vault = new OwnerDelegationVault([{ ...delegation[0], rawCredential: 'must-not-survive', secretReference: 'not-a-vault-reference' }]);
assert.equal(vault.active()[0].rawCredential, undefined);
assert.equal(vault.active()[0].secretReference, null);
assert.equal(new MatrixDelegatedActionBroker(new OwnerDelegationVault(delegation)).evaluate({ actionType: 'CREATE_INTERNAL_MISSION', consequenceClass: 'REVERSIBLE_INTERNAL', scope: 'matrix-internal', amountMinor: 0, boundedScope: true, simulationPassed: true, rollbackReady: true, now: '2026-08-13T00:00:00.000Z' }).allowed, true);

const metrics = computeCapabilityMetrics([
  { componentId: 'live', state: 'LIVE_WORKING', capacityUnits: 10, reliability: 1 },
  { componentId: 'partial', state: 'PARTIAL', capacityUnits: 10, reliability: 0.5 },
  { componentId: 'broken', state: 'BROKEN', capacityUnits: 10, reliability: 1 }
], [{ effectivePower: 10, recordedAt: '2026-08-11T00:00:00.000Z' }], { now: '2026-08-13T00:00:00.000Z' });
assert.equal(metrics.matrix_effective_power, 12.5);
assert.equal(metrics.matrix_capability_index, 41.67);
assert.equal(metrics.daily_evolution_score, 25);
assert.equal(metrics.windows.lifetime_high, 12.5);
assert.equal(new MatrixCapabilityGraph().measure([{ componentId: 'live', state: 'LIVE_WORKING', capacityUnits: 1, reliability: 1 }], []).matrix_effective_power, 1);

assert.equal(classifyLearningEffect({ before: { route: 'a' }, after: { route: 'a' } }).classification, 'TELEMETRY');
assert.equal(classifyLearningEffect({ before: { route: 'a' }, after: { route: 'b' } }).classification, 'LEARNING');
assert.equal(allocateWork({ stagnationDays: 1, missionUnits: 100 }).ratio, '90/10');
assert.equal(buildOperatingMission({ missionType: 'RECOVERY_MISSION', objective: 'Retry failed cycle', key: 'x' }, '2026-08-13').status, 'queued');

const plan = planOperatingCycle({
  now: '2026-08-13T12:00:00.000Z',
  failedCycles: [{ id: 'a', reason: 'one' }, { id: 'b', reason: 'two' }, { id: 'c', reason: 'three' }],
  stalledQueueCount: 2,
  stagnationDays: 2,
  missingCapabilities: [{ id: 'resource-hunter', label: 'Resource Hunter', reason: 'No benchmarked worker' }],
  blockedDependencies: [{ id: 'deployment', label: 'Deployment', reason: 'Budget gate' }]
});
for (const type of ['RECOVERY_MISSION', 'SYSTEMIC_FAILURE_MISSION', 'AUTONOMY_STALL', 'CAPABILITY_STAGNATION_MISSION', 'CAPABILITY_GAP_MISSION', 'RESOURCE_EXPANSION_MISSION', 'TECHNOLOGY_EVALUATION_MISSION']) {
  assert.ok(plan.missions.some(item => item.mission_type === type), `missing mission type ${type}`);
}
assert.equal(plan.capability_expansion_grants_authority, false);
assert.equal(plan.no_silent_stop, true);
assert.ok(new MatrixMissionDirector().plan({ failedCycles: [{ id: 'x', reason: 'failed' }] }).missions.length >= 1);
assert.equal(new MatrixLearningDirector().classify({ before: 1, after: 1 }).classification, 'TELEMETRY');
assert.ok(new MatrixHealthDirector().assess({ stalledQueueCount: 1 }).missions.some(item => item.mission_type === 'AUTONOMY_STALL'));
assert.equal(new MatrixResourceDirector().qualify({ costConfirmedZero: true, paidFallbackPossible: false, licenceAllowed: true, currentTermsVerified: true, privacyPassed: true, publicWorkloadsOnly: true, realWorkloadBenchmark: { success: true, receiptHash: 'abc' } }).counted_as_capability, true);
assert.equal(new MatrixResourceDirector().qualify({ costConfirmedZero: true }).counted_as_capability, false);
assert.equal(new MatrixValueDirector().realized([{ reconciled: true, finalized: true, externalReceiptReference: 'receipt://one', netAmountMinor: 100 }, { reconciled: false, externalReceiptReference: 'pending', netAmountMinor: 900 }]).received_reconciled_minor, 100);
assert.equal(new MatrixArchitectDirector().evaluateCodeProposal({ testsPassed: true, securityPassed: true, benchmarkImproved: true, rollbackReady: true }).state, 'STAGED_FOR_PROTECTED_RELEASE');
assert.equal(new MatrixArchitectDirector().evaluateCodeProposal({ testsPassed: true, securityPassed: true, benchmarkImproved: true, rollbackReady: true, expandsAuthority: true }).state, 'QUARANTINED');
assert.equal(new MatrixTechnologyDirector().evaluate({ testsPassed: true, securityPassed: true, benchmarkImproved: true, rollbackReady: true, zeroSpend: true, licenceAllowed: true }).production_self_deploy, false);
assert.equal(new MatrixBootDirector().sequence({ required_boot_order: ['matrix-constitution', 'matrix-event-bus'] }).law_first, true);

const migration = read('migrations/phase17_matrix_operating_system.sql');
for (const marker of [
  "law_text='CAUSE NO HARM OR LOSS.'", 'matrix_constitution_immutable_update', 'matrix_constitution_immutable_delete',
  "RAISE(ABORT,'MATRIX_CONSTITUTION_IMMUTABLE')", 'matrix_operating_missions', 'matrix_capability_snapshots',
  'matrix_daily_baselines', 'matrix_learning_effects', 'matrix_boot_runs', 'matrix_watchdog_events',
  'matrix_delegations', 'matrix_action_receipts', 'CAPABILITY_STAGNATION_MISSION', 'AUTONOMY_STALL',
  'MATRIX_OPERATING_SYSTEM_ENABLED', 'production_self_deploy'
]) assert.ok(migration.includes(marker), `missing Phase 17 marker: ${marker}`);
for (const forbiddenColumn of ['private_key', 'seed_phrase', 'mnemonic', 'recovery_phrase']) {
  assert.equal(new RegExp(`\\b${forbiddenColumn}\\s+(TEXT|BLOB)`, 'i').test(migration), false, `schema must never persist ${forbiddenColumn}`);
}

const manifest = JSON.parse(read('matrix-system-manifest.json'));
assert.equal(manifest.constitutional_law.text, MATRIX_LAW);
assert.equal(manifest.constitutional_law.sha256, MATRIX_LAW_SHA256);
assert.equal(manifest.constitutional_law.immutable, true);
assert.ok(manifest.components.some(item => item.director === 'MatrixMissionDirector'));
assert.ok(manifest.components.some(item => item.director === 'MatrixActionBroker'));
for (const director of ['MatrixCapabilityGraph','MatrixLearningDirector','MatrixResourceDirector','MatrixValueDirector','MatrixPolicyEngine','MatrixDelegatedActionBroker','MatrixHealthDirector','MatrixBootDirector','MatrixArchitectDirector','MatrixTechnologyDirector','OwnerDelegationVault']) {
  assert.ok(manifest.components.some(item => item.director === director), `manifest missing ${director}`);
}
assert.equal(manifest.components.find(item => item.component_id === 'permissionless-value-harvester').state, 'SIMULATION_ONLY');
assert.equal(manifest.components.find(item => item.component_id === 'cloudflare-production-release').state, 'BLOCKED');

const production = read('src/worker-production-autonomy.js');
for (const marker of ['worker-matrix-operations.js', 'isMatrixOperationsRoute', 'runScheduledMatrixOperations', 'livingTask.then(() => runScheduledMatrixOperations', 'matrixOperationsTask']) {
  assert.ok(production.includes(marker), `missing production orchestration marker: ${marker}`);
}
const localCli = read('local-agent/matrix-local.mjs');
assert.ok(localCli.includes("command === 'matrix'"));
assert.ok(read('local-agent/matrix-local-host.mjs').includes("callMatrixControlPlane('start'"));
const toml = read('wrangler.toml');
const jsonc = JSON.parse(read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
for (const flag of ['MATRIX_OPERATING_SYSTEM_ENABLED', 'MATRIX_TECHNOLOGY_EVOLUTION_ENABLED']) {
  assert.ok(toml.includes(`${flag} = "true"`));
  assert.equal(jsonc.vars[flag], 'true');
}

console.log('Matrix operating-system contract passed: immutable law, harm gate, non-expanding delegation, recovery missions, measured evolution, truthful manifest and automatic runtime wiring.');
