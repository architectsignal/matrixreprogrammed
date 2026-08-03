#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'one-shot-production-authorization.json');
const exactConfirmation = 'DEPLOY MATRIX REPROGRAMMED';
const exactAuthorization = 'exactly one controlled Cloudflare production deployment';

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
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
  requireValue(/fresh Cloudflare zero-overage budget approval/i.test(fields['Required proof'] || ''), 'One-shot marker does not require fresh Cloudflare budget approval.');
  requireValue(/do not bypass the Cloudflare billing-period lock/i.test(fields.Boundary || ''), 'One-shot marker does not preserve the billing-period lock.');
  requireValue(/zero-spend policy/i.test(fields.Boundary || ''), 'One-shot marker does not preserve the zero-spend policy.');

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
    boundary: fields.Boundary
  };
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function runSelfTest() {
  const now = new Date('2026-08-03T16:00:00Z');
  const valid = `${exactConfirmation}\nRequested: 2026-08-03T15:55:00Z\nRelease: pr197-5ef11b37-repaired-runtime-production-20260803-1555z\nTarget: current main 5ef11b375eabef539d532dee8553c3c7b380c5cf containing merged PR #197\nAuthorization: ${exactAuthorization}\nRequired proof: complete production build and fresh Cloudflare zero-overage budget approval\nPurpose: deploy the merged PR #197 repaired release\nBoundary: do not bypass the Cloudflare billing-period lock or zero-spend policy\nNonce: pr197-5ef11b37-controlled-production-20260803T155500Z\n`;
  const parsed = validateMarker(valid, { now, maxAgeHours: 6 });
  requireValue(parsed.targetSha === '5ef11b375eabef539d532dee8553c3c7b380c5cf', 'Self-test target parsing failed.');

  let staleRejected = false;
  try {
    validateMarker(valid.replace('2026-08-03T15:55:00Z', '2026-08-02T15:55:00Z'), { now, maxAgeHours: 6 });
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
  release: '',
  nonce: '',
  billingExceptionPresent: Boolean(billingException),
  error: ''
};

try {
  requireValue(confirmation === exactConfirmation, 'Production release confirmation text did not match.');
  requireValue(eventName === 'workflow_dispatch', `Production release must use workflow_dispatch, not ${eventName || 'an unknown event'}.`);
  requireValue(actor, 'Production release actor is missing.');

  if (actor !== 'github-actions[bot]') {
    requireValue(!/\[bot\]$/i.test(actor) && actor !== 'dependabot[bot]', `Untrusted automated actor ${actor} cannot authorize production.`);
    report.ok = true;
    report.mode = 'explicit-human-workflow-dispatch';
    writeReport(report);
    console.log(`PRODUCTION AUTHORIZATION PASS: explicit human workflow dispatch by ${actor}.`);
    process.exit(0);
  }

  requireValue(!billingException, 'Automated one-shot dispatch cannot request a billable-build exception.');
  requireValue(fs.existsSync(markerPath) && fs.statSync(markerPath).isFile(), `One-shot marker is missing: ${markerRelative}`);
  const marker = validateMarker(fs.readFileSync(markerPath, 'utf8'), { maxAgeHours });
  const headSha = git(['rev-parse', 'HEAD']).toLowerCase();
  const originMain = git(['rev-parse', 'refs/remotes/origin/main']).toLowerCase();
  const allowPrTest = process.env.NODE_ENV === 'test' && process.env.MATRIX_AUTH_ALLOW_NON_MAIN_TEST === '1';
  requireValue(allowPrTest || headSha === originMain, `Checked-out commit ${headSha} is not current origin/main ${originMain}.`);

  let targetIsAncestor = true;
  try { git(['merge-base', '--is-ancestor', marker.targetSha, 'HEAD']); }
  catch { targetIsAncestor = false; }
  requireValue(targetIsAncestor, `Authorized target ${marker.targetSha} is not an ancestor of current main ${headSha}.`);

  const triggerCommit = git(['log', '-1', '--format=%H', '--', markerRelative]).toLowerCase();
  const triggerSubject = git(['show', '-s', '--format=%s', triggerCommit]);
  const triggerTime = Date.parse(git(['show', '-s', '--format=%cI', triggerCommit]));
  requireValue(triggerCommit, 'Could not resolve the one-shot trigger commit.');
  requireValue(/^Dispatch guarded .*production release/i.test(triggerSubject), `Unexpected one-shot trigger commit subject: ${triggerSubject}`);
  requireValue(Number.isFinite(triggerTime), 'One-shot trigger commit timestamp is invalid.');
  const triggerAgeHours = (Date.now() - triggerTime) / 3600000;
  requireValue(triggerAgeHours >= -0.1 && triggerAgeHours <= maxAgeHours, `One-shot trigger commit age ${triggerAgeHours.toFixed(2)}h is outside the allowed window.`);

  let triggerIsAncestor = true;
  try { git(['merge-base', '--is-ancestor', triggerCommit, 'HEAD']); }
  catch { triggerIsAncestor = false; }
  requireValue(triggerIsAncestor, `One-shot trigger commit ${triggerCommit} is not on current main.`);

  report.ok = true;
  report.mode = 'fresh-merged-one-shot-dispatch';
  report.headSha = headSha;
  report.targetSha = marker.targetSha;
  report.triggerCommit = triggerCommit;
  report.triggerAgeHours = triggerAgeHours;
  report.release = marker.release;
  report.nonce = marker.nonce;
  report.requestedAt = marker.requestedAt;
  report.markerAgeHours = marker.ageHours;
  writeReport(report);
  console.log(`PRODUCTION AUTHORIZATION PASS: fresh one-shot ${marker.nonce} authorizes current main ${headSha}; Cloudflare budget checks remain mandatory.`);
} catch (error) {
  report.error = String(error?.message || error);
  writeReport(report);
  console.error(`PRODUCTION AUTHORIZATION REFUSED: ${report.error}`);
  process.exit(1);
}
