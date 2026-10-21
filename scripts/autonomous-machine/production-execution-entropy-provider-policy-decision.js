#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { ProductionChangeRequestStore } = require('./production-change-request-store');
const { ProductionChangeDecisionStore } = require('./production-change-decision-store');
const { ProductionExecutionPlanStore } = require('./production-execution-plan-store');
const { ProductionExecutionPlanDecisionStore } = require('./production-execution-plan-decision-store');
const { ProductionExecutionAuthorisationRequestStore } = require('./production-execution-authorisation-request-store');
const { ProductionExecutionAuthorisationDecisionStore } = require('./production-execution-authorisation-decision-store');
const { ProductionExecutionTokenRequestStore } = require('./production-execution-token-request-store');
const { ProductionExecutionTokenDecisionStore } = require('./production-execution-token-decision-store');
const { ProductionExecutionTokenIssuanceRequestStore } = require('./production-execution-token-issuance-request-store');
const { ProductionExecutionTokenIssuanceDecisionStore } = require('./production-execution-token-issuance-decision-store');
const { ProductionExecutionTokenMaterialGenerationRequestStore } = require('./production-execution-token-material-generation-request-store');
const { ProductionExecutionTokenMaterialGenerationDecisionStore } = require('./production-execution-token-material-generation-decision-store');
const { ProductionExecutionEntropyGenerationRequestStore } = require('./production-execution-entropy-generation-request-store');
const { ProductionExecutionEntropyGenerationDecisionStore } = require('./production-execution-entropy-generation-decision-store');
const { ProductionExecutionEntropySourceSelectionRequestStore } = require('./production-execution-entropy-source-selection-request-store');
const { ProductionExecutionEntropySourceSelectionDecisionStore } = require('./production-execution-entropy-source-selection-decision-store');
const { ProductionExecutionEntropySourceBindingRequestStore } = require('./production-execution-entropy-source-binding-request-store');
const { ProductionExecutionEntropySourceBindingDecisionStore } = require('./production-execution-entropy-source-binding-decision-store');
const { ProductionExecutionEntropyProviderPolicyRequestStore } = require('./production-execution-entropy-provider-policy-request-store');
const { ProductionExecutionEntropyProviderPolicyDecisionStore } = require('./production-execution-entropy-provider-policy-decision-store');
const { decideProductionExecutionEntropyProviderPolicy } = require('./production-execution-entropy-provider-policy-decision-service');

const rootDir = path.resolve(__dirname, '../..');
const runtimeDir = path.join(rootDir, '.autonomous-machine');
const definitions = [
  ['Production change request', ProductionChangeRequestStore, 'production-change-requests.jsonl', 'AIM_CHANGE_REQUEST_SIGNING_KEY'],
  ['Production change decision', ProductionChangeDecisionStore, 'production-change-decisions.jsonl', 'AIM_CHANGE_DECISION_SIGNING_KEY'],
  ['Production execution plan', ProductionExecutionPlanStore, 'production-execution-plans.jsonl', 'AIM_EXECUTION_PLAN_SIGNING_KEY'],
  ['Production execution plan decision', ProductionExecutionPlanDecisionStore, 'production-execution-plan-decisions.jsonl', 'AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY'],
  ['Execution authorisation request', ProductionExecutionAuthorisationRequestStore, 'production-execution-authorisation-requests.jsonl', 'AIM_EXECUTION_AUTHORISATION_REQUEST_SIGNING_KEY'],
  ['Execution authorisation decision', ProductionExecutionAuthorisationDecisionStore, 'production-execution-authorisation-decisions.jsonl', 'AIM_EXECUTION_AUTHORISATION_DECISION_SIGNING_KEY'],
  ['Execution token request', ProductionExecutionTokenRequestStore, 'production-execution-token-requests.jsonl', 'AIM_EXECUTION_TOKEN_REQUEST_SIGNING_KEY'],
  ['Execution token decision', ProductionExecutionTokenDecisionStore, 'production-execution-token-decisions.jsonl', 'AIM_EXECUTION_TOKEN_DECISION_SIGNING_KEY'],
  ['Execution token issuance request', ProductionExecutionTokenIssuanceRequestStore, 'production-execution-token-issuance-requests.jsonl', 'AIM_EXECUTION_TOKEN_ISSUANCE_REQUEST_SIGNING_KEY'],
  ['Execution token issuance decision', ProductionExecutionTokenIssuanceDecisionStore, 'production-execution-token-issuance-decisions.jsonl', 'AIM_EXECUTION_TOKEN_ISSUANCE_DECISION_SIGNING_KEY'],
  ['Token material generation request', ProductionExecutionTokenMaterialGenerationRequestStore, 'production-execution-token-material-generation-requests.jsonl', 'AIM_EXECUTION_TOKEN_MATERIAL_GENERATION_REQUEST_SIGNING_KEY'],
  ['Token material generation decision', ProductionExecutionTokenMaterialGenerationDecisionStore, 'production-execution-token-material-generation-decisions.jsonl', 'AIM_EXECUTION_TOKEN_MATERIAL_GENERATION_DECISION_SIGNING_KEY'],
  ['Entropy generation request', ProductionExecutionEntropyGenerationRequestStore, 'production-execution-entropy-generation-requests.jsonl', 'AIM_EXECUTION_ENTROPY_GENERATION_REQUEST_SIGNING_KEY'],
  ['Entropy generation decision', ProductionExecutionEntropyGenerationDecisionStore, 'production-execution-entropy-generation-decisions.jsonl', 'AIM_EXECUTION_ENTROPY_GENERATION_DECISION_SIGNING_KEY'],
  ['Entropy source selection request', ProductionExecutionEntropySourceSelectionRequestStore, 'production-execution-entropy-source-selection-requests.jsonl', 'AIM_EXECUTION_ENTROPY_SOURCE_SELECTION_REQUEST_SIGNING_KEY'],
  ['Entropy source selection decision', ProductionExecutionEntropySourceSelectionDecisionStore, 'production-execution-entropy-source-selection-decisions.jsonl', 'AIM_EXECUTION_ENTROPY_SOURCE_SELECTION_DECISION_SIGNING_KEY'],
  ['Entropy source binding request', ProductionExecutionEntropySourceBindingRequestStore, 'production-execution-entropy-source-binding-requests.jsonl', 'AIM_EXECUTION_ENTROPY_SOURCE_BINDING_REQUEST_SIGNING_KEY'],
  ['Entropy source binding decision', ProductionExecutionEntropySourceBindingDecisionStore, 'production-execution-entropy-source-binding-decisions.jsonl', 'AIM_EXECUTION_ENTROPY_SOURCE_BINDING_DECISION_SIGNING_KEY'],
];
const stores = new Map(definitions.map(([label, Store, file, env]) => [label, { store: new Store(path.join(runtimeDir, file)), env }]));
const policyRequestStore = new ProductionExecutionEntropyProviderPolicyRequestStore(path.join(runtimeDir, 'production-execution-entropy-provider-policy-requests.jsonl'));
const policyDecisionStore = new ProductionExecutionEntropyProviderPolicyDecisionStore(path.join(runtimeDir, 'production-execution-entropy-provider-policy-decisions.jsonl'));
const auditLog = new AuditLog(path.join(runtimeDir, 'audit.jsonl'));

function option(args, name) { const index = args.indexOf(name); return index === -1 || index === args.length - 1 ? null : args[index + 1]; }
function flag(args, name) { return args.includes(name); }
function requiredEnvironment(name) { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }
function upstreamIntegrityChecks() { return [...stores.entries()].map(([label, item]) => ({ label, store: item.store, signingKey: requiredEnvironment(item.env) })); }
function usage() {
  process.stdout.write([
    'Phase 1.25 signed human decisions for entropy-provider-policy requests', '', 'Commands:',
    '  list', '  show <decision-id-or-request-id>',
    '  decide <provider-policy-request-id> <approve|reject> --reviewer <name> --role <role> --note <reason>',
    '    [--all-reviews-complete]',
    '    [--request-window-reviewed] [--bound-source-class-reviewed]',
    '    [--provider-class-reviewed] [--characteristics-reviewed]',
    '    [--no-provider-reviewed] [--no-implementation-reviewed]',
    '    [--no-library-api-device-syscall-reviewed] [--no-network-external-reviewed]',
    '    [--final-preflight-reviewed] [--scope-reviewed]',
    '    [--backup-evidence-reviewed] [--restore-evidence-reviewed] [--production-owner-reviewed]',
    '  verify', '', 'Approval confirms policy characteristics only.',
    'It cannot select a provider, implementation, library, API, device or syscall, request entropy bytes, edit files, commit, deploy or publish.',
  ].join('\n') + '\n');
}
function verifiedDecisions(signingKey) {
  const verification = policyDecisionStore.verify(signingKey);
  if (!verification.valid) throw new Error(`Entropy provider policy decision ledger verification failed: ${verification.reason}`);
  return policyDecisionStore.readRecords();
}
function run() {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) { usage(); return; }
  const policyRequestSigningKey = requiredEnvironment('AIM_EXECUTION_ENTROPY_PROVIDER_POLICY_REQUEST_SIGNING_KEY');
  const policyDecisionSigningKey = requiredEnvironment('AIM_EXECUTION_ENTROPY_PROVIDER_POLICY_DECISION_SIGNING_KEY');
  if (command === 'verify') { process.stdout.write(`${JSON.stringify(policyDecisionStore.verify(policyDecisionSigningKey), null, 2)}\n`); return; }
  if (command === 'list') {
    const records = verifiedDecisions(policyDecisionSigningKey).map((record) => ({
      id: record.id, providerPolicyRequestId: record.payload.providerPolicyRequest.id,
      decision: record.payload.decision, status: record.payload.status, reviewer: record.payload.reviewer.name,
      remainingSeconds: record.payload.validityReview.remainingSeconds,
      candidateCount: record.payload.finalPreflight.candidates.length,
      operationCount: record.payload.scopeReview.operations.length,
      permittedProviderClass: record.payload.providerPolicy.permittedProviderClass,
      providerSelected: record.payload.providerPolicy.providerSelected,
      implementationSelected: record.payload.providerPolicy.implementationSelected,
      entropyGenerated: record.payload.providerPolicy.entropyGenerated,
      createdAt: record.createdAt, recordHash: record.recordHash,
    }));
    process.stdout.write(`${JSON.stringify(records, null, 2)}\n`); return;
  }
  if (command === 'show') {
    const id = args[0]; if (!id) throw new Error('show requires a decision id or provider-policy request id');
    const record = verifiedDecisions(policyDecisionSigningKey).find((item) => item.id === id || item.payload.providerPolicyRequest.id === id);
    if (!record) throw new Error(`Entropy provider policy decision not found: ${id}`);
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`); return;
  }
  if (command === 'decide') {
    const requestId = args[0]; const decision = args[1];
    if (!requestId || !decision) throw new Error('decide requires provider-policy request id and approve or reject');
    const allReviews = flag(args, '--all-reviews-complete');
    const result = decideProductionExecutionEntropyProviderPolicy({
      entropyProviderPolicyRequestId: requestId,
      entropyProviderPolicyRequestStore: policyRequestStore,
      entropyProviderPolicyDecisionStore: policyDecisionStore,
      auditLog, repositoryRoot: rootDir, upstreamIntegrityChecks: upstreamIntegrityChecks(),
      entropyProviderPolicyRequestSigningKey: policyRequestSigningKey,
      entropyProviderPolicyDecisionSigningKey: policyDecisionSigningKey,
      entropyProviderPolicyDecisionSigningKeyId: process.env.AIM_EXECUTION_ENTROPY_PROVIDER_POLICY_DECISION_SIGNING_KEY_ID || 'production-execution-entropy-provider-policy-decision-key',
      decision, reviewerName: option(args, '--reviewer'), reviewerRole: option(args, '--role'), reviewerNote: option(args, '--note'),
      completedReviews: {
        providerPolicyRequestWindowReview: allReviews || flag(args, '--request-window-reviewed'),
        boundSourceClassReview: allReviews || flag(args, '--bound-source-class-reviewed'),
        permittedProviderClassReview: allReviews || flag(args, '--provider-class-reviewed'),
        requiredCharacteristicsReview: allReviews || flag(args, '--characteristics-reviewed'),
        noProviderSelectionReview: allReviews || flag(args, '--no-provider-reviewed'),
        noImplementationSelectionReview: allReviews || flag(args, '--no-implementation-reviewed'),
        noLibraryApiDeviceSyscallSelectionReview: allReviews || flag(args, '--no-library-api-device-syscall-reviewed'),
        noNetworkOrExternalProviderReview: allReviews || flag(args, '--no-network-external-reviewed'),
        finalPreflightReview: allReviews || flag(args, '--final-preflight-reviewed'),
        exactScopeReview: allReviews || flag(args, '--scope-reviewed'),
        backupEvidenceReview: allReviews || flag(args, '--backup-evidence-reviewed'),
        restoreEvidenceReview: allReviews || flag(args, '--restore-evidence-reviewed'),
        productionOwnerReview: allReviews || flag(args, '--production-owner-reviewed'),
      },
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return;
  }
  throw new Error(`Unknown command: ${command}`);
}
try { run(); } catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
