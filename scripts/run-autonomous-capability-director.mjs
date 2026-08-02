import fs from 'node:fs';
import path from 'node:path';
import { AutonomousCapabilityDirector } from '../ai-management/autonomy/capability-director.mjs';
import { executeRemoteComputeQueue } from '../ai-management/node/remote-compute-broker.mjs';

const root = process.cwd();
const downloads = path.join(root, 'downloads');
const config = path.join(root, 'ai-management', 'config');
fs.mkdirSync(downloads, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function enabled(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

async function runOnce() {
  const siteReport = readJson(path.join(downloads, 'site-improvement-director.json'), {});
  const localRuntime = readJson(path.join(downloads, 'local-ai-runtime.json'), {});
  const computeInventory = readJson(path.join(config, 'compute-resources.autonomous.json'), { resources: [] });
  const director = new AutonomousCapabilityDirector({
    maximumRemoteJobs: Math.max(0, Math.min(Number(process.env.AI_REMOTE_COMPUTE_JOBS_PER_CYCLE || 1), 5))
  });
  const plan = director.plan({
    siteReport,
    localRuntime,
    computeResources: computeInventory.resources || [],
    siteOrigin: process.env.MATRIX_PUBLIC_ORIGIN || 'https://matrixreprogrammed.com'
  });
  writeJson(path.join(downloads, 'autonomous-capability-plan.json'), plan);

  let execution = {
    ok: true,
    skipped: true,
    reason: 'AI_REMOTE_COMPUTE_EXECUTION_ENABLED is false',
    cost_confirmed_zero: true
  };
  if (enabled(process.env.AI_REMOTE_COMPUTE_EXECUTION_ENABLED, false)) {
    execution = await executeRemoteComputeQueue({
      jobs: plan.queued_jobs,
      resources: computeInventory.resources || [],
      maximumJobs: Math.max(0, Math.min(Number(process.env.AI_REMOTE_COMPUTE_JOBS_PER_CYCLE || 1), 5)),
      environment: process.env,
      kaggle: {
        environment: process.env,
        workspaceRoot: process.env.AI_KAGGLE_WORKSPACE_ROOT || path.join(root, 'ai-management', 'remote-jobs', 'kaggle'),
        outputRoot: process.env.AI_REMOTE_COMPUTE_OUTPUT_ROOT || path.join(downloads, 'remote-compute', 'kaggle')
      },
      huggingFace: { environment: process.env },
      ownerHttp: { environment: process.env }
    });
  }
  const report = {
    ok: execution.ok !== false,
    generated_at: new Date().toISOString(),
    plan,
    execution,
    local_controller_only: true,
    cost_confirmed_zero: true
  };
  writeJson(path.join(downloads, 'autonomous-capability-execution.json'), report);
  console.log(JSON.stringify({
    ok: report.ok,
    local_pressure: plan.local_pressure,
    remote_preferred: plan.remote_preferred,
    eligible_remote_resources: plan.eligible_remote_resources.length,
    jobs_queued: plan.queued_jobs.length,
    jobs_attempted: execution.attempted || 0,
    jobs_completed: execution.completed || 0,
    deferred_tasks: plan.deferred_tasks.length,
    execution_enabled: enabled(process.env.AI_REMOTE_COMPUTE_EXECUTION_ENABLED, false),
    cost_confirmed_zero: true
  }, null, 2));
  return report;
}

const daemon = process.argv.includes('--daemon');
const intervalMinutes = Math.max(60, Number(process.env.AI_CAPABILITY_DIRECTOR_INTERVAL_MINUTES || 60));
await runOnce();
if (daemon) {
  setInterval(() => runOnce().catch(error => console.error(`Capability Director cycle failed safely: ${error?.stack || error}`)), intervalMinutes * 60 * 1000);
  console.log(`Autonomous Capability Director active; interval ${intervalMinutes} minute(s).`);
}
