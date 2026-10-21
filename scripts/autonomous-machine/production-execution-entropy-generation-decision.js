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
const { decideProductionExecutionEntropyGeneration } = require('./production-execution-entropy-generation-decision-service');

const rootDir = path.resolve(__dirname, '../..');
const runtimeDir = path.join(rootDir, '.autonomous-machine');
const stores = {
  changeRequest: new ProductionChangeRequestStore(path.join(runtimeDir, 'production-change-requests.jsonl')),
  changeDecision: new ProductionChangeDecisionStore(path.join(runtimeDir, 'production-change-decisions.jsonl')),
  plan: new ProductionExecutionPlanStore(path.join(runtimeDir, 'production-execution-plans.jsonl')),
  planDecision: new ProductionExecutionPlanDecisionStore(path.join(runtimeDir, 'production-execution-plan-decisions.jsonl')),
  authorisationRequest: new ProductionExecutionAuthorisationRequestStore(path.join(runtimeDir, 'production-execution-authorisation-requests.jsonl')),
  authorisationDecision: new ProductionExecutionAuthorisationDecisionStore(path.join(runtimeDir, 'production-execution-authorisation-decisions.jsonl')),
  tokenRequest: new ProductionExecutionTokenRequestStore(path.join(runtimeDir, 'production-execution-token-requests.jsonl')),
  tokenDecision: new ProductionExecutionTokenDecisionStore(path.join(runtimeDir, 'production-execution-token-decisions.jsonl')),
  tokenIssuanceRequest: new ProductionExecutionTokenIssuanceRequestStore(path.join(runtimeDir, 'production-execution-token-issuance-requests.jsonl')),
  tokenIssuanceDecision: new ProductionExecutionTokenIssuanceDecisionStore(path.join(runtimeDir, 'production-execution-token-issuance-decisions.jsonl')),
  materialRequest: new ProductionExecutionTokenMaterialGenerationRequestStore(path.join(runtimeDir, 'production-execution-token-material-generation-requests.jsonl')),
  materialDecision: new ProductionExecutionTokenMaterialGenerationDecisionStore(path.join(runtimeDir, 'production-execution-token-material-generation-decisions.jsonl')),
  entropyRequest: new ProductionExecutionEntropyGenerationRequestStore(path.join(runtimeDir, 'production-execution-entropy-generation-requests.jsonl')),
  entropyDecision: new ProductionExecutionEntropyGenerationDecisionStore(path.join(runtimeDir, 'production-execution-entropy-generation-decisions.jsonl')),
};
const auditLog = new AuditLog(path.join(runtimeDir, 'audit.jsonl'));

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) return null;
  return args[index + 1];
}
function flag(args, name) { return args.includes(name); }
function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function upstreamIntegrityChecks() {
  return [
    ['Production change request', stores.changeRequest, 'AIM_CHANGE_REQUEST_SIGNING_KEY'],
    ['Production change decision', stores.changeDecision, 'AIM_CHANGE_DECISION_SIGNING_KEY'],
    ['Production execution plan', stores.plan, 'AIM_EXECUTION_PLAN_SIGNING_KEY'],
    ['Production execution plan decision', stores.planDecision, 'AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY'],
    ['Execution authorisation request', stores.authorisationRequest, 'AIM_EXECUTION_AUTHORISATION_REQUEST_SIGNING_KEY'],
    ['Execution authorisation decision', stores.authorisationDecision, 'AIM_EXECUTION_AUTHORISATION_DECISION_SIGNING_KEY'],
    ['Execution token request', stores.tokenRequest, 'AIM_EXECUTION_TOKEN_REQUEST_SIGNING_KEY'],
    ['Execution token decision', stores.tokenDecision, 'AIM_EXECUTION_TOKEN_DECISION_SIGNING_KEY'],
    ['Execution token issuance request', stores.tokenIssuanceRequest, 'AIM_EXECUTION_TOKEN_ISSUANCE_REQUEST_SIGNING_KEY'],
    ['Execution token issuance decision', stores.tokenIssuanceDecision, 'AIM_EXECUTION_TOKEN_ISSUANCE_DECISION_SIGNING_KEY'],
    ['Token material generation request', stores.materialRequest, 'AIM_EXECUTION_TOKEN_MATERIAL_GENERATION_REQUEST_SIGNING_KEY'],
    ['Token material generation decision', stores.materialDecision, 'AIM_EXECUTION_TOKEN_MATERIAL_GENERATION_DECISION_SIGNING_KEY'],
  ].map(([label, store, environmentName]) => ({ label, store, signingKey: requiredEnvironment(environmentName) }));
}
function usage() {
  process.stdout.write([
    'Phase 1.19 signed human decisions for entropy-generation requests',
    '',
    'Commands:',
    '  list',
    '  show <decision-id-or-request-id>',
    '  decide <entropy-request-id> <approve|reject> --reviewer <name> --role <role> --note <reason>',
    '    [--all-reviews-complete]',
    '    [--request-window-reviewed] [--final-preflight-reviewed] [--scope-reviewed]',
    '    [--entropy-source-boundary-reviewed] [--no-output-boundary-reviewed]',
    '    [--backup-evidence-reviewed] [--restore-evidence-reviewed] [--production-owner-reviewed]',
    '  verify',
    '',
    'Approval performs read-only verification only.',
    'It cannot select an entropy source, generate bytes, create secrets, edit files, commit, deploy or publish.',
  ].join('\n') + '\n');
}
function verifiedDecisions(signingKey) {
  const verification = stores.entropyDecision.verify(signingKey);
  if (!verification.valid) throw new Error(`Entropy generation decision ledger verification failed: ${verification.reason}`);
  return stores.entropyDecision.readRecords();
}
function run() {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) { usage(); return; }
  const requestSigningKey = requiredEnvironment('AIM_EXECUTION_ENTROPY_GENERATION_REQUEST_SIGNING_KEY');
  const decisionSigningKey = requiredEnvironment('AIM_EXECUTION_ENTROPY_GENERATION_DECISION_SIGNING_KEY');
  if (command === 'verify') {
    process.stdout.write(`${JSON.stringify(stores.entropyDecision.verify(decisionSigningKey), null, 2)}\n`);
    return;
  }
  if (command === 'list') {
    const records = verifiedDecisions(decisionSigningKey).map((record) => ({
      id: record.id,
      entropyRequestId: record.payload.entropyRequest.id,
      decision: record.payload.decision,
      status: record.payload.status,
      reviewer: record.payload.reviewer.name,
      remainingSeconds: record.payload.validityReview.remainingSeconds,
      candidateCount: record.payload.finalPreflight.candidates.length,
      operationCount: record.payload.scopeReview.operations.length,
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
    if (!id) throw new Error('show requires a decision id or entropy request id');
    const record = verifiedDecisions(decisionSigningKey).find((item) => item.id === id || item.payload.entropyRequest.id === id);
    if (!record) throw new Error(`Entropy generation decision not found: ${id}`);
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }
  if (command === 'decide') {
    const requestId = args[0];
    const decision = args[1];
    if (!requestId || !decision) throw new Error('decide requires entropy request id and approve or reject');
    const allReviews = flag(args, '--all-reviews-complete');
    const result = decideProductionExecutionEntropyGeneration({
      entropyGenerationRequestId: requestId,
      entropyGenerationRequestStore: stores.entropyRequest,
      entropyGenerationDecisionStore: stores.entropyDecision,
      auditLog,
      repositoryRoot: rootDir,
      upstreamIntegrityChecks: upstreamIntegrityChecks(),
      entropyGenerationRequestSigningKey: requestSigningKey,
      entropyGenerationDecisionSigningKey: decisionSigningKey,
      entropyGenerationDecisionSigningKeyId: process.env.AIM_EXECUTION_ENTROPY_GENERATION_DECISION_SIGNING_KEY_ID || 'production-execution-entropy-generation-decision-key',
      decision,
      reviewerName: option(args, '--reviewer'),
      reviewerRole: option(args, '--role'),
      reviewerNote: option(args, '--note'),
      completedReviews: {
        entropyRequestWindowReview: allReviews || flag(args, '--request-window-reviewed'),
        finalPreflightReview: allReviews || flag(args, '--final-preflight-reviewed'),
        exactScopeReview: allReviews || flag(args, '--scope-reviewed'),
        entropySourceBoundaryReview: allReviews || flag(args, '--entropy-source-boundary-reviewed'),
        noOutputBoundaryReview: allReviews || flag(args, '--no-output-boundary-reviewed'),
        backupEvidenceReview: allReviews || flag(args, '--backup-evidence-reviewed'),
        restoreEvidenceReview: allReviews || flag(args, '--restore-evidence-reviewed'),
        productionOwnerReview: allReviews || flag(args, '--production-owner-reviewed'),
      },
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