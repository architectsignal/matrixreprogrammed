#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const finalizer = path.join(repositoryRoot, 'scripts', 'finalize-black-file-postbuild.js');
const reportPath = path.join(repositoryRoot, 'downloads', 'black-file-postbuild-alias-regression-test.json');
const surfaceRelatives = ['black-file.html', 'black-file', '_site/black-file.html', '_site/black-file'];
const genericTitleId = 'matrix-pathways-title';
const canonicalTitleId = 'matrix-pathways-title-black-file';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function count(value, expression) {
  return (String(value || '').match(expression) || []).length;
}
function countExactId(html, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return count(html, new RegExp(`\\bid\\s*=\\s*(["'])${escaped}\\1`, 'gi'));
}
function countAriaToken(html, id) {
  let total = 0;
  String(html || '').replace(/\baria-labelledby\s*=\s*(["'])([\s\S]*?)\1/gi, (whole, _quote, value) => {
    total += String(value || '').split(/\s+/).filter(Boolean).filter(token => token === id).length;
    return whole;
  });
  return total;
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function runFinalizer(cwd) {
  const result = spawnSync(process.execPath, [finalizer], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Black File postbuild finalizer exited ${result.status} in ${cwd}.`);
}
function audit(cwd, label) {
  const sourcePath = path.join(cwd, 'black-file.html');
  assert(fs.existsSync(sourcePath), `${label}: source black-file.html is missing.`);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const sourceHash = sha256(source);
  const surfaces = [];
  for (const relative of surfaceRelatives) {
    const file = path.join(cwd, relative);
    assert(fs.existsSync(file) && fs.statSync(file).isFile(), `${label}: ${relative} is missing.`);
    const html = fs.readFileSync(file, 'utf8');
    const checks = {
      byteIdentical: sha256(html) === sourceHash,
      oneH1: count(html, /<h1\b/gi) === 1,
      oneHero: count(html, /data-black-file-public-hero\s*=\s*(["'])canonical\1/gi) === 1,
      oneRequest: count(html, /\bid\s*=\s*(["'])request\1/gi) === 1,
      genericIdCount: countExactId(html, genericTitleId),
      genericAriaCount: countAriaToken(html, genericTitleId),
      canonicalIdCount: countExactId(html, canonicalTitleId),
      canonicalAriaCount: countAriaToken(html, canonicalTitleId),
    };
    assert(checks.byteIdentical, `${label}: ${relative} is not byte-identical to black-file.html.`);
    assert(checks.oneH1 && checks.oneHero && checks.oneRequest, `${label}: ${relative} lost hero/H1/request integrity.`);
    assert(checks.genericIdCount === 0 && checks.genericAriaCount === 0, `${label}: ${relative} retains a generic pathway ID.`);
    assert(checks.canonicalIdCount === 1 && checks.canonicalAriaCount === 1, `${label}: ${relative} lacks one unique page-specific pathway ID.`);
    surfaces.push({ relative, sha256: sha256(html), checks });
  }
  return { label, sourceHash, surfaces };
}
function write(cwd, relative, content) {
  const file = path.join(cwd, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-black-file-postbuild-'));
const fixture = `<!doctype html><html><head><title>Black File</title></head><body><main>
<section class="hero wrap"><h1>STALE BLACK FILE</h1><p>Stale hero.</p></section>
<section id="request"><h2>Request</h2></section>
<section id="downstream-records"><p>Preserve downstream records.</p></section>
<section class="matrix-pathways" aria-labelledby="${genericTitleId} ${canonicalTitleId}">
  <div class="matrix-pathways-head"><h2 id="${genericTitleId}">First pathway title</h2><h3 id="${canonicalTitleId}">Duplicate pathway title</h3></div>
  <div class="matrix-pathway-grid"><a href="evidence-vault.html">Evidence</a></div>
</section>
<section class="matrix-pathways-shadow" aria-labelledby="${genericTitleId}"><h2 id="${genericTitleId}">Not the exact class</h2></section>
</main><footer>Footer</footer></body></html>`;

try {
  write(fixtureRoot, 'black-file.html', fixture);
  write(fixtureRoot, 'black-file', fixture.replace('First pathway title', 'stale extensionless'));
  write(fixtureRoot, '_site/black-file.html', fixture.replace('First pathway title', 'stale built html'));
  write(fixtureRoot, '_site/black-file', fixture.replace('First pathway title', 'stale built extensionless'));

  runFinalizer(fixtureRoot);
  const first = audit(fixtureRoot, 'fixture-first-pass');
  const hashes = Object.fromEntries(first.surfaces.map(surface => [surface.relative, surface.sha256]));
  runFinalizer(fixtureRoot);
  const second = audit(fixtureRoot, 'fixture-second-pass');
  for (const surface of second.surfaces) {
    assert(surface.sha256 === hashes[surface.relative], `fixture repeat-safety failed for ${surface.relative}.`);
  }

  runFinalizer(repositoryRoot);
  const real = audit(repositoryRoot, 'repository-postbuild-surfaces');
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    fixtureFirstPass: first,
    fixtureSecondPass: second,
    repository: real,
    boundary: 'The regression deliberately seeds duplicate generic and page-specific pathway IDs, then proves one deterministic page-specific ID across source, root extensionless, _site HTML and _site extensionless aliases. Repeated finalization is byte-stable.',
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log('BLACK FILE POSTBUILD ALIAS REGRESSION PASSED');
  console.log('Source, .html, extensionless and _site aliases are byte-identical with one page-specific pathway ID and no generic ID.');
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
