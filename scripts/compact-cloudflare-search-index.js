const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, '_site', 'search-index.json');
const reportPath = path.join(root, 'downloads', 'cloudflare-search-index-compaction.json');
const maxBytes = 24 * 1024 * 1024;

function text(value, limit = 1000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function list(value, limit, itemLimit = 180) {
  const source = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const normalized = text(typeof item === 'object' ? Object.values(item || {}).join(' ') : item, itemLimit);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

function compactItem(item, limits) {
  if (!item || typeof item !== 'object') return null;
  const compact = {
    url: text(item.url, 1200),
    title: text(item.title, 320),
    category: text(item.category, 180),
    layer: text(item.layer, 120),
    description: text(item.description, limits.description),
    keywords: list(item.keywords, limits.keywords, 120),
    aliases: list(item.aliases, limits.aliases, 160),
    identifiers: list(item.identifiers, limits.identifiers, 180),
    exactTerms: list(item.exactTerms, limits.exactTerms, 180),
    sourceType: text(item.sourceType, 120),
    resultKind: text(item.resultKind, 80),
    sourceAuthority: text(item.sourceAuthority, 120),
    evidenceGrade: text(item.evidenceGrade, 8),
    factualStatus: text(item.factualStatus, 220),
    statusClass: text(item.statusClass, 80),
    reviewStatus: text(item.reviewStatus, 120),
    jurisdiction: text(item.jurisdiction, 120),
    entityType: text(item.entityType, 160),
    entity: text(item.entity, 320),
    sourceUrl: text(item.sourceUrl, 1600),
    publicationDate: text(item.publicationDate, 40),
    retrievalDate: text(item.retrievalDate, 40),
    date: text(item.date, 40),
    priority: Number(item.priority || 0)
  };
  if (item.primarySource) compact.primarySource = true;
  for (const [key, value] of Object.entries(compact)) {
    if (value === '' || value === 0 || (Array.isArray(value) && value.length === 0)) delete compact[key];
  }
  return compact.url && compact.title ? compact : null;
}

function build(index, limits) {
  return index.map(item => compactItem(item, limits)).filter(Boolean);
}

if (!fs.existsSync(target)) throw new Error('_site/search-index.json is missing; build Cloudflare output first.');
const beforeBytes = fs.statSync(target).size;
let source;
try {
  source = JSON.parse(fs.readFileSync(target, 'utf8'));
} catch (error) {
  throw new Error(`Cloudflare search index is invalid JSON: ${error.message}`);
}
if (!Array.isArray(source)) throw new Error('Cloudflare search index must be an array.');

const profiles = [
  { name: 'full-runtime', description: 800, keywords: 180, aliases: 50, identifiers: 50, exactTerms: 70 },
  { name: 'balanced-runtime', description: 600, keywords: 120, aliases: 35, identifiers: 35, exactTerms: 50 },
  { name: 'tight-runtime', description: 420, keywords: 80, aliases: 24, identifiers: 24, exactTerms: 32 }
];

let chosen = null;
let payload = '';
let compacted = [];
for (const profile of profiles) {
  compacted = build(source, profile);
  payload = JSON.stringify(compacted);
  if (Buffer.byteLength(payload) <= maxBytes) {
    chosen = profile;
    break;
  }
}
if (!chosen) {
  const bytes = Buffer.byteLength(payload);
  throw new Error(`Compact Cloudflare search index remains oversized: ${(bytes / 1024 / 1024).toFixed(2)} MiB.`);
}

fs.writeFileSync(target, payload);
const afterBytes = fs.statSync(target).size;
const report = {
  ok: afterBytes <= maxBytes,
  generatedAt: new Date().toISOString(),
  target: '_site/search-index.json',
  entriesBefore: source.length,
  entriesAfter: compacted.length,
  profile: chosen.name,
  beforeBytes,
  afterBytes,
  beforeMiB: Number((beforeBytes / 1024 / 1024).toFixed(2)),
  afterMiB: Number((afterBytes / 1024 / 1024).toFixed(2)),
  cloudflareLimitMiB: 25,
  enforcedMaximumMiB: 24,
  preservedRuntimeFields: ['url','title','category','layer','description','keywords','aliases','identifiers','exactTerms','sourceType','resultKind','sourceAuthority','primarySource','evidenceGrade','factualStatus','statusClass','reviewStatus','jurisdiction','entityType','entity','sourceUrl','publicationDate','retrievalDate','date','priority'],
  boundary: 'The complete research index remains in the repository. Only the deployable browser copy is compacted, preserving every field used by Search V3 while excluding generator-only metadata.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error('Cloudflare search index compaction failed its size boundary.');
console.log(`Cloudflare search index compacted: ${report.entriesAfter} entries, ${report.beforeMiB} MiB -> ${report.afterMiB} MiB (${report.profile}).`);
