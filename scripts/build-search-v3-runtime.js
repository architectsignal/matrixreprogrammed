const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const pagePath = path.join(root, 'search.html');
const runtimePath = path.join(root, 'search.js');
const templatePath = path.join(root, 'scripts', 'search-v3-runtime-template.js');
const reportPath = path.join(root, 'downloads', 'search-v3-runtime-report.json');
const indexPath = path.join(root, 'search-index.json');
const maxDeployableSearchBytes = 24 * 1024 * 1024;

function compactSearchIndex() {
  let records = [];
  try { records = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch {}
  if (!Array.isArray(records)) throw new Error('Search V3 runtime build failed: search-index.json is not an array.');
  const before = records.length;
  records = records.filter(record => {
    if (record?.sourceType !== 'structured-relationship') return true;
    const text = `${record.category || ''} ${record.title || ''} ${record.factualStatus || ''}`;
    return !/reportedTransaction|reportedPositionChange|reported transaction|reported position change/i.test(text);
  });
  const serialized = JSON.stringify(records);
  const bytes = Buffer.byteLength(serialized);
  if (bytes > maxDeployableSearchBytes) {
    throw new Error(`Search V3 runtime build failed: compact index is ${Math.ceil(bytes / 1024 / 1024)} MiB, above the 24 MiB deployment guard.`);
  }
  fs.writeFileSync(indexPath, serialized);
  return { before, after: records.length, removedDuplicateMarketRelationships: before - records.length, bytes };
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
  ok: syntax.status === 0 && missingPage.length === 0 && missingRuntime.length === 0 && compactStats.bytes <= maxDeployableSearchBytes,
  generatedAt: new Date().toISOString(),
  missingPage,
  missingRuntime,
  syntaxOk: syntax.status === 0,
  syntaxError: syntax.status === 0 ? null : String(syntax.stderr || syntax.stdout || 'node --check failed'),
  compactIndex: {
    ...compactStats,
    mebibytes: Number((compactStats.bytes / 1024 / 1024).toFixed(2)),
    deploymentLimitMebibytes: 24,
    evidenceBoundary: 'Only duplicate verbose market relationship records are removed. Compact official filing results remain searchable, and the complete relationships remain available in the public graph and registries.'
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
console.log(`Search V3 runtime built with evidence filters and a ${report.compactIndex.mebibytes} MiB deployable index; ${compactStats.removedDuplicateMarketRelationships} duplicate market relationship records removed.`);
