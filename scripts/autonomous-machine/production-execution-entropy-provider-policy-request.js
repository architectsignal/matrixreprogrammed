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
const { requestProductionExecutionEntropyProviderPolicy } = require('./production-execution-entropy-provider-policy-request-service');

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
];
const stores = new Map(definitions.map(([label, Store, file, env]) => [label, { store: new Store(path.join(runtimeDir, file)), env }]));
const bindingRequestStore = new ProductionExecutionEntropySourceBindingRequestStore(path.join(runtimeDir, 'production-execution-entropy-source-binding-requests.jsonl'));
const bindingDecisionStore = new ProductionExecutionEntropySourceBindingDecisionStore(path.join(runtimeDir, 'production-execution-entropy-source-binding-decisions.jsonl'));
const policyRequestStore = new ProductionExecutionEntropyProviderPolicyRequestStore(path.join(runtimeDir, 'production-execution-entropy-provider-policy-requests.jsonl'));
const auditLog = new AuditLog(path.join(runtimeDir, 'audit.jsonl'));

function option(args, name) { const index = args.indexOf(name); return index === -1 || index === args.length - 1 ? null : args[index + 1]; }
function requiredEnvironment(name) { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }
function upstreamIntegrityChecks() { return [...stores.entries()].map(([label, item]) => ({ label, store: item.store, signingKey: requiredEnvironment(item.env) })); }
function usage() {
  process.stdout.write([
    'Phase 1.24 signed entropy-provider-policy requests', '', 'Commands:',
    '  list', '  show <request-id-or-source-binding-decision-id>',
    '  request <source-binding-decision-id> --requester <name> --role <role> --note <reason> [--duration-seconds <1-6>]',
    '  verify', '', 'This command defines provider safety characteristics only.',
    'It cannot select a provider, implementation, library, API, device or syscall, request entropy bytes, edit files, commit, deploy or publish.',
  ].join('\n') + '\n');
}
function verifiedRequests(signingKey) {
  const verification = policyRequestStore.verify(signingKey);
  if (!verification.valid) throw new Error(`Entropy provider policy request ledger verification failed: ${verification.reason}`);
  return policyRequestStore.readRecords();
}
function run() {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) { usage(); return; }
  const bindingRequestSigningKey = requiredEnvironment('AIM_EXECUTION_ENTROPY_SOURCE_BINDING_REQUEST_SIGNING_KEY');
  const bindingDecisionSigningKey = requiredEnvironment('AIM_EXECUTION_ENTROPY_SOURCE_BINDING_DECISION_SIGNING_KEY');
  const policyRequestSigningKey = requiredEnvironment('AIM_EXECUTION_ENTROPY_PROVIDER_POLICY_REQUEST_SIGNING_KEY');
  if (command === 'verify') { process.stdout.write(`${JSON.stringify(policyRequestStore.verify(policyRequestSigningKey), null, 2)}\n`); return; }
  if (command === 'list') {
    const records = verifiedRequests(policyRequestSigningKey).map((record) => ({
      id: record.id, sourceBindingDecisionId: record.payload.sourceBindingDecision.id,
      status: record.payload.status, requester: record.payload.requester.name,
      expiresAt: record.payload.validity.expiresAt,
      permittedProviderClass: record.payload.providerPolicy.permittedProviderClass,
      providerSelected: record.payload.providerPolicy.providerSelected,
      implementationSelected: record.payload.providerPolicy.implementationSelected,
      entropyGenerated: record.payload.providerPolicy.entropyGenerated,
      createdAt: record.createdAt, recordHash: record.recordHash,
    }));
    process.stdout.write(`${JSON.stringify(records, null, 2)}\n`); return;
  }
  if (command === 'show') {
    const id = args[0]; if (!id) throw new Error('show requires a request id or source-binding decision id');
    const record = verifiedRequests(policyRequestSigningKey).find((item) => item.id === id || item.payload.sourceBindingDecision.id === id);
    if (!record) throw new Error(`Entropy provider policy request not found: ${id}`);
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`); return;
  }
  if (command === 'request') {
    const decisionId = args[0]; if (!decisionId) throw new Error('request requires a source-binding decision id');
    const result = requestProductionExecutionEntropyProviderPolicy({
      entropySourceBindingDecisionId: decisionId,
      entropySourceBindingRequestStore: bindingRequestStore,
      entropySourceBindingDecisionStore: bindingDecisionStore,
      entropyProviderPolicyRequestStore: policyRequestStore,
      auditLog, repositoryRoot: rootDir, upstreamIntegrityChecks: upstreamIntegrityChecks(),
      entropySourceBindingRequestSigningKey: bindingRequestSigningKey,
      entropySourceBindingDecisionSigningKey: bindingDecisionSigningKey,
      entropyProviderPolicyRequestSigningKey: policyRequestSigningKey,
      entropyProviderPolicyRequestSigningKeyId: process.env.AIM_EXECUTION_ENTROPY_PROVIDER_POLICY_REQUEST_SIGNING_KEY_ID || 'production-execution-entropy-provider-policy-request-key',
      requesterName: option(args, '--requester'), requesterRole: option(args, '--role'),
      requesterNote: option(args, '--note'), durationSeconds: option(args, '--duration-seconds'),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return;
  }
  throw new Error(`Unknown command: ${command}`);
}
try { run(); } catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
