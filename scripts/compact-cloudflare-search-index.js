const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcePath = path.join(root, 'search-index.json');
const sitePath = path.join(root, '_site', 'search-index.json');
const facetsPath = path.join(root, 'data', 'search-facets.json');
const siteFacetsPath = path.join(root, '_site', 'data', 'search-facets.json');
const reportPath = path.join(root, 'downloads', 'cloudflare-search-index-compaction.json');
const targetBytes = 20 * 1024 * 1024;

function text(value, limit = 1000) {
  return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}
function values(value) {
  const source = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  const out = [];
  for (const item of source) {
    if (item && typeof item === 'object') out.push(...Object.values(item));
    else out.push(item);
  }
  return out;
}
function uniqueList(input, limit, itemLimit) {
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    const normalized = text(raw, itemLimit);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}
function quality(item) {
  let score = Number(item?.priority || 0) || 0;
  if (item?.primarySource === true || item?.primarySource === 1 || item?.primarySource === 'true') score += 500;
  if (/official|court|judgment|enforcement|investigation/i.test(`${item?.statusClass || ''} ${item?.resultKind || ''}`)) score += 220;
  if (/primary|official|court|government|regulator/i.test(item?.sourceAuthority || '')) score += 140;
  score += Math.min(text(item?.description, 400).length, 240) / 12;
  return score;
}
function consolidate(index) {
  const groups = new Map();
  for (const item of index) {
    const url = String(item?.url || '').trim();
    if (!url) continue;
    const prior = groups.get(url);
    if (!prior) {
      groups.set(url, { ...item, url, __terms: [] });
      continue;
    }
    const preferred = quality(item) > quality(prior) ? item : prior;
    const secondary = preferred === item ? prior : item;
    const merged = { ...secondary, ...preferred, url };
    merged.primarySource = Boolean(prior.primarySource || item.primarySource);
    merged.priority = Math.max(Number(prior.priority || 0) || 0, Number(item.priority || 0) || 0);
    const descriptions = [text(prior.description, 1000), text(item.description, 1000)].filter(Boolean).sort((a, b) => b.length - a.length);
    if (descriptions.length) merged.description = descriptions[0];
    merged.__terms = [
      ...values(prior.__terms), ...values(item.__terms),
      ...values(prior.keywords), ...values(item.keywords),
      ...values(prior.aliases), ...values(item.aliases),
      ...values(prior.identifiers), ...values(item.identifiers),
      ...values(prior.exactTerms), ...values(item.exactTerms),
      prior.title, item.title, prior.entity, item.entity,
      prior.category, item.category, prior.jurisdiction, item.jurisdiction
    ];
    groups.set(url, merged);
  }
  return [...groups.values()];
}
function compactItem(item, profile) {
  const url = String(item?.url || '').trim();
  if (!url) return null;
  const primarySource = item.primarySource === true || item.primarySource === 1 || item.primarySource === 'true';
  const out = {
    searchVersion: 3,
    title: text(item.title || url, profile.title),
    url,
    sourceType: text(item.sourceType || 'route', profile.scalar),
    resultKind: text(item.resultKind || 'route', profile.scalar),
    statusClass: text(item.statusClass || 'context', profile.scalar)
  };
  if (primarySource) out.primarySource = true;
  for (const field of ['category','layer','sourceAuthority','evidenceGrade','factualStatus','reviewStatus','jurisdiction','entityType','entity']) {
    const value = text(item[field], profile.scalar);
    if (value) out[field] = value;
  }
  const description = text(item.description, profile.description);
  if (description) out.description = description;
  const terms = uniqueList([
    ...values(item.__terms), ...values(item.exactTerms), ...values(item.keywords),
    ...values(item.aliases), ...values(item.identifiers), item.title, item.entity
  ], profile.terms, profile.termChars);
  if (terms.length) out.exactTerms = terms;
  const bestDate = text(item.date || item.publicationDate || item.retrievalDate, 40);
  if (bestDate) out.date = bestDate;
  const sourceUrl = String(item.sourceUrl || '').trim();
  if (profile.sourceUrl > 0 && /^https?:/i.test(sourceUrl) && sourceUrl !== url && (primarySource || /primary|official|court|government|regulator/i.test(item.sourceAuthority || '') || /^[AB]$/i.test(item.evidenceGrade || ''))) {
    out.sourceUrl = sourceUrl.slice(0, profile.sourceUrl);
  }
  const priority = Number(item.priority || 0);
  if (Number.isFinite(priority) && priority) out.priority = priority;
  return out;
}
function facetCounts(records, field) {
  const counts = new Map();
  for (const record of records) {
    const value = text(record[field], 120);
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value,count]) => ({ value, count }));
}
function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

if (!fs.existsSync(sourcePath)) throw new Error('search-index.json is missing; build Search V3 first.');
let source;
try { source = JSON.parse(fs.readFileSync(sourcePath, 'utf8')); }
catch (error) { throw new Error(`Search index is invalid JSON: ${error.message}`); }
if (!Array.isArray(source)) throw new Error('Search index must be an array.');

const originalUrls = new Set(source.map(item => String(item?.url || '').trim()).filter(Boolean));
const consolidated = consolidate(source);
const profiles = [
  { name:'balanced-final', title:140, description:160, terms:8, termChars:42, scalar:68, sourceUrl:260 },
  { name:'compact-final', title:124, description:100, terms:7, termChars:34, scalar:58, sourceUrl:180 },
  { name:'tight-final', title:112, description:64, terms:6, termChars:28, scalar:50, sourceUrl:120 },
  { name:'route-safe-final', title:100, description:28, terms:5, termChars:24, scalar:44, sourceUrl:80 },
  { name:'minimum-final', title:88, description:0, terms:4, termChars:20, scalar:36, sourceUrl:0 },
  { name:'emergency-final', title:76, description:0, terms:3, termChars:18, scalar:30, sourceUrl:0 }
];
let selected = null;
for (const profile of profiles) {
  const records = consolidated.map(item => compactItem(item, profile)).filter(Boolean);
  const payload = JSON.stringify(records);
  selected = { profile, records, payload, bytes: Buffer.byteLength(payload) };
  if (selected.bytes <= targetBytes) break;
}
if (!selected || selected.bytes > targetBytes) {
  throw new Error(`Final search index remains ${(selected?.bytes || 0) / 1024 / 1024} MiB, above the 20 MiB target.`);
}
const compactedUrls = new Set(selected.records.map(item => item.url));
const missingUrls = [...originalUrls].filter(url => !compactedUrls.has(url));
if (missingUrls.length) throw new Error(`Final search compaction lost ${missingUrls.length} searchable URL(s).`);

write(sourcePath, selected.payload);
if (fs.existsSync(path.dirname(sitePath))) write(sitePath, selected.payload);
let priorFacets = {};
try { priorFacets = JSON.parse(fs.readFileSync(facetsPath, 'utf8')); } catch {}
const facets = {
  ...priorFacets,
  searchVersion: 3,
  updated: new Date().toISOString(),
  totalResults: selected.records.length,
  evidenceBoundary: priorFacets.evidenceBoundary || 'Search ranking and filtering organise cited records. They do not establish guilt, convert allegations into facts, or replace the underlying source.',
  filters: {
    evidenceGrade: facetCounts(selected.records, 'evidenceGrade'),
    sourceType: facetCounts(selected.records, 'sourceType'),
    statusClass: facetCounts(selected.records, 'statusClass'),
    jurisdiction: facetCounts(selected.records, 'jurisdiction'),
    entityType: facetCounts(selected.records, 'entityType'),
    resultKind: facetCounts(selected.records, 'resultKind')
  }
};
write(facetsPath, `${JSON.stringify(facets, null, 2)}\n`);
if (fs.existsSync(path.dirname(siteFacetsPath))) write(siteFacetsPath, `${JSON.stringify(facets, null, 2)}\n`);

const rootBytes = fs.statSync(sourcePath).size;
const siteBytes = fs.existsSync(sitePath) ? fs.statSync(sitePath).size : null;
const report = {
  ok: rootBytes <= targetBytes && (siteBytes == null || siteBytes <= targetBytes) && missingUrls.length === 0,
  generatedAt: new Date().toISOString(),
  entriesBefore: source.length,
  uniqueUrlsBefore: originalUrls.size,
  entriesAfter: selected.records.length,
  uniqueUrlsAfter: compactedUrls.size,
  duplicatesConsolidated: Math.max(0, source.length - consolidated.length),
  profile: selected.profile.name,
  rootMiB: Number((rootBytes / 1024 / 1024).toFixed(2)),
  siteMiB: siteBytes == null ? null : Number((siteBytes / 1024 / 1024).toFixed(2)),
  targetMiB: 20,
  hardRuntimeBudgetMiB: 22,
  missingUrls,
  preservedRuntimeFields: ['url','title','sourceType','resultKind','statusClass','primarySource','category','layer','sourceAuthority','evidenceGrade','factualStatus','reviewStatus','jurisdiction','entityType','entity','description','exactTerms','date','sourceUrl','priority'],
  boundary: 'The final deployable index preserves every unique searchable URL while consolidating duplicate route records and bounding repeated descriptive metadata. The 22 MiB runtime budget remains unchanged.'
};
write(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error('Final search-index compaction failed its preservation or size contract.');
console.log(`Final search index compacted: ${report.entriesBefore} records / ${report.uniqueUrlsBefore} routes -> ${report.entriesAfter} routes, ${report.rootMiB} MiB (${report.profile}); root and _site synchronized.`);
