#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const mode = process.argv[2] || 'check';
// One-use owner token for the final 2026-08-05 controlled release. The date,
// workflow-dispatch and first-attempt checks below prevent ordinary reuse.
const oneTimeAuthorization = 'OWNER AUTHORIZED ONE BILLABLE BUILD 2026-08-05';
const oneTimeExceptionDate = '2026-08-05';
const oneTimeSnapshotDate = '2026-08-02';
const policyPath = path.resolve(
  process.env.MATRIX_CLOUDFLARE_BUDGET_POLICY_PATH || '.github/build-budget-policy.json'
);

function fail(message) {
  console.error(`CLOUDFLARE BUDGET LOCK: ${message}`);
  process.exitCode = 1;
}

function requireFiniteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return number;
}

function isTrue(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

let policy;
try {
  policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
} catch (error) {
  fail(`Cannot read a valid policy at ${policyPath}: ${error.message}`);
  process.exit();
}

try {
  const budget = policy.cloudflareWorkersBuildMinutes;
  const rules = policy.releaseRules;
  if (policy.schemaVersion !== 2 || !String(policy.status || '').startsWith('enforced')) {
    throw new Error('The versioned policy is not enforced.');
  }
  const included = requireFiniteNumber(budget.includedPerMonth, 'includedPerMonth');
  const warning = requireFiniteNumber(budget.warningThreshold, 'warningThreshold');
  const ceiling = requireFiniteNumber(budget.ordinaryConsumptionCeiling, 'ordinaryConsumptionCeiling');
  const reserve = requireFiniteNumber(budget.emergencyAndReportingDelayReserve, 'emergencyAndReportingDelayReserve');
  if (!(warning < ceiling && ceiling < included)) {
    throw new Error('Expected warningThreshold < ordinaryConsumptionCeiling < includedPerMonth.');
  }
  if (ceiling + reserve !== included) {
    throw new Error('The ordinary ceiling and reserve must exactly partition the included minutes.');
  }
  if (rules.cloudflareWorkersGitConnectedBuilds !== 'must-be-disconnected') {
    throw new Error('Cloudflare Workers Git-connected builds are not fail-closed.');
  }
  if (rules.cloudflarePagesGitConnectedBuilds !== 'must-be-disconnected') {
    throw new Error('Cloudflare Pages Git-connected builds are not fail-closed.');
  }
  if (rules.nonProductionBranchBuilds !== 'must-be-disabled') {
    throw new Error('Non-production branch builds are not fail-closed.');
  }

  const observedBuilds = policy.ownerUsageSnapshot?.metrics?.workersBuildMinutes;
  const observedBillable = requireFiniteNumber(observedBuilds?.billable, 'snapshot workersBuildMinutes.billable');
  const observedCost = requireFiniteNumber(observedBuilds?.costUsd, 'snapshot workersBuildMinutes.costUsd');
  console.log(
    `Cloudflare budget policy valid: ${ceiling}/${included} ordinary build minutes, ` +
    `${reserve} reserved; owner snapshot reports ${observedBillable} billable minutes and $${observedCost.toFixed(2)} usage cost.`
  );

  if (mode === 'check') {
    process.exit();
  }
  if (mode === 'owner-exception') {
    const londonDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    if (londonDate !== oneTimeExceptionDate) {
      fail(`The one-time billable-build exception is valid only on ${oneTimeExceptionDate}; London date is ${londonDate}.`);
      process.exit();
    }
    if (process.env.CLOUDFLARE_ONE_TIME_BILLABLE_BUILD_AUTHORIZATION !== oneTimeAuthorization) {
      fail('The one-time owner authorization phrase did not match.');
      process.exit();
    }
    if (
      !budget.currentBillingPeriodLocked ||
      policy.ownerUsageSnapshot?.observedOn !== oneTimeSnapshotDate ||
      observedBillable !== 5470 ||
      observedCost !== 27.34
    ) {
      fail(`The one-time exception is not bound to the locked ${oneTimeSnapshotDate} owner usage snapshot.`);
      process.exit();
    }
    if (process.env.GITHUB_EVENT_NAME && process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
      fail(`The one-time exception requires workflow_dispatch, not ${process.env.GITHUB_EVENT_NAME}.`);
      process.exit();
    }
    if (process.env.GITHUB_RUN_ATTEMPT && process.env.GITHUB_RUN_ATTEMPT !== '1') {
      fail('The one-time exception cannot be used for a workflow re-run attempt.');
      process.exit();
    }
    console.log(
      'Cloudflare one-time owner exception PASS: one billable production build is authorized only on ' +
      `${oneTimeExceptionDate} Europe/London against the recorded ${oneTimeSnapshotDate} snapshot ` +
      'of 5,470 billable minutes and $27.34. All non-budget release gates remain mandatory.'
    );
    process.exit();
  }
  if (mode !== 'release') {
    throw new Error(`Unknown mode ${JSON.stringify(mode)}; use check, release or owner-exception.`);
  }

  if (budget.currentBillingPeriodLocked) {
    fail(budget.lockReason || 'The current billing period is locked.');
    process.exit();
  }
  if (!isTrue(process.env.CLOUDFLARE_GIT_BUILDS_DISCONNECTED)) {
    fail('CLOUDFLARE_GIT_BUILDS_DISCONNECTED must be true only after both Workers and Pages Git builds are verified disconnected.');
    process.exit();
  }
  if (!isTrue(process.env.CLOUDFLARE_ZERO_BILLABLE_USAGE_CONFIRMED)) {
    fail('CLOUDFLARE_ZERO_BILLABLE_USAGE_CONFIRMED must be true after checking every metered product.');
    process.exit();
  }

  const used = requireFiniteNumber(process.env.CLOUDFLARE_BUILD_MINUTES_USED, 'CLOUDFLARE_BUILD_MINUTES_USED');
  const expected = requireFiniteNumber(process.env.EXPECTED_CLOUDFLARE_BUILD_MINUTES || 0, 'EXPECTED_CLOUDFLARE_BUILD_MINUTES');
  const checkedAt = Date.parse(process.env.CLOUDFLARE_USAGE_CHECKED_AT_UTC || '');
  if (!Number.isFinite(checkedAt)) {
    fail('CLOUDFLARE_USAGE_CHECKED_AT_UTC must be a valid ISO-8601 timestamp.');
    process.exit();
  }
  const ageHours = (Date.now() - checkedAt) / 3600000;
  const maxAge = requireFiniteNumber(rules.requireFreshUsageSnapshotHours, 'requireFreshUsageSnapshotHours');
  if (ageHours < -0.25 || ageHours > maxAge) {
    fail(`The Cloudflare usage check is ${ageHours.toFixed(1)} hours old; it must be between 0 and ${maxAge} hours old.`);
    process.exit();
  }
  if (used + expected >= ceiling) {
    fail(`Build usage ${used} + expected ${expected} reaches the ${ceiling}-minute ordinary ceiling.`);
    process.exit();
  }

  console.log(
    `Cloudflare release budget PASS: ${used} used + ${expected} expected; ` +
    `${ceiling - used - expected} ordinary minutes remain and ${reserve} emergency minutes stay reserved.`
  );
} catch (error) {
  fail(error.message);
}
