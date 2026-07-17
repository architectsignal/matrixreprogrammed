const fs = require('fs');
const path = require('path');
const { isGeneratedEliteReport } = require('./cleanup-generated-machine-pages.js');

const root = process.cwd();
const failures = [];
const inventory = {};

function readJson(relative, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); }
  catch { return fallback; }
}

function listFiles(directory) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name).sort();
}

function stem(name) { return name.replace(/\.html$/i, ''); }
function isHtmlOrAlias(name) { return name.endsWith('.html') || !path.extname(name); }

function auditNamespace({ name, relativeDir, expectedIds, generatedPredicate = isHtmlOrAlias }) {
  const expected = new Set(expectedIds.filter(Boolean));
  const result = { expected: expected.size, roots: [] };
  for (const base of [root, path.join(root, '_site')]) {
    if (base.endsWith(`${path.sep}_site`) && !fs.existsSync(base)) continue;
    const directory = path.join(base, relativeDir);
    const files = listFiles(directory).filter(generatedPredicate);
    const actualIds = new Set(files.map(stem));
    const stale = [...actualIds].filter(id => !expected.has(id)).sort();
    const missingHtml = [...expected].filter(id => !fs.existsSync(path.join(directory, `${id}.html`))).sort();
    const missingAliases = base.endsWith(`${path.sep}_site`)
      ? [...expected].filter(id => !fs.existsSync(path.join(directory, id))).sort()
      : [];
    const rootName = base === root ? 'source' : '_site';
    result.roots.push({ root: rootName, files: files.length, actualIds: actualIds.size, stale, missingHtml, missingAliases });
    for (const id of stale) failures.push(`${name} ${rootName}: stale generated page ${relativeDir}/${id}`);
    for (const id of missingHtml) failures.push(`${name} ${rootName}: missing ${relativeDir}/${id}.html`);
    for (const id of missingAliases) failures.push(`${name} ${rootName}: missing extensionless route ${relativeDir}/${id}`);
  }
  inventory[name] = result;
}

const daily = readJson('data/entity-daily-briefs.json', { briefs: [] });
const exposure = readJson('data/entity-exposure-index.json', { profiles: [] });
const elite = readJson('data/elite-reports.json', { reports: [] });

const dailyIds = (Array.isArray(daily.briefs) ? daily.briefs : []).slice(0, 120).map(item => String(item?.id || '').trim()).filter(Boolean);
const exposureIds = (Array.isArray(exposure.profiles) ? exposure.profiles : []).slice(0, 120).map(item => String(item?.id || '').trim()).filter(Boolean);
const eliteIds = (Array.isArray(elite.reports) ? elite.reports : []).map(item => String(item?.id || '').trim()).filter(Boolean);

if (!dailyIds.length) failures.push('Entity Daily Brief index has no page IDs.');
if (!exposureIds.length) failures.push('Entity Exposure index has no page IDs.');
if (!eliteIds.length) failures.push('Elite Reports index has no page IDs.');

for (const [label, ids] of [['Entity Daily Brief', dailyIds], ['Entity Exposure', exposureIds], ['Elite Report', eliteIds]]) {
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) failures.push(`${label} index contains duplicate IDs: ${[...new Set(duplicates)].join(', ')}`);
}

auditNamespace({ name: 'entityBriefs', relativeDir: 'entity-briefs', expectedIds: dailyIds });
auditNamespace({ name: 'entityExposure', relativeDir: 'entity-exposure', expectedIds: exposureIds });
auditNamespace({ name: 'eliteReports', relativeDir: 'reports', expectedIds: eliteIds, generatedPredicate: isGeneratedEliteReport });

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  failures,
  inventory,
  boundary: 'Generated entity briefs, entity exposure pages and elite reports must exactly match their current JSON indexes. The Cloudflare bundle must include both .html and extensionless aliases, with no ghost pages from earlier build passes.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'generated-machine-pages-test.json'), `${JSON.stringify(report, null, 2)}\n`);

if (!report.ok) {
  console.error(`GENERATED MACHINE PAGES TEST FAILED: ${failures.length} issue(s).`);
  failures.slice(0, 200).forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Generated machine pages test passed: ${dailyIds.length} entity briefs, ${exposureIds.length} exposure pages and ${eliteIds.length} elite reports match source and Cloudflare output.`);
