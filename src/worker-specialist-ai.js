import { SpecialistAIDirector } from '../ai-management/autonomy/specialist-ai-director.mjs';

const ROUTES = new Set([
  '/api/ai-management/admin/specialists/status',
  '/api/ai-management/admin/specialists/plan'
]);

const REQUIRED_TABLES = ['matrix_agent_missions','matrix_agent_runs','matrix_agent_handoffs'];
const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-matrix-origin': 'matrix-specialist-ai'
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), { status, headers: HEADERS });
}

function enabled(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

async function tableExists(db, name) {
  try {
    const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(name).first();
    return row?.name === name;
  } catch {
    return false;
  }
}

async function schemaReady(env) {
  if (!env?.MEMBERS_DB?.prepare) return false;
  const checks = await Promise.all(REQUIRED_TABLES.map(name => tableExists(env.MEMBERS_DB, name)));
  return checks.every(Boolean);
}

async function dbFeatureEnabled(db) {
  try {
    const row = await db.prepare("SELECT enabled FROM ai_feature_flags WHERE flag_name='MATRIX_SPECIALIST_AI_ORCHESTRATION_ENABLED' LIMIT 1").first();
    return Number(row?.enabled || 0) === 1;
  } catch {
    return false;
  }
}

function normalizeSignals(input = {}) {
  return {
    investigation_backlog: Math.max(0, Math.min(100000, finite(input.investigation_backlog, 0))),
    unverified_evidence_count: Math.max(0, Math.min(1000000, finite(input.unverified_evidence_count, 0))),
    stale_report_count: Math.max(0, Math.min(100000, finite(input.stale_report_count, 0))),
    revenue_health: clamp(input.revenue_health ?? 1),
    retention_health: clamp(input.retention_health ?? 1),
    resource_pressure: clamp(input.resource_pressure ?? 0),
    site_health: clamp(input.site_health ?? 1)
  };
}

async function persistPlan(db, plan) {
  const now = plan.generated_at;
  let missionsPersisted = 0;
  let handoffsPersisted = 0;

  for (const item of plan.missions || []) {
    await db.prepare(`INSERT OR IGNORE INTO matrix_agent_missions(
      mission_id,specialist,objective,priority,status,execution_mode,owner_approval_required,evidence_json,result_json,created_at,updated_at,completed_at
    ) VALUES(?,?,?,?, 'proposed','plan_or_draft_only',1,?,NULL,?,?,NULL)`).bind(
      item.mission_id,
      item.specialist,
      item.objective,
      item.priority,
      JSON.stringify(item.evidence || {}),
      now,
      now
    ).run();
    missionsPersisted += 1;

    for (const handoff of (plan.handoffs || []).filter(entry => entry.from === item.specialist)) {
      const handoffId = `${item.mission_id}:${handoff.from}:${handoff.to}:${handoff.condition}`.slice(0, 500);
      await db.prepare(`INSERT OR IGNORE INTO matrix_agent_handoffs(
        handoff_id,mission_id,from_specialist,to_specialist,condition_name,mandatory,gate_passed,evidence_json,created_at,resolved_at
      ) VALUES(?,?,?,?,?,1,0,'{}',?,NULL)`).bind(
        handoffId,
        item.mission_id,
        handoff.from,
        handoff.to,
        handoff.condition,
        now
      ).run();
      handoffsPersisted += 1;
    }
  }

  return { missions_persisted: missionsPersisted, handoffs_persisted: handoffsPersisted };
}

async function status(env) {
  const ready = await schemaReady(env);
  if (!ready) return json({ ok: false, schema_ready: false, error: 'Phase 15 specialist AI schema is not ready' }, 503);
  const [missions, runs, handoffs] = await Promise.all([
    env.MEMBERS_DB.prepare("SELECT specialist,status,COUNT(*) AS count FROM matrix_agent_missions GROUP BY specialist,status ORDER BY specialist,status").all(),
    env.MEMBERS_DB.prepare("SELECT specialist,status,COUNT(*) AS count FROM matrix_agent_runs GROUP BY specialist,status ORDER BY specialist,status").all(),
    env.MEMBERS_DB.prepare("SELECT from_specialist,to_specialist,gate_passed,COUNT(*) AS count FROM matrix_agent_handoffs GROUP BY from_specialist,to_specialist,gate_passed ORDER BY from_specialist,to_specialist").all()
  ]);
  const dbEnabled = await dbFeatureEnabled(env.MEMBERS_DB);
  return json({
    ok: true,
    schema_ready: true,
    enabled: enabled(env?.MATRIX_SPECIALIST_AI_ORCHESTRATION_ENABLED, false) && dbEnabled,
    architecture: new SpecialistAIDirector().describe(),
    mission_counts: missions?.results || [],
    run_counts: runs?.results || [],
    handoff_counts: handoffs?.results || [],
    controls: {
      execution_mode: 'plan_or_draft_only',
      external_consequence_execution_allowed: false,
      automatic_spending_allowed: false,
      automatic_production_deployment_allowed: false,
      auditor_gate_before_publication_required: true
    },
    generated_at: new Date().toISOString()
  });
}

async function plan(request, env) {
  if (!await schemaReady(env)) return json({ ok: false, error: 'Phase 15 specialist AI schema is not ready' }, 503);
  const runtimeEnabled = enabled(env?.MATRIX_SPECIALIST_AI_ORCHESTRATION_ENABLED, false);
  const databaseEnabled = await dbFeatureEnabled(env.MEMBERS_DB);
  if (!runtimeEnabled || !databaseEnabled) {
    return json({
      ok: false,
      error: 'Specialist AI orchestration is disabled',
      runtime_enabled: runtimeEnabled,
      database_enabled: databaseEnabled
    }, 409);
  }

  let body = {};
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON body' }, 400); }
  const signals = normalizeSignals(body.signals || {});
  const director = new SpecialistAIDirector({ maximumMissions: 12 });
  const missionPlan = director.plan({
    signals,
    policy: { owner_approval_required_for_external_consequence: true }
  });
  const persisted = await persistPlan(env.MEMBERS_DB, missionPlan);
  return json({
    ok: true,
    signals,
    plan: missionPlan,
    persisted,
    execution: {
      missions_executed: 0,
      external_consequences_performed: 0,
      spending_performed: 0,
      deployments_performed: 0
    }
  });
}

export function isSpecialistAIRoute(path = '') {
  return ROUTES.has(path);
}

export async function handleSpecialistAIRoute(request, env) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (path === '/api/ai-management/admin/specialists/status' && request.method === 'GET') return status(env);
  if (path === '/api/ai-management/admin/specialists/plan' && request.method === 'POST') return plan(request, env);
  return json({ ok: false, error: 'Specialist AI route not found' }, 404);
}

export const specialistAIInternals = { normalizeSignals, persistPlan, schemaReady };
