import { AutonomousLearningDirector } from '../ai-management/autonomy/autonomous-learning-director.mjs';
import { SelfFinancingDirector } from '../ai-management/finance/self-financing-director.mjs';
import { RevenueGrowthDirector } from '../ai-management/finance/revenue-growth-director.mjs';

const ROUTES = new Set([
  '/api/ai-management/admin/level5/status',
  '/api/ai-management/admin/level5/revenue-events',
  '/api/ai-management/admin/level5/cycle'
]);

const CATEGORIES = new Set(['membership','donation','books_and_reports','sponsorship','approved_affiliate','approved_services']);
const EVENT_TYPES = new Set(['impression','visit','lead','checkout_started','purchase_verified','renewal_verified','donation_verified','refund_verified','chargeback_verified','operating_cost_verified']);
const FINANCIAL_EVENT_TYPES = new Set(['purchase_verified','renewal_verified','donation_verified','refund_verified','chargeback_verified','operating_cost_verified']);
const SAFE_METADATA_KEYS = new Set(['page','path','source','campaign','offer_id','lane','variant','currency','provider','product_id','report_id','membership_tier']);
const REQUIRED_TABLES = [
  'matrix_learning_ledger',
  'matrix_revenue_events',
  'matrix_revenue_channels',
  'matrix_growth_experiments',
  'matrix_finance_snapshots',
  'matrix_capital_proposals'
];

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-matrix-origin': 'matrix-level5-self-financing'
};

const FINANCE_POLICY = Object.freeze({
  minimum_reserve_months: 3,
  baseline_monthly_operating_cost_eur: 0,
  allowed_revenue_categories: [...CATEGORIES],
  allocation_weights: {
    operating_reserve: 0.5,
    infrastructure: 0.25,
    audience_growth: 0.15,
    experiments: 0.1
  }
});

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), { status, headers: HEADERS });
}

function clean(value, maximum = 240) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  return Math.round(finite(value, 0) * 100) / 100;
}

function enabled(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function safeMetadata(input = {}) {
  const output = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return output;
  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    if (typeof value === 'string') output[key] = clean(value, 300);
    else if (typeof value === 'number' && Number.isFinite(value)) output[key] = value;
    else if (typeof value === 'boolean') output[key] = value;
  }
  return output;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function tableExists(db, table) {
  try {
    const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first();
    return row?.name === table;
  } catch {
    return false;
  }
}

async function schemaReady(env) {
  if (!env?.MEMBERS_DB?.prepare) return false;
  const checks = await Promise.all(REQUIRED_TABLES.map(table => tableExists(env.MEMBERS_DB, table)));
  return checks.every(Boolean);
}

async function dbFeatureEnabled(db, flagName) {
  try {
    const row = await db.prepare('SELECT enabled FROM ai_feature_flags WHERE flag_name=? LIMIT 1').bind(flagName).first();
    return Number(row?.enabled || 0) === 1;
  } catch {
    return false;
  }
}

function normalizeCycleSummary(input = {}) {
  const resource = input.resource_scout || {};
  const compute = input.compute_resource_scout || {};
  const capability = input.capability_director || {};
  const site = input.site_director || {};
  return {
    ok: input.ok === true,
    cost_confirmed_zero: input.cost_confirmed_zero === true,
    resource_scout: {
      approved_new: Math.max(0, finite(resource.approved_new, 0)),
      total_discovered: Math.max(0, finite(resource.total_discovered, 0))
    },
    compute_resource_scout: {
      automatic_approved: Math.max(0, finite(compute.automatic_approved, 0)),
      providers_checked: Math.max(0, finite(compute.providers_checked, 0))
    },
    capability_director: {
      jobs_completed: Math.max(0, finite(capability.jobs_completed, 0)),
      jobs_attempted: Math.max(0, finite(capability.jobs_attempted, 0)),
      eligible_remote_resources: Math.max(0, finite(capability.eligible_remote_resources, 0))
    },
    site_director: {
      safe_changes_applied: Math.max(0, finite(site.safe_changes_applied, 0)),
      total_issues: Math.max(0, finite(site.total_issues, 0)),
      prohibited_changes_attempted: Math.max(0, finite(site.prohibited_changes_attempted, 0))
    }
  };
}

async function normalizeRevenueEvent(input = {}, now = new Date()) {
  const category = clean(input.category, 80);
  const eventType = clean(input.event_type, 80);
  const channelId = clean(input.channel_id, 120).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!channelId) throw new Error('channel_id is required');
  if (!CATEGORIES.has(category)) throw new Error('revenue category is not allowed');
  if (!EVENT_TYPES.has(eventType)) throw new Error('revenue event_type is not allowed');

  const financial = FINANCIAL_EVENT_TYPES.has(eventType);
  if (financial && input.verified !== true) throw new Error('financial revenue events must be verified');
  const amountEur = financial ? Math.max(0, Math.min(10_000_000, money(input.amount_eur))) : 0;
  const occurredAtDate = new Date(input.occurred_at || now.toISOString());
  if (!Number.isFinite(occurredAtDate.getTime())) throw new Error('occurred_at is invalid');
  if (occurredAtDate.getTime() > now.getTime() + 5 * 60 * 1000) throw new Error('occurred_at cannot be materially in the future');
  if (occurredAtDate.getTime() < now.getTime() - 366 * 86400000) throw new Error('occurred_at exceeds the accepted historical window');

  let externalReferenceHash = clean(input.external_reference_hash, 64).toLowerCase();
  if (externalReferenceHash && !/^[a-f0-9]{64}$/.test(externalReferenceHash)) throw new Error('external_reference_hash must be SHA-256 hex');
  if (!externalReferenceHash && input.external_reference) externalReferenceHash = await sha256(clean(input.external_reference, 500));
  if (financial && !externalReferenceHash) throw new Error('verified financial events require an external reference or reference hash');

  const occurredAt = occurredAtDate.toISOString();
  const deterministicSeed = externalReferenceHash
    ? `${channelId}|${category}|${eventType}|${externalReferenceHash}|${amountEur}`
    : `${channelId}|${category}|${eventType}|${occurredAt}|${crypto.randomUUID()}`;
  const eventId = `rev-${(await sha256(deterministicSeed)).slice(0, 40)}`;

  return {
    event_id: eventId,
    channel_id: channelId,
    category,
    event_type: eventType,
    amount_eur: amountEur,
    verified: financial ? true : input.verified === true,
    external_reference_hash: externalReferenceHash || null,
    experiment_id: clean(input.experiment_id, 160) || null,
    metadata: safeMetadata(input.metadata),
    occurred_at: occurredAt,
    received_at: now.toISOString()
  };
}

async function persistRevenueEvent(db, event) {
  await db.prepare(`INSERT OR IGNORE INTO matrix_revenue_channels(
    channel_id,label,category,destination_path,enabled,zero_spend_only,evidence_independence_required,commercial_claims_json,created_at,updated_at
  ) VALUES(?,?,?,NULL,1,1,1,'[]',?,?)`).bind(
    event.channel_id, event.channel_id, event.category, event.received_at, event.received_at
  ).run();
  await db.prepare(`INSERT OR IGNORE INTO matrix_revenue_events(
    event_id,channel_id,category,event_type,amount_eur,verified,external_reference_hash,experiment_id,metadata_json,occurred_at,received_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(
    event.event_id, event.channel_id, event.category, event.event_type, event.amount_eur, event.verified ? 1 : 0,
    event.external_reference_hash, event.experiment_id, JSON.stringify(event.metadata), event.occurred_at, event.received_at
  ).run();
}

async function aggregateRevenue(db, periodDays = 30, now = new Date()) {
  const days = Math.max(1, Math.min(90, Math.floor(finite(periodDays, 30))));
  const periodEnd = now.toISOString();
  const periodStart = new Date(now.getTime() - days * 86400000).toISOString();
  const result = await db.prepare(`SELECT
    e.channel_id,
    e.category,
    COALESCE(c.label,e.channel_id) AS label,
    COALESCE(c.enabled,1) AS enabled,
    SUM(CASE WHEN e.event_type='visit' THEN 1 ELSE 0 END) AS visits,
    SUM(CASE WHEN e.event_type='lead' THEN 1 ELSE 0 END) AS leads,
    SUM(CASE WHEN e.event_type='checkout_started' THEN 1 ELSE 0 END) AS checkout_starts,
    SUM(CASE WHEN e.event_type='purchase_verified' AND e.verified=1 THEN 1 ELSE 0 END) AS verified_purchases,
    SUM(CASE WHEN e.event_type='renewal_verified' AND e.verified=1 THEN 1 ELSE 0 END) AS verified_renewals,
    SUM(CASE WHEN e.event_type IN ('purchase_verified','renewal_verified','donation_verified') AND e.verified=1 THEN e.amount_eur ELSE 0 END) AS verified_gross_revenue_eur,
    SUM(CASE WHEN e.event_type='refund_verified' AND e.verified=1 THEN e.amount_eur ELSE 0 END) AS verified_refunds_eur,
    SUM(CASE WHEN e.event_type='chargeback_verified' AND e.verified=1 THEN e.amount_eur ELSE 0 END) AS verified_chargebacks_eur,
    SUM(CASE WHEN e.event_type='operating_cost_verified' AND e.verified=1 THEN e.amount_eur ELSE 0 END) AS verified_operating_cost_eur
  FROM matrix_revenue_events e
  LEFT JOIN matrix_revenue_channels c ON c.channel_id=e.channel_id
  WHERE e.occurred_at>=? AND e.occurred_at<=?
  GROUP BY e.channel_id,e.category,c.label,c.enabled
  ORDER BY e.channel_id`).bind(periodStart, periodEnd).all();

  const channels = (result?.results || []).map(row => ({
    channel_id: row.channel_id,
    label: row.label,
    category: row.category,
    enabled: Boolean(row.enabled),
    visits: Number(row.visits || 0),
    leads: Number(row.leads || 0),
    checkout_starts: Number(row.checkout_starts || 0),
    verified_purchases: Number(row.verified_purchases || 0),
    verified_renewals: Number(row.verified_renewals || 0),
    verified_gross_revenue_eur: money(row.verified_gross_revenue_eur),
    verified_refunds_eur: money(row.verified_refunds_eur),
    verified_chargebacks_eur: money(row.verified_chargebacks_eur),
    verified_operating_cost_eur: money(row.verified_operating_cost_eur),
    evidence_quality: 1,
    zero_spend_experiment_available: true
  }));
  return { period_start: periodStart, period_end: periodEnd, channels };
}

async function loadPriorLearning(db) {
  const result = await db.prepare(`SELECT cycle_index,observation_json,outcome_json,created_at
    FROM matrix_learning_ledger
    WHERE domain='governance' AND subject_id='level5-autonomy-cycle'
    ORDER BY cycle_index DESC,created_at DESC LIMIT 100`).all();
  const rows = result?.results || [];
  if (!rows.length) return {};
  const latest = rows[0];
  let outcome = {};
  try { outcome = JSON.parse(latest.outcome_json || '{}'); } catch {}
  const lessons = rows.slice().reverse().map(row => {
    try { return JSON.parse(row.observation_json || '{}'); } catch { return null; }
  }).filter(Boolean);
  return {
    schema_version: 1,
    cycle_count: Number(latest.cycle_index || 0),
    metrics: outcome.metrics || {},
    latest_signals: outcome.latest_signals || {},
    recommendations: outcome.recommendations || [],
    lessons
  };
}

async function persistLearning(db, learning) {
  const lesson = learning.lessons?.[learning.lessons.length - 1] || {};
  const seed = `${learning.cycle_count}|${learning.generated_at}|${JSON.stringify(lesson.signals || {})}`;
  const lessonId = `level5-${learning.cycle_count}-${(await sha256(seed)).slice(0, 24)}`;
  await db.prepare(`INSERT OR IGNORE INTO matrix_learning_ledger(
    lesson_id,cycle_index,domain,subject_id,observation_json,outcome_json,confidence,accepted,affects_ranking_only,
    policy_mutation_allowed,evidence_threshold_mutation_allowed,financial_execution_allowed,created_at
  ) VALUES(?,?, 'governance','level5-autonomy-cycle',?,?,?, ?,1,0,0,0,?)`).bind(
    lessonId,
    Number(learning.cycle_count || 0),
    JSON.stringify(lesson),
    JSON.stringify({ metrics: learning.metrics, latest_signals: learning.latest_signals, recommendations: learning.recommendations }),
    learning.latest_signals?.zero_spend_confirmed === true ? 1 : 0.5,
    learning.latest_signals?.zero_spend_confirmed === true ? 1 : 0,
    learning.generated_at
  ).run();
  return lessonId;
}

async function persistGrowthExperiments(db, growth, automaticGrowthEnabled) {
  let proposed = 0;
  for (const experiment of growth.experiments || []) {
    const now = growth.generated_at;
    const automatic = automaticGrowthEnabled && experiment.automatic_execution_allowed === true;
    await db.prepare(`INSERT OR IGNORE INTO matrix_growth_experiments(
      experiment_id,channel_id,experiment_type,hypothesis,control_json,variant_json,primary_metric,status,
      automatic_execution_allowed,owner_approval_required,maximum_duration_hours,result_json,created_at,started_at,completed_at,updated_at
    ) VALUES(?,?,?,?, '{}','{}',?,'proposed',?,?,?,NULL,?,NULL,NULL,?)`).bind(
      experiment.experiment_id,
      experiment.channel_id,
      experiment.experiment_type,
      experiment.hypothesis,
      experiment.primary_metric,
      automatic ? 1 : 0,
      automatic ? 0 : 1,
      Number(experiment.maximum_duration_hours || 168),
      now,
      now
    ).run();
    proposed += 1;
  }
  return proposed;
}

async function persistFinanceSnapshot(db, aggregate, growth, finance, verifiedCashReserveEur) {
  const snapshotSeed = `${aggregate.period_start}|${aggregate.period_end}|${growth.summary.verified_net_revenue_eur}`;
  const snapshotId = `finance-${(await sha256(snapshotSeed)).slice(0, 32)}`;
  await db.prepare(`INSERT OR REPLACE INTO matrix_finance_snapshots(
    snapshot_id,period_start,period_end,verified_gross_revenue_eur,verified_refunds_eur,verified_operating_cost_eur,
    verified_net_revenue_eur,verified_cash_reserve_eur,self_financing_ratio,channel_metrics_json,generated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(
    snapshotId,
    aggregate.period_start,
    aggregate.period_end,
    growth.summary.verified_gross_revenue_eur,
    growth.summary.verified_refunds_and_chargebacks_eur,
    growth.summary.verified_operating_cost_eur,
    growth.summary.verified_net_revenue_eur,
    verifiedCashReserveEur,
    finance.observed.self_financing_ratio,
    JSON.stringify(growth.ranked_channels),
    growth.generated_at
  ).run();
  return snapshotId;
}

async function persistCapitalProposals(db, finance, snapshotId) {
  let proposals = 0;
  for (const item of finance.allocation_plan || []) {
    if (Number(item.proposed_amount_eur || 0) <= 0) continue;
    const proposalId = `capital-${(await sha256(`${snapshotId}|${item.purpose}|${item.proposed_amount_eur}`)).slice(0, 32)}`;
    await db.prepare(`INSERT OR IGNORE INTO matrix_capital_proposals(
      proposal_id,purpose,amount_eur,rationale,evidence_json,status,owner_approval_required,execution_allowed,created_at,updated_at
    ) VALUES(?,?,?,?,?,'proposed',1,0,?,?)`).bind(
      proposalId,
      item.purpose,
      item.proposed_amount_eur,
      `Level 5 finance plan proposes reinvestment into ${item.purpose}; execution remains owner-controlled.`,
      JSON.stringify({ snapshot_id: snapshotId, self_financing_state: finance.state, proposal_pool_eur: finance.observed.proposal_pool_eur }),
      finance.generated_at,
      finance.generated_at
    ).run();
    proposals += 1;
  }
  return proposals;
}

async function ingestRevenueEvents(request, env) {
  if (!await schemaReady(env)) return json({ ok: false, error: 'Phase 14 self-financing schema is not ready' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON body' }, 400); }
  const inputs = Array.isArray(body?.events) ? body.events.slice(0, 200) : body?.event ? [body.event] : [];
  if (!inputs.length) return json({ ok: false, error: 'At least one revenue event is required' }, 400);
  const now = new Date();
  const accepted = [];
  const rejected = [];
  for (const input of inputs) {
    try {
      const event = await normalizeRevenueEvent(input, now);
      await persistRevenueEvent(env.MEMBERS_DB, event);
      accepted.push({ event_id: event.event_id, channel_id: event.channel_id, event_type: event.event_type, verified: event.verified });
    } catch (error) {
      rejected.push({ channel_id: clean(input?.channel_id, 120) || null, error: clean(error?.message || error, 300) });
    }
  }
  return json({
    ok: rejected.length === 0,
    accepted: accepted.length,
    rejected: rejected.length,
    events: accepted,
    errors: rejected,
    privacy_boundary: 'Raw payer identity and raw payment references are not stored by this route. Only a SHA-256 external reference and allowlisted commercial metadata are retained.',
    financial_execution_performed: false
  }, rejected.length && !accepted.length ? 400 : 200);
}

async function runLevel5Cycle(request, env) {
  if (!await schemaReady(env)) return json({ ok: false, error: 'Phase 14 self-financing schema is not ready' }, 503);
  let body = {};
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON body' }, 400); }

  const cycleSummary = normalizeCycleSummary(body.cycle_summary || {});
  const aggregate = await aggregateRevenue(env.MEMBERS_DB, body.period_days || 30, new Date());
  const priorLearning = await loadPriorLearning(env.MEMBERS_DB);
  const learning = new AutonomousLearningDirector({ alpha: 0.25, maximumLessons: 100 }).learn({ priorState: priorLearning, cycleSummary });
  const lessonId = await persistLearning(env.MEMBERS_DB, learning);

  const growth = new RevenueGrowthDirector({ maximumExperiments: 3 }).plan({
    channels: aggregate.channels,
    policy: { allowed_revenue_categories: FINANCE_POLICY.allowed_revenue_categories }
  });

  const verifiedCashReserveEur = body.cash_reserve_verified === true
    ? Math.max(0, money(body.verified_cash_reserve_eur))
    : 0;
  const revenueSources = growth.ranked_channels.map(channel => ({
    category: channel.category,
    verified: true,
    net_revenue_eur: Math.max(0, money(channel.verified_gross_revenue_eur - channel.verified_refunds_eur - channel.verified_chargebacks_eur))
  }));
  const financePolicy = {
    ...FINANCE_POLICY,
    baseline_monthly_operating_cost_eur: Math.max(0, money(body.baseline_monthly_operating_cost_eur || growth.summary.verified_operating_cost_eur))
  };
  const finance = new SelfFinancingDirector().plan({
    snapshot: {
      revenue_sources: revenueSources,
      verified_operating_cost_eur: growth.summary.verified_operating_cost_eur,
      verified_cash_reserve_eur: verifiedCashReserveEur
    },
    policy: financePolicy
  });

  const dbGrowthEnabled = await dbFeatureEnabled(env.MEMBERS_DB, 'MATRIX_SELF_FINANCING_GROWTH_ENABLED');
  const automaticGrowthEnabled = dbGrowthEnabled && enabled(env?.MATRIX_SELF_FINANCING_GROWTH_ENABLED, false);
  const experimentsPersisted = await persistGrowthExperiments(env.MEMBERS_DB, growth, automaticGrowthEnabled);
  const snapshotId = await persistFinanceSnapshot(env.MEMBERS_DB, aggregate, growth, finance, verifiedCashReserveEur);
  const capitalProposals = await persistCapitalProposals(env.MEMBERS_DB, finance, snapshotId);

  return json({
    ok: cycleSummary.cost_confirmed_zero === true,
    generated_at: new Date().toISOString(),
    learning: {
      lesson_id: lessonId,
      cycle_count: learning.cycle_count,
      recommendations: learning.recommendations,
      policy_mutation_allowed: false,
      evidence_threshold_mutation_allowed: false
    },
    growth: {
      channels_evaluated: growth.summary.channels_evaluated,
      verified_net_revenue_eur: growth.summary.verified_net_revenue_eur,
      experiments_persisted: experimentsPersisted,
      automatic_growth_execution_enabled: automaticGrowthEnabled,
      automatic_price_changes_allowed: false,
      automatic_payment_flow_changes_allowed: false
    },
    finance: {
      snapshot_id: snapshotId,
      state: finance.state,
      verified_net_revenue_eur: growth.summary.verified_net_revenue_eur,
      proposal_pool_eur: finance.observed.proposal_pool_eur,
      capital_proposals: capitalProposals,
      executable_budget_eur: 0,
      owner_approval_required_for_any_spend: true
    },
    controls: {
      evidence_independence: true,
      zero_spend_compute_boundary_preserved: true,
      financial_execution_performed: false,
      payment_mutation_allowed: false,
      contract_commitment_allowed: false,
      deployment_performed: false
    }
  }, cycleSummary.cost_confirmed_zero === true ? 200 : 409);
}

async function status(env) {
  if (!await schemaReady(env)) return json({ ok: false, schema_ready: false, error: 'Phase 14 self-financing schema is not ready' }, 503);
  const db = env.MEMBERS_DB;
  const [finance, experiments, proposals, lessons, revenueCount] = await Promise.all([
    db.prepare('SELECT * FROM matrix_finance_snapshots ORDER BY period_end DESC LIMIT 1').first(),
    db.prepare("SELECT experiment_id,channel_id,experiment_type,primary_metric,status,automatic_execution_allowed,owner_approval_required,created_at,updated_at FROM matrix_growth_experiments ORDER BY updated_at DESC LIMIT 20").all(),
    db.prepare("SELECT proposal_id,purpose,amount_eur,status,owner_approval_required,execution_allowed,created_at FROM matrix_capital_proposals ORDER BY created_at DESC LIMIT 20").all(),
    db.prepare("SELECT lesson_id,cycle_index,domain,subject_id,confidence,accepted,created_at FROM matrix_learning_ledger ORDER BY created_at DESC LIMIT 20").all(),
    db.prepare('SELECT COUNT(*) AS count FROM matrix_revenue_events').first()
  ]);
  const dbGrowthEnabled = await dbFeatureEnabled(db, 'MATRIX_SELF_FINANCING_GROWTH_ENABLED');
  return json({
    ok: true,
    schema_ready: true,
    revenue_events: Number(revenueCount?.count || 0),
    latest_finance_snapshot: finance || null,
    recent_experiments: experiments?.results || [],
    recent_capital_proposals: proposals?.results || [],
    recent_learning: lessons?.results || [],
    controls: {
      automatic_growth_execution_enabled: dbGrowthEnabled && enabled(env?.MATRIX_SELF_FINANCING_GROWTH_ENABLED, false),
      automatic_spend_limit_eur: 0,
      payment_mutation_allowed: false,
      evidence_threshold_mutation_allowed: false,
      owner_approval_required_for_any_spend: true
    },
    generated_at: new Date().toISOString()
  });
}

export function isLevel5SelfFinancingRoute(path = '') {
  return ROUTES.has(String(path || '').replace(/\/+$/, '') || '/');
}

export async function handleLevel5SelfFinancingRoute(request, env) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (path === '/api/ai-management/admin/level5/status' && request.method === 'GET') return status(env);
  if (path === '/api/ai-management/admin/level5/revenue-events' && request.method === 'POST') return ingestRevenueEvents(request, env);
  if (path === '/api/ai-management/admin/level5/cycle' && request.method === 'POST') return runLevel5Cycle(request, env);
  return json({ ok: false, error: 'Level 5 self-financing route not found' }, 404);
}

export const level5SelfFinancingInternals = {
  CATEGORIES,
  EVENT_TYPES,
  FINANCIAL_EVENT_TYPES,
  SAFE_METADATA_KEYS,
  FINANCE_POLICY,
  clean,
  finite,
  money,
  enabled,
  safeMetadata,
  normalizeCycleSummary,
  normalizeRevenueEvent,
  aggregateRevenue,
  loadPriorLearning
};
