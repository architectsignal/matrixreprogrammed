const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const repairs = [];
const MINIMAL_REPAIR_VERSION = 'search-runtime-hardening-2026-07-18-v3-preservation';
function fp(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(fp(name)); }
function read(name){ return fs.readFileSync(fp(name), 'utf8'); }
function write(name, value){ fs.writeFileSync(fp(name), value); }
function readJson(name, fallback){ try { return JSON.parse(read(name)); } catch { return fallback; } }
function ensureText(file, marker, addition){
  if (!exists(file)) return;
  const text = read(file);
  if (text.includes(marker)) return;
  write(file, text + addition);
  repairs.push('patched:' + file + ':' + marker);
}
function detectSearchV3(){
  if (!exists('search.js') || !exists('search.html') || !exists('search-index.json') || !exists('data/search-facets.json')) return false;
  const js = read('search.js');
  const html = read('search.html');
  const index = readJson('search-index.json', []);
  const facets = readJson('data/search-facets.json', {});
  return js.includes('SEARCH V3')
    && js.includes('SEARCH V2 compatibility')
    && html.includes('id="search-v3-filters"')
    && Array.isArray(index)
    && index.length >= 1000
    && index.every(item => item && item.searchVersion === 3)
    && facets.searchVersion === 3
    && Number(facets.totalResults) === index.length;
}
const preservingV3 = detectSearchV3();

function ensureSearchPageMarker(){
  if (!exists('search.html')) return;
  let html = read('search.html');
  if (html.includes('id="archive-search"')) return;
  if (preservingV3) throw new Error('Search V3 page is missing its canonical archive-search input; refusing to inject a V2 shell');
  const marker = '<input id="archive-search" type="search" placeholder="Search the machine" autocomplete="off"/>';
  if (html.includes('<main')) html = html.replace(/(<main[^>]*>)/, '$1' + marker);
  else if (html.includes('<body')) html = html.replace(/(<body[^>]*>)/, '$1' + marker);
  else html = marker + html;
  write('search.html', html);
  repairs.push('patched:search.html:archive-search');
}
function completeV3Route(url, title, category, description, keywords, layer){
  return {
    searchVersion: 3,
    url,
    title,
    category,
    layer: layer || 'information-narrative',
    description: description || 'Machine-readable Matrix Reprogrammed route.',
    keywords: keywords || ['machine data'],
    aliases: [],
    identifiers: [],
    exactTerms: [title],
    priority: 76,
    sourceType: url.endsWith('.html') ? 'mission-route' : url.endsWith('.json') ? 'json-feed' : 'route',
    resultKind: url.endsWith('.html') ? 'route' : 'dataset',
    sourceAuthority: 'Matrix Reprogrammed public route',
    evidenceGrade: 'C',
    factualStatus: 'context',
    statusClass: 'context',
    reviewStatus: 'published',
    jurisdiction: 'International',
    entityType: 'Route',
    entity: title,
    primarySource: false
  };
}
let v3IndexChanged = false;
function ensureSearchRoute(url, title, category, description, keywords, layer){
  if (!exists('search-index.json')) return;
  let index = readJson('search-index.json', []);
  if (!Array.isArray(index)) index = [];
  if (!index.some(item => item && item.url === url)) {
    index.push(preservingV3
      ? completeV3Route(url, title, category, description, keywords, layer)
      : { url, title, category, layer: layer || 'information-narrative', description: description || 'Machine-readable Matrix Reprogrammed route.', keywords: keywords || ['machine data'], priority: 76, sourceType: url.endsWith('.html') ? 'html' : 'json-feed' });
    write('search-index.json', JSON.stringify(index, null, 2));
    repairs.push('search-route:' + url);
    if (preservingV3) v3IndexChanged = true;
  }
}
function facetCounts(index, field){
  const counts = new Map();
  for (const item of index) {
    const value = item && item[field];
    if (value === undefined || value === null || value === '') continue;
    counts.set(String(value), (counts.get(String(value)) || 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
function syncV3Facets(){
  if (!preservingV3 || !v3IndexChanged) return;
  const index = readJson('search-index.json', []);
  const current = readJson('data/search-facets.json', {});
  const filters = {};
  for (const field of ['evidenceGrade','sourceType','statusClass','jurisdiction','entityType','resultKind']) filters[field] = facetCounts(index, field);
  write('data/search-facets.json', JSON.stringify({
    searchVersion: 3,
    updated: new Date().toISOString(),
    totalResults: index.length,
    evidenceBoundary: current.evidenceBoundary || 'Search ranking and filtering organise cited records. They do not establish guilt, convert allegations into facts, or replace the underlying source.',
    filters
  }, null, 2));
  repairs.push('synchronised-v3-facets');
}
function runRequired(label, script){
  const file = fp(script);
  if (!fs.existsSync(file)) {
    console.error(`${label} failed: ${script} missing`);
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [file], { cwd: root, encoding: 'utf8', stdio: 'pipe', maxBuffer: 1024 * 1024 * 40 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status || 1);
  repairs.push(label);
}

if (preservingV3) {
  repairs.push('preserved-authoritative-search-v3');
  console.log('Authoritative Search V3 detected; destructive Search V2 rebuild skipped.');
} else {
  runRequired('built-investigation-pages', 'scripts/build-investigation-pages.js');
  runRequired('rebuilt-search-v2', 'scripts/build-free-ask-matrix-search.js');
  runRequired('hardened-search-runtime', 'scripts/harden-search-runtime.js');
  runRequired('extended-investigation-search', 'scripts/extend-search-with-investigations.js');
}

ensureSearchPageMarker();
ensureSearchRoute('downloads/forum-posts.json', 'Forum Posts Export JSON', 'Machine Data', 'Machine-readable Signal Board export route.', ['forum','signal board','export','posts','machine data'], 'information-narrative');
ensureSearchRoute('downloads/forum-posts.md', 'Forum Posts Export Markdown', 'Downloads', 'Signal Board export download route.', ['forum','signal board','download'], 'information-narrative');
ensureSearchRoute('public-record-intake.html', 'Public Record Intake', 'Machine Feeds', 'Source-first public-record intake layer for policy, filings, courts, contracts, lobbying, sanctions, procurement and registries.', ['public records','intake','official APIs','filings','contracts','courts','policy','machine feed'], 'disclosure-black-files');
ensureSearchRoute('data/public-record-intake.json', 'Public Record Intake JSON', 'Machine Data', 'Machine-readable source intake manifest.', ['public records','source manifest','API feeds','evidence ladder'], 'disclosure-black-files');
ensureSearchRoute('data/machine-feed-queue.json', 'Machine Feed Queue JSON', 'Machine Data', 'Daily pull order for source-first intelligence feeds.', ['feed queue','daily pull','machine brain','records'], 'information-narrative');
ensureSearchRoute('downloads/public-record-intake.md', 'Public Record Intake Download', 'Downloads', 'Downloadable public-record intake manifest.', ['download','public records','source routes'], 'disclosure-black-files');
ensureSearchRoute('machine-digest.html', 'Machine Digest', 'Machine Feeds', 'Latest public-record pulls, normalized events and entity observations.', ['machine digest','public record pulls','record events','entity observations'], 'information-narrative');
ensureSearchRoute('data/record-events.json', 'Record Events JSON', 'Machine Data', 'Normalized public-record events produced by the Machine Feed Runner.', ['record events','machine feed','evidence grade','source pulls'], 'information-narrative');
ensureSearchRoute('data/entity-observations.json', 'Entity Observations JSON', 'Machine Data', 'Entity candidates detected from public-record pulls.', ['entity observations','people','institutions','companies'], 'elite-networks');
ensureSearchRoute('data/source-pulls/source-pull-index.json', 'Source Pull Index JSON', 'Machine Data', 'Index of public-record feed pulls attempted by the Machine Feed Runner.', ['source pulls','public APIs','feed runner'], 'disclosure-black-files');
ensureSearchRoute('downloads/machine-digest.md', 'Machine Digest Download', 'Downloads', 'Markdown digest of pulled records and entity observations.', ['machine digest','download','record events'], 'information-narrative');
ensureSearchRoute('private-contractor-tracker.html', 'Private Contractor Tracker', 'Contractor Intelligence', 'Tracks contractor lineages, main players, contracts, public-money routes, legal records, ownership changes and missing records.', ['private contractors','Blackwater','Constellis','Erik Prince','contracts','USAspending','security contractor','military contractor'], 'security-emergency');
ensureSearchRoute('data/private-contractor-intelligence.json', 'Private Contractor Intelligence JSON', 'Machine Data', 'Machine-readable contractor profiles, lineages, main players, source routes, records and watch triggers.', ['private contractor intelligence','contractor profiles','main players','contractor score'], 'security-emergency');
ensureSearchRoute('downloads/private-contractor-intelligence.md', 'Private Contractor Intelligence Download', 'Downloads', 'Downloadable contractor intelligence brief.', ['contractor intelligence','download','Blackwater','Constellis'], 'security-emergency');
const masterRoutes = [
  ['daily-command-brief.html','Daily Command Brief','Master Briefs','Top movements, entity changes, contractor signals, elite-network watch seeds, missing records and review prompts.'],
  ['brief-quality-report.html','Brief Quality Report','Master Briefs','Scores entity briefs by source strength, relationship depth, missing-record pressure and reader clarity.'],
  ['daily-missing-records.html','Daily Missing Records','Master Briefs','Machine-readable missing-record watch queue.'],
  ['billionaire-control-tracker.html','Billionaire Control Tracker','Master Briefs','Elite-network watch seeds with control-layer scores, ecosystems, record routes and missing records.'],
  ['institution-control-tracker.html','Institution Control Tracker','Master Briefs','Institution profiles for public-record power routes and missing documents.'],
  ['subject-briefs.html','Subject Briefs','Master Briefs','Control-topic briefs for digital ID, contractors, AI/data, banking rails, health systems, disclosure gaps and policy routes.'],
  ['contradiction-watch.html','Contradiction Watch','Master Briefs','Mixed-grade and cross-lane review prompts requiring counter-sources or primary records.'],
  ['main-player-profiles.html','Main Player Profiles','Master Briefs','Profiles for main players, founders, executives, company roles and watch routes.'],
  ['entity-timelines.html','Entity Timelines','Master Briefs','Entity timelines generated from source routes and change records.'],
  ['elite-reports.html','Elite Reports','Reader Reports','Human-readable reports generated from clocks, drops, entities, contractors, billionaire profiles, institutions, subjects, missing records and review prompts.'],
  ['reports/daily-revelation-report.html','Daily Revelation Report','Reader Reports','Plain-English daily report for top site signals and source routes.'],
  ['reports/missing-records-report.html','Missing Records Report','Reader Reports','Reader report explaining the missing-record queue and evidence boundaries.'],
  ['reports/contradiction-watch-report.html','Contradiction Watch Report','Reader Reports','Reader report for mixed-grade signals and source review prompts.'],
  ['data/elite-reports.json','Elite Reports JSON','Machine Data','Machine-readable index of reader reports.'],
  ['downloads/elite-reports.md','Elite Reports Markdown','Downloads','Downloadable reader-report summary.'],
  ['data/master-brief-engine.json','Master Brief Engine JSON','Machine Data','Machine-readable output index for the master brief layer.'],
  ['data/daily-command-brief.json','Daily Command Brief JSON','Machine Data','Machine-readable daily command brief.'],
  ['data/brief-quality-report.json','Brief Quality JSON','Machine Data','Machine-readable brief quality scores.'],
  ['data/missing-records.json','Missing Records JSON','Machine Data','Machine-readable missing-record queue.'],
  ['data/billionaire-control-index.json','Billionaire Control JSON','Machine Data','Machine-readable elite-network watch seed profiles.'],
  ['data/institution-control-index.json','Institution Control JSON','Machine Data','Machine-readable institution profiles.'],
  ['data/subject-briefs.json','Subject Briefs JSON','Machine Data','Machine-readable subject briefs.'],
  ['data/contradictions.json','Contradictions JSON','Machine Data','Machine-readable contradiction watch.'],
  ['data/main-player-profiles.json','Main Players JSON','Machine Data','Machine-readable main player profiles.'],
  ['data/entity-timelines.json','Entity Timelines JSON','Machine Data','Machine-readable entity timelines.']
];
for (const [url,title,category,description] of masterRoutes) ensureSearchRoute(url, title, category, description, ['master brief','daily command','brief quality','missing records','billionaire tracker','institution tracker','subject brief','timeline','elite reports','reader reports'], 'information-narrative');
syncV3Facets();

ensureText('robots.txt', 'search-index.json', '\nAllow: /search-index.json\n');
ensureText('llms.txt', 'Ask Matrix Search', '\n- Ask Matrix Search: /search.html\n');
ensureText('llms.txt', '/forum-feed-epstein-alive', '\n- Forum feed: /forum-feed-epstein-alive\n');
ensureText('llms.txt', 'Public Record Intake', '\n- Public Record Intake: /public-record-intake.html\n');
ensureText('llms.txt', 'Machine Digest', '\n- Machine Digest: /machine-digest.html\n- Record Events: /data/record-events.json\n- Entity Observations: /data/entity-observations.json\n');
ensureText('llms.txt', 'Private Contractor Tracker', '\n- Private Contractor Tracker: /private-contractor-tracker.html\n- Private Contractor Intelligence JSON: /data/private-contractor-intelligence.json\n');
ensureText('llms.txt', 'Daily Command Brief', '\n- Daily Command Brief: /daily-command-brief.html\n- Brief Quality: /brief-quality-report.html\n- Missing Records: /daily-missing-records.html\n- Billionaire Control Tracker: /billionaire-control-tracker.html\n- Institution Control Tracker: /institution-control-tracker.html\n- Subject Briefs: /subject-briefs.html\n- Contradiction Watch: /contradiction-watch.html\n- Elite Reports: /elite-reports.html\n');
ensureText('llms.txt', 'Intelligent Investigation Machine', '\n- Intelligent Investigation Machine: /investigation-machine.html\n- Daily Investigation Conclusions: /daily-investigation-conclusions.html\n- Weekly Investigation Report: /weekly-investigation-report.html\n- Investigation Source Ledger: /investigation-source-ledger.html\n- Investigation Evidence Ledger JSON: /data/investigation-ledger.json\n');

const js = exists('search.js') ? read('search.js') : '';
const required = preservingV3
  ? ['SEARCH V3','SEARCH V2 compatibility','/search-index.json','investigationQueryPrefill','const fallbackIndex=',"cache:'no-store'",'HTML returned instead of JSON','init(fallbackIndex)','primarySource','statusClass','jurisdiction','entityType','URLSearchParams','missingIntent']
  : ['SEARCH V2','/search-index.json','layerMap','control-structure.html','evidence-vault.html','const fallbackIndex=',"cache:'no-store'",'HTML returned instead of JSON','init(fallbackIndex)','investigationQueryPrefill'];
const missing = required.filter(marker => !js.includes(marker));
if (missing.length) {
  console.error(`SEARCH ${preservingV3 ? 'V3 PRESERVATION' : 'V2 REPAIR'} FAILED`);
  for (const marker of missing) console.error('- final search.js missing ' + marker);
  process.exit(1);
}
const syntax = spawnSync(process.execPath, ['--check', fp('search.js')], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
if (syntax.status !== 0) {
  console.error('SEARCH REPAIR FAILED: search.js syntax invalid after runtime hardening');
  console.error(syntax.stderr || syntax.stdout || 'node --check failed');
  process.exit(syntax.status || 1);
}
runRequired('verified-current-local-search', 'scripts/free-ask-matrix-search-test.js');
runRequired('verified-investigation-search', 'scripts/search-investigation-smoke-test.js');
if (preservingV3) runRequired('verified-search-v3-quality', 'scripts/search-v3-quality-test.js');
fs.mkdirSync(fp('downloads'), { recursive: true });
write('downloads/search-system-repair-report.json', JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  repairs,
  mode: preservingV3 ? 'Authoritative Search V3 preservation and investigation runtime repair' : 'Search V2 fallback plus investigation evidence runtime repair',
  version: MINIMAL_REPAIR_VERSION,
  preservedSearchV3: preservingV3
}, null, 2));
console.log(`Search system repair complete: ${repairs.length} repair(s). ${preservingV3 ? 'Search V3 remained authoritative.' : 'Search V2 fallback guard passed.'}`);
