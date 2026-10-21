#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { ProductionChangeRequestStore } = require('./production-change-request-store');
const { ProductionChangeDecisionStore } = require('./production-change-decision-store');
const { ProductionExecutionPlanStore } = require('./production-execution-plan-store');
const { ProductionExecutionPlanDecisionStore } = require('./production-execution-plan-decision-store');
const { ProductionExecutionAuthorisationRequestStore } = require('./production-execution-authorisation-request-store');
const { ProductionExecutionAuthorisationDecisionStore } = require('./production-execution-authorisation-decision-store');
const { decideProductionExecutionAuthorisation } = require('./production-execution-authorisation-decision-service');

const rootDir = path.resolve(__dirname, '../..');
const runtimeDir = path.join(rootDir, '.autonomous-machine');
const changeRequestStore = new ProductionChangeRequestStore(path.join(runtimeDir, 'production-change-requests.jsonl'));
const changeDecisionStore = new ProductionChangeDecisionStore(path.join(runtimeDir, 'production-change-decisions.jsonl'));
const planStore = new ProductionExecutionPlanStore(path.join(runtimeDir, 'production-execution-plans.jsonl'));
const planDecisionStore = new ProductionExecutionPlanDecisionStore(path.join(runtimeDir, 'production-execution-plan-decisions.jsonl'));
const authorisationRequestStore = new ProductionExecutionAuthorisationRequestStore(path.join(runtimeDir, 'production-execution-authorisation-requests.jsonl'));
const authorisationDecisionStore = new ProductionExecutionAuthorisationDecisionStore(path.join(runtimeDir, 'production-execution-authorisation-decisions.jsonl'));
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

function readBackupManifest(filePath) {
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const entries = Array.isArray(parsed) ? parsed : parsed.entries;
  if (!Array.isArray(entries)) throw new Error('Backup manifest must be an array or contain an entries array');
  return entries;
}

function usage() {
  process.stdout.write([
    'Phase 1.11 signed human decisions for time-limited execution-authorisation requests',
    '',
    'Commands:',
    '  list',
    '  show <decision-id-or-request-id>',
    '  decide <request-id> <approve|reject> --reviewer <name> --role <role> --note <reason>',
    '    [--all-reviews-complete]',
    '    [--request-window-reviewed] [--fresh-hash-reviewed] [--external-backup-reviewed]',
    '    [--restore-rehearsal-reviewed] [--production-owner-reviewed]',
    '    [--backup-root <external-directory> --backup-manifest <json-file>]',
    '  verify',
    '',
    'Required environment:',
    '  AIM_CHANGE_REQUEST_SIGNING_KEY',
    '  AIM_CHANGE_DECISION_SIGNING_KEY',
    '  AIM_EXECUTION_PLAN_SIGNING_KEY',
    '  AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY',
    '  AIM_EXECUTION_AUTHORISATION_REQUEST_SIGNING_KEY',
    '  AIM_EXECUTION_AUTHORISATION_DECISION_SIGNING_KEY',
    '',
    'Optional environment:',
    '  AIM_EXECUTION_AUTHORISATION_DECISION_SIGNING_KEY_ID',
    '',
    'Approval reads and verifies external backups and runs a disposable restore rehearsal in gitignored runtime state.',
    'It cannot edit production files, stage or commit Git changes, deploy or publish.',
  ].join('\n') + '\n');
}

function verifiedDecisions(signingKey) {
  const verification = authorisationDecisionStore.verify(signingKey);
  if (!verification.valid) throw new Error(`Execution authorisation decision ledger verification failed: ${verification.reason}`);
  return authorisationDecisionStore.readRecords();
}

function run() {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) {
    usage();
    return;
  }
  const authorisationDecisionSigningKey = requiredEnvironment('AIM_EXECUTION_AUTHORISATION_DECISION_SIGNING_KEY');
  if (command === 'verify') {
    process.stdout.write(`${JSON.stringify(authorisationDecisionStore.verify(authorisationDecisionSigningKey), null, 2)}\n`);
    return;
  }
  if (command === 'list') {
    const records = verifiedDecisions(authorisationDecisionSigningKey).map((record) => ({
      id: record.id,
      requestId: record.payload.authorisationRequest.id,
      decision: record.payload.decision,
      status: record.payload.status,
      reviewer: record.payload.reviewer.name,
      backupCount: record.payload.backupVerification.entries.length,
      restoreRehearsalFiles: record.payload.restoreRehearsal.filesRestored,
      readyForExecution: record.payload.readyForExecution,
      createdAt: record.createdAt,
      recordHash: record.recordHash,
    }));
    process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
    return;
  }
  if (command === 'show') {
    const id = args[0];
    if (!id) throw new Error('show requires a decision id or authorisation request id');
    const record = verifiedDecisions(authorisationDecisionSigningKey).find((item) => (
      item.id === id || item.payload.authorisationRequest.id === id
    ));
    if (!record) throw new Error(`Execution authorisation decision not found: ${id}`);
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }
  if (command === 'decide') {
    const requestId = args[0];
    const decision = args[1];
    if (!requestId || !decision) throw new Error('decide requires request id and approve or reject');
    const allReviews = flag(args, '--all-reviews-complete');
    const backupManifestPath = option(args, '--backup-manifest');
    const result = decideProductionExecutionAuthorisation({
      executionAuthorisationRequestId: requestId,
      changeRequestStore,
      changeDecisionStore,
      planStore,
      planDecisionStore,
      authorisationRequestStore,
      authorisationDecisionStore,
      auditLog,
      repositoryRoot: rootDir,
      changeRequestSigningKey: requiredEnvironment('AIM_CHANGE_REQUEST_SIGNING_KEY'),
      changeDecisionSigningKey: requiredEnvironment('AIM_CHANGE_DECISION_SIGNING_KEY'),
      planSigningKey: requiredEnvironment('AIM_EXECUTION_PLAN_SIGNING_KEY'),
      planDecisionSigningKey: requiredEnvironment('AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY'),
      authorisationRequestSigningKey: requiredEnvironment('AIM_EXECUTION_AUTHORISATION_REQUEST_SIGNING_KEY'),
      authorisationDecisionSigningKey,
      authorisationDecisionSigningKeyId: process.env.AIM_EXECUTION_AUTHORISATION_DECISION_SIGNING_KEY_ID
        || 'production-execution-authorisation-decision-key',
      decision,
      reviewerName: option(args, '--reviewer'),
      reviewerRole: option(args, '--role'),
      reviewerNote: option(args, '--note'),
      completedReviews: {
        requestWindowReview: allReviews || flag(args, '--request-window-reviewed'),
        freshHashReview: allReviews || flag(args, '--fresh-hash-reviewed'),
        externalBackupReview: allReviews || flag(args, '--external-backup-reviewed'),
        restoreRehearsalReview: allReviews || flag(args, '--restore-rehearsal-reviewed'),
        productionOwnerReview: allReviews || flag(args, '--production-owner-reviewed'),
      },
      backupRoot: option(args, '--backup-root'),
      backupEntries: readBackupManifest(backupManifestPath),
      restoreRehearsalRoot: path.join(runtimeDir, 'restore-rehearsals'),
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
