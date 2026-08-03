#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'one-shot-production-authorization.json');
const exactConfirmation = 'DEPLOY MATRIX REPROGRAMMED';
const exactAuthorization = 'exactly one controlled Cloudflare production deployment';
// Legacy token retained because deploy.yml already recognizes this exact value.
// The marker and date checks below bind it to the explicit 2026-08-03 owner override.
const ownerExceptionAuthorization = 'OWNER AUTHORIZED ONE BILLABLE BUILD 2026-08-02';

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function gitOptional(args) {
  try { return git(args); } catch { return ''; }
}

function parseMarker(content) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const fields = {};
  for (const line of lines.slice(1)) {
    const index = line.indexOf(':');
    if (index < 1) continue;
    fields[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return { firstLine: lines[0]?.trim() || '', fields };
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function extractTargetSha(target = '') {
  return String(target).match(/\b[0-9a-f]{40}\b/i)?.[0]?.toLowerCase() || '';
}

function validateMarker(content, options = {}) {
  const now = options.now || new Date();
  const maxAgeHours = Number(options.maxAgeHours || 6);
  const { firstLine, fields } = parseMarker(content);

  requireValue(firstLine === exactConfirmation, 'One-shot marker first line does not match the deployment confirmation.');
  requireValue(fields.Authorization === exactAuthorization, 'One-shot marker authorization boundary is missing or changed.');
  requireValue(/^pr\d+-[a-z0-9][a-z0-9-]{8,}$/i.test(fields.Release || ''), 'One-shot marker release identifier is invalid.');
  requireValue(/^pr\d+-[a-z0-9][a-z0-9-]{20,}$/i.test(fields.Nonce || ''), 'One-shot marker nonce is invalid or too weak.');
  requireValue(/merged PR #\d+/i.test(fields.Purpose || ''), 'One-shot marker is not tied to a merged pull request.');
  requireValue(/zero-spend/i.test(fields.Boundary || ''), 'One-shot marker does not preserve the remaining zero-spend controls.');

  const billingException = String(fields['Billing exception'] || '').trim();
  if (billingException) {
    requireValue(
      billingException === ownerExceptionAuthorization,
      'One-shot marker contains an unrecognized billable-build exception.'
    );
    requireValue(
      /owner-authorized single billable build on 2026-08-03/i.test(fields.Boundary || ''),
      'One-shot marker does not bind the billable-build exception to 2026-08-03.'
    );
    requireValue(
      /all other .* gates .* mandatory/i.test(fields.Boundary || ''),
      'One-shot marker does not preserve the non-budget release gates.'
    );
    requireValue(
      /owner-authorized single billable-build exception on 2026-08-03/i.test(fields['Required proof'] || ''),
      'One-shot marker does not require the dated owner exception proof.'
    );
  } else {
    requireValue(
      /fresh Cloudflare zero-overage budget approval/i.test(fields['Required proof'] || ''),
      'One-shot marker does not require fresh Cloudflare budget approval.'
    );
    requireValue(
      /do not bypass the Cloudflare billing-period lock/i.test(fields.Boundary || ''),
      'One-shot marker does not preserve the billing-period lock.'
    );
  }

  const requestedAt = Date.parse(fields.Requested || '');
  requireValue(Number.isFinite(requestedAt), 'One-shot marker Requested timestamp is invalid.');
  const ageHours = (now.getTime() - requestedAt) / 3600000;
  requireValue(ageHours >= -0.1 && ageHours <= maxAgeHours, `One-shot marker age ${ageHours.toFixed(2)}h is outside the allowed 0-${maxAgeHours}h window.`);

  const targetSha = extractTargetSha(fields.Target);
  requireValue(targetSha, 'One-shot marker Target does not contain a full commit SHA.');

  return {
    release: fields.Release,
    nonce: fields.Nonce,
    requestedAt: new Date(requestedAt).toISOString(),
    ageHours,
    targetSha,
    purpose: fields.Purpose,
    boundary: fields.Boundary,
    billingException
  };
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function markerBlob(commit, relative) {
  return gitOptional(['rev-parse', `${commit}:${relative}`]).toLowerCase();
}

function firstParent(commit) {
  return gitOptional(['rev-parse', `${commit}^1`]).toLowerCase();
}

function resolveFirstParentMarkerCommit(relative, maxDepth = 500) {
  let commit = git(['rev-parse', 'HEAD']).toLowerCase();
  for (let depth = 0; depth < maxDepth && commit; depth += 1) {
    const parent = firstParent(commit);
    const currentBlob = markerBlob(commit, relative);
    const parentBlob = parent ? markerBlob(parent, relative) : '';
    if (currentBlob && currentBlob !== parentBlob) return commit;
    commit = parent;
  }
  throw new Error(`Could not resolve a first-parent change for ${relative}.`);
}

function validTriggerSubject(subject, allowPrTest = false) {
  if (/^Dispatch guarded .*production release/i.test(String(subject || ''))) return true;
  return allowPrTest && /^Request guarded production release/i.test(String(subject || ''));
}

function runSelfTest() {
  const now = new Date('2026-08-03T18:35:00Z');
  const valid = `${exactConfirmation}\nRequested: 2026-08-03T18:30:00Z\nRelease: pr201-pr197-repaired-runtime-production-20260803-1830z\nTarget: current main 526c62c9deae9780de37e21ad77156f1eb053520 containing merged PR #197\nAuthorization: ${exactAuthorization}\nRequired proof: complete production build and fresh Cloudflare zero-overage budget approval\nPurpose: deploy the merged PR #197 repaired release\nBoundary: do not bypass the Cloudflare billing-period lock or zero-spend policy\nNonce: pr201-pr197-controlled-production-20260803T183000Z\n`;
  const parsed = validateMarker(valid, { now, maxAgeHours: 6 });
  requireValue(parsed.targetSha === '526c62c9deae9780de37e21ad77156f1eb053520', 'Self-test target parsing failed.');
  requireValue(validTriggerSubject('Dispatch guarded PR #197 production release'), 'Self-test rejected a valid merged dispatch subject.');
  requireValue(!validTriggerSubject('Request guarded production release after authority repair'), 'Self-test accepted a branch request subject in production mode.');
  requireValue(validTriggerSubject('Request guarded production release after authority repair', true), 'Self-test rejected a branch request subject in isolated PR-test mode.');

  const exceptionMarker = `${exactConfirmation}\nRequested: 2026-08-03T18:30:00Z\nRelease: pr201-pr197-one-time-billable-production-20260803-1830z\nTarget: current main 526c62c9deae9780de37e21ad77156f1eb053520 containing merged PR #197\nAuthorization: ${exactAuthorization}\nBilling exception: ${ownerExceptionAuthorization}\nRequired proof: complete production build and owner-authorized single billable-build exception on 2026-08-03\nPurpose: deploy the merged PR #197 repaired release\nBoundary: owner-authorized single billable build on 2026-08-03; all other zero-spend, credential, rollback and verification gates remain mandatory\nNonce: pr201-pr197-owner-billable-production-20260803T183000Z\n`;
  const exception = validateMarker(exceptionMarker, { now, maxAgeHours: 6 });
  requireValue(exception.billingException === ownerExceptionAuthorization, 'Self-test owner exception parsing failed.');

  let staleRejected = false;
  try {
    validateMarker(valid.replace('2026-08-03T18:30:00Z', '2026-08-02T18:30:00Z'), { now, maxAgeHours: 6 });
  } catch { staleRejected = true; }
  requireValue(staleRejected, 'Self-test did not reject a stale marker.');

  let boundaryRejected = false;
  try {
    validateMarker(valid.replace('do not bypass the Cloudflare billing-period lock or zero-spend policy', 'ordinary release'), { now, maxAgeHours: 6 });
  } catch { boundaryRejected = true; }
  requireValue(boundaryRejected, 'Self-test did not reject a weakened budget boundary.');

  console.log('ONE-SHOT PRODUCTION AUTHORIZATION SELF-TEST PASSED');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
  process.exit(0);
}

const confirmation = String(process.env.MATRIX_PRODUCTION_CONFIRMATION || '');
const actor = String(process.env.MATRIX_PRODUCTION_ACTOR || '');
const eventName = String(process.env.MATRIX_WORKFLOW_EVENT || '');
const billingException = String(process.env.MATRIX_BILLING_EXCEPTION || '').trim();
const markerRelative = process.env.MATRIX_PRODUCTION_TRIGGER_PATH || '.github/one-shot-controlled-production.trigger';
const markerPath = path.resolve(root, markerRelative);
const maxAgeHours = Number(process.env.MATRIX_AUTH_MAX_AGE_HOURS || 6);
const report = {
  ok: false,
  checkedAt: new Date().toISOString(),
  actor,
  eventName,
  mode: '',
  marker: markerRelative,
  headSha: '',
  targetSha: '',
  triggerCommit: '',
  triggerSubject: '',
  release: '',
  nonce: '',
  billingExceptionPresent: Boolean(billingException),
  ownerExceptionAuthorized: false,
  error: ''
};

try {
  requireValue(confirmation === exactConfirmation, 'Production release confirmation text did not match.');
  requireValue(eventName === 'workflow_dispatch', `Production release must use workflow_dispatch, not ${eventName || 'an unknown event'}.`);
  requireValue(actor, 'Production release actor is missing.');

  if (actor !== 'github-actions[bot]') {
    requireValue(!/\[bot\]$/i.test(actor) && actor !== 'dependabot[bot]', `Untrusted automated actor ${actor} cannot authorize production.`);
    if (billingException) {
      requireValue(
        billingException === ownerExceptionAuthorization,
        'Explicit human dispatch supplied an unrecognized billable-build exception.'
      );
      report.ownerExceptionAuthorized = true;
    }
    report.ok = true;
    report.mode = 'explicit-human-workflow-dispatch';
    writeReport(report);
    console.log(`PRODUCTION AUTHORIZATION PASS: explicit human workflow dispatch by ${actor}.`);
    process.exit(0);
  }

  requireValue(fs.existsSync(markerPath) && fs.statSync(markerPath).isFile(), `One-shot marker is missing: ${markerRelative}`);
  const markerText = fs.readFileSync(markerPath, 'utf8');
  const marker = validateMarker(markerText, { maxAgeHours });
  const headSha = git(['rev-parse', 'HEAD']).toLowerCase();
  const originMain = git(['rev-parse', 'refs/remotes/origin/main']).toLowerCase();
  const allowPrTest = process.env.NODE_ENV === 'test' && process.env.MATRIX_AUTH_ALLOW_NON_MAIN_TEST === '1';

  if (allowPrTest) {
    requireValue(!billingException, 'Automated one-shot dispatch cannot request a billable-build exception.');
  } else if (marker.billingException) {
    requireValue(
      billingException === marker.billingException && billingException === ownerExceptionAuthorization,
      'Automated one-shot dispatch cannot request a billable-build exception.'
    );
    report.ownerExceptionAuthorized = true;
  } else {
    requireValue(!billingException, 'Automated one-shot dispatch cannot request a billable-build exception.');
  }

  requireValue(allowPrTest || headSha === originMain, `Checked-out commit ${headSha} is not current origin/main ${originMain}.`);

  let targetIsAncestor = true;
  try { git(['merge-base', '--is-ancestor', marker.targetSha, 'HEAD']); }
  catch { targetIsAncestor = false; }
  requireValue(targetIsAncestor, `Authorized target ${marker.targetSha} is not an ancestor of current main ${headSha}.`);

  const triggerCommit = resolveFirstParentMarkerCommit(markerRelative);
  const triggerSubject = git(['show', '-s', '--format=%s', triggerCommit]);
  const triggerTime = Date.parse(git(['show', '-s', '--format=%cI', triggerCommit]));
  const triggerMarker = git(['show', `${triggerCommit}:${markerRelative}`]);
  requireValue(triggerCommit, 'Could not resolve the one-shot trigger commit.');
  requireValue(validTriggerSubject(triggerSubject, allowPrTest), `Unexpected one-shot trigger commit subject: ${triggerSubject}`);
  requireValue(triggerMarker.replace(/\r\n/g, '\n').trim() === markerText.replace(/\r\n/g, '\n').trim(), 'Current one-shot marker does not match the first-parent trigger commit.');
  requireValue(Number.isFinite(triggerTime), 'One-shot trigger commit timestamp is invalid.');
  const triggerAgeHours = (Date.now() - triggerTime) / 3600000;
  requireValue(triggerAgeHours >= -0.1 && triggerAgeHours <= maxAgeHours, `One-shot trigger commit age ${triggerAgeHours.toFixed(2)}h is outside the allowed window.`);

  let triggerIsAncestor = true;
  try { git(['merge-base', '--is-ancestor', triggerCommit, 'HEAD']); }
  catch { triggerIsAncestor = false; }
  requireValue(triggerIsAncestor, `One-shot trigger commit ${triggerCommit} is not on current main.`);

  report.ok = true;
  report.mode = marker.billingException
    ? 'fresh-merged-one-shot-owner-exception'
    : 'fresh-merged-one-shot-dispatch';
  report.headSha = headSha;
  report.targetSha = marker.targetSha;
  report.triggerCommit = triggerCommit;
  report.triggerSubject = triggerSubject;
  report.triggerAgeHours = triggerAgeHours;
  report.release = marker.release;
  report.nonce = marker.nonce;
  report.requestedAt = marker.requestedAt;
  report.markerAgeHours = marker.ageHours;
  writeReport(report);
  console.log(
    `PRODUCTION AUTHORIZATION PASS: fresh one-shot ${marker.nonce} authorizes current main ${headSha}; ` +
    (marker.billingException
      ? 'the dated owner billable-build exception is authorized and all remaining release gates stay mandatory.'
      : 'Cloudflare budget checks remain mandatory.')
  );
} catch (error) {
  report.error = String(error?.message || error);
  writeReport(report);
  console.error(`PRODUCTION AUTHORIZATION REFUSED: ${report.error}`);
  process.exit(1);
}
