#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const mode = process.argv[2] || 'check';
// The legacy workflow token is retained only for historical validation. It is
// date-bound and cannot be reused by the ordinary production dispatcher.
const oneTimeAuthorization = 'OWNER AUTHORIZED ONE BILLABLE BUILD 2026-08-02';
const oneTimeExceptionDate = '2026-08-07';
const oneTimeSnapshotDate = '2026-08-02';
const policyPath = path.resolve(
  process.env.MATRIX_CLOUDFLARE_BUDGET_POLICY_PATH || '.github/build-budget-policy.json'
);
const repositoryAuthorizationPath = path.resolve(
  process.env.MATRIX_REPOSITORY_PRODUCTION_AUTHORIZATION_REPORT
    || 'downloads/repository-credential-production-authorization.json'
);
const releaseFreezePath = path.resolve(
  process.env.MATRIX_PRODUCTION_RELEASE_FREEZE_PATH || '.github/production-release.freeze'
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

function fullSha(value) {
  return /^[0-9a-f]{40}$/i.test(String(value || '').trim())
    ? String(value).trim().toLowerCase()
    : '';
}

function recordedGitBuildDisconnectionProof(policy) {
  const state = policy?.verifiedCloudflareConnectionState || {};
  const observedOn = String(state.observedOn || '').trim();
  const observedAt = Date.parse(String(state.observedAt || `${observedOn}T00:00:00.000Z`));
  const ageHours = Number.isFinite(observedAt) ? (Date.now() - observedAt) / 3600000 : Infinity;
  let freezeActive = false;
  try {
    freezeActive = /^State:\s*active\s*$/im.test(fs.readFileSync(releaseFreezePath, 'utf8'));
  } catch {
    freezeActive = false;
  }

  const checks = {
    workersDisconnected: state.workersGitBuilds === 'disconnected',
    pagesDisconnected: state.pagesGitDeployments === 'disconnected',
    sameLockedSnapshot: observedOn && observedOn === String(policy?.ownerUsageSnapshot?.observedOn || '').trim(),
    verificationRecorded: typeof state.verification === 'string' && state.verification.trim().length >= 20,
    freshEnoughForControlledRelease: ageHours >= -1 && ageHours <= 168,
    releaseFreezeActive: freezeActive,
    workerRuleFailClosed: policy?.releaseRules?.cloudflareWorkersGitConnectedBuilds === 'must-be-disconnected',
    pagesRuleFailClosed: policy?.releaseRules?.cloudflarePagesGitConnectedBuilds === 'must-be-disconnected'
  };
  const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
  return {
    ok: failed.length === 0,
    observedOn,
    ageHours,
    failed,
    checks,
    verification: String(state.verification || '').trim()
  };
}

function repositoryCredentialPushAuthorization() {
  if (process.env.GITHUB_EVENT_NAME !== 'push') {
    return { ok: false, reason: 'event-is-not-push' };
  }

  let authorization;
  try {
    authorization = JSON.parse(fs.readFileSync(repositoryAuthorizationPath, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      reason: `authorization-report-unavailable:${error.message}`
    };
  }

  const githubSha = fullSha(process.env.GITHUB_SHA);
  const headSha = fullSha(authorization.headSha);
  const workflowSha = fullSha(authorization.workflowSha);
  const parentSha = fullSha(authorization.parentSha);
  const targetSha = fullSha(authorization.targetSha);
  const changedFiles = Array.isArray(authorization.changedFiles)
    ? authorization.changedFiles.map(value => String(value || '').trim()).filter(Boolean)
    : [];

  const checks = {
    reportOk: authorization.ok === true,
    mode: authorization.mode === 'repository-credential-one-shot-push',
    actor: authorization.actor === 'architectsignal',
    event: authorization.event === 'push',
    ref: authorization.ref === 'refs/heads/main',
    billing: authorization.billingExceptionAuthorized === true,
    credentialSource: authorization.credentialSource === 'repository-secrets-without-production-environment',
    noError: !authorization.error,
    exactChangedFile: changedFiles.length === 1
      && changedFiles[0] === '.github/repository-credential-production.trigger',
    exactHead: Boolean(githubSha) && headSha === githubSha,
    workflowHead: !workflowSha || workflowSha === headSha,
    parentTarget: Boolean(parentSha) && parentSha === targetSha
  };

  const failed = Object.entries(checks)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  return {
    ok: failed.length === 0,
    reason: failed.length ? `failed:${failed.join(',')}` : 'verified',
    authorization
  };
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

    const workflowEvent = String(process.env.GITHUB_EVENT_NAME || '').trim();
    const repositoryPush = repositoryCredentialPushAuthorization();
    const allowedEvent = !workflowEvent
      || workflowEvent === 'workflow_dispatch'
      || repositoryPush.ok;
    if (!allowedEvent) {
      fail(
        `The one-time exception requires workflow_dispatch or a verified repository-credential push, `
        + `not ${workflowEvent || 'unknown'} (${repositoryPush.reason}).`
      );
      process.exit();
    }
    if (process.env.GITHUB_RUN_ATTEMPT && process.env.GITHUB_RUN_ATTEMPT !== '1') {
      fail('The one-time exception cannot be used for a workflow re-run attempt.');
      process.exit();
    }

    const lane = repositoryPush.ok
      ? 'verified one-file repository-credential push'
      : 'workflow_dispatch';
    console.log(
      'Cloudflare one-time owner exception PASS: one billable production build is authorized only on ' +
      `${oneTimeExceptionDate} Europe/London through ${lane}, against the recorded ` +
      `${oneTimeSnapshotDate} snapshot of 5,470 billable minutes and $27.34. ` +
      'All non-budget release gates remain mandatory.'
    );
    process.exit();
  }
  if (mode !== 'release') {
    throw new Error(`Unknown mode ${JSON.stringify(mode)}; use check, release or owner-exception.`);
  }

  const expected = requireFiniteNumber(
    process.env.EXPECTED_CLOUDFLARE_BUILD_MINUTES || 0,
    'EXPECTED_CLOUDFLARE_BUILD_MINUTES'
  );
  const environmentDisconnectionProof = isTrue(process.env.CLOUDFLARE_GIT_BUILDS_DISCONNECTED);
  const recordedDisconnectionProof = recordedGitBuildDisconnectionProof(policy);
  if (!environmentDisconnectionProof && !recordedDisconnectionProof.ok) {
    fail(
      'Cloudflare Git-build disconnection is not proved. Set CLOUDFLARE_GIT_BUILDS_DISCONNECTED=true only after live verification, ' +
      `or refresh the fail-closed owner connection snapshot. Recorded proof failed: ${recordedDisconnectionProof.failed.join(', ') || 'unknown'}.`
    );
    process.exit();
  }
  if (!environmentDisconnectionProof) {
    console.log(
      `Cloudflare Git-build disconnection proof PASS from owner-verified locked-period snapshot ${recordedDisconnectionProof.observedOn} ` +
      `(${recordedDisconnectionProof.ageHours.toFixed(1)}h old) while the controlled production freeze is active. ` +
      `Recorded verification: ${recordedDisconnectionProof.verification}`
    );
  }

  // The current-period lock protects Cloudflare Workers Builds minutes. A
  // controlled release built in GitHub Actions and uploaded with Wrangler is a
  // zero-Workers-Build-minute lane when EXPECTED_CLOUDFLARE_BUILD_MINUTES=0.
  // Keep the lock absolute for any release that expects even one Workers Builds
  // minute, while allowing the already-designed external-CI Wrangler lane.
  if (budget.currentBillingPeriodLocked) {
    if (expected !== 0) {
      fail(budget.lockReason || 'The current billing period is locked.');
      process.exit();
    }

    const metrics = policy.ownerUsageSnapshot?.metrics || {};
    const nonBuildRisks = Object.entries(metrics)
      .filter(([name]) => name !== 'workersBuildMinutes')
      .filter(([, metric]) => {
        const billable = Number(metric?.billable || 0);
        const cost = Number(metric?.costUsd || 0);
        const total = Number(metric?.total || 0);
        const includedMetric = Number(metric?.included || 0);
        return !Number.isFinite(billable)
          || !Number.isFinite(cost)
          || !Number.isFinite(total)
          || !Number.isFinite(includedMetric)
          || billable !== 0
          || cost !== 0
          || (includedMetric > 0 && total >= includedMetric);
      })
      .map(([name]) => name);
    if (nonBuildRisks.length) {
      fail(`Locked-period Wrangler lane refused because non-build snapshot risk exists for: ${nonBuildRisks.join(', ')}.`);
      process.exit();
    }

    console.log(
      'Cloudflare locked-period zero-build PASS: Git-connected builds are disconnected, ' +
      'EXPECTED_CLOUDFLARE_BUILD_MINUTES=0, and every recorded non-build Cloudflare metric remains non-billable and below its included allowance. ' +
      'The existing Workers Builds overage is not authorized to increase.'
    );
    process.exit();
  }

  if (!isTrue(process.env.CLOUDFLARE_ZERO_BILLABLE_USAGE_CONFIRMED)) {
    fail('CLOUDFLARE_ZERO_BILLABLE_USAGE_CONFIRMED must be true after checking every metered product.');
    process.exit();
  }

  const used = requireFiniteNumber(process.env.CLOUDFLARE_BUILD_MINUTES_USED, 'CLOUDFLARE_BUILD_MINUTES_USED');
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
