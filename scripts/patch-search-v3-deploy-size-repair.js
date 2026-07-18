const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'scripts', 'build-search-v3-runtime.js');
const reportPath = path.join(root, 'downloads', 'search-v3-deploy-size-repair.json');
if (!fs.existsSync(target)) throw new Error('scripts/build-search-v3-runtime.js is missing');

let source = fs.readFileSync(target, 'utf8');
const before = source;

// The final profile must always be the smallest candidate because the adaptive
// loop retains the last attempted profile when no candidate reaches the 20 MiB
// target. Older versions appended a larger deployment profile after the
// emergency profile and could therefore turn a deployable result into a failure.
const profileMatch = source.match(/const compactionProfiles = \[[\s\S]*?\n\];/);
if (!profileMatch) throw new Error('Search V3 compaction profile block is missing');
let profileBlock = profileMatch[0]
  .replace(/^\s*\{ id: 'deployment-safe',[^\r\n]*\},?\s*$/m, '')
  .replace(/,\s*\n\s*\n/g, ',\n');
const close = profileBlock.lastIndexOf('\n];');
if (close < 0) throw new Error('Search V3 compaction profile closing marker is missing');
const body = profileBlock.slice(0, close).trimEnd().replace(/,+$/, '');
const deploymentSafeProfile = "  { id: 'deployment-safe', title: 84, description: 0, listItems: 3, listChars: 18, scalar: 30, sourceUrl: 100, sparseDefaults: true, mergeTerms: true, termItems: 4 }";
profileBlock = `${body},\n${deploymentSafeProfile}\n];`;
source = source.replace(profileMatch[0], profileBlock);

// Sparse records must still retain the normalized metadata contract used by
// ranking, filtering, quality tests and downstream machine consumers. These
// short fields add modest payload but keep the refreshed index under the guard.
const requiredMetadataMarker = '// search-v3-required-metadata-v1';
if (source.includes('const sparse = profile.sparseDefaults === true;') && !source.includes(requiredMetadataMarker)) {
  const sparseMetadataPattern = /  const output = \{[\s\S]*?  else if \(!sparse\) output\.primarySource = false;\n/;
  if (!sparseMetadataPattern.test(source)) throw new Error('Search V3 sparse metadata block is missing');
  source = source.replace(sparseMetadataPattern, `  ${requiredMetadataMarker}\n  const output = {\n    searchVersion: 3,\n    title: bounded(record.title || url, profile.title),\n    url,\n    sourceType,\n    resultKind,\n    statusClass,\n    primarySource\n  };\n`);
}

// Search only needs one sortable browser date. The sparse compactor already
// keeps the best available date; retain compatibility with older builders.
const sparseDateMarker = 'const bestDate = bounded(record.date || record.publicationDate || record.retrievalDate, 40);';
const browserDateMarker = 'const browserDate = bounded(record.date || record.publicationDate || record.retrievalDate, 40);';
if (!source.includes(sparseDateMarker) && !source.includes(browserDateMarker)) {
  const dateLoop = /  for \(const field of \['date', 'publicationDate', 'retrievalDate'\]\) \{[\s\S]*?\n  \}\n/;
  if (!dateLoop.test(source)) throw new Error('Search V3 date compaction block is missing');
  source = source.replace(dateLoop, `  ${browserDateMarker}\n  if (browserDate) output.date = browserDate;\n`);
}

// The current sparse compactor retains external source links for primary,
// official, court, government, regulator and Grade A/B records. Older builders
// are reduced to primary-source links only. Both strategies preserve every
// internal searchable URL.
const sparseSourcePolicy = source.includes('const keepSourceUrl =')
  && source.includes('sourceUrl.slice(0, Number(profile.sourceUrl || 320))');
const legacyDesiredSourceLine = "  if (output.primarySource === true && /^https?:/i.test(sourceUrl)) output.sourceUrl = sourceUrl.slice(0, Math.min(500, Number(profile.sourceUrl || 320)));";
if (!sparseSourcePolicy && !source.includes(legacyDesiredSourceLine)) {
  const alternatives = [
    "  if (/^https?:/i.test(sourceUrl)) output.sourceUrl = sourceUrl.slice(0, Number(profile.sourceUrl || 320));",
    "  if (/^https?:/i.test(sourceUrl)) output.sourceUrl = sourceUrl.slice(0, 1000);",
    "  if (output.primarySource === true && /^https?:/i.test(sourceUrl)) output.sourceUrl = sourceUrl.slice(0, 500);"
  ];
  const matched = alternatives.find(line => source.includes(line));
  if (!matched) throw new Error('Search V3 source URL compaction block is missing');
  source = source.replace(matched, legacyDesiredSourceLine);
}

const datePolicyOk = source.includes(sparseDateMarker) || source.includes(browserDateMarker);
const sourcePolicyOk = (source.includes('const keepSourceUrl =') && source.includes('sourceUrl.slice(0, Number(profile.sourceUrl || 320))'))
  || source.includes(legacyDesiredSourceLine);
for (const [label, ok] of [
  ['strict final deployment profile', source.includes("id: 'deployment-safe'") && source.includes('termItems: 4') && source.includes('sourceUrl: 100')],
  ['normalized metadata contract', source.includes(requiredMetadataMarker) && source.includes('searchVersion: 3') && source.includes('sourceType,') && source.includes('resultKind,') && source.includes('statusClass,') && source.includes('primarySource')],
  ['single browser date policy', datePolicyOk],
  ['bounded external source policy', sourcePolicyOk]
]) {
  if (!ok) throw new Error(`Search V3 deploy-size marker missing: ${label}`);
}

if (source !== before) fs.writeFileSync(target, source);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: source !== before,
  owner: 'patch-search-v3-compaction-headroom.js profiles plus this compatibility guard',
  requiredMetadata: ['searchVersion', 'sourceType', 'resultKind', 'statusClass', 'primarySource'],
  finalProfile: {
    id: 'deployment-safe',
    title: 84,
    description: 0,
    listItems: 3,
    listChars: 18,
    scalar: 30,
    sourceUrl: 100,
    sparseDefaults: true,
    mergeTerms: true,
    termItems: 4
  },
  strategy: 'Preserve every searchable internal URL and required normalized metadata, consolidate duplicate routes, merge equivalent terms, keep one browser date and retain bounded direct sources for primary or high-authority records.',
  boundary: 'Complete source URLs and unabridged metadata remain available on linked result pages, registries, the evidence network and document library.'
}, null, 2)}\n`);
console.log(`Search V3 deploy-size repair ${source !== before ? 'installed' : 'already current'} with required metadata and the strictest profile last.`);
