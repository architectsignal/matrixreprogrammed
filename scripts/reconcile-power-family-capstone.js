const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'power-family-capstone-reconcile.json');
const report = { ok: true, generatedAt: new Date().toISOString(), actions: [], checks: [], errors: [] };

function file(rel, base = root) { return path.join(base, rel); }
function read(rel, base = root) { return fs.readFileSync(file(rel, base), 'utf8'); }
function write(rel, value, base = root) { fs.mkdirSync(path.dirname(file(rel, base)), { recursive: true }); fs.writeFileSync(file(rel, base), value); }
function exists(rel, base = root) { return fs.existsSync(file(rel, base)); }
function fail(message) { report.ok = false; report.errors.push(message); }
function check(name, condition, detail = '') { report.checks.push({ name, ok: Boolean(condition), detail }); if (!condition) fail(`${name}${detail ? `: ${detail}` : ''}`); }
function run(script, args = []) {
  const result = spawnSync(process.execPath, [file(script), ...args], { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 1024 * 1024 * 30 });
  report.actions.push({ type: 'run', script, args, status: result.status, stdout: String(result.stdout || '').slice(-2000), stderr: String(result.stderr || '').slice(-2000) });
  if (result.status !== 0) throw new Error(`${script} failed: ${result.stderr || result.stdout}`);
}
function copy(rel, from = root, to = site) {
  const source = file(rel, from);
  const destination = file(rel, to);
  if (!fs.existsSync(source)) throw new Error(`Missing required source file: ${path.relative(root, source)}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  if (rel.endsWith('.html')) {
    const extensionless = file(rel.replace(/\.html$/i, ''), to);
    if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) fs.copyFileSync(source, extensionless);
  }
  report.actions.push({ type: 'copy', rel });
}
function parse(rel, base = root) {
  try { return JSON.parse(read(rel, base)); }
  catch (error) { fail(`${rel} invalid JSON: ${error.message}`); return null; }
}
function ensureSearchRoute(index, item) {
  const found = index.find(entry => entry && entry.url === item.url);
  if (found) Object.assign(found, item);
  else index.push(item);
}
function patchSearchIndex() {
  let index = [];
  if (exists('search-index.json')) {
    try { index = JSON.parse(read('search-index.json')); } catch { index = []; }
  }
  if (!Array.isArray(index)) index = [];
  const routes = [
    { url: 'behind-the-curtain.html', title: 'Behind the Curtain', category: 'Structural Power', layer: 'elite-networks', description: 'Evidence-led structural power, chokepoints, access and continuity analysis.', keywords: ['behind the curtain','structural power','chokepoints','institutional authority'], priority: 96, sourceType: 'html' },
    { url: 'behind-the-curtain-access.html', title: 'The Pyramid of Power', category: 'Structural Power', layer: 'elite-networks', description: 'Evidence-led Pyramid mapping levels of authority, access, gatekeepers and constraints.', keywords: ['pyramid of power','access holders','operators','gatekeepers'], priority: 97, sourceType: 'html' },
    { url: 'behind-the-curtain-capstone.html', title: 'Power-Family Intelligence Layer', category: 'Power-Family Intelligence', layer: 'elite-networks', description: 'Living family members, asset controllers, trustees, advisers, executives, gatekeepers and successors ranked by documented proximity to power.', keywords: ['power families','living people','family office','trustees','gatekeepers','successors','asset control'], priority: 100, sourceType: 'html' },
    { url: 'behind-the-curtain-symbolic-capstone.html', title: 'Symbolic and Historical Annex', category: 'Deep Speculation', layer: 'symbolic-interpretive', description: 'Black Nobility history and Baal, Moloch, Saturn and Lightbringer claims tested in a separate symbolic and speculative evidence lane.', keywords: ['black nobility','baal','moloch','saturn','lightbringer','symbolic annex'], priority: 72, sourceType: 'html' },
    { url: 'data/power-family-intelligence-layer.json', title: 'Power-Family Intelligence Schema', category: 'Machine Data', layer: 'elite-networks', description: 'Machine-readable score dimensions, claim classes, links and unresolved questions.', keywords: ['power-family schema','claim classes','proximity score'], priority: 90, sourceType: 'json-feed' },
    { url: 'data/power-family-curated-people.json', title: 'Power-Family Curated People Registry', category: 'Machine Data', layer: 'elite-networks', description: 'Machine-readable living family controllers, professional gatekeepers, successors and primary sources.', keywords: ['family controllers','gatekeepers','successors','source ledger'], priority: 94, sourceType: 'json-feed' }
  ];
  routes.forEach(item => ensureSearchRoute(index, item));
  write('search-index.json', `${JSON.stringify(index, null, 2)}\n`);
  report.actions.push({ type: 'patch', target: 'search-index.json', routes: routes.length });
}
function patchSitemap() {
  if (!exists('sitemap.xml')) return;
  let xml = read('sitemap.xml');
  const date = '2026-07-25';
  const routes = [
    ['behind-the-curtain.html', '0.95'],
    ['behind-the-curtain-access.html', '0.96'],
    ['behind-the-curtain-capstone.html', '1.00'],
    ['behind-the-curtain-symbolic-capstone.html', '0.72']
  ];
  const additions = routes.filter(([route]) => !xml.includes(`/${route}</loc>`)).map(([route, priority]) => `  <url><loc>https://matrixreprogrammed.com/${route}</loc><lastmod>${date}</lastmod><changefreq>daily</changefreq><priority>${priority}</priority></url>`).join('\n');
  if (additions) xml = xml.replace('</urlset>', `${additions}\n</urlset>`);
  write('sitemap.xml', xml);
  report.actions.push({ type: 'patch', target: 'sitemap.xml', added: additions ? additions.split('\n').length : 0 });
}
function patchLlms() {
  if (!exists('llms.txt')) return;
  let text = read('llms.txt');
  const marker = 'Behind the Curtain Power-Family Intelligence Layer:';
  if (!text.includes(marker)) {
    text = `${text.trim()}\n\n${marker}\n- /behind-the-curtain.html: structural power synthesis and typed relationship map.\n- /behind-the-curtain-access.html: Pyramid of Power and access-holder route.\n- /behind-the-curtain-capstone.html: evidence-led living family members, asset controllers, trustees, advisers, gatekeepers and successors.\n- /behind-the-curtain-symbolic-capstone.html: separate historical and symbolic annex; speculation is not treated as fact.\n- /data/power-family-intelligence-layer.json: score and claim schema.\n- /data/power-family-curated-people.json: curated living-person, family-link and source registry.\n`;
    write('llms.txt', text);
  }
  report.actions.push({ type: 'patch', target: 'llms.txt' });
}
function patchCapstoneHtml() {
  const rel = 'behind-the-curtain-capstone.html';
  let html = read(rel);
  if (!html.includes('behind-the-curtain-symbolic-capstone.html')) {
    const target = '<a class="btn alt" href="behind-the-curtain-access.html">Return to the Pyramid</a>';
    const replacement = `${target}<a class="btn alt" href="behind-the-curtain-symbolic-capstone.html">Open Symbolic & Historical Annex</a>`;
    html = html.includes(target) ? html.replace(target, replacement) : html.replace('</main>', '<section class="pf-section"><div class="wrap"><div class="pf-boundary"><strong>Separate symbolic lane.</strong> Black Nobility and religious or mythological apex theories are preserved in an explicitly historical and speculative annex.</div><div class="pf-actions"><a class="btn alt" href="behind-the-curtain-symbolic-capstone.html">Open Symbolic & Historical Annex</a></div></div></section></main>');
    write(rel, html);
  }
  report.actions.push({ type: 'patch', target: rel });
}
function validateModels() {
  const families = parse('data/behind-the-curtain-family-access.json');
  const curated = parse('data/power-family-curated-people.json');
  const config = parse('data/power-family-intelligence-layer.json');
  const symbolic = parse('data/behind-the-curtain-capstone.json');
  if (!families || !curated || !config || !symbolic) return;
  const familyIds = new Set((families.families || []).map(item => item.id));
  const personIds = new Set((curated.people || []).map(item => item.id));
  const sourceIds = new Set((curated.sources || []).map(item => item.id));
  check('nine documented family structures', (families.families || []).length >= 9, String((families.families || []).length));
  check('curated people count', (curated.people || []).length >= 18, String((curated.people || []).length));
  check('unique curated people', personIds.size === (curated.people || []).length);
  check('all family structures covered', [...familyIds].every(id => (curated.familyPersonLinks || []).some(link => link.familyId === id)));
  check('all links resolve', (curated.familyPersonLinks || []).every(link => familyIds.has(link.familyId) && personIds.has(link.personId)));
  check('each family has controller or successor', [...familyIds].every(id => (curated.familyPersonLinks || []).some(link => link.familyId === id && ['family_controller','family_successor'].includes(link.roleType))));
  check('professional gatekeepers represented', (curated.familyPersonLinks || []).filter(link => link.roleType === 'professional_gatekeeper').length >= 5);
  check('all curated sources resolve', (curated.people || []).every(person => (person.sourceIds || []).length && person.sourceIds.every(id => sourceIds.has(id))));
  check('nine claim classes configured', (config.claimClasses || []).length >= 9);
  check('eight score dimensions configured', (config.scoreDimensions || []).length === 8);
  check('symbolic annex remains bounded', /not established|does not establish|speculative/i.test(`${symbolic.editorialBoundary || ''} ${symbolic.historicalFinding || ''}`));
}
function validateFiles() {
  const required = [
    'behind-the-curtain-capstone.html','power-family-intelligence-layer.css','power-family-intelligence-layer.js',
    'data/power-family-intelligence-layer.json','data/power-family-curated-people.json',
    'behind-the-curtain-symbolic-capstone.html','behind-the-curtain-capstone.js','data/behind-the-curtain-capstone.json'
  ];
  for (const rel of required) {
    check(`source ${rel}`, exists(rel));
    check(`built ${rel}`, exists(rel, site));
  }
  check('built extensionless Power-Family route', exists('behind-the-curtain-capstone', site));
  check('built extensionless symbolic annex route', exists('behind-the-curtain-symbolic-capstone', site));
  if (exists('behind-the-curtain-capstone.html')) {
    const html = read('behind-the-curtain-capstone.html');
    check('Power-Family HTML uses canonical runtime', html.includes('power-family-intelligence-layer.js'));
    check('Power-Family HTML links symbolic annex', html.includes('behind-the-curtain-symbolic-capstone.html'));
    check('Power-Family HTML excludes legacy renderer', !html.includes('<script src="behind-the-curtain-capstone.js"'));
  }
  if (exists('behind-the-curtain-symbolic-capstone.html')) {
    const html = read('behind-the-curtain-symbolic-capstone.html');
    check('symbolic annex identifies separate lane', html.includes('SEPARATE EVIDENCE LANE'));
    check('symbolic annex loads legacy bounded model', html.includes('behind-the-curtain-capstone.js'));
  }
  if (exists('power-family-intelligence-layer.js')) {
    const runtime = read('power-family-intelligence-layer.js');
    check('runtime uses curated people feed', runtime.includes('power-family-curated-people.json'));
    check('runtime excludes broad people registry', !runtime.includes('behind-the-curtain-people-registry.json'));
    const syntax = spawnSync(process.execPath, ['--check', file('power-family-intelligence-layer.js')], { cwd: root, encoding: 'utf8' });
    check('runtime syntax', syntax.status === 0, syntax.stderr || syntax.stdout || 'node --check');
  }
  if (exists('sitemap.xml')) check('sitemap includes Power-Family route', read('sitemap.xml').includes('/behind-the-curtain-capstone.html</loc>'));
  if (exists('llms.txt')) check('llms includes Power-Family route', read('llms.txt').includes('/behind-the-curtain-capstone.html'));
  if (exists('search-index.json')) {
    const index = parse('search-index.json') || [];
    check('search index includes Power-Family route', Array.isArray(index) && index.some(item => item.url === 'behind-the-curtain-capstone.html'));
  }
}
function persist() {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

try {
  if (!fs.existsSync(site)) throw new Error('_site does not exist; normal site build must run first.');
  run('scripts/build-power-family-intelligence-layer.js');
  fs.copyFileSync(file('scripts/power-family-intelligence-layer.runtime.js'), file('power-family-intelligence-layer.js'));
  report.actions.push({ type: 'canonical-runtime', target: 'power-family-intelligence-layer.js' });
  patchCapstoneHtml();
  patchSearchIndex();
  patchSitemap();
  patchLlms();
  const releaseFiles = [
    'behind-the-curtain-capstone.html','power-family-intelligence-layer.css','power-family-intelligence-layer.js',
    'data/power-family-intelligence-layer.json','data/power-family-curated-people.json',
    'behind-the-curtain-symbolic-capstone.html','behind-the-curtain-capstone.js','data/behind-the-curtain-capstone.json',
    'search-index.json','sitemap.xml','llms.txt'
  ];
  releaseFiles.forEach(rel => copy(rel));
  run('scripts/hide-visible-compatibility-markers.js', ['--output']);
  validateModels();
  validateFiles();
} catch (error) {
  fail(String(error && error.stack ? error.stack : error));
}

persist();
if (!report.ok) {
  console.error(`Power-Family Capstone reconciliation failed with ${report.errors.length} issue(s):`);
  report.errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`Power-Family Capstone reconciliation PASS: ${report.checks.length} checks, curated living-person layer, symbolic annex, search, sitemap and deploy bundle aligned.`);
