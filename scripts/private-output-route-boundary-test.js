'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const buildSource = fs.readFileSync(path.join(root, 'scripts', 'build-cloudflare-output.js'), 'utf8');
const aliasSource = fs.readFileSync(path.join(root, 'scripts', 'finalize-public-route-aliases.js'), 'utf8');

assert.ok(buildSource.includes("'card-artwork-batches'"), 'private artwork batch namespace must remain blocked from static output');
assert.ok(buildSource.includes('private card-artwork-batches directory exposed'), 'packager must fail if the private namespace is copied');
assert.ok(!aliasSource.includes("['card-artwork-batches.html', 'card-artwork-batches']"), 'alias finalizer must not require an excluded private namespace');
assert.ok(aliasSource.includes("'card-artwork-batches.html'"), 'alias finalizer must identify the private output namespace collision');
assert.ok(aliasSource.includes("repair: 'removed-private-output-directory'"), 'alias finalizer must remove stale private output before synchronizing the public route file');

if (fs.existsSync(site)) {
  const canonical = path.join(site, 'card-artwork-batches.html');
  const alias = path.join(site, 'card-artwork-batches');
  assert.ok(fs.existsSync(canonical) && fs.statSync(canonical).isFile(), 'internal noindex canonical page must remain a file');
  assert.ok(fs.existsSync(alias) && fs.statSync(alias).isFile(), 'extensionless alias must remain a file when the private namespace is excluded');
  assert.ok(!fs.existsSync(path.join(site, 'card-artwork-batches', 'batch-001.html')), 'private batch pages must not be deployed');
}

console.log(JSON.stringify({
  ok: true,
  privateNamespaceExcluded: true,
  canonicalNoindexPageRetained: true,
  extensionlessAliasIsFile: fs.existsSync(site),
  privateBatchPagesDeployed: false
}, null, 2));
