const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const downloads = path.join(root, 'downloads');
const strict = process.argv.includes('--strict');
const now = new Date().toISOString();

function full(rel) { return path.join(root, rel); }
function exists(rel) { return fs.existsSync(full(rel)); }
function read(rel) { return exists(rel) ? fs.readFileSync(full(rel), 'utf8') : ''; }
function parse(rel, fallback = null) {
  try { return JSON.parse(read(rel)); }
  catch { return fallback; }
}
function hash(rel) {
  if (!exists(rel)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(full(rel))).digest('hex');
}
function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function getPath(target, dottedPath) {
  if (!dottedPath) return undefined;
  return String(dottedPath).split('.').reduce((value, key) => {
    if (value === undefined || value === null) return undefined;
    return value[key];
  }, target);
}
function meaningful(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isObject(value)) return Object.keys(value).length > 0;
  return true;
}
function firstArrayAtPaths(data, paths) {
  for (const dottedPath of paths || []) {
    const value = getPath(data, dottedPath);
    if (Array.isArray(value)) return { path: dottedPath, records: value };
  }
  if (Array.isArray(data)) return { path: '$', records: data };
  return { path: null, records: [] };
}
function fieldCoverage(record, field, aliases = {}) {
  const canonicalValue = getPath(record, field);
  if (meaningful(canonicalValue)) return { status: 'canonical', matchedPath: field };
  const candidates = aliases[field] || [];
  for (const candidate of candidates) {
    if (meaningful(getPath(record, candidate))) return { status: 'legacy_alias', matchedPath: candidate };
  }
  return { status: 'missing', matchedPath: null };
}
function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || 'unknown';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

const schemaPath = 'data/intelligence-record.schema.json';
const tierPath = 'data/access-tier-policy.json';
const manifestPath = 'data/intelligence-source-manifest.json';
const directivePath = 'docs/PROJECT_DIRECTIVE_PHASE_0_1.md';
const setupFiles = [schemaPath, tierPath, manifestPath, directivePath];
const setupHashesBefore = Object.fromEntries(setupFiles.map(file => [file, hash(file)]));

const schema = parse(schemaPath);
const tierPolicy = parse(tierPath);
const manifest = parse(manifestPath);
const setupProblems = [];

if (!schema) setupProblems.push(`${schemaPath} is missing or invalid JSON.`);
if (!tierPolicy) setupProblems.push(`${tierPath} is missing or invalid JSON.`);
if (!manifest) setupProblems.push(`${manifestPath} is missing or invalid JSON.`);
if (!exists(directivePath)) setupProblems.push(`${directivePath} is missing.`);
if (schema && schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') setupProblems.push('Canonical schema is not declared as JSON Schema draft 2020-12.');
if (schema && schema.properties?.speculativeConclusion?.type !== 'object') setupProblems.push('Canonical schema lacks a separate speculativeConclusion object.');
if (schema && schema.properties?.missionAssessment?.type !== 'object') setupProblems.push('Canonical schema lacks missionAssessment.');
if (tierPolicy && tierPolicy.enforcementMode !== 'report-only') setupProblems.push('Access-tier policy must remain report-only during Phase 1 migration.');
if (tierPolicy && tierPolicy.paymentStatus !== 'deferred') setupProblems.push('Payment status must remain deferred during Phase 1 migration.');

const requiredFields = Array.isArray(manifest?.canonicalRequiredFields)
  ? manifest.canonicalRequiredFields
  : Array.isArray(schema?.required)
    ? schema.required
    : [];

const sourceReports = [];
const fieldTotals = Object.fromEntries(requiredFields.map(field => [field, { canonical: 0, legacy_alias: 0, missing: 0 }]));
let totalRecords = 0;

for (const source of manifest?.sources || []) {
  const sourceHashBefore = hash(source.path);
  const data = parse(source.path);
  const sourceReport = {
    id: source.id,
    path: source.path,
    recordType: source.recordType,
    priority: source.priority,
    exists: exists(source.path),
    parseable: data !== null,
    selectedArrayPath: null,
    recordCount: 0,
    fieldSummary: {},
    records: [],
    protectedBy: source.protectedBy || [],
    sourceHashBefore,
    sourceHashAfter: null,
    unchanged: null,
    issues: []
  };

  if (!sourceReport.exists) {
    sourceReport.issues.push('Source file is missing.');
    sourceReports.push(sourceReport);
    continue;
  }
  if (!sourceReport.parseable) {
    sourceReport.issues.push('Source file is not valid JSON.');
    sourceReports.push(sourceReport);
    continue;
  }

  const selected = firstArrayAtPaths(data, source.recordArrayPaths);
  sourceReport.selectedArrayPath = selected.path;
  sourceReport.recordCount = selected.records.length;
  totalRecords += selected.records.length;

  if (!selected.path) sourceReport.issues.push(`No record array found at configured paths: ${(source.recordArrayPaths || []).join(', ')}`);
  if (selected.records.length === 0) sourceReport.issues.push('No records available for coverage analysis.');

  for (let index = 0; index < selected.records.length; index += 1) {
    const record = selected.records[index];
    const coverage = {};
    for (const field of requiredFields) {
      coverage[field] = fieldCoverage(record, field, source.aliases || {});
      const state = coverage[field].status;
      if (!fieldTotals[field]) fieldTotals[field] = { canonical: 0, legacy_alias: 0, missing: 0 };
      fieldTotals[field][state] += 1;
    }
    const states = Object.values(coverage).map(item => item.status);
    const canonicalCount = states.filter(state => state === 'canonical').length;
    const aliasCount = states.filter(state => state === 'legacy_alias').length;
    const missingCount = states.filter(state => state === 'missing').length;
    const identifier = record?.id || record?.findingId || record?.title || record?.headline || record?.route || `${source.id}-${index + 1}`;
    sourceReport.records.push({
      index,
      identifier: String(identifier),
      canonicalCount,
      aliasCount,
      missingCount,
      migrationStatus: missingCount === 0 ? (aliasCount === 0 ? 'canonical' : 'mapped') : (canonicalCount + aliasCount > 0 ? 'partial' : 'unmapped'),
      coverage
    });
  }

  for (const field of requiredFields) {
    const values = sourceReport.records.map(record => record.coverage[field]?.status || 'missing');
    sourceReport.fieldSummary[field] = {
      canonical: values.filter(value => value === 'canonical').length,
      legacyAlias: values.filter(value => value === 'legacy_alias').length,
      missing: values.filter(value => value === 'missing').length
    };
  }

  sourceReport.migrationSummary = countBy(sourceReport.records, 'migrationStatus');
  sourceReport.sourceHashAfter = hash(source.path);
  sourceReport.unchanged = sourceReport.sourceHashBefore === sourceReport.sourceHashAfter;
  if (!sourceReport.unchanged) sourceReport.issues.push('Source file changed during report-only validation. This is forbidden.');
  sourceReports.push(sourceReport);
}

const setupHashesAfter = Object.fromEntries(setupFiles.map(file => [file, hash(file)]));
const setupUnchanged = setupFiles.every(file => setupHashesBefore[file] === setupHashesAfter[file]);
if (!setupUnchanged) setupProblems.push('A Phase 0/1 setup file changed during validation.');

const missingSourceFiles = sourceReports.filter(source => !source.exists).map(source => source.path);
const invalidSourceFiles = sourceReports.filter(source => source.exists && !source.parseable).map(source => source.path);
const mutatedSourceFiles = sourceReports.filter(source => source.unchanged === false).map(source => source.path);
const sourceIssueCount = sourceReports.reduce((sum, source) => sum + source.issues.length, 0);
const totalRequiredSlots = totalRecords * requiredFields.length;
const totals = Object.values(fieldTotals).reduce((acc, value) => {
  acc.canonical += value.canonical;
  acc.legacyAlias += value.legacy_alias;
  acc.missing += value.missing;
  return acc;
}, { canonical: 0, legacyAlias: 0, missing: 0 });

const coveragePercent = totalRequiredSlots
  ? Math.round(((totals.canonical + totals.legacyAlias) / totalRequiredSlots) * 10000) / 100
  : 0;
const canonicalPercent = totalRequiredSlots
  ? Math.round((totals.canonical / totalRequiredSlots) * 10000) / 100
  : 0;

const report = {
  ok: setupProblems.length === 0 && invalidSourceFiles.length === 0 && mutatedSourceFiles.length === 0,
  strictPass: setupProblems.length === 0 && missingSourceFiles.length === 0 && invalidSourceFiles.length === 0 && mutatedSourceFiles.length === 0 && totals.missing === 0,
  mode: strict ? 'strict' : 'report-only',
  generatedAt: now,
  boundary: 'The validator reads legacy intelligence outputs and writes migration reports only. It does not rewrite evidence, conclusions, pages, routes, Workers, databases, memberships or entitlements.',
  paymentStatus: tierPolicy?.paymentStatus || 'unknown',
  enforcementMode: tierPolicy?.enforcementMode || 'unknown',
  setup: {
    files: setupFiles.map(file => ({ file, exists: exists(file), hashBefore: setupHashesBefore[file], hashAfter: setupHashesAfter[file], unchanged: setupHashesBefore[file] === setupHashesAfter[file] })),
    problems: setupProblems
  },
  summary: {
    configuredSources: sourceReports.length,
    availableSources: sourceReports.filter(source => source.exists && source.parseable).length,
    missingSourceFiles: missingSourceFiles.length,
    invalidSourceFiles: invalidSourceFiles.length,
    mutatedSourceFiles: mutatedSourceFiles.length,
    totalRecords,
    requiredFields: requiredFields.length,
    totalRequiredSlots,
    canonicalSlots: totals.canonical,
    legacyAliasSlots: totals.legacyAlias,
    missingSlots: totals.missing,
    mappedCoveragePercent: coveragePercent,
    canonicalCoveragePercent: canonicalPercent,
    sourceIssues: sourceIssueCount
  },
  fieldTotals,
  missingSourceFiles,
  invalidSourceFiles,
  mutatedSourceFiles,
  sources: sourceReports,
  activationBoundary: manifest?.rules || []
};

fs.mkdirSync(downloads, { recursive: true });
fs.writeFileSync(path.join(downloads, 'phase1-intelligence-schema-report.json'), JSON.stringify(report, null, 2));

const lowestFields = Object.entries(fieldTotals)
  .map(([field, counts]) => ({ field, ...counts, mapped: counts.canonical + counts.legacy_alias }))
  .sort((a, b) => a.mapped - b.mapped || b.missing - a.missing || a.field.localeCompare(b.field));

const lines = [
  '# Phase 1 Intelligence Schema Report',
  '',
  `Generated: ${report.generatedAt}`,
  `Mode: ${report.mode}`,
  `Status: ${report.ok ? 'REPORT COMPLETED' : 'SETUP OR SOURCE ERROR'}`,
  `Strict status: ${report.strictPass ? 'PASS' : 'NOT READY'}`,
  `Payments: ${report.paymentStatus}`,
  `Tier enforcement: ${report.enforcementMode}`,
  '',
  '## Safety boundary',
  '',
  report.boundary,
  '',
  '## Coverage',
  '',
  `- Configured sources: ${report.summary.configuredSources}`,
  `- Available sources: ${report.summary.availableSources}`,
  `- Records inspected: ${report.summary.totalRecords}`,
  `- Canonical required fields: ${report.summary.requiredFields}`,
  `- Canonical field slots: ${report.summary.canonicalSlots}`,
  `- Legacy alias field slots: ${report.summary.legacyAliasSlots}`,
  `- Missing field slots: ${report.summary.missingSlots}`,
  `- Mapped coverage: ${report.summary.mappedCoveragePercent}%`,
  `- Already canonical: ${report.summary.canonicalCoveragePercent}%`,
  '',
  '## Lowest-coverage canonical fields',
  '',
  ...lowestFields.slice(0, 12).map(item => `- ${item.field}: canonical ${item.canonical}, alias ${item.legacy_alias}, missing ${item.missing}`),
  '',
  '## Source migration status',
  '',
  ...sourceReports.map(source => `- ${source.id}: ${source.exists ? (source.parseable ? `${source.recordCount} records at ${source.selectedArrayPath || 'no array'}` : 'invalid JSON') : 'missing'}; issues ${source.issues.length}`),
  '',
  '## Setup problems',
  '',
  ...(setupProblems.length ? setupProblems.map(problem => `- ${problem}`) : ['- None']),
  '',
  '## Activation boundary',
  '',
  'Strict enforcement remains disabled until source-specific compatibility adapters are reviewed, current outputs remain unchanged and production regression tests pass.'
];
fs.writeFileSync(path.join(downloads, 'phase1-intelligence-schema-report.md'), lines.join('\n'));

console.log(`PHASE 1 INTELLIGENCE SCHEMA ${report.ok ? 'REPORT COMPLETED' : 'REPORT BLOCKED'}`);
console.log(`Records: ${totalRecords}; mapped coverage: ${coveragePercent}%; canonical: ${canonicalPercent}%; missing slots: ${totals.missing}.`);
console.log('Reports: downloads/phase1-intelligence-schema-report.json and downloads/phase1-intelligence-schema-report.md');

if (strict && !report.strictPass) process.exit(1);
if (!strict && !report.ok) process.exitCode = 0;
