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
function unique(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null))];
}
function mergeObjectsBy(items, keyFn) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}
function earliest(...values) {
  return values.filter(Boolean).sort()[0] || null;
}
function latest(...values) {
  return values.filter(Boolean).sort().reverse()[0] || null;
}
function statusRank(status) {
  return ({ withdrawn: 7, corrected: 6, updated: 5, published: 4, review: 3, draft: 2, archived: 1 })[status] || 0;
}
function mergeAccess(a = {}, b = {}) {
  return {
    ...a,
    minimumTier: a.minimumTier || b.minimumTier,
    publicFields: unique([...(a.publicFields || []), ...(b.publicFields || [])]),
    registeredFields: unique([...(a.registeredFields || []), ...(b.registeredFields || [])]),
    supporterFields: unique([...(a.supporterFields || []), ...(b.supporterFields || [])]),
    intelligenceFields: unique([...(a.intelligenceFields || []), ...(b.intelligenceFields || [])]),
    researchProFields: unique([...(a.researchProFields || []), ...(b.researchProFields || [])]),
    emailVisibility: unique([...(a.emailVisibility || []), ...(b.emailVisibility || [])]),
    dashboardVisibility: unique([...(a.dashboardVisibility || []), ...(b.dashboardVisibility || [])]),
    downloadPermissions: mergeObjectsBy([...(a.downloadPermissions || []), ...(b.downloadPermissions || [])], item => `${item.format}:${item.minimumTier}`),
    embargoUntil: a.embargoUntil || b.embargoUntil || null
  };
}
function mergeDelivery(a = {}, b = {}) {
  const keys = [
    'includeInDailyDrop',
    'includeInWeeklyReport',
    'includeInNewsletter',
    'includeInSearch',
    'includeInEntityCards',
    'includeInConvergenceTracker'
  ];
  return Object.fromEntries(keys.map(key => [key, Boolean(a[key] || b[key])]));
}
function projectionMetadata(record, sourceId) {
  return {
    sourceId,
    recordType: record.recordType,
    status: record.status,
    sourceFile: record.legacy?.sourceFile || null,
    sourcePath: record.legacy?.sourcePath || null,
    legacyId: record.legacy?.legacyId ?? null
  };
}
function mergeCanonical(existing, incoming, sourceId, conflicts) {
  const priorSources = existing.previewSourceIds || [existing.previewSourceId].filter(Boolean);
  const nextSources = unique([...priorSources, sourceId]);
  const projections = [
    ...(existing.legacy?.projections || [projectionMetadata(existing, priorSources[0] || 'unknown')]),
    projectionMetadata(incoming, sourceId)
  ];

  const comparisonFields = [
    ['title', existing.title, incoming.title],
    ['solidConclusion.text', existing.solidConclusion?.text, incoming.solidConclusion?.text],
    ['solidConclusion.boundary', existing.solidConclusion?.boundary, incoming.solidConclusion?.boundary],
    ['evidence.grade', existing.evidence?.grade, incoming.evidence?.grade],
    ['evidence.claimClass', existing.evidence?.claimClass, incoming.evidence?.claimClass],
    ['missionAssessment.outcome', existing.missionAssessment?.outcome, incoming.missionAssessment?.outcome]
  ];
  const materialDifferences = comparisonFields
    .filter(([, left, right]) => left !== undefined && right !== undefined && left !== right)
    .map(([field, left, right]) => ({ field, left, right }));
  if (materialDifferences.length) {
    conflicts.push({ id: existing.id, sources: nextSources, differences: materialDifferences });
  }

  const recordTypes = unique([...(existing.recordTypeProjections || [existing.recordType]), incoming.recordType]);
  const deliveryProjection = recordTypes.includes('daily_drop') && recordTypes.includes('weekly_report');
  const recordType = deliveryProjection ? 'finding' : existing.recordType;
  const selectedStatus = statusRank(incoming.status) > statusRank(existing.status) ? incoming.status : existing.status;

  return {
    ...existing,
    recordType,
    recordTypeProjections: recordTypes,
    status: selectedStatus,
    previewSourceId: nextSources[0],
    previewSourceIds: nextSources,
    sources: mergeObjectsBy([...(existing.sources || []), ...(incoming.sources || [])], item => item.id || item.url),
    recordStatus: unique([...(existing.recordStatus || []), ...(incoming.recordStatus || [])]),
    establishedFacts: mergeObjectsBy([...(existing.establishedFacts || []), ...(incoming.establishedFacts || [])], item => `${item.statement}|${item.boundary}`),
    entities: mergeObjectsBy([...(existing.entities || []), ...(incoming.entities || [])], item => item.id || `${item.name}|${item.role}`),
    moneyAndAuthority: mergeObjectsBy([...(existing.moneyAndAuthority || []), ...(incoming.moneyAndAuthority || [])], item => `${item.routeType}|${item.description}`),
    missingEvidence: mergeObjectsBy([...(existing.missingEvidence || []), ...(incoming.missingEvidence || [])], item => item.record),
    watchNext: mergeObjectsBy([...(existing.watchNext || []), ...(incoming.watchNext || [])], item => item.indicator),
    access: mergeAccess(existing.access, incoming.access),
    delivery: mergeDelivery(existing.delivery, incoming.delivery),
    freshness: {
      ...existing.freshness,
      createdAt: earliest(existing.freshness?.createdAt, incoming.freshness?.createdAt),
      updatedAt: latest(existing.freshness?.updatedAt, incoming.freshness?.updatedAt),
      lastReviewedAt: latest(existing.freshness?.lastReviewedAt, incoming.freshness?.lastReviewedAt),
      reviewStatus: existing.freshness?.reviewStatus || incoming.freshness?.reviewStatus,
      supersedes: existing.freshness?.supersedes || incoming.freshness?.supersedes || null,
      supersededBy: existing.freshness?.supersededBy || incoming.freshness?.supersededBy || null
    },
    legacy: {
      ...existing.legacy,
      projections,
      migrationStatus: materialDifferences.length ? 'partial' : 'mapped'
    }
  };
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

const rawProjections = packages.flatMap(item => item.preview.records.map(record => ({
  ...record,
  previewSourceId: item.id,
  previewSourceIds: [item.id]
})));
const canonicalMap = new Map();
const duplicateProjectionIds = [];
const mergeConflicts = [];
for (const projection of rawProjections) {
  if (!canonicalMap.has(projection.id)) {
    canonicalMap.set(projection.id, {
      ...projection,
      recordTypeProjections: [projection.recordType],
      legacy: {
        ...projection.legacy,
        projections: [projectionMetadata(projection, projection.previewSourceId)]
      }
    });
    continue;
  }
  duplicateProjectionIds.push(projection.id);
  canonicalMap.set(
    projection.id,
    mergeCanonical(canonicalMap.get(projection.id), projection, projection.previewSourceId, mergeConflicts)
  );
}
const records = [...canonicalMap.values()];
const canonicalIds = new Set(records.map(record => record.id));
const canonicalDuplicateIds = records
  .map(record => record.id)
  .filter((recordId, index, all) => all.indexOf(recordId) !== index);

const policy = readJson('data/access-tier-policy.json');
const manifest = readJson('data/intelligence-source-manifest.json');
const sourceCounts = Object.fromEntries(packages.map(item => [item.id, item.preview.recordCount]));
const summary = {
  configuredSources: packages.length,
  assuredManifestSources: manifest.sources.filter(source => source.previewStatus === 'implemented_and_assured').length,
  rawProjectionCount: rawProjections.length,
  totalRecords: records.length,
  uniqueIds: canonicalIds.size,
  duplicateProjectionCount: duplicateProjectionIds.length,
  duplicateProjectionIds: unique(duplicateProjectionIds).length,
  canonicalDuplicateIds: canonicalDuplicateIds.length,
  mergeConflictCount: mergeConflicts.length,
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
  ok: canonicalDuplicateIds.length === 0 && mergeConflicts.length === 0 && summary.assuredManifestSources === packages.length,
  mode: 'preview-only',
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  paymentStatus: policy.paymentStatus,
  enforcementMode: policy.enforcementMode,
  boundary: 'This bundle combines deterministic canonical previews only. Duplicate daily and weekly delivery projections are merged into one canonical finding. The bundle does not publish records, alter generators, change entitlements, activate payments or modify protected source data.',
  sourceCounts,
  summary,
  duplicateProjectionIds: unique(duplicateProjectionIds),
  canonicalDuplicateIds,
  mergeConflicts,
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
  rawProjectionCount: rawProjections.length,
  recordCount: records.length,
  records
}, null, 2));
fs.writeFileSync(path.join(outputDir, 'canonical-records.ndjson'), records.map(record => JSON.stringify(record)).join('\n') + '\n');
fs.writeFileSync(path.join(outputDir, 'merge-report.json'), JSON.stringify({
  ok: mergeConflicts.length === 0,
  generatedAt: index.generatedAt,
  rawProjectionCount: rawProjections.length,
  canonicalRecordCount: records.length,
  duplicateProjectionCount: duplicateProjectionIds.length,
  duplicateProjectionIds: unique(duplicateProjectionIds),
  mergeConflicts,
  boundary: 'Duplicate delivery projections are merged only when material conclusion, evidence and mission fields agree.'
}, null, 2));

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
  `- Raw delivery projections: ${summary.rawProjectionCount}`,
  `- Canonical preview records: ${summary.totalRecords}`,
  `- Duplicate delivery projections merged: ${summary.duplicateProjectionCount}`,
  `- Material merge conflicts: ${summary.mergeConflictCount}`,
  `- Canonical duplicate IDs: ${summary.canonicalDuplicateIds}`,
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

console.log(`CANONICAL PREVIEW BUNDLE: ${rawProjections.length} projections merged into ${records.length} canonical records across ${packages.length} sources.`);
console.log(`Output: ${path.relative(root, outputDir)}`);
if (!index.ok) process.exit(1);
