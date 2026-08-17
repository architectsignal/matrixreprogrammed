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
const {
  ProductionExecutionTokenMaterialGenerationRequestStore,
} = require('./production-execution-token-material-generation-request-store');
const {
  requestProductionExecutionTokenMaterialGeneration,
} = require('./production-execution-token-material-generation-request-service');

const rootDir = path.resolve(__dirname, '../..');
const runtimeDir = path.join(rootDir, '.autonomous-machine');
const stores = {
  changeRequestStore: new ProductionChangeRequestStore(path.join(runtimeDir, 'production-change-requests.jsonl')),
  changeDecisionStore: new ProductionChangeDecisionStore(path.join(runtimeDir, 'production-change-decisions.jsonl')),
  planStore: new ProductionExecutionPlanStore(path.join(runtimeDir, 'production-execution-plans.jsonl')),
  planDecisionStore: new ProductionExecutionPlanDecisionStore(path.join(runtimeDir, 'production-execution-plan-decisions.jsonl')),
  authorisationRequestStore: new ProductionExecutionAuthorisationRequestStore(path.join(runtimeDir, 'production-execution-authorisation-requests.jsonl')),
  authorisationDecisionStore: new ProductionExecutionAuthorisationDecisionStore(path.join(runtimeDir, 'production-execution-authorisation-decisions.jsonl')),
  tokenRequestStore: new ProductionExecutionTokenRequestStore(path.join(runtimeDir, 'production-execution-token-requests.jsonl')),
  tokenDecisionStore: new ProductionExecutionTokenDecisionStore(path.join(runtimeDir, 'production-execution-token-decisions.jsonl')),
  tokenIssuanceRequestStore: new ProductionExecutionTokenIssuanceRequestStore(path.join(runtimeDir, 'production-execution-token-issuance-requests.jsonl')),
  tokenIssuanceDecisionStore: new ProductionExecutionTokenIssuanceDecisionStore(path.join(runtimeDir, 'production-execution-token-issuance-decisions.jsonl')),
  tokenMaterialGenerationRequestStore: new ProductionExecutionTokenMaterialGenerationRequestStore(
    path.join(runtimeDir, 'production-execution-token-material-generation-requests.jsonl'),
  ),
};
const auditLog = new AuditLog(path.join(runtimeDir, 'audit.jsonl'));

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) return null;
  return args[index + 1];
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function usage() {
  process.stdout.write([
    'Phase 1.16 signed token-material-generation requests',
    '',
    'Commands:',
    '  list',
    '  show <request-id-or-issuance-decision-id>',
    '  request <issuance-decision-id> --requester <name> --role <role> --note <reason> [--duration-seconds 15]',
    '  verify',
    '',
    'Required environment:',
    '  AIM_CHANGE_REQUEST_SIGNING_KEY',
    '  AIM_CHANGE_DECISION_SIGNING_KEY',
    '  AIM_EXECUTION_PLAN_SIGNING_KEY',
    '  AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY',
    '  AIM_EXECUTION_AUTHORISATION_REQUEST_SIGNING_KEY',
    '  AIM_EXECUTION_AUTHORISATION_DECISION_SIGNING_KEY',
    '  AIM_EXECUTION_TOKEN_REQUEST_SIGNING_KEY',
    '  AIM_EXECUTION_TOKEN_DECISION_SIGNING_KEY',
    '  AIM_EXECUTION_TOKEN_ISSUANCE_REQUEST_SIGNING_KEY',
    '  AIM_EXECUTION_TOKEN_ISSUANCE_DECISION_SIGNING_KEY',
    '  AIM_EXECUTION_TOKEN_MATERIAL_GENERATION_REQUEST_SIGNING_KEY',
    '',
    'This command creates a signed request record only.',
    'It does not generate entropy, token material, a credential or a bearer secret.',
    'It cannot edit files, stage or commit Git changes, deploy or publish.',
  ].join('\n') + '\n');
}

function verificationKey() {
  return requiredEnvironment('AIM_EXECUTION_TOKEN_MATERIAL_GENERATION_REQUEST_SIGNING_KEY');
}

function verifiedRequests(signingKey) {
  const verification = stores.tokenMaterialGenerationRequestStore.verify(signingKey);
  if (!verification.valid) throw new Error(`Token material generation request ledger verification failed: ${verification.reason}`);
  return stores.tokenMaterialGenerationRequestStore.readRecords();
}

function run() {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) { usage(); return; }
  const materialRequestSigningKey = verificationKey();
  if (command === 'verify') {
    process.stdout.write(`${JSON.stringify(stores.tokenMaterialGenerationRequestStore.verify(materialRequestSigningKey), null, 2)}\n`);
    return;
  }
  if (command === 'list') {
    const records = verifiedRequests(materialRequestSigningKey).map((record) => ({
      id: record.id,
      issuanceDecisionId: record.payload.issuanceDecision.id,
      requester: record.payload.requester.name,
      expiresAt: record.payload.validity.expiresAt,
      candidateCount: record.payload.lastMomentPreflight.candidates.length,
      operationCount: record.payload.scope.operations.length,
      entropyGenerated: record.payload.generationState.entropyGenerated,
      tokenMaterialGenerated: record.payload.generationState.tokenMaterialGenerated,
      bearerSecretGenerated: record.payload.generationState.bearerSecretGenerated,
      createdAt: record.createdAt,
      recordHash: record.recordHash,
    }));
    process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
    return;
  }
  if (command === 'show') {
    const id = args[0];
    if (!id) throw new Error('show requires a request id or issuance decision id');
    const record = verifiedRequests(materialRequestSigningKey).find((item) => (
      item.id === id || item.payload.issuanceDecision.id === id
    ));
    if (!record) throw new Error(`Token material generation request not found: ${id}`);
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }
  if (command === 'request') {
    const issuanceDecisionId = args[0];
    if (!issuanceDecisionId) throw new Error('request requires an issuance decision id');
    const result = requestProductionExecutionTokenMaterialGeneration({
      executionTokenIssuanceDecisionId: issuanceDecisionId,
      ...stores,
      auditLog,
      repositoryRoot: rootDir,
      changeRequestSigningKey: requiredEnvironment('AIM_CHANGE_REQUEST_SIGNING_KEY'),
      changeDecisionSigningKey: requiredEnvironment('AIM_CHANGE_DECISION_SIGNING_KEY'),
      planSigningKey: requiredEnvironment('AIM_EXECUTION_PLAN_SIGNING_KEY'),
      planDecisionSigningKey: requiredEnvironment('AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY'),
      authorisationRequestSigningKey: requiredEnvironment('AIM_EXECUTION_AUTHORISATION_REQUEST_SIGNING_KEY'),
      authorisationDecisionSigningKey: requiredEnvironment('AIM_EXECUTION_AUTHORISATION_DECISION_SIGNING_KEY'),
      tokenRequestSigningKey: requiredEnvironment('AIM_EXECUTION_TOKEN_REQUEST_SIGNING_KEY'),
      tokenDecisionSigningKey: requiredEnvironment('AIM_EXECUTION_TOKEN_DECISION_SIGNING_KEY'),
      tokenIssuanceRequestSigningKey: requiredEnvironment('AIM_EXECUTION_TOKEN_ISSUANCE_REQUEST_SIGNING_KEY'),
      tokenIssuanceDecisionSigningKey: requiredEnvironment('AIM_EXECUTION_TOKEN_ISSUANCE_DECISION_SIGNING_KEY'),
      tokenMaterialGenerationRequestSigningKey: materialRequestSigningKey,
      tokenMaterialGenerationRequestSigningKeyId: process.env.AIM_EXECUTION_TOKEN_MATERIAL_GENERATION_REQUEST_SIGNING_KEY_ID
        || 'production-execution-token-material-generation-request-key',
      requesterName: option(args, '--requester'),
      requesterRole: option(args, '--role'),
      requesterNote: option(args, '--note'),
      durationSeconds: option(args, '--duration-seconds'),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

try { run(); }
catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
