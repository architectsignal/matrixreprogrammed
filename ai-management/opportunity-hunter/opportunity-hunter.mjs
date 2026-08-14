const ALLOWED_KINDS = new Set(['compute', 'inference_api', 'dataset', 'search_api', 'model', 'grant', 'credit_program']);
const AUTO_ACTIVATABLE_KINDS = new Set(['dataset', 'search_api', 'model', 'inference_api']);
const OWNER_ACTION_KINDS = new Set(['compute', 'grant', 'credit_program']);
const AUTOMATION_ALLOWED = /\b(automation allowed|automated access permitted|api access permitted|programmatic access permitted|automated access must comply|endpoints do not currently require any authorization|authentication and authorization are not required|no login or authentication key required|no sign-up is required to use the rest api)\b/i;
const ZERO_COST = /\b(free of charge|no charge|at no cost|free tier|zero cost|no payment method required|do not require any authentication or api keys|endpoints do not currently require any authorization|authentication and authorization are not required|no login or authentication key required|no sign-up is required to use the rest api)\b/i;
const BILLING_RISK = /\b(credit card required|payment method required|auto[- ]?upgrade|overage|metered billing|usage charges|paid after trial|paid fallback)\b/i;
const OPPORTUNITY_HUNTER_USER_AGENT = 'MatrixReprogrammedOpportunityHunter/1.1 contact@matrixreprogrammed.com';

function safeId(value) {
  return String(value || 'opportunity').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'opportunity';
}

function isHttps(value) {
  try { return new URL(String(value || '')).protocol === 'https:'; } catch { return false; }
}

function hostname(value) {
  try { return new URL(String(value || '')).hostname.toLowerCase(); } catch { return ''; }
}

function sameHostFamily(left, right) {
  const a = hostname(left).split('.').slice(-2).join('.');
  const b = hostname(right).split('.').slice(-2).join('.');
  return Boolean(a && b && a === b);
}

function hasBillingRisk(value) {
  const normalized = String(value || '')
    .replace(/\b(?:no|not)\s+(?:credit card|payment method)\s+(?:is\s+)?required\b/gi, '')
    .replace(/\b(?:no|without)\s+(?:overage|overages|metered billing|usage charges|paid fallback)\b/gi, '')
    .replace(/\brequests?\s+(?:stop|are blocked)\s+when\s+the\s+free\s+quota\s+is\s+exhausted\b/gi, '');
  return BILLING_RISK.test(normalized);
}

export function normalizeOpportunity(input = {}, now = new Date()) {
  const kind = String(input.kind || '').toLowerCase();
  return {
    opportunity_id: input.opportunity_id || `opportunity-${safeId(input.provider_name || input.service_name || input.official_url)}`,
    discovered_at: input.discovered_at || now.toISOString(),
    discovery_method: input.discovery_method || 'official-source-feed',
    kind,
    provider_name: String(input.provider_name || hostname(input.official_url) || 'unknown'),
    service_name: String(input.service_name || input.provider_name || input.official_url || 'unknown'),
    official_url: String(input.official_url || ''),
    documentation_url: String(input.documentation_url || ''),
    terms_url: String(input.terms_url || ''),
    privacy_url: String(input.privacy_url || ''),
    status_url: input.status_url ? String(input.status_url) : null,
    authentication_type: String(input.authentication_type || 'unknown'),
    account_required: input.account_required === true,
    identity_verification_required: input.identity_verification_required === true,
    payment_method_required: input.payment_method_required === true,
    automation_permission: String(input.automation_permission || 'unknown'),
    commercial_use: String(input.commercial_use || 'unknown'),
    zero_cost_verified: input.zero_cost_verified === true,
    quota_verified: input.quota_verified === true,
    free_quota: Number(input.free_quota || 0),
    free_quota_unit: String(input.free_quota_unit || 'unknown'),
    expiry_at: input.expiry_at || null,
    geographic_restrictions: Array.isArray(input.geographic_restrictions) ? input.geographic_restrictions : [],
    supported_capabilities: Array.isArray(input.supported_capabilities) ? input.supported_capabilities : [],
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {}
  };
}

async function fetchText(fetchImpl, url, maximumBytes = 512 * 1024) {
  if (!isHttps(url)) return { ok: false, status: 0, text: '', error: 'invalid-https-url' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.1', 'user-agent': OPPORTUNITY_HUNTER_USER_AGENT },
      signal: controller.signal
    });
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maximumBytes) return { ok: false, status: response.status, text: '', error: 'response-too-large' };
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) return { ok: false, status: response.status, text: '', error: 'response-too-large' };
    return { ok: response.ok, status: response.status, text: new TextDecoder().decode(bytes) };
  } catch (error) {
    return { ok: false, status: 0, text: '', error: String(error?.message || error).slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

export async function evaluateOpportunity(input, { fetchImpl = globalThis.fetch, now = new Date(), liveProbe = true } = {}) {
  const opportunity = normalizeOpportunity(input, now);
  const blockers = [];
  const ownerActions = [];
  const evidence = [];

  if (!ALLOWED_KINDS.has(opportunity.kind)) blockers.push('unsupported-opportunity-kind');
  for (const [field, value] of [['official-url', opportunity.official_url], ['documentation-url', opportunity.documentation_url], ['terms-url', opportunity.terms_url], ['privacy-url', opportunity.privacy_url]]) {
    if (!isHttps(value)) blockers.push(`${field}-missing-or-not-https`);
  }
  if (opportunity.documentation_url && !sameHostFamily(opportunity.official_url, opportunity.documentation_url)) blockers.push('documentation-domain-mismatch');
  if (opportunity.terms_url && !sameHostFamily(opportunity.official_url, opportunity.terms_url)) blockers.push('terms-domain-mismatch');
  const executionUrl = String(opportunity.metadata?.execution_url || '');
  if (executionUrl && !isHttps(executionUrl)) blockers.push('execution-url-missing-or-not-https');
  if (executionUrl && !sameHostFamily(opportunity.official_url, executionUrl)) blockers.push('execution-domain-mismatch');
  if (opportunity.payment_method_required) blockers.push('payment-method-required');
  if (!opportunity.zero_cost_verified) blockers.push('zero-cost-not-verified');
  if (!opportunity.quota_verified) blockers.push('quota-not-verified');
  if (opportunity.free_quota <= 0) blockers.push('free-quota-not-positive');
  if (opportunity.automation_permission !== 'allowed') blockers.push('automation-permission-not-explicit');
  if (!['allowed', 'noncommercial-only'].includes(opportunity.commercial_use)) blockers.push('commercial-use-unclear');
  if (opportunity.expiry_at && Date.parse(opportunity.expiry_at) <= now.getTime()) blockers.push('opportunity-expired');

  if (opportunity.account_required) ownerActions.push('owner-account-creation-required');
  if (opportunity.identity_verification_required) ownerActions.push('owner-identity-verification-required');
  if (OWNER_ACTION_KINDS.has(opportunity.kind)) ownerActions.push('owner-approval-required-for-capacity-program');
  if (opportunity.authentication_type !== 'none') ownerActions.push('credential-onboarding-required');

  let docs = { ok: true, text: '' };
  let terms = { ok: true, text: '' };
  let service = { ok: true, status: 200, text: '' };
  if (liveProbe && typeof fetchImpl === 'function') {
    [docs, terms, service] = await Promise.all([
      fetchText(fetchImpl, opportunity.documentation_url),
      fetchText(fetchImpl, opportunity.terms_url),
      fetchText(fetchImpl, opportunity.official_url, 1024 * 1024)
    ]);
    if (!docs.ok) blockers.push('documentation-fetch-failed');
    if (!terms.ok) blockers.push('terms-fetch-failed');
    if (!service.ok) blockers.push('service-health-probe-failed');
  }

  const combined = `${docs.text || ''}\n${terms.text || ''}`.slice(0, 1000000);
  const normalizedMaterial = combined.toLowerCase().replace(/\s+/g, ' ');
  const quotaEvidenceTerms = Array.isArray(opportunity.metadata?.quota_evidence_terms)
    ? opportunity.metadata.quota_evidence_terms.map(term => String(term).toLowerCase().trim()).filter(Boolean).slice(0, 8)
    : [];
  if (hasBillingRisk(combined)) blockers.push('billing-risk-language-detected');
  if (ZERO_COST.test(combined)) evidence.push('official-material-confirms-zero-cost-access');
  if (AUTOMATION_ALLOWED.test(combined)) evidence.push('official-material-confirms-automation-permission');
  if (liveProbe && quotaEvidenceTerms.length && quotaEvidenceTerms.every(term => normalizedMaterial.includes(term))) evidence.push('official-material-confirms-declared-quota');
  if (liveProbe && !evidence.includes('official-material-confirms-zero-cost-access')) blockers.push('zero-cost-language-not-found');
  if (liveProbe && !evidence.includes('official-material-confirms-automation-permission')) blockers.push('automation-language-not-found');
  if (liveProbe && quotaEvidenceTerms.length && !evidence.includes('official-material-confirms-declared-quota')) blockers.push('declared-quota-language-not-found');

  const uniqueBlockers = [...new Set(blockers)];
  const uniqueOwnerActions = [...new Set(ownerActions)];
  const confidence = Math.max(0, Math.min(100,
    45 + (docs.ok ? 10 : 0) + (terms.ok ? 10 : 0) + (opportunity.zero_cost_verified ? 10 : 0) +
    (opportunity.quota_verified ? 5 : 0) + evidence.length * 10 - uniqueBlockers.length * 9
  ));
  const autoActivatable = uniqueBlockers.length === 0 && uniqueOwnerActions.length === 0 && AUTO_ACTIVATABLE_KINDS.has(opportunity.kind) && confidence >= 95;
  const approvalState = uniqueBlockers.length > 0 ? 'quarantined' : autoActivatable ? 'approved-auto' : 'awaiting-owner';

  return {
    opportunity,
    approval_state: approvalState,
    auto_activatable: autoActivatable,
    confidence,
    blockers: uniqueBlockers,
    owner_actions: uniqueOwnerActions,
    evidence,
    service_probe: { ok: service.ok, status: service.status, error: service.error || null },
    evaluated_at: now.toISOString()
  };
}

export class OpportunityHunter {
  constructor({ fetchImpl = globalThis.fetch, clock = () => new Date(), concurrency = 3 } = {}) {
    this.fetchImpl = fetchImpl;
    this.clock = clock;
    this.concurrency = Math.max(1, Math.min(8, Number(concurrency || 3)));
  }

  async run({ opportunities = [], existingOpportunityIds = [] } = {}) {
    const now = this.clock();
    const existing = new Set(existingOpportunityIds);
    const normalized = opportunities.map(item => normalizeOpportunity(item, now)).filter(item => !existing.has(item.opportunity_id));
    const evaluations = [];
    for (let index = 0; index < normalized.length; index += this.concurrency) {
      evaluations.push(...await Promise.all(normalized.slice(index, index + this.concurrency).map(item => evaluateOpportunity(item, { fetchImpl: this.fetchImpl, now }))));
    }
    return {
      ok: true,
      generated_at: now.toISOString(),
      discovered: normalized.length,
      approved_auto: evaluations.filter(item => item.approval_state === 'approved-auto'),
      awaiting_owner: evaluations.filter(item => item.approval_state === 'awaiting-owner'),
      quarantined: evaluations.filter(item => item.approval_state === 'quarantined'),
      evaluations,
      policy: 'Only explicit zero-cost, positive-quota, automation-permitted opportunities without billing or owner-action requirements may auto-activate. Account creation, identity checks, credentials, grants, credits and compute programmes always require owner approval.'
    };
  }
}

export const opportunityHunterInternals = { ALLOWED_KINDS, AUTO_ACTIVATABLE_KINDS, OWNER_ACTION_KINDS, AUTOMATION_ALLOWED, ZERO_COST, BILLING_RISK, OPPORTUNITY_HUNTER_USER_AGENT, hasBillingRisk, safeId, isHttps, hostname, sameHostFamily, fetchText };
