const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'scripts', 'build-search-v3-runtime.js');
const reportPath = path.join(root, 'downloads', 'search-v3-deploy-size-repair.json');
if (!fs.existsSync(target)) throw new Error('scripts/build-search-v3-runtime.js is missing');

let source = fs.readFileSync(target, 'utf8');
const before = source;

const profileAnchor = "  { id: 'minimum-safe', title: 128, description: 72, listItems: 4, listChars: 32, scalar: 64 }\n];";
const profileReplacement = "  { id: 'minimum-safe', title: 128, description: 72, listItems: 4, listChars: 32, scalar: 64 },\n  { id: 'deployment-safe', title: 120, description: 64, listItems: 3, listChars: 28, scalar: 56 }\n];";
if (!source.includes("id: 'deployment-safe'")) {
  if (!source.includes(profileAnchor)) throw new Error('Search V3 compaction profile anchor is missing');
  source = source.replace(profileAnchor, profileReplacement);
}

const dateAnchor = `  for (const field of ['date', 'publicationDate', 'retrievalDate']) {
    const value = bounded(record[field], 40);
    if (value) output[field] = value;
  }
  const sourceUrl = String(record.sourceUrl || '').trim();
  if (/^https?:/i.test(sourceUrl)) output.sourceUrl = sourceUrl.slice(0, 1000);`;
const dateReplacement = `  const browserDate = bounded(record.date || record.publicationDate || record.retrievalDate, 40);
  if (browserDate) output.date = browserDate;
  const sourceUrl = String(record.sourceUrl || '').trim();
  if (output.primarySource === true && /^https?:/i.test(sourceUrl)) output.sourceUrl = sourceUrl.slice(0, 500);`;
if (!source.includes('const browserDate = bounded(record.date || record.publicationDate || record.retrievalDate, 40);')) {
  if (!source.includes(dateAnchor)) throw new Error('Search V3 date/source compaction anchor is missing');
  source = source.replace(dateAnchor, dateReplacement);
}

for (const marker of [
  "id: 'deployment-safe'",
  'const browserDate = bounded(record.date || record.publicationDate || record.retrievalDate, 40);',
  'output.primarySource === true',
  'sourceUrl.slice(0, 500)'
]) {
  if (!source.includes(marker)) throw new Error(`Search V3 deploy-size marker missing: ${marker}`);
}

if (source !== before) fs.writeFileSync(target, source);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: source !== before,
  strategy: 'Preserve every searchable result URL and evidence filter while collapsing duplicate date fields and retaining direct source URLs only for primary-source results.',
  boundary: 'Complete source URLs and unabridged metadata remain available on the linked result pages, registries, evidence network and document library.'
}, null, 2)}\n`);
console.log(`Search V3 deploy-size repair ${source !== before ? 'installed' : 'already current'}.`);
