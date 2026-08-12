'use strict';

const assert = require('assert');
const {
  authoritativeFullProofHealthy,
  compactUniformWaf,
  supplementalFailureCanPreserveAuthoritativeSuccess
} = require('./live-production-verification-policy.js');

const sha = '801a0f39518baa7764c12647818ce70f2dccc1df';
const verifierSource = require('fs').readFileSync(require('path').join(__dirname, 'verify-live-production.js'), 'utf8');
assert.ok(
  verifierSource.includes('manifestIsCommitBound && manifestSha === mainSha'),
  'current-main equality must be recorded whether or not main advanced during the run'
);
assert.ok(
  !verifierSource.includes('manifestIsCommitBound && mainAdvancedDuringRun && manifestSha === mainSha'),
  'current-main equality must not contradict a stable exact-SHA release'
);
function full(overrides = {}) {
  return {
    ok: true,
    expectedSha: sha,
    mainSha: sha,
    mainAdvancedDuringRun: false,
    manifestSha: sha,
    manifestIsCommitBound: true,
    manifestMatchesExpected: true,
    manifestMatchesCurrentMain: true,
    manifestMatches: true,
    manifestStatus: 200,
    healthStatus: 200,
    healthMatches: true,
    routeResults: [
      { route: '/', status: 200, ok: true },
      { route: '/membership', status: 200, ok: true }
    ],
    paypalBoundary: { ok: true, anonymousChargePossible: false },
    emailAutomationBoundary: { ok: true },
    forumPersistence: { ok: true, anonymousWriteRejected: true },
    ...overrides
  };
}
function waf(overrides = {}) {
  return {
    ok: false,
    statuses: {
      '/deploy-manifest.json': 403,
      '/deploy-health.json': 403,
      '/api/member/me': 403,
      '/forum-health': 403
    },
    cfRays: ['abc-SJC'],
    failures: [
      { route: '/deploy-manifest.json', status: 403, reason: 'blocked' },
      { route: '/deploy-health.json', status: 403, reason: 'blocked' },
      { route: '/api/member/me', status: 403, reason: 'blocked' },
      { route: '/forum-health', status: 403, reason: 'blocked' }
    ],
    ...overrides
  };
}

assert.equal(authoritativeFullProofHealthy(full()), true, 'healthy exact full proof must be authoritative');
assert.equal(compactUniformWaf(waf()), true, 'uniform Cloudflare 403 supplement must be classified as WAF-only');
assert.equal(supplementalFailureCanPreserveAuthoritativeSuccess(full(), waf()), true, 'WAF-only supplement must not downgrade authoritative success');
assert.equal(supplementalFailureCanPreserveAuthoritativeSuccess(full({ manifestMatchesCurrentMain: false }), waf()), false, 'current-main mismatch must fail closed');
assert.equal(supplementalFailureCanPreserveAuthoritativeSuccess(full(), waf({ statuses: { '/deploy-manifest.json': 403, '/deploy-health.json': 500 } })), false, 'non-uniform supplemental failure must fail closed');
assert.equal(supplementalFailureCanPreserveAuthoritativeSuccess(full(), waf({ failures: [{ route: 'wrangler.toml', status: 0, reason: 'local contract mismatch' }] })), false, 'local deterministic mismatch must fail closed');
assert.equal(supplementalFailureCanPreserveAuthoritativeSuccess(full({ forumPersistence: { ok: false, anonymousWriteRejected: false } }), waf()), false, 'forum proof failure must fail closed');
assert.equal(supplementalFailureCanPreserveAuthoritativeSuccess(full({ emailAutomationBoundary: { ok: false } }), waf()), false, 'email proof failure must fail closed');

console.log('LIVE PRODUCTION VERIFICATION POLICY TEST PASSED: exact authoritative success survives only uniform Cloudflare WAF-only supplemental failure; deterministic contradictions remain fail-closed.');
