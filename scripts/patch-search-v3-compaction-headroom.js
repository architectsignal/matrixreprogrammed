const fs = require('fs');
const path = require('path');

const root = process.cwd();
const runtimePath = path.join(root, 'scripts', 'build-search-v3-runtime.js');
const reportPath = path.join(root, 'downloads', 'search-v3-compaction-headroom-patch.json');

if (!fs.existsSync(runtimePath)) throw new Error('scripts/build-search-v3-runtime.js is missing');

const before = fs.readFileSync(runtimePath, 'utf8');
let after = before;
let changed = false;

const oldProfiles = `const compactionProfiles = [
  { id: 'balanced', title: 180, description: 160, listItems: 8, listChars: 64, scalar: 96 },
  { id: 'compact', title: 160, description: 120, listItems: 6, listChars: 48, scalar: 80 },
  { id: 'tight', title: 144, description: 96, listItems: 5, listChars: 40, scalar: 72 },
  { id: 'minimum-safe', title: 128, description: 72, listItems: 4, listChars: 32, scalar: 64 }
];`;
const newProfiles = `const compactionProfiles = [
  { id: 'balanced', title: 180, description: 160, listItems: 8, listChars: 64, scalar: 96, sourceUrl: 700 },
  { id: 'compact', title: 160, description: 120, listItems: 6, listChars: 48, scalar: 80, sourceUrl: 500 },
  { id: 'tight', title: 144, description: 96, listItems: 5, listChars: 40, scalar: 72, sourceUrl: 360 },
  { id: 'minimum-safe', title: 128, description: 72, listItems: 4, listChars: 32, scalar: 64, sourceUrl: 280 },
  { id: 'ultra-safe', title: 116, description: 48, listItems: 3, listChars: 24, scalar: 52, sourceUrl: 220 },
  { id: 'minimum-route-safe', title: 104, description: 24, listItems: 2, listChars: 20, scalar: 44, sourceUrl: 180 }
];`;

if (!after.includes(newProfiles)) {
  if (!after.includes(oldProfiles)) throw new Error('Search V3 compaction profile block not found');
  after = after.replace(oldProfiles, newProfiles);
  changed = true;
}

const oldSourceUrl = "if (/^https?:/i.test(sourceUrl)) output.sourceUrl = sourceUrl.slice(0, 1000);";
const newSourceUrl = "if (/^https?:/i.test(sourceUrl)) output.sourceUrl = sourceUrl.slice(0, Number(profile.sourceUrl || 320));";
if (!after.includes(newSourceUrl)) {
  if (!after.includes(oldSourceUrl)) throw new Error('Search V3 source URL compaction target not found');
  after = after.replace(oldSourceUrl, newSourceUrl);
  changed = true;
}

for (const marker of [
  "id: 'ultra-safe'",
  "id: 'minimum-route-safe'",
  'sourceUrl.slice(0, Number(profile.sourceUrl || 320))'
]) {
  if (!after.includes(marker)) throw new Error(`Search V3 compaction headroom marker missing: ${marker}`);
}

if (changed) fs.writeFileSync(runtimePath, after);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  runtime: 'scripts/build-search-v3-runtime.js',
  addedProfiles: ['ultra-safe', 'minimum-route-safe'],
  preservesEverySearchableUrl: true,
  boundary: 'Growing Search V3 data is compacted by bounding display metadata and long source URLs. No searchable route is removed; complete evidence remains on source pages, registries, graphs and documents.'
}, null, 2)}\n`);
console.log(`Search V3 compaction headroom ${changed ? 'installed' : 'already current'}.`);
