import fs from 'node:fs';
import path from 'node:path';
import { ResourceRegistry, createLocalResource } from '../resource-registry/resource-registry.mjs';
import { InMemoryQuotaManager } from '../quota-manager/quota-manager.mjs';
import { StructuredAuditLogger } from '../observability/structured-logger.mjs';
import { ResourceBroker } from '../resource-broker/resource-broker.mjs';
import { DeterministicLocalAdapter } from '../provider-adapters/local/deterministic-local.mjs';
import { ApprovedPublicSourceHttpAdapter } from '../provider-adapters/datasets/approved-public-source-http.mjs';

function safeHostname(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ''; }
}

function recentSuccessfulHealth(prior, now, maximumAgeMs = 14 * 86400000) {
  const checked = Date.parse(prior?.checkedAt || '');
  return prior?.status === 'fetched' && Number.isFinite(checked) && now.getTime() - checked >= 0 && now.getTime() - checked <= maximumAgeMs;
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

export function investigationSourceResource(source, { priorState = {}, now = new Date(), dailyLimit = 100 } = {}) {
  const policy = source.resourcePolicy || {};
  const approved = policy.approvedForAutomation === true && policy.zeroSpendVerified === true;
  const prior = priorState.sources?.[source.id] || {};
  const healthy = recentSuccessfulHealth(prior, now) || policy.bootstrapHealthVerifiedAt === now.toISOString().slice(0, 10);
  const authorityScore = source.authority === 'primary-official' ? 94 : source.authority === 'credible-investigative-archive' ? 82 : 72;
  const limit = Math.max(1, Number(policy.hardDailyRequestCeiling || dailyLimit));
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
    monetary_cost_per_unit_eur: 0,
    quality_score: authorityScore,
    reliability_score: Number(policy.reliabilityScore || 85),
    latency_score: Number(policy.latencyScore || 75),
    privacy_score: 95,
    provenance_score: authorityScore,
    quota_efficiency_score: 90,
    last_health_check: healthy ? (prior.checkedAt || `${now.toISOString().slice(0, 10)}T00:00:00.000Z`) : null,
    health_status: healthy ? 'healthy' : 'unknown',
    last_terms_check: policy.lastTermsCheck || null,
    terms_revalidation_due: policy.termsRevalidationDue || null,
    last_quota_check: policy.lastQuotaCheck || policy.lastTermsCheck || null,
    last_success: prior.status === 'fetched' ? prior.checkedAt : null,
    last_failure: prior.status?.startsWith('failed') ? prior.checkedAt : null,
    consecutive_failures: prior.status?.startsWith('failed') ? 1 : 0,
    cooldown_until: null,
    average_latency: 0,
    success_rate: prior.status === 'fetched' ? 1 : 0.8,
    error_rate: prior.status === 'fetched' ? 0 : 0.2,
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
    notes: approved ? `Approved source registry entry ${source.id}.` : `Source ${source.id} awaits terms, quota, and automation approval.`,
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
  const discovered = Array.isArray(additionalResources) ? additionalResources : loadAutonomousResources(root);
  const combined = [createLocalResource(now.toISOString()), ...sources.map(source => investigationSourceResource(source, {
    priorState, now, dailyLimit: Number(environment.INVESTIGATION_RESOURCE_DAILY_LIMIT || 100)
  })), ...discovered];
  const resources = [...new Map(combined.map(resource => [resource.resource_id, resource])).values()];
  const registry = new ResourceRegistry(resources);
  const logger = new StructuredAuditLogger({ actor: 'investigation-runner', agent: 'ai-investigator-resource-broker' });
  const broker = new ResourceBroker({
    registry,
    adapters: [
      new DeterministicLocalAdapter(),
      new ApprovedPublicSourceHttpAdapter({ fetchImpl, userAgent, maximumBytes })
    ],
    quotaManager: new InMemoryQuotaManager(),
    logger,
    policyContext: {
      zeroSpendLock: enabled(environment.AI_RESOURCE_ZERO_SPEND_LOCK, true),
      externalEnabled: enabled(environment.AI_RESOURCE_EXTERNAL_ENABLED, true),
      localOnly: enabled(environment.AI_RESOURCE_LOCAL_ONLY, false)
    },
    sleep,
    random
  });
  return { broker, registry, logger, autonomousResourcesLoaded: discovered.length };
}

export const investigationBrokerInternals = { safeHostname, recentSuccessfulHealth, enabled, loadAutonomousResources };
