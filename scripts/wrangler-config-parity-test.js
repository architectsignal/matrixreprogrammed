#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const toml = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
const jsoncSource = fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8');
const jsonc = JSON.parse(jsoncSource.replace(/^\s*\/\/.*$/gm, ''));

const quoted = value => [...value.matchAll(/"([^"]+)"/g)].map(match => match[1]);
const tomlString = key => (toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm')) || [])[1];
const tomlBoolean = key => (toml.match(new RegExp(`^${key}\\s*=\\s*(true|false)`, 'm')) || [])[1];
const tomlArray = key => {
  const match = toml.match(new RegExp(`^${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm'));
  return match ? quoted(match[1]) : [];
};

assert.strictEqual(jsonc.name, tomlString('name'), 'Worker name drift');
assert.strictEqual(jsonc.main, tomlString('main'), 'Worker entrypoint drift');
assert.strictEqual(jsonc.compatibility_date, tomlString('compatibility_date'), 'Compatibility date drift');
assert.strictEqual(String(jsonc.keep_vars), tomlBoolean('keep_vars'), 'keep_vars drift');
assert.deepStrictEqual(jsonc.triggers.crons, tomlArray('crons'), 'Cron schedule drift');
assert.strictEqual(jsonc.assets.directory, tomlString('directory'), 'Asset directory drift');
assert.strictEqual(jsonc.assets.binding, tomlString('binding'), 'Asset binding drift');
assert.deepStrictEqual(jsonc.assets.run_worker_first, tomlArray('run_worker_first'), 'Worker-first route drift');

const requiredLockedVars = [
  'AI_RESOURCE_BROKER_ENABLED',
  'AI_RESOURCE_EXTERNAL_ENABLED',
  'AI_RESOURCE_LOCAL_ONLY',
  'AI_RESOURCE_ZERO_SPEND_LOCK',
  'AI_RESOURCE_BACKGROUND_ENABLED',
  'AI_RESOURCE_SCOUT_ENABLED',
  'AI_RESOURCE_AUTO_APPROVAL_ENABLED',
  'AI_LOCAL_MODEL_ROUTING_ENABLED',
  'AI_SITE_DIRECTOR_ENABLED',
  'AI_OPPORTUNITY_HUNTER_ENABLED',
  'MATRIX_PUBLIC_INVESTIGATION_ENABLED',
  'MATRIX_PUBLIC_INVESTIGATION_LOCAL_ENRICHMENT_ENABLED',
  'MATRIX_PUBLIC_INVESTIGATION_MAX_PENDING_LOCAL_JOBS',
  'MATRIX_PUBLIC_INVESTIGATION_RATE_LIMIT_PER_MINUTE',
  'MATRIX_VALUE_HUNTER_ENABLED',
  'MATRIX_VALUE_AUTO_COLLECTION_ENABLED',
  'MATRIX_VALUE_CODE_IMPROVEMENT_ENABLED',
  'MATRIX_PERMISSIONLESS_VALUE_ENABLED',
  'MATRIX_PERMISSIONLESS_AUTO_EXECUTION_ENABLED',
  'MATRIX_DISTRIBUTED_DISCOVERY_ENABLED',
  'MATRIX_PERMISSIONLESS_MORPHO_ENABLED',
  'MATRIX_PERMISSIONLESS_EULER_ENABLED',
  'MATRIX_PERMISSIONLESS_AAVE_ENABLED',
  'MATRIX_OPERATING_SYSTEM_ENABLED',
  'MATRIX_TECHNOLOGY_EVOLUTION_ENABLED'
];
for (const key of requiredLockedVars) {
  assert.strictEqual(jsonc.vars[key], tomlString(key), `${key} drift`);
}

const recoveryRoutes = jsonc.routes.map(route => `${route.pattern}|${route.zone_name}`);
const canonicalRoutes = [...toml.matchAll(/\{\s*pattern\s*=\s*"([^"]+)",\s*zone_name\s*=\s*"([^"]+)"\s*\}/g)].map(match => `${match[1]}|${match[2]}`);
if (canonicalRoutes.length) {
  assert.deepStrictEqual(recoveryRoutes, canonicalRoutes, 'Production route drift');
} else {
  assert.strictEqual(tomlBoolean('workers_dev'), 'true', 'Route-less canonical deploy must keep workers_dev available');
  assert.match(toml, /custom-domain routes are already live and are managed in Cloudflare/i, 'Route-less canonical deploy must document dashboard-managed domains');
  assert.deepStrictEqual(recoveryRoutes, [
    'matrixreprogrammed.com/*|matrixreprogrammed.com',
    'www.matrixreprogrammed.com/*|matrixreprogrammed.com'
  ], 'Recovery mirror must retain the two verified custom-domain routes');
}

console.log('Wrangler config parity PASS: runtime settings agree and the recovery mirror preserves dashboard-managed production routes without asking routine deploys to mutate them.');
