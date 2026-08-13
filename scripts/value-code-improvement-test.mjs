import assert from 'node:assert/strict';
import {
  buildValueCollectionAdapterCandidate, certifyValueCollectionAdapterCandidate
} from '../ai-management/value-hunter/value-code-improvement.mjs';

const safe = {
  adapter_id: 'official-refund-api-v1',
  official_url: 'https://claims.example.gov/refunds',
  claim_endpoint: 'https://claims.example.gov/api/v1/refunds/claim',
  credential_vault_reference: 'vault://providers/official-refund-api-v1',
  validated_terms_hash: 'a'.repeat(64),
  automation_permitted: true,
  idempotency_supported: true,
  receipt_reconciliation_supported: true
};

const candidate = await buildValueCollectionAdapterCandidate(safe, { now: new Date('2026-08-13T16:00:00.000Z') });
assert.equal(candidate.state, 'static-tested');
assert.equal(candidate.activation_allowed, false);
assert.match(candidate.target_path, /^ai-management\/provider-adapters\/value\/generated\//);
assert.match(candidate.source_code, /VALUE_ADAPTER_NOT_LIVE_CERTIFIED/);
assert.match(candidate.source_code, /idempotencyEnforced = true/);
assert.match(candidate.source_code, /receipt\.reconciled === true/);
assert.match(candidate.source_sha256, /^[a-f0-9]{64}$/);

const certification = certifyValueCollectionAdapterCandidate(candidate);
assert.equal(certification.certified, true);
assert.equal(certification.state, 'sandbox-candidate');
assert.equal(certification.activation_allowed, false);

for (const mutation of [
  { claim_endpoint: 'https://attacker.example/claim' },
  { official_url: 'http://claims.example.gov/refunds' },
  { credential_vault_reference: 'plain-text-secret' },
  { validated_terms_hash: '' },
  { automation_permitted: false },
  { idempotency_supported: false },
  { receipt_reconciliation_supported: false },
  { client_secret: 'must-never-enter-a-proposal' }
]) {
  const rejected = await buildValueCollectionAdapterCandidate({ ...safe, ...mutation });
  assert.equal(rejected.state, 'quarantined', `unsafe specification must be quarantined: ${JSON.stringify(mutation)}`);
  assert.equal(rejected.source_code, null);
  assert.ok(rejected.blockers.length > 0);
}

const tampered = certifyValueCollectionAdapterCandidate({ ...candidate, source_code: `${candidate.source_code}\nprocess.env.PROVIDER_SECRET` });
assert.equal(tampered.certified, false);
assert.ok(tampered.blockers.includes('forbidden-code-detected'));

console.log('Value code improvement passed: same-host official specifications generate self-tested adapter candidates while secrets, hostile endpoints, missing idempotency/reconciliation and automatic activation remain blocked.');
