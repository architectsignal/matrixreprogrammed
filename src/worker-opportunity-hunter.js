import { OpportunityHunter } from '../ai-management/opportunity-hunter/opportunity-hunter.mjs';
import { D1ResourceRegistry } from '../ai-management/resource-registry/resource-registry.mjs';

const ROUTE = '/api/ai-management/admin/opportunities';

const DEFAULT_OFFICIAL_OPPORTUNITY_SEEDS = Object.freeze([
  {
    opportunity_id: 'official-sec-edgar-data-apis',
    kind: 'dataset', provider_name: 'U.S. Securities and Exchange Commission', service_name: 'EDGAR submissions and XBRL data APIs',
    official_url: 'https://data.sec.gov/', documentation_url: 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces',
    terms_url: 'https://www.sec.gov/about/privacy-information', privacy_url: 'https://www.sec.gov/about/privacy-information',
    authentication_type: 'none', account_required: false, identity_verification_required: false, payment_method_required: false,
    automation_permission: 'allowed', commercial_use: 'allowed', zero_cost_verified: true, quota_verified: true,
    free_quota: 500, free_quota_unit: 'operator-capped requests/day below the official 10 requests/second ceiling',
    supported_capabilities: ['public_data', 'company_filings', 'financial_statements'],
    metadata: {
      discovery_scope: 'official-source-daily-revalidation', quota_evidence_terms: ['10 requests per second'],
      supported_job_types: ['public-data.fetch'], adapter_id: 'zero-spend-opportunity-public-http', adapter_version: '1.0.0',
      maximum_payload: 8388608, concurrency_limit: 1,
      licence: 'Public regulatory records; preserve issuer filing provenance and the SEC source URL.'
    }
  },
  {
    opportunity_id: 'official-usaspending-public-api',
    kind: 'dataset', provider_name: 'U.S. Department of the Treasury', service_name: 'USAspending public API',
    official_url: 'https://api.usaspending.gov/', documentation_url: 'https://api.usaspending.gov/docs/endpoints',
    terms_url: 'https://www.usaspending.gov/about', privacy_url: 'https://www.usaspending.gov/about/privacy',
    authentication_type: 'none', account_required: false, identity_verification_required: false, payment_method_required: false,
    automation_permission: 'allowed', commercial_use: 'allowed', zero_cost_verified: true, quota_verified: true,
    free_quota: 100, free_quota_unit: 'operator-capped requests/day',
    supported_capabilities: ['public_data', 'government_spending', 'contracts', 'grants'],
    metadata: {
      discovery_scope: 'official-source-daily-revalidation',
      supported_job_types: ['public-data.fetch'], adapter_id: 'zero-spend-opportunity-public-http', adapter_version: '1.0.0',
      maximum_payload: 8388608, concurrency_limit: 1,
      licence: 'Open U.S. federal spending data; observe the USAspending data-use limitations documented on its About page.'
    }
  },
  {
    opportunity_id: 'official-kaggle-notebooks-free-gpu',
    kind: 'compute', provider_name: 'Kaggle', service_name: 'Kaggle Notebooks free GPU',
    official_url: 'https://www.kaggle.com/', documentation_url: 'https://www.kaggle.com/docs/efficient-gpu-usage',
    terms_url: 'https://www.kaggle.com/terms', privacy_url: 'https://www.kaggle.com/privacy',
    authentication_type: 'token', account_required: true, identity_verification_required: true, payment_method_required: false,
    automation_permission: 'unknown', commercial_use: 'unknown', zero_cost_verified: true, quota_verified: true,
    free_quota: 30, free_quota_unit: 'GPU hours/week documented safe ceiling', supported_capabilities: ['gpu inference', 'gpu training'],
    metadata: { discovery_scope: 'official-source-daily-revalidation', owner_onboarding_required: true, quota_evidence_terms: ['30 hours', 'week'] }
  },
  {
    opportunity_id: 'official-hugging-face-zerogpu',
    kind: 'compute', provider_name: 'Hugging Face', service_name: 'Spaces ZeroGPU free account quota',
    official_url: 'https://huggingface.co/', documentation_url: 'https://huggingface.co/docs/hub/main/spaces-zerogpu',
    terms_url: 'https://huggingface.co/terms-of-service', privacy_url: 'https://huggingface.co/privacy', status_url: 'https://status.huggingface.co/',
    authentication_type: 'token', account_required: true, identity_verification_required: false, payment_method_required: false,
    automation_permission: 'unknown', commercial_use: 'unknown', zero_cost_verified: true, quota_verified: true,
    free_quota: 5, free_quota_unit: 'GPU minutes/day for a free account', supported_capabilities: ['gpu inference', 'llm'],
    metadata: { discovery_scope: 'official-source-daily-revalidation', owner_onboarding_required: true, quota_evidence_terms: ['5 minutes', 'daily'] }
  }
]);

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function enabled(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function safeId(value) {
  return String(value || 'opportunity').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'opportunity';
}

function productionPublicAdapterReady(item) {
  const jobs = Array.isArray(item?.metadata?.supported_job_types) ? item.metadata.supported_job_types : [];
  return ['dataset', 'search_api'].includes(item?.kind) &&
    item?.metadata?.adapter_id === 'zero-spend-opportunity-public-http' &&
    item?.metadata?.adapter_version === '1.0.0' &&
    jobs.length === 1 && jobs[0] === 'public-data.fetch' &&
    item?.supported_capabilities?.includes('public_data');
}

async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function tableExists(db, table) {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first();
  return row?.name === table;
}

async function schemaReady(env) {
  if (!env?.MEMBERS_DB?.prepare) return false;
  const checks = await Promise.all(['ai_opportunities', 'ai_opportunity_hunter_runs', 'ai_resources'].map(name => tableExists(env.MEMBERS_DB, name).catch(() => false)));
  return checks.every(Boolean);
}

function resourceFromEvaluation(evaluation, now) {
  const item = evaluation.opportunity;
  if (!evaluation.auto_activatable || evaluation.approval_state !== 'approved-auto') return null;
  if (item.account_required || item.identity_verification_required || item.payment_method_required || item.authentication_type !== 'none') return null;
  const adapterReady = productionPublicAdapterReady(item);
  return {
    resource_id: `opportunity-${safeId(item.provider_name)}-${safeId(item.service_name)}`,
    provider_name: item.provider_name,
    service_name: item.service_name,
    capability_types: item.supported_capabilities.length ? item.supported_capabilities : [item.kind],
    resource_tier: 3,
    official_documentation_url: item.documentation_url,
    terms_url: item.terms_url,
    privacy_url: item.privacy_url,
    status_url: item.status_url,
    licence: item.metadata?.licence || null,
    account_owner: null,
    authentication_type: 'none',
    credential_reference: null,
    approved_for_automation: true,
    approved_data_classes: ['public'],
    prohibited_data_classes: ['internal', 'confidential', 'restricted'],
    free_quota_amount: item.free_quota,
    free_quota_unit: item.free_quota_unit,
    quota_reset_period: item.metadata?.quota_reset_period || 'provider-defined',
    quota_reset_time: item.metadata?.quota_reset_time || null,
    quota_remaining: item.free_quota,
    quota_reserved: 0,
    hard_stop_threshold: Math.max(1, Math.ceil(item.free_quota * 0.1)),
    quota_verified: true,
    quota_unlimited: false,
    billing_enabled: false,
    billing_risk: 'none',
    payment_method_present: false,
    payment_method_required: false,
    monetary_cost_per_unit_eur: 0,
    zero_cost_verified: true,
    zero_cost_evidence_at: evaluation.evaluated_at,
    last_pricing_check: evaluation.evaluated_at,
    paid_fallback: false,
    overage_possible: false,
    auto_upgrade_enabled: false,
    external_charge_possible: false,
    quality_score: Math.max(60, evaluation.confidence),
    reliability_score: 70,
    latency_score: 60,
    privacy_score: 90,
    provenance_score: 90,
    quota_efficiency_score: 85,
    last_health_check: evaluation.evaluated_at,
    health_status: 'healthy',
    last_terms_check: evaluation.evaluated_at,
    terms_revalidation_due: new Date(now.getTime() + 30 * 86400000).toISOString(),
    last_quota_check: evaluation.evaluated_at,
    last_success: null,
    last_failure: null,
    consecutive_failures: 0,
    cooldown_until: null,
    average_latency: 0,
    success_rate: 0,
    error_rate: 0,
    supported_job_types: item.metadata?.supported_job_types || [],
    maximum_payload: Number(item.metadata?.maximum_payload || 1024 * 1024),
    rate_limit: `${item.free_quota} ${item.free_quota_unit}`,
    concurrency_limit: Math.max(1, Number(item.metadata?.concurrency_limit || 1)),
    fallback_resource_ids: [],
    implementation_status: adapterReady ? 'production' : 'disabled',
    adapter_id: item.metadata?.adapter_id || null,
    adapter_version: item.metadata?.adapter_version || null,
    enabled: adapterReady,
    manual_approval_required: false,
    allowed_hosts: [new URL(item.official_url).hostname],
    metadata: {
      opportunity_id: item.opportunity_id,
      approval_state: evaluation.approval_state,
      confidence: evaluation.confidence,
      auto_discovered: true,
      activation_blocked_until_adapter_ready: !adapterReady
    },
    notes: adapterReady
      ? 'Discovered, live-verified and enabled through the tested public-only zero-spend HTTP adapter.'
      : 'Discovered and approved as zero-spend, but remains disabled until a tested provider adapter exists.',
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };
}

async function persistReport(env, report, discoverySource = 'scheduled-official-source') {
  if (!await schemaReady(env)) throw new Error('Phase 12 opportunity schema is not ready');
  const now = new Date();
  const registry = new D1ResourceRegistry(env.MEMBERS_DB);
  let admitted = 0;

  for (const evaluation of report.evaluations.slice(0, 500)) {
    const item = evaluation.opportunity;
    let resourceId = null;
    const resource = resourceFromEvaluation(evaluation, now);
    if (resource) {
      await registry.upsert(resource);
      resourceId = resource.resource_id;
      admitted += 1;
    }
    await env.MEMBERS_DB.prepare(`INSERT INTO ai_opportunities(
      opportunity_id,kind,provider_name,service_name,official_url,opportunity_json,evaluation_json,confidence,approval_state,
      approved_resource_id,owner_actions_json,blockers_json,discovered_at,evaluated_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(official_url) DO UPDATE SET
      kind=excluded.kind,provider_name=excluded.provider_name,service_name=excluded.service_name,opportunity_json=excluded.opportunity_json,
      evaluation_json=excluded.evaluation_json,confidence=excluded.confidence,approval_state=excluded.approval_state,
      approved_resource_id=excluded.approved_resource_id,owner_actions_json=excluded.owner_actions_json,blockers_json=excluded.blockers_json,
      evaluated_at=excluded.evaluated_at,updated_at=excluded.updated_at`)
      .bind(item.opportunity_id, item.kind, item.provider_name, item.service_name, item.official_url, JSON.stringify(item), JSON.stringify(evaluation),
        evaluation.confidence, evaluation.approval_state, resourceId, JSON.stringify(evaluation.owner_actions), JSON.stringify(evaluation.blockers),
        item.discovered_at, evaluation.evaluated_at, now.toISOString()).run();
  }

  const runId = `opportunity-run-${(await hash(`${report.generated_at}|${discoverySource}|${report.discovered}`)).slice(0, 24)}`;
  const status = report.quarantined.length || report.awaiting_owner.length ? 'completed-with-findings' : 'completed';
  await env.MEMBERS_DB.prepare(`INSERT OR REPLACE INTO ai_opportunity_hunter_runs(
    run_id,discovery_source,discovered_count,approved_auto_count,awaiting_owner_count,quarantined_count,zero_spend_lock,
    report_json,started_at,completed_at,status
  ) VALUES(?,?,?,?,?,?,1,?,?,?,?)`).bind(
    runId, discoverySource, report.discovered, report.approved_auto.length, report.awaiting_owner.length, report.quarantined.length,
    JSON.stringify(report), report.generated_at, now.toISOString(), status
  ).run();

  return { runId, admitted, status };
}

function configuredOpportunities(env) {
  const raw = env?.AI_OPPORTUNITY_SEEDS_JSON;
  if (raw == null || raw === '') return DEFAULT_OFFICIAL_OPPORTUNITY_SEEDS.map(item => ({ ...item, metadata: { ...item.metadata } }));
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 100) : [];
  } catch {
    return [];
  }
}

function requestedOpportunities(body, env) {
  const submitted = Array.isArray(body?.opportunities) ? body.opportunities.slice(0, 100) : [];
  if (submitted.length) return submitted;
  return body?.use_defaults === true ? configuredOpportunities(env) : [];
}

export function isOpportunityHunterRoute(path) {
  return path === ROUTE;
}

export async function handleOpportunityHunterRoute(request, env) {
  if (request.method === 'GET') {
    if (!await schemaReady(env)) return json({ ok: false, error: 'Phase 12 opportunity schema is not ready' }, 503);
    const rows = await env.MEMBERS_DB.prepare('SELECT opportunity_id,kind,provider_name,service_name,official_url,confidence,approval_state,approved_resource_id,owner_actions_json,blockers_json,evaluated_at FROM ai_opportunities ORDER BY evaluated_at DESC LIMIT 200').all();
    return json({ ok: true, opportunities: rows.results || [] });
  }
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  if (!enabled(env?.AI_OPPORTUNITY_HUNTER_ENABLED, false) || !enabled(env?.AI_RESOURCE_ZERO_SPEND_LOCK, true)) {
    return json({ ok: false, error: 'Opportunity Hunter is disabled or zero-spend lock is not active' }, 409);
  }
  const body = await request.json();
  const opportunities = requestedOpportunities(body, env);
  const hunter = new OpportunityHunter();
  const report = await hunter.run({ opportunities });
  const persisted = await persistReport(env, report, 'owner-submitted-official-sources');
  return json({ ok: true, report, persisted, monetaryCeilingEur: 0 });
}

export async function runScheduledOpportunityHunter(env) {
  if (!enabled(env?.AI_OPPORTUNITY_HUNTER_ENABLED, false) || !enabled(env?.AI_RESOURCE_ZERO_SPEND_LOCK, true)) return { skipped: true, reason: 'disabled' };
  const opportunities = configuredOpportunities(env);
  if (!opportunities.length) return { skipped: true, reason: 'no-configured-official-sources' };
  if (!await schemaReady(env)) return { skipped: true, reason: 'opportunity-schema-not-ready' };
  const last = await env.MEMBERS_DB.prepare("SELECT completed_at FROM ai_opportunity_hunter_runs WHERE discovery_source='scheduled-configured-official-sources' ORDER BY completed_at DESC LIMIT 1").first().catch(() => null);
  const today = new Date().toISOString().slice(0, 10);
  if (String(last?.completed_at || '').slice(0, 10) === today) return { skipped: true, reason: 'official-sources-already-checked-today', last_checked_at: last.completed_at };
  const hunter = new OpportunityHunter();
  const report = await hunter.run({ opportunities });
  const persisted = await persistReport(env, report, 'scheduled-configured-official-sources');
  return { skipped: false, report, persisted };
}

export const opportunityHunterWorkerInternals = {
  DEFAULT_OFFICIAL_OPPORTUNITY_SEEDS, productionPublicAdapterReady, resourceFromEvaluation, persistReport,
  configuredOpportunities, requestedOpportunities, schemaReady
};
