const ACCESS_METHODS = new Set(['automatic_api', 'manual_onboarding', 'interactive_notebook', 'prohibited']);
const CLASSIFICATIONS = new Set(['automatic', 'manual_onboarding', 'quarantined', 'prohibited', 'expired']);
const ZERO_COST_LANGUAGE = /\b(free(?: of charge)?|no cost|at no cost|included free|free tier|free quota|gratuit|sans frais)\b/i;
const BILLING_RISK_LANGUAGE = /\b(auto(?:matic)? billing|charged after|overage|pay as you go|payment method required|credit card required|prepaid credits|purchased credits|billable|per hour|per minute|pricing)\b/i;
const AUTOMATION_ALLOWED_LANGUAGE = /\b(api|sdk|programmatic|automation|automated jobs?|remote execution|ssh|webhook)\b/i;
const AUTOMATION_RESTRICTED_LANGUAGE = /\b(interactive use only|actively programming|anti[- ]abuse|do not automate|automation prohibited|no unattended|no persistent workloads?|circumvent|bypass|multiple accounts?)\b/i;

function safeId(value, fallback = 'compute-provider') {
  const clean = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  return clean || fallback;
}

function privateNetworkHost(value) {
  const host = String(value || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true;
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  return octets[0] === 0 ||
    octets[0] === 10 ||
    octets[0] === 127 ||
    octets[0] === 169 && octets[1] === 254 ||
    octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31 ||
    octets[0] === 192 && octets[1] === 168;
}

function publicHttpsUrl(value, base = null) {
  try {
    const url = base ? new URL(String(value || ''), base) : new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password || privateNetworkHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function httpsUrl(value) {
  return Boolean(publicHttpsUrl(value));
}

function hostname(value) {
  try { return new URL(String(value || '')).hostname.toLowerCase(); } catch { return ''; }
}

function sameOrganisation(left, right) {
  const parts = value => hostname(value).split('.').filter(Boolean).slice(-3).join('.');
  const a = parts(left);
  const b = parts(right);
  return Boolean(a && b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)));
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function executionMetadata(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const metadata = {};
  for (const key of ['execution_adapter', 'execution_transport', 'workspace_path', 'kernel_ref', 'accelerator_id', 'default_api_name']) {
    if (typeof value[key] === 'string' && value[key].trim()) metadata[key] = value[key].trim().slice(0, 500);
  }
  for (const key of ['supported_job_types', 'allowed_task_types', 'allowed_api_names']) {
    if (Array.isArray(value[key])) metadata[key] = value[key].map(item => String(item).trim()).filter(Boolean).slice(0, 50);
  }
  if (value.routes && typeof value.routes === 'object' && !Array.isArray(value.routes)) {
    metadata.routes = {};
    for (const operation of ['execute', 'status', 'cancel']) {
      if (typeof value.routes[operation] === 'string' && value.routes[operation].trim()) metadata.routes[operation] = value.routes[operation].trim().slice(0, 200);
    }
  }
  const maximumRuntime = asNumber(value.maximum_runtime_seconds, 0);
  if (maximumRuntime > 0) metadata.maximum_runtime_seconds = Math.max(30, Math.min(maximumRuntime, 3600));
  return metadata;
}

async function fetchEvidence(fetchImpl, url, {
  maximumBytes = 512 * 1024,
  timeoutMs = 12000,
  maximumRedirects = 3
} = {}) {
  let current = publicHttpsUrl(url);
  if (!current) return { ok: false, status: 0, text: '', error: 'invalid-or-blocked-https-url' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount += 1) {
      const response = await fetchImpl(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        headers: {
          accept: 'text/html, text/plain, application/json;q=0.9, */*;q=0.2',
          'user-agent': 'MatrixReprogrammedComputeResourceScout/1.0'
        },
        signal: controller.signal
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        const next = location ? publicHttpsUrl(location, current) : null;
        if (!next) return { ok: false, status: response.status, text: '', error: 'redirect-target-blocked' };
        if (redirectCount >= maximumRedirects) return { ok: false, status: response.status, text: '', error: 'too-many-redirects' };
        current = next;
        continue;
      }
      const declared = asNumber(response.headers.get('content-length'), 0);
      if (declared > maximumBytes) return { ok: false, status: response.status, text: '', error: 'response-too-large' };
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > maximumBytes) return { ok: false, status: response.status, text: '', error: 'response-too-large' };
      return {
        ok: response.ok,
        status: response.status,
        text: new TextDecoder().decode(bytes),
        content_type: response.headers.get('content-type') || '',
        final_url: current.toString()
      };
    }
    return { ok: false, status: 0, text: '', error: 'too-many-redirects' };
  } catch (error) {
    return { ok: false, status: 0, text: '', error: String(error?.message || error).slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

export function candidateFromComputeProvider(provider = {}, now = new Date()) {
  const accessMethod = ACCESS_METHODS.has(provider.access_method) ? provider.access_method : 'manual_onboarding';
  return {
    provider_id: safeId(provider.provider_id || provider.provider_name || provider.official_documentation_url),
    provider_name: String(provider.provider_name || hostname(provider.official_documentation_url) || 'Unknown compute provider').slice(0, 200),
    service_name: String(provider.service_name || provider.provider_name || 'Compute service').slice(0, 200),
    discovery_method: provider.discovery_method || 'compute-provider-registry',
    discovered_at: provider.discovered_at || now.toISOString(),
    access_method: accessMethod,
    endpoint_url: provider.endpoint_url || null,
    official_documentation_url: provider.official_documentation_url || null,
    terms_url: provider.terms_url || null,
    privacy_url: provider.privacy_url || null,
    status_url: provider.status_url || null,
    account_required: provider.account_required !== false,
    oauth_required: provider.oauth_required === true,
    phone_verification_required: provider.phone_verification_required === true,
    owner_onboarding_completed: provider.owner_onboarding_completed === true,
    automation_permission_verified: provider.automation_permission_verified === true,
    billing_hard_stop_confirmed: provider.billing_hard_stop_confirmed === true,
    payment_method_present: provider.payment_method_present === true,
    zero_spend_verified: provider.zero_spend_verified === true,
    quota_verified: provider.quota_verified === true,
    free_quota_amount: Math.max(0, asNumber(provider.free_quota_amount, 0)),
    free_quota_unit: provider.free_quota_unit || null,
    quota_reset_period: provider.quota_reset_period || null,
    session_max_minutes: Math.max(0, asNumber(provider.session_max_minutes, 0)),
    accelerator_types: Array.isArray(provider.accelerator_types) ? provider.accelerator_types.slice(0, 20) : [],
    minimum_gpu_memory_mb: Math.max(0, asNumber(provider.minimum_gpu_memory_mb, 0)),
    credential_reference: provider.credential_reference || null,
    terms_last_verified: provider.terms_last_verified || null,
    terms_revalidation_due: provider.terms_revalidation_due || null,
    quota_last_verified: provider.quota_last_verified || null,
    manual_onboarding_steps: Array.isArray(provider.manual_onboarding_steps) ? provider.manual_onboarding_steps.slice(0, 20) : [],
    prohibited_uses: Array.isArray(provider.prohibited_uses) ? provider.prohibited_uses.slice(0, 30) : [],
    metadata: executionMetadata(provider.metadata)
  };
}

function onboardingTask(candidate, reasons, now) {
  const steps = candidate.manual_onboarding_steps.length ? candidate.manual_onboarding_steps : [
    'Create or verify the owner-controlled provider account.',
    'Review current official terms, quota and privacy documentation.',
    'Confirm automation is expressly permitted for the intended workload.',
    'Enable a hard zero-cost stop and remove or disable paid fallback.',
    'Store only the provider credential binding name, never the credential value.',
    'Run a bounded health and quota probe before enabling routing.'
  ];
  return {
    task_id: `compute-onboarding-${candidate.provider_id}`,
    provider_id: candidate.provider_id,
    provider_name: candidate.provider_name,
    status: 'pending-owner-action',
    owner_action_required: true,
    reasons,
    steps,
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };
}

export async function evaluateComputeCandidate(candidate, {
  fetchImpl = globalThis.fetch,
  now = new Date(),
  liveProbe = true
} = {}) {
  const reasons = [];
  const evidence = [];
  const warnings = [];

  if (!httpsUrl(candidate.official_documentation_url)) reasons.push('official-documentation-missing');
  if (!httpsUrl(candidate.terms_url)) reasons.push('terms-url-missing');
  if (!httpsUrl(candidate.privacy_url)) reasons.push('privacy-url-missing');
  if (candidate.endpoint_url && !httpsUrl(candidate.endpoint_url)) reasons.push('compute-endpoint-not-https');
  if (candidate.official_documentation_url && candidate.terms_url && !sameOrganisation(candidate.official_documentation_url, candidate.terms_url)) warnings.push('terms-domain-differs-from-documentation');
  if (candidate.payment_method_present) reasons.push('payment-method-present');
  if (!candidate.billing_hard_stop_confirmed) reasons.push('billing-hard-stop-not-confirmed');
  if (!candidate.zero_spend_verified) reasons.push('zero-spend-not-verified');
  if (!candidate.quota_verified || candidate.free_quota_amount <= 0 || !candidate.free_quota_unit) reasons.push('free-quota-not-verified');
  if (candidate.terms_revalidation_due && Date.parse(candidate.terms_revalidation_due) <= now.getTime()) reasons.push('terms-revalidation-expired');
  if (!candidate.terms_last_verified) reasons.push('terms-never-verified');
  if (!candidate.quota_last_verified) reasons.push('quota-never-verified');

  let documentation = { ok: false, status: 0, text: '' };
  let terms = { ok: false, status: 0, text: '' };
  let privacy = { ok: false, status: 0, text: '' };
  let endpoint = { ok: !candidate.endpoint_url, status: candidate.endpoint_url ? 0 : 204, text: '' };
  if (liveProbe && typeof fetchImpl === 'function') {
    [documentation, terms, privacy, endpoint] = await Promise.all([
      fetchEvidence(fetchImpl, candidate.official_documentation_url),
      fetchEvidence(fetchImpl, candidate.terms_url),
      fetchEvidence(fetchImpl, candidate.privacy_url),
      candidate.endpoint_url ? fetchEvidence(fetchImpl, candidate.endpoint_url, { maximumBytes: 128 * 1024 }) : Promise.resolve(endpoint)
    ]);
    if (!documentation.ok) reasons.push('documentation-fetch-failed');
    if (!terms.ok) reasons.push('terms-fetch-failed');
    if (!privacy.ok) reasons.push('privacy-fetch-failed');
    if (candidate.endpoint_url && !endpoint.ok) reasons.push('compute-endpoint-health-failed');
  }

  const combined = `${documentation.text || ''}\n${terms.text || ''}\n${privacy.text || ''}`.slice(0, 1500000);
  if (ZERO_COST_LANGUAGE.test(combined)) evidence.push('official-material-describes-free-access-or-free-quota');
  if (AUTOMATION_ALLOWED_LANGUAGE.test(combined)) evidence.push('official-material-describes-programmatic-or-remote-access');
  if (BILLING_RISK_LANGUAGE.test(combined)) reasons.push('billing-or-credit-language-detected');
  if (AUTOMATION_RESTRICTED_LANGUAGE.test(combined)) reasons.push('interactive-or-anti-abuse-restriction-detected');

  let classification = 'quarantined';
  if (candidate.access_method === 'prohibited' || reasons.includes('interactive-or-anti-abuse-restriction-detected') && candidate.access_method === 'automatic_api') {
    classification = 'prohibited';
  } else if (candidate.access_method === 'interactive_notebook' || candidate.access_method === 'manual_onboarding' || candidate.account_required && !candidate.owner_onboarding_completed) {
    classification = 'manual_onboarding';
  } else if (
    candidate.access_method === 'automatic_api' &&
    candidate.owner_onboarding_completed &&
    candidate.automation_permission_verified &&
    candidate.billing_hard_stop_confirmed &&
    candidate.zero_spend_verified &&
    candidate.quota_verified &&
    candidate.free_quota_amount > 0 &&
    candidate.endpoint_url && endpoint.ok &&
    !reasons.length
  ) {
    classification = 'automatic';
  }

  const confidence = Math.max(0, Math.min(100,
    30 +
    (documentation.ok ? 10 : 0) +
    (terms.ok ? 10 : 0) +
    (privacy.ok ? 10 : 0) +
    (candidate.endpoint_url && endpoint.ok ? 10 : 0) +
    (candidate.zero_spend_verified ? 10 : 0) +
    (candidate.quota_verified ? 10 : 0) +
    (candidate.automation_permission_verified ? 10 : 0) +
    (candidate.billing_hard_stop_confirmed ? 10 : 0) -
    reasons.length * 7
  ));

  const approved = classification === 'automatic' && confidence >= 95;
  const onboarding = classification === 'manual_onboarding' ? onboardingTask(candidate, reasons, now) : null;
  return {
    candidate,
    classification,
    approved,
    confidence,
    reasons,
    warnings,
    evidence,
    onboarding,
    probes: {
      documentation: { ok: documentation.ok, status: documentation.status },
      terms: { ok: terms.ok, status: terms.status },
      privacy: { ok: privacy.ok, status: privacy.status },
      endpoint: { ok: endpoint.ok, status: endpoint.status }
    },
    evaluated_at: now.toISOString()
  };
}

export function brokerResourceFromComputeEvaluation(evaluation, now = new Date()) {
  if (!evaluation?.approved || evaluation.classification !== 'automatic') return null;
  const candidate = evaluation.candidate;
  const leaseMinutes = Math.max(1, Math.min(candidate.session_max_minutes || 60, 24 * 60));
  const expiresAt = new Date(now.getTime() + leaseMinutes * 60 * 1000).toISOString();
  return {
    resource_id: `remote-compute-${candidate.provider_id}`,
    provider_name: candidate.provider_name,
    service_name: candidate.service_name,
    capability_types: ['remote_compute', 'gpu_compute'],
    resource_tier: 2,
    official_documentation_url: candidate.official_documentation_url,
    terms_url: candidate.terms_url,
    privacy_url: candidate.privacy_url,
    status_url: candidate.status_url || null,
    licence: null,
    account_owner: 'owner-controlled provider account',
    authentication_type: 'environment_secret',
    credential_reference: candidate.credential_reference,
    approved_for_automation: true,
    approved_data_classes: ['public'],
    prohibited_data_classes: ['internal', 'confidential', 'restricted'],
    free_quota_amount: candidate.free_quota_amount,
    free_quota_unit: candidate.free_quota_unit,
    quota_reset_period: candidate.quota_reset_period,
    quota_reset_time: null,
    quota_remaining: candidate.free_quota_amount,
    quota_reserved: 0,
    hard_stop_threshold: Math.max(1, Math.ceil(candidate.free_quota_amount * 0.1)),
    quota_verified: true,
    quota_unlimited: false,
    billing_enabled: false,
    billing_risk: 'none',
    payment_method_present: false,
    monetary_cost_per_unit_eur: 0,
    quality_score: 75,
    reliability_score: 70,
    latency_score: 55,
    privacy_score: 55,
    provenance_score: evaluation.confidence,
    quota_efficiency_score: 80,
    last_health_check: evaluation.evaluated_at,
    health_status: 'healthy',
    last_terms_check: candidate.terms_last_verified,
    terms_revalidation_due: candidate.terms_revalidation_due,
    last_quota_check: candidate.quota_last_verified,
    last_success: null,
    last_failure: null,
    consecutive_failures: 0,
    cooldown_until: null,
    average_latency: 0,
    success_rate: 1,
    error_rate: 0,
    supported_job_types: ['remote-compute.reserve', 'remote-compute.release'],
    maximum_payload: 0,
    rate_limit: `${candidate.free_quota_amount} ${candidate.free_quota_unit}`,
    concurrency_limit: 1,
    fallback_resource_ids: [],
    implementation_status: 'experimental',
    adapter_id: 'remote-compute-session',
    adapter_version: '1.0.0',
    enabled: true,
    manual_approval_required: false,
    allowed_hosts: [hostname(candidate.endpoint_url)].filter(Boolean),
    metadata: {
      ...candidate.metadata,
      provider_id: candidate.provider_id,
      remote_compute: true,
      access_method: candidate.access_method,
      endpoint_url: candidate.endpoint_url,
      accelerator_types: candidate.accelerator_types,
      minimum_gpu_memory_mb: candidate.minimum_gpu_memory_mb,
      session_max_minutes: candidate.session_max_minutes,
      expires_at: expiresAt,
      owner_onboarding_completed: true,
      automation_permission_verified: true,
      billing_hard_stop_confirmed: true,
      prompt_transfer_allowed: false,
      public_workloads_only: true
    },
    notes: `Temporary zero-spend remote compute resource approved at confidence ${evaluation.confidence}. No prompt or non-public data may be sent by the control plane.`,
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };
}

export function revalidateComputeResource(resource, now = new Date()) {
  const reasons = [];
  if (!resource?.metadata?.remote_compute) return { resource, valid: true, reasons };
  if (resource.billing_enabled !== false || resource.payment_method_present !== false || resource.billing_risk !== 'none' || Number(resource.monetary_cost_per_unit_eur || 0) !== 0) reasons.push('zero-spend-invariant-failed');
  if (!resource.quota_verified || Number(resource.quota_remaining || 0) <= Number(resource.hard_stop_threshold || 0)) reasons.push('quota-hard-stop-reached');
  if (resource.terms_revalidation_due && Date.parse(resource.terms_revalidation_due) <= now.getTime()) reasons.push('terms-revalidation-expired');
  if (resource.metadata.expires_at && Date.parse(resource.metadata.expires_at) <= now.getTime()) reasons.push('compute-session-expired');
  if (resource.metadata.automation_permission_verified !== true) reasons.push('automation-permission-not-verified');
  if (resource.metadata.billing_hard_stop_confirmed !== true) reasons.push('billing-hard-stop-not-confirmed');
  return { resource, valid: reasons.length === 0, reasons };
}

export class ComputeResourceScout {
  constructor({ fetchImpl = globalThis.fetch, clock = () => new Date(), concurrency = 3 } = {}) {
    this.fetchImpl = fetchImpl;
    this.clock = clock;
    this.concurrency = Math.max(1, Math.min(6, Number(concurrency || 3)));
  }

  async run({ providers = [], existingResources = [] } = {}) {
    const now = this.clock();
    const candidates = providers.map(provider => candidateFromComputeProvider(provider, now));
    const evaluations = [];
    for (let index = 0; index < candidates.length; index += this.concurrency) {
      const batch = candidates.slice(index, index + this.concurrency);
      evaluations.push(...await Promise.all(batch.map(candidate => evaluateComputeCandidate(candidate, { fetchImpl: this.fetchImpl, now }))));
    }
    const approvedResources = evaluations.map(evaluation => brokerResourceFromComputeEvaluation(evaluation, now)).filter(Boolean);
    const manualOnboarding = evaluations.filter(evaluation => evaluation.classification === 'manual_onboarding').map(evaluation => evaluation.onboarding);
    const prohibited = evaluations.filter(evaluation => evaluation.classification === 'prohibited');
    const quarantined = evaluations.filter(evaluation => evaluation.classification === 'quarantined');
    const revocations = existingResources.map(resource => revalidateComputeResource(resource, now)).filter(result => !result.valid).map(result => ({ resource_id: result.resource.resource_id, reasons: result.reasons }));
    return {
      ok: true,
      generated_at: now.toISOString(),
      discovered: candidates.length,
      automatic_approved: approvedResources.length,
      manual_onboarding: manualOnboarding,
      prohibited: prohibited.map(item => ({ provider_id: item.candidate.provider_id, reasons: item.reasons })),
      quarantined: quarantined.map(item => ({ provider_id: item.candidate.provider_id, confidence: item.confidence, reasons: item.reasons })),
      approved_resources: approvedResources,
      revocations,
      evaluations,
      policy: 'Remote compute is routable only when an HTTPS API, explicit automation permission, owner onboarding, hard zero-cost stop, verified free quota, current terms/privacy evidence, healthy endpoint and public-data-only boundary all pass. Interactive notebooks remain manual and anti-abuse or billing ambiguity is quarantined.'
    };
  }
}

export const computeScoutInternals = {
  ACCESS_METHODS,
  CLASSIFICATIONS,
  ZERO_COST_LANGUAGE,
  BILLING_RISK_LANGUAGE,
  AUTOMATION_ALLOWED_LANGUAGE,
  AUTOMATION_RESTRICTED_LANGUAGE,
  safeId,
  privateNetworkHost,
  publicHttpsUrl,
  httpsUrl,
  hostname,
  sameOrganisation,
  executionMetadata,
  fetchEvidence
};
