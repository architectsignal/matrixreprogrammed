import { evaluateZeroSpendInvariant, zeroSpendReceipt } from '../policy-engine/zero-spend-invariant.mjs';

const ACCEPTED_CONTENT_TYPES = ['application/json', 'text/plain', 'application/xml', 'text/xml', 'application/rss+xml', 'application/atom+xml'];
const DEFAULT_MAXIMUM_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_PROBE_COUNT = 2;

function sameHttpsHost(value, allowedHost) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname.toLowerCase() === String(allowedHost || '').toLowerCase();
  } catch {
    return false;
  }
}

function contentTypeAllowed(value) {
  const normalized = String(value || '').split(';')[0].trim().toLowerCase();
  return ACCEPTED_CONTENT_TYPES.includes(normalized);
}

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function invariantSubject(opportunity = {}) {
  return {
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
}

async function readBounded(response, maximumBytes) {
  const declared = Number(response.headers?.get?.('content-length') || 0);
  if (declared > maximumBytes) throw Object.assign(new Error('Probe response exceeds maximum bytes'), { code: 'PROBE_RESPONSE_TOO_LARGE' });
  const bytes = new TextEncoder().encode(await response.text());
  if (bytes.byteLength > maximumBytes) throw Object.assign(new Error('Probe response exceeds maximum bytes'), { code: 'PROBE_RESPONSE_TOO_LARGE' });
  return bytes.byteLength;
}

export async function runHarmlessLiveProbe({
  blueprint,
  sandboxCertification,
  opportunity,
  probeUrl = opportunity?.official_url,
  fetchImpl = globalThis.fetch,
  now = new Date(),
  clock = () => Date.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maximumBytes = DEFAULT_MAXIMUM_BYTES,
  probeCount = DEFAULT_PROBE_COUNT
} = {}) {
  const blockers = [];
  const host = blueprint?.allowed_hosts?.[0] || '';
  const count = boundedNumber(probeCount, DEFAULT_PROBE_COUNT, 2, 3);
  const timeout = boundedNumber(timeoutMs, DEFAULT_TIMEOUT_MS, 1000, 15000);
  const byteLimit = boundedNumber(maximumBytes, DEFAULT_MAXIMUM_BYTES, 1024, 128 * 1024);

  if (sandboxCertification?.certified !== true || sandboxCertification?.certification_state !== 'sandbox-certified') blockers.push('sandbox-certification-required');
  if (!blueprint?.ok || !host || blueprint.allowed_hosts.length !== 1) blockers.push('single-certified-host-required');
  if (!sameHttpsHost(probeUrl, host)) blockers.push('probe-url-outside-certified-host');
  if (opportunity?.authentication_type !== 'none') blockers.push('credentials-forbidden');
  if (opportunity?.account_required === true || opportunity?.identity_verification_required === true) blockers.push('human-account-boundary');
  if (opportunity?.automation_permission !== 'allowed') blockers.push('automation-permission-not-explicit');
  const invariant = evaluateZeroSpendInvariant(invariantSubject(opportunity), { now, requireCurrentEvidence: true });
  blockers.push(...invariant.violations.map(value => `zero-spend:${value}`));

  const freeQuota = Number(opportunity?.free_quota || 0);
  if (opportunity?.quota_unlimited !== true && (!Number.isFinite(freeQuota) || freeQuota < count + 5)) blockers.push('insufficient-probe-quota-reserve');
  if (blockers.length) return { certified: false, certification_state: 'quarantined', activation_allowed: false, blockers: [...new Set(blockers)], probes: [] };

  const probes = [];
  for (let index = 0; index < count; index += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const started = clock();
    try {
      const response = await fetchImpl(probeUrl, {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          accept: 'application/json,text/plain,application/xml,text/xml,application/rss+xml,application/atom+xml;q=0.9',
          range: `bytes=0-${byteLimit - 1}`,
          'user-agent': 'MatrixReprogrammed-AdapterCertifier/1.0'
        }
      });
      const latencyMs = Math.max(0, clock() - started);
      const contentType = response.headers?.get?.('content-type') || '';
      if (!response.ok) throw Object.assign(new Error(`Probe HTTP ${response.status}`), { code: 'PROBE_HTTP_ERROR', status: response.status });
      if (!contentTypeAllowed(contentType)) throw Object.assign(new Error('Probe content type rejected'), { code: 'PROBE_CONTENT_TYPE_REJECTED' });
      const bytes = await readBounded(response, byteLimit);
      probes.push({ ok: true, status: response.status, latency_ms: latencyMs, bytes, content_type: contentType.split(';')[0], checked_at: now.toISOString() });
    } catch (error) {
      probes.push({ ok: false, code: error?.code || error?.name || 'PROBE_FAILED', message: String(error?.message || error), checked_at: now.toISOString() });
    } finally {
      clearTimeout(timer);
    }
  }

  const successful = probes.filter(probe => probe.ok);
  if (successful.length !== count) blockers.push('all-live-probes-must-pass');
  const averageLatency = successful.length ? successful.reduce((sum, probe) => sum + probe.latency_ms, 0) / successful.length : null;
  if (averageLatency != null && averageLatency > timeout * 0.9) blockers.push('probe-latency-unsafe');

  if (blockers.length) return { certified: false, certification_state: 'quarantined', activation_allowed: false, blockers: [...new Set(blockers)], probes, benchmark: { average_latency_ms: averageLatency } };

  const receipt = zeroSpendReceipt(invariantSubject(opportunity), { now, requireCurrentEvidence: true });
  const resourceId = `autonomous-${blueprint.adapter_id}`;
  return {
    certified: true,
    certification_state: 'live-certified',
    activation_allowed: true,
    blockers: [],
    probes,
    benchmark: {
      probe_count: count,
      average_latency_ms: Number(averageLatency.toFixed(2)),
      maximum_response_bytes: Math.max(...successful.map(probe => probe.bytes)),
      reliability_score: 100
    },
    zero_spend_receipt: receipt,
    broker_resource: {
      resource_id: resourceId,
      provider_name: opportunity.provider_name,
      service_name: 'Autonomously certified public-data endpoint',
      capability_types: ['public_data'],
      supported_job_types: ['public-data.fetch'],
      resource_tier: 3,
      authentication_type: 'none',
      credential_reference: null,
      approved_for_automation: true,
      approved_data_classes: ['public'],
      prohibited_data_classes: ['internal', 'confidential', 'restricted'],
      allowed_hosts: [host],
      adapter_id: blueprint.adapter_id,
      adapter_version: '0.1.0-live-certified',
      implementation_status: 'production',
      enabled: true,
      manual_approval_required: false,
      billing_enabled: false,
      payment_method_present: false,
      payment_method_required: false,
      monetary_cost_per_unit_eur: 0,
      paid_fallback: false,
      overage_possible: false,
      auto_upgrade_enabled: false,
      external_charge_possible: false,
      billing_risk: 'none',
      zero_cost_verified: true,
      quota_verified: true,
      quota_unlimited: opportunity.quota_unlimited === true,
      quota_remaining: opportunity.quota_unlimited === true ? null : Math.max(0, freeQuota - count),
      quota_reserved: 5,
      hard_stop_threshold: 5,
      last_health_check: now.toISOString(),
      health_status: 'healthy',
      last_terms_check: opportunity.zero_cost_evidence_at || opportunity.evaluated_at,
      last_quota_check: now.toISOString(),
      zero_cost_evidence_at: opportunity.zero_cost_evidence_at || opportunity.evaluated_at,
      terms_revalidation_due: new Date(now.getTime() + 7 * 86400000).toISOString(),
      reliability_score: 100,
      latency_score: Math.max(0, Math.round(100 - (averageLatency / timeout) * 100)),
      quality_score: 70,
      privacy_score: 95,
      provenance_score: 90,
      quota_efficiency_score: 90,
      notes: 'Autonomously generated, sandbox-certified, live-probed and admitted under the zero-spend invariant.'
    }
  };
}

export const liveProbeInternals = { ACCEPTED_CONTENT_TYPES, sameHttpsHost, contentTypeAllowed, boundedNumber, invariantSubject, readBounded };
