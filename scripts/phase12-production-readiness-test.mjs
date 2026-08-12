import assert from 'node:assert/strict';
import fs from 'node:fs';

const deploy = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
const safety = fs.readFileSync('.github/workflows/ai-autonomy-safety.yml', 'utf8');
const migration = fs.readFileSync('migrations/phase12_opportunity_hunter.sql', 'utf8');
const worker = fs.readFileSync('src/worker-opportunity-hunter.js', 'utf8');
const wrapper = fs.readFileSync('src/worker-production-autonomy.js', 'utf8');
const adapter = fs.readFileSync('ai-management/provider-adapters/opportunities/zero-spend-public-http.mjs', 'utf8');

assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_opportunities/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_opportunity_hunter_runs/);
assert.match(migration, /zero_spend_lock INTEGER NOT NULL DEFAULT 1 CHECK \(zero_spend_lock = 1\)/);
assert.match(migration, /AI_OPPORTUNITY_HUNTER_ENABLED/);

assert.match(worker, /AI_OPPORTUNITY_HUNTER_ENABLED/);
assert.match(worker, /AI_RESOURCE_ZERO_SPEND_LOCK/);
assert.match(worker, /activation_blocked_until_adapter_ready: !adapterReady/);
assert.match(worker, /zero-spend-opportunity-public-http/);
assert.match(wrapper, /runScheduledOpportunityHunter/);

assert.match(adapter, /monetary_cost_per_unit_eur/);
assert.match(adapter, /payment_method_present/);
assert.match(adapter, /quota_verified/);
assert.match(adapter, /approved_data_classes/);
assert.match(adapter, /public-data\.fetch/);

const required = [
  'migrations/phase12_opportunity_hunter.sql',
  "'ai_opportunities','ai_opportunity_hunter_runs'",
  'AI_OPPORTUNITY_HUNTER_ENABLED'
];
const missing = required.filter(item => !deploy.includes(item));
const adapterTestPresent = deploy.includes('node scripts/opportunity-hunter-adapter-test.mjs') ||
  deploy.includes('node scripts/opportunity-provider-adapter-test.mjs');
if (!adapterTestPresent) missing.push('Opportunity Hunter adapter execution test');
if (missing.length) {
  throw new Error(`Controlled production workflow is not yet Phase 12 complete: ${missing.join(', ')}`);
}

assert.match(safety, /migrations\/phase12_opportunity_hunter\.sql/);
assert.match(safety, /phase12-production-readiness-test\.mjs/);
console.log('Phase 12 production readiness passed: guarded migration, schema proof, zero-spend flag activation and adapter execution are all present.');
