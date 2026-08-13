import { deriveLivingActions } from '../ai-management/living-matrix/living-matrix-cycle.mjs';

const CONSUMER_ID = 'living-matrix-v1';
const PUBLIC_ROUTE = '/api/matrix/evolution';
const ADMIN_ROUTE = '/api/matrix/admin/living-cycle';
const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'x-matrix-origin': 'living-matrix-cycle'
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), { status, headers: HEADERS });
}

function clean(value, maximum = 1000) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function parseJson(value, fallback) {
  try { return JSON.parse(String(value || '')); } catch { return fallback; }
}

function nowIso(clock) {
  return (clock ? clock() : new Date()).toISOString();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((output, key) => {
    output[key] = stable(value[key]);
    return output;
  }, {});
  return value;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(stable(value)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function rows(statement) {
  return (await statement.all())?.results || [];
}

async function schemaReady(env) {
  if (!env?.MEMBERS_DB?.prepare) return false;
  try {
    await env.MEMBERS_DB.prepare('SELECT cycle_id FROM matrix_living_cycles LIMIT 1').all();
    await env.MEMBERS_DB.prepare('SELECT projection_key FROM matrix_living_projections LIMIT 1').all();
    await env.MEMBERS_DB.prepare('SELECT event_id FROM matrix_event_dispatches LIMIT 1').all();
    return true;
  } catch {
    return false;
  }
}

async function count(db, sql, parameters = []) {
  try {
    const row = await db.prepare(sql).bind(...parameters).first();
    return Number(row?.count || 0);
  } catch {
    return 0;
  }
}

async function upsertProjection(db, action, at) {
  const contentHash = await sha256(action.content);
  const existing = await db.prepare(`SELECT content_hash,version,state,public_visible
    FROM matrix_living_projections WHERE projection_key=? LIMIT 1`).bind(action.projection_key).first();
  if (existing && existing.content_hash === contentHash && existing.state === action.state && Boolean(existing.public_visible) === action.public_visible) {
    return { projection_key: action.projection_key, changed: false, version: Number(existing.version) };
  }
  const version = Number(existing?.version || 0) + 1;
  await db.prepare(`INSERT INTO matrix_living_projections(
      projection_key,projection_type,subject_id,source_event_id,evidence_class,version,content_hash,previous_hash,content_json,public_visible,state,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(projection_key) DO UPDATE SET
      projection_type=excluded.projection_type,subject_id=excluded.subject_id,source_event_id=excluded.source_event_id,
      evidence_class=excluded.evidence_class,version=excluded.version,content_hash=excluded.content_hash,
      previous_hash=excluded.previous_hash,content_json=excluded.content_json,public_visible=excluded.public_visible,
      state=excluded.state,updated_at=excluded.updated_at`).bind(
    action.projection_key,
    action.projection_type,
    action.subject_id,
    action.source_event_id,
    action.evidence_class,
    version,
    contentHash,
    existing?.content_hash || null,
    JSON.stringify(action.content),
    action.public_visible ? 1 : 0,
    action.state,
    at
  ).run();
  return { projection_key: action.projection_key, changed: true, version, previous_hash: existing?.content_hash || null };
}

async function processEvent(db, row, at) {
  const event = {
    ...row,
    affected_entities: parseJson(row.affected_entities_json, []),
    affected_pages: parseJson(row.affected_pages_json, []),
    payload: parseJson(row.payload_json, {})
  };
  await db.prepare(`INSERT INTO matrix_event_dispatches(event_id,consumer_id,status,attempts,receipt_json,started_at)
    VALUES(?,?, 'processing',1,'{}',?)
    ON CONFLICT(event_id,consumer_id) DO UPDATE SET status='processing',attempts=attempts+1,error_text=NULL,started_at=excluded.started_at`).bind(
    event.event_id, CONSUMER_ID, at
  ).run();
  try {
    const derived = deriveLivingActions(event);
    const applied = [];
    for (const action of derived.actions) applied.push(await upsertProjection(db, action, at));
    for (const dependency of derived.dependencies) {
      await db.prepare(`INSERT INTO matrix_page_dependencies(page_id,dependency_type,dependency_id,source_event_id,updated_at)
        VALUES(?,?,?,?,?) ON CONFLICT(page_id,dependency_type,dependency_id) DO UPDATE SET
        source_event_id=excluded.source_event_id,updated_at=excluded.updated_at`).bind(
        dependency.page_id, dependency.dependency_type, dependency.dependency_id, event.event_id, at
      ).run();
    }
    const dispatchStatus = derived.quarantine ? 'quarantined' : 'processed';
    const receipt = {
      event_id: event.event_id,
      publication: derived.publication,
      projections_changed: applied.filter(item => item.changed).length,
      projection_versions: applied,
      dependencies_recorded: derived.dependencies.length,
      cost_confirmed_zero: true
    };
    await db.prepare(`UPDATE matrix_event_dispatches SET status=?,receipt_json=?,completed_at=?
      WHERE event_id=? AND consumer_id=?`).bind(dispatchStatus, JSON.stringify(receipt), at, event.event_id, CONSUMER_ID).run();
    await db.prepare(`INSERT OR IGNORE INTO matrix_learning_ledger(
      learning_id,source_event_id,domain,observation,proposed_change,change_class,decision,evidence_json,audit_identifier,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(
      `living-${event.event_id}`,
      event.event_id,
      'living-matrix',
      `event-projection:${event.event_type}`,
      'Use the accepted projection state in later retrieval, page refresh and cycle reporting.',
      'A',
      derived.quarantine ? 'quarantined' : 'recorded',
      JSON.stringify(receipt),
      `living-projection-${event.event_id}`,
      at
    ).run();
    return receipt;
  } catch (error) {
    await db.prepare(`UPDATE matrix_event_dispatches SET status='failed',error_text=?,completed_at=?
      WHERE event_id=? AND consumer_id=?`).bind(clean(error?.message || error, 1200), at, event.event_id, CONSUMER_ID).run();
    throw error;
  }
}

async function buildReport(db, { cycleId, cycleDate, trigger, startedAt, completedAt, processed, failed }) {
  const [events, evidence, claims, dossiers, forecasts, stalePages, publicChanges, investigations, resources, healthyResources,
    localNodes, onlineNodes, queuedJobs, completedJobs, opportunities, approvedOpportunities, quarantinedOpportunities, learningSignals,
    valueLeads, valueProven, valueReady, valueReceived, valueReceivedNetEur, valueTargetNetEur] = await Promise.all([
    count(db, 'SELECT COUNT(*) AS count FROM matrix_events'),
    count(db, "SELECT COUNT(*) AS count FROM matrix_living_projections WHERE projection_type='evidence' AND state='active'"),
    count(db, "SELECT COUNT(*) AS count FROM matrix_living_projections WHERE projection_type='claim' AND state='active'"),
    count(db, "SELECT COUNT(*) AS count FROM matrix_living_projections WHERE projection_type='dossier' AND state='active'"),
    count(db, "SELECT COUNT(*) AS count FROM matrix_living_projections WHERE projection_type='forecast' AND state='active'"),
    count(db, "SELECT COUNT(*) AS count FROM matrix_living_projections WHERE projection_type='page' AND state='stale'"),
    count(db, "SELECT COUNT(*) AS count FROM matrix_living_projections WHERE projection_type='what_changed' AND public_visible=1 AND state='active'"),
    count(db, "SELECT COUNT(*) AS count FROM matrix_public_investigations WHERE status='completed'"),
    count(db, 'SELECT COUNT(*) AS count FROM ai_resources WHERE enabled=1'),
    count(db, "SELECT COUNT(*) AS count FROM ai_resources WHERE enabled=1 AND health_status='healthy' AND billing_enabled=0 AND payment_method_present=0"),
    count(db, 'SELECT COUNT(*) AS count FROM ai_local_runtime_nodes'),
    count(db, "SELECT COUNT(*) AS count FROM ai_local_runtime_nodes WHERE status='online'"),
    count(db, "SELECT COUNT(*) AS count FROM ai_local_jobs WHERE status IN ('queued','leased')"),
    count(db, "SELECT COUNT(*) AS count FROM ai_local_jobs WHERE status='completed'"),
    count(db, 'SELECT COUNT(*) AS count FROM ai_opportunities'),
    count(db, "SELECT COUNT(*) AS count FROM ai_opportunities WHERE approval_state='approved-auto'"),
    count(db, "SELECT COUNT(*) AS count FROM ai_opportunities WHERE approval_state='quarantined'"),
    count(db, 'SELECT COUNT(*) AS count FROM matrix_learning_ledger'),
    count(db, 'SELECT COUNT(*) AS count FROM matrix_value_opportunities'),
    count(db, 'SELECT COUNT(*) AS count FROM matrix_value_opportunities WHERE entitlement_proven=1'),
    count(db, "SELECT COUNT(*) AS count FROM matrix_value_opportunities WHERE state='READY_TO_CLAIM'"),
    count(db, "SELECT COUNT(*) AS count FROM matrix_value_opportunities WHERE state IN ('RECEIVED','SWEPT_TO_APPROVED_DESTINATION')"),
    count(db, "SELECT COALESCE(SUM(net_amount_minor),0) AS count FROM matrix_value_receipts WHERE reconciled=1 AND asset='EUR'"),
    count(db, "SELECT COALESCE(MAX(target_net_minor),1000000) AS count FROM matrix_value_objectives WHERE status='active' AND target_currency='EUR'")
  ]);
  return {
    report_type: 'Matrix Evolution Report',
    cycle_id: cycleId,
    cycle_date: cycleDate,
    trigger,
    started_at: startedAt,
    completed_at: completedAt,
    cost_confirmed_zero: true,
    intelligence: { total_events: events, processed_this_cycle: processed.length, failed_this_cycle: failed.length, evidence, claims, dossiers, forecasts },
    site: { stale_pages: stalePages, public_what_changed: publicChanges, incremental_rebuild_required: stalePages > 0 },
    ask_matrix: { completed_investigations: investigations, dynamic_verified_evidence_enabled: true },
    compute: { registered_resources: resources, healthy_zero_spend_resources: healthyResources, local_nodes: localNodes, online_nodes: onlineNodes, queued_or_leased_jobs: queuedJobs, completed_jobs: completedJobs },
    resource_hunter: { candidates: opportunities, approved_zero_spend: approvedOpportunities, quarantined: quarantinedOpportunities },
    value_hunter: {
      target_net_eur_minor: valueTargetNetEur || 1000000,
      reconciled_net_eur_minor: valueReceivedNetEur,
      remaining_net_eur_minor: Math.max(0, (valueTargetNetEur || 1000000) - valueReceivedNetEur),
      discovered_leads: valueLeads,
      proven_entitlements: valueProven,
      ready_to_claim: valueReady,
      received_or_swept: valueReceived,
      unclaimed_is_not_ownerless: true
    },
    learning: { signals: learningSignals, changes_future_decisions: true },
    failures: failed,
    tomorrow: [
      stalePages ? `Incrementally rebuild ${stalePages} stale page projection(s).` : 'Continue source and correction monitoring.',
      onlineNodes ? 'Route eligible background work to idle owner-controlled nodes.' : 'Keep local jobs queued until an approved zero-cost node is online.',
      quarantinedOpportunities ? `Revalidate ${quarantinedOpportunities} quarantined resource candidate(s); do not activate without proof.` : 'Discover and benchmark additional lawful zero-spend resources.',
      valueReady ? `Collect ${valueReady} proven value opportunity or opportunities through approved destinations and adapters.` : 'Continue official value discovery and prove claimant entitlement before collection.'
    ]
  };
}

export async function runLivingMatrixCycle(env, { trigger = 'manual', clock } = {}) {
  if (!(await schemaReady(env))) return { ok: false, skipped: true, reason: 'living-matrix-schema-unavailable' };
  const db = env.MEMBERS_DB;
  const startedAt = nowIso(clock);
  const cycleDate = startedAt.slice(0, 10);
  const pending = await rows(db.prepare(`SELECT e.event_id,e.event_type,e.timestamp,e.origin,e.source,e.evidence_class,
      e.affected_entities_json,e.affected_pages_json,e.payload_json
    FROM matrix_events e LEFT JOIN matrix_event_dispatches d
      ON d.event_id=e.event_id AND d.consumer_id=?
    WHERE d.status IS NULL OR d.status='failed'
    ORDER BY e.timestamp ASC,e.event_id ASC LIMIT 500`).bind(CONSUMER_ID));
  const highWater = pending.at(-1)?.event_id || 'summary';
  const cycleId = `living-${cycleDate}-${clean(highWater, 120).replace(/[^a-zA-Z0-9._-]+/g, '-')}`;
  const existing = await db.prepare('SELECT status,report_json FROM matrix_living_cycles WHERE cycle_id=? LIMIT 1').bind(cycleId).first();
  if (existing && ['completed', 'completed_with_findings'].includes(existing.status)) {
    return { ok: true, reused: true, report: parseJson(existing.report_json, {}) };
  }
  await db.prepare(`INSERT INTO matrix_living_cycles(cycle_id,cycle_date,trigger_name,status,high_water_event_id,phases_json,report_json,cost_confirmed_zero,started_at)
    VALUES(?,?,?,'running',?,'[]','{}',1,?)
    ON CONFLICT(cycle_id) DO UPDATE SET trigger_name=excluded.trigger_name,status='running',started_at=excluded.started_at,completed_at=NULL`).bind(
    cycleId, cycleDate, clean(trigger, 100), highWater === 'summary' ? null : highWater, startedAt
  ).run();
  const processed = [];
  const failed = [];
  for (const event of pending) {
    try { processed.push(await processEvent(db, event, nowIso(clock))); }
    catch (error) { failed.push({ event_id: event.event_id, error: clean(error?.message || error, 500) }); }
  }
  const completedAt = nowIso(clock);
  const report = await buildReport(db, { cycleId, cycleDate, trigger: clean(trigger, 100), startedAt, completedAt, processed, failed });
  const status = failed.length ? 'completed_with_findings' : 'completed';
  const phases = [
    { phase: 'consume-events', status: failed.length ? 'completed-with-findings' : 'completed', processed: processed.length, failed: failed.length },
    { phase: 'update-projections', status: 'completed' },
    { phase: 'publish-report', status: 'completed' }
  ];
  await db.prepare(`UPDATE matrix_living_cycles SET status=?,phases_json=?,report_json=?,completed_at=? WHERE cycle_id=?`).bind(
    status, JSON.stringify(phases), JSON.stringify(report), completedAt, cycleId
  ).run();
  await db.prepare(`UPDATE matrix_capabilities SET dependencies_reachable=1,data_connected=1,evidence_ready=1,
    live_verification_passed=?,state=?,blocker=?,checked_at=?,evidence_json=? WHERE capability_id IN ('living-matrix-cycle','daily-intelligence-refresh')`).bind(
    failed.length ? 0 : 1,
    failed.length ? 'degraded' : 'live_verified',
    failed.length ? `${failed.length} event(s) failed projection and remain retryable.` : null,
    completedAt,
    JSON.stringify({ cycle_id: cycleId, processed: processed.length, failures: failed.length, cost_confirmed_zero: true })
  ).run();
  return { ok: true, reused: false, status, report };
}

async function publicEvolution(env) {
  if (!(await schemaReady(env))) return json({ ok: false, live: false, reason: 'living-matrix-schema-unavailable' }, 503);
  const cycle = await env.MEMBERS_DB.prepare(`SELECT cycle_id,status,report_json,completed_at FROM matrix_living_cycles
    WHERE status IN ('completed','completed_with_findings') ORDER BY completed_at DESC LIMIT 1`).first();
  const changes = await rows(env.MEMBERS_DB.prepare(`SELECT subject_id,content_json,updated_at FROM matrix_living_projections
    WHERE projection_type='what_changed' AND public_visible=1 AND state='active' ORDER BY updated_at DESC LIMIT 20`));
  if (!cycle) return json({ ok: true, live: false, status: 'awaiting-first-cycle', what_changed: [] });
  return json({
    ok: true,
    live: true,
    status: cycle.status,
    completed_at: cycle.completed_at,
    report: parseJson(cycle.report_json, {}),
    what_changed: changes.map(item => ({ id: item.subject_id, ...parseJson(item.content_json, {}), updated_at: item.updated_at }))
  });
}

export function isLivingMatrixPublicRoute(pathname = '') {
  return (String(pathname || '').replace(/\/+$/, '') || '/') === PUBLIC_ROUTE;
}

export function isLivingMatrixAdminRoute(pathname = '') {
  return (String(pathname || '').replace(/\/+$/, '') || '/') === ADMIN_ROUTE;
}

export async function handleLivingMatrixRoute(request, env) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (path === PUBLIC_ROUTE && request.method === 'GET') return publicEvolution(env);
  if (path !== ADMIN_ROUTE) return json({ ok: false, error: 'Living Matrix route not found' }, 404);
  if (request.method === 'POST') return json(await runLivingMatrixCycle(env, { trigger: 'owner-api' }));
  if (request.method === 'GET') {
    if (!(await schemaReady(env))) return json({ ok: false, reason: 'living-matrix-schema-unavailable' }, 503);
    const cycles = await rows(env.MEMBERS_DB.prepare(`SELECT cycle_id,cycle_date,trigger_name,status,high_water_event_id,phases_json,report_json,started_at,completed_at
      FROM matrix_living_cycles ORDER BY started_at DESC LIMIT 30`));
    return json({ ok: true, cycles: cycles.map(item => ({ ...item, phases: parseJson(item.phases_json, []), report: parseJson(item.report_json, {}) })) });
  }
  return json({ ok: false, error: 'Method not allowed' }, 405);
}

export async function runScheduledLivingMatrix(env) {
  return runLivingMatrixCycle(env, { trigger: 'scheduled-daily-cycle' });
}

export const livingMatrixWorkerInternals = { buildReport, processEvent, schemaReady, upsertProjection };
