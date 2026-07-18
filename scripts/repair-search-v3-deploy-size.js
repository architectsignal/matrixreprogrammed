const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'scripts', 'build-search-v3-runtime.js');
const reportPath = path.join(root, 'downloads', 'search-v3-deploy-size-repair.json');
if (!fs.existsSync(target)) throw new Error('scripts/build-search-v3-runtime.js is missing');

let source = fs.readFileSync(target, 'utf8');
const before = source;

// Preserve the existing headroom profiles as the authoritative compaction
// system, while adding one final profile if an older build lacks it.
if (!source.includes("id: 'deployment-safe'")) {
  const profileMatch = source.match(/const compactionProfiles = \[[\s\S]*?\n\];/);
  if (!profileMatch) throw new Error('Search V3 compaction profile block is missing');
  const block = profileMatch[0];
  const close = block.lastIndexOf('\n];');
  const body = block.slice(0, close).trimEnd();
  const separator = body.endsWith(',') ? '\n' : ',\n';
  const replacement = `${body}${separator}  { id: 'deployment-safe', title: 120, description: 64, listItems: 3, listChars: 28, scalar: 56, sourceUrl: 180 }\n];`;
  source = source.replace(block, replacement);
}

// Search only needs one sortable browser date. The full publication and
// retrieval dates remain on the linked records and registries.
const browserDateMarker = 'const browserDate = bounded(record.date || record.publicationDate || record.retrievalDate, 40);';
if (!source.includes(browserDateMarker)) {
  const dateLoop = /  for \(const field of \['date', 'publicationDate', 'retrievalDate'\]\) \{[\s\S]*?\n  \}\n/;
  if (!dateLoop.test(source)) throw new Error('Search V3 date compaction block is missing');
  source = source.replace(dateLoop, `  const browserDate = bounded(record.date || record.publicationDate || record.retrievalDate, 40);\n  if (browserDate) output.date = browserDate;\n`);
}

// Keep direct external source links only for primary-source results. Every
// searchable internal URL is preserved, and secondary records still link to
// their complete site page, registry entry or document route.
const desiredSourceLine = "  if (output.primarySource === true && /^https?:/i.test(sourceUrl)) output.sourceUrl = sourceUrl.slice(0, Math.min(500, Number(profile.sourceUrl || 320)));";
if (!source.includes(desiredSourceLine)) {
  const alternatives = [
    "  if (/^https?:/i.test(sourceUrl)) output.sourceUrl = sourceUrl.slice(0, Number(profile.sourceUrl || 320));",
    "  if (/^https?:/i.test(sourceUrl)) output.sourceUrl = sourceUrl.slice(0, 1000);",
    "  if (output.primarySource === true && /^https?:/i.test(sourceUrl)) output.sourceUrl = sourceUrl.slice(0, 500);"
  ];
  const matched = alternatives.find(line => source.includes(line));
  if (!matched) throw new Error('Search V3 source URL compaction block is missing');
  source = source.replace(matched, desiredSourceLine);
}

for (const marker of [
  "id: 'deployment-safe'",
  browserDateMarker,
  'output.primarySource === true',
  'Math.min(500, Number(profile.sourceUrl || 320))'
]) {
  if (!source.includes(marker)) throw new Error(`Search V3 deploy-size marker missing: ${marker}`);
}

if (source !== before) fs.writeFileSync(target, source);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: source !== before,
  owner: 'patch-search-v3-compaction-headroom.js profiles plus this compatibility guard',
  strategy: 'Preserve every searchable result URL and evidence filter while collapsing duplicate date fields and retaining direct external source URLs only for primary-source results.',
  boundary: 'Complete source URLs and unabridged metadata remain available on the linked result pages, registries, evidence network and document library.'
}, null, 2)}\n`);
console.log(`Search V3 deploy-size repair ${source !== before ? 'installed' : 'already current'}.`);
