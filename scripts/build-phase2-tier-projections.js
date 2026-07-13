const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = process.cwd();
const outputDir = path.join(root, 'downloads', 'phase2-tier-projections');
const tierOrder = ['public', 'registered', 'supporter_3', 'intelligence_6', 'research_pro_9'];
const accessFieldKeys = {
  public: 'publicFields',
  registered: 'registeredFields',
  supporter_3: 'supporterFields',
  intelligence_6: 'intelligenceFields',
  research_pro_9: 'researchProFields'
};
const forcedPublicPaths = [
  'id',
  'recordType',
  'title',
  'summary',
  'status',
  'recordStatus',
  'solidConclusion.boundary',
  'missionAssessment.boundary',
  'evidence.claimClass',
  'evidence.associationBoundary',
  'freshness.reviewStatus',
  'counterAnalysis.contradictoryEvidence',
  'freshness.supersedes',
  'freshness.supersededBy'
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, incoming) {
  if (incoming === undefined) return clone(base);
  if (base === undefined) return clone(incoming);
  if (Array.isArray(base) && Array.isArray(incoming)) {
    const length = Math.max(base.length, incoming.length);
    return Array.from({ length }, (_, index) => deepMerge(base[index], incoming[index]));
  }
  if (isPlainObject(base) && isPlainObject(incoming)) {
    const output = { ...clone(base) };
    for (const key of Object.keys(incoming)) output[key] = deepMerge(output[key], incoming[key]);
    return output;
  }
  return clone(incoming);
}

function projectPath(source, segments) {
  if (segments.length === 0) return clone(source);
  if (Array.isArray(source)) {
    return source.map(item => {
      const projected = projectPath(item, segments);
      return projected === undefined ? null : projected;
    });
  }
  if (!isPlainObject(source)) return undefined;
  const [head, ...rest] = segments;
  if (!Object.prototype.hasOwnProperty.call(source, head)) return undefined;
  const projected = projectPath(source[head], rest);
  return projected === undefined ? undefined : { [head]: projected };
}

function projectRecord(record, fieldPaths) {
  let output = {};
  for (const fieldPath of [...new Set(fieldPaths)].sort()) {
    const projected = projectPath(record, String(fieldPath).split('.'));
    if (projected !== undefined) output = deepMerge(output, projected);
  }
  return output;
}

function getPath(source, dottedPath) {
  const segments = String(dottedPath).split('.');
  function walk(value, index) {
    if (index === segments.length) return value;
    if (Array.isArray(value)) return value.map(item => walk(item, index));
    if (!isPlainObject(value)) return undefined;
    return walk(value[segments[index]], index + 1);
  }
  return walk(source, 0);
}

function meaningful(value) {
  if (value === undefined) return false;
  if (value === null) return true;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return true;
}

function isStructuralSubset(lower, higher) {
  if (Array.isArray(lower)) {
    if (!Array.isArray(higher) || lower.length !== higher.length) return false;
    return lower.every((item, index) => isStructuralSubset(item, higher[index]));
  }
  if (isPlainObject(lower)) {
    if (!isPlainObject(higher)) return false;
    return Object.keys(lower).every(key => Object.prototype.hasOwnProperty.call(higher, key) && isStructuralSubset(lower[key], higher[key]));
  }
  return JSON.stringify(lower) === JSON.stringify(higher);
}

function leafCount(value) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + leafCount(item), 0);
  if (isPlainObject(value)) return Object.values(value).reduce((sum, item) => sum + leafCount(item), 0);
  return 1;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function runCanonicalBundle() {
  const result = spawnSync(process.execPath, ['scripts/build-canonical-preview-bundle.js'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(`Canonical preview bundle failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  process.stdout.write(result.stdout || '');
}

runCanonicalBundle();

const policy = readJson('data/access-tier-policy.json');
const canonicalPackage = readJson('downloads/canonical-preview-bundle/canonical-records.json');
const canonicalIndex = readJson('downloads/canonical-preview-bundle/index.json');
if (!canonicalPackage.ok || !canonicalIndex.ok) throw new Error('Phase 1 canonical bundle is not healthy.');
if (policy.paymentStatus !== 'deferred' || policy.enforcementMode !== 'report-only') {
  throw new Error('Phase 2 preview requires deferred payments and report-only tier enforcement.');
}

const projectionTimestamp = canonicalPackage.records
  .map(record => record.freshness?.updatedAt || record.freshness?.lastReviewedAt || record.freshness?.createdAt)
  .filter(Boolean)
  .sort()
  .at(-1) || '1970-01-01T00:00:00.000Z';
const tierPackages = {};
const recordFieldPaths = {};
const errors = [];

for (const tier of tierOrder) {
  const tierIndex = tierOrder.indexOf(tier);
  const tierInfo = policy.tiers[tier];
  const records = canonicalPackage.records.map(record => {
    const fieldPaths = new Set(forcedPublicPaths);
    for (let index = 0; index <= tierIndex; index += 1) {
      const includedTier = tierOrder[index];
      for (const fieldPath of policy.tiers[includedTier]?.defaultFields || []) fieldPaths.add(fieldPath);
      for (const fieldPath of record.access?.[accessFieldKeys[includedTier]] || []) fieldPaths.add(fieldPath);
    }
    const projected = projectRecord(record, [...fieldPaths]);
    recordFieldPaths[record.id] ||= {};
    recordFieldPaths[record.id][tier] = [...fieldPaths].sort();
    if (!projected.id || projected.id !== record.id) errors.push(`${tier}/${record.id}: canonical id missing or changed`);
    for (const mandatoryPath of policy.mandatoryPublicSafetyFields || []) {
      if (!meaningful(getPath(projected, mandatoryPath))) errors.push(`${tier}/${record.id}: mandatory public safety field missing: ${mandatoryPath}`);
    }
    if (getPath(projected, 'counterAnalysis.contradictoryEvidence') === undefined) {
      errors.push(`${tier}/${record.id}: contradictory-evidence field is not publicly projected`);
    }
    return projected;
  });

  tierPackages[tier] = {
    ok: true,
    mode: 'preview-only',
    schemaVersion: canonicalPackage.schemaVersion,
    tier,
    label: tierInfo.label,
    priceEurMonthly: tierInfo.priceEurMonthly,
    requiresAccount: tierInfo.requiresAccount,
    paymentStatus: policy.paymentStatus,
    enforcementMode: policy.enforcementMode,
    generatedAt: projectionTimestamp,
    canonicalRecordCount: canonicalPackage.recordCount,
    recordCount: records.length,
    boundary: 'This is a deterministic field projection from the canonical intelligence layer. It does not enforce access, publish pages, send email, activate authentication, grant entitlements or take payment.',
    records
  };
}

for (const record of canonicalPackage.records) {
  for (let index = 0; index < tierOrder.length - 1; index += 1) {
    const lowerTier = tierOrder[index];
    const higherTier = tierOrder[index + 1];
    const lowerRecord = tierPackages[lowerTier].records.find(item => item.id === record.id);
    const higherRecord = tierPackages[higherTier].records.find(item => item.id === record.id);
    if (!isStructuralSubset(lowerRecord, higherRecord)) errors.push(`${record.id}: ${lowerTier} is not a structural subset of ${higherTier}`);
  }
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const tierSummary = {};
for (const tier of tierOrder) {
  const json = stableJson(tierPackages[tier]);
  const ndjson = tierPackages[tier].records.map(record => JSON.stringify(record)).join('\n') + '\n';
  fs.writeFileSync(path.join(outputDir, `${tier}.json`), json);
  fs.writeFileSync(path.join(outputDir, `${tier}.ndjson`), ndjson);
  const counts = tierPackages[tier].records.map(leafCount);
  tierSummary[tier] = {
    recordCount: tierPackages[tier].recordCount,
    jsonSha256: sha256(json),
    ndjsonSha256: sha256(ndjson),
    minimumLeafFields: Math.min(...counts),
    maximumLeafFields: Math.max(...counts),
    averageLeafFields: Math.round((counts.reduce((sum, count) => sum + count, 0) / counts.length) * 100) / 100
  };
}

const manifest = {
  ok: errors.length === 0,
  mode: 'preview-only',
  version: '1.0.0',
  generatedAt: projectionTimestamp,
  sourceBundleGeneratedAt: projectionTimestamp,
  paymentStatus: policy.paymentStatus,
  enforcementMode: policy.enforcementMode,
  canonicalRecordCount: canonicalPackage.recordCount,
  rawProjectionCount: canonicalPackage.rawProjectionCount,
  tierOrder,
  mandatoryPublicSafetyFields: policy.mandatoryPublicSafetyFields,
  forcedPublicPaths,
  neverPaywall: policy.neverPaywall,
  tierSummary,
  errors,
  boundary: 'Phase 2 tier projections are CI artifacts only. Existing pages, routes, Workers, databases, authentication, memberships, email systems, entitlements and payments remain unchanged.',
  activationBoundary: policy.activationConditions
};
fs.writeFileSync(path.join(outputDir, 'projection-manifest.json'), stableJson(manifest));
fs.writeFileSync(path.join(outputDir, 'record-field-paths.json'), stableJson(recordFieldPaths));

const samples = tierPackages.public.records.slice(0, 12);
const rows = samples.map(record => {
  const full = tierPackages.research_pro_9.records.find(item => item.id === record.id);
  return `<tr><td>${escapeHtml(record.title)}</td><td>${escapeHtml(record.recordType)}</td><td>${escapeHtml(record.evidence?.claimClass)}</td><td>${escapeHtml(record.solidConclusion?.confidence)}</td><td>${leafCount(record)}</td><td>${leafCount(full)}</td></tr>`;
}).join('');
const tierCards = tierOrder.map(tier => {
  const item = tierSummary[tier];
  const info = policy.tiers[tier];
  return `<section><h2>${escapeHtml(info.label)}</h2><p>${item.recordCount} records · average ${item.averageLeafFields} visible leaf values</p><code>${escapeHtml(item.jsonSha256)}</code></section>`;
}).join('');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phase 2 Tier Projection Preview</title><style>body{font-family:system-ui,sans-serif;max-width:1180px;margin:40px auto;padding:0 20px;background:#0d1015;color:#edf1f7}section{border:1px solid #303744;border-radius:12px;padding:18px;margin:14px 0;background:#151a22}code{overflow-wrap:anywhere;color:#a8d5ff}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;border-bottom:1px solid #303744;padding:10px}strong{color:#fff}.boundary{border-left:4px solid #d6a64b;padding-left:14px;color:#d9dee8}</style></head><body><h1>Canonical Publishing Preview</h1><p class="boundary">Preview only. No page, dashboard, email, account, entitlement or payment behaviour is active.</p><p><strong>${canonicalPackage.recordCount}</strong> canonical records projected cumulatively across five tiers.</p>${tierCards}<h2>Representative records</h2><table><thead><tr><th>Title</th><th>Type</th><th>Claim class</th><th>Conclusion confidence</th><th>Public leaves</th><th>Research Pro leaves</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
fs.writeFileSync(path.join(outputDir, 'preview.html'), html);

console.log(`PHASE 2 TIER PROJECTIONS: ${canonicalPackage.recordCount} canonical records across ${tierOrder.length} cumulative tiers.`);
console.log(`Output: ${path.relative(root, outputDir)}`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
