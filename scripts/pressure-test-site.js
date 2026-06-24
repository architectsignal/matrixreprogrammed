const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file) { return fs.existsSync(path.join(root, file)); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function json(file) { return JSON.parse(read(file)); }
function count(html, pattern) { return (html.match(pattern) || []).length; }
function requireFile(file) { if (!exists(file)) problems.push(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text) { if (!exists(file)) return; if (!read(file).includes(text)) problems.push(`${file}: missing ${label}`); }

const phaseOnePages = ['power-atlas.html', 'evidence-vault.html', 'evidence-policy.html', 'network-maps.html'];
const phaseTwoCorePages = ['atlas-index.html'];
const phaseThreeCorePages = ['evidence-vault-index.html'];
const corePages = ['index.html', 'start-here.html', 'books.html', 'search.html', 'news.html', 'intel-archive.html', 'timers.html', 'black-file.html', 'black-file-index.html', 'answer-index.html', 'sitemap.xml', 'robots.txt', 'llms.txt'];
const coreData = ['data/books.json', 'data/bulletins.json', 'data/human-cost.json', 'data/power-atlas.json', 'data/evidence-vault.json', 'search-index.json'];

[...corePages, ...phaseOnePages, ...phaseTwoCorePages, ...phaseThreeCorePages, ...coreData].forEach(requireFile);

for (const file of phaseOnePages) {
  requireIncludes(file, 'Evidence', 'evidence language');
  requireIncludes(file, 'Power', 'power structure language');
}
requireIncludes('power-atlas.html', 'THE PUBLIC-RECORD MAP OF HIDDEN POWER', 'Power Atlas hero');
requireIncludes('power-atlas.html', 'id="phase-two-atlas-engine"', 'Phase 2 atlas engine section');
requireIncludes('evidence-vault.html', 'SOURCES BEFORE SIGNALS', 'Evidence Vault hero');
requireIncludes('evidence-vault.html', 'id="phase-three-evidence-engine"', 'Phase 3 evidence engine section');
requireIncludes('evidence-policy.html', 'DARK CLAIMS NEED CLEAN SOURCES', 'Evidence Policy hero');
requireIncludes('network-maps.html', 'NO RED STRING WITHOUT LABELS', 'Network Maps hero');
requireIncludes('atlas-index.html', 'ATLAS NODES', 'Atlas node index hero');
requireIncludes('evidence-vault-index.html', 'SOURCE LANES', 'Evidence Vault source index hero');
requireIncludes('index.html', 'id="phase-one-structure"', 'homepage Phase 1 structure section');
requireIncludes('start-here.html', 'id="phase-one-paths"', 'Start Here Phase 1 structure paths');

for (const page of ['index.html', 'start-here.html', 'books.html', 'news.html', 'power-atlas.html', 'evidence-vault.html', 'atlas-index.html', 'evidence-vault-index.html']) {
  requireIncludes(page, 'power-atlas.html', 'Power Atlas nav/link');
  requireIncludes(page, 'evidence-vault.html', 'Evidence Vault nav/link');
}

let atlasNodes = [];
let evidenceLanes = [];
let sourceCards = [];
if (exists('data/power-atlas.json')) {
  const atlas = json('data/power-atlas.json');
  atlasNodes = atlas.nodes || [];
  const evidenceSet = new Set(atlas.evidenceClasses || []);
  const relationshipSet = new Set(atlas.relationshipTypes || []);
  if (atlasNodes.length < 10) problems.push(`data/power-atlas.json expected at least 10 atlas nodes, found ${atlasNodes.length}`);
  if (!Array.isArray(atlas.evidenceClasses) || atlas.evidenceClasses.length < 8) problems.push('data/power-atlas.json expected at least 8 evidence classes');
  if (!Array.isArray(atlas.relationshipTypes) || atlas.relationshipTypes.length < 10) problems.push('data/power-atlas.json expected at least 10 relationship types');
  for (const node of atlasNodes) {
    const file = `atlas-${node.slug}.html`;
    if (!evidenceSet.has(node.evidenceClass)) problems.push(`atlas node ${node.slug} uses invalid evidenceClass: ${node.evidenceClass}`);
    for (const type of node.relationshipTypes || []) if (!relationshipSet.has(type)) problems.push(`atlas node ${node.slug} uses undeclared relationship type: ${type}`);
    requireFile(file);
    requireIncludes(file, node.title, `atlas node title ${node.title}`);
    requireIncludes(file, 'Source Boundary', `source boundary on ${file}`);
    requireIncludes(file, 'Relationship-Line Types', `relationship-line types on ${file}`);
    requireIncludes(file, node.evidenceClass, `evidence class on ${file}`);
  }
}

if (exists('data/evidence-vault.json')) {
  const vault = json('data/evidence-vault.json');
  evidenceLanes = vault.sourceLanes || [];
  sourceCards = vault.sourceCards || [];
  const hierarchySet = new Set(vault.sourceHierarchy || []);
  const atlasEvidenceClasses = exists('data/power-atlas.json') ? new Set(json('data/power-atlas.json').evidenceClasses || []) : new Set();
  if (!Array.isArray(vault.sourceHierarchy) || vault.sourceHierarchy.length < 8) problems.push('data/evidence-vault.json expected at least 8 source hierarchy entries');
  if (!Array.isArray(vault.claimRules) || vault.claimRules.length < 8) problems.push('data/evidence-vault.json expected at least 8 claim rules');
  if (evidenceLanes.length < 6) problems.push(`data/evidence-vault.json expected at least 6 source lanes, found ${evidenceLanes.length}`);
  if (sourceCards.length < 10) problems.push(`data/evidence-vault.json expected at least 10 source cards, found ${sourceCards.length}`);
  for (const lane of evidenceLanes) {
    const file = `evidence-lane-${lane.slug}.html`;
    if (!hierarchySet.has(lane.sourceType)) problems.push(`evidence lane ${lane.slug} uses invalid sourceType: ${lane.sourceType}`);
    if (!atlasEvidenceClasses.has(lane.evidenceClass)) problems.push(`evidence lane ${lane.slug} uses invalid evidenceClass: ${lane.evidenceClass}`);
    requireFile(file);
    requireIncludes(file, lane.title, `source lane title ${lane.title}`);
    requireIncludes(file, 'Source Boundary', `source boundary on ${file}`);
    requireIncludes(file, lane.evidenceClass, `evidence class on ${file}`);
  }
  const laneSet = new Set(evidenceLanes.map(lane => lane.slug));
  for (const source of sourceCards) {
    const file = `source-${source.slug}.html`;
    if (!hierarchySet.has(source.sourceType)) problems.push(`source card ${source.slug} uses invalid sourceType: ${source.sourceType}`);
    if (!atlasEvidenceClasses.has(source.evidenceClass)) problems.push(`source card ${source.slug} uses invalid evidenceClass: ${source.evidenceClass}`);
    if (!laneSet.has(source.relatedLane)) problems.push(`source card ${source.slug} references missing lane: ${source.relatedLane}`);
    if (!/^https:\/\//.test(source.url)) problems.push(`source card ${source.slug} must use https source URL`);
    requireFile(file);
    requireIncludes(file, source.title, `source card title ${source.title}`);
    requireIncludes(file, 'Use For', `Use For on ${file}`);
    requireIncludes(file, 'Boundary', `Boundary on ${file}`);
  }
}

if (exists('sitemap.xml')) {
  for (const file of [...phaseOnePages, ...phaseTwoCorePages, ...phaseThreeCorePages, ...atlasNodes.map(node => `atlas-${node.slug}.html`), ...evidenceLanes.map(lane => `evidence-lane-${lane.slug}.html`), ...sourceCards.map(source => `source-${source.slug}.html`)]) requireIncludes('sitemap.xml', `/${file}`, `${file} in sitemap`);
}
if (exists('llms.txt')) {
  for (const file of [...phaseOnePages, 'atlas-index.html', 'evidence-vault-index.html']) requireIncludes('llms.txt', `/${file}`, `${file} in llms.txt`);
}
if (exists('package.json')) {
  const pkg = json('package.json');
  const build = pkg.scripts && pkg.scripts.build || '';
  for (const step of ['build-book-system.js', 'build-homepage.js', 'build-seo-system.js', 'build-intel-desk.js', 'build-phase1-structure.js', 'build-phase2-power-atlas.js', 'build-phase3-evidence-vault.js', 'cleanup-duplicates.js', 'audit-site.js', 'pressure-test-site.js']) {
    if (!build.includes(step)) problems.push(`package.json build script missing ${step}`);
  }
}
if (exists('netlify.toml')) {
  const netlify = read('netlify.toml');
  for (const step of ['build-phase1-structure.js', 'build-phase2-power-atlas.js', 'build-phase3-evidence-vault.js', 'cleanup-duplicates.js', 'audit-site.js', 'pressure-test-site.js']) {
    if (!netlify.includes(step)) problems.push(`netlify.toml build command missing ${step}`);
  }
}

if (exists('data/books.json') && exists('search-index.json')) {
  const books = json('data/books.json').books.filter(b => b.status !== 'planned' && b.status !== 'unpublished');
  const search = json('search-index.json');
  const minimumSearchEntries = books.length + atlasNodes.length + evidenceLanes.length + sourceCards.length;
  if (search.length < minimumSearchEntries) problems.push(`search-index.json length ${search.length} is below books + atlas + evidence minimum ${minimumSearchEntries}`);
  for (const book of books) if (book.generatedUrl && !exists(book.generatedUrl)) problems.push(`book generated page missing: ${book.generatedUrl}`);
  for (const node of atlasNodes) {
    const url = `atlas-${node.slug}.html`;
    if (!search.some(item => item.url === url)) problems.push(`search-index.json missing atlas node URL: ${url}`);
  }
  for (const lane of evidenceLanes) {
    const url = `evidence-lane-${lane.slug}.html`;
    if (!search.some(item => item.url === url)) problems.push(`search-index.json missing evidence lane URL: ${url}`);
  }
  for (const source of sourceCards) {
    const url = `source-${source.slug}.html`;
    if (!search.some(item => item.url === url)) problems.push(`search-index.json missing source card URL: ${url}`);
  }
}
if (exists('data/bulletins.json') && exists('news.html') && exists('intel-archive.html')) {
  const bulletins = json('data/bulletins.json').bulletins || [];
  const news = read('news.html');
  const archive = read('intel-archive.html');
  const visibleNews = count(news, /class=["'][^"']*news-item/g);
  const archiveCards = count(archive, /<article class=["']card/g);
  if (bulletins.length < 3) problems.push('data/bulletins.json expected at least 3 bulletins');
  if (visibleNews < Math.min(7, bulletins.length)) problems.push(`news.html visible bulletins ${visibleNews} below expected ${Math.min(7, bulletins.length)}`);
  if (archiveCards < bulletins.length) problems.push(`intel-archive.html archive cards ${archiveCards} below bulletins ${bulletins.length}`);
  for (const b of bulletins) {
    for (const field of ['id', 'date', 'label', 'headline', 'summary', 'why', 'path']) if (!b[field]) problems.push(`bulletin missing ${field}: ${b.id || b.headline || 'unknown'}`);
    if (!Array.isArray(b.sources) || !b.sources.length) problems.push(`bulletin missing sources: ${b.id || b.headline || 'unknown'}`);
  }
}
if (exists('data/human-cost.json') && exists('news.html')) {
  const panels = json('data/human-cost.json').panels || [];
  const news = read('news.html');
  const metricCount = count(news, /class=["'][^"']*metric/g);
  if (panels.length < 6) problems.push('data/human-cost.json expected at least 6 panels');
  if (metricCount < 10) problems.push(`news.html expected at least 10 metric panels, found ${metricCount}`);
  if (/figure-caption">Worldwide \/ latest sourced figure/.test(news)) problems.push('news.html still contains duplicated Human Cost article cards');
}
if (exists('timers.html')) {
  const timers = read('timers.html');
  const riskRepeats = count(timers, /SIGNALS INCREASING RISK/g);
  const timerCards = count(timers, /Speculative pressure score/g);
  if (riskRepeats > 1) problems.push(`timers.html repeated risk terminal ${riskRepeats} times`);
  if (timerCards < 10) problems.push(`timers.html expected at least 10 timer cards, found ${timerCards}`);
}
if (exists('books.html')) {
  const booksHtml = read('books.html');
  if (/<p>(?:<span class="pill">[^<]+<\/span>\s*){2,}<\/p>/.test(booksHtml)) problems.push('books.html still contains visible keyword-pill stuffing blocks');
}
if (exists('search.html') && exists('search.js')) {
  requireIncludes('search.html', 'Showing the strongest entry points', 'search fallback cards');
  const searchJs = read('search.js');
  if (searchJs.includes('(b.keywords||[]).slice')) problems.push('search.js still renders visible keyword pills');
}
if (exists('videos.html')) {
  const videos = read('videos.html');
  if (/Rumble Channel Routes/.test(videos)) problems.push('videos.html still duplicates Rumble Channel Routes');
  requireIncludes('videos.html', 'Video Production Map', 'deduplicated video production map');
}

if (problems.length) {
  console.error('\nPHASE 3 PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PHASE 3 PRESSURE TEST PASSED');
console.log('Structure pages, master navigation, sitemap, llms.txt, search index, book generation, Power Atlas nodes, Evidence Vault lanes/source cards, Intel Desk, Intel Archive, Human Cost panels, timers, duplicate cleanup, and build commands passed.');
