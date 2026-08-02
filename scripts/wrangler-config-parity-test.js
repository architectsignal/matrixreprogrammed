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
  'AI_OPPORTUNITY_HUNTER_ENABLED'
];
for (const key of requiredLockedVars) {
  assert.strictEqual(jsonc.vars[key], tomlString(key), `${key} drift`);
}

assert.deepStrictEqual(
  jsonc.routes.map(route => `${route.pattern}|${route.zone_name}`),
  [...toml.matchAll(/\{\s*pattern\s*=\s*"([^"]+)",\s*zone_name\s*=\s*"([^"]+)"\s*\}/g)].map(match => `${match[1]}|${match[2]}`),
  'Production route drift'
);

console.log('Wrangler config parity PASS: canonical TOML and JSONC recovery mirror agree on runtime-affecting settings.');
