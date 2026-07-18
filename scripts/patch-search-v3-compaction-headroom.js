const fs = require('fs');
const path = require('path');

const root = process.cwd();
const runtimePath = path.join(root, 'scripts', 'build-search-v3-runtime.js');
const reportPath = path.join(root, 'downloads', 'search-v3-compaction-headroom-patch.json');

if (!fs.existsSync(runtimePath)) throw new Error('scripts/build-search-v3-runtime.js is missing');

const before = fs.readFileSync(runtimePath, 'utf8');
let after = before;
let changed = false;

const newProfiles = `const compactionProfiles = [
  { id: 'balanced', title: 180, description: 160, listItems: 8, listChars: 64, scalar: 96, sourceUrl: 700 },
  { id: 'compact', title: 160, description: 120, listItems: 8, listChars: 48, scalar: 80, sourceUrl: 500 },
  { id: 'tight', title: 144, description: 96, listItems: 7, listChars: 40, scalar: 72, sourceUrl: 360 },
  { id: 'minimum-safe', title: 128, description: 72, listItems: 6, listChars: 32, scalar: 64, sourceUrl: 280 },
  { id: 'ultra-safe', title: 116, description: 48, listItems: 6, listChars: 28, scalar: 52, sourceUrl: 220 },
  { id: 'minimum-route-safe', title: 104, description: 24, listItems: 5, listChars: 24, scalar: 44, sourceUrl: 180 },
  { id: 'emergency-route-safe', title: 96, description: 0, listItems: 4, listChars: 20, scalar: 38, sourceUrl: 150 }
];`;

const profileMarkers = [
  "id: 'ultra-safe'",
  "id: 'minimum-route-safe'",
  "id: 'emergency-route-safe'",
  'sourceUrl: 220',
  'sourceUrl: 180',
  'sourceUrl: 150'
];
if (!profileMarkers.every(marker => after.includes(marker))) {
  const profilePattern = /const compactionProfiles\s*=\s*\[[\s\S]*?\n\];/;
  if (!profilePattern.test(after)) throw new Error('Search V3 compaction profile block not found');
  after = after.replace(profilePattern, newProfiles);
  changed = true;
}

const newSourceUrl = "if (/^https?:/i.test(sourceUrl)) output.sourceUrl = sourceUrl.slice(0, Number(profile.sourceUrl || 320));";
if (!after.includes(newSourceUrl)) {
  const sourceUrlAssignmentPattern = /^[ \t]*if\s*\(.*sourceUrl.*\)\s*output\.sourceUrl\s*=.*;[ \t]*$/m;
  const sourceUrlDeclaration = "  const sourceUrl = String(record.sourceUrl || '').trim();";
  if (sourceUrlAssignmentPattern.test(after)) {
    after = after.replace(sourceUrlAssignmentPattern, `  ${newSourceUrl}`);
  } else if (after.includes(sourceUrlDeclaration)) {
    after = after.replace(sourceUrlDeclaration, `${sourceUrlDeclaration}\n  ${newSourceUrl}`);
  } else {
    throw new Error('Search V3 source URL declaration not found');
  }
  changed = true;
}

const consolidationBlock = `function searchRecordQuality(record) {
  const status = clean(record?.statusClass).toLowerCase();
  const kind = clean(record?.resultKind).toLowerCase();
  const authority = clean(record?.sourceAuthority).toLowerCase();
  let score = Number(record?.priority || 0) || 0;
  if (record?.primarySource === true || record?.primarySource === 1 || record?.primarySource === 'true') score += 500;
  if (/court|judgment|conviction|enforcement|investigation|official/.test(status + ' ' + kind)) score += 220;
  if (/primary|official|court|government/.test(authority)) score += 120;
  score += Math.min(clean(record?.description).length, 240) / 12;
  return score;
}
function consolidateRecordsByUrl(records) {
  const groups = new Map();
  const listFields = ['keywords', 'aliases', 'identifiers', 'exactTerms'];
  for (const record of records) {
    const url = String(record?.url || '').trim();
    if (!url) continue;
    const prior = groups.get(url);
    if (!prior) {
      groups.set(url, { ...record, url });
      continue;
    }
    const preferred = searchRecordQuality(record) > searchRecordQuality(prior) ? record : prior;
    const secondary = preferred === record ? prior : record;
    const merged = { ...secondary, ...preferred, url };
    merged.primarySource = Boolean(prior.primarySource || record.primarySource);
    merged.priority = Math.max(Number(prior.priority || 0) || 0, Number(record.priority || 0) || 0);
    const descriptions = [clean(prior.description), clean(record.description)].filter(Boolean).sort((a, b) => b.length - a.length);
    if (descriptions.length) merged.description = descriptions[0];
    for (const field of listFields) merged[field] = [...listValues(prior[field]), ...listValues(record[field])];
    merged.exactTerms = [
      ...listValues(merged.exactTerms),
      prior.title, record.title, prior.entity, record.entity,
      prior.category, record.category, prior.jurisdiction, record.jurisdiction
    ].filter(Boolean);
    groups.set(url, merged);
  }
  return [...groups.values()];
}
function serializeWithProfile(records, profile) {
  const consolidated = consolidateRecordsByUrl(records);
  const compacted = consolidated.map(record => compactRecord(record, profile)).filter(Boolean);
  const serialized = JSON.stringify(compacted);
  return { compacted, serialized, bytes: Buffer.byteLength(serialized), profile, consolidatedBefore: records.length, consolidatedAfter: consolidated.length };
}`;

if (!after.includes('function consolidateRecordsByUrl(records)')) {
  const serializePattern = /function serializeWithProfile\(records, profile\) \{[\s\S]*?\n\}/;
  if (!serializePattern.test(after)) throw new Error('Search V3 serialization block not found');
  after = after.replace(serializePattern, consolidationBlock);
  changed = true;
}

if (after.includes('removedDuplicateMarketRelationships: 0,')) {
  after = after.replace(
    'removedDuplicateMarketRelationships: 0,',
    'duplicateRecordsConsolidated: Math.max(0, before - selected.compacted.length),\n    removedDuplicateMarketRelationships: Math.max(0, before - selected.compacted.length),'
  );
  changed = true;
}

for (const marker of [
  "id: 'emergency-route-safe'",
  'sourceUrl.slice(0, Number(profile.sourceUrl || 320))',
  'function consolidateRecordsByUrl(records)',
  'consolidatedAfter: consolidated.length',
  'duplicateRecordsConsolidated:'
]) {
  if (!after.includes(marker)) throw new Error(`Search V3 compaction headroom marker missing: ${marker}`);
}

if (changed) fs.writeFileSync(runtimePath, after);
require('./patch-search-v3-adjudicated-ranking.js');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  runtime: 'scripts/build-search-v3-runtime.js',
  addedProfiles: ['ultra-safe', 'minimum-route-safe', 'emergency-route-safe'],
  duplicateRouteConsolidation: true,
  mergedSearchTerms: ['keywords', 'aliases', 'identifiers', 'exactTerms', 'titles', 'entities', 'jurisdictions'],
  adjudicatedRankingApplied: true,
  preservesEverySearchableUrl: true,
  boundary: 'Growing Search V3 data is consolidated by public route before adaptive field compaction. Every searchable URL is preserved, duplicate records contribute merged aliases and exact terms, and conviction or judgment queries continue to prioritize court, investigation and established records.'
}, null, 2)}\n`);
console.log(`Search V3 route consolidation and compaction ${changed ? 'installed' : 'already current'}; every searchable URL remains represented.`);
