const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = process.cwd();
function exists(p) { return fs.existsSync(path.join(root, p)); }
function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }
function write(p, v) { fs.writeFileSync(path.join(root, p), v); }
function inject(html, marker, block, beforeNeedle) {
  const start = `<!-- ${marker}:start -->`;
  const end = `<!-- ${marker}:end -->`;
  const wrapped = `${start}${block}${end}`;
  if (html.includes(start) && html.includes(end)) return html.replace(new RegExp(`${start}[\\s\\S]*?${end}`), wrapped);
  if (html.includes(beforeNeedle)) return html.replace(beforeNeedle, wrapped + beforeNeedle);
  return html + wrapped;
}
function ensureScript(html, src) {
  if (html.includes(`src="${src}"`) || html.includes(`src='${src}'`)) return html;
  return html.replace('</body>', `<script src="${src}"></script></body>`);
}
function runNodeScript(script) {
  const full = path.join(root, script);
  if (!fs.existsSync(full)) return { skipped: true };
  const result = spawnSync(process.execPath, [full], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${script} failed with ${result.status}`);
  return { ok: true };
}
const controlPanel = `<section class="section wrap" id="control-structure-entry"><div class="eyebrow">Main Mission</div><h2>CONTROL STRUCTURE MAP.</h2><p class="lead">Start with the rails ordinary life depends on: money, identity, information, emergency power, institutions, records and missing records.</p><div class="grid"><article class="card redline"><span class="label">MAP</span><h3>Control Structure Map</h3><p>The intuitive seven-layer route through the whole site.</p><a class="btn" href="control-structure.html">Open Control Map</a></article><article class="card redline"><span class="label">BRAIN</span><h3>Daily Brain Brief</h3><p>What the machine sees today and which records matter.</p><a class="btn alt" href="daily-brain-brief.html">Open Daily Brief</a></article><article class="card redline"><span class="label">SOURCE</span><h3>Evidence Vault</h3><p>Check the source route before accepting any claim.</p><a class="btn alt" href="evidence-vault.html">Open Evidence</a></article></div><div data-living-pulse></div></section>`;
const brainPanel = `<section class="section wrap" id="living-brain-pulse"><h2>Living Machine Pulse</h2><p class="lead">The brain shows what it sees now, what changed, and which records matter next.</p><div data-living-pulse></div></section>`;
const intelligencePanel = `<section class="section wrap" id="machine-intelligence-entry"><div class="eyebrow">Change Detection</div><h2>MACHINE INTELLIGENCE.</h2><p class="lead">Record movement, entity relationship candidates and evidence-grade changes feed the machine as a separate intelligence layer.</p><div class="cta-row"><a class="btn" href="machine-intelligence.html">Open Machine Intelligence</a><a class="btn alt" href="data/change-detection.json">Change Detection</a><a class="btn alt" href="data/entity-relationship-scores.json">Relationship Scores</a></div></section>`;
const entityBriefPanel = `<section class="section wrap" id="entity-daily-briefs-entry"><div class="eyebrow">Entity Briefing Factory</div><h2>ENTITY DAILY BRIEFS.</h2><p class="lead">Tracked people, institutions, companies, agencies and system contributors receive user-friendly briefs: at a glance, what changed, why it matters, evidence grade, source routes, missing records and watch next.</p><div class="cta-row"><a class="btn" href="entity-daily-briefs.html">Open Entity Briefs</a><a class="btn alt" href="data/entity-daily-briefs.json">Briefs JSON</a><a class="btn alt" href="downloads/entity-daily-briefs.md">Download Briefs</a></div></section>`;
const reviewPanel = `<section class="section wrap" id="entity-record-review-entry"><div class="eyebrow">Entity Record Review</div><h2>ENTITY RECORD REVIEW.</h2><p class="lead">Tracked entities are reviewed through source-graded legal records, financial records, public contracts, disclosure gaps, relationship candidates and missing-record triggers.</p><div class="cta-row"><a class="btn" href="entity-exposure-index.html">Open Record Review</a><a class="btn alt" href="data/entity-exposure-index.json">Review JSON</a><a class="btn alt" href="downloads/entity-exposure-index.md">Download Review</a></div></section>`;
const contractorPanel = `<section class="section wrap" id="private-contractor-intelligence-entry"><div class="eyebrow">Private Contractor Intelligence</div><h2>PRIVATE CONTRACTOR TRACKER.</h2><p class="lead">Private military, security, intelligence, logistics, surveillance and government-platform contractors receive their own briefs: lineage, main players, contracts, public-money routes, legal records, ownership changes, relationship candidates and missing records.</p><div class="cta-row"><a class="btn" href="private-contractor-tracker.html">Open Contractor Tracker</a><a class="btn alt" href="data/private-contractor-intelligence.json">Contractor JSON</a><a class="btn alt" href="downloads/private-contractor-intelligence.md">Download Brief</a></div></section>`;
for (const file of ['index.html', 'matrix-brain.html', 'daily-brain-brief.html', 'search.html']) {
  if (!exists(file)) continue;
  let html = read(file);
  if (file === 'index.html') html = inject(html, 'control-structure-entry', controlPanel, '<section id="machine-three-doors"');
  if (file === 'matrix-brain.html') html = inject(html, 'living-brain-pulse', brainPanel, '<section class="section wrap"><h2>Machine Pulse</h2>');
  if (file === 'daily-brain-brief.html') {
    html = inject(html, 'machine-intelligence-entry', intelligencePanel, '</main>');
    html = inject(html, 'entity-daily-briefs-entry', entityBriefPanel, '</main>');
    html = inject(html, 'entity-record-review-entry', reviewPanel, '</main>');
    html = inject(html, 'private-contractor-intelligence-entry', contractorPanel, '</main>');
  }
  if (file === 'search.html') html = inject(html, 'search-mission-panel', controlPanel, '</main>');
  html = ensureScript(html, 'living-pulse.js');
  write(file, html);
}
if (process.env.MATRIX_SKIP_RECORD_FEEDS !== '1') {
  try {
    runNodeScript('scripts/fetch-public-record-feeds.js');
    runNodeScript('scripts/patch-brain-with-record-events.js');
    runNodeScript('scripts/build-change-detection-engine.js');
    runNodeScript('scripts/build-entity-daily-briefs.js');
    runNodeScript('scripts/build-entity-record-review.js');
    runNodeScript('scripts/build-private-contractor-intelligence.js');
    runNodeScript('scripts/build-master-brief-engine.js');
    runNodeScript('scripts/repair-nested-brief-links.js');
    runNodeScript('scripts/machine-feed-runner-test.js');
    runNodeScript('scripts/change-detection-engine-test.js');
    runNodeScript('scripts/entity-daily-briefs-test.js');
    runNodeScript('scripts/private-contractor-intelligence-test.js');
    runNodeScript('scripts/master-brief-engine-test.js');
  } catch (error) {
    console.warn(`Machine intelligence integration warning: ${error.message}`);
  }
}
console.log('Living control interface built: control map linked, brain pulse injected, contractor intelligence and Master Brief Engine integrated.');
