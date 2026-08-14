'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { removePrivateOutputDirectories } = require('./private-output-directory-repair.js');

const root = process.cwd();
const site = path.join(root, '_site');
const buildSource = fs.readFileSync(path.join(root, 'scripts', 'build-cloudflare-output.js'), 'utf8');
const aliasSource = fs.readFileSync(path.join(root, 'scripts', 'finalize-public-route-aliases.js'), 'utf8');
const repairSource = fs.readFileSync(path.join(root, 'scripts', 'private-output-directory-repair.js'), 'utf8');

assert.ok(buildSource.includes("'card-artwork-batches'"), 'private artwork batch namespace must remain blocked from static output');
assert.ok(buildSource.includes('private card-artwork-batches directory exposed'), 'packager must fail if the private namespace is copied');
assert.ok(!aliasSource.includes("['card-artwork-batches.html', 'card-artwork-batches']"), 'alias finalizer must not require an excluded private namespace');
assert.ok(aliasSource.includes("'card-artwork-batches.html'"), 'alias finalizer must identify the private output namespace collision');
assert.ok(aliasSource.includes('removePrivateOutputDirectories'), 'alias finalizer must remove stale private output before inventorying public routes');
assert.ok(repairSource.includes("repair: 'removed-private-output-directory'"), 'private output repair must produce an auditable receipt');

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-private-output-'));
try {
  const fixtureSite = path.join(fixture, '_site');
  const canonical = path.join(fixtureSite, 'card-artwork-batches.html');
  const privateDirectory = path.join(fixtureSite, 'card-artwork-batches');
  fs.mkdirSync(privateDirectory, { recursive: true });
  fs.writeFileSync(canonical, '<!doctype html><title>Public noindex route</title>');
  fs.writeFileSync(path.join(privateDirectory, 'batch-001.html'), '<!doctype html><title>Private batch</title>');
  const repairs = removePrivateOutputDirectories(fixtureSite, new Set(['card-artwork-batches.html']));
  assert.strictEqual(repairs.length, 1, 'one stale private directory must produce one repair receipt');
  assert.ok(fs.existsSync(canonical), 'repair must preserve the canonical public route');
  assert.ok(!fs.existsSync(privateDirectory), 'repair must remove the private directory before route inventory');
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

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
