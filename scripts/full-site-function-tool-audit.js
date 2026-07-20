const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');

const root = process.cwd();
const postbuild = process.argv.includes('--postbuild');
const base = postbuild && fs.existsSync(path.join(root, '_site')) ? path.join(root, '_site') : root;
const reportDir = path.join(root, 'downloads');
const hard = [];
const warnings = [];
const stats = { html: 0, js: 0, json: 0, links: 0, localFetches: 0, forms: 0, buttons: 0, criticalTools: 0 };
const ignoredDirs = new Set(['.git', '.github', 'node_modules', '.wrangler', 'scripts', 'tools', 'netlify', 'evidence-archive', 'source-snapshots', 'browsertrix-output', 'templates']);
if (base === root) ignoredDirs.add('_site');

const leakedMarkers = [
  'new-intelligence-toolspreservedaftervisiblede-duplication',
  'AuthorityHubroutepreservedaftervisiblede-duplication',
  'SchemaIndexroutepreservedaftervisiblede-duplication',
  'FeedCenterroutepreservedaftervisiblede-duplication',
  'ShareCenterroutepreservedaftervisiblede-duplication',
  'LaunchRoomroutepreservedaftervisiblede-duplication',
  'OfferCenterroutepreservedaftervisiblede-duplication',
  'DailyDroproutepreservedaftervisiblede-duplication',
  'Evidencebadgeroutepreservedaftervisiblede-duplication',
  'SourceDocumentVaultroutepreservedaftervisiblede-duplication',
  'reader-usefulness-routepreservedaftervisiblede-duplication',
  'figure-source-statuspreservedaftervisiblede-duplication',
  'preservedaftervisiblede-duplication'
];
const dynamicPrefixes = [
  '/api/', '/forum-', '/submit-', '/report-', '/track-', '/member-', '/billing-', '/admin-', '/newsletter-', '/osint-', '/health', '/deploy-status', '/intro-voice', '/intro-voice'
];
const criticalPages = new Set([
  'index.html', 'start-here.html', 'search.html', 'live-intel.html', 'books.html',
  'geographic-power-atlas.html', 'evidence-network-map.html', 'evidence-timeline.html',
  'data-lab.html', 'research-tools.html', 'timers.html', 'ai-speculative-conclusions.html',
  'membership.html', 'member-login.html', 'member-dashboard.html', 'billing-dashboard.html',
  'forum.html', 'dark-speculation-forum.html', 'download-center.html'
]);

function rel(file) { return path.relative(base, file).split(path.sep).join('/'); }
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
function read(file) { return fs.readFileSync(file, 'utf8'); }
function localPathExists(target, fromFile) {
  const clean = String(target || '').split('#')[0].split('?')[0].trim();
  if (!clean || clean === '/' || clean.startsWith('#')) return true;
  if (/^(?:https?:|mailto:|tel:|javascript:|data:|blob:)/i.test(clean)) return true;
  if (dynamicPrefixes.some(prefix => clean.startsWith(prefix))) return true;
  const decoded = decodeURIComponent(clean).replace(/^\//, '');
  const resolved = clean.startsWith('/') ? path.join(base, decoded) : path.resolve(path.dirname(fromFile), decoded);
  const candidates = [resolved];
  if (!path.extname(resolved)) candidates.push(`${resolved}.html`, path.join(resolved, 'index.html'));
  return candidates.some(candidate => fs.existsSync(candidate));
}
function idsIn(html) {
  return [...html.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]);
}
function checkJsSyntax(file) {
  const source = read(file);
  const moduleLike = /(^|\n)\s*(?:import|export)\s/m.test(source) || rel(file).endsWith('.mjs');
  let target = file;
  let temp = '';
  if (moduleLike && !file.endsWith('.mjs')) {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-audit-'));
    target = path.join(temp, `${path.basename(file, '.js')}.mjs`);
    fs.writeFileSync(target, source);
  }
  const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
  if (temp) fs.rmSync(temp, { recursive: true, force: true });
  if (result.status !== 0) hard.push(`${rel(file)}: JavaScript syntax error: ${(result.stderr || result.stdout || '').trim().slice(0, 500)}`);
}
function checkHtml(file) {
  stats.html++;
  const name = rel(file);
  const html = read(file);
  const ids = idsIn(html);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicateIds.length) hard.push(`${name}: duplicate IDs ${duplicateIds.join(', ')}`);
  for (const marker of leakedMarkers) if (html.includes(marker)) hard.push(`${name}: leaked internal compatibility marker ${marker}`);
  for (const obsolete of ['€19/month', '€49/month', 'Paid access to premium briefs']) if (html.includes(obsolete)) hard.push(`${name}: obsolete public copy ${obsolete}`);

  const idSet = new Set(ids);
  const attributes = [...html.matchAll(/(?:^|\s)(?:href|src|action)\s*=\s*(["'])([^"']+)\1/gi)];
  for (const match of attributes) {
    const target = match[2].trim();
    stats.links++;
    if (target.startsWith('#')) {
      const anchor = target.slice(1);
      if (anchor && !idSet.has(anchor)) (criticalPages.has(name) ? hard : warnings).push(`${name}: missing local anchor ${target}`);
      continue;
    }
    if (!localPathExists(target, file)) (criticalPages.has(name) ? hard : warnings).push(`${name}: missing local target ${target}`);
  }

  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gi)];
  stats.forms += forms.length;
  for (const form of forms) {
    if (!/<(?:button|input)\b[^>]*(?:type\s*=\s*["']submit["']|<button)/i.test(form[0]) && !/data-[\w-]+/i.test(form[0])) warnings.push(`${name}: form has no obvious submit control or JavaScript hook`);
  }
  stats.buttons += (html.match(/<button\b/gi) || []).length;
}
function checkJs(file) {
  stats.js++;
  checkJsSyntax(file);
  const source = read(file);
  const fetches = [...source.matchAll(/\bfetch\s*\(\s*(["'`])([^"'`$]+)\1/g)];
  for (const match of fetches) {
    const target = match[2].trim();
    if (/^https?:/i.test(target)) continue;
    stats.localFetches++;
    if (!localPathExists(target, file)) {
      const name = rel(file);
      const severity = /geographic-power-atlas|search|membership|forum|research-tools|evidence-|data-lab|timers|speculative/.test(name) ? hard : warnings;
      severity.push(`${name}: fetch target not found ${target}`);
    }
  }
}
function checkJson(file) {
  stats.json++;
  try { JSON.parse(read(file)); }
  catch (error) { hard.push(`${rel(file)}: invalid JSON: ${error.message}`); }
}
function requireFile(name, markers = []) {
  stats.criticalTools++;
  const file = path.join(base, name);
  if (!fs.existsSync(file)) {
    hard.push(`critical tool file missing: ${name}`);
    return;
  }
  const text = read(file);
  for (const marker of markers) if (!text.includes(marker)) hard.push(`${name}: missing required marker ${marker}`);
}

const files = walk(base);
for (const file of files) {
  if (file.endsWith('.html') || (!path.extname(file) && !fs.statSync(file).isDirectory())) {
    const text = read(file);
    if (/<!doctype html|<html\b/i.test(text)) checkHtml(file);
  } else if (file.endsWith('.js') || file.endsWith('.mjs')) checkJs(file);
  else if (file.endsWith('.json')) checkJson(file);
}

requireFile('geographic-power-atlas.html', ['id="atlas-search"', 'id="atlas-reset"', 'id="power-atlas-map"', 'id="power-atlas-list"', 'maplibre-gl@5.24.0/dist/maplibre-gl.js', 'geographic-power-atlas.js']);
requireFile('geographic-power-atlas.js', ['async function waitForMapLibre', 'globalThis.maplibregl', 'fetchAtlasData', 'loadMapLibraries', 'Interactive map unavailable']);
requireFile('data/geographic-power-atlas.json', ['"locations"', '"categories"']);
requireFile('data/geographic-power-atlas-data.json', ['"FeatureCollection"', '"features"']);
requireFile('search.html', ['id="archive-search"', 'id="search-results"']);
requireFile('search.js', ['search-index.json', 'cache:\'no-store\'']);
requireFile('search-index.json');
requireFile('evidence-network-map.html', ['evidence-network-map.js']);
requireFile('evidence-network-map.js');
requireFile('data/evidence-network-map.json');
requireFile('evidence-timeline.html', ['evidence-timeline.js']);
requireFile('evidence-timeline.js');
requireFile('data/evidence-timeline.json');
requireFile('data-lab.html', ['data-lab.js']);
requireFile('data-lab.js');
requireFile('data/public-data-lab.json');
requireFile('research-tools.html', ['research-tools.js']);
requireFile('research-tools.js');
requireFile('timers.html', ['MISSION TIMERS.']);
requireFile('data/global-risk-clocks.json');
requireFile('ai-speculative-conclusions.html', ['HYPOTHESES.', 'ai-speculative-conclusions.js']);
requireFile('ai-speculative-conclusions.js');
requireFile('data/ai-speculative-conclusions.json');
requireFile('membership.html', ['Free Member', 'Monthly donation', 'same underlying public-source evidence', 'paypal-membership.js']);
requireFile('paypal-membership.js', ['/api/paypal/subscription/create', 'Continue securely to PayPal', 'location.assign']);
requireFile('member-login.html');
requireFile('member-dashboard.html', ['member-dashboard-app.js']);
requireFile('billing-dashboard.html', ['billing-dashboard.js']);
requireFile('forum.html', ['forum.js']);
requireFile('forum.js', ['/forum-feed-main', '/submit-main-post']);
requireFile('download-center.html');

const atlasRuntime = fs.existsSync(path.join(base, 'geographic-power-atlas.js')) ? read(path.join(base, 'geographic-power-atlas.js')) : '';
const atlasPage = fs.existsSync(path.join(base, 'geographic-power-atlas.html')) ? read(path.join(base, 'geographic-power-atlas.html')) : '';
if (/import\s+\*\s+as\s+maplibregl/.test(atlasRuntime)) hard.push('geographic-power-atlas.js still uses fragile namespace static import');
if (atlasRuntime.includes('maplibre-gl@6.0.0-20')) hard.push('geographic-power-atlas.js still uses prerelease MapLibre 6.0.0-20');
if (atlasRuntime.includes('maplibre-gl.mjs') || atlasRuntime.includes('MAPLIBRE_MODULE_URL')) hard.push('geographic-power-atlas.js still uses the unsupported MapLibre module URL');
if (!atlasPage.includes('maplibre-gl@5.24.0/dist/maplibre-gl.js')) hard.push('geographic-power-atlas.html does not load the supported MapLibre browser bundle');

fs.mkdirSync(reportDir, { recursive: true });
const report = {
  ok: hard.length === 0,
  generatedAt: new Date().toISOString(),
  mode: postbuild ? 'postbuild-cloudflare-output' : 'source-tree',
  base: path.relative(root, base) || '.',
  stats,
  hardIssues: hard,
  warnings,
  boundary: 'Static audit validates local routes, syntax, JSON, critical DOM contracts, core tool wiring, supported MapLibre browser-bundle wiring, public-copy leaks and generated Cloudflare assets. Authenticated transactions and third-party services still require live environment verification.'
};
fs.writeFileSync(path.join(reportDir, 'full-site-function-tool-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(reportDir, 'full-site-function-tool-audit.md'), [
  '# Full Site Function and Tool Audit', '',
  `Generated: ${report.generatedAt}`,
  `Mode: ${report.mode}`,
  `Status: ${report.ok ? 'PASS' : 'FAIL'}`, '',
  '## Coverage', '',
  ...Object.entries(stats).map(([key, value]) => `- ${key}: ${value}`), '',
  '## Hard Issues', '', ...(hard.length ? hard.map(item => `- ${item}`) : ['- None']), '',
  '## Warnings', '', ...(warnings.length ? warnings.map(item => `- ${item}`) : ['- None']), '',
  `Boundary: ${report.boundary}`
].join('\n'));

if (hard.length) {
  console.error(`FULL SITE FUNCTION AND TOOL AUDIT FAILED: ${hard.length} hard issue(s), ${warnings.length} warning(s).`);
  hard.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`FULL SITE FUNCTION AND TOOL AUDIT PASSED: ${stats.html} HTML surfaces, ${stats.js} scripts, ${stats.json} JSON feeds, ${stats.links} links/assets, ${stats.criticalTools} critical tool contracts. Warnings: ${warnings.length}.`);
