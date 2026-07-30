import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { investigationSourceResource, investigationBrokerInternals } from '../ai-management/node/investigation-broker.mjs';

const root = process.cwd();
const fixedNow = new Date('2026-07-30T12:00:00.000Z');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'investigation-source-registry.json'), 'utf8'));
const policyFile = JSON.parse(fs.readFileSync(path.join(root, 'ai-management', 'config', 'investigation-source-policies.json'), 'utf8'));
const ledger = investigationBrokerInternals.loadInvestigationSourcePolicies(root);
const sources = new Map((registry.sources || []).map(source => [source.id, source]));

assert.equal(policyFile.updated, '2026-07-30');
assert.equal(Object.keys(ledger.policies).length, 10, 'Expected ten exact-URL reviewed official-source policies');
assert.equal(ledger.quarantine['wikileaks-publications']?.length > 0, true, 'WikiLeaks must remain explicitly quarantined');

for (const [sourceId, policy] of Object.entries(ledger.policies)) {
  const source = sources.get(sourceId);
  assert.ok(source, `Policy references missing source ${sourceId}`);
  assert.equal(source.authority, 'primary-official', `${sourceId} must remain a primary official source`);
  assert.equal(policy.sourceUrl, source.url, `${sourceId} policy must be bound to the exact registry URL`);
  for (const field of ['sourceUrl', 'officialDocumentationUrl', 'termsUrl', 'privacyUrl']) {
    assert.match(String(policy[field] || ''), /^https:\/\//, `${sourceId}.${field} must use HTTPS`);
  }
  assert.equal(policy.approvedForAutomation, true, `${sourceId} must explicitly approve automation`);
  assert.equal(policy.zeroSpendVerified, true, `${sourceId} must explicitly verify zero spend`);
  assert.equal(policy.quotaVerified, true, `${sourceId} must have an operator quota proof`);
  assert.equal(policy.billingRisk, 'none', `${sourceId} must have no billing risk`);
  assert.ok(Number(policy.hardDailyRequestCeiling) >= 2 && Number(policy.hardDailyRequestCeiling) <= 50, `${sourceId} request ceiling is unsafe`);
  assert.equal(policy.concurrencyLimit, 1, `${sourceId} concurrency must remain one`);
  assert.ok(Date.parse(policy.lastTermsCheck) <= fixedNow.getTime(), `${sourceId} terms check is invalid`);
  assert.ok(Date.parse(policy.lastQuotaCheck) <= fixedNow.getTime(), `${sourceId} quota check is invalid`);
  assert.ok(Date.parse(policy.termsRevalidationDue) > fixedNow.getTime(), `${sourceId} terms review is expired`);

  const resource = investigationSourceResource(source, { now: fixedNow, policyLedger: ledger });
  assert.equal(resource.enabled, true, `${sourceId} reviewed resource should be enabled`);
  assert.equal(resource.approved_for_automation, true, `${sourceId} reviewed resource should be approved`);
  assert.equal(resource.manual_approval_required, false, `${sourceId} reviewed resource should not require manual approval`);
  assert.equal(resource.billing_enabled, false, `${sourceId} must not enable billing`);
  assert.equal(resource.payment_method_present, false, `${sourceId} must not have a payment method`);
  assert.equal(resource.monetary_cost_per_unit_eur, 0, `${sourceId} must cost exactly zero`);
  assert.equal(resource.billing_risk, 'none', `${sourceId} must retain zero billing risk`);
  assert.equal(resource.health_status, 'healthy', `${sourceId} bootstrap health proof is missing`);
  assert.deepEqual(resource.allowed_hosts, [new URL(source.url).hostname.toLowerCase()]);

  const changedUrl = { ...source, url: `${source.url}${source.url.includes('?') ? '&' : '?'}unreviewed-change=1` };
  const changedResource = investigationSourceResource(changedUrl, { now: fixedNow, policyLedger: ledger });
  assert.equal(changedResource.enabled, false, `${sourceId} changed URL must lose approval`);
  assert.equal(changedResource.manual_approval_required, true, `${sourceId} changed URL must return to review`);
}

const daily = (registry.sources || []).filter(source => (source.frequency || []).includes('daily'));
const approvedDaily = daily.filter(source => investigationSourceResource(source, { now: fixedNow, policyLedger: ledger }).enabled);
assert.ok(approvedDaily.length >= 10, `Expected a healthy official-source majority, received ${approvedDaily.length}/${daily.length}`);

const wikileaks = sources.get('wikileaks-publications');
assert.ok(wikileaks, 'WikiLeaks registry source is missing');
const quarantined = investigationSourceResource(wikileaks, { now: fixedNow, policyLedger: ledger });
assert.equal(quarantined.enabled, false);
assert.equal(quarantined.approved_for_automation, false);
assert.equal(quarantined.manual_approval_required, true);
assert.match(quarantined.notes, /not auto-approved/i);

console.log(`Investigation source policy test passed: ${approvedDaily.length}/${daily.length} daily sources approved through exact-URL zero-spend proofs; WikiLeaks and changed URLs remain quarantined.`);
