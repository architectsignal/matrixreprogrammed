import { ApprovedPublicSourceHttpAdapter } from '../provider-adapters/datasets/approved-public-source-http.mjs';

const SAFE_TYPES = new Set(['json', 'rss', 'atom', 'xml', 'html', 'csv', 'openapi']);
const POSITIVE_ZERO_COST = /\b(no api key|no registration|free of charge|free public api|public api|open data|without charge|at no cost|sans frais|gratuit)\b/i;
const BILLING_WARNING = /\b(credit card required|payment method required|paid plan required|metered billing|billable|pricing starts|subscription required)\b/i;
const OFFICIAL_HOST = /(?:\.gov|\.gov\.uk|\.gouv\.fr|\.europa\.eu|\.admin\.ch|\.gc\.ca|\.go\.jp|\.gov\.au|\.gov\.nz)$/i;

function safeId(value) {
  return String(value || 'candidate').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'candidate';
}

function hostname(value) {
  try { return new URL(String(value || '')).hostname.toLowerCase(); } catch { return ''; }
}

function httpsUrl(value) {
  try { return new URL(String(value || '')).protocol === 'https:'; } catch { return false; }
}

function sameOrganisation(left, right) {
  const a = hostname(left).split('.').slice(-3).join('.');
  const b = hostname(right).split('.').slice(-3).join('.');
  return Boolean(a && b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)));
}

function inferredType(source = {}) {
  const direct = String(source.type || '').toLowerCase();
  if (SAFE_TYPES.has(direct)) return direct;
  const url = String(source.url || '').toLowerCase();
  if (/\.json(?:$|\?)/.test(url) || /\/api\//.test(url)) return 'json';
  if (/rss|atom|feed/.test(url)) return 'rss';
  if (/\.csv(?:$|\?)/.test(url)) return 'csv';
  return 'html';
}

export function candidateFromInvestigationSource(source = {}, now = new Date()) {
  const policy = source.resourcePolicy || {};
  const url = String(source.url || '');
  return {
    candidate_id: `source-${safeId(source.id || source.label || url)}`,
    discovered_at: now.toISOString(),
    discovery_method: 'investigation-source-registry',
    provider_name: source.label || hostname(url),
    service_name: source.label || source.id || url,
    source_id: source.id || null,
    source_url: url,
    source_type: inferredType(source),
    authority: source.authority || 'unknown',
    capability_types: ['public_data'],
    official_documentation_url: policy.officialDocumentationUrl || null,
    terms_url: policy.termsUrl || null,
    privacy_url: policy.privacyUrl || null,
    status_url: policy.statusUrl || null,
    licence: policy.licence || null,
    authentication_type: policy.authenticationType || 'none',
    zero_spend_verified: policy.zeroSpendVerified === true,
    quota_verified: policy.quotaVerified === true,
    billing_risk: policy.billingRisk || 'unknown',
    payment_method_present: policy.paymentMethodPresent === true,
    free_quota_amount: Number(policy.hardDailyRequestCeiling || 100),
    concurrency_limit: Math.max(1, Number(policy.concurrencyLimit || 1)),
    last_terms_check: policy.lastTermsCheck || null,
    terms_revalidation_due: policy.termsRevalidationDue || null,
    last_quota_check: policy.lastQuotaCheck || null,
    allowed_hosts: [hostname(url)].filter(Boolean),
    metadata: { lane: source.lane || null, keywords: source.keywords || [], parser: source.parser || null }
  };
}

export function discoverCandidates({ sources = [], seedDocuments = [], now = new Date() } = {}) {
  const candidates = sources.map(source => candidateFromInvestigationSource(source, now));
  for (const document of seedDocuments || []) {
    const base = document?.url || '';
    const text = String(document?.body || '');
    const found = new Set();
    for (const match of text.matchAll(/https:\/\/[^\s"'<>)}\]]+/gi)) {
      try {
        const url = new URL(match[0], base).toString();
        if (!found.has(url)) {
          found.add(url);
          candidates.push({
            candidate_id: `discovered-${safeId(url)}`,
            discovered_at: now.toISOString(),
            discovery_method: 'approved-seed-document',
            provider_name: hostname(url),
            service_name: url,
            source_id: null,
            source_url: url,
            source_type: inferredType({ url }),
            authority: OFFICIAL_HOST.test(hostname(url)) ? 'primary-official' : 'unknown',
            capability_types: ['public_data'],
            official_documentation_url: document.official_documentation_url || null,
            terms_url: document.terms_url || null,
            privacy_url: document.privacy_url || null,
            status_url: null,
            licence: null,
            authentication_type: 'none',
            zero_spend_verified: false,
            quota_verified: false,
            billing_risk: 'unknown',
            payment_method_present: false,
            free_quota_amount: 25,
            concurrency_limit: 1,
            last_terms_check: null,
            terms_revalidation_due: null,
            last_quota_check: null,
            allowed_hosts: [hostname(url)].filter(Boolean),
            metadata: { discovered_from: base }
          });
        }
      } catch {}
    }
  }
  const unique = new Map();
  for (const candidate of candidates) if (candidate.source_url) unique.set(candidate.source_url, candidate);
  return [...unique.values()];
}

async function fetchEvidence(fetchImpl, url, maximumBytes = 512 * 1024) {
  if (!url || !httpsUrl(url)) return { ok: false, text: '', status: 0, error: 'invalid-or-missing-https-url' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json, application/xml, text/html, text/plain;q=0.9, */*;q=0.2', 'user-agent': 'MatrixReprogrammedResourceScout/1.0' }, redirect: 'follow', signal: controller.signal });
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maximumBytes) return { ok: false, text: '', status: response.status, error: 'response-too-large' };
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) return { ok: false, text: '', status: response.status, error: 'response-too-large' };
    return { ok: response.ok, text: new TextDecoder().decode(bytes), status: response.status, content_type: response.headers.get('content-type') || '' };
  } catch (error) {
    return { ok: false, text: '', status: 0, error: String(error?.message || error).slice(0, 300) };
  } finally { clearTimeout(timer); }
}

export async function evaluateCandidate(candidate, { fetchImpl = globalThis.fetch, now = new Date(), liveProbe = true } = {}) {
  const reasons = [];
  const evidence = [];
  if (!httpsUrl(candidate.source_url)) reasons.push('source-url-not-https');
  if (!candidate.allowed_hosts?.length) reasons.push('allowed-host-missing');
  if (!SAFE_TYPES.has(candidate.source_type)) reasons.push('unsupported-source-type');
  if (candidate.authentication_type !== 'none') reasons.push('authentication-required');
  if (candidate.payment_method_present) reasons.push('payment-method-present');
  if (candidate.billing_risk !== 'none') reasons.push('billing-risk-not-zero');
  if (!candidate.zero_spend_verified) reasons.push('zero-spend-not-yet-verified');
  if (!candidate.quota_verified) reasons.push('quota-not-yet-verified');
  if (!httpsUrl(candidate.official_documentation_url)) reasons.push('official-documentation-missing');
  if (!httpsUrl(candidate.terms_url)) reasons.push('terms-url-missing');
  if (!httpsUrl(candidate.privacy_url)) reasons.push('privacy-url-missing');
  if (candidate.official_documentation_url && !sameOrganisation(candidate.source_url, candidate.official_documentation_url)) reasons.push('documentation-domain-mismatch');
  if (candidate.terms_revalidation_due && Date.parse(candidate.terms_revalidation_due) <= now.getTime()) reasons.push('terms-revalidation-expired');

  let probe = { ok: true, status: 200, text: '', content_type: '' };
  let documentation = { ok: false, text: '' };
  let terms = { ok: false, text: '' };
  if (liveProbe && typeof fetchImpl === 'function') {
    [probe, documentation, terms] = await Promise.all([
      fetchEvidence(fetchImpl, candidate.source_url),
      fetchEvidence(fetchImpl, candidate.official_documentation_url),
      fetchEvidence(fetchImpl, candidate.terms_url)
    ]);
    if (!probe.ok) reasons.push('live-health-probe-failed');
    if (!documentation.ok) reasons.push('documentation-fetch-failed');
    if (!terms.ok) reasons.push('terms-fetch-failed');
  }

  const combined = `${documentation.text || ''}\n${terms.text || ''}`.slice(0, 1000000);
  if (BILLING_WARNING.test(combined)) reasons.push('billing-language-detected');
  if (POSITIVE_ZERO_COST.test(combined)) evidence.push('documentation-explicitly-describes-public-or-zero-cost-access');
  if (OFFICIAL_HOST.test(hostname(candidate.source_url)) && candidate.authentication_type === 'none') evidence.push('official-public-sector-host-without-authentication');
  if (!evidence.length && liveProbe) reasons.push('positive-zero-cost-evidence-not-found');

  const hardPass = reasons.length === 0;
  const confidence = Math.max(0, Math.min(100,
    40 + (probe.ok ? 15 : 0) + (documentation.ok ? 10 : 0) + (terms.ok ? 10 : 0) +
    (candidate.zero_spend_verified ? 10 : 0) + (candidate.quota_verified ? 5 : 0) +
    (evidence.length ? 10 : 0) - reasons.length * 8
  ));
  return {
    candidate,
    approved: hardPass && confidence >= 95,
    confidence,
    reasons,
    evidence,
    probe: { ok: probe.ok, status: probe.status, content_type: probe.content_type || null },
    evaluated_at: now.toISOString()
  };
}

export function approvedResourceFromCandidate(result, now = new Date()) {
  if (!result?.approved) return null;
  const candidate = result.candidate;
  const score = candidate.authority === 'primary-official' ? 94 : 82;
  return {
    resource_id: `scouted-${safeId(candidate.source_id || candidate.source_url)}`,
    provider_name: candidate.provider_name,
    service_name: candidate.service_name,
    capability_types: candidate.capability_types || ['public_data'],
    resource_tier: 3,
    official_documentation_url: candidate.official_documentation_url,
    terms_url: candidate.terms_url,
    privacy_url: candidate.privacy_url,
    status_url: candidate.status_url || null,
    licence: candidate.licence || null,
    account_owner: null,
    authentication_type: 'none', credential_reference: null,
    approved_for_automation: true,
    approved_data_classes: ['public'], prohibited_data_classes: ['internal', 'confidential', 'restricted'],
    free_quota_amount: candidate.free_quota_amount || 25, free_quota_unit: 'scout-verified requests per UTC day', quota_reset_period: 'daily', quota_reset_time: '00:00 UTC', quota_remaining: candidate.free_quota_amount || 25, quota_reserved: 0, hard_stop_threshold: Math.max(1, Math.ceil((candidate.free_quota_amount || 25) * 0.1)),
    quota_verified: true, quota_unlimited: false, billing_enabled: false, billing_risk: 'none', payment_method_present: false, monetary_cost_per_unit_eur: 0,
    quality_score: score, reliability_score: 85, latency_score: 75, privacy_score: 95, provenance_score: score, quota_efficiency_score: 90,
    last_health_check: result.evaluated_at, health_status: 'healthy', last_terms_check: result.evaluated_at, terms_revalidation_due: new Date(now.getTime() + 30 * 86400000).toISOString(), last_quota_check: result.evaluated_at,
    last_success: result.evaluated_at, last_failure: null, consecutive_failures: 0, cooldown_until: null, average_latency: 0, success_rate: 1, error_rate: 0,
    supported_job_types: ['public-data.fetch'], maximum_payload: 8 * 1024 * 1024, rate_limit: `${candidate.free_quota_amount || 25} requests/day with emergency reserve`, concurrency_limit: candidate.concurrency_limit || 1,
    fallback_resource_ids: [], implementation_status: 'production', adapter_id: 'approved-public-source-http', adapter_version: '1.0.0', enabled: true, manual_approval_required: false,
    allowed_hosts: candidate.allowed_hosts, metadata: { scout_confidence: result.confidence, scout_evidence: result.evidence, discovery_method: candidate.discovery_method },
    notes: `Automatically approved by Resource Scout under fail-closed zero-spend rules at confidence ${result.confidence}.`, created_at: now.toISOString(), updated_at: now.toISOString()
  };
}

export class ResourceScout {
  constructor({ fetchImpl = globalThis.fetch, clock = () => new Date(), concurrency = 3 } = {}) {
    this.fetchImpl = fetchImpl;
    this.clock = clock;
    this.concurrency = Math.max(1, Math.min(8, Number(concurrency || 3)));
  }

  async run({ sources = [], seedDocuments = [], existingResourceIds = [] } = {}) {
    const now = this.clock();
    const candidates = discoverCandidates({ sources, seedDocuments, now });
    const existing = new Set(existingResourceIds);
    const evaluations = [];
    for (let index = 0; index < candidates.length; index += this.concurrency) {
      const batch = candidates.slice(index, index + this.concurrency);
      evaluations.push(...await Promise.all(batch.map(candidate => evaluateCandidate(candidate, { fetchImpl: this.fetchImpl, now }))));
    }
    const approved = evaluations.map(result => approvedResourceFromCandidate(result, now)).filter(resource => resource && !existing.has(resource.resource_id));
    const quarantined = evaluations.filter(result => !result.approved).map(result => ({ candidate_id: result.candidate.candidate_id, source_url: result.candidate.source_url, confidence: result.confidence, reasons: result.reasons }));
    return {
      ok: true,
      generated_at: now.toISOString(),
      discovered: candidates.length,
      approved,
      quarantined,
      evaluations,
      policy: 'Automatic approval occurs only when HTTPS, no authentication, no billing, verified zero spend, verified quota, official documentation, terms, privacy, live health and positive zero-cost evidence all pass. Ambiguity is quarantined.'
    };
  }
}

export const resourceScoutInternals = { safeId, hostname, httpsUrl, sameOrganisation, inferredType, fetchEvidence, POSITIVE_ZERO_COST, BILLING_WARNING, OFFICIAL_HOST, ApprovedPublicSourceHttpAdapter };
