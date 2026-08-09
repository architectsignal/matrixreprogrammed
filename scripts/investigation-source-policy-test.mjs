import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createInvestigationBroker, investigationSourceResource, investigationBrokerInternals } from '../ai-management/node/investigation-broker.mjs';

const root = process.cwd();
// Intentionally more than seven days after the static policy review. This catches
// the production failure where a still-valid reviewed policy was rejected because
// the generic seven-day zero-spend evidence clock had expired.
const fixedNow = new Date('2026-08-08T17:00:00.000Z');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'investigation-source-registry.json'), 'utf8'));
const policyFile = JSON.parse(fs.readFileSync(path.join(root, 'ai-management', 'config', 'investigation-source-policies.json'), 'utf8'));
const ledger = investigationBrokerInternals.loadInvestigationSourcePolicies(root);
const sources = new Map((registry.sources || []).map(source => [source.id, source]));
const productionRefreshSource = fs.readFileSync(path.join(root, 'scripts', 'run-production-intelligence-refresh.js'), 'utf8');

const dependentFreshnessBuilders = [
  'scripts/build-daily-epstein-update.js',
  'scripts/build-card-live-updates.js',
  'scripts/build-daily-watch.js'
];
const upstreamRefreshPosition = productionRefreshSource.indexOf("['scripts/update-seven-day-intel.js']");
assert.ok(upstreamRefreshPosition >= 0, 'Production refresh must update the authoritative seven-day source window');
for (const script of dependentFreshnessBuilders) {
  const position = productionRefreshSource.indexOf(`['${script}']`);
  assert.ok(position > upstreamRefreshPosition, `${script} must rebuild its freshness-governed dataset after the upstream source window`);
}

assert.equal(policyFile.updated, '2026-07-30');
assert.equal(Object.keys(ledger.policies).length, 10, 'Expected ten exact-URL reviewed official-source policies');
assert.equal(ledger.quarantine['wikileaks-publications']?.length > 0, true, 'WikiLeaks must remain explicitly quarantined');

for (const [sourceId, configuredPolicy] of Object.entries(ledger.policies)) {
  const source = sources.get(sourceId);
  assert.ok(source, `Policy references missing source ${sourceId}`);
  const policy = { ...(ledger.defaults || {}), ...configuredPolicy };
  assert.equal(source.authority, 'primary-official', `${sourceId} must remain a primary official source`);
  assert.equal(policy.sourceUrl, source.url, `${sourceId} policy must be bound to the exact registry URL`);
  for (const field of ['sourceUrl', 'officialDocumentationUrl', 'termsUrl', 'privacyUrl']) {
    assert.match(String(policy[field] || ''), /^https:\/\//, `${sourceId}.${field} must use HTTPS`);
  }
  assert.equal(policy.approvedForAutomation, true, `${sourceId} must explicitly approve automation through the effective reviewed policy`);
  assert.equal(policy.zeroSpendVerified, true, `${sourceId} must explicitly verify zero spend through the effective reviewed policy`);
  assert.equal(policy.quotaVerified, true, `${sourceId} must have an operator quota proof through the effective reviewed policy`);
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
  assert.equal(resource.payment_method_required, false, `${sourceId} must not require a payment method`);
  assert.equal(resource.monetary_cost_per_unit_eur, 0, `${sourceId} must cost exactly zero`);
  assert.equal(resource.billing_risk, 'none', `${sourceId} must retain zero billing risk`);
  assert.equal(resource.paid_fallback, false, `${sourceId} must not have a paid fallback`);
  assert.equal(resource.overage_possible, false, `${sourceId} must not permit overage`);
  assert.equal(resource.external_charge_possible, false, `${sourceId} must not expose a charge path`);
  assert.equal(resource.health_status, 'healthy', `${sourceId} bootstrap health proof should remain valid for the 14-day health window`);
  assert.equal(resource.zero_cost_evidence_at, fixedNow.toISOString(), `${sourceId} must receive a current runtime zero-spend attestation while the reviewed terms window remains valid`);
  assert.equal(resource.last_quota_check, fixedNow.toISOString(), `${sourceId} operator-capped quota must be attested at resource construction`);
  assert.equal(resource.metadata.runtime_zero_spend_attested, true, `${sourceId} runtime zero-spend attestation should be explicit`);
  assert.equal(resource.metadata.quota_evidence_kind, 'operator-capped-local', `${sourceId} quota proof must remain local/operator bounded`);
  assert.equal(resource.metadata.investigation_source_id, sourceId, `${sourceId} resource must retain exact source identity`);
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

// A recent failed request is degraded health, not a permanent lockout. The broker
// must be allowed to retry a reviewed zero-cost source and recover on success.
const justice = sources.get('doj-justice-news');
const epstein = sources.get('doj-epstein-disclosures');
assert.ok(justice && epstein, 'Expected DOJ policy fixtures');
const recentFailureAt = new Date(fixedNow.getTime() - 60 * 60 * 1000).toISOString();
const failedPriorState = {
  updated: recentFailureAt,
  sources: {
    [justice.id]: { status: 'failed-policy', checkedAt: recentFailureAt },
    [epstein.id]: { status: 'failed-request', checkedAt: recentFailureAt }
  }
};
const recoveryResource = investigationSourceResource(justice, { now: fixedNow, policyLedger: ledger, priorState: failedPriorState });
assert.equal(recoveryResource.health_status, 'degraded', 'A recent failed source check must remain retryable as degraded health');
assert.equal(recoveryResource.last_health_check, recentFailureAt, 'Recent failure timestamp must be retained as health evidence');

const calls = [];
const fakeFetch = async (url) => {
  calls.push(String(url));
  return new Response('<!doctype html><title>Justice News</title><a href="https://www.justice.gov/news/example">Example public record</a>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
};
const runtime = createInvestigationBroker({
  sources: [epstein, justice],
  priorState: failedPriorState,
  fetchImpl: fakeFetch,
  now: fixedNow,
  root,
  additionalResources: []
});
const recoveryResult = await runtime.broker.execute({
  job_type: 'public-data.fetch',
  capability_type: 'public_data',
  priority: 'P2',
  data_class: 'public',
  payload: {
    url: justice.url,
    method: 'GET',
    headers: { accept: 'text/html' },
    maximum_bytes: 1024 * 1024,
    quota_units: 1,
    source_id: justice.id
  },
  requirements: {
    cost_ceiling_eur: 0,
    minimum_quality_score: 80,
    minimum_provenance_score: 70,
    maximum_latency_ms: 5000,
    maximum_attempts: 2,
    requires_provenance: true,
    cacheable: false,
    cache_ttl_seconds: 0
  },
  metadata: { source_id: justice.id, investigator_mode: 'daily' }
});
assert.equal(recoveryResult.ok, true, 'Reviewed source should recover through the zero-spend broker');
assert.equal(recoveryResult.cost_confirmed_zero, true, 'Recovery fetch must remain zero-spend');
assert.equal(recoveryResult.selected_resource, `investigation-source-${justice.id}`, 'Same-host policies must never cross-select another source resource');
assert.deepEqual(calls, [justice.url], 'Recovery test must perform exactly one bounded request to the requested exact source URL');
const recoveredRegistryEntry = await runtime.registry.get(`investigation-source-${justice.id}`);
assert.equal(recoveredRegistryEntry.health_status, 'healthy', 'Successful retry must restore healthy state');
assert.equal(recoveredRegistryEntry.consecutive_failures, 0, 'Successful retry must clear failure count');

console.log(`Investigation source policy test passed: ${approvedDaily.length}/${daily.length} daily sources approved after the seven-day static-evidence boundary; exact-source zero-spend recovery succeeded and quarantined sources remain blocked.`);
