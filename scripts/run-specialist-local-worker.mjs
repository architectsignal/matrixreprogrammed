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

const output = {
  ok: results.every(item => item.ok === true || item.status === 'blocked'),
  skipped: false,
  generated_at: new Date().toISOString(),
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
  results
};
writeJson(path.join(downloads, 'specialist-local-worker-result.json'), output);
console.log(JSON.stringify(output, null, 2));
