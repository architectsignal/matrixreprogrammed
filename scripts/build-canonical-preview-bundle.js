const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const outputDir = path.join(root, 'downloads', 'canonical-preview-bundle');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}
function run(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(`${script} failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  process.stdout.write(result.stdout || '');
}
function countBy(records, getter) {
  const counts = {};
  for (const record of records) {
    const value = getter(record);
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      const key = String(item ?? 'unknown');
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

const adapters = [
  'scripts/build-investigation-canonical-previews.js',
  'scripts/build-live-intel-canonical-previews.js',
  'scripts/build-outcome-canonical-previews.js',
  'scripts/build-daily-brain-canonical-previews.js',
  'scripts/build-daily-power-canonical-previews.js',
  'scripts/build-relationship-canonical-previews.js'
];
for (const adapter of adapters) run(adapter);

const packages = [
  {
    id: 'daily-investigation',
    sourceFile: 'data/daily-investigation-conclusions.json',
    previewFile: 'downloads/canonical-intelligence-preview/daily-investigation.canonical-preview.json'
  },
  {
    id: 'weekly-investigation',
    sourceFile: 'data/weekly-investigation-conclusions.json',
    previewFile: 'downloads/canonical-intelligence-preview/weekly-investigation.canonical-preview.json'
  },
  {
    id: 'live-intel',
    sourceFile: 'data/live-intel.json',
    previewFile: 'downloads/canonical-live-intel-preview/live-intel.canonical-preview.json'
  },
  {
    id: 'outcome-briefings',
    sourceFile: 'data/outcome-briefings.json',
    previewFile: 'downloads/canonical-outcome-preview/outcome-briefings.canonical-preview.json'
  },
  {
    id: 'daily-brain',
    sourceFile: 'data/daily-brain-brief.json',
    previewFile: 'downloads/canonical-daily-brain-preview/daily-brain.canonical-preview.json'
  },
  {
    id: 'daily-power-conclusions',
    sourceFile: 'data/daily-power-conclusions.json',
    previewFile: 'downloads/canonical-daily-power-preview/daily-power.canonical-preview.json'
  },
  {
    id: 'relationship-graph',
    sourceFile: 'data/evidence-weighted-relationship-graph.json',
    previewFile: 'downloads/canonical-relationship-preview/relationship-graph.canonical-preview.json'
  }
].map(item => ({ ...item, preview: readJson(item.previewFile) }));

const records = packages.flatMap(item => item.preview.records.map(record => ({
  ...record,
  previewSourceId: item.id
})));
const ids = new Set();
const duplicateIds = [];
for (const record of records) {
  if (ids.has(record.id)) duplicateIds.push(record.id);
  ids.add(record.id);
}

const policy = readJson('data/access-tier-policy.json');
const manifest = readJson('data/intelligence-source-manifest.json');
const sourceCounts = Object.fromEntries(packages.map(item => [item.id, item.preview.recordCount]));
const summary = {
  configuredSources: packages.length,
  assuredManifestSources: manifest.sources.filter(source => source.previewStatus === 'implemented_and_assured').length,
  totalRecords: records.length,
  uniqueIds: ids.size,
  duplicateIds: duplicateIds.length,
  byRecordType: countBy(records, record => record.recordType),
  byStatus: countBy(records, record => record.status),
  byMissionOutcome: countBy(records, record => record.missionAssessment?.outcome),
  byClaimClass: countBy(records, record => record.evidence?.claimClass),
  byMinimumTier: countBy(records, record => record.access?.minimumTier),
  byReviewStatus: countBy(records, record => record.freshness?.reviewStatus),
  includedInConvergenceTracker: records.filter(record => record.delivery?.includeInConvergenceTracker).length,
  includedInDailyDrop: records.filter(record => record.delivery?.includeInDailyDrop).length,
  includedInWeeklyReport: records.filter(record => record.delivery?.includeInWeeklyReport).length,
  includedInNewsletter: records.filter(record => record.delivery?.includeInNewsletter).length,
  publicSafetyBoundaryCount: records.filter(record =>
    record.solidConclusion?.boundary &&
    record.missionAssessment?.boundary &&
    record.evidence?.associationBoundary
  ).length
};

const index = {
  ok: duplicateIds.length === 0 && summary.assuredManifestSources === packages.length,
  mode: 'preview-only',
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  paymentStatus: policy.paymentStatus,
  enforcementMode: policy.enforcementMode,
  boundary: 'This bundle combines deterministic canonical previews only. It does not publish records, alter generators, change entitlements, activate payments or modify protected source data.',
  sourceCounts,
  summary,
  duplicateIds,
  packages: packages.map(item => ({
    id: item.id,
    sourceFile: item.sourceFile,
    previewFile: item.previewFile,
    recordCount: item.preview.recordCount,
    sourceGeneratedAt: item.preview.sourceGeneratedAt || null,
    boundary: item.preview.boundary || null
  }))
};

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'index.json'), JSON.stringify(index, null, 2));
fs.writeFileSync(path.join(outputDir, 'canonical-records.json'), JSON.stringify({
  ok: index.ok,
  mode: index.mode,
  schemaVersion: index.schemaVersion,
  generatedAt: index.generatedAt,
  recordCount: records.length,
  records
}, null, 2));
fs.writeFileSync(path.join(outputDir, 'canonical-records.ndjson'), records.map(record => JSON.stringify(record)).join('\n') + '\n');

const lines = [
  '# Canonical Intelligence Preview Bundle',
  '',
  `Generated: ${index.generatedAt}`,
  `Mode: ${index.mode}`,
  `Payments: ${index.paymentStatus}`,
  `Tier enforcement: ${index.enforcementMode}`,
  '',
  '## Safety boundary',
  '',
  index.boundary,
  '',
  '## Coverage',
  '',
  `- Configured sources: ${summary.configuredSources}`,
  `- Assured manifest sources: ${summary.assuredManifestSources}`,
  `- Canonical preview records: ${summary.totalRecords}`,
  `- Unique IDs: ${summary.uniqueIds}`,
  `- Duplicate IDs: ${summary.duplicateIds}`,
  `- Records with public safety boundaries: ${summary.publicSafetyBoundaryCount}`,
  `- Included in convergence tracker: ${summary.includedInConvergenceTracker}`,
  `- Included in newsletter preview: ${summary.includedInNewsletter}`,
  '',
  '## Source counts',
  '',
  ...Object.entries(sourceCounts).map(([source, count]) => `- ${source}: ${count}`),
  '',
  '## Record types',
  '',
  ...Object.entries(summary.byRecordType).map(([type, count]) => `- ${type}: ${count}`),
  '',
  '## Mission outcomes',
  '',
  ...Object.entries(summary.byMissionOutcome).map(([outcome, count]) => `- ${outcome}: ${count}`),
  '',
  '## Activation boundary',
  '',
  'This bundle remains preview-only. Publication, dashboard delivery, email delivery, tier enforcement and payments require later regression-tested phases.'
];
fs.writeFileSync(path.join(outputDir, 'summary.md'), lines.join('\n'));

console.log(`CANONICAL PREVIEW BUNDLE: ${records.length} records across ${packages.length} sources.`);
console.log(`Output: ${path.relative(root, outputDir)}`);
if (!index.ok) process.exit(1);
