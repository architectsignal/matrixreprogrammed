import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { detectLocalRuntime } from '../ai-management/local-runtime/hardware-detector.mjs';
import { SpecialistLocalExecutor } from '../ai-management/autonomy/specialist-local-executor.mjs';

const root = process.cwd();
const downloads = path.join(root, 'downloads');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function enabled(value) {
  return String(value || '').toLowerCase() === 'true';
}

function boundedJobs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(5, Math.floor(parsed)));
}

function digestResult(result) {
  const material = JSON.stringify({
    mission_id: result?.mission_id || null,
    specialist: result?.specialist || null,
    model_id: result?.model_id || null,
    text: result?.output?.text || null,
    status: result?.status || null
  });
  return crypto.createHash('sha256').update(material).digest('hex');
}

if (!enabled(process.env.MATRIX_SPECIALIST_LOCAL_INFERENCE_EXECUTION_ENABLED)) {
  const skipped = {
    ok: true,
    skipped: true,
    reason: 'MATRIX_SPECIALIST_LOCAL_INFERENCE_EXECUTION_ENABLED is not true',
    external_network_used: false,
    external_consequences_performed: 0,
    money_moved: 0,
    deployments_performed: 0,
    generated_at: new Date().toISOString()
  };
  writeJson(path.join(downloads, 'specialist-local-worker-result.json'), skipped);
  writeJson(path.join(downloads, 'specialist-local-result-receipts.json'), { schema_version: 1, generated_at: skipped.generated_at, receipts: [] });
  console.log(JSON.stringify(skipped, null, 2));
  process.exit(0);
}

const missionPlan = readJson(path.join(downloads, 'specialist-ai-plan.json'), { missions: [] });
const executionFile = readJson(path.join(downloads, 'specialist-execution-specs.json'), { specs: [] });
const localContextFile = readJson(path.join(downloads, 'specialist-local-context.json'), { by_mission: {}, by_specialist: {} });
const missions = Array.isArray(missionPlan.missions) ? missionPlan.missions : [];
const specs = Array.isArray(executionFile.specs) ? executionFile.specs : [];

if (!missions.length || !specs.length) {
  throw new Error('Specialist mission plan and execution specs are required. Run scripts/run-level5-autonomy-cycle.mjs first.');
}

const runtime = await detectLocalRuntime();
if (runtime.cost_confirmed_zero !== true || runtime.external_network_used !== false) {
  throw new Error('Local runtime did not prove zero cost and no external-network use');
}

const maximumJobs = boundedJobs(process.env.MATRIX_SPECIALIST_LOCAL_MAX_JOBS);
const executor = new SpecialistLocalExecutor();
const missionById = new Map(missions.map(item => [item.mission_id, item]));
const specByMissionId = new Map(specs.map(item => [item.mission_id, item]));
const candidates = specs.filter(item => item.status === 'planned' && item.execution_allowed === true).slice(0, maximumJobs);
const results = [];

for (const spec of candidates) {
  const mission = missionById.get(spec.mission_id);
  if (!mission) {
    results.push({ ok: false, mission_id: spec.mission_id, status: 'blocked', reason: 'mission-not-found' });
    continue;
  }
  const context = localContextFile?.by_mission?.[mission.mission_id]
    ?? localContextFile?.by_specialist?.[mission.specialist]
    ?? {};
  try {
    results.push(await executor.execute({
      mission,
      executionSpec: spec,
      resources: runtime.resources,
      context
    }));
  } catch (error) {
    results.push({
      ok: false,
      mission_id: mission.mission_id,
      specialist: mission.specialist,
      status: 'failed',
      reason: String(error?.message || error).slice(0, 1000),
      external_network_used: false,
      cost_confirmed_zero: true,
      external_consequence_performed: false,
      production_deployment_performed: false,
      money_moved: false
    });
  }
}

const generatedAt = new Date().toISOString();
const receipts = results.filter(result => result?.mission_id && result?.specialist).map(result => {
  const mission = missionById.get(result.mission_id) || {};
  const spec = specByMissionId.get(result.mission_id) || {};
  const contract = spec.local_execution_contract || {};
  return {
    schema_version: 1,
    mission_id: result.mission_id,
    specialist: result.specialist,
    status: ['completed','failed','blocked'].includes(result.status) ? result.status : 'failed',
    result_digest: digestResult(result),
    model_id: result.model_id || null,
    resource_id: result.model_resource_id || null,
    model_route_score: result.model_route_score || 0,
    usage: result.output?.usage || {},
    input_evidence_ids: contract.evidence_reference_ids || [],
    output_evidence_ids: contract.evidence_reference_ids || [],
    publication_target_id: mission?.evidence?.publication_target_id || null,
    publication_gate_passed: false,
    provenance_checked: false,
    contrary_evidence_considered: false,
    cost_confirmed_zero: true,
    inference_external_network_used: false,
    external_consequence_performed: false,
    production_deployment_performed: false,
    money_moved: false,
    raw_output_in_receipt: false,
    generated_at: generatedAt
  };
});

const output = {
  ok: results.every(item => item.ok === true || item.status === 'blocked'),
  skipped: false,
  generated_at: generatedAt,
  local_runtime: {
    hostname: runtime.hardware?.hostname || null,
    detected_models: runtime.resources.length,
    cost_confirmed_zero: runtime.cost_confirmed_zero,
    external_network_used: runtime.external_network_used
  },
  limits: {
    maximum_jobs_this_run: maximumJobs,
    automatic_external_consequences_allowed: false,
    production_deployment_allowed: false,
    money_movement_allowed: false
  },
  receipts: {
    generated: receipts.length,
    raw_output_in_receipts: false,
    automatic_upload_enabled: false
  },
  results
};
writeJson(path.join(downloads, 'specialist-local-worker-result.json'), output);
writeJson(path.join(downloads, 'specialist-local-result-receipts.json'), { schema_version: 1, generated_at: generatedAt, receipts });
console.log(JSON.stringify(output, null, 2));
