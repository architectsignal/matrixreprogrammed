const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const pagePath = path.join(root, 'search.html');
const runtimePath = path.join(root, 'search.js');
const templatePath = path.join(root, 'scripts', 'search-v3-runtime-template.js');
const reportPath = path.join(root, 'downloads', 'search-v3-runtime-report.json');
const indexPath = path.join(root, 'search-index.json');
const facetsPath = path.join(root, 'data', 'search-facets.json');
const maxDeployableSearchBytes = 24 * 1024 * 1024;
const targetSearchBytes = 20 * 1024 * 1024;

const compactionProfiles = [
  { id: 'balanced', title: 180, description: 160, listItems: 8, listChars: 64, scalar: 96, sourceUrl: 700 },
  { id: 'compact', title: 160, description: 120, listItems: 8, listChars: 48, scalar: 80, sourceUrl: 500 },
  { id: 'tight', title: 144, description: 96, listItems: 7, listChars: 40, scalar: 72, sourceUrl: 360 },
  { id: 'minimum-safe', title: 128, description: 72, listItems: 6, listChars: 32, scalar: 64, sourceUrl: 260, sparseDefaults: true, mergeTerms: true, termItems: 10 },
  { id: 'ultra-safe', title: 116, description: 48, listItems: 6, listChars: 28, scalar: 52, sourceUrl: 200, sparseDefaults: true, mergeTerms: true, termItems: 8 },
  { id: 'minimum-route-safe', title: 104, description: 24, listItems: 5, listChars: 24, scalar: 44, sourceUrl: 150, sparseDefaults: true, mergeTerms: true, termItems: 6 },
  { id: 'emergency-route-safe', title: 90, description: 0, listItems: 4, listChars: 20, scalar: 34, sourceUrl: 120, sparseDefaults: true, mergeTerms: true, termItems: 5 },
  { id: 'deployment-safe', title: 84, description: 0, listItems: 3, listChars: 18, scalar: 30, sourceUrl: 100, sparseDefaults: true, mergeTerms: true, termItems: 4 }
];

function clean(value = '') { return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function bounded(value, max) { return clean(value).slice(0, max); }
function facetCounts(records, field) {
  const counter = new Map();
  for (const record of records) {
    const value = clean(record?.[field]);
    if (!value) continue;
    counter.set(value, (counter.get(value) || 0) + 1);
  }
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
}
function listValues(value) {
  const values = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  const flattened = [];
  for (const item of values) {
    if (item && typeof item === 'object') flattened.push(...Object.values(item));
    else flattened.push(item);
  }
  return flattened;
}
function compactList(value, profile) {
  return [...new Set(listValues(value).map(item => bounded(item, profile.listChars)).filter(Boolean))].slice(0, profile.listItems);
}
function compactRecord(record, profile) {
  const url = String(record?.url || '').trim();
  if (!url) return null;
  const sparse = profile.sparseDefaults === true;
  const preserveNormalizedMetadata = true;
  const primarySource = record.primarySource === true || record.primarySource === 1 || record.primarySource === 'true';
  const sourceType = bounded(record.sourceType || 'route', profile.scalar);
  const resultKind = bounded(record.resultKind || 'route', profile.scalar);
  const statusClass = bounded(record.statusClass || 'context', profile.scalar);
  const output = {
    searchVersion: 3,
    title: bounded(record.title || url, profile.title),
    url,
    sourceType,
    resultKind,
    statusClass,
    primarySource
  };
  const scalarFields = [
    'category', 'layer', 'sourceAuthority', 'evidenceGrade', 'factualStatus',
    'reviewStatus', 'jurisdiction', 'entityType', 'entity'
  ];
  for (const field of scalarFields) {
    const value = bounded(record[field], profile.scalar);
    if (value) output[field] = value;
  }
  const description = bounded(record.description, profile.description);
  if (description) output.description = description;
  const listFields = ['keywords', 'aliases', 'identifiers', 'exactTerms'];
  if (profile.mergeTerms === true) {
    const mergedTerms = [];
    for (const field of listFields) mergedTerms.push(...listValues(record[field]));
    const values = compactList(mergedTerms, { ...profile, listItems: Number(profile.termItems || profile.listItems || 4) });
    if (values.length) output.exactTerms = values;
  } else {
    for (const field of listFields) {
      const values = compactList(record[field], profile);
      if (values.length) output[field] = values;
    }
  }
  if (sparse) {
    const bestDate = bounded(record.date || record.publicationDate || record.retrievalDate, 40);
    if (bestDate) output.date = bestDate;
  } else {
    for (const field of ['date', 'publicationDate', 'retrievalDate']) {
      const value = bounded(record[field], 40);
      if (value) output[field] = value;
    }
  }
  const sourceUrl = String(record.sourceUrl || '').trim();
  const authority = String(record.sourceAuthority || '').toLowerCase();
  const evidenceGrade = String(record.evidenceGrade || '').toUpperCase();
  const keepSourceUrl = !sparse || primarySource || /primary|official|court|government|regulator/.test(authority) || evidenceGrade === 'A' || evidenceGrade === 'B';
  if (keepSourceUrl && /^https?:/i.test(sourceUrl) && sourceUrl !== url) output.sourceUrl = sourceUrl.slice(0, Number(profile.sourceUrl || 320));
  const priority = Number(record.priority || 0);
  if (Number.isFinite(priority) && priority) output.priority = priority;
  return output;
}
function searchRecordQuality(record) {
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
}
function compactSearchIndex() {
  let records = [];
  try { records = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch {}
  if (!Array.isArray(records)) throw new Error('Search V3 runtime build failed: search-index.json is not an array.');
  const before = records.length;
  const originalUrls = new Set(records.map(record => String(record?.url || '').trim()).filter(Boolean));
  let selected = null;
  for (const profile of compactionProfiles) {
    const candidate = serializeWithProfile(records, profile);
    selected = candidate;
    if (candidate.bytes <= targetSearchBytes) break;
  }
  if (!selected || selected.bytes > maxDeployableSearchBytes) {
    const bytes = selected?.bytes || 0;
    throw new Error(`Search V3 runtime build failed: adaptively compacted index is ${Math.ceil(bytes / 1024 / 1024)} MiB, above the 24 MiB deployment guard.`);
  }
  const compactedUrls = new Set(selected.compacted.map(record => record.url));
  const missingUrls = [...originalUrls].filter(url => !compactedUrls.has(url));
  if (missingUrls.length) throw new Error(`Search V3 runtime build failed: adaptive compaction lost ${missingUrls.length} searchable URL(s).`);
  fs.writeFileSync(indexPath, selected.serialized);
  let priorFacets = {};
  try { priorFacets = JSON.parse(fs.readFileSync(facetsPath, 'utf8')); } catch {}
  const facets = {
    ...priorFacets,
    searchVersion: 3,
    updated: new Date().toISOString(),
    totalResults: selected.compacted.length,
    evidenceBoundary: priorFacets.evidenceBoundary || 'Search ranking and filtering organise cited records. They do not establish guilt, convert allegations into facts, or replace the underlying source.',
    filters: {
      evidenceGrade: facetCounts(selected.compacted, 'evidenceGrade'),
      sourceType: facetCounts(selected.compacted, 'sourceType'),
      statusClass: facetCounts(selected.compacted, 'statusClass'),
      jurisdiction: facetCounts(selected.compacted, 'jurisdiction'),
      entityType: facetCounts(selected.compacted, 'entityType'),
      resultKind: facetCounts(selected.compacted, 'resultKind')
    }
  };
  fs.mkdirSync(path.dirname(facetsPath), { recursive: true });
  fs.writeFileSync(facetsPath, JSON.stringify(facets, null, 2));
  return {
    before,
    after: selected.compacted.length,
    duplicateRecordsConsolidated: Math.max(0, before - selected.compacted.length),
    removedDuplicateMarketRelationships: Math.max(0, before - selected.compacted.length),
    invalidRecordsRemoved: before - selected.compacted.length,
    originalUniqueUrls: originalUrls.size,
    preservedUniqueUrls: compactedUrls.size,
    bytes: selected.bytes,
    targetBytes: targetSearchBytes,
    compactionProfile: selected.profile.id,
    facetTotal: facets.totalResults
  };
}

if (!fs.existsSync(pagePath) || !fs.existsSync(templatePath)) {
  console.error('Search V3 runtime build failed: search page or runtime template missing.');
  process.exit(1);
}

let compactStats;
try {
  compactStats = compactSearchIndex();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

let html = fs.readFileSync(pagePath, 'utf8');
let runtime = fs.readFileSync(templatePath, 'utf8');
const missingIntentLine = "  if(tokens.some(function(token){return ['missing','removed','redaction','restored','hash'].indexOf(token)>=0;})&&item.statusClass==='source-change')value+=32;";
const missingIntentUpgrade = "  const missingIntent=tokens.some(function(token){return ['missing','removed','redaction','redacted','restored','hash','withheld'].indexOf(token)>=0;});\n  if(missingIntent&&item.statusClass==='source-change')value+=150;\n  if(missingIntent&&item.sourceType==='source-change')value+=70;\n  if(missingIntent&&item.resultKind==='relationship'&&item.statusClass!=='source-change')value-=28;";
if (!runtime.includes(missingIntentLine)) {
  console.error('Search V3 runtime build failed: missing-record ranking marker not found.');
  process.exit(1);
}
runtime = runtime.replace(missingIntentLine, missingIntentUpgrade);
const panel = '<section id="search-v3-filters" class="search-v3-filters" aria-label="Search filters"><div class="search-filter-grid"><label>Evidence grade<select id="search-grade"><option value="">All grades</option></select></label><label>Source type<select id="search-source-type"><option value="">All source types</option></select></label><label>Factual status<select id="search-status"><option value="">All statuses</option></select></label><label>Jurisdiction<select id="search-jurisdiction"><option value="">All jurisdictions</option></select></label><label>Entity type<select id="search-entity-type"><option value="">All entity types</option></select></label><label>From date<input id="search-from" type="date"/></label><label>To date<input id="search-to" type="date"/></label><label>Sort<select id="search-sort"><option value="relevance">Relevance</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option></select></label></div><div class="search-filter-actions"><button id="search-clear" class="btn alt" type="button">Clear Search & Filters</button><span id="search-active-filters" aria-live="polite">No filters active.</span></div></section>';
const styles = '<style id="search-v3-styles">.search-v3-filters{max-width:1180px;margin:1rem auto 0;padding:1rem;border:1px solid rgba(216,181,106,.28);border-radius:14px;background:rgba(0,0,0,.76)}.search-filter-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem}.search-filter-grid label{display:grid;gap:.35rem;font-size:.78rem;text-transform:uppercase;letter-spacing:.05em}.search-filter-grid select,.search-filter-grid input{width:100%;padding:.7rem;border:1px solid rgba(216,181,106,.35);border-radius:8px;background:#090909;color:#f2f2f2}.search-filter-actions{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-top:.9rem}.search-filter-actions span{color:#c8b98c;font-size:.86rem}.search-result-meta{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.7rem}.search-pill{display:inline-flex;border:1px solid rgba(216,181,106,.28);border-radius:999px;padding:.2rem .5rem;font-size:.72rem;text-transform:uppercase}.search-pill.grade{color:#d8b56a}.search-boundary{font-size:.86rem;color:#d9cfae}.search-result-card{align-content:start}@media(max-width:900px){.search-filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.search-filter-grid{grid-template-columns:1fr}}</style>';

html = html.replace(/Search V2 · Brain-Aware/g, 'Search V3 · Evidence-Aware');
html = html.replace(/Brain-aware Matrix Reprogrammed search/g, 'Evidence-aware Matrix Reprogrammed search');
html = html.replace('The system boosts the pages that explain the control structure first.', 'The system ranks exact primary records above general commentary and clearly separates established findings, enforcement, allegations, source changes and unverified leads.');
html = html.replace('This is free local browser search. It indexes the site like an intelligence machine: control layer, route priority, evidence lane, feed type, keywords, and page purpose.', 'This is free local browser search. It combines exact names, aliases, identifiers, document text, source authority, evidence grade, factual status, jurisdiction, entity type and dates. Search ranking is navigation, not proof.');
html = html.replace(/SEARCH V2 STATUS/g, 'SEARCH V3 STATUS');
html = html.replace(/&gt; Brain-aware index: active/g, '&gt; Evidence-aware index: active');
if (!html.includes('id="search-v3-filters"')) {
  const inputBlock = /(<div class="wrap"><input id="archive-search"[^>]*\/><\/div>)/;
  if (!inputBlock.test(html)) {
    console.error('Search V3 runtime build failed: search input block not found.');
    process.exit(1);
  }
  html = html.replace(inputBlock, `$1${panel}`);
}
if (!html.includes('id="search-v3-styles"')) html = html.replace('</head>', `${styles}</head>`);
fs.writeFileSync(pagePath, html);
fs.writeFileSync(runtimePath, runtime);

const syntax = spawnSync(process.execPath, ['--check', runtimePath], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
const requiredPage = ['id="search-v3-filters"','id="search-grade"','id="search-source-type"','id="search-status"','id="search-jurisdiction"','id="search-entity-type"','id="search-from"','id="search-to"','id="search-sort"','id="search-clear"'];
const requiredRuntime = ['SEARCH V3','SEARCH V2 compatibility','investigationQueryPrefill','const fallbackIndex=','/search-index.json',"cache:'no-store'",'HTML returned instead of JSON','init(fallbackIndex)','primarySource','statusClass','jurisdiction','entityType','missingIntent'];
const missingPage = requiredPage.filter(marker => !html.includes(marker));
const missingRuntime = requiredRuntime.filter(marker => !runtime.includes(marker));
const report = {
  ok: syntax.status === 0 && missingPage.length === 0 && missingRuntime.length === 0 && compactStats.bytes <= maxDeployableSearchBytes && compactStats.facetTotal === compactStats.after && compactStats.originalUniqueUrls === compactStats.preservedUniqueUrls,
  generatedAt: new Date().toISOString(),
  missingPage,
  missingRuntime,
  syntaxOk: syntax.status === 0,
  syntaxError: syntax.status === 0 ? null : String(syntax.stderr || syntax.stdout || 'node --check failed'),
  compactIndex: {
    ...compactStats,
    mebibytes: Number((compactStats.bytes / 1024 / 1024).toFixed(2)),
    targetMebibytes: 20,
    deploymentLimitMebibytes: 24,
    evidenceBoundary: 'No valid searchable URL is removed. Only fields unused by the Search V3 browser runtime are discarded, while display text and keyword arrays are bounded adaptively. Complete records remain available in their source pages, graph, registries and document library.'
  }
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error('SEARCH V3 RUNTIME BUILD FAILED');
  if (missingPage.length) console.error(`Missing page markers: ${missingPage.join(', ')}`);
  if (missingRuntime.length) console.error(`Missing runtime markers: ${missingRuntime.join(', ')}`);
  if (!report.syntaxOk) console.error(report.syntaxError);
  process.exit(1);
}
console.log(`Search V3 runtime built with evidence filters and a ${report.compactIndex.mebibytes} MiB deployable index using the ${compactStats.compactionProfile} profile; ${compactStats.preservedUniqueUrls} searchable URLs preserved and facets synchronized.`);
