'use strict';

// Numbered research waves are hydrated by build-criminal-conduct-registry.js.
// This script is intentionally a verification/reporting pass only. It must
// never merge the same subjects a second time, because the mission build can
// execute more than once during fault-injection and recovery tests.

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const registryPath = path.join(dataDir, 'criminal-conduct-registry.json');
const reportPath = path.join(root, 'downloads', 'criminal-conduct-wave-build-report.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function array(value) {
  return Array.isArray(value) ? value : [];
}

if (!fs.existsSync(registryPath)) {
  throw new Error('Missing criminal conduct registry before numbered-wave verification.');
}

const waveFiles = fs.readdirSync(dataDir)
  .filter(name => /^criminal-conduct-subjects-wave\d+\.json$/i.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const registry = readJson(registryPath);
const failures = [];
const verified = [];

for (const filename of waveFiles) {
  const sourcePath = path.join(dataDir, filename);
  const source = readJson(sourcePath);
  for (const item of array(source.subjects)) {
    const key = String(item?.key || '').trim();
    if (!key) {
      failures.push(`${filename}: subject missing key`);
      continue;
    }
    const hydrated = registry.subjects?.[key];
    if (!hydrated) {
      failures.push(`${filename}: ${key} was not hydrated by the authoritative registry builder`);
      continue;
    }
    const expectedSource = `data/${filename}`;
    if (hydrated.sourceFile !== expectedSource) {
      failures.push(`${filename}: ${key} source ownership mismatch (${hydrated.sourceFile || 'missing'}; expected ${expectedSource})`);
      continue;
    }
    const approvedRecords = array(hydrated.records).filter(record => record.publicationStatus === 'approved').length;
    if (!approvedRecords) {
      failures.push(`${filename}: ${key} has no approved hydrated records`);
      continue;
    }
    verified.push({ wave: filename, key, name: hydrated.name || item.name || key, approvedRecords });
  }
}

if (failures.length) {
  throw new Error(`Criminal conduct wave verification failed: ${failures.join('; ')}`);
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  mode: 'single-authoritative-hydration-with-verification-only',
  idempotent: true,
  waveFiles,
  subjectsVerified: verified.length,
  totalRegistrySubjects: Object.keys(registry.subjects || {}).length,
  approvedFindings: Object.values(registry.subjects || {}).reduce(
    (sum, subject) => sum + array(subject.records).filter(record => record.publicationStatus === 'approved').length,
    0
  ),
  verified,
  rule: 'Numbered source waves are hydrated exactly once by build-criminal-conduct-registry.js; this pass only verifies ownership and approved records.'
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Numbered criminal waves verified without duplicate hydration: ${verified.length} subjects across ${waveFiles.length} wave files.`);
