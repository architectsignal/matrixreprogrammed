const fs = require('fs');
const path = require('path');
const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'public-data-lab-output-test.json');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'public-data-lab.json'), 'utf8'));
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok:Boolean(ok), detail });
const exists = rel => fs.existsSync(path.join(site, rel));
const read = rel => exists(rel) ? fs.readFileSync(path.join(site, rel), 'utf8') : '';

for (const rel of ['data-lab.html','data-lab','data-lab.js','data/public-data-lab.json','index.html','research-tools.html','search-index.json','sitemap.xml','llms.txt']) add(`deployable ${rel}`, exists(rel), exists(rel) ? 'present' : 'missing');
for (const dataset of registry.datasets || []) add(`deployable dataset ${dataset.id}`, exists(dataset.path), dataset.path);

const page = read('data-lab.html');
const runtime = read('data-lab.js');
const home = read('index.html');
const search = read('search-index.json');
add('data lab page marker', page.includes('PUBLIC DATA LABORATORY.') && page.includes('DuckDB-Wasm'));
add('public page is not hidden', !/<div class="page[^"]*(?:commercial-internal|internal-only)/i.test(page));
add('homepage route visible', home.includes('Open Public Data Lab'));
add('search contains data lab route', search.includes('data-lab.html') || search.includes('data-lab'));
add('sitemap and llms contain route', read('sitemap.xml').includes('/data-lab.html') && read('llms.txt').includes('data-lab.html'));
add('read-only guard deployed', runtime.includes('Only SELECT and WITH queries are allowed.') && runtime.includes('Direct file readers are blocked.'));
add('hard cap deployed', page.includes(`${Number(registry.limits.maxRows).toLocaleString()}-row cap`) && runtime.includes('AS matrix_public_query LIMIT'));
add('only approved dataset paths registered', (registry.datasets || []).every(item => runtime.includes('state.manifest.datasets') && /^downloads\//.test(item.path)));
add('no private diagnostics exposed by registry', !(registry.datasets || []).some(item => /(report|test|wiring|build|source-snapshots|browsertrix-output)/i.test(item.path || '')));
add('pinned engines deployed', runtime.includes(`@duckdb/duckdb-wasm@${registry.engines.duckdbWasm}`) && runtime.includes(`@finos/perspective@${registry.engines.perspective}`));

const report = { ok:checks.every(check => check.ok), generatedAt:new Date().toISOString(), datasets:registry.datasets.length, checks };
fs.mkdirSync(path.dirname(reportPath), { recursive:true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (!report.ok) {
  checks.filter(check => !check.ok).forEach(check => console.error(`FAILED: ${check.name}${check.detail ? ` — ${check.detail}` : ''}`));
  process.exit(1);
}
console.log(`Public Data Laboratory deployable output passed: ${checks.length} checks and ${registry.datasets.length} public datasets.`);
