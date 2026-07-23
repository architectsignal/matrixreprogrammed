const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'release-audit-hard-issue-repair.json');
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  exposureProfiles: 0,
  generatedExposurePages: [],
  repairedPages: [],
  syncedAssets: [],
  checks: [],
  failures: []
};

function full(rel) { return path.join(root, rel); }
function exists(rel) { return fs.existsSync(full(rel)); }
function read(rel) { return exists(rel) ? fs.readFileSync(full(rel), 'utf8') : ''; }
function ensureDir(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
function write(rel, content) {
  const target = full(rel);
  ensureDir(target);
  fs.writeFileSync(target, content);
}
function esc(value = '') {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function safeArray(value) { return Array.isArray(value) ? value : []; }
function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function parseJson(rel, fallback = null) {
  try { return JSON.parse(read(rel)); }
  catch (error) {
    if (fallback !== null) return fallback;
    throw new Error(`${rel} is not valid JSON: ${error.message}`);
  }
}
function syncFile(rel, extensionless = true) {
  if (!fs.existsSync(site) || !exists(rel)) return;
  const source = full(rel);
  const destination = path.join(site, rel);
  ensureDir(destination);
  const size = fs.statSync(source).size;
  if (path.extname(rel).toLowerCase() === '.json' && size > MAX_ASSET_BYTES) {
    const minified = JSON.stringify(JSON.parse(fs.readFileSync(source, 'utf8')));
    const bytes = Buffer.byteLength(minified);
    if (bytes > MAX_ASSET_BYTES) throw new Error(`${rel} remains larger than 25 MiB after minification`);
    fs.writeFileSync(destination, minified);
  } else {
    fs.copyFileSync(source, destination);
  }
  report.syncedAssets.push(rel);
  if (extensionless && rel.endsWith('.html')) {
    const alias = path.join(site, rel.replace(/\.html$/i, ''));
    if (!(fs.existsSync(alias) && fs.statSync(alias).isDirectory())) {
      ensureDir(alias);
      fs.copyFileSync(destination, alias);
      report.syncedAssets.push(rel.replace(/\.html$/i, ''));
    }
  }
}
function recordCheck(name, ok, detail = '') {
  report.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) report.failures.push(detail ? `${name}: ${detail}` : name);
}
function splitScripts(html) {
  return String(html).split(/(<script\b[\s\S]*?<\/script>)/gi);
}
function outsideScripts(html, transform) {
  return splitScripts(html).map((part, index) => index % 2 ? part : transform(part)).join('');
}
function duplicateIds(html) {
  const ids = [];
  outsideScripts(html, segment => {
    for (const match of segment.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)) ids.push(match[2]);
    return segment;
  });
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}
function dedupeIds(html) {
  const seen = new Map();
  return outsideScripts(html, segment => segment.replace(/\bid\s*=\s*(["'])([^"']+)\1/gi, (match, quote, id) => {
    const count = (seen.get(id) || 0) + 1;
    seen.set(id, count);
    return count === 1 ? match : `id=${quote}${id}--dedup-${count}${quote}`;
  }));
}
function ensureEvidenceRoute(rel) {
  if (!exists(rel)) return;
  let html = read(rel);
  html = html.replace(/<divhidden[^>]*\bid\s*=\s*(["'])evidence-badge-system-route\1[^>]*><\/div>/gi, '');
  const hasCanonical = outsideScripts(html, segment => segment).match(/<[^>]+\bid\s*=\s*(["'])evidence-badge-system-route\1[^>]*>/i);
  if (!hasCanonical) {
    const section = '<section id="evidence-badge-system-route" class="section wrap"><h2>Evidence Badge / Claim Classifier</h2><p class="lead">Every major claim should state what the record proves, what it does not prove, and what would strengthen it.</p><div class="cta-row"><a class="btn" href="claim-classifier.html">Open Claim Classifier</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a></div></section>';
    html = html.includes('</main>') ? html.replace('</main>', `${section}</main>`) : `${html}${section}`;
  }
  html = dedupeIds(html);
  write(rel, html);
  syncFile(rel);
  report.repairedPages.push(rel);
}

function exposurePage(profile, updated, boundary) {
  const records = uniqueBy(safeArray(profile.records), item => `${item.url || ''}|${item.title || ''}`);
  const relationships = uniqueBy(safeArray(profile.relationships), item => `${item.with || ''}|${item.type || ''}`);
  const categories = safeArray(profile.exposure_categories);
  const missing = safeArray(profile.missing_records);
  const watch = safeArray(profile.watch_next);
  const recordCards = records.map(record => `<article class="card"><span class="label">${esc(record.grade || record.category || 'public record')}</span><h3>${esc(record.title || 'Source record')}</h3><p>${esc(record.category || 'Public-record exposure route')}</p>${record.url ? `<a class="btn alt" href="${esc(record.url)}" target="_blank" rel="noopener noreferrer">Open source record</a>` : '<p class="warning">Primary source URL still requires confirmation.</p>'}</article>`).join('');
  const relationshipItems = relationships.map(item => `<li><strong>${esc(item.with || 'Unresolved entity')}</strong> — ${esc(item.type || 'public-record co-occurrence')} — score ${esc(item.score == null ? 'not stated' : item.score)}. ${esc(item.boundary || 'Co-occurrence is not proof of coordination.')}</li>`).join('');
  const categoryItems = categories.map(item => `<li>${esc(item)}</li>`).join('');
  const missingItems = missing.map(item => `<li>${esc(item)}</li>`).join('');
  const watchItems = watch.map(item => `<li>${esc(item)}</li>`).join('');
  const description = `${profile.name || profile.id} public-record exposure profile with evidence grades, source routes, relationship candidates, disclosure gaps and watch points.`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(profile.name || profile.id)} Exposure Profile | Matrix Reprogrammed</title><meta name="description" content="${esc(description)}"/><meta property="og:title" content="${esc(profile.name || profile.id)} Exposure Profile"/><meta property="og:description" content="${esc(description)}"/><meta property="og:type" content="website"/><link rel="stylesheet" href="../styles.css"/><link rel="stylesheet" href="../fixes.css"/><link rel="stylesheet" href="../reader-experience.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="../index.html"><img src="../sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="../entity-exposure-index.html">Exposure Index</a><a href="../entity-daily-briefs.html">Entity Briefs</a><a href="../evidence-vault.html">Evidence</a><a href="../search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Evidence-Graded Entity Exposure</div><h1>${esc(profile.name || profile.id)}</h1><p class="lead">${esc(profile.public_reading || 'This profile is a public-record triage route, not a verdict or allegation of private intent.')}</p><div class="cta-row"><a class="btn" href="../entity-briefs/${esc(profile.id)}.html">Open Daily Brief</a><a class="btn alt" href="../data/entity-exposure-index.json">Exposure JSON</a><a class="btn alt" href="../entity-exposure-index.html">All Profiles</a></div></section><section class="section wrap split"><div class="terminal">EXPOSURE PROFILE\n&gt; score: ${esc(profile.exposure_score == null ? 'not stated' : profile.exposure_score)}\n&gt; level: ${esc(profile.exposure_level || 'public-record review')}\n&gt; highest evidence grade: ${esc(profile.highest_evidence_grade || 'not classified')}\n&gt; updated: ${esc(updated || 'not stated')}\n&gt; boundary: not a verdict</div><aside class="card redline"><h2>Evidence Boundary</h2><p>${esc(profile.boundary || boundary || 'Exposure scoring is public-record triage. Association, mention, contract or litigation does not by itself establish wrongdoing.')}</p></aside></section><section class="section wrap"><h2>Exposure Categories</h2><div class="card"><ul>${categoryItems || '<li>General public-record exposure route.</li>'}</ul></div></section><section class="section wrap"><h2>Source Records</h2><div class="grid">${recordCards || '<article class="card"><h3>Source confirmation required</h3><p>No primary record has yet been attached to this profile. The page remains a watch route, not a finding.</p></article>'}</div></section><section class="section wrap"><h2>Relationship Candidates</h2><div class="card"><ul>${relationshipItems || '<li>No relationship candidates are currently recorded.</li>'}</ul></div></section><section class="section wrap split"><article class="card"><h2>Missing Records</h2><ul>${missingItems || '<li>Confirm the primary source record and archive route.</li>'}</ul></article><article class="card"><h2>Watch Next</h2><ul>${watchItems || '<li>Monitor official sources for a material update.</li>'}</ul></article></section></main><footer class="footer wrap"><p><strong>Matrix Reprogrammed evidence boundary:</strong> this page summarizes public-record signals. It does not establish guilt, private intent or operational control.</p></footer></div><script src="../matrix.js"></script><script src="../analytics.js"></script><script src="../investigation-pulse.js"></script></body></html>`;
}

function buildExposurePages() {
  const index = parseJson('data/entity-exposure-index.json', { profiles: [] });
  const profiles = safeArray(index.profiles);
  report.exposureProfiles = profiles.length;
  fs.mkdirSync(full('entity-exposure'), { recursive: true });
  for (const profile of profiles) {
    if (!profile || !/^[a-z0-9][a-z0-9-]*$/i.test(String(profile.id || ''))) {
      report.failures.push(`Invalid exposure profile id: ${profile && profile.id}`);
      continue;
    }
    const rel = `entity-exposure/${profile.id}.html`;
    write(rel, exposurePage(profile, index.updated, index.boundary));
    syncFile(rel);
    report.generatedExposurePages.push(rel);
  }
}

function rebuildEpsteinNetwork() {
  const builder = full('scripts/build-epstein-relationship-intelligence.js');
  const source = full('data/epstein-relationship-intelligence.json');
  if (!fs.existsSync(builder)) {
    report.failures.push('Missing scripts/build-epstein-relationship-intelligence.js');
    return;
  }
  if (!fs.existsSync(source) || fs.statSync(source).size < 10) {
    report.failures.push('Epstein relationship intelligence source is missing or empty');
    return;
  }
  const result = spawnSync(process.execPath, [builder], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 80 * 1024 * 1024
  });
  if (result.status !== 0) {
    report.failures.push(`Epstein relationship intelligence build failed: ${String(result.stderr || result.stdout).slice(-2000)}`);
    return;
  }
  let page = read('epstein-email-network.html');
  page = page.replace(/<button(?![^>]*\btype=)/gi, '<button type="button"');
  write('epstein-email-network.html', page);
  for (const rel of [
    'epstein-email-network.html',
    'downloads/epstein-relationship-intelligence.json',
    'downloads/epstein-relationship-profile-index.json',
    'data/epstein-relationship-profile-index.json'
  ]) syncFile(rel, rel.endsWith('.html'));
  report.repairedPages.push('epstein-email-network.html');
}

function ensureEpsteinInvestigatorAnchor() {
  const rel = 'ai-speculative-conclusions.html';
  if (!exists(rel)) {
    report.failures.push(`${rel} is missing`);
    return;
  }
  let html = read(rel);
  const hasAnchor = outsideScripts(html, segment => segment).match(/\bid\s*=\s*(["'])epstein-investigator-lane\1/i);
  if (!hasAnchor) {
    const block = '<section id="epstein-investigator-lane" class="section wrap"><div class="card redline"><span class="label">AI Detective · Epstein Files</span><h2>Epstein Investigator Lane</h2><p>This lane separates documented records, supported inference, unresolved identity, contrary evidence and speculation. Association is not guilt.</p><div class="cta-row"><a class="btn" href="epstein-email-network.html">Open Email Network</a><a class="btn alt" href="epstein-files.html">Verified Epstein File Hub</a></div></div></section>';
    html = html.includes('</main>') ? html.replace('</main>', `${block}</main>`) : `${html}${block}`;
    write(rel, html);
  }
  syncFile(rel);
  report.repairedPages.push(rel);
}

function repairAccessibleRedirects() {
  const redirect = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Making Money | Matrix Reprogrammed</title><meta name="description" content="Open the Matrix Reprogrammed Making Money guide covering practical income systems, business models and evidence-led financial research."/><meta http-equiv="refresh" content="0;url=../making-money.html"/><link rel="canonical" href="../making-money.html"/></head><body><main><h1>Making Money</h1><p>This route has moved to the full Making Money guide.</p><p><a href="../making-money.html">Open Making Money</a></p></main></body></html>';
  write('follow-the-money/making-money.html', redirect);
  syncFile('follow-the-money/making-money.html');
  report.repairedPages.push('follow-the-money/making-money.html');

  const rel = 'follow-the-money.html';
  if (exists(rel)) {
    let html = read(rel);
    if (!/<meta\s+name=["']description["']/i.test(html)) {
      const meta = '<meta name="description" content="Follow ownership, wealth, companies, funds, contracts, investments and public financial records through the Matrix Reprogrammed money intelligence system."/>';
      html = /<title[^>]*>[\s\S]*?<\/title>/i.test(html)
        ? html.replace(/(<title[^>]*>[\s\S]*?<\/title>)/i, `$1${meta}`)
        : html.replace(/<head[^>]*>/i, match => `${match}${meta}`);
      write(rel, html);
    }
    syncFile(rel);
    report.repairedPages.push(rel);
  }
}

function validate() {
  const index = parseJson('data/entity-exposure-index.json', { profiles: [] });
  for (const profile of safeArray(index.profiles)) {
    const rel = `entity-exposure/${profile.id}.html`;
    recordCheck(`exposure page ${profile.id}`, exists(rel) && fs.statSync(full(rel)).size > 300, rel);
    if (fs.existsSync(site)) recordCheck(`built exposure page ${profile.id}`, fs.existsSync(path.join(site, rel)), `_site/${rel}`);
  }
  for (const rel of ['black-file.html', 'download-center.html']) {
    if (!exists(rel)) continue;
    const duplicates = duplicateIds(read(rel));
    recordCheck(`${rel} duplicate IDs`, duplicates.length === 0, duplicates.join(', '));
  }
  recordCheck('Epstein email network page', exists('epstein-email-network.html') && fs.statSync(full('epstein-email-network.html')).size > 1000, 'epstein-email-network.html');
  recordCheck('Epstein public relationship dataset', exists('downloads/epstein-relationship-intelligence.json') && fs.statSync(full('downloads/epstein-relationship-intelligence.json')).size > 1000, 'downloads/epstein-relationship-intelligence.json');
  recordCheck('Epstein relationship profile index', exists('downloads/epstein-relationship-profile-index.json') && fs.statSync(full('downloads/epstein-relationship-profile-index.json')).size > 1000, 'downloads/epstein-relationship-profile-index.json');
  recordCheck('Epstein investigator anchor', /\bid\s*=\s*(["'])epstein-investigator-lane\1/i.test(read('ai-speculative-conclusions.html')), 'ai-speculative-conclusions.html#epstein-investigator-lane');
  recordCheck('Accessible Making Money redirect', /<html\s+lang=["']en["']/i.test(read('follow-the-money/making-money.html')) && /<main>/i.test(read('follow-the-money/making-money.html')) && /<h1>/i.test(read('follow-the-money/making-money.html')), 'follow-the-money/making-money.html');
}

try {
  buildExposurePages();
  rebuildEpsteinNetwork();
  ensureEpsteinInvestigatorAnchor();
  ensureEvidenceRoute('black-file.html');
  ensureEvidenceRoute('download-center.html');
  repairAccessibleRedirects();
  validate();
} catch (error) {
  report.failures.push(error && error.stack ? error.stack : String(error));
}

report.ok = report.failures.length === 0;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error('RELEASE AUDIT HARD-ISSUE REPAIR FAILED');
  report.failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Release audit repair passed: ${report.generatedExposurePages.length} exposure pages generated, Epstein network rebuilt, duplicate IDs removed, missing anchor restored and actionable accessibility warnings repaired.`);
