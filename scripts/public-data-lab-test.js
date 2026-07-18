const fs = require('fs');
const path = require('path');
const root = process.cwd();
const registryPath = path.join(root, 'data', 'public-data-lab.json');
const pagePath = path.join(root, 'data-lab.html');
const runtimePath = path.join(root, 'data-lab.js');
const reportPath = path.join(root, 'downloads', 'public-data-lab-test.json');
const read = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const json = file => { try { return JSON.parse(read(file)); } catch { return null; } };
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok:Boolean(ok), detail });

const registry = json(registryPath);
const datasets = registry?.datasets || [];
const presets = registry?.presets || [];
const page = read(pagePath);
const runtime = read(runtimePath);
const ids = datasets.map(item => item.id);
const tables = datasets.map(item => item.table);

add('registry parses', registry && Array.isArray(datasets) && Array.isArray(presets));
add('approved dataset coverage', datasets.length >= 4, `${datasets.length} datasets`);
add('reproducible preset coverage', presets.length >= 8, `${presets.length} presets`);
add('unique dataset ids', new Set(ids).size === ids.length);
add('unique SQL view names', new Set(tables).size === tables.length);
add('safe SQL view identifiers', tables.every(value => /^[a-z][a-z0-9_]*$/i.test(value || '')), tables.filter(value => !/^[a-z][a-z0-9_]*$/i.test(value || '')).join(', '));
add('same-origin public downloads only', datasets.every(item => /^downloads\/[a-z0-9._/-]+$/i.test(item.path || '') && item.format === 'csv'), datasets.filter(item => !/^downloads\/[a-z0-9._/-]+$/i.test(item.path || '')).map(item => item.path).join(', '));
add('no internal or private dataset paths', datasets.every(item => !/(source-snapshots|browsertrix-output|evidence-archive\/|downloads\/.*(?:report|test|wiring|build)|\.git|node_modules|scripts\/)/i.test(item.path || '')), datasets.map(item => item.path).join(', '));
add('all approved files exist and contain data', datasets.every(item => fs.existsSync(path.join(root, item.path)) && fs.statSync(path.join(root, item.path)).size > 50), datasets.filter(item => !fs.existsSync(path.join(root, item.path)) || fs.statSync(path.join(root, item.path)).size <= 50).map(item => item.path).join(', '));
add('all provenance routes are public JSON', datasets.every(item => /^data\/[a-z0-9._/-]+\.json$/i.test(item.provenancePath || '') && fs.existsSync(path.join(root, item.provenancePath))), datasets.filter(item => !fs.existsSync(path.join(root, item.provenancePath || ''))).map(item => item.provenancePath).join(', '));
add('every dataset states evidence boundary', datasets.every(item => String(item.boundary || '').length >= 120));
add('preset references resolve', presets.every(preset => (preset.datasetIds || []).every(id => ids.includes(id))));
add('preset SQL is read only', presets.every(preset => /^(SELECT|WITH)\b/i.test(String(preset.sql || '').trim()) && !/;/.test(preset.sql || '')));
add('preset SQL has no file readers or remote URLs', presets.every(preset => !/\b(read_csv|read_json|read_parquet|attach|copy|install|load|pragma)\b|https?:\/\//i.test(preset.sql || '')));
add('strict result cap', Number(registry?.limits?.maxRows) === 1000);
add('strict query timeout', Number(registry?.limits?.queryTimeoutMs) > 0 && Number(registry?.limits?.queryTimeoutMs) <= 15000);
add('pinned DuckDB-Wasm version', /^\d+\.\d+\.\d+$/.test(registry?.engines?.duckdbWasm || '') && runtime.includes(`@duckdb/duckdb-wasm@${registry.engines.duckdbWasm}`));
add('pinned Perspective version', /^\d+\.\d+\.\d+$/.test(registry?.engines?.perspective || '') && runtime.includes(`@finos/perspective@${registry.engines.perspective}`));
add('DuckDB package version exists', registry?.engines?.duckdbWasm !== '1.33.0');

add('public page generated', page.includes('PUBLIC DATA LABORATORY.') && page.includes('QUERY THE PUBLIC RECORDS.'));
add('page carries evidence boundary', page.includes('Evidence boundary:') && page.includes(registry?.boundary || '___missing___'));
add('query editor and controls rendered', page.includes('id="data-lab-query"') && page.includes('id="data-lab-run"') && page.includes('id="data-lab-limit"'));
add('accessible table and Perspective fallback rendered', page.includes('id="data-lab-table"') && page.includes('id="data-lab-viewer"'));
add('all datasets rendered with downloads', datasets.every(item => page.includes(`data-data-lab-dataset="${item.id}"`) && page.includes(`href="${item.path}"`)));
add('all presets rendered', presets.every(item => page.includes(`data-data-lab-preset="${item.id}"`)));
add('module runtime wired with cache version', page.includes('<script type="module" src="data-lab.js?v='));

add('runtime has no fatal top-level CDN import', !/^\s*import\s/m.test(runtime));
add('runtime has two DuckDB CDN providers', runtime.includes('cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@') && runtime.includes('unpkg.com/@duckdb/duckdb-wasm@'));
add('runtime limits to SELECT and WITH', runtime.includes('Only SELECT and WITH queries are allowed.') && runtime.includes('/^(SELECT|WITH)\\b/i'));
add('runtime blocks write statements', /ALTER\|ATTACH\|CALL\|COPY\|CREATE\|DELETE/.test(runtime) && runtime.includes('This is a read-only laboratory.'));
add('runtime blocks direct file readers', runtime.includes('Direct file readers are blocked.') && runtime.includes('read_csv_auto'));
add('runtime blocks arbitrary URLs', runtime.includes('Remote and local file URLs are blocked'));
add('runtime wraps hard row limit', runtime.includes('AS matrix_public_query LIMIT'));
add('runtime enforces startup and query timeouts', runtime.includes('ENGINE_STARTUP_TIMEOUT_MS') && runtime.includes('withTimeout') && runtime.includes('queryTimeoutMs'));
add('runtime verifies and buffers datasets', runtime.includes('response.arrayBuffer()') && runtime.includes('registerFileBuffer'));
add('runtime retains accessible fallback', runtime.includes('Perspective could not load; the accessible result table remains available.'));
add('runtime exposes startup failures', runtime.includes('Data laboratory unavailable:') && runtime.includes('Engine startup failed; no query was run.'));
add('runtime exports capped CSV', runtime.includes('rowsToCsv') && runtime.includes('matrix-data-lab-'));

const home = read(path.join(root, 'index.html'));
const research = read(path.join(root, 'research-tools.html'));
const sitemap = read(path.join(root, 'sitemap.xml'));
const llms = read(path.join(root, 'llms.txt'));
add('homepage route present', home.includes('public-data-lab-home') && home.includes('Open Public Data Lab'));
add('main navigation route present', home.includes('href="data-lab.html">Public Data Lab</a>'));
add('research tools route connected', research.includes('public-data-lab-research') && research.includes('data-lab.html'));
add('sitemap route present', sitemap.includes('/data-lab.html'));
add('llms route present', llms.includes('data-lab.html'));

const report = { ok: checks.every(check => check.ok), generatedAt: new Date().toISOString(), datasets: datasets.length, presets: presets.length, checks };
fs.mkdirSync(path.dirname(reportPath), { recursive:true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (!report.ok) {
  checks.filter(check => !check.ok).forEach(check => console.error(`FAILED: ${check.name}${check.detail ? ` — ${check.detail}` : ''}`));
  process.exit(1);
}
console.log(`Public Data Laboratory test passed: ${checks.length} checks, ${datasets.length} datasets and ${presets.length} presets.`);
