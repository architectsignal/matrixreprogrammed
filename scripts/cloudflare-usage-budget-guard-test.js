#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const guard = path.join(__dirname, 'cloudflare-usage-budget-guard.js');
const sourcePolicy = JSON.parse(fs.readFileSync(path.join(root, '.github', 'build-budget-policy.json'), 'utf8'));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-cloudflare-budget-'));
const policyPath = path.join(tempDir, 'policy.json');

function run(policy, mode = 'release', overrides = {}) {
  fs.writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
  return spawnSync(process.execPath, [guard, mode], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      MATRIX_CLOUDFLARE_BUDGET_POLICY_PATH: policyPath,
      CLOUDFLARE_GIT_BUILDS_DISCONNECTED: 'true',
      CLOUDFLARE_ZERO_BILLABLE_USAGE_CONFIRMED: 'true',
      CLOUDFLARE_BUILD_MINUTES_USED: '2500',
      CLOUDFLARE_USAGE_CHECKED_AT_UTC: new Date().toISOString(),
      ...overrides
    }
  });
}

const locked = run(sourcePolicy);
assert.notStrictEqual(locked.status, 0, 'The owner-reported overage period must be locked.');
assert.match(locked.stderr, /5,470 billable build minutes/);

const exceptionDenied = run(sourcePolicy, 'owner-exception');
assert.notStrictEqual(exceptionDenied.status, 0, 'The one-day exception must fail without the exact owner phrase.');

const exceptionAllowed = run(sourcePolicy, 'owner-exception', {
  CLOUDFLARE_ONE_TIME_BILLABLE_BUILD_AUTHORIZATION: 'OWNER AUTHORIZED ONE BILLABLE BUILD 2026-08-02'
});
assert.strictEqual(exceptionAllowed.status, 0, exceptionAllowed.stderr);
assert.match(exceptionAllowed.stdout, /one-time owner exception PASS/);

const nextPeriod = structuredClone(sourcePolicy);
nextPeriod.status = 'enforced';
nextPeriod.cloudflareWorkersBuildMinutes.currentBillingPeriodLocked = false;
nextPeriod.cloudflareWorkersBuildMinutes.lockReason = '';
nextPeriod.ownerUsageSnapshot.metrics.workersBuildMinutes.billable = 0;
nextPeriod.ownerUsageSnapshot.metrics.workersBuildMinutes.costUsd = 0;

const allowed = run(nextPeriod);
assert.strictEqual(allowed.status, 0, allowed.stderr);
assert.match(allowed.stdout, /Cloudflare release budget PASS/);

const atCeiling = run(nextPeriod, 'release', { CLOUDFLARE_BUILD_MINUTES_USED: '4000' });
assert.notStrictEqual(atCeiling.status, 0, 'Usage at the ordinary ceiling must fail closed.');

const stale = run(nextPeriod, 'release', {
  CLOUDFLARE_USAGE_CHECKED_AT_UTC: new Date(Date.now() - 25 * 3600000).toISOString()
});
assert.notStrictEqual(stale.status, 0, 'A stale billing snapshot must fail closed.');

const connected = run(nextPeriod, 'release', { CLOUDFLARE_GIT_BUILDS_DISCONNECTED: 'false' });
assert.notStrictEqual(connected.status, 0, 'Connected Cloudflare Git builds must fail closed.');

const pagesRuleMissing = structuredClone(nextPeriod);
delete pagesRuleMissing.releaseRules.cloudflarePagesGitConnectedBuilds;
const pagesConnected = run(pagesRuleMissing, 'check');
assert.notStrictEqual(pagesConnected.status, 0, 'Missing Cloudflare Pages disconnect policy must fail closed.');

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('Cloudflare zero-overage budget guard PASS: locked, allowed, ceiling, stale-snapshot, Workers Git and Pages Git states verified.');
