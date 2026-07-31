import assert from 'node:assert/strict';
import { buildAdapterBlueprint, certifyGeneratedAdapter } from '../ai-management/adapter-factory/adapter-factory.mjs';

const now = new Date('2026-07-31T16:00:00.000Z');
const safe = {
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

const blueprint = buildAdapterBlueprint(safe, { now });
assert.equal(blueprint.ok, true);
assert.equal(blueprint.certification_state, 'sandbox-candidate');
assert.deepEqual(blueprint.allowed_hosts, ['api.example.test']);
assert.match(blueprint.code, /GeneratedPublicFetchAdapter/);
assert.match(blueprint.code, /ZERO_SPEND_INVARIANT_VIOLATION/);

const certification = certifyGeneratedAdapter(blueprint);
assert.equal(certification.certified, true);
assert.equal(certification.certification_state, 'sandbox-certified');
assert.equal(certification.activation_allowed, false, 'generated adapters must remain inactive until a later live-probe stage');

for (const mutation of [
  { payment_method_required: true },
  { paid_fallback: true },
  { overage_possible: true },
  { auto_upgrade_enabled: true },
  { external_charge_possible: true },
  { billing_risk: 'unknown' },
  { zero_cost_verified: false },
  { quota_verified: false },
  { free_quota: 0 },
  { authentication_type: 'api_key' },
  { account_required: true },
  { identity_verification_required: true },
  { automation_permission: 'unknown' },
  { official_url: 'http://api.example.test/data' },
  { capability_type: 'llm' },
  { job_type: 'llm.generate' }
]) {
  const rejected = buildAdapterBlueprint({ ...safe, ...mutation }, { now });
  assert.equal(rejected.ok, false, `mutation should be quarantined: ${JSON.stringify(mutation)}`);
  assert.equal(rejected.certification_state, 'quarantined');
  assert.equal(rejected.code, null);
  assert.ok(rejected.blockers.length > 0);
}

const tampered = certifyGeneratedAdapter({
  ...blueprint,
  code: `${blueprint.code}\nprocess.env.SECRET`
});
assert.equal(tampered.certified, false);
assert.ok(tampered.blockers.includes('forbidden-code-detected'));

console.log('Adapter Factory tests passed: deterministic public-only generation, zero-spend certification, credential/payment quarantine and no automatic activation.');
