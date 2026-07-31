import assert from 'node:assert/strict';
import { buildAdapterBlueprint, certifyGeneratedAdapter } from '../ai-management/adapter-factory/adapter-factory.mjs';
import { runHarmlessLiveProbe } from '../ai-management/adapter-factory/live-probe-certifier.mjs';

const now = new Date('2026-07-31T18:00:00.000Z');
const opportunity = {
  opportunity_id: 'opportunity-example-public-api',
  provider_name: 'Example Public API',
  official_url: 'https://api.example.test/data',
  capability_type: 'public_data',
  job_type: 'public-data.fetch',
  authentication_type: 'none',
  account_required: false,
  identity_verification_required: false,
  payment_method_required: false,
  paid_fallback: false,
  overage_possible: false,
  auto_upgrade_enabled: false,
  external_charge_possible: false,
  billing_risk: 'none',
  zero_cost_verified: true,
  quota_verified: true,
  quota_unlimited: false,
  free_quota: 100,
  automation_permission: 'allowed',
  zero_cost_evidence_at: now.toISOString()
};

const blueprint = buildAdapterBlueprint(opportunity, { now });
const sandboxCertification = certifyGeneratedAdapter(blueprint);
let tick = 1000;
const fetchImpl = async (url, options) => {
  assert.equal(url, opportunity.official_url);
  assert.equal(options.method, 'GET');
  assert.match(options.headers.range, /^bytes=0-/);
  tick += 25;
  return new Response('{"ok":true}', {
    status: 200,
    headers: { 'content-type': 'application/json', 'content-length': '11' }
  });
};

const certified = await runHarmlessLiveProbe({
  blueprint,
  sandboxCertification,
  opportunity,
  fetchImpl,
  now,
  clock: () => tick
});
assert.equal(certified.certified, true);
assert.equal(certified.certification_state, 'live-certified');
assert.equal(certified.activation_allowed, true);
assert.equal(certified.probes.length, 2);
assert.equal(certified.broker_resource.enabled, true);
assert.equal(certified.broker_resource.manual_approval_required, false);
assert.equal(certified.broker_resource.billing_enabled, false);
assert.equal(certified.broker_resource.payment_method_present, false);
assert.equal(certified.broker_resource.monetary_cost_per_unit_eur, 0);
assert.equal(certified.broker_resource.billing_risk, 'none');
assert.deepEqual(certified.broker_resource.allowed_hosts, ['api.example.test']);
assert.equal(certified.zero_spend_receipt.cost_confirmed_zero, true);

for (const mutation of [
  { probeUrl: 'https://evil.example.test/data' },
  { opportunity: { ...opportunity, payment_method_required: true } },
  { opportunity: { ...opportunity, free_quota: 2 } },
  { opportunity: { ...opportunity, authentication_type: 'api_key' } },
  { opportunity: { ...opportunity, automation_permission: 'unknown' } },
  { sandboxCertification: { ...sandboxCertification, certified: false } }
]) {
  const rejected = await runHarmlessLiveProbe({
    blueprint,
    sandboxCertification,
    opportunity,
    fetchImpl,
    now,
    clock: () => tick,
    ...mutation
  });
  assert.equal(rejected.certified, false, `mutation should be rejected: ${JSON.stringify(mutation)}`);
  assert.equal(rejected.activation_allowed, false);
  assert.ok(rejected.blockers.length > 0);
}

const badType = await runHarmlessLiveProbe({
  blueprint,
  sandboxCertification,
  opportunity,
  now,
  clock: () => tick,
  fetchImpl: async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })
});
assert.equal(badType.certified, false);
assert.ok(badType.blockers.includes('all-live-probes-must-pass'));

const failedProbe = await runHarmlessLiveProbe({
  blueprint,
  sandboxCertification,
  opportunity,
  now,
  clock: () => tick,
  fetchImpl: async () => new Response('error', { status: 503, headers: { 'content-type': 'text/plain' } })
});
assert.equal(failedProbe.certified, false);
assert.equal(failedProbe.activation_allowed, false);

console.log('Adapter live-probe tests passed: bounded same-host probes, zero-spend revalidation, benchmark receipts and automatic broker admission only after full certification.');
