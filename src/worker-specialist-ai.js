import { SpecialistAIDirector } from '../ai-management/autonomy/specialist-ai-director.mjs';
import { SpecialistExecutionPlanner, EXECUTION_PROFILES } from '../ai-management/autonomy/specialist-execution-planner.mjs';

const ROUTES = new Set([
  '/api/ai-management/admin/specialists/status',
  '/api/ai-management/admin/specialists/plan',
  '/api/ai-management/admin/specialists/result'
]);

const SPECIALISTS = new Set(['mission_director','investigator','auditor','publisher','growth','resource_hunter','architect']);
const REQUIRED_TABLES = ['matrix_agent_missions','matrix_agent_runs','matrix_agent_handoffs','matrix_agent_execution_specs'];
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

function safeTarget(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9:_./-]+/g, '-').slice(0, 300);
}

function cleanRefs(values, maximum = 500) {
  const source = Array.isArray(values) ? values : [];
  const result = [];
  const seen = new Set();
  for (const value of source) {
    const text = String(value || '').trim().slice(0, 300);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= maximum) break;
  }
  return result;
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(String(value || '')); } catch { return fallback; }
}

async function readBody(request, maximumBytes = 128 * 1024) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maximumBytes) throw new Error('Request body exceeds the specialist control-plane limit');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new Error('Request body exceeds the specialist control-plane limit');
  return text ? JSON.parse(text) : {};
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

async function featureEnabled(db, flagName) {
  try {
    const row = await db.prepare('SELECT enabled FROM ai_feature_flags WHERE flag_name=? LIMIT 1').bind(flagName).first();
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
    publication_target_id: safeTarget(input.publication_target_id),
    revenue_health: clamp(input.revenue_health ?? 1),
    retention_health: clamp(input.retention_health ?? 1),
    resource_pressure: clamp(input.resource_pressure ?? 0),
    site_health: clamp(input.site_health ?? 1)
  };
}

async function readAuditorClearances(db, publicationTargetId = '') {
  const target = safeTarget(publicationTargetId);
  if (!target) return [];
  try {
    const rows = await db.prepare(`SELECT handoff_id,mission_id,evidence_json,resolved_at
      FROM matrix_agent_handoffs
      WHERE from_specialist='auditor'
        AND to_specialist='publisher'
        AND condition_name='publication_gate_passed'
        AND gate_passed=1
      ORDER BY resolved_at DESC, created_at DESC
      LIMIT 200`).all();
    return (rows?.results || []).map(row => ({
      handoff_id: row.handoff_id,
      mission_id: row.mission_id,
      evidence: parseJson(row.evidence_json, {}),
      resolved_at: row.resolved_at
    })).filter(row => safeTarget(row.evidence?.publication_target_id) === target);
  } catch {
    return [];
  }
}

async function countAllAuditorClearances(db) {
  try {
    return Number((await db.prepare(`SELECT COUNT(*) AS count FROM matrix_agent_handoffs
      WHERE from_specialist='auditor' AND to_specialist='publisher' AND condition_name='publication_gate_passed' AND gate_passed=1`).first())?.count || 0);
  } catch {
    return 0;
  }
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

async function persistExecutionSpecs(db, specs, generatedAt) {
  let persisted = 0;
  for (const spec of specs || []) {
    const profile = EXECUTION_PROFILES[spec.specialist];
    if (!profile) continue;
    const route = spec.model_route_request || {};
    const contract = spec.local_execution_contract || {};
    const specId = `${spec.mission_id}:local-execution:v1`.slice(0, 500);
    await db.prepare(`INSERT OR IGNORE INTO matrix_agent_execution_specs(
      spec_id,mission_id,specialist,task_profile,fallback_task_profile,context_policy,
      evidence_reference_ids_json,artifact_reference_ids_json,auditor_clearance_ids_json,
      prompt_tokens_estimate,maximum_output_tokens,prompt_material_in_cloud_payload,
      local_prompt_resolution_required,cost_ceiling_eur,paid_fallback_allowed,
      external_network_inference_allowed,evidence_gate_bypass_allowed,production_deployment_allowed,
      status,block_reason,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,1,0,0,0,0,0,?,?,?,?)`).bind(
      specId,
      spec.mission_id,
      spec.specialist,
      route.task_profile || profile.task_profile,
      route.fallback_task_profile || profile.fallback_task_profile || null,
      contract.context_policy || profile.context_policy,
      JSON.stringify(contract.evidence_reference_ids || []),
      JSON.stringify(contract.artifact_reference_ids || []),
      JSON.stringify(contract.auditor_clearance_ids || []),
      Math.max(1, Number(route.prompt_tokens_estimate || 1)),
      Math.max(1, Number(contract.maximum_output_tokens || profile.max_tokens)),
      spec.status === 'blocked' ? 'blocked' : 'planned',
      spec.block_reason || null,
      generatedAt,
      generatedAt
    ).run();
    persisted += 1;
  }
  return persisted;
}

async function status(env) {
  const ready = await schemaReady(env);
  if (!ready) return json({ ok: false, schema_ready: false, error: 'Phase 15-16 specialist AI schema is not ready' }, 503);
  const [missions, runs, handoffs, specs] = await Promise.all([
    env.MEMBERS_DB.prepare("SELECT specialist,status,COUNT(*) AS count FROM matrix_agent_missions GROUP BY specialist,status ORDER BY specialist,status").all(),
    env.MEMBERS_DB.prepare("SELECT specialist,status,COUNT(*) AS count FROM matrix_agent_runs GROUP BY specialist,status ORDER BY specialist,status").all(),
    env.MEMBERS_DB.prepare("SELECT from_specialist,to_specialist,gate_passed,COUNT(*) AS count FROM matrix_agent_handoffs GROUP BY from_specialist,to_specialist,gate_passed ORDER BY from_specialist,to_specialist").all(),
    env.MEMBERS_DB.prepare("SELECT specialist,status,task_profile,COUNT(*) AS count FROM matrix_agent_execution_specs GROUP BY specialist,status,task_profile ORDER BY specialist,status,task_profile").all()
  ]);
  const orchestrationDbEnabled = await featureEnabled(env.MEMBERS_DB, 'MATRIX_SPECIALIST_AI_ORCHESTRATION_ENABLED');
  const executionDbEnabled = await featureEnabled(env.MEMBERS_DB, 'MATRIX_SPECIALIST_LOCAL_EXECUTION_PLANNING_ENABLED');
  return json({
    ok: true,
    schema_ready: true,
    enabled: enabled(env?.MATRIX_SPECIALIST_AI_ORCHESTRATION_ENABLED, false) && orchestrationDbEnabled,
    local_execution_planning_enabled: enabled(env?.MATRIX_SPECIALIST_LOCAL_EXECUTION_PLANNING_ENABLED, false) && executionDbEnabled,
    architecture: new SpecialistAIDirector().describe(),
    execution_architecture: new SpecialistExecutionPlanner().describe(),
    mission_counts: missions?.results || [],
    run_counts: runs?.results || [],
    handoff_counts: handoffs?.results || [],
    execution_spec_counts: specs?.results || [],
    persisted_auditor_clearances: await countAllAuditorClearances(env.MEMBERS_DB),
    controls: {
      execution_mode: 'plan_or_draft_only',
      external_consequence_execution_allowed: false,
      automatic_spending_allowed: false,
      automatic_production_deployment_allowed: false,
      auditor_gate_before_publication_required: true,
      explicit_auditor_clearance_required_for_publisher: true,
      target_specific_auditor_clearance_required: true,
      caller_supplied_auditor_clearance_trusted: false,
      raw_local_model_output_persisted_by_control_plane: false,
      cloud_prompt_material_allowed: false
    },
    generated_at: new Date().toISOString()
  });
}

async function plan(request, env) {
  if (!await schemaReady(env)) return json({ ok: false, error: 'Phase 15-16 specialist AI schema is not ready' }, 503);
  const orchestrationRuntimeEnabled = enabled(env?.MATRIX_SPECIALIST_AI_ORCHESTRATION_ENABLED, false);
  const orchestrationDbEnabled = await featureEnabled(env.MEMBERS_DB, 'MATRIX_SPECIALIST_AI_ORCHESTRATION_ENABLED');
  if (!orchestrationRuntimeEnabled || !orchestrationDbEnabled) {
    return json({
      ok: false,
      error: 'Specialist AI orchestration is disabled',
      runtime_enabled: orchestrationRuntimeEnabled,
      database_enabled: orchestrationDbEnabled
    }, 409);
  }

  let body = {};
  try { body = await readBody(request); } catch (error) { return json({ ok: false, error: String(error?.message || error) }, 400); }
  const signals = normalizeSignals(body.signals || {});
  const auditorClearances = await readAuditorClearances(env.MEMBERS_DB, signals.publication_target_id);
  signals.auditor_cleared_report_count = auditorClearances.length;

  const director = new SpecialistAIDirector({ maximumMissions: 12 });
  const missionPlan = director.plan({
    signals,
    policy: { owner_approval_required_for_external_consequence: true }
  });
  const persisted = await persistPlan(env.MEMBERS_DB, missionPlan);

  const executionRuntimeEnabled = enabled(env?.MATRIX_SPECIALIST_LOCAL_EXECUTION_PLANNING_ENABLED, false);
  const executionDbEnabled = await featureEnabled(env.MEMBERS_DB, 'MATRIX_SPECIALIST_LOCAL_EXECUTION_PLANNING_ENABLED');
  let executionSpecs = [];
  let executionSpecsPersisted = 0;
  if (executionRuntimeEnabled && executionDbEnabled) {
    const planner = new SpecialistExecutionPlanner();
    const callerContexts = body?.contexts && typeof body.contexts === 'object' ? body.contexts : {};
    const contexts = {};
    for (const mission of missionPlan.missions) {
      const supplied = callerContexts[mission.mission_id] || {};
      contexts[mission.mission_id] = {
        evidence_reference_ids: supplied.evidence_reference_ids,
        artifact_reference_ids: supplied.artifact_reference_ids,
        prompt_tokens_estimate: supplied.prompt_tokens_estimate,
        max_tokens: supplied.max_tokens,
        auditor_clearance_ids: mission.specialist === 'publisher'
          ? auditorClearances.map(item => item.handoff_id)
          : []
      };
    }
    executionSpecs = planner.planMany({ missions: missionPlan.missions, contexts });
    executionSpecsPersisted = await persistExecutionSpecs(env.MEMBERS_DB, executionSpecs, missionPlan.generated_at);
  }

  return json({
    ok: true,
    signals,
    plan: missionPlan,
    persisted,
    publication_gate: {
      target: signals.publication_target_id || null,
      persisted_target_specific_auditor_clearances: auditorClearances.length,
      caller_supplied_clearance_ignored: true
    },
    execution_planning: {
      enabled: executionRuntimeEnabled && executionDbEnabled,
      specs: executionSpecs,
      specs_persisted: executionSpecsPersisted,
      prompts_persisted: 0,
      prompt_compilation_location: 'owner-controlled-local-machine'
    },
    execution: {
      missions_executed: 0,
      external_consequences_performed: 0,
      spending_performed: 0,
      deployments_performed: 0
    }
  });
}

async function recordResult(request, env) {
  if (!await schemaReady(env)) return json({ ok: false, error: 'Phase 15-16 specialist AI schema is not ready' }, 503);
  const orchestrationRuntimeEnabled = enabled(env?.MATRIX_SPECIALIST_AI_ORCHESTRATION_ENABLED, false);
  const orchestrationDbEnabled = await featureEnabled(env.MEMBERS_DB, 'MATRIX_SPECIALIST_AI_ORCHESTRATION_ENABLED');
  if (!orchestrationRuntimeEnabled || !orchestrationDbEnabled) return json({ ok: false, error: 'Specialist AI orchestration is disabled' }, 409);

  let body = {};
  try { body = await readBody(request); } catch (error) { return json({ ok: false, error: String(error?.message || error) }, 400); }
  const missionId = String(body.mission_id || '').trim().slice(0, 500);
  const specialist = String(body.specialist || '').trim();
  const digest = String(body.result_digest || '').toLowerCase();
  if (!missionId || !SPECIALISTS.has(specialist)) return json({ ok: false, error: 'Valid mission_id and specialist are required' }, 400);
  if (!/^[a-f0-9]{64}$/.test(digest)) return json({ ok: false, error: 'A SHA-256 result_digest is required; raw model output must not be uploaded' }, 400);
  if (body.raw_output != null || body.prompt != null || body.messages != null) return json({ ok: false, error: 'Raw prompt/model output is forbidden on the specialist result endpoint' }, 400);
  if (body.cost_confirmed_zero !== true || body.inference_external_network_used !== false) return json({ ok: false, error: 'Result did not prove zero-cost loopback inference' }, 400);
  if (body.external_consequence_performed !== false || body.production_deployment_performed !== false || body.money_moved !== false) {
    return json({ ok: false, error: 'Specialist result reported a forbidden external consequence' }, 400);
  }

  const missionRow = await env.MEMBERS_DB.prepare('SELECT mission_id,specialist,status,evidence_json FROM matrix_agent_missions WHERE mission_id=? LIMIT 1').bind(missionId).first();
  if (!missionRow || missionRow.specialist !== specialist) return json({ ok: false, error: 'Specialist result does not match a persisted mission' }, 404);

  const now = new Date().toISOString();
  const resultStatus = ['completed','failed','blocked'].includes(body.status) ? body.status : 'completed';
  const inputEvidenceIds = cleanRefs(body.input_evidence_ids);
  const outputEvidenceIds = cleanRefs(body.output_evidence_ids);
  const publicationTargetId = safeTarget(body.publication_target_id);
  const runId = String(body.run_id || `${missionId}:receipt:${digest.slice(0, 16)}`).slice(0, 500);
  const metrics = {
    result_digest: digest,
    usage: body.usage && typeof body.usage === 'object' ? body.usage : {},
    model_route_score: finite(body.model_route_score, 0),
    publication_gate_passed: body.publication_gate_passed === true,
    provenance_checked: body.provenance_checked === true,
    contrary_evidence_considered: body.contrary_evidence_considered === true,
    raw_output_persisted: false,
    cost_confirmed_zero: true,
    inference_external_network_used: false
  };

  await env.MEMBERS_DB.prepare(`INSERT OR REPLACE INTO matrix_agent_runs(
    run_id,mission_id,specialist,model_id,resource_id,input_evidence_ids_json,output_evidence_ids_json,metrics_json,
    cost_eur,external_consequence,policy_bypass_used,started_at,completed_at,status
  ) VALUES(?,?,?,?,?,?,?,?,0,0,0,?,?,?)`).bind(
    runId,
    missionId,
    specialist,
    String(body.model_id || '').slice(0, 300) || null,
    String(body.resource_id || '').slice(0, 300) || null,
    JSON.stringify(inputEvidenceIds),
    JSON.stringify(outputEvidenceIds),
    JSON.stringify(metrics),
    String(body.started_at || now).slice(0, 50),
    now,
    resultStatus
  ).run();

  await env.MEMBERS_DB.prepare('UPDATE matrix_agent_missions SET status=?,result_json=?,updated_at=?,completed_at=? WHERE mission_id=?').bind(
    resultStatus,
    JSON.stringify({ result_digest: digest, output_evidence_ids: outputEvidenceIds, raw_output_persisted: false }),
    now,
    resultStatus === 'completed' ? now : null,
    missionId
  ).run();
  await env.MEMBERS_DB.prepare('UPDATE matrix_agent_execution_specs SET status=?,updated_at=? WHERE mission_id=?').bind(resultStatus, now, missionId).run();

  const outgoing = {
    investigator: 'evidence_candidates_ready',
    growth: 'experiment_result_ready',
    resource_hunter: 'resource_benchmark_ready',
    architect: 'tested_change_ready'
  }[specialist];
  let handoffResolved = false;
  let publicationCleared = false;
  if (resultStatus === 'completed' && outgoing) {
    await env.MEMBERS_DB.prepare(`UPDATE matrix_agent_handoffs SET gate_passed=1,evidence_json=?,resolved_at=?
      WHERE mission_id=? AND from_specialist=? AND condition_name=?`).bind(
      JSON.stringify({ result_digest: digest, output_evidence_ids: outputEvidenceIds, raw_output_persisted: false }),
      now,
      missionId,
      specialist,
      outgoing
    ).run();
    handoffResolved = true;
  }

  if (specialist === 'auditor') {
    const mayClear = resultStatus === 'completed'
      && body.publication_gate_passed === true
      && body.provenance_checked === true
      && body.contrary_evidence_considered === true
      && publicationTargetId
      && outputEvidenceIds.length > 0;
    const auditEvidence = {
      result_digest: digest,
      publication_target_id: publicationTargetId || null,
      publication_gate_passed: mayClear,
      provenance_checked: body.provenance_checked === true,
      contrary_evidence_considered: body.contrary_evidence_considered === true,
      output_evidence_ids: outputEvidenceIds,
      raw_output_persisted: false
    };
    await env.MEMBERS_DB.prepare(`UPDATE matrix_agent_handoffs SET gate_passed=?,evidence_json=?,resolved_at=?
      WHERE mission_id=? AND from_specialist='auditor' AND to_specialist='publisher' AND condition_name='publication_gate_passed'`).bind(
      mayClear ? 1 : 0,
      JSON.stringify(auditEvidence),
      now,
      missionId
    ).run();
    handoffResolved = true;
    publicationCleared = Boolean(mayClear);
  }

  return json({
    ok: true,
    run_id: runId,
    mission_id: missionId,
    specialist,
    status: resultStatus,
    result_digest: digest,
    raw_output_persisted: false,
    handoff_resolved: handoffResolved,
    publication_target_id: publicationTargetId || null,
    publication_cleared: publicationCleared,
    controls: {
      cost_confirmed_zero: true,
      inference_external_network_used: false,
      external_consequence_performed: false,
      production_deployment_performed: false,
      money_moved: false
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
  if (path === '/api/ai-management/admin/specialists/result' && request.method === 'POST') return recordResult(request, env);
  return json({ ok: false, error: 'Specialist AI route not found' }, 404);
}

export const specialistAIInternals = {
  normalizeSignals,
  persistPlan,
  persistExecutionSpecs,
  readAuditorClearances,
  countAllAuditorClearances,
  recordResult,
  schemaReady
};
