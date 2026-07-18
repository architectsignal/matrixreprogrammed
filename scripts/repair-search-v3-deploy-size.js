const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'scripts', 'build-search-v3-runtime.js');
const reportPath = path.join(root, 'downloads', 'search-v3-deploy-size-repair.json');
if (!fs.existsSync(target)) throw new Error('scripts/build-search-v3-runtime.js is missing');

let source = fs.readFileSync(target, 'utf8');
const before = source;

if (!source.includes("id: 'deployment-safe'")) {
  const profileMatch = source.match(/const compactionProfiles = \[[\s\S]*?\n\];/);
  if (!profileMatch) throw new Error('Search V3 compaction profile block is missing');
  const block = profileMatch[0];
  const close = block.lastIndexOf('\n];');
  const body = block.slice(0, close).trimEnd();
  const separator = body.endsWith(',') ? '\n' : ',\n';
  const replacement = `${body}${separator}  { id: 'deployment-safe', title: 120, description: 64, listItems: 3, listChars: 28, scalar: 56 }\n];`;
  source = source.replace(block, replacement);
}

const browserDateMarker = 'const browserDate = bounded(record.date || record.publicationDate || record.retrievalDate, 40);';
if (!source.includes(browserDateMarker)) {
  const dateLoop = /  for \(const field of \['date', 'publicationDate', 'retrievalDate'\]\) \{[\s\S]*?\n  \}\n/;
  if (!dateLoop.test(source)) throw new Error('Search V3 date compaction block is missing');
  source = source.replace(dateLoop, `  const browserDate = bounded(record.date || record.publicationDate || record.retrievalDate, 40);\n  if (browserDate) output.date = browserDate;\n`);
}

const sourceBlock = /  const sourceUrl = String\(record\.sourceUrl \|\| ''\)\.trim\(\);\n  if \([^\n]*\) output\.sourceUrl = sourceUrl\.slice\(0,\s*\d+\);/;
const sourceReplacement = `  const sourceUrl = String(record.sourceUrl || '').trim();\n  if (output.primarySource === true && /^https?:/i.test(sourceUrl)) output.sourceUrl = sourceUrl.slice(0, 500);`;
if (!source.includes('output.primarySource === true') || !source.includes('sourceUrl.slice(0, 500)')) {
  if (!sourceBlock.test(source)) throw new Error('Search V3 source URL compaction block is missing');
  source = source.replace(sourceBlock, sourceReplacement);
}

for (const marker of [
  "id: 'deployment-safe'",
  browserDateMarker,
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
