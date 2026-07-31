import { evaluateZeroSpendInvariant } from '../policy-engine/zero-spend-invariant.mjs';

const ALLOWED_CAPABILITIES = new Set(['public_data']);
const ALLOWED_JOB_TYPES = new Set(['public-data.fetch']);
const FORBIDDEN_CODE = /\b(child_process|execSync|spawnSync|eval\s*\(|new\s+Function|process\.env|fs\.|net\.|tls\.|dgram\.|worker_threads)\b/;

function safeId(value) {
  return String(value || 'provider').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'provider';
}

function officialHost(url) {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.protocol === 'https:' ? parsed.hostname.toLowerCase() : '';
  } catch {
    return '';
  }
}

export function buildAdapterBlueprint(opportunity = {}, { now = new Date() } = {}) {
  const invariantSubject = {
    resource_tier: 3,
    monetary_cost_per_unit_eur: 0,
    billing_enabled: false,
    payment_method_present: opportunity.payment_method_required === false ? false : undefined,
    payment_method_required: opportunity.payment_method_required,
    paid_fallback: opportunity.paid_fallback,
    overage_possible: opportunity.overage_possible,
    auto_upgrade_enabled: opportunity.auto_upgrade_enabled,
    external_charge_possible: opportunity.external_charge_possible,
    billing_risk: opportunity.billing_risk,
    zero_cost_verified: opportunity.zero_cost_verified,
    quota_verified: opportunity.quota_verified,
    quota_unlimited: opportunity.quota_unlimited,
    quota_remaining: opportunity.free_quota,
    zero_cost_evidence_at: opportunity.zero_cost_evidence_at || opportunity.evaluated_at
  };
  const invariant = evaluateZeroSpendInvariant(invariantSubject, { now, requireCurrentEvidence: true });
  const host = officialHost(opportunity.official_url);
  const capability = String(opportunity.capability_type || 'public_data');
  const jobType = String(opportunity.job_type || 'public-data.fetch');
  const blockers = [...invariant.violations];
  if (!host) blockers.push('official-https-host-missing');
  if (!ALLOWED_CAPABILITIES.has(capability)) blockers.push('capability-not-template-approved');
  if (!ALLOWED_JOB_TYPES.has(jobType)) blockers.push('job-type-not-template-approved');
  if (opportunity.authentication_type !== 'none') blockers.push('credentials-not-permitted-in-autonomous-template');
  if (opportunity.account_required === true) blockers.push('account-required');
  if (opportunity.identity_verification_required === true) blockers.push('identity-verification-required');
  if (opportunity.automation_permission !== 'allowed') blockers.push('automation-permission-not-explicit');

  const adapterId = `generated-${safeId(opportunity.provider_name || host)}`;
  const uniqueBlockers = [...new Set(blockers)];
  return {
    ok: uniqueBlockers.length === 0,
    certification_state: uniqueBlockers.length === 0 ? 'sandbox-candidate' : 'quarantined',
    adapter_id: adapterId,
    allowed_hosts: host ? [host] : [],
    capability_types: [capability],
    supported_job_types: [jobType],
    blockers: uniqueBlockers,
    generated_at: now.toISOString(),
    source_opportunity_id: opportunity.opportunity_id || null,
    code: uniqueBlockers.length ? null : renderPublicFetchAdapter({ adapterId, host })
  };
}

export function renderPublicFetchAdapter({ adapterId, host }) {
  const source = `export class GeneratedPublicFetchAdapter {\n  constructor({ fetchImpl = globalThis.fetch, clock = () => new Date() } = {}) {\n    this.adapter_id = ${JSON.stringify(adapterId)};\n    this.adapter_version = '0.1.0-sandbox';\n    this.fetchImpl = fetchImpl;\n    this.clock = clock;\n  }\n\n  async execute(job, resource) {\n    if (job.job_type !== 'public-data.fetch' || job.capability_type !== 'public_data') throw Object.assign(new Error('Unsupported generated-adapter job'), { code: 'GENERATED_ADAPTER_JOB_REJECTED' });\n    if (job.data_class !== 'public') throw Object.assign(new Error('Generated adapter accepts public data only'), { code: 'GENERATED_ADAPTER_DATA_REJECTED' });\n    const url = new URL(String(job.payload?.url || ''));\n    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== ${JSON.stringify(host)}) throw Object.assign(new Error('Generated adapter host rejected'), { code: 'GENERATED_ADAPTER_HOST_REJECTED' });\n    if (resource.billing_enabled !== false || resource.payment_method_present !== false || Number(resource.monetary_cost_per_unit_eur) !== 0 || resource.billing_risk !== 'none') throw Object.assign(new Error('ZERO_SPEND_INVARIANT_VIOLATION'), { code: 'ZERO_SPEND_INVARIANT_VIOLATION' });\n    const response = await this.fetchImpl(url, { method: 'GET', redirect: 'error', headers: { accept: 'application/json,text/plain;q=0.9,*/*;q=0.1' } });\n    if (!response.ok) throw Object.assign(new Error('Provider request failed'), { code: 'PROVIDER_HTTP_ERROR', retryable: response.status >= 500 });\n    const text = await response.text();\n    return { ok: true, output: { status: response.status, text }, provenance: { source_urls: [url.toString()], retrieved_at: this.clock().toISOString(), adapter_id: this.adapter_id, adapter_version: this.adapter_version } };\n  }\n}\n`;
  if (FORBIDDEN_CODE.test(source)) throw new Error('Generated adapter template contains forbidden code');
  return source;
}

export function certifyGeneratedAdapter(blueprint = {}) {
  const blockers = [...(blueprint.blockers || [])];
  if (!blueprint.ok || !blueprint.code) blockers.push('blueprint-not-buildable');
  if (blueprint.code && FORBIDDEN_CODE.test(blueprint.code)) blockers.push('forbidden-code-detected');
  if (!Array.isArray(blueprint.allowed_hosts) || blueprint.allowed_hosts.length !== 1) blockers.push('single-host-boundary-required');
  if (!blueprint.code?.includes("job.data_class !== 'public'")) blockers.push('public-data-boundary-missing');
  if (!blueprint.code?.includes('ZERO_SPEND_INVARIANT_VIOLATION')) blockers.push('zero-spend-runtime-guard-missing');
  const uniqueBlockers = [...new Set(blockers)];
  return {
    certified: uniqueBlockers.length === 0,
    certification_state: uniqueBlockers.length === 0 ? 'sandbox-certified' : 'quarantined',
    blockers: uniqueBlockers,
    adapter_id: blueprint.adapter_id || null,
    activation_allowed: false
  };
}

export const adapterFactoryInternals = { ALLOWED_CAPABILITIES, ALLOWED_JOB_TYPES, FORBIDDEN_CODE, safeId, officialHost };
