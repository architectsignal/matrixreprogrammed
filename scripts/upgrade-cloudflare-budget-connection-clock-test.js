'use strict';

const assert = require('assert');
const { upgradeSource } = require('./upgrade-cloudflare-budget-connection-clock.js');

const legacy = [
  "  const observedOn = String(state.observedOn || '').trim();",
  "  const observedAt = Date.parse(`${observedOn}T00:00:00.000Z`);",
  "  const ageHours = Number.isFinite(observedAt) ? (Date.now() - observedAt) / 3600000 : Infinity;"
].join('\n');

const first = upgradeSource(legacy);
assert.equal(first.changed, true);
assert.match(first.source, /state\.observedAt \|\|/);
assert.match(first.source, /observedOn/);

const second = upgradeSource(first.source);
assert.equal(second.changed, false);
assert.equal(second.source, first.source);

assert.throws(
  () => upgradeSource('const somethingElse = true;'),
  /Expected exactly one legacy connection-proof clock anchor/
);

console.log('Cloudflare budget connection-proof clock test passed: live observedAt is preferred, legacy date fallback remains, and the upgrade is idempotent/fail-closed.');
