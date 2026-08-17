#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { ProductionChangeRequestStore } = require('./production-change-request-store');
const { ProductionChangeDecisionStore } = require('./production-change-decision-store');
const { ProductionExecutionPlanStore } = require('./production-execution-plan-store');
const { ProductionExecutionPlanDecisionStore } = require('./production-execution-plan-decision-store');
const { decideProductionExecutionPlan } = require('./production-execution-plan-decision-service');

const rootDir = path.resolve(__dirname, '../..');
const runtimeDir = path.join(rootDir, '.autonomous-machine');
const requestStore = new ProductionChangeRequestStore(path.join(runtimeDir, 'production-change-requests.jsonl'));
const changeDecisionStore = new ProductionChangeDecisionStore(path.join(runtimeDir, 'production-change-decisions.jsonl'));
const planStore = new ProductionExecutionPlanStore(path.join(runtimeDir, 'production-execution-plans.jsonl'));
const planDecisionStore = new ProductionExecutionPlanDecisionStore(path.join(runtimeDir, 'production-execution-plan-decisions.jsonl'));
const auditLog = new AuditLog(path.join(runtimeDir, 'audit.jsonl'));

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) return null;
  return args[index + 1];
}

function flag(args, name) {
  return args.includes(name);
}

function usage() {
  process.stdout.write([
    'Phase 1.9 signed human review of execution-plan previews',
    '',
    'Commands:',
    '  list',
    '  show <execution-plan-decision-id-or-plan-id>',
    '  decide <execution-plan-id> <approve|reject> --reviewer <name> --role <role> --note <reason> [review flags]',
    '  verify',
    '',
    'Approval review flags:',
    '  --target-mapping-reviewed',
    '  --file-snapshots-reviewed',
    '  --rollback-plan-reviewed',
    '  --validation-plan-reviewed',
    '  --production-owner-reviewed',
    '',
    'Required environment:',
    '  AIM_CHANGE_REQUEST_SIGNING_KEY',
    '  AIM_CHANGE_DECISION_SIGNING_KEY',
    '  AIM_EXECUTION_PLAN_SIGNING_KEY',
    '  AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY',
    '',
    'Optional environment:',
    '  AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY_ID',
    '',
    'This command records approval or rejection only. It cannot write, commit, deploy or publish.',
  ].join('\n') + '\n');
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function verifiedDecisions(signingKey) {
  const verification = planDecisionStore.verify(signingKey);
  if (!verification.valid) throw new Error(`Execution plan decision ledger verification failed: ${verification.reason}`);
  return planDecisionStore.readRecords();
}

function run() {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) {
    usage();
    return;
  }
  const planDecisionSigningKey = requiredEnvironment('AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY');
  if (command === 'verify') {
    process.stdout.write(`${JSON.stringify(planDecisionStore.verify(planDecisionSigningKey), null, 2)}\n`);
    return;
  }
  if (command === 'list') {
    const records = verifiedDecisions(planDecisionSigningKey).map((record) => ({
      id: record.id,
      executionPlanId: record.payload.executionPlan.id,
      reviewer: record.payload.reviewer.name,
      decision: record.payload.decision,
      status: record.payload.status,
      targetCount: record.payload.mappingSummary.targetCount,
      candidateCount: record.payload.mappingSummary.candidateCount,
      missingCandidateCount: record.payload.mappingSummary.missingCandidateCount,
      readyForExecution: record.payload.readyForExecution,
      createdAt: record.createdAt,
      recordHash: record.recordHash,
    }));
    process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
    return;
  }
  if (command === 'show') {
    const id = args[0];
    if (!id) throw new Error('show requires an execution plan decision id or plan id');
    const record = verifiedDecisions(planDecisionSigningKey).find((item) => (
      item.id === id || item.payload.executionPlan.id === id
    ));
    if (!record) throw new Error(`Execution plan decision not found: ${id}`);
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }
  if (command === 'decide') {
    const executionPlanId = args[0];
    const decision = args[1];
    if (!executionPlanId || !decision) throw new Error('decide requires an execution plan id and approve or reject');
    const result = decideProductionExecutionPlan({
      executionPlanId,
      decision,
      requestStore,
      changeDecisionStore,
      planStore,
      planDecisionStore,
      auditLog,
      requestSigningKey: requiredEnvironment('AIM_CHANGE_REQUEST_SIGNING_KEY'),
      changeDecisionSigningKey: requiredEnvironment('AIM_CHANGE_DECISION_SIGNING_KEY'),
      planSigningKey: requiredEnvironment('AIM_EXECUTION_PLAN_SIGNING_KEY'),
      planDecisionSigningKey,
      planDecisionSigningKeyId: process.env.AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY_ID || 'production-execution-plan-decision-key',
      reviewerName: option(args, '--reviewer'),
      reviewerRole: option(args, '--role'),
      reviewerNote: option(args, '--note'),
      completedReviews: {
        targetMappingReview: flag(args, '--target-mapping-reviewed'),
        fileSnapshotReview: flag(args, '--file-snapshots-reviewed'),
        rollbackPlanReview: flag(args, '--rollback-plan-reviewed'),
        validationPlanReview: flag(args, '--validation-plan-reviewed'),
        productionOwnerReview: flag(args, '--production-owner-reviewed'),
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
