const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules', '_site', '.wrangler']);
const generatedAllowList = new Set([
  'downloads/the-black-file-matrix-reprogrammed.pdf'
]);
const dynamicWorkerRoutes = new Set([
  'forum-health', '/forum-health',
  'forum-feed', '/forum-feed',
  'forum-feed-main', '/forum-feed-main',
  'forum-feed-speculation', '/forum-feed-speculation',
  'forum-feed-epstein-alive', '/forum-feed-epstein-alive',
  'submit-forum-post', '/submit-forum-post',
  'submit-main-post', '/submit-main-post',
  'submit-speculation-post', '/submit-speculation-post',
  'submit-epstein-alive-post', '/submit-epstein-alive-post',
  'report-forum-post', '/report-forum-post',
  'report-main-post', '/report-main-post',
  'report-speculation-post', '/report-speculation-post',
  'report-epstein-alive-post', '/report-epstein-alive-post',
  'track-event', '/track-event',
  'intro-voice', '/intro-voice',
  'downloads/forum-posts.json', '/downloads/forum-posts.json',
  'downloads/forum-posts.md', '/downloads/forum-posts.md'
]);

const requiredCoreFiles = [
  'index.html', 'styles.css', 'matrix.js', 'books.html', 'search.html', 'black-file.html', 'news.html', 'intel-archive.html', 'timers.html',
  'epstein-files.html', 'black-file-index.html', 'answer-index.html', 'power-atlas.html', 'atlas-index.html', 'evidence-vault.html',
  'evidence-vault-index.html', 'evidence-policy.html', 'network-maps.html', 'sitemap.xml', 'robots.txt', 'llms.txt', 'netlify.toml',
  'data/bulletins.json', 'data/human-cost.json', 'data/power-atlas.json', 'data/evidence-vault.json',
  'scripts/build-phase1-structure.js', 'scripts/build-phase2-power-atlas.js', 'scripts/build-phase3-evidence-vault.js',
  'scripts/cleanup-duplicates.js', 'scripts/pressure-test-site.js'
];

function exists(name) { return fs.existsSync(path.join(root, name)); }
function read(name) { return fs.readFileSync(path.join(root, name), 'utf8'); }
function shouldBootstrap() {
  const generatedCore = ['epstein-files.html', 'power-atlas.html', 'atlas-index.html', 'evidence-vault.html', 'evidence-vault-index.html'];
  return generatedCore.some(file => !exists(file));
}
function bootstrapIfNeeded() {
  if (!shouldBootstrap()) return;
  if (process.env.MR_AUDIT_BOOTSTRAP === '1') {
    console.error('SITE QA BOOTSTRAP REFUSED: generated core files are missing even inside bootstrap build.');
    process.exit(1);
  }
  console.log('SITE QA BOOTSTRAP: generated core files are missing. Running npm run build before audit.');
  execFileSync('npm', ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, MR_AUDIT_BOOTSTRAP: '1' }
  });
  console.log('SITE QA BOOTSTRAP: generated site built. Running final audit pass.');
}

bootstrapIfNeeded();

const publicHtmlFiles = [];
const allFiles = new Set();
const problems = [];
const htmlCache = new Map();

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (entry.isDirectory()) walk(full);
    else {
      allFiles.add(rel);
      if (entry.name.endsWith('.html')) publicHtmlFiles.push(rel);
    }
  }
}
walk(root);

function readHtml(file) {
  if (!htmlCache.has(file)) htmlCache.set(file, fs.readFileSync(path.join(root, file), 'utf8'));
  return htmlCache.get(file);
}
function stripHashAndQuery(href) { return href.split('#')[0].split('?')[0].trim(); }
function isExternalOrProtocol(href) { return /^(https?:|mailto:|tel:|javascript:|data:)/i.test(href) || href.startsWith('#') || href === ''; }
function hasAnchor(html, anchor) {
  if (!anchor) return true;
  const safe = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\sid=["']${safe}["']`, 'i').test(html) || new RegExp(`\\sname=["']${safe}["']`, 'i').test(html);
}
function visibleCopy(html) {
  return html
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}
function requireFile(file) { if (!allFiles.has(file)) problems.push(`missing required core file: ${file}`); }
function needText(file, pattern, label) {
  if (!allFiles.has(file)) return;
  const html = readHtml(file);
  const ok = pattern instanceof RegExp ? pattern.test(html) : html.includes(pattern);
  if (!ok) problems.push(`${file}: missing ${label || pattern}`);
}
function isDynamicWorkerTarget(target) {
  return dynamicWorkerRoutes.has(target) || dynamicWorkerRoutes.has(`/${target}`) || dynamicWorkerRoutes.has(target.replace(/^\//, ''));
}

const bannedPublicPhrases = [
  /ChatGPT/i,
  /author[- ]facing/i,
  /placeholder\s+(copy|text|page|section|content)/i,
  /pending functionality/i,
  /awaiting API/i,
  /next build stage/i,
  /future build/i,
  /I can later/i,
  /TODO/i,
  /FIXME/i,
  /mapping needed/i,
  /ASIN missing/i,
  /once deployed/i,
  /generated by/i,
  /setup guide/i,
  /send exact/i,
  /sales door/i,
  /book sells the deep dive/i,
  /Use this page as a sales door/i,
  /Database-driven archive/i,
  /Source:\s*data\//i,
  /Live generated pages/i,
  /generated pages/i,
  /Archive route/i,
  /Black File funnel/i,
  /Search index:\s*active/i,
  /Reader paths:\s*active/i,
  /Risk timers:\s*active/i
];
const publicExceptions = new Set(['funnel-map.html']);

for (const file of publicHtmlFiles) {
  const html = readHtml(file);
  const isInternalPage = publicExceptions.has(file) || /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html);
  if (!isInternalPage) {
    const copy = visibleCopy(html);
    for (const phrase of bannedPublicPhrases) {
      if (phrase.test(copy)) problems.push(`${file}: public-facing copy contains banned scaffold phrase: ${phrase}`);
    }
  }
  const attrRegex = /(?:href|src)=["']([^"']+)["']/gi;
  let match;
  while ((match = attrRegex.exec(html)) !== null) {
    const raw = match[1].trim();
    if (isExternalOrProtocol(raw)) continue;
    const [targetPart, anchor] = raw.split('#');
    const target = stripHashAndQuery(targetPart);
    if (!target) continue;
    if (isDynamicWorkerTarget(target)) continue;
    const resolved = path.normalize(path.join(path.dirname(file), target)).replace(/\\/g, '/');
    if (resolved.startsWith('..')) { problems.push(`${file}: link escapes site root: ${raw}`); continue; }
    if (!allFiles.has(resolved) && !generatedAllowList.has(resolved)) { problems.push(`${file}: missing internal link/asset target: ${raw} -> ${resolved}`); continue; }
    if (anchor && resolved.endsWith('.html')) {
      const targetHtml = readHtml(resolved);
      if (!hasAnchor(targetHtml, anchor)) problems.push(`${file}: missing anchor target: ${raw}`);
    }
  }
}

requiredCoreFiles.forEach(requireFile);

let atlasEvidenceClasses = new Set();
if (allFiles.has('data/power-atlas.json')) {
  const atlas = JSON.parse(read('data/power-atlas.json'));
  atlasEvidenceClasses = new Set(atlas.evidenceClasses || []);
  const relationshipSet = new Set(atlas.relationshipTypes || []);
  if (!Array.isArray(atlas.nodes) || atlas.nodes.length < 10) problems.push('data/power-atlas.json: expected at least 10 nodes');
  if (!Array.isArray(atlas.evidenceClasses) || atlas.evidenceClasses.length < 8) problems.push('data/power-atlas.json: expected at least 8 evidence classes');
  if (!Array.isArray(atlas.relationshipTypes) || atlas.relationshipTypes.length < 10) problems.push('data/power-atlas.json: expected at least 10 relationship types');
  for (const node of atlas.nodes || []) {
    if (!atlasEvidenceClasses.has(node.evidenceClass)) problems.push(`data/power-atlas.json: node ${node.slug} uses invalid evidenceClass ${node.evidenceClass}`);
    for (const type of node.relationshipTypes || []) if (!relationshipSet.has(type)) problems.push(`data/power-atlas.json: node ${node.slug} uses undeclared relationship type ${type}`);
    const file = `atlas-${node.slug}.html`;
    if (!allFiles.has(file)) problems.push(`missing generated atlas node page: ${file}`);
    else {
      const html = readHtml(file);
      if (!html.includes(node.title)) problems.push(`${file}: missing node title`);
      if (!/Source Boundary/i.test(html)) problems.push(`${file}: missing Source Boundary`);
      if (!/Relationship-Line Types/i.test(html)) problems.push(`${file}: missing Relationship-Line Types`);
    }
  }
}

if (allFiles.has('data/evidence-vault.json')) {
  const vault = JSON.parse(read('data/evidence-vault.json'));
  const sourceHierarchySet = new Set(vault.sourceHierarchy || []);
  const lanes = vault.sourceLanes || [];
  const cards = vault.sourceCards || [];
  const laneSet = new Set(lanes.map(lane => lane.slug));
  if (!Array.isArray(vault.sourceHierarchy) || vault.sourceHierarchy.length < 8) problems.push('data/evidence-vault.json: expected at least 8 source hierarchy entries');
  if (!Array.isArray(vault.claimRules) || vault.claimRules.length < 8) problems.push('data/evidence-vault.json: expected at least 8 claim rules');
  if (lanes.length < 6) problems.push('data/evidence-vault.json: expected at least 6 source lanes');
  if (cards.length < 10) problems.push('data/evidence-vault.json: expected at least 10 source cards');
  for (const lane of lanes) {
    if (!sourceHierarchySet.has(lane.sourceType)) problems.push(`data/evidence-vault.json: lane ${lane.slug} uses invalid sourceType ${lane.sourceType}`);
    if (!atlasEvidenceClasses.has(lane.evidenceClass)) problems.push(`data/evidence-vault.json: lane ${lane.slug} uses invalid evidenceClass ${lane.evidenceClass}`);
    const file = `evidence-lane-${lane.slug}.html`;
    if (!allFiles.has(file)) problems.push(`missing generated evidence lane page: ${file}`);
    else {
      const html = readHtml(file);
      if (!html.includes(lane.title)) problems.push(`${file}: missing lane title`);
      if (!/Source Boundary/i.test(html)) problems.push(`${file}: missing Source Boundary`);
    }
  }
  for (const source of cards) {
    if (!sourceHierarchySet.has(source.sourceType)) problems.push(`data/evidence-vault.json: source ${source.slug} uses invalid sourceType ${source.sourceType}`);
    if (!atlasEvidenceClasses.has(source.evidenceClass)) problems.push(`data/evidence-vault.json: source ${source.slug} uses invalid evidenceClass ${source.evidenceClass}`);
    if (!laneSet.has(source.relatedLane)) problems.push(`data/evidence-vault.json: source ${source.slug} references missing lane ${source.relatedLane}`);
    if (!/^https:\/\//.test(source.url || '')) problems.push(`data/evidence-vault.json: source ${source.slug} must use https source URL`);
    const file = `source-${source.slug}.html`;
    if (!allFiles.has(file)) problems.push(`missing generated source card page: ${file}`);
    else {
      const html = readHtml(file);
      if (!html.includes(source.title)) problems.push(`${file}: missing source title`);
      if (!/Use For/i.test(html)) problems.push(`${file}: missing Use For`);
      if (!/Boundary/i.test(html)) problems.push(`${file}: missing Boundary`);
    }
  }
}

if (allFiles.has('data/bulletins.json')) {
  const bulletins = JSON.parse(read('data/bulletins.json'));
  if (!Array.isArray(bulletins.bulletins) || bulletins.bulletins.length < 3) problems.push('data/bulletins.json: expected at least 3 bulletins');
  for (const b of bulletins.bulletins || []) {
    for (const field of ['id', 'date', 'label', 'headline', 'summary', 'why', 'path']) if (!b[field]) problems.push(`data/bulletins.json: bulletin missing ${field}`);
    if (!Array.isArray(b.sources) || !b.sources.length) problems.push(`data/bulletins.json: ${b.id || b.headline} missing sources`);
  }
}
if (allFiles.has('data/human-cost.json')) {
  const hc = JSON.parse(read('data/human-cost.json'));
  if (!Array.isArray(hc.panels) || hc.panels.length < 6) problems.push('data/human-cost.json: expected at least 6 human-cost panels');
  for (const p of hc.panels || []) for (const field of ['key', 'title', 'figure', 'status', 'description', 'sourceLabel']) if (!p[field]) problems.push(`data/human-cost.json: panel ${p.key || p.title || 'unknown'} missing ${field}`);
}

if (allFiles.has('news.html')) {
  const news = readHtml('news.html');
  const newsItemCount = (news.match(/class=["'][^"']*news-item/g) || []).length;
  const metricCount = (news.match(/class=["'][^"']*metric/g) || []).length;
  if (!/Latest 7 Days/i.test(news)) problems.push('news.html: missing visible Latest 7 Days heading');
  if (newsItemCount < 3) problems.push(`news.html: expected at least 3 visible news bulletin cards, found ${newsItemCount}`);
  if (metricCount < 10) problems.push(`news.html: expected at least 10 visible metric panels, found ${metricCount}`);
  if (!/Human Cost/i.test(news)) problems.push('news.html: missing Human Cost panel');
  if (!/Migration \/ Irregular Immigration/i.test(news)) problems.push('news.html: missing Migration / Irregular Immigration panel');
  if (!/Vaccines/i.test(news)) problems.push('news.html: missing Vaccines panel');
  if (/figure-caption">Worldwide \/ latest sourced figure/.test(news)) problems.push('news.html: duplicate Human Cost article cards still present');
}
if (allFiles.has('intel-archive.html')) {
  const archive = readHtml('intel-archive.html');
  const archiveCards = (archive.match(/<article class=["']card/g) || []).length;
  if (!/BULLETIN ARCHIVE/i.test(archive)) problems.push('intel-archive.html: missing Bulletin Archive heading');
  if (archiveCards < 3) problems.push(`intel-archive.html: expected at least 3 archived bulletin cards, found ${archiveCards}`);
}
for (const file of ['power-atlas.html', 'evidence-vault.html', 'evidence-policy.html', 'network-maps.html']) {
  if (allFiles.has(file)) {
    const html = readHtml(file);
    if (!/Evidence/i.test(html)) problems.push(`${file}: missing evidence language`);
    if (!/Power|Network|Vault|Policy/i.test(html)) problems.push(`${file}: missing Phase 1 structure language`);
  }
}
needText('power-atlas.html', 'id="phase-two-atlas-engine"', 'Phase 2 atlas engine section');
needText('evidence-vault.html', 'id="phase-three-evidence-engine"', 'Phase 3 evidence engine section');
if (allFiles.has('atlas-index.html')) {
  const html = readHtml('atlas-index.html');
  if (!/ATLAS NODES/i.test(html)) problems.push('atlas-index.html: missing Atlas Nodes heading');
  if ((html.match(/Open Node/g) || []).length < 10) problems.push('atlas-index.html: expected at least 10 Open Node links');
}
if (allFiles.has('evidence-vault-index.html')) {
  const html = readHtml('evidence-vault-index.html');
  if (!/SOURCE LANES/i.test(html)) problems.push('evidence-vault-index.html: missing Source Lanes heading');
  if ((html.match(/Source Card/g) || []).length < 10) problems.push('evidence-vault-index.html: expected at least 10 Source Card references');
}
if (allFiles.has('timers.html')) {
  const repeats = (readHtml('timers.html').match(/SIGNALS INCREASING RISK/g) || []).length;
  if (repeats > 1) problems.push(`timers.html: repeated risk terminal found ${repeats} times`);
}
if (allFiles.has('books.html') && /<p>(?:<span class="pill">[^<]+<\/span>\s*){2,}<\/p>/.test(readHtml('books.html'))) problems.push('books.html: visible keyword-pill stuffing still present');

if (problems.length) {
  console.error('\nSITE QA FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log(`SITE QA PASSED: ${publicHtmlFiles.length} HTML files checked.`);
console.log('Internal links/assets passed. Intel Desk, archive, Human Cost panels, migration panel, Phase 1 structure, Phase 2 Power Atlas nodes, Evidence Vault lanes/source cards, board split routes, dynamic Worker routes, sitemap, llms, and data files passed.');
