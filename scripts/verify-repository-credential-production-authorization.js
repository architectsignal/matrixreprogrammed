#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = process.cwd();
const triggerRelative = process.env.MATRIX_REPOSITORY_DEPLOY_TRIGGER
  || '.github/repository-credential-production.trigger';
const triggerPath = path.join(root, triggerRelative);
const reportPaths = [
  path.join(root, 'downloads', 'repository-credential-production-authorization.json'),
  path.join(root, 'downloads', 'one-shot-production-authorization.json')
];
const exactConfirmation = 'DEPLOY MATRIX REPROGRAMMED';
const exactAuthorization = 'exactly one repository-credential controlled Cloudflare production deployment';
const billingException = 'OWNER AUTHORIZED ONE BILLABLE BUILD 2026-08-02';
const allowedActor = 'architectsignal';

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}
function need(condition, message) {
  if (!condition) throw new Error(message);
}
function parseMarker(content) {
  const lines = String(content || '').replace(/\r\n/g, '\n').trim().split('\n');
  const fields = {};
  for (const line of lines.slice(1)) {
    const index = line.indexOf(':');
    if (index < 1) continue;
    fields[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return { firstLine: lines[0] || '', fields };
}
function fullSha(value) {
  return String(value || '').match(/\b[0-9a-f]{40}\b/i)?.[0]?.toLowerCase() || '';
}
function writeReport(report) {
  fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
  for (const file of reportPaths) fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
}

const report = {
  ok: false,
  checkedAt: new Date().toISOString(),
  mode: 'repository-credential-one-shot-push',
  actor: process.env.MATRIX_PRODUCTION_ACTOR || '',
  event: process.env.MATRIX_WORKFLOW_EVENT || '',
  ref: process.env.MATRIX_WORKFLOW_REF || '',
  workflowSha: String(process.env.MATRIX_WORKFLOW_SHA || '').toLowerCase(),
  headSha: '',
  targetSha: '',
  parentSha: '',
  changedFiles: [],
  release: '',
  nonce: '',
  requestedAt: '',
  ageMinutes: null,
  billingExceptionAuthorized: false,
  credentialSource: 'repository-secrets-without-production-environment',
  error: ''
};

try {
  need(report.actor === allowedActor,
    `Repository-credential production release must be pushed by ${allowedActor}, not ${report.actor || 'unknown'}.`);
  need(report.event === 'push', `Repository-credential release must use a main-branch push, not ${report.event || 'unknown'}.`);
  need(report.ref === 'refs/heads/main', `Repository-credential release must target refs/heads/main, not ${report.ref || 'unknown'}.`);
  need(fs.existsSync(triggerPath) && fs.statSync(triggerPath).isFile(),
    `Repository-credential trigger is missing: ${triggerRelative}`);

  const headSha = git(['rev-parse', 'HEAD']).toLowerCase();
  const parentSha = git(['rev-parse', 'HEAD^1']).toLowerCase();
  report.headSha = headSha;
  report.parentSha = parentSha;
  need(!report.workflowSha || report.workflowSha === headSha,
    `Checked-out SHA ${headSha} does not match workflow SHA ${report.workflowSha}.`);

  const changedFiles = git(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])
    .split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  report.changedFiles = changedFiles;
  need(changedFiles.length === 1 && changedFiles[0] === triggerRelative,
    `One-use trigger commit must change only ${triggerRelative}; changed: ${changedFiles.join(', ') || 'none'}.`);
  const subject = git(['show', '-s', '--format=%s', 'HEAD']);
  need(/^Trigger repository-credential PR #224 production deployment$/i.test(subject),
    `Unexpected one-use trigger subject: ${subject}`);

  const { firstLine, fields } = parseMarker(fs.readFileSync(triggerPath, 'utf8'));
  need(firstLine === exactConfirmation, 'Repository-credential trigger confirmation did not match.');
  need(fields.Authorization === exactAuthorization,
    'Repository-credential trigger authorization boundary did not match.');
  need(fields['Billing exception'] === billingException,
    'Repository-credential trigger lacks the recognized one-use billing exception.');
  need(/^pr224-[a-z0-9][a-z0-9-]{16,}$/i.test(fields.Release || ''),
    'Repository-credential release identifier is invalid.');
  need(/^pr224-[a-z0-9][a-z0-9-]{24,}$/i.test(fields.Nonce || ''),
    'Repository-credential nonce is invalid or too weak.');
  need(/merged PR #224/i.test(fields.Purpose || ''),
    'Repository-credential trigger is not tied to merged PR #224.');
  need(/repository-level Cloudflare credential/i.test(fields.Purpose || ''),
    'Repository-credential trigger does not name the authorized credential lane.');
  need(/D1 Time Travel rollback/i.test(fields['Required proof'] || ''),
    'Repository-credential trigger does not require a D1 rollback bookmark.');
  need(/repeat-safe migrations/i.test(fields['Required proof'] || ''),
    'Repository-credential trigger does not require repeat-safe migrations.');
  need(/exact live SHA/i.test(fields['Required proof'] || ''),
    'Repository-credential trigger does not require exact live-SHA proof.');
  need(/all other .* gates .* mandatory/i.test(fields.Boundary || ''),
    'Repository-credential trigger weakens non-credential release gates.');
  need(/no production environment secret/i.test(fields.Boundary || ''),
    'Repository-credential trigger does not explicitly exclude the broken environment override.');

  const requestedAt = Date.parse(fields.Requested || '');
  need(Number.isFinite(requestedAt), 'Repository-credential trigger Requested timestamp is invalid.');
  const ageMinutes = (Date.now() - requestedAt) / 60000;
  need(ageMinutes >= -2 && ageMinutes <= 120,
    `Repository-credential trigger age ${ageMinutes.toFixed(1)} minutes is outside 0-120 minutes.`);
  report.requestedAt = new Date(requestedAt).toISOString();
  report.ageMinutes = ageMinutes;

  const targetSha = fullSha(fields.Target);
  need(targetSha, 'Repository-credential trigger Target lacks a full SHA.');
  need(parentSha === targetSha,
    `Trigger parent ${parentSha} does not equal authorized target ${targetSha}.`);
  report.targetSha = targetSha;
  report.release = fields.Release;
  report.nonce = fields.Nonce;
  report.billingExceptionAuthorized = true;
  report.ok = true;
  writeReport(report);
  console.log(
    `REPOSITORY-CREDENTIAL PRODUCTION AUTHORIZATION PASS: ${headSha} is a one-file trigger commit `
    + `over authorized target ${targetSha}; repository-level Cloudflare credentials may proceed only through the remaining mandatory gates.`
  );
} catch (error) {
  report.error = String(error?.message || error);
  writeReport(report);
  console.error(`REPOSITORY-CREDENTIAL PRODUCTION AUTHORIZATION REFUSED: ${report.error}`);
  process.exit(1);
}
