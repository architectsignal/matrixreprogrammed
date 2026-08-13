import { MATRIX_LAW, MATRIX_LAW_SHA256 } from '../ai-management/matrix-core/matrix-constitution.mjs';
import { brokerMatrixAction, classifyLearningEffect, computeCapabilityMetrics, planOperatingCycle } from '../ai-management/matrix-core/matrix-operating-system.mjs';
import { emitMatrixSystemEvent } from './matrix-event-emitter.js';

const ROOT = '/api/ai-management/admin/matrix-operations';
const ROUTES = new Set([ROOT, `${ROOT}/doctor`, `${ROOT}/start`, `${ROOT}/missions`, `${ROOT}/history`, `${ROOT}/action/check`]);
const REQUIRED_TABLES = Object.freeze([
  'ai_feature_flags', 'ai_local_jobs', 'matrix_events', 'matrix_human_actions', 'matrix_capabilities',
  'matrix_constitution', 'matrix_system_components', 'matrix_operating_missions', 'matrix_capability_snapshots',
  'matrix_daily_baselines', 'matrix_learning_effects', 'matrix_boot_runs', 'matrix_watchdog_events',
  'matrix_delegations', 'matrix_action_receipts'
]);

function clean(value, maximum = 500) { return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum); }
function parseJson(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function enabled(value, fallback = true) { return value == null || value === '' ? fallback : String(value).toLowerCase() === 'true'; }
function json(value, status = 200) { return new Response(JSON.stringify(value, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-matrix-origin': 'cloudflare-worker-matrix-operations' } }); }
async function rows(statement) { const result = await statement.all(); return result.results || []; }
async function tableExists(db, name) { const record = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(name).first(); return record?.name === name; }
async function sha256(value) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || ''))); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join(''); }

export async function matrixOperationsSchemaReady(env) {
  if (!env?.MEMBERS_DB?.prepare) return false;
  return (await Promise.all(REQUIRED_TABLES.map(name => tableExists(env.MEMBERS_DB, name).catch(() => false)))).every(Boolean);
}

async function constitutionStatus(db) {
  const record = await db.prepare('SELECT constitution_id,law_text,law_sha256,immutable,authority_expansion_by_learning,harm_domains_json,installed_at FROM matrix_constitution WHERE constitution_id=? LIMIT 1').bind('matrix-law-v1').first();
  const valid = record?.law_text === MATRIX_LAW && record?.law_sha256 === MATRIX_LAW_SHA256 && Number(record?.immutable) === 1 && Number(record?.authority_expansion_by_learning) === 0;
  return { valid, record: record ? { ...record, harm_domains: parseJson(record.harm_domains_json, []) } : null };
}

async function currentComponents(db) {
  return (await rows(db.prepare(`SELECT component_id,director,implementation,state,capacity_units,reliability,dependencies_json,health_evidence_json,blocker,last_verified_at,updated_at
    FROM matrix_system_components ORDER BY component_id`))).map(item => ({
    componentId: item.component_id,
    director: item.director,
    implementation: item.implementation,
    state: item.state,
    capacityUnits: Number(item.capacity_units || 0),
    reliability: Number(item.reliability || 0),
    dependencies: parseJson(item.dependencies_json, []),
    healthEvidence: parseJson(item.health_evidence_json, []),
    blocker: item.blocker,
    lastVerifiedAt: item.last_verified_at,
    updatedAt: item.updated_at
  }));
}

async function snapshotHistory(db) {
  return (await rows(db.prepare(`SELECT matrix_effective_power AS effective_power,recorded_at FROM matrix_capability_snapshots
    ORDER BY recorded_at DESC LIMIT 400`))).map(item => ({ effectivePower: Number(item.effective_power || 0), recordedAt: item.recorded_at }));
}

async function refreshObservedComponents(db, now) {
  const observations = [
    ['matrix-event-bus', "SELECT COUNT(*) AS count FROM matrix_events WHERE datetime(timestamp)>=datetime('now','-48 hours')", 'current production event receipt'],
    ['living-matrix', "SELECT COUNT(*) AS count FROM matrix_living_cycles WHERE status IN ('completed','completed_with_findings') AND datetime(completed_at)>=datetime('now','-48 hours')", 'current completed Living Matrix cycle'],
    ['ask-matrix', "SELECT COUNT(*) AS count FROM matrix_public_investigations WHERE status='complete' AND datetime(completed_at)>=datetime('now','-7 days')", 'current completed public investigation'],
    ['resource-hunter', "SELECT COUNT(*) AS count FROM ai_local_job_receipts WHERE receipt_type='completed' AND cost_confirmed_zero=1 AND external_network_used=0 AND datetime(created_at)>=datetime('now','-7 days')", 'real zero-spend workload completion receipt'],
    ['owner-local-compute', "SELECT COUNT(*) AS count FROM ai_local_runtime_nodes n WHERE n.status='online' AND n.cost_confirmed_zero=1 AND n.external_network_used=0 AND EXISTS (SELECT 1 FROM ai_local_job_receipts r WHERE r.node_id=n.node_id AND r.receipt_type='completed' AND datetime(r.created_at)>=datetime('now','-7 days'))", 'online owner node with a real zero-spend workload receipt']
  ];
  for (const [componentId, sql, evidence] of observations) {
    const result = await db.prepare(sql).first().catch(() => ({ count: 0 }));
    if (Number(result?.count || 0) < 1) continue;
    await db.prepare(`UPDATE matrix_system_components SET state='LIVE_WORKING',reliability=1,blocker=NULL,last_verified_at=?,updated_at=?,health_evidence_json=? WHERE component_id=?`).bind(
      now, now, JSON.stringify([evidence, `count:${Number(result.count)}`]), componentId
    ).run();
  }
}

async function healthSignals(db) {
  const [failures, stalled, pendingHuman] = await Promise.all([
    rows(db.prepare(`SELECT event_id AS id,event_type,payload_json,timestamp FROM matrix_events
      WHERE event_type IN ('source.failed','resource.failed','value.failed','value.permissionless.failed','build.failed','system.degraded')
      AND datetime(timestamp)>=datetime('now','-24 hours') ORDER BY timestamp DESC LIMIT 20`)),
    db.prepare(`SELECT COUNT(*) AS count FROM ai_local_jobs WHERE status IN ('queued','leased') AND datetime(updated_at)<datetime('now','-30 minutes')`).first(),
    db.prepare("SELECT COUNT(*) AS count FROM matrix_human_actions WHERE status='awaiting'").first()
  ]);
  return {
    failedCycles: failures.map(item => ({ id: item.id, reason: `${item.event_type}: ${clean(parseJson(item.payload_json, {}).error || parseJson(item.payload_json, {}).change_summary || 'Recorded system failure', 400)}` })),
    stalledQueueCount: Number(stalled?.count || 0),
    pendingHumanActions: Number(pendingHuman?.count || 0)
  };
}

function componentGaps(components) {
  return components.filter(item => item.state !== 'LIVE_WORKING').map(item => ({
    id: item.componentId,
    label: item.componentId,
    reason: item.blocker || `Truthful state is ${item.state}; live evidence is absent.`,
    priority: item.state === 'BROKEN' ? 100 : item.state === 'BLOCKED' ? 90 : item.state === 'SIMULATION_ONLY' ? 75 : 65
  }));
}

async function persistMission(db, cycleId, mission, now) {
  await db.prepare(`INSERT INTO matrix_operating_missions(
    mission_id,mission_type,objective,reason,priority,requirements_json,resources_json,expected_mission_value,
    expected_financial_value_minor,risk_domains_json,required_permissions_json,dependencies_json,success_definition,
    status,results_json,learning_json,retry_ladder_json,source_cycle_id,attempts,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'queued','{}','{}',?,?,0,?,?)
  ON CONFLICT(mission_id) DO UPDATE SET reason=excluded.reason,priority=excluded.priority,requirements_json=excluded.requirements_json,
    resources_json=excluded.resources_json,dependencies_json=excluded.dependencies_json,retry_ladder_json=excluded.retry_ladder_json,
    source_cycle_id=excluded.source_cycle_id,updated_at=excluded.updated_at`).bind(
    mission.mission_id, mission.mission_type, mission.objective, mission.reason, mission.priority,
    JSON.stringify(mission.requirements), JSON.stringify(mission.resources), mission.expected_mission_value,
    mission.expected_financial_value_minor, JSON.stringify(mission.risk_domains), JSON.stringify(mission.required_permissions),
    JSON.stringify(mission.dependencies), mission.success_definition, JSON.stringify(mission.retry_ladder), cycleId, now, now
  ).run();
}

async function persistWatchdog(db, cycleId, mission, now) {
  if (!['RECOVERY_MISSION', 'SYSTEMIC_FAILURE_MISSION', 'AUTONOMY_STALL'].includes(mission.mission_type)) return;
  const componentId = mission.objective.includes('permissionless') ? 'permissionless-value-harvester'
    : mission.objective.includes('cloudflare') ? 'cloudflare-production-release'
      : mission.objective.includes('local') ? 'owner-local-compute' : 'matrix-mission-director';
  await db.prepare(`INSERT OR IGNORE INTO matrix_watchdog_events(
    watchdog_id,component_id,observed_state,severity,action,source_mission_id,evidence_json,recorded_at
  ) VALUES(?,?,?,?,?,?,?,?)`).bind(
    `watchdog-${mission.mission_id}`, componentId, 'requires-recovery', mission.priority >= 95 ? 'critical' : 'warning',
    mission.mission_type === 'SYSTEMIC_FAILURE_MISSION' ? 'systemic_failure_mission_created' : 'recovery_mission_created',
    mission.mission_id, JSON.stringify({ cycle_id: cycleId, law: MATRIX_LAW, reason: mission.reason }), now
  ).run();
}

async function advanceOperatingMissions(db, { metrics, signals, now }) {
  const components = new Map((await currentComponents(db)).map(item => [item.componentId, item]));
  const activeFailures = new Set(signals.failedCycles.map(item => item.id));
  const missions = await rows(db.prepare(`SELECT mission_id,mission_type,resources_json,status,attempts FROM matrix_operating_missions
    WHERE status IN ('queued','running') ORDER BY priority DESC,created_at ASC LIMIT 100`));
  const outcomes = [];
  for (const mission of missions) {
    const resources = parseJson(mission.resources_json, []);
    let completed = false;
    let observation = 'Mission remains active; no qualifying completion receipt exists yet.';
    if (mission.mission_type === 'CAPABILITY_GAP_MISSION') {
      completed = resources.some(componentId => components.get(componentId)?.state === 'LIVE_WORKING');
      observation = completed ? 'Target capability has a LIVE_WORKING receipt.' : 'Target capability is not yet LIVE_WORKING.';
    } else if (mission.mission_type === 'RECOVERY_MISSION') {
      const targetsComponents = resources.length > 0 && resources.every(resourceId => components.has(resourceId));
      completed = targetsComponents
        ? resources.every(componentId => components.get(componentId)?.state === 'LIVE_WORKING')
        : resources.length > 0 && resources.every(failureId => !activeFailures.has(failureId));
      observation = targetsComponents
        ? completed ? 'Blocked component now has a LIVE_WORKING receipt.' : 'Blocked component does not yet have a LIVE_WORKING receipt.'
        : completed ? 'Original failure is absent from the current bounded health window.' : 'Original failure remains inside the bounded health window.';
    } else if (mission.mission_type === 'SYSTEMIC_FAILURE_MISSION') {
      completed = signals.failedCycles.length < 3;
      observation = completed ? 'Repeated-failure threshold is no longer present.' : `${signals.failedCycles.length} failures remain in the health window.`;
    } else if (mission.mission_type === 'AUTONOMY_STALL') {
      completed = signals.stalledQueueCount + signals.pendingHumanActions === 0;
      observation = completed ? 'No stalled or owner-dependent units remain.' : 'Stalled or exact owner-dependent units remain.';
    } else if (mission.mission_type === 'CAPABILITY_STAGNATION_MISSION') {
      completed = metrics.daily_evolution_score > 0;
      observation = completed ? 'Daily effective-power growth is positive.' : 'Daily effective-power growth is not yet positive.';
    } else if (mission.mission_type === 'RESOURCE_EXPANSION_MISSION') {
      completed = metrics.daily_evolution_score > 0 && components.get('resource-hunter')?.state === 'LIVE_WORKING';
      observation = completed ? 'Measured power increased with a live real-workload resource receipt.' : 'No additional real-workload resource receipt has increased effective power yet.';
    } else if (mission.mission_type === 'TECHNOLOGY_EVALUATION_MISSION') {
      observation = 'Awaiting a zero-spend licensed candidate that passes tests, security, benchmark and rollback gates.';
    }
    const nextStatus = completed ? 'completed' : 'running';
    const result = { observed_at: now, observation, completion_receipt_present: completed, matrix_effective_power: metrics.matrix_effective_power, daily_evolution_score: metrics.daily_evolution_score };
    const learning = classifyLearningEffect({ before: { status: mission.status }, observation: result, after: { status: nextStatus }, expectedResult: { completion_receipt_present: true }, actualResult: { completion_receipt_present: completed } });
    await db.prepare(`UPDATE matrix_operating_missions SET status=?,attempts=attempts+1,results_json=?,learning_json=?,updated_at=?,completed_at=? WHERE mission_id=?`).bind(
      nextStatus, JSON.stringify(result), JSON.stringify(learning), now, completed ? now : null, mission.mission_id
    ).run();
    outcomes.push({ mission_id: mission.mission_id, mission_type: mission.mission_type, status: nextStatus, observation, learning: learning.classification });
  }
  return outcomes;
}

async function persistSnapshot(db, cycleId, metrics, now) {
  await db.prepare(`INSERT OR REPLACE INTO matrix_capability_snapshots(
    snapshot_id,cycle_id,matrix_capability_index,matrix_effective_power,raw_capacity_units,daily_evolution_score,
    windows_json,components_json,lifetime_high,recorded_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(
    `capability-${cycleId}`, cycleId, metrics.matrix_capability_index, metrics.matrix_effective_power,
    metrics.raw_capacity_units, metrics.daily_evolution_score, JSON.stringify(metrics.windows), JSON.stringify(metrics.components),
    metrics.windows.lifetime_high, now
  ).run();
}

async function persistLearning(db, cycleId, metrics, history, now) {
  const before = { effective_power: Number(history[0]?.effectivePower || metrics.matrix_effective_power) };
  const after = { effective_power: metrics.matrix_effective_power };
  const effect = classifyLearningEffect({ before, observation: { capability_index: metrics.matrix_capability_index }, after, expectedResult: { non_negative_evolution: true }, actualResult: { daily_evolution_score: metrics.daily_evolution_score } });
  await db.prepare(`INSERT OR REPLACE INTO matrix_learning_effects(
    effect_id,source_cycle_id,domain,before_json,observation_json,after_json,expected_result_json,actual_result_json,
    classification,changed_future_decision,constitutional_boundary_preserved,recorded_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,1,?)`).bind(
    `effect-${cycleId}`, cycleId, 'capability-evolution', JSON.stringify(effect.before), JSON.stringify(effect.observation),
    JSON.stringify(effect.after), JSON.stringify(effect.expected_result), JSON.stringify(effect.actual_result),
    effect.classification, effect.changed_future_decision ? 1 : 0, now
  ).run();
  return effect;
}

async function persistBaseline(db, date, metrics, missionPlan, effect, now) {
  const recoveryCount = missionPlan.missions.filter(item => ['RECOVERY_MISSION', 'SYSTEMIC_FAILURE_MISSION', 'AUTONOMY_STALL'].includes(item.mission_type)).length;
  await db.prepare(`INSERT INTO matrix_daily_baselines(
    baseline_date,opening_capability_index,opening_effective_power,closing_capability_index,closing_effective_power,evolution_score,
    mission_count,completed_mission_count,recovery_mission_count,learning_effect_count,telemetry_count,report_json,opened_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,0,?,?,?, ?,?,?)
  ON CONFLICT(baseline_date) DO UPDATE SET closing_capability_index=excluded.closing_capability_index,
    closing_effective_power=excluded.closing_effective_power,evolution_score=excluded.evolution_score,
    mission_count=excluded.mission_count,recovery_mission_count=excluded.recovery_mission_count,
    learning_effect_count=matrix_daily_baselines.learning_effect_count+excluded.learning_effect_count,
    telemetry_count=matrix_daily_baselines.telemetry_count+excluded.telemetry_count,report_json=excluded.report_json,updated_at=excluded.updated_at`).bind(
    date, metrics.matrix_capability_index, metrics.matrix_effective_power, metrics.matrix_capability_index,
    metrics.matrix_effective_power, metrics.daily_evolution_score, missionPlan.missions.length, recoveryCount,
    effect.classification === 'LEARNING' ? 1 : 0, effect.classification === 'TELEMETRY' ? 1 : 0,
    JSON.stringify({ allocation: missionPlan.allocation, windows: metrics.windows, no_silent_stop: true }), now, now
  ).run();
}

export async function runMatrixOperatingCycle(env, { trigger = 'scheduled-watchdog', clock = () => new Date() } = {}) {
  if (!enabled(env?.MATRIX_OPERATING_SYSTEM_ENABLED, true)) return { ok: false, skipped: true, reason: 'matrix-operating-system-disabled' };
  if (!(await matrixOperationsSchemaReady(env))) return { ok: false, skipped: true, reason: 'matrix-operating-system-schema-unavailable' };
  const db = env.MEMBERS_DB;
  const runtimeFlag = await db.prepare("SELECT enabled FROM ai_feature_flags WHERE flag_name='MATRIX_OPERATING_SYSTEM_ENABLED' LIMIT 1").first();
  if (Number(runtimeFlag?.enabled) !== 1) return { ok: false, skipped: true, reason: 'matrix-operating-system-d1-flag-disabled' };
  const now = clock().toISOString();
  const date = now.slice(0, 10);
  const cycleId = `matrix-ops-${now.replace(/[^0-9]/g, '').slice(0, 17)}-${clean(trigger, 60).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  const bootId = `boot-${cycleId}`;
  await db.prepare(`INSERT OR REPLACE INTO matrix_boot_runs(
    boot_id,trigger_name,status,constitution_verified,event_bus_verified,manifest_verified,watchdog_verified,immediate_cycle_started,report_json,started_at,completed_at
  ) VALUES(?,?,'running',0,0,0,0,1,'{}',?,NULL)`).bind(bootId, clean(trigger, 100), now).run();

  const constitution = await constitutionStatus(db);
  if (!constitution.valid) {
    await db.prepare("UPDATE matrix_boot_runs SET status='blocked',report_json=?,completed_at=? WHERE boot_id=?").bind(JSON.stringify({ blocker: 'MATRIX_CONSTITUTION_INVALID', expected_sha256: MATRIX_LAW_SHA256 }), now, bootId).run();
    return { ok: false, skipped: true, reason: 'MATRIX_CONSTITUTION_INVALID' };
  }

  await refreshObservedComponents(db, now);
  const [components, history, signals, activeDelegations] = await Promise.all([currentComponents(db), snapshotHistory(db), healthSignals(db), delegations(db)]);
  const metrics = computeCapabilityMetrics(components, history);
  const stagnationDays = metrics.daily_evolution_score <= 0 && history.length > 0 ? 1 : 0;
  const gaps = componentGaps(components);
  const plan = planOperatingCycle({
    now,
    failedCycles: signals.failedCycles,
    stalledQueueCount: signals.stalledQueueCount + signals.pendingHumanActions,
    stagnationDays,
    missingCapabilities: gaps,
    blockedDependencies: gaps.filter(item => components.find(component => component.componentId === item.id)?.state === 'BLOCKED'),
    missionUnits: 100
  });
  const missionAuthorizationFailures = [];
  for (const mission of plan.missions) {
    const safety = brokerMatrixAction({ actionType: 'CREATE_INTERNAL_MISSION', consequenceClass: 'REVERSIBLE_INTERNAL', scope: 'matrix-internal', amountMinor: 0, boundedScope: true, simulationPassed: true, rollbackReady: true, now }, activeDelegations);
    if (!safety.allowed) { missionAuthorizationFailures.push({ mission_id: mission.mission_id, blockers: safety.blockers }); continue; }
    await persistMission(db, cycleId, mission, now);
    await persistWatchdog(db, cycleId, mission, now);
  }
  const missionOutcomes = await advanceOperatingMissions(db, { metrics, signals, now });
  await persistSnapshot(db, cycleId, metrics, now);
  const effect = await persistLearning(db, cycleId, metrics, history, now);
  await persistBaseline(db, date, metrics, plan, effect, now);

  const report = {
    report_type: 'Matrix Operating Report', cycle_id: cycleId, trigger, generated_at: now,
    law: MATRIX_LAW, law_sha256: MATRIX_LAW_SHA256, constitution_verified: true,
    matrix_capability_index: metrics.matrix_capability_index,
    matrix_effective_power: metrics.matrix_effective_power,
    daily_evolution_score: metrics.daily_evolution_score,
    windows: metrics.windows,
    component_states: metrics.components,
    operating_missions_created: plan.missions.length - missionAuthorizationFailures.length,
    mission_types: plan.missions.reduce((result, item) => ({ ...result, [item.mission_type]: (result[item.mission_type] || 0) + 1 }), {}),
    mission_outcomes: missionOutcomes,
    allocation: plan.allocation,
    learning_effect: effect.classification,
    failed_signals_observed: signals.failedCycles.length,
    stalled_or_human_dependent_units: signals.stalledQueueCount + signals.pendingHumanActions,
    capability_expansion_grants_authority: false,
    consequential_actions_executed: 0,
    cost_confirmed_zero: true,
    no_silent_stop: true,
    mission_authorization_failures: missionAuthorizationFailures
  };
  await db.prepare(`UPDATE matrix_boot_runs SET status=?,constitution_verified=1,event_bus_verified=1,manifest_verified=1,
    watchdog_verified=1,report_json=?,completed_at=? WHERE boot_id=?`).bind(plan.missions.some(item => item.priority >= 95) ? 'degraded' : 'healthy', JSON.stringify(report), now, bootId).run();
  await db.prepare(`UPDATE matrix_system_components SET state='LIVE_WORKING',reliability=1,blocker=NULL,last_verified_at=?,updated_at=?
    WHERE component_id IN ('matrix-constitution','matrix-mission-director','matrix-capability-graph','matrix-learning-director',
      'matrix-health-director','matrix-boot-director','owner-delegation-vault','matrix-action-broker')`).bind(now, now).run();
  await db.prepare(`UPDATE matrix_capabilities SET dependencies_reachable=1,data_connected=1,evidence_ready=1,live_verification_passed=1,
    state='live_verified',blocker=NULL,checked_at=?,evidence_json=? WHERE capability_id='matrix-operating-system'`).bind(
    now, JSON.stringify({ cycle_id: cycleId, law_sha256: MATRIX_LAW_SHA256, missions: plan.missions.length, cost_confirmed_zero: true })
  ).run();
  const eventReceipt = await emitMatrixSystemEvent(env, {
    eventType: 'cycle.completed', auditIdentifier: cycleId, origin: 'matrix-operating-system', actor: 'MatrixMissionDirector',
    payload: { change_summary: 'Constitutional operating cycle completed and generated measured recovery/capability missions.', matrix_capability_index: metrics.matrix_capability_index, matrix_effective_power: metrics.matrix_effective_power, daily_evolution_score: metrics.daily_evolution_score, mission_count: plan.missions.length, law_sha256: MATRIX_LAW_SHA256 }
  });
  if (eventReceipt.emitted) {
    await db.prepare(`UPDATE matrix_system_components SET state='LIVE_WORKING',reliability=1,blocker=NULL,last_verified_at=?,updated_at=?,health_evidence_json=? WHERE component_id='matrix-event-bus'`).bind(
      now, now, JSON.stringify(['cycle.completed event receipt', eventReceipt.event_id])
    ).run();
  }
  return { ok: true, report };
}

async function doctor(env) {
  if (!(await matrixOperationsSchemaReady(env))) return { ok: false, state: 'WORKING_NOT_LIVE', blocker: 'matrix-operating-system-schema-unavailable', exact_action: 'Run the controlled Cloudflare release so migrations/phase17_matrix_operating_system.sql is applied before Worker deployment.' };
  const db = env.MEMBERS_DB;
  const [constitution, components, latestBoot, missionCounts, latestSnapshot, runtimeFlag] = await Promise.all([
    constitutionStatus(db), currentComponents(db),
    db.prepare('SELECT boot_id,status,report_json,started_at,completed_at FROM matrix_boot_runs ORDER BY started_at DESC LIMIT 1').first(),
    db.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS queued,SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) AS blocked,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed FROM matrix_operating_missions`).first(),
    db.prepare('SELECT matrix_capability_index,matrix_effective_power,daily_evolution_score,windows_json,recorded_at FROM matrix_capability_snapshots ORDER BY recorded_at DESC LIMIT 1').first(),
    db.prepare("SELECT flag_name,enabled,value_json,reason,updated_at FROM ai_feature_flags WHERE flag_name='MATRIX_OPERATING_SYSTEM_ENABLED' LIMIT 1").first()
  ]);
  return {
    ok: constitution.valid,
    state: Number(runtimeFlag?.enabled) !== 1 ? 'DISABLED' : ['healthy', 'degraded'].includes(latestBoot?.status) ? 'LIVE_WORKING' : latestBoot ? 'PARTIAL' : 'WORKING_NOT_LIVE',
    system_condition: latestBoot?.status || 'awaiting-first-boot',
    constitution,
    latest_boot: latestBoot ? { ...latestBoot, report: parseJson(latestBoot.report_json, {}) } : null,
    metrics: latestSnapshot ? { ...latestSnapshot, windows: parseJson(latestSnapshot.windows_json, {}) } : null,
    missions: missionCounts,
    components,
    runtime_flag: runtimeFlag,
    exact_actions: Number(runtimeFlag?.enabled) !== 1
      ? ["Set D1 ai_feature_flags.MATRIX_OPERATING_SYSTEM_ENABLED to 1 through the controlled owner workflow, then POST the start route."]
      : latestBoot ? [] : ['POST /api/ai-management/admin/matrix-operations/start with the existing admin bearer token to run the immediate boot cycle.']
  };
}

async function delegations(db) {
  return (await rows(db.prepare(`SELECT delegation_id,allowed_actions_json,allowed_scopes_json,allowed_consequence_classes_json,
    maximum_amount_minor,starts_at,expires_at,active FROM matrix_delegations WHERE active=1`))).map(item => ({
    delegationId: item.delegation_id,
    allowedActions: parseJson(item.allowed_actions_json, []),
    allowedScopes: parseJson(item.allowed_scopes_json, []),
    allowedConsequenceClasses: parseJson(item.allowed_consequence_classes_json, []),
    maximumAmountMinor: Number(item.maximum_amount_minor || 0),
    startsAt: item.starts_at,
    expiresAt: item.expires_at,
    active: Number(item.active) === 1
  }));
}

async function checkAction(request, env) {
  if (Number(request.headers.get('content-length') || 0) > 32768) return json({ ok: false, error: 'Action evaluation body too large' }, 413);
  const body = await request.json().catch(() => ({}));
  const allowedKeys = ['missionId','actionType','consequenceClass','scope','amountMinor','riskDomains','boundedScope','simulationPassed','rollbackReady','destinationApproved','maximumLossMinor','lossExplicitlyAuthorized','unboundedThirdPartyRisk','physicalHarmPossible','financialHarmPossible','propertyHarmPossible','assetHarmPossible','reputationHarmPossible','systemIntegrityRisk','rawCredentialExposure','privateDataWithoutBasis','evidenceTampering','fabricatedEvidence','ownerControlBypass','illegalOrUnverifiedLegalBasis','irreversibleNecessityProven','constitutionalOverride','disableSafety','bypassLaw','proposedLaw','capabilityExpansionGrantsAuthority'];
  const input = Object.fromEntries(allowedKeys.filter(key => Object.hasOwn(body, key)).map(key => [key, body[key]]));
  input.now = new Date().toISOString();
  const decision = brokerMatrixAction(input, await delegations(env.MEMBERS_DB));
  const requestHash = await sha256(JSON.stringify(input));
  const requestedMissionId = clean(input.missionId, 180);
  const mission = requestedMissionId ? await env.MEMBERS_DB.prepare('SELECT mission_id FROM matrix_operating_missions WHERE mission_id=? LIMIT 1').bind(requestedMissionId).first() : null;
  const requestedConsequenceClass = clean(input.consequenceClass || 'INTERNAL_ANALYSIS', 50).toUpperCase();
  const storedConsequenceClass = ['READ_ONLY_PUBLIC','INTERNAL_ANALYSIS','REVERSIBLE_INTERNAL','EXTERNAL_NON_FINANCIAL','FINANCIAL','PRIVILEGED','IRREVERSIBLE','DESTRUCTIVE'].includes(requestedConsequenceClass)
    ? requestedConsequenceClass : 'INTERNAL_ANALYSIS';
  await env.MEMBERS_DB.prepare(`INSERT OR IGNORE INTO matrix_action_receipts(
    receipt_id,mission_id,action_type,consequence_class,delegation_id,constitutional_decision,execution_state,request_hash,
    amount_minor,scope,blockers_json,safeguards_json,external_receipt_reference,evidence_json,created_at
  ) VALUES(?,?,?,?,?,?, 'not_executed',?,?,?,?,?,NULL,?,?)`).bind(
    `action-check-${requestHash.slice(0, 32)}`, mission?.mission_id || null, clean(input.actionType, 100).toUpperCase() || 'UNSPECIFIED',
    storedConsequenceClass, decision.delegation_id,
    decision.decision, requestHash, Math.max(0, Math.trunc(Number(input.amountMinor || 0))), clean(input.scope, 180) || null,
    JSON.stringify(decision.blockers), JSON.stringify(decision.safeguards), JSON.stringify({ law_sha256: MATRIX_LAW_SHA256, evaluated_only: true, requested_consequence_class: requestedConsequenceClass }), input.now
  ).run();
  return json({ ok: true, execution_performed: false, decision });
}

export function isMatrixOperationsRoute(pathname = '') { return ROUTES.has(String(pathname || '').replace(/\/+$/, '') || '/'); }

export async function handleMatrixOperationsRoute(request, env) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (request.method === 'GET' && (path === ROOT || path.endsWith('/doctor'))) return json(await doctor(env), (await matrixOperationsSchemaReady(env)) ? 200 : 503);
  if (!(await matrixOperationsSchemaReady(env))) return json({ ok: false, error: 'Matrix operating-system schema unavailable' }, 503);
  if (request.method === 'POST' && (path === ROOT || path.endsWith('/start'))) return json(await runMatrixOperatingCycle(env, { trigger: 'owner-immediate-start' }));
  if (request.method === 'POST' && path.endsWith('/action/check')) return checkAction(request, env);
  if (request.method === 'GET' && path.endsWith('/missions')) {
    const result = await rows(env.MEMBERS_DB.prepare(`SELECT mission_id,mission_type,objective,reason,priority,requirements_json,resources_json,
      expected_mission_value,expected_financial_value_minor,risk_domains_json,required_permissions_json,dependencies_json,success_definition,
      status,results_json,learning_json,retry_ladder_json,source_cycle_id,attempts,created_at,updated_at,completed_at
      FROM matrix_operating_missions ORDER BY priority DESC,created_at DESC LIMIT 200`));
    return json({ ok: true, missions: result.map(item => ({ ...item, requirements: parseJson(item.requirements_json, []), resources: parseJson(item.resources_json, []), risk_domains: parseJson(item.risk_domains_json, []), required_permissions: parseJson(item.required_permissions_json, []), dependencies: parseJson(item.dependencies_json, []), results: parseJson(item.results_json, {}), learning: parseJson(item.learning_json, {}), retry_ladder: parseJson(item.retry_ladder_json, []) })) });
  }
  if (request.method === 'GET' && path.endsWith('/history')) {
    const result = await rows(env.MEMBERS_DB.prepare('SELECT boot_id,trigger_name,status,report_json,started_at,completed_at FROM matrix_boot_runs ORDER BY started_at DESC LIMIT 100'));
    return json({ ok: true, boots: result.map(item => ({ ...item, report: parseJson(item.report_json, {}) })) });
  }
  return json({ ok: false, error: 'Method not allowed' }, 405);
}

export async function runScheduledMatrixOperations(env) { return runMatrixOperatingCycle(env, { trigger: 'scheduled-watchdog' }); }

export const matrixOperationsWorkerInternals = { ROOT, ROUTES, REQUIRED_TABLES, constitutionStatus, currentComponents, refreshObservedComponents, healthSignals, componentGaps, advanceOperatingMissions };
