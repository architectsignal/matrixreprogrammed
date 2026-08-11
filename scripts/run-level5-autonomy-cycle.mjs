import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { AutonomousLearningDirector } from '../ai-management/autonomy/autonomous-learning-director.mjs';
import { SelfFinancingDirector } from '../ai-management/finance/self-financing-director.mjs';

const root = process.cwd();
const downloads = path.join(root, 'downloads');
const configDir = path.join(root, 'ai-management', 'config');
fs.mkdirSync(downloads, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function runExistingManager() {
  const result = spawnSync(process.execPath, ['scripts/run-autonomous-ai-manager.mjs'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      AI_RESOURCE_ZERO_SPEND_LOCK: 'true',
      AI_REMOTE_COMPUTE_EXECUTION_ENABLED: 'false',
      AI_REMOTE_COMPUTE_JOBS_PER_CYCLE: '0',
      SITE_DIRECTOR_APPLY_SAFE: 'false'
    }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Existing autonomous manager failed with exit code ${result.status}`);
}

const runManager = process.argv.includes('--run-manager');
if (runManager) runExistingManager();

const policy = readJson(path.join(configDir, 'level5-autonomy-policy.json'), {});
const cycleSummary = readJson(path.join(downloads, 'autonomous-ai-manager-summary.json'), {
  ok: false,
  cost_confirmed_zero: false,
  missing: true
});
const priorLearning = readJson(path.join(downloads, 'autonomous-learning-state.json'), {});
const financeObservation = readJson(path.join(downloads, 'finance-observation.json'), {
  revenue_sources: [],
  verified_operating_cost_eur: 0,
  verified_cash_reserve_eur: 0
});

const learningDirector = new AutonomousLearningDirector({
  alpha: policy?.learning?.ema_alpha,
  maximumLessons: policy?.learning?.maximum_lessons
});
const learning = learningDirector.learn({ priorState: priorLearning, cycleSummary });
writeJson(path.join(downloads, 'autonomous-learning-state.json'), learning);

const financeDirector = new SelfFinancingDirector();
const finance = financeDirector.plan({ snapshot: financeObservation, policy: policy.finance || {} });
writeJson(path.join(downloads, 'self-financing-plan.json'), finance);

const result = {
  ok: cycleSummary?.ok === true && learning.latest_signals.zero_spend_confirmed === true,
  generated_at: new Date().toISOString(),
  existing_manager_executed: runManager,
  cycle_summary_available: cycleSummary?.missing !== true,
  learning: {
    cycle_count: learning.cycle_count,
    recommendations: learning.recommendations.length,
    automatic_policy_mutation_allowed: learning.controls.automatic_policy_mutation_allowed
  },
  finance: {
    state: finance.state,
    verified_net_revenue_eur: finance.observed.verified_net_revenue_eur,
    executable_budget_eur: finance.execution.executable_budget_eur,
    owner_approval_required_for_any_spend: finance.execution.owner_approval_required_for_any_spend
  },
  controls: {
    zero_spend_lock: true,
    remote_compute_execution_enabled_by_this_runner: false,
    payment_mutation_allowed: false,
    deployment_performed: false
  },
  next_persistence_target: 'matrix_learning_ledger D1 integration after this foundation passes review and CI'
};
writeJson(path.join(downloads, 'level5-autonomy-cycle.json'), result);
console.log(JSON.stringify(result, null, 2));

if (cycleSummary?.missing === true) {
  console.error('Level 5 autonomy cycle ran without an autonomous-ai-manager summary; use --run-manager for a complete cycle.');
  process.exitCode = 2;
} else if (!result.ok) {
  process.exitCode = 1;
}
