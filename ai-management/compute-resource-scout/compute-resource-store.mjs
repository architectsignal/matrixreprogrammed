import { D1ResourceRegistry } from '../resource-registry/resource-registry.mjs';

const REQUIRED_TABLES = [
  'ai_compute_provider_candidates',
  'ai_compute_onboarding_tasks',
  'ai_compute_resources',
  'ai_compute_leases'
];

async function tableExists(database, name) {
  try {
    const row = await database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(name).first();
    return row?.name === name;
  } catch {
    return false;
  }
}

export async function computeSchemaReady(database) {
  if (!database?.prepare) return false;
  const checks = await Promise.all(REQUIRED_TABLES.map(name => tableExists(database, name)));
  return checks.every(Boolean);
}

function zeroSpendResource(resource) {
  return Boolean(
    resource?.resource_id &&
    resource.billing_enabled === false &&
    resource.payment_method_present === false &&
    resource.billing_risk === 'none' &&
    Number(resource.monetary_cost_per_unit_eur || 0) === 0 &&
    resource.quota_verified === true &&
    resource.approved_for_automation === true &&
    resource.metadata?.remote_compute === true &&
    resource.metadata?.public_workloads_only === true &&
    resource.metadata?.prompt_transfer_allowed === false
  );
}

export async function recordComputeScoutReport(database, report = {}) {
  if (!await computeSchemaReady(database)) throw new Error('Compute Resource Scout migration is not applied');
  const now = new Date().toISOString();
  const registry = new D1ResourceRegistry(database);
  let automaticApproved = 0;
  let manualOnboarding = 0;
  let quarantined = 0;
  let prohibited = 0;
  let revoked = 0;

  for (const evaluation of Array.isArray(report.evaluations) ? report.evaluations.slice(0, 300) : []) {
    const candidate = evaluation?.candidate || {};
    const classification = String(evaluation.classification || 'quarantined');
    const status = classification === 'automatic' && evaluation.approved === true
      ? 'approved'
      : classification === 'manual_onboarding'
        ? 'manual-onboarding'
        : classification === 'prohibited'
          ? 'prohibited'
          : classification === 'expired'
            ? 'expired'
            : 'quarantined';
    await database.prepare(`INSERT INTO ai_compute_provider_candidates(
      provider_id,provider_name,service_name,access_method,classification,official_documentation_url,terms_url,privacy_url,status_url,
      candidate_json,evaluation_json,confidence,status,owner_action_required,discovered_at,evaluated_at,terms_revalidation_due,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider_id) DO UPDATE SET
      provider_name=excluded.provider_name,service_name=excluded.service_name,access_method=excluded.access_method,classification=excluded.classification,
      official_documentation_url=excluded.official_documentation_url,terms_url=excluded.terms_url,privacy_url=excluded.privacy_url,status_url=excluded.status_url,
      candidate_json=excluded.candidate_json,evaluation_json=excluded.evaluation_json,confidence=excluded.confidence,status=excluded.status,
      owner_action_required=excluded.owner_action_required,evaluated_at=excluded.evaluated_at,terms_revalidation_due=excluded.terms_revalidation_due,updated_at=excluded.updated_at`)
      .bind(
        candidate.provider_id,
        candidate.provider_name || null,
        candidate.service_name || null,
        candidate.access_method || 'manual_onboarding',
        classification,
        candidate.official_documentation_url || null,
        candidate.terms_url || null,
        candidate.privacy_url || null,
        candidate.status_url || null,
        JSON.stringify(candidate),
        JSON.stringify(evaluation),
        Number(evaluation.confidence || 0),
        status,
        classification === 'manual_onboarding' ? 1 : 0,
        candidate.discovered_at || report.generated_at || now,
        evaluation.evaluated_at || now,
        candidate.terms_revalidation_due || null,
        now
      ).run();
    if (status === 'approved') automaticApproved += 1;
    else if (status === 'manual-onboarding') manualOnboarding += 1;
    else if (status === 'prohibited') prohibited += 1;
    else quarantined += 1;
  }

  for (const task of Array.isArray(report.manual_onboarding) ? report.manual_onboarding.slice(0, 100) : []) {
    await database.prepare(`INSERT INTO ai_compute_onboarding_tasks(
      task_id,provider_id,status,owner_action_required,reasons_json,steps_json,created_at,updated_at,completed_at
    ) VALUES(?,?,?,?,?,?,?,?,NULL) ON CONFLICT(task_id) DO UPDATE SET
      status=excluded.status,owner_action_required=excluded.owner_action_required,reasons_json=excluded.reasons_json,steps_json=excluded.steps_json,updated_at=excluded.updated_at`)
      .bind(task.task_id, task.provider_id, task.status || 'pending-owner-action', task.owner_action_required === false ? 0 : 1,
        JSON.stringify(task.reasons || []), JSON.stringify(task.steps || []), task.created_at || now, now).run();
  }

  for (const resource of Array.isArray(report.approved_resources) ? report.approved_resources.slice(0, 50) : []) {
    if (!zeroSpendResource(resource)) {
      quarantined += 1;
      continue;
    }
    await registry.upsert(resource);
    const metadata = resource.metadata || {};
    await database.prepare(`INSERT INTO ai_compute_resources(
      compute_resource_id,provider_id,broker_resource_id,access_method,endpoint_url,credential_reference,accelerator_json,gpu_memory_mb,
      quota_total,quota_remaining,quota_unit,session_max_minutes,expires_at,terms_revalidation_due,availability_status,
      billing_hard_stop_confirmed,automation_permission_verified,owner_onboarding_completed,last_verified,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'available',1,1,1,?,?) ON CONFLICT(compute_resource_id) DO UPDATE SET
      broker_resource_id=excluded.broker_resource_id,access_method=excluded.access_method,endpoint_url=excluded.endpoint_url,
      credential_reference=excluded.credential_reference,accelerator_json=excluded.accelerator_json,gpu_memory_mb=excluded.gpu_memory_mb,
      quota_total=excluded.quota_total,quota_remaining=excluded.quota_remaining,quota_unit=excluded.quota_unit,
      session_max_minutes=excluded.session_max_minutes,expires_at=excluded.expires_at,terms_revalidation_due=excluded.terms_revalidation_due,
      availability_status='available',billing_hard_stop_confirmed=1,automation_permission_verified=1,owner_onboarding_completed=1,last_verified=excluded.last_verified,updated_at=excluded.updated_at`)
      .bind(
        resource.resource_id,
        String(resource.resource_id).replace(/^remote-compute-/, ''),
        resource.resource_id,
        metadata.access_method || 'automatic_api',
        metadata.endpoint_url || null,
        resource.credential_reference || null,
        JSON.stringify(metadata.accelerator_types || []),
        Number(metadata.minimum_gpu_memory_mb || 0),
        Number(resource.free_quota_amount || 0),
        Number(resource.quota_remaining || 0),
        resource.free_quota_unit || null,
        Number(metadata.session_max_minutes || 0),
        metadata.expires_at || null,
        resource.terms_revalidation_due || null,
        resource.last_health_check || now,
        now
      ).run();
  }

  for (const revocation of Array.isArray(report.revocations) ? report.revocations.slice(0, 100) : []) {
    const resourceId = String(revocation.resource_id || '');
    if (!resourceId) continue;
    await database.prepare("UPDATE ai_compute_resources SET availability_status='quarantined',updated_at=? WHERE broker_resource_id=?")
      .bind(now, resourceId).run();
    await database.prepare("UPDATE ai_resources SET enabled=0,health_status='cooldown',notes=SUBSTR(COALESCE(notes,'') || ?,1,2000),updated_at=? WHERE resource_id=?")
      .bind(` | Compute Scout revocation: ${(revocation.reasons || []).join(', ')}`, now, resourceId).run();
    revoked += 1;
  }

  return {
    ok: true,
    discovered: Number(report.discovered || 0),
    automaticApproved,
    manualOnboarding,
    quarantined,
    prohibited,
    revoked,
    costStatus: 'EUR 0',
    receivedAt: now
  };
}

export async function listComputeRegistry(database) {
  if (!await computeSchemaReady(database)) throw new Error('Compute Resource Scout migration is not applied');
  const [providers, onboarding, resources, leases] = await Promise.all([
    database.prepare(`SELECT provider_id,provider_name,service_name,access_method,classification,confidence,status,owner_action_required,
      official_documentation_url,terms_url,privacy_url,terms_revalidation_due,evaluated_at,updated_at
      FROM ai_compute_provider_candidates ORDER BY updated_at DESC LIMIT 200`).all(),
    database.prepare(`SELECT task_id,provider_id,status,owner_action_required,reasons_json,steps_json,created_at,updated_at,completed_at
      FROM ai_compute_onboarding_tasks ORDER BY updated_at DESC LIMIT 100`).all(),
    database.prepare(`SELECT compute_resource_id,provider_id,broker_resource_id,access_method,endpoint_url,credential_reference,accelerator_json,gpu_memory_mb,
      quota_total,quota_remaining,quota_unit,session_max_minutes,expires_at,terms_revalidation_due,availability_status,last_verified,updated_at
      FROM ai_compute_resources ORDER BY availability_status,updated_at DESC LIMIT 100`).all(),
    database.prepare(`SELECT lease_id,compute_resource_id,task_profile,data_class,estimated_minutes,reserved_units,status,created_at,starts_at,expires_at,released_at
      FROM ai_compute_leases ORDER BY created_at DESC LIMIT 100`).all()
  ]);
  const parseRows = (rows, fields) => (rows?.results || []).map(row => {
    const next = { ...row };
    for (const field of fields) {
      try { next[field.replace(/_json$/, '')] = JSON.parse(next[field] || '[]'); } catch { next[field.replace(/_json$/, '')] = []; }
      delete next[field];
    }
    return next;
  });
  return {
    ok: true,
    providers: providers?.results || [],
    onboarding: parseRows(onboarding, ['reasons_json', 'steps_json']),
    resources: parseRows(resources, ['accelerator_json']),
    leases: leases?.results || [],
    boundary: 'Only public-data workloads may use approved remote compute. Provider credentials and prompts are never returned by this endpoint.'
  };
}

export async function maintainComputeRegistry(database, now = new Date()) {
  if (!await computeSchemaReady(database)) return { ok: false, skipped: true };
  const timestamp = now.toISOString();
  await database.prepare("UPDATE ai_compute_resources SET availability_status='expired',updated_at=? WHERE availability_status='available' AND expires_at IS NOT NULL AND expires_at<=?")
    .bind(timestamp, timestamp).run();
  await database.prepare("UPDATE ai_compute_resources SET availability_status='quarantined',updated_at=? WHERE availability_status='available' AND terms_revalidation_due IS NOT NULL AND terms_revalidation_due<=?")
    .bind(timestamp, timestamp).run();
  await database.prepare("UPDATE ai_compute_resources SET availability_status='exhausted',updated_at=? WHERE availability_status='available' AND quota_remaining<=0")
    .bind(timestamp).run();
  await database.prepare(`UPDATE ai_resources SET enabled=0,health_status='cooldown',updated_at=? WHERE resource_id IN (
    SELECT broker_resource_id FROM ai_compute_resources WHERE availability_status IN ('expired','quarantined','exhausted','offline')
  )`).bind(timestamp).run();
  await database.prepare("UPDATE ai_compute_leases SET status='expired' WHERE status IN ('reserved','active') AND expires_at<=?").bind(timestamp).run();
  await database.prepare("DELETE FROM ai_compute_leases WHERE status IN ('completed','released','expired','quarantined') AND created_at<datetime('now','-30 days')").run();
  return { ok: true, maintainedAt: timestamp };
}

export const computeStoreInternals = { REQUIRED_TABLES, tableExists, zeroSpendResource };
