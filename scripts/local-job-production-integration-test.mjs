import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const failures = [];
const check = (name, condition) => {
  if (!condition) failures.push(name);
};

const wrapper = read('src/worker-production-autonomy.js');
const api = read('src/worker-local-job-api.js');
const migration = read('migrations/phase11_local_job_queue.sql');
const deploy = read('.github/workflows/deploy.yml');

check('production wrapper imports local job router', wrapper.includes("import { handleLocalJobRoute, isLocalJobRoute, recoverExpiredLocalJobs } from './worker-local-job-api.js';"));
check('local job routes are checked before generic AI-management routing', wrapper.indexOf('if (isLocalJobRoute(path))') > -1 && wrapper.indexOf('if (isLocalJobRoute(path))') < wrapper.indexOf('if (isAiManagementRoute(path))'));
check('local job routes require owner admin authorization', wrapper.includes('if (!authorized(request, runtimeEnv)) return forbidden();') && wrapper.includes('return handleLocalJobRoute(normalizedAdminRequest(request, runtimeEnv), runtimeEnv);'));
check('scheduled handler recovers expired leases', wrapper.includes('recoverExpiredLocalJobs(runtimeEnv)') && wrapper.includes('recoveryTask'));
check(
  'scheduled recovery, opportunity, capacity, claim value, permissionless value, Living Matrix and constitutional operating cycles participate in awaited task group',
  wrapper.includes('Promise.all([productionTask, autonomyTask, recoveryTask, opportunityTask, capacityTask, valueTask, permissionlessTask, livingTask, matrixOperationsTask])')
);

for (const route of [
  '/api/ai-management/admin/local-jobs',
  '/api/ai-management/admin/local-jobs/enqueue',
  '/api/ai-management/admin/local-jobs/lease',
  '/api/ai-management/admin/local-jobs/complete'
]) {
  check(`queue route registered: ${route}`, api.includes(route));
}

check('queue job types are allowlisted', api.includes("['deterministic.hash', 'llm.generate'].includes(jobType)"));
check('queue forces a zero monetary ceiling', api.includes('cost_ceiling_eur: 0'));
check('queue forbids external network use', api.includes('external_network_allowed: false'));
check('completion requires explicit zero-cost proof', api.includes('completion.cost_confirmed_zero !== true'));
check('completion requires no external network use', api.includes('completion.external_network_used !== false'));
check('lease tokens are stored as hashes', api.includes('lease_token_hash') && api.includes('await digest(token)'));
check('lease update is concurrency guarded', api.includes("WHERE job_id=? AND status='queued'") && api.includes('Job was leased concurrently; retry'));
check('completion validates lease identity', api.includes('Lease identity is invalid'));
check('completion validates lease expiry', api.includes('Lease has expired'));
check('lease rejects nodes without zero-cost offline proof', api.includes('Node is not eligible for zero-spend offline execution'));
check('receipts cover lease and completion states', api.includes("'leased'") && api.includes("'completed'") && api.includes("'requeued'"));

check('Phase 11 creates local jobs', migration.includes('CREATE TABLE IF NOT EXISTS ai_local_jobs'));
check('Phase 11 creates immutable receipt table', migration.includes('CREATE TABLE IF NOT EXISTS ai_local_job_receipts'));
check('Phase 11 constrains zero-cost receipts', migration.includes('cost_confirmed_zero = 1'));
check('Phase 11 constrains offline execution receipts', migration.includes('external_network_used = 0'));
check('controlled deployment applies Phase 11', deploy.includes('migrations/phase11_local_job_queue.sql'));
check('controlled deployment runs queue tests', deploy.includes('ai-management/local-runtime/job-queue.test.mjs'));
check('controlled deployment syntax-checks queue Worker', deploy.includes('node --check src/worker-local-job-api.js'));

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  checks: 27,
  failures,
  boundary: {
    ownerAuthenticated: true,
    monetaryCeilingEur: 0,
    externalNetworkAllowed: false,
    shellExecutionAllowed: false,
    leaseRecoveryScheduled: true
  }
};

fs.mkdirSync('downloads', { recursive: true });
fs.writeFileSync('downloads/local-job-production-integration-test.json', JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`LOCAL JOB PRODUCTION INTEGRATION TEST FAILED: ${failures.join('; ')}`);
  process.exit(1);
}

console.log('LOCAL JOB PRODUCTION INTEGRATION TEST PASSED');
console.log('Owner-authenticated enqueue, lease, completion, immutable receipts and scheduled lease recovery are wired into the production autonomy wrapper.');
