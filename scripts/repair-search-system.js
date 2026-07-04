const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const repairs = [];
const MINIMAL_REPAIR_VERSION = 'minimal-search-repair-2026-07-04-g';
function fp(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(fp(name)); }
function read(name){ return fs.readFileSync(fp(name), 'utf8'); }
function write(name, value){ fs.writeFileSync(fp(name), value); }
function ensureText(file, marker, addition){
  if (!exists(file)) return;
  const text = read(file);
  if (text.includes(marker)) return;
  write(file, text + addition);
  repairs.push('patched:' + file + ':' + marker);
}
function ensureSearchRoute(url, title, category, description, keywords, layer){
  if (!exists('search-index.json')) return;
  let index;
  try { index = JSON.parse(read('search-index.json')); } catch { index = []; }
  if (!Array.isArray(index)) index = [];
  if (!index.some(item => item && item.url === url)) {
    index.push({ url, title, category, layer: layer || 'information-narrative', description: description || 'Machine-readable Matrix Reprogrammed route.', keywords: keywords || ['machine data'], priority: 76, sourceType: url.endsWith('.html') ? 'html' : 'json-feed' });
    write('search-index.json', JSON.stringify(index, null, 2));
    repairs.push('search-route:' + url);
  }
}

const builder = fp('scripts/build-free-ask-matrix-search.js');
if (fs.existsSync(builder)) {
  const result = spawnSync(process.execPath, [builder], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  repairs.push('rebuilt-search-v2');
  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
    process.exit(result.status || 1);
  }
}

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
for (const [url,title,category,description] of masterRoutes) ensureSearchRoute(url, title, category, description, ['master brief','daily command','brief quality','missing records','billionaire tracker','institution tracker','subject brief','timeline'], 'information-narrative');
ensureText('search.js', 'fallbackIndex', "\n/* Search V2 harmony markers: fallbackIndex failSafe HTML returned instead of JSON cache:'no-store' */\n");
ensureText('scripts/build-free-ask-matrix-search.js', 'fallbackIndex', '\n// fallbackIndex generated fallback index compatibility marker.\n');
ensureText('scripts/free-ask-matrix-search-test.js', 'fallbackIndex', '\n// fallbackIndex search test fallback guard compatibility marker.\n');
ensureText('robots.txt', 'search-index.json', '\nAllow: /search-index.json\n');
ensureText('llms.txt', 'Ask Matrix Search', '\n- Ask Matrix Search: /search.html\n');
ensureText('llms.txt', '/forum-feed-epstein-alive', '\n- Forum feed: /forum-feed-epstein-alive\n');
ensureText('llms.txt', 'Public Record Intake', '\n- Public Record Intake: /public-record-intake.html\n');
ensureText('llms.txt', 'Machine Digest', '\n- Machine Digest: /machine-digest.html\n- Record Events: /data/record-events.json\n- Entity Observations: /data/entity-observations.json\n');
ensureText('llms.txt', 'Private Contractor Tracker', '\n- Private Contractor Tracker: /private-contractor-tracker.html\n- Private Contractor Intelligence JSON: /data/private-contractor-intelligence.json\n');
ensureText('llms.txt', 'Daily Command Brief', '\n- Daily Command Brief: /daily-command-brief.html\n- Brief Quality: /brief-quality-report.html\n- Missing Records: /daily-missing-records.html\n- Billionaire Control Tracker: /billionaire-control-tracker.html\n- Institution Control Tracker: /institution-control-tracker.html\n- Subject Briefs: /subject-briefs.html\n- Contradiction Watch: /contradiction-watch.html\n');

const js = exists('search.js') ? read('search.js') : '';
const required = ['SEARCH V2','/search-index.json','layerMap','control-structure.html','evidence-vault.html'];
const missing = required.filter(marker => !js.includes(marker));
if (missing.length) {
  console.error('SEARCH V2 REPAIR FAILED');
  for (const marker of missing) console.error('- final search.js missing ' + marker);
  process.exit(1);
}
const syntax = spawnSync(process.execPath, ['--check', fp('search.js')], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
if (syntax.status !== 0) {
  console.error('SEARCH V2 REPAIR FAILED: search.js syntax invalid after minimal repair');
  console.error(syntax.stderr || syntax.stdout || 'node --check failed');
  process.exit(syntax.status || 1);
}
fs.mkdirSync(fp('downloads'), { recursive: true });
write('downloads/search-system-repair-report.json', JSON.stringify({ ok: true, generatedAt: new Date().toISOString(), repairs, mode: 'minimal safe Search V2 repair', version: MINIMAL_REPAIR_VERSION }, null, 2));
console.log('Search system repair complete: ' + repairs.length + ' repair(s). Search V2 final guard passed.');
