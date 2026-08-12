import assert from 'node:assert/strict';
import { OpportunityHunter, evaluateOpportunity } from '../ai-management/opportunity-hunter/opportunity-hunter.mjs';

const fixedNow = new Date('2026-07-31T18:00:00.000Z');
const clock = () => fixedNow;
const fetchImpl = async url => {
  const value = String(url);
  if (value.endsWith('/docs')) {
    return new Response('Free tier. No payment method required. Programmatic access permitted. Automation allowed. Includes 100 requests/day.', { status: 200, headers: { 'content-type': 'text/plain' } });
  }
  if (value.endsWith('/terms')) {
    return new Response('This service is free of charge. API access permitted. Requests stop when the free quota is exhausted.', { status: 200, headers: { 'content-type': 'text/plain' } });
  }
  if (value.endsWith('/privacy')) {
    return new Response('Public privacy notice.', { status: 200, headers: { 'content-type': 'text/plain' } });
  }
  return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
};

const base = {
  provider_name: 'Example Public Compute',
  service_name: 'Example Free Inference',
  kind: 'inference_api',
  official_url: 'https://compute.example.org',
  documentation_url: 'https://compute.example.org/docs',
  terms_url: 'https://compute.example.org/terms',
  privacy_url: 'https://compute.example.org/privacy',
  authentication_type: 'none',
  account_required: false,
  identity_verification_required: false,
  payment_method_required: false,
  automation_permission: 'allowed',
  commercial_use: 'allowed',
  zero_cost_verified: true,
  quota_verified: true,
  free_quota: 100,
  free_quota_unit: 'requests/day',
  supported_capabilities: ['llm'],
  metadata: { quota_evidence_terms: ['100 requests/day'] }
};

const approved = await evaluateOpportunity(base, { fetchImpl, now: fixedNow });
assert.equal(approved.approval_state, 'approved-auto');
assert.equal(approved.auto_activatable, true);
assert.equal(approved.blockers.length, 0);
assert.equal(approved.service_probe.ok, true);
assert.ok(approved.evidence.includes('official-material-confirms-zero-cost-access'));
assert.ok(approved.evidence.includes('official-material-confirms-automation-permission'));
assert.ok(approved.evidence.includes('official-material-confirms-declared-quota'));

const officialNoAuthFetch = async url => new Response(
  String(url).endsWith('/docs')
    ? 'These APIs do not require any authentication or API keys to access. Automated access must comply with the published fair-access policy. The limit is 10 requests per second.'
    : 'Public API access remains subject to a limit of 10 requests per second.',
  { status: 200, headers: { 'content-type': 'text/plain' } }
);
const officialNoAuth = await evaluateOpportunity({
  ...base,
  opportunity_id: 'opportunity-official-no-auth',
  kind: 'dataset',
  documentation_url: 'https://compute.example.org/docs',
  metadata: { quota_evidence_terms: ['10 requests per second'] }
}, { fetchImpl: officialNoAuthFetch, now: fixedNow });
assert.equal(officialNoAuth.approval_state, 'approved-auto');
assert.ok(officialNoAuth.evidence.includes('official-material-confirms-zero-cost-access'));
assert.ok(officialNoAuth.evidence.includes('official-material-confirms-automation-permission'));

const staleQuota = await evaluateOpportunity({ ...base, free_quota: 200, metadata: { quota_evidence_terms: ['200 requests/day'] } }, { fetchImpl, now: fixedNow });
assert.equal(staleQuota.approval_state, 'quarantined');
assert.ok(staleQuota.blockers.includes('declared-quota-language-not-found'));

const ownerRequired = await evaluateOpportunity({
  ...base,
  opportunity_id: 'opportunity-owner-compute',
  kind: 'compute',
  authentication_type: 'api_key',
  account_required: true
}, { fetchImpl, now: fixedNow });
assert.equal(ownerRequired.approval_state, 'awaiting-owner');
assert.equal(ownerRequired.auto_activatable, false);
assert.ok(ownerRequired.owner_actions.includes('owner-account-creation-required'));
assert.ok(ownerRequired.owner_actions.includes('owner-approval-required-for-capacity-program'));
assert.ok(ownerRequired.owner_actions.includes('credential-onboarding-required'));

const unsafe = await evaluateOpportunity({
  ...base,
  opportunity_id: 'opportunity-unsafe',
  payment_method_required: true,
  zero_cost_verified: false,
  automation_permission: 'unknown'
}, { fetchImpl, now: fixedNow });
assert.equal(unsafe.approval_state, 'quarantined');
assert.equal(unsafe.auto_activatable, false);
assert.ok(unsafe.blockers.includes('payment-method-required'));
assert.ok(unsafe.blockers.includes('zero-cost-not-verified'));
assert.ok(unsafe.blockers.includes('automation-permission-not-explicit'));

const unavailableService = await evaluateOpportunity(base, {
  now: fixedNow,
  fetchImpl: async url => String(url) === base.official_url
    ? new Response('unavailable', { status: 503 })
    : fetchImpl(url)
});
assert.equal(unavailableService.approval_state, 'quarantined');
assert.ok(unavailableService.blockers.includes('service-health-probe-failed'));

const hunter = new OpportunityHunter({ fetchImpl, clock, concurrency: 2 });
const report = await hunter.run({ opportunities: [base, { ...base, opportunity_id: 'opportunity-owner-compute', kind: 'compute', authentication_type: 'api_key', account_required: true }, { ...base, opportunity_id: 'opportunity-unsafe', payment_method_required: true, zero_cost_verified: false, automation_permission: 'unknown' }] });
assert.equal(report.discovered, 3);
assert.equal(report.approved_auto.length, 1);
assert.equal(report.awaiting_owner.length, 1);
assert.equal(report.quarantined.length, 1);
assert.match(report.policy, /owner approval/i);

console.log('Opportunity Hunter tests passed: lawful zero-cost auto-approval, owner-gated compute onboarding and fail-closed quarantine.');
