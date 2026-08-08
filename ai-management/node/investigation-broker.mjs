import fs from 'node:fs';
import path from 'node:path';
import { ResourceRegistry, createLocalResource } from '../resource-registry/resource-registry.mjs';
import { InMemoryQuotaManager } from '../quota-manager/quota-manager.mjs';
import { StructuredAuditLogger } from '../observability/structured-logger.mjs';
import { ResourceBroker } from '../resource-broker/resource-broker.mjs';
import { DeterministicLocalAdapter } from '../provider-adapters/local/deterministic-local.mjs';
import { ApprovedPublicSourceHttpAdapter } from '../provider-adapters/datasets/approved-public-source-http.mjs';

const MAX_HEALTH_EVIDENCE_AGE_MS = 14 * 86400000;

function safeHostname(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ''; }
}

function timestampCurrent(value, now, maximumAgeMs) {
  const checked = Date.parse(String(value || ''));
  const age = Number.isFinite(checked) ? now.getTime() - checked : Infinity;
  return Number.isFinite(checked) && age >= 0 && age <= maximumAgeMs;
}

function recentSuccessfulHealth(prior, now, maximumAgeMs = MAX_HEALTH_EVIDENCE_AGE_MS) {
  return prior?.status === 'fetched' && timestampCurrent(prior?.checkedAt, now, maximumAgeMs);
}

function sourceHealthEvidence(prior, policy, now, maximumAgeMs = MAX_HEALTH_EVIDENCE_AGE_MS) {
  if (timestampCurrent(prior?.checkedAt, now, maximumAgeMs)) {
    if (prior?.status === 'fetched') return { status: 'healthy', checkedAt: prior.checkedAt };
    if (String(prior?.status || '').startsWith('failed')) return { status: 'degraded', checkedAt: prior.checkedAt };
  }
  if (timestampCurrent(policy?.bootstrapHealthVerifiedAt, now, maximumAgeMs)) {
    return { status: 'healthy', checkedAt: policy.bootstrapHealthVerifiedAt };
  }
  return { status: 'unknown', checkedAt: null };
}

function loadAutonomousResources(root = process.cwd()) {
  const file = path.join(root, 'ai-management', 'config', 'resources.autonomous.json');
  try {
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(payload.resources) ? payload.resources : [];
  } catch {
    return [];
  }
}

function loadInvestigationSourcePolicies(root = process.cwd()) {
  const file = path.join(root, 'ai-management', 'config', 'investigation-source-policies.json');
  try {
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      defaults: payload.defaults && typeof payload.defaults === 'object' ? payload.defaults : {},
      policies: payload.policies && typeof payload.policies === 'object' ? payload.policies : {},
      quarantine: payload.quarantine && typeof payload.quarantine === 'object' ? payload.quarantine : {}
    };
  } catch {
    return { defaults: {}, policies: {}, quarantine: {} };
  }
}

function policyForSource(source, policyLedger = {}) {
  const configured = policyLedger.policies?.[source.id];
  const exactUrlMatch = configured && configured.sourceUrl === source.url;
  const verified = exactUrlMatch ? { ...(policyLedger.defaults || {}), ...configured } : {};
  return { ...verified, ...(source.resourcePolicy || {}) };
}

function reviewedPolicyWindowCurrent(policy, now) {
  const lastTermsCheck = Date.parse(String(policy?.lastTermsCheck || ''));
  const revalidationDue = Date.parse(String(policy?.termsRevalidationDue || ''));
  return Number.isFinite(lastTermsCheck) && lastTermsCheck <= now.getTime() &&
    Number.isFinite(revalidationDue) && revalidationDue > now.getTime();
}

function runtimeZeroSpendAttestation(policy, now) {
  const ceiling = Number(policy?.hardDailyRequestCeiling);
  const operatorQuota = policy?.quotaVerified === true && Number.isFinite(ceiling) && ceiling > 0;
  const structurallyNoChargePath = policy?.approvedForAutomation === true &&
    policy?.zeroSpendVerified === true &&
    String(policy?.billingRisk || '') === 'none';
  const current = structurallyNoChargePath && operatorQuota && reviewedPolicyWindowCurrent(policy, now);
  return {
    current,
    checkedAt: current ? now.toISOString() : null,
    reason: current
      ? 'Exact reviewed public-source policy is still inside its terms revalidation window; the adapter has no credential, payment, paid-fallback or overage path and quota is locally operator-capped.'
      : 'The reviewed policy is incomplete, outside its revalidation window, or lacks a bounded zero-spend quota.'
  };
}

function investigationResourceCompatibility(resource, job) {
  if (resource?.adapter_id !== 'approved-public-source-http') return { eligible: true, reasons: [] };
  const requestedSourceId = String(job?.metadata?.source_id || '');
  const resourceSourceId = String(resource?.metadata?.investigation_source_id || '');
  if (!requestedSourceId) return { eligible: false, reasons: ['investigation-source-id-missing'] };
  if (!resourceSourceId || resourceSourceId !== requestedSourceId) {
    return { eligible: false, reasons: ['investigation-source-policy-scope-mismatch'] };
  }
  return { eligible: true, reasons: [] };
}

export function investigationSourceResource(source, { priorState = {}, now = new Date(), dailyLimit = 100, policyLedger = {} } = {}) {
  const policy = policyForSource(source, policyLedger);
  const approved = policy.approvedForAutomation === true && policy.zeroSpendVerified === true;
  const prior = priorState.sources?.[source.id] || {};
  const health = sourceHealthEvidence(prior, policy, now);
  const runtimeAttestation = runtimeZeroSpendAttestation(policy, now);
  const authorityScore = source.authority === 'primary-official' ? 94 : source.authority === 'credible-investigative-archive' ? 82 : 72;
  const limit = Math.max(1, Number(policy.hardDailyRequestCeiling || dailyLimit));
  const quarantinedReason = policyLedger.quarantine?.[source.id] || null;
  const storedZeroCostEvidenceAt = policy.zeroCostEvidenceAt || policy.lastPricingCheck || policy.lastTermsCheck || null;
  const zeroCostEvidenceAt = runtimeAttestation.checkedAt || storedZeroCostEvidenceAt;
  const quotaCheckAt = runtimeAttestation.checkedAt || policy.lastQuotaCheck || policy.lastTermsCheck || null;
  return {
    resource_id: `investigation-source-${source.id}`,
    provider_name: source.label,
    service_name: source.type === 'rss' ? 'Approved public feed' : 'Approved public data endpoint',
    capability_types: ['public_data'],
    resource_tier: 3,
    official_documentation_url: policy.officialDocumentationUrl || null,
    terms_url: policy.termsUrl || null,
    privacy_url: policy.privacyUrl || null,
    status_url: policy.statusUrl || null,
    licence: policy.licence || null,
    account_owner: null,
    authentication_type: 'none',
    credential_reference: null,
    approved_for_automation: approved,
    approved_data_classes: ['public'],
    prohibited_data_classes: ['internal', 'confidential', 'restricted'],
    free_quota_amount: limit,
    free_quota_unit: 'operator-capped requests per run/day',
    quota_reset_period: 'daily',
    quota_reset_time: '00:00 UTC',
    quota_remaining: limit,
    quota_reserved: 0,
    hard_stop_threshold: Math.max(1, Math.ceil(limit * 0.1)),
    quota_verified: policy.quotaVerified === true,
    quota_unlimited: false,
    billing_enabled: false,
    billing_risk: policy.billingRisk || 'unknown',
    payment_method_present: false,
    payment_method_required: false,
    monetary_cost_per_unit_eur: 0,
    zero_cost_verified: policy.zeroSpendVerified === true,
    zero_cost_evidence_at: zeroCostEvidenceAt,
    last_pricing_check: zeroCostEvidenceAt,
    paid_fallback: false,
    overage_possible: false,
    auto_upgrade_enabled: false,
    external_charge_possible: false,
    quality_score: authorityScore,
    reliability_score: Number(policy.reliabilityScore || 85),
    latency_score: Number(policy.latencyScore || 75),
    privacy_score: 95,
    provenance_score: authorityScore,
    quota_efficiency_score: 90,
    last_health_check: health.checkedAt,
    health_status: health.status,
    last_terms_check: policy.lastTermsCheck || null,
    terms_revalidation_due: policy.termsRevalidationDue || null,
    last_quota_check: quotaCheckAt,
    last_success: prior.status === 'fetched' ? prior.checkedAt : null,
    last_failure: prior.status?.startsWith('failed') ? prior.checkedAt : null,
    consecutive_failures: prior.status?.startsWith('failed') ? 1 : 0,
    cooldown_until: null,
    average_latency: 0,
    success_rate: prior.status === 'fetched' ? 1 : prior.status?.startsWith('failed') ? 0.8 : 0.8,
    error_rate: prior.status === 'fetched' ? 0 : prior.status?.startsWith('failed') ? 0.2 : 0.2,
    supported_job_types: ['public-data.fetch'],
    maximum_payload: 8 * 1024 * 1024,
    rate_limit: `${limit} requests with 10% emergency reserve`,
    concurrency_limit: Math.max(1, Number(policy.concurrencyLimit || 1)),
    fallback_resource_ids: [],
    implementation_status: approved ? 'production' : 'disabled',
    adapter_id: 'approved-public-source-http',
    adapter_version: '1.0.0',
    enabled: approved,
    manual_approval_required: !approved,
    allowed_hosts: [safeHostname(source.url)].filter(Boolean),
    metadata: {
      investigation_source_id: source.id,
      exact_source_url: source.url,
      runtime_zero_spend_attested: runtimeAttestation.current,
      runtime_zero_spend_reason: runtimeAttestation.reason,
      quota_evidence_kind: 'operator-capped-local'
    },
    notes: approved
      ? `Exact-URL verified source policy for ${source.id}; zero-spend and operator quota boundaries enforced.`
      : quarantinedReason || `Source ${source.id} awaits terms, quota, health and automation approval.`,
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };
}

function enabled(value, fallback) {
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

export function createInvestigationBroker({
  sources = [],
  priorState = {},
  fetchImpl = globalThis.fetch,
  userAgent,
  maximumBytes = 8 * 1024 * 1024,
  environment = {},
  now = new Date(),
  sleep,
  random,
  additionalResources = null,
  root = process.cwd()
} = {}) {
  const brokerClock = () => new Date(now.getTime());
  const discovered = Array.isArray(additionalResources) ? additionalResources : loadAutonomousResources(root);
  const policyLedger = loadInvestigationSourcePolicies(root);
  const combined = [createLocalResource(now.toISOString()), ...sources.map(source => investigationSourceResource(source, {
    priorState,
    now,
    dailyLimit: Number(environment.INVESTIGATION_RESOURCE_DAILY_LIMIT || 100),
    policyLedger
  })), ...discovered];
  const resources = [...new Map(combined.map(resource => [resource.resource_id, resource])).values()];
  const registry = new ResourceRegistry(resources);
  const logger = new StructuredAuditLogger({
    actor: 'investigation-runner',
    agent: 'ai-investigator-resource-broker',
    clock: brokerClock
  });
  const broker = new ResourceBroker({
    registry,
    adapters: [
      new DeterministicLocalAdapter(),
      new ApprovedPublicSourceHttpAdapter({ fetchImpl, userAgent, maximumBytes, clock: brokerClock })
    ],
    quotaManager: new InMemoryQuotaManager(),
    logger,
    policyContext: {
      zeroSpendLock: enabled(environment.AI_RESOURCE_ZERO_SPEND_LOCK, true),
      externalEnabled: enabled(environment.AI_RESOURCE_EXTERNAL_ENABLED, true),
      localOnly: enabled(environment.AI_RESOURCE_LOCAL_ONLY, false),
      resourceEligibilityEvaluator: investigationResourceCompatibility
    },
    clock: brokerClock,
    sleep,
    random
  });
  return {
    broker,
    registry,
    logger,
    autonomousResourcesLoaded: discovered.length,
    verifiedSourcePoliciesLoaded: Object.keys(policyLedger.policies || {}).length,
    quarantinedSourcePoliciesLoaded: Object.keys(policyLedger.quarantine || {}).length
  };
}

export const investigationBrokerInternals = {
  safeHostname,
  timestampCurrent,
  recentSuccessfulHealth,
  sourceHealthEvidence,
  enabled,
  loadAutonomousResources,
  loadInvestigationSourcePolicies,
  policyForSource,
  reviewedPolicyWindowCurrent,
  runtimeZeroSpendAttestation,
  investigationResourceCompatibility
};
