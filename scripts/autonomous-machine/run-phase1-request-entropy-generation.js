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
const { requestProductionExecutionEntropyGeneration } = require('./production-execution-entropy-generation-request-service');

const rootDir = path.resolve(__dirname, '../..');
const runtimeDir = path.join(rootDir, '.autonomous-machine');
const changeRequestStore = new ProductionChangeRequestStore(path.join(runtimeDir, 'production-change-requests.jsonl'));
const changeDecisionStore = new ProductionChangeDecisionStore(path.join(runtimeDir, 'production-change-decisions.jsonl'));
const planStore = new ProductionExecutionPlanStore(path.join(runtimeDir, 'production-execution-plans.jsonl'));
const planDecisionStore = new ProductionExecutionPlanDecisionStore(path.join(runtimeDir, 'production-execution-plan-decisions.jsonl'));
const authorisationRequestStore = new ProductionExecutionAuthorisationRequestStore(path.join(runtimeDir, 'production-execution-authorisation-requests.jsonl'));
const authorisationDecisionStore = new ProductionExecutionAuthorisationDecisionStore(path.join(runtimeDir, 'production-execution-authorisation-decisions.jsonl'));
const tokenRequestStore = new ProductionExecutionTokenRequestStore(path.join(runtimeDir, 'production-execution-token-requests.jsonl'));
const tokenDecisionStore = new ProductionExecutionTokenDecisionStore(path.join(runtimeDir, 'production-execution-token-decisions.jsonl'));
const tokenIssuanceRequestStore = new ProductionExecutionTokenIssuanceRequestStore(path.join(runtimeDir, 'production-execution-token-issuance-requests.jsonl'));
const tokenIssuanceDecisionStore = new ProductionExecutionTokenIssuanceDecisionStore(path.join(runtimeDir, 'production-execution-token-issuance-decisions.jsonl'));
const tokenMaterialGenerationRequestStore = new ProductionExecutionTokenMaterialGenerationRequestStore(path.join(runtimeDir, 'production-execution-token-material-generation-requests.jsonl'));
const tokenMaterialGenerationDecisionStore = new ProductionExecutionTokenMaterialGenerationDecisionStore(path.join(runtimeDir, 'production-execution-token-material-generation-decisions.jsonl'));
const entropyGenerationRequestStore = new ProductionExecutionEntropyGenerationRequestStore(path.join(runtimeDir, 'production-execution-entropy-generation-requests.jsonl'));
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
    'Phase 1.18 signed entropy-generation requests',
    '',
    'Commands:',
    '  list',
    '  show <request-id-or-generation-decision-id>',
    '  request <generation-decision-id> --requester <name> --role <role> --note <reason> [--duration-seconds <3-15>]',
    '  verify',
    '',
    'This command creates a signed request record only.',
    'It cannot select an entropy source, generate entropy bytes, create credentials, edit files, commit, deploy or publish.',
  ].join('\n') + '\n');
}
function verifiedRequests(signingKey) {
  const verification = entropyGenerationRequestStore.verify(signingKey);
  if (!verification.valid) throw new Error(`Entropy generation request ledger verification failed: ${verification.reason}`);
  return entropyGenerationRequestStore.readRecords();
}
function run() {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) { usage(); return; }
  const requestSigningKey = requiredEnvironment('AIM_EXECUTION_ENTROPY_GENERATION_REQUEST_SIGNING_KEY');
  if (command === 'verify') {
    process.stdout.write(`${JSON.stringify(entropyGenerationRequestStore.verify(requestSigningKey), null, 2)}\n`);
    return;
  }
  if (command === 'list') {
    const records = verifiedRequests(requestSigningKey).map((record) => ({
      id: record.id,
      generationDecisionId: record.payload.generationDecision.id,
      status: record.payload.status,
      requester: record.payload.requester.name,
      expiresAt: record.payload.validity.expiresAt,
      candidateCount: record.payload.lastMomentPreflight.candidates.length,
      operationCount: record.payload.scope.operations.length,
      entropySourceSelected: record.payload.entropyState.entropySourceSelected,
      entropyGenerated: record.payload.entropyState.entropyGenerated,
      createdAt: record.createdAt,
      recordHash: record.recordHash,
    }));
    process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
    return;
  }
  if (command === 'show') {
    const id = args[0];
    if (!id) throw new Error('show requires a request id or generation decision id');
    const record = verifiedRequests(requestSigningKey).find((item) => (
      item.id === id || item.payload.generationDecision.id === id
    ));
    if (!record) throw new Error(`Entropy generation request not found: ${id}`);
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }
  if (command === 'request') {
    const decisionId = args[0];
    if (!decisionId) throw new Error('request requires a token material generation decision id');
    const result = requestProductionExecutionEntropyGeneration({
      tokenMaterialGenerationDecisionId: decisionId,
      changeRequestStore,
      changeDecisionStore,
      planStore,
      planDecisionStore,
      authorisationRequestStore,
      authorisationDecisionStore,
      tokenRequestStore,
      tokenDecisionStore,
      tokenIssuanceRequestStore,
      tokenIssuanceDecisionStore,
      tokenMaterialGenerationRequestStore,
      tokenMaterialGenerationDecisionStore,
      entropyGenerationRequestStore,
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
      tokenMaterialGenerationRequestSigningKey: requiredEnvironment('AIM_EXECUTION_TOKEN_MATERIAL_GENERATION_REQUEST_SIGNING_KEY'),
      tokenMaterialGenerationDecisionSigningKey: requiredEnvironment('AIM_EXECUTION_TOKEN_MATERIAL_GENERATION_DECISION_SIGNING_KEY'),
      entropyGenerationRequestSigningKey: requestSigningKey,
      entropyGenerationRequestSigningKeyId: process.env.AIM_EXECUTION_ENTROPY_GENERATION_REQUEST_SIGNING_KEY_ID
        || 'production-execution-entropy-generation-request-key',
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
