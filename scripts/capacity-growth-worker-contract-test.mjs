import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync('src/worker-capacity-growth.js', 'utf8');
const wrapper = fs.readFileSync('src/worker-production-autonomy.js', 'utf8');

assert.match(worker, /runCapacityGrowthCycle/);
assert.match(worker, /new D1ResourceRegistry\(env\.MEMBERS_DB\)/);
assert.match(worker, /ai_local_runtime_nodes/);
assert.match(worker, /ai_local_models/);
assert.match(worker, /ai_opportunities/);
assert.match(worker, /ai_local_jobs/);
assert.match(worker, /zero_spend_lock: true/);
assert.match(worker, /paid_fallback_possible: false/);
assert.match(worker, /resources_admitted/);
assert.match(worker, /owner_approval_queue/);
assert.match(worker, /assignments/);
assert.match(worker, /deferred/);
assert.match(wrapper, /handleCapacityGrowthRoute/);
assert.match(wrapper, /isCapacityGrowthRoute/);
assert.ok(wrapper.indexOf('isCapacityGrowthRoute(path)') < wrapper.indexOf('isAiManagementRoute(path)'), 'capacity route must be handled before generic AI routing');
assert.match(wrapper, /if \(!authorized\(request, runtimeEnv\)\) return forbidden\(\)/);

console.log('Capacity growth Worker contract tests passed.');
